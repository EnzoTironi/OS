import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Client as PostgresClient } from "pg";
import {
  generateWhsecSecret,
  signStandardWebhook,
} from "../../packages/transport/src/index.js";

export const ZOEND_INGRESS_REPLAY_NAMESPACE = "zoend:";

export interface MockWhatsAppGateway {
  readonly inboundIds: string[];
  readonly url: string;
  close(): Promise<void>;
}

export interface WhatsAppInboundResponse {
  readonly body: Record<string, unknown>;
  readonly status: number;
}

export async function startMockWhatsAppGateway(): Promise<MockWhatsAppGateway> {
  const inboundIds: string[] = [];
  const server = createServer((request, response) => {
    void handleGateway(request, response, inboundIds);
  });
  await listenLoopback(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("whatsapp mock gateway did not bind a TCP port");
  }
  return {
    inboundIds,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

export async function postWhatsAppInbound(
  baseUrl: string,
  headers: Record<string, string>,
  rawBody: string,
): Promise<WhatsAppInboundResponse> {
  const response = await fetch(`${baseUrl}/channels/whatsapp/inbound`, {
    body: rawBody,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

export async function assertZoendReplayRow(
  databaseUrl: string,
  webhookId: string,
): Promise<void> {
  const client = new PostgresClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    const namespaced = await client.query<{ webhook_id: string }>(
      "SELECT webhook_id FROM ingress_replay WHERE webhook_id = $1",
      [`${ZOEND_INGRESS_REPLAY_NAMESPACE}${webhookId}`],
    );
    assert.equal(
      namespaced.rows[0]?.webhook_id,
      `${ZOEND_INGRESS_REPLAY_NAMESPACE}${webhookId}`,
    );
    const raw = await client.query<{ webhook_id: string }>(
      "SELECT webhook_id FROM ingress_replay WHERE webhook_id = $1",
      [webhookId],
    );
    assert.equal(raw.rows.length, 0);
  } finally {
    await client.end();
  }
}

export function signedWhatsAppInbound(input: {
  readonly rawBody: string;
  readonly secret: string;
  readonly timestampSeconds: number;
  readonly webhookId: string;
}): Record<string, string> {
  const headers = signStandardWebhook(input);
  return {
    "webhook-id": headers["webhook-id"],
    "webhook-signature": headers["webhook-signature"],
    "webhook-timestamp": headers["webhook-timestamp"],
  };
}

export function freshWhatsAppIngressSecret(): string {
  return generateWhsecSecret();
}

async function handleGateway(
  request: IncomingMessage,
  response: ServerResponse,
  inboundIds: string[],
): Promise<void> {
  const path = (request.url ?? "/").split("?")[0] ?? "/";
  await readBody(request);
  if (request.method === "GET" && path === "/advertise") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "POST" && path === "/inbound") {
    const webhookId = request.headers["webhook-id"];
    if (typeof webhookId === "string" && webhookId.length > 0) {
      inboundIds.push(webhookId);
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
}

function listenLoopback(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}
