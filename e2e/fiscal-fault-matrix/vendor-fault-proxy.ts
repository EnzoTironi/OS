import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { z } from "zod";

const modeSchema = z.enum([
  "cancellation_failure",
  "credential_failure",
  "correction_failure",
  "plug_accepted_pending",
  "plug_authorized",
  "plug_http_200_pending",
  "plug_rejected",
  "protheus_authorized",
  "protheus_manual_conflict",
  "protheus_pending",
  "schema_drift",
  "systax_error",
  "systax_outage",
  "systax_success",
  "systax_validation",
  "timeout_after_receipt",
]);
type ProxyMode = z.infer<typeof modeSchema>;
const timeoutAfterReceiptDelayMs = 6_000;

const plugDocumentSchema = z
  .array(
    z.object({
      idIntegracao: z.string().min(1),
      itens: z.array(z.unknown()).min(1),
    }),
  )
  .min(1);
const systaxRequestSchema = z.object({
  idTransacao: z.string().min(1),
  itens: z.array(z.unknown()).min(1),
});
const protheusRequestSchema = z.object({
  cExternalEventId: z.string().min(1).optional(),
  cExternalId: z.string().min(1).optional(),
});

type Operation = {
  readonly idempotencyKey: string;
  readonly provider: "plugnotas" | "protheus" | "systax";
  readonly providerOperationId: string;
};

const credential = requiredEnvironment(
  process.env.ZOEN_FISCAL_PROXY_CREDENTIAL,
  "ZOEN_FISCAL_PROXY_CREDENTIAL",
);
const port = Number(
  requiredEnvironment(
    process.env.ZOEN_E2E_PROXY_PORT,
    "ZOEN_E2E_PROXY_PORT",
  ),
);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("ZOEN_E2E_PROXY_PORT must be a valid TCP port");
}

let mode: ProxyMode = "systax_success";
const operations = new Map<string, Operation>();
const dispatchCounts = new Map<string, number>();
const statusCounts = new Map<string, number>();

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error: unknown) {
    process.stderr.write(
      `${JSON.stringify({
        errorType: error instanceof Error ? error.name : "UnknownError",
        event: "fiscal_fault_proxy_request_failed",
        method: request.method,
        path: request.url,
      })}\n`,
    );
    writeJson(response, 500, { error: "fault proxy request failed" });
  }
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});
process.stdout.write(`${JSON.stringify({ event: "fiscal_fault_proxy_ready" })}\n`);
await new Promise<void>((resolve) => {
  const close = () => server.close(() => resolve());
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
});

async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://fault-proxy.invalid");
  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(204).end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/control") {
    const command = z.object({ mode: modeSchema }).parse(await jsonBody(request));
    mode = command.mode;
    writeJson(response, 200, { mode });
    return;
  }
  if (request.method === "GET" && url.pathname === "/metrics") {
    writeJson(response, 200, {
      dispatchCounts: Object.fromEntries(dispatchCounts),
      operations: [...operations.values()],
      statusCounts: Object.fromEntries(statusCounts),
    });
    return;
  }
  if (!authenticated(request, url.pathname)) {
    writeJson(response, 401, { error: "provider credential rejected" });
    return;
  }
  if (mode === "credential_failure") {
    writeJson(response, 401, { error: "provider credential rejected" });
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/tax-determinations") {
    await systaxDispatch(request, response);
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname.startsWith("/v1/tax-determinations/by-external-id/")
  ) {
    systaxStatus(url, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/nfe") {
    await plugDispatch(request, response);
    return;
  }
  if (request.method === "POST" && /\/nfe\/[^/]+\/cancelar$/u.test(url.pathname)) {
    await plugEvent(request, response, "cancel");
    return;
  }
  if (request.method === "POST" && /\/nfe\/[^/]+\/cce$/u.test(url.pathname)) {
    await plugEvent(request, response, "correct");
    return;
  }
  if (request.method === "GET" && /\/nfe\/.+\/resumo$/u.test(url.pathname)) {
    plugStatus(url, response);
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/rest/zoen/fiscal/v1/documents"
  ) {
    await protheusDispatch(request, response);
    return;
  }
  if (
    request.method === "POST" &&
    /\/rest\/zoen\/fiscal\/v1\/documents\/[^/]+\/(?:cancel|correct)$/u.test(
      url.pathname,
    )
  ) {
    await protheusDispatch(request, response);
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname.startsWith(
      "/rest/zoen/fiscal/v1/documents/by-external-id/",
    )
  ) {
    protheusStatus(url, response);
    return;
  }
  writeJson(response, 404, { error: "route not found" });
}

