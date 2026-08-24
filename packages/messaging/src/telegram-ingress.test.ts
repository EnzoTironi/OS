import assert from "node:assert/strict";
import { test } from "node:test";
import { providerKey } from "../../interaction/src/index.js";
import { createMessagingGateway } from "./gateway.js";
import {
  createLiveTelegramProvider,
  parseTelegramBotUpdate,
} from "./adapters/telegram-live.js";
import {
  createTelegramMessagingIngress,
  evaluateTelegramAdvertisement,
} from "./telegram-ingress.js";

test("evaluateTelegramAdvertisement fails closed without token", async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSuite = process.env.ZOEN_TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    const result = await evaluateTelegramAdvertisement();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "telegram_bot_token_missing");
    }
  } finally {
    if (previousToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousToken;
    }
    if (previousSuite === undefined) {
      delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    } else {
      process.env.ZOEN_TELEGRAM_BOT_TOKEN = previousSuite;
    }
  }
});

test("telegram ingress advertise and inbound fail closed without token", async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSuite = process.env.ZOEN_TELEGRAM_BOT_TOKEN;
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
      body: JSON.stringify({
        message: {
          chat: { id: 1 },
          from: { id: 2 },
          message_id: 3,
          text: "oi",
        },
        update_id: 1,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(inbound.status, 503);
  } finally {
    await ingress.close();
    if (previousToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousToken;
    }
    if (previousSuite === undefined) {
      delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    } else {
      process.env.ZOEN_TELEGRAM_BOT_TOKEN = previousSuite;
    }
  }
});

test("telegram ingress inbound accepts Bot API update when token is set", async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  const provider = createLiveTelegramProvider({
    botToken: "123:test",
    fetch: async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        headers: { "content-type": "application/json" },
      }),
  });
  const ingress = await createTelegramMessagingIngress({
    gateway: createMessagingGateway({
      providers: { telegram: provider },
      resolvePresentation: async () => {
        throw new Error("deliver unused");
      },
    }),
    mode: "webhook",
    port: 0,
  });
  const address = ingress.server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/inbound`,
      {
        body: JSON.stringify({
          message: {
            chat: { id: 9900001, type: "private" },
            from: { id: 42 },
            message_id: 1001,
            text: "oi",
          },
          update_id: 777,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    assert.equal(response.status, 200);
    const inbound = ingress.lastInbound();
    assert.equal(inbound?.channel.provider, providerKey("telegram"));
    assert.equal(String(inbound?.channel.message), "1001");
  } finally {
    await ingress.close();
    if (previousToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousToken;
    }
  }
});
