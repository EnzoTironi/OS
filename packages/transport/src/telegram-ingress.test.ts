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

const TOKEN_ENV_KEYS = ["TELEGRAM_BOT_TOKEN", "ZOEN_TELEGRAM_BOT_TOKEN"] as const;

function snapshotEnv(
  keys: readonly string[] = TOKEN_ENV_KEYS,
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

async function startIngress(options: { webhookSecret?: string } = {}) {
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
    ...("webhookSecret" in options ? { webhookSecret: options.webhookSecret } : {}),
  });
}

function inboundUrl(ingress: Awaited<ReturnType<typeof startIngress>>): string {
  const address = ingress.server.address();
  assert.ok(address !== null && typeof address === "object");
  return `http://127.0.0.1:${String(address.port)}`;
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
    webhookSecret: "expected-secret",
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

test("telegram webhook advertise and inbound fail closed without webhook secret", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  try {
    for (const webhookSecret of [undefined, ""]) {
      const ingress = await startIngress({ webhookSecret });
      try {
        const advertise = await fetch(`${inboundUrl(ingress)}/advertise`);
        assert.equal(advertise.status, 503);
        const advertised = (await advertise.json()) as { reason?: unknown };
        assert.equal(advertised.reason, "secret_missing");
        const response = await fetch(`${inboundUrl(ingress)}/inbound`, {
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
      } finally {
        await ingress.close();
      }
    }
  } finally {
    restoreEnv(previous);
  }
});

test("telegram ingress inbound rejects a forged webhook secret", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  const ingress = await startIngress({ webhookSecret: "expected-secret" });
  try {
    const response = await fetch(`${inboundUrl(ingress)}/inbound`, {
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
  const ingress = await startIngress({ webhookSecret: "expected-secret" });
  try {
    const advertise = await fetch(`${inboundUrl(ingress)}/advertise`);
    assert.equal(advertise.status, 204);
    const response = await fetch(`${inboundUrl(ingress)}/inbound`, {
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

test("telegram ingress captures env webhook secret at create", async () => {
  const previous = snapshotEnv([
    ...TOKEN_ENV_KEYS,
    "TELEGRAM_WEBHOOK_SECRET_TOKEN",
    "ZOEN_TELEGRAM_WEBHOOK_SECRET",
  ]);
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  delete process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
  process.env.ZOEN_TELEGRAM_WEBHOOK_SECRET = "zoen-secret";
  const ingress = await startIngress();
  delete process.env.ZOEN_TELEGRAM_WEBHOOK_SECRET;
  try {
    const response = await fetch(`${inboundUrl(ingress)}/inbound`, {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "zoen-secret",
      },
      method: "POST",
    });
    assert.equal(response.status, 200);
    assert.equal(String(ingress.lastInbound()?.channel.message), "1001");
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});

test("telegram polling advertise stays token-only", async () => {
  const previous = snapshotEnv();
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  const ingress = await createTelegramMessagingIngress({
    gateway: createMessagingGateway({
      providers: {
        telegram: createLiveTelegramProvider({
          botToken: "123:test",
          fetch: async () =>
            new Response(JSON.stringify({ ok: true, result: [] }), {
              headers: { "content-type": "application/json" },
            }),
        }),
      },
      resolvePresentation: async () => {
        throw new Error("deliver unused");
      },
    }),
    mode: "polling",
    port: 0,
    webhookSecret: undefined,
  });
  try {
    const advertise = await fetch(`${inboundUrl(ingress)}/advertise`);
    assert.equal(advertise.status, 204);
    const inbound = await fetch(`${inboundUrl(ingress)}/inbound`, {
      body: JSON.stringify(INBOUND_UPDATE),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(inbound.status, 503);
  } finally {
    await ingress.close();
    restoreEnv(previous);
  }
});