async function systaxDispatch(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = systaxRequestSchema.parse(await jsonBody(request));
  const operation = remember("systax", body.idTransacao);
  if (mode === "systax_outage") {
    writeJson(response, 503, { error: "tax engine unavailable" });
    return;
  }
  if (mode === "schema_drift") {
    writeJson(response, 200, { changed: true });
    return;
  }
  const status =
    mode === "systax_validation"
      ? "INVALIDO"
      : mode === "systax_error"
        ? "ERRO"
        : "CONCLUIDO";
  writeJson(response, 200, {
    idCalculo: operation.providerOperationId,
    situacao: status,
    tributos: {
      federal: "1.10",
      municipal: "0.00",
      estadual: "2.20",
    },
    versaoRegra: "contract-v1",
  });
}

function systaxStatus(url: URL, response: ServerResponse): void {
  const key = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  const operation = operations.get(key);
  if (operation === undefined) {
    writeJson(response, 404, { error: "operation not found" });
    return;
  }
  increment(statusCounts, key);
  writeJson(response, 200, {
    idCalculo: operation.providerOperationId,
    situacao: mode === "systax_validation" ? "INVALIDO" : "CONCLUIDO",
  });
}

async function plugDispatch(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = plugDocumentSchema.parse(await jsonBody(request));
  const document = body[0];
  if (document === undefined) {
    throw new Error("PlugNotas request has no document");
  }
  const operation = remember("plugnotas", document.idIntegracao);
  if (mode === "schema_drift") {
    writeJson(response, 200, { changed: true });
    return;
  }
  if (mode === "timeout_after_receipt") {
    await delay(timeoutAfterReceiptDelayMs);
  }
  const status =
    mode === "plug_authorized"
      ? "CONCLUIDO"
      : mode === "plug_rejected"
        ? "REJEITADO"
        : "PROCESSANDO";
  writeJson(
    response,
    mode === "plug_accepted_pending" ? 202 : 200,
    {
      documents: [
        {
          id: operation.providerOperationId,
          idIntegracao: document.idIntegracao,
          status,
        },
      ],
      message: "fiscal document received",
      protocol: `protocol.${operation.providerOperationId}`,
    },
  );
}

async function plugEvent(
  request: IncomingMessage,
  response: ServerResponse,
  event: "cancel" | "correct",
): Promise<void> {
  const body = await jsonBody(request);
  const parsed =
    event === "cancel"
      ? z.object({ justificativa: z.string().min(1) }).parse(body)
      : z.object({ correcao: z.string().min(1) }).parse(body);
  const value =
    "justificativa" in parsed ? parsed.justificativa : parsed.correcao;
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || key === "" || value === "") {
    throw new Error("fiscal event has no idempotency key");
  }
  const operation = remember("plugnotas", key);
  if (event === "cancel" && mode === "cancellation_failure") {
    writeJson(response, 503, { error: "cancellation unavailable" });
    return;
  }
  writeJson(response, 200, {
    id: operation.providerOperationId,
    status:
      event === "correct" && mode === "correction_failure"
        ? "REJEITADO"
        : "PROCESSANDO",
  });
}

