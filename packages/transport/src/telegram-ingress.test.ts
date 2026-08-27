import assert from "node:assert/strict";
import { test } from "node:test";
import { providerKey } from "../../speaker/src/index.js";
import { createMessagingGateway } from "./gateway.js";
import {
  createLiveTelegramProvider,
  parseTelegramBotUpdate,
} from "./adapters/telegram-live.js";
import {
  createTelegramMessagingIngress,
  evaluateTelegramAdvertisement,
} from "./telegram-ingress.js";

const INBOUND_UPDATE = {
  message: {
    chat: { id: 9900001, type: "private" },
    from: { id: 42 },
    message_id: 1001,
    text: "oi",
  },
  update_id: 777,
};

const SECRET_ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "ZOEN_TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET_TOKEN",
  "ZOEN_TELEGRAM_WEBHOOK_SECRET",
] as const;

function snapshotEnv(
  keys: readonly string[] = SECRET_ENV_KEYS,
): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function startIngress() {
  const provider = createLiveTelegramProvider({
    botToken: "123:test",
    fetch: async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        headers: { "content-type": "application/json" },
      }),
  });
  return createTelegramMessagingIngress({
    gateway: createMessagingGateway({
      providers: { telegram: provider },
      resolvePresentation: async () => {
        throw new Error("deliver unused");
      },
    }),
    mode: "webhook",
    port: 0,
  });
}

function inboundUrl(ingress: Awaited<ReturnType<typeof startIngress>>): string {
  const address = ingress.server.address();
  assert.ok(address !== null && typeof address === "object");
  return `http://127.0.0.1:${String(address.port)}/inbound`;
}

test("evaluateTelegramAdvertisement fails closed without token", async () => {
  const previous = snapshotEnv();
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    const result = await evaluateTelegramAdvertisement();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "telegram_bot_token_missing");
    }
  } finally {
    restoreEnv(previous);
  }
});

test("telegram ingress advertise and inbound fail closed without token", async () => {
  const previous = snapshotEnv();
  const ingress = await createTelegramMessagingIngress({
    gateway: createMessagingGateway({
      providers: {
        telegram: {
          parseInbound: parseTelegramBotUpdate,
          probes: createLiveTelegramProvider({
            botToken: "123:test",
            fetch: async () =>
              new Response(JSON.stringify({ ok: true, result: {} }), {
                headers: { "content-type": "application/json" },
              }),
          }).probes,
          providerId: "telegram",
          send: async () => ({ messageId: "x", status: "accepted" }),
          threadKind: "chat",
        },
      },
      resolvePresentation: async () => {
        throw new Error("deliver unused");
      },
    }),
    mode: "webhook",
    port: 0,
  });
  const address = ingress.server.address();
  assert.ok(address !== null && typeof address === "object");
  const base = `http://127.0.0.1:${String(address.port)}`;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    const advertise = await fetch(`${base}/advertise`);
    assert.equal(advertise.status, 503);
    const inbound = await fetch(`${base}/inbound`, {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(inbound.status, 503);
    const body = (await inbound.json()) as { reason?: unknown };
    assert.equal(body.reason, "telegram_bot_token_missing");
    assert.equal(ingress.lastInbound(), undefined);
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});

test("telegram ingress inbound fails closed without webhook secret", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  const ingress = await startIngress();
  try {
    for (const secretEnv of [undefined, ""]) {
      if (secretEnv === undefined) {
        delete process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
      } else {
        process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN = secretEnv;
      }
      delete process.env.ZOEN_TELEGRAM_WEBHOOK_SECRET;
      const response = await fetch(inboundUrl(ingress), {
        body: JSON.stringify(INBOUND_UPDATE),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      assert.equal(response.status, 503);
      const body = (await response.json()) as {
        error?: unknown;
        reason?: unknown;
      };
      assert.equal(body.error, "telegram_ingress_denied");
      assert.equal(body.reason, "secret_missing");
      assert.equal(ingress.lastInbound(), undefined);
    }
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});

test("telegram ingress inbound rejects a forged webhook secret", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN = "expected-secret";
  delete process.env.ZOEN_TELEGRAM_WEBHOOK_SECRET;
  const ingress = await startIngress();
  try {
    const response = await fetch(inboundUrl(ingress), {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "forged-secret",
      },
      method: "POST",
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as {
      error?: unknown;
      reason?: unknown;
    };
    assert.equal(body.error, "telegram_ingress_denied");
    assert.equal(body.reason, "secret_rejected");
    assert.equal(ingress.lastInbound(), undefined);
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});

test("telegram ingress inbound accepts a signed Bot API update", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN = "expected-secret";
  delete process.env.ZOEN_TELEGRAM_WEBHOOK_SECRET;
  const ingress = await startIngress();
  try {
    const response = await fetch(inboundUrl(ingress), {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "expected-secret",
      },
      method: "POST",
    });
    assert.equal(response.status, 200);
    const inbound = ingress.lastInbound();
    assert.equal(inbound?.channel.provider, providerKey("telegram"));
    assert.equal(String(inbound?.channel.message), "1001");
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});

test("telegram ingress inbound honors ZOEN_TELEGRAM_WEBHOOK_SECRET", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  delete process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
  process.env.ZOEN_TELEGRAM_WEBHOOK_SECRET = "zoen-secret";
  const ingress = await startIngress();
  try {
    const rejected = await fetch(inboundUrl(ingress), {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(rejected.status, 401);
    const accepted = await fetch(inboundUrl(ingress), {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "zoen-secret",
      },
      method: "POST",
    });
    assert.equal(accepted.status, 200);
    assert.equal(String(ingress.lastInbound()?.channel.message), "1001");
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});
