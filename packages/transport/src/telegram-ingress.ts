import { createServer, type IncomingMessage, type Server } from "node:http";
import { providerKey } from "./brands.js";
import type { InboundInteraction } from "./channel.js";
import type { MessagingGateway } from "./gateway.js";
import {
  LiveTelegramConfigError,
  readTelegramBotTokenFromEnv,
  readTelegramIngressModeFromEnv,
  requireTelegramBotToken,
  TelegramWebhookSecretError,
  verifyTelegramWebhookSecret,
  type TelegramIngressMode,
} from "./adapters/telegram-live.js";

export interface TelegramMessagingIngress {
  readonly url: string;
  readonly server: Server;
  lastInbound(): InboundInteraction | undefined;
  close(): Promise<void>;
}

export async function evaluateTelegramAdvertisement(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  try {
    requireTelegramBotToken(readTelegramBotTokenFromEnv());
    return { ok: true };
  } catch (error) {
    const reason =
      error instanceof LiveTelegramConfigError
        ? "telegram_bot_token_missing"
        : error instanceof Error
          ? error.message
          : "advertise_failed";
    return { ok: false, reason };
  }
}

export function createTelegramMessagingIngress(options: {
  readonly gateway: MessagingGateway;
  readonly host?: string;
  readonly port: number;
  readonly mode?: TelegramIngressMode;
  readonly fetch?: typeof fetch;
}): Promise<TelegramMessagingIngress> {
  const host = options.host ?? "127.0.0.1";
  const mode = options.mode ?? readTelegramIngressModeFromEnv();
  const http = options.fetch ?? fetch;
  let lastInbound: InboundInteraction | undefined;
  const pollAbort = new AbortController();

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
        const result = await evaluateTelegramAdvertisement();
        if (!result.ok) {
          writeJson(response, 503, {
            error: "telegram_not_advertised",
            reason: result.reason,
          });
          return;
        }
        writeJson(response, 204, {});
        return;
      }
      if (request.method === "POST" && path === "/inbound") {
        const advertised = await evaluateTelegramAdvertisement();
        if (!advertised.ok) {
          writeJson(response, 503, {
            error: "telegram_not_advertised",
            reason: advertised.reason,
          });
          return;
        }
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
        if (secret !== undefined && secret.length > 0) {
          const header = headerValue(request, "x-telegram-bot-api-secret-token");
          verifyTelegramWebhookSecret(
            { "x-telegram-bot-api-secret-token": header },
            secret,
          );
        }
        const raw = JSON.parse(await readBody(request)) as unknown;
        const inbound = await options.gateway.acceptProviderEvent(
          providerKey("telegram"),
          raw,
        );
        lastInbound = inbound;
        writeJson(response, 200, inbound);
        return;
      }
      writeJson(response, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof TelegramWebhookSecretError) {
        writeJson(response, 401, { error: "telegram_webhook_secret_rejected" });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, 400, { error: "ingress_error", reason: message });
    }
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.removeListener("error", reject);
      if (mode === "polling") {
        void pollUpdates({
          fetch: http,
          gateway: options.gateway,
          signal: pollAbort.signal,
        });
      }
      resolve({
        close() {
          pollAbort.abort();
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

async function pollUpdates(options: {
  readonly fetch: typeof fetch;
  readonly gateway: MessagingGateway;
  readonly signal: AbortSignal;
}): Promise<void> {
  const advertised = await evaluateTelegramAdvertisement();
  if (!advertised.ok) {
    return;
  }
  const token = requireTelegramBotToken(readTelegramBotTokenFromEnv());
  const apiUrl = (process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org").replace(
    /\/$/,
    "",
  );
  let offset = 0;
  while (!options.signal.aborted) {
    try {
      const response = await options.fetch(`${apiUrl}/bot${token}/getUpdates`, {
        body: JSON.stringify({
          offset,
          timeout: 25,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: options.signal,
      });
      const json = (await response.json()) as {
        ok?: unknown;
        result?: unknown;
      };
      if (json.ok !== true || !Array.isArray(json.result)) {
        await sleep(1000, options.signal);
        continue;
      }
      for (const update of json.result) {
        if (update !== null && typeof update === "object") {
          const updateId = (update as { update_id?: unknown }).update_id;
          if (typeof updateId === "number") {
            offset = updateId + 1;
          }
          await options.gateway.acceptProviderEvent(
            providerKey("telegram"),
            update,
          );
        }
      }
    } catch {
      if (options.signal.aborted) {
        return;
      }
      await sleep(1000, options.signal);
    }
  }
}

function headerValue(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const raw = request.headers[name];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
