import { createServer, type IncomingMessage, type Server } from "node:http";
import type { InboundInteraction } from "../../speaker/src/index.js";
import { providerKey } from "../../speaker/src/index.js";
import {
  companionSessionIsReady,
  type CompanionSession,
} from "./companion-session.js";
import type { MessagingGateway } from "./gateway.js";
import {
  LiveWhatsAppConfigError,
  parseWhatsAppDoorE164,
  WhatsAppEnvelopeError,
} from "./adapters/whatsapp-live.js";

export interface WhatsAppMessagingIngress {
  readonly url: string;
  readonly server: Server;
  lastInbound(): InboundInteraction | undefined;
  close(): Promise<void>;
}

export async function evaluateWhatsAppAdvertisement(
  session: CompanionSession,
): Promise<{ ok: true; doorE164: string } | { ok: false; reason: string }> {
  try {
    const doorE164 = parseWhatsAppDoorE164(process.env.ZOEN_WHATSAPP_DOOR_E164);
    const ready = await session.ready();
    if (!companionSessionIsReady(ready)) {
      return {
        ok: false,
        reason: "companion_not_ready",
      };
    }
    return { ok: true, doorE164 };
  } catch (error) {
    const reason =
      error instanceof LiveWhatsAppConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : "advertise_failed";
    return { ok: false, reason };
  }
}

export function createWhatsAppMessagingIngress(options: {
  readonly gateway: MessagingGateway;
  readonly session: CompanionSession;
  readonly host?: string;
  readonly port: number;
  /** When set, companion retries unless this returns (HTTP 2xx). */
  readonly processInbound?: (raw: unknown) => Promise<unknown>;
}): Promise<WhatsAppMessagingIngress> {
  const host = options.host ?? "127.0.0.1";
  let lastInbound: InboundInteraction | undefined;

  const server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(
    request: IncomingMessage,
    response: import("node:http").ServerResponse,
  ): Promise<void> {
    const url = request.url ?? "/";
    const path = url.split("?")[0] ?? "/";
    try {
      if (request.method === "GET" && path === "/advertise") {
        const result = await evaluateWhatsAppAdvertisement(options.session);
        if (!result.ok) {
          writeJson(response, 503, {
            error: "whatsapp_not_advertised",
            reason: result.reason,
          });
          return;
        }
        writeJson(response, 204, {});
        return;
      }
      if (request.method === "POST" && path === "/inbound") {
        const advertised = await evaluateWhatsAppAdvertisement(options.session);
        if (!advertised.ok) {
          writeJson(response, 503, {
            error: "whatsapp_not_advertised",
            reason: advertised.reason,
          });
          return;
        }
        const raw = JSON.parse(await readBody(request)) as unknown;
        if (options.processInbound !== undefined) {
          const result = await options.processInbound(raw);
          writeJson(response, 200, result);
          return;
        }
        const inbound = await options.gateway.acceptProviderEvent(
          providerKey("whatsapp"),
          raw,
        );
        lastInbound = inbound;
        writeJson(response, 200, inbound);
        return;
      }
      writeJson(response, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        error instanceof SyntaxError ||
        error instanceof WhatsAppEnvelopeError ||
        error instanceof LiveWhatsAppConfigError
          ? 400
          : 500;
      writeJson(response, status, { error: "ingress_error", reason: message });
    }
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.removeListener("error", reject);
      resolve({
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          });
        },
        lastInbound() {
          return lastInbound;
        },
        server,
        url: `http://${host}:${String(options.port)}`,
      });
    });
  });
}

function writeJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = status === 204 ? "" : `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
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