function plugStatus(url: URL, response: ServerResponse): void {
  const segments = url.pathname.split("/").filter((entry) => entry !== "");
  const possibleKey =
    segments.length >= 4
      ? decodeURIComponent(segments[2] ?? "")
      : findPlugKey(decodeURIComponent(segments[1] ?? ""));
  const operation =
    possibleKey === undefined ? undefined : operations.get(possibleKey);
  if (operation === undefined) {
    writeJson(response, 404, { error: "operation not found" });
    return;
  }
  increment(statusCounts, operation.idempotencyKey);
  const status =
    mode === "plug_authorized"
      ? "CONCLUIDO"
      : mode === "plug_rejected" || mode === "protheus_manual_conflict"
        ? "REJEITADO"
        : "PROCESSANDO";
  writeJson(response, 200, [
    {
      chave: `key.${operation.providerOperationId}`,
      id: operation.providerOperationId,
      protocolo: `protocol.${operation.providerOperationId}`,
      status,
      xml: `https://artifact.invalid/${operation.providerOperationId}.xml`,
    },
  ]);
}

async function protheusDispatch(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = protheusRequestSchema.parse(await jsonBody(request));
  const key = body.cExternalId ?? body.cExternalEventId;
  if (key === undefined) {
    throw new Error("Protheus request has no external identity");
  }
  const operation = remember("protheus", key);
  if (mode === "schema_drift") {
    writeJson(response, 200, { changed: true });
    return;
  }
  const status =
    mode === "protheus_authorized"
      ? "AUTHORIZED"
      : mode === "protheus_manual_conflict"
        ? "REJECTED"
        : "PENDING";
  writeJson(response, 200, {
    cAccessKey: `key.${operation.providerOperationId}`,
    cAuthorityProtocol: `protocol.${operation.providerOperationId}`,
    cOperationId: operation.providerOperationId,
    cStatus: status,
  });
}

function protheusStatus(url: URL, response: ServerResponse): void {
  const key = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  const operation = operations.get(key);
  if (operation === undefined) {
    writeJson(response, 404, { error: "operation not found" });
    return;
  }
  increment(statusCounts, key);
  const status =
    mode === "protheus_authorized"
      ? "AUTHORIZED"
      : mode === "protheus_manual_conflict"
        ? "REJECTED"
        : "PENDING";
  writeJson(response, 200, {
    cAccessKey: `key.${operation.providerOperationId}`,
    cAuthorityProtocol: `protocol.${operation.providerOperationId}`,
    cOperationId: operation.providerOperationId,
    cStatus: status,
  });
}

function remember(
  provider: Operation["provider"],
  idempotencyKey: string,
): Operation {
  increment(dispatchCounts, idempotencyKey);
  const existing = operations.get(idempotencyKey);
  if (existing !== undefined) {
    return existing;
  }
  const operation = {
    idempotencyKey,
    provider,
    providerOperationId: `${provider}.${sha256(idempotencyKey).slice(0, 20)}`,
  } satisfies Operation;
  operations.set(idempotencyKey, operation);
  return operation;
}

function findPlugKey(providerOperationId: string): string | undefined {
  for (const operation of operations.values()) {
    if (
      operation.provider === "plugnotas" &&
      operation.providerOperationId === providerOperationId
    ) {
      return operation.idempotencyKey;
    }
  }
  return undefined;
}

function authenticated(request: IncomingMessage, pathname: string): boolean {
  const provided =
    pathname.startsWith("/nfe") || pathname.startsWith("/nf")
      ? request.headers["x-api-key"]
      : request.headers.authorization?.replace(/^Bearer /u, "");
  if (typeof provided !== "string") {
    return false;
  }
  const actual = Buffer.from(provided);
  const expected = Buffer.from(credential);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk),
    );
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "content-length": Buffer.byteLength(encoded),
    "content-type": "application/json",
  });
  response.end(encoded);
}

function requiredEnvironment(
  value: string | undefined,
  name: string,
): string {
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
