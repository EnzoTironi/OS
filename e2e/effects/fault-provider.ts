import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { e2ePort } from "../host-env.js";

const modeSchema = z.enum([
  "accepted_pending",
  "confirmed",
  "confirmed_no_effect",
  "hold_confirmed",
  "parse_error",
  "schema_error",
  "timeout_after_delivery",
  "unavailable",
]);
const controlSchema = z.object({ mode: modeSchema }).strict();
const operationSchema = z
  .object({
    effectRequestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    payloadBase64: z.string(),
    requestDigest: z.string().regex(/^[0-9a-f]{64}$/),
    tenantId: z.string().min(1),
  })
  .strict();

type FaultMode = z.infer<typeof modeSchema>;

interface StoredOperation {
  idempotencyKey: string;
  mode: FaultMode;
  observedAtMicros: string;
  providerOperationId: string;
  requests: number;
}

const listenAddress = "127.0.0.1";
const listenPort = e2ePort("ZOEN_E2E_PROVIDER_PORT", 58_114);
const operationsById = new Map<string, StoredOperation>();
const operationsByKey = new Map<string, StoredOperation>();
let mode: FaultMode = "confirmed";

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: message });
  });
});

async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${listenAddress}`);
  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(204).end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/control") {
    mode = controlSchema.parse(await readJson(request)).mode;
    sendJson(response, 200, { mode });
    return;
  }
  if (request.method === "DELETE" && url.pathname === "/operations") {
    operationsById.clear();
    operationsByKey.clear();
    response.writeHead(204).end();
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/operations/")) {
    if (request.headers.authorization !== "Bearer provider-secret") {
      sendJson(response, 401, { error: "credential rejected" });
      return;
    }
    const path = url.pathname.slice("/v1/operations/".length);
    const operation =
      path.startsWith("by-idempotency/")
        ? operationsByKey.get(
            decodeURIComponent(path.slice("by-idempotency/".length)),
          )
        : operationsById.get(decodeURIComponent(path));
    if (operation === undefined) {
      sendJson(response, 404, { error: "operation not found" });
      return;
    }
    const outcome =
      operation.mode === "confirmed_no_effect" ? "no_effect" : "confirmed";
    sendJson(response, 200, {
      evidenceDigest: sha256(
        `${operation.providerOperationId}:${outcome}:${operation.observedAtMicros}`,
      ),
      idempotencyKey: operation.idempotencyKey,
      observedAtMicros: operation.observedAtMicros,
      outcome,
      providerOperationId: operation.providerOperationId,
      requests: operation.requests,
      sourceRef: `urn:provider-operation:${operation.providerOperationId}`,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/operations") {
    if (request.headers.authorization !== "Bearer provider-secret") {
      sendJson(response, 401, { error: "credential rejected" });
      return;
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      sendJson(response, 400, { error: "idempotency key required" });
      return;
    }
    if (mode === "unavailable") {
      sendJson(response, 503, { error: "provider unavailable" });
      return;
    }
    const input = operationSchema.parse(await readJson(request));
    if (input.idempotencyKey !== idempotencyKey) {
      sendJson(response, 400, { error: "idempotency key mismatch" });
      return;
    }
    let operation = operationsByKey.get(idempotencyKey);
    if (operation === undefined) {
      operation = {
        idempotencyKey,
        mode,
        observedAtMicros: nowMicros(),
        providerOperationId: `provider.${sha256(idempotencyKey).slice(0, 24)}`,
        requests: 0,
      };
      operationsByKey.set(idempotencyKey, operation);
      operationsById.set(operation.providerOperationId, operation);
    }
    operation.requests += 1;
    await respondForMode(response, operation);
    return;
  }
  sendJson(response, 404, { error: "route not found" });
}

async function respondForMode(
  response: ServerResponse,
  operation: StoredOperation,
): Promise<void> {
  switch (operation.mode) {
    case "accepted_pending":
      sendJson(response, 202, {
        outcome: "accepted_pending",
        providerOperationId: operation.providerOperationId,
      });
      return;
    case "confirmed":
      sendJson(response, 200, {
        outcome: "confirmed",
        providerOperationId: operation.providerOperationId,
      });
      return;
    case "confirmed_no_effect":
      sendJson(response, 200, {
        outcome: "confirmed_no_effect",
        providerOperationId: operation.providerOperationId,
      });
      return;
    case "hold_confirmed":
      if (operation.requests === 1) {
        await delay(2_000);
      }
      sendJson(response, 200, {
        outcome: "confirmed",
        providerOperationId: operation.providerOperationId,
      });
      return;
    case "parse_error":
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{not-json");
      return;
    case "schema_error":
      sendJson(response, 200, { outcome: "confirmed" });
      return;
    case "timeout_after_delivery":
      await delay(1_000);
      sendJson(response, 200, {
        outcome: "confirmed",
        providerOperationId: operation.providerOperationId,
      });
      return;
    case "unavailable":
      sendJson(response, 503, { error: "provider unavailable" });
      return;
    default: {
      const exhaustive: never = operation.mode;
      return exhaustive;
    }
  }
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error: unknown) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nowMicros(): string {
  return (BigInt(Date.now()) * 1_000n).toString();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

server.listen(listenPort, listenAddress);

process.once("SIGINT", () => {
  server.close(() => process.exit(0));
});
