import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliveryIntentId,
  interactionId,
  presentationIntentRef,
  providerKey,
  providerUserRef,
} from "../../../interaction/src/index.js";
import {
  presentationSchema,
  type PresentationIntent,
} from "../../../surface/src/presentation-intent.js";
import { createMessagingGateway } from "../gateway.js";
import {
  assertLiveTelegramAdvertisement,
  createLiveTelegramProvider,
  LiveTelegramConfigError,
  parseTelegramBotUpdate,
  TelegramEnvelopeError,
  TelegramWebhookSecretError,
  verifyTelegramWebhookSecret,
} from "./telegram-live.js";

const TEXT_UPDATE = {
  message: {
    chat: { id: 9900001, type: "private" },
    date: 1_704_000_000,
    from: { first_name: "Ada", id: 42, is_bot: false },
    message_id: 1001,
    text: "oi",
  },
  update_id: 777,
};

function jsonOk(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    headers: { "content-type": "application/json" },
  });
}

test("parseTelegramBotUpdate uses message_id not update_id", () => {
  const message = parseTelegramBotUpdate(TEXT_UPDATE);
  assert.equal(message.id, "1001");
  assert.equal(message.from.id, "42");
  assert.equal(message.thread.id, "9900001");
  assert.equal(message.thread.kind, "chat");
  assert.equal(message.text, "oi");
});

test("parseTelegramBotUpdate maps callback_query data", () => {
  const message = parseTelegramBotUpdate({
    callback_query: {
      data: "approve.stock",
      from: { id: 42 },
      id: "cb1",
      message: {
        chat: { id: 9900001 },
        message_id: 88,
      },
    },
    update_id: 9,
  });
  assert.equal(message.callbackData, "approve.stock");
  assert.equal(message.id, "88");
  assert.equal(message.thread.id, "9900001");
});

test("parseTelegramBotUpdate rejects non-objects", () => {
  assert.throws(
    () => parseTelegramBotUpdate("nope"),
    (error: unknown) => error instanceof TelegramEnvelopeError,
  );
});

test("advertise live without TELEGRAM_BOT_TOKEN fails closed", () => {
  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSuite = process.env.ZOEN_TELEGRAM_BOT_TOKEN;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM = "1";
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    assert.throws(
      () => assertLiveTelegramAdvertisement(),
      (error: unknown) => error instanceof LiveTelegramConfigError,
    );
  } finally {
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM = previousAdvertise;
    }
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

test("verifyTelegramWebhookSecret is timing-safe", () => {
  verifyTelegramWebhookSecret(
    { "x-telegram-bot-api-secret-token": "secret-token" },
    "secret-token",
  );
  assert.throws(
    () =>
      verifyTelegramWebhookSecret(
        { "x-telegram-bot-api-secret-token": "other-token" },
        "secret-token",
      ),
    (error: unknown) => error instanceof TelegramWebhookSecretError,
  );
});

test("live send uses Bot API chat id and converges on clientDeliveryId", async () => {
  const calls: string[] = [];
  const provider = createLiveTelegramProvider({
    botToken: "123:test",
    fetch: async (input) => {
      calls.push(String(input));
      return jsonOk({
        chat: { id: 9900001, type: "private" },
        date: 1,
        message_id: 44,
        text: "pong",
      });
    },
  });
  const first = await provider.send({
    clientDeliveryId: "spd_tg_1",
    text: "pong",
    thread: { id: "9900001", kind: "chat" },
  });
  const second = await provider.send({
    clientDeliveryId: "spd_tg_1",
    text: "pong",
    thread: { id: "9900001", kind: "chat" },
  });
  assert.equal(first.messageId, "44");
  assert.equal(second.messageId, "44");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.includes("/bot123:test/sendMessage"), true);
});

test("live send posts inline keyboard for buttons", async () => {
  let body = "";
  const provider = createLiveTelegramProvider({
    botToken: "123:test",
    fetch: async (input, init) => {
      body = String(init?.body ?? "");
      return jsonOk({ message_id: 2, date: 1, chat: { id: 7, type: "private" } });
    },
  });
  await provider.send({
    buttons: [{ callbackData: "yes", label: "Yes" }],
    clientDeliveryId: "spd_btn",
    text: "confirm",
    thread: { id: "7", kind: "chat" },
  });
  const payload = JSON.parse(body) as {
    reply_markup?: { inline_keyboard?: unknown };
  };
  assert.deepEqual(payload.reply_markup, {
    inline_keyboard: [[{ callback_data: "yes", text: "Yes" }]],
  });
});

test("gateway acceptProviderEvent stays on message id for Telegram updates", async () => {
  const provider = createLiveTelegramProvider({
    botToken: "123:test",
    fetch: async () => jsonOk({}),
  });
  const intent: PresentationIntent = {
    blocks: [{ body: "hi", kind: "text" }],
    createdAt: "2026-08-24T12:00:00.000Z",
    fullBodyText: "hi",
    ref: presentationIntentRef("pres.telegram.test"),
    schema: presentationSchema,
    surfaceDigest: "digest",
    surfaceId: "surface_tg",
  };
  const gateway = createMessagingGateway({
    providers: { telegram: provider },
    resolvePresentation: async () => ({
      disclosedBody: "hi",
      disclosure: { kind: "deliver_full" },
      includesConfidentialBody: true,
      intent,
    }),
  });
  const inbound = await gateway.acceptProviderEvent(
    providerKey("telegram"),
    TEXT_UPDATE,
  );
  assert.equal(inbound.idempotencyKey, "telegram:message:1001");
  assert.equal(inbound.audienceObservation.kind, "dm");
  assert.equal(String(inbound.channel.providerUser), "42");
  const observation = await gateway.deliver({
    controlRefs: [],
    id: deliveryIntentId("di_tg"),
    presentation: presentationIntentRef("pres.telegram.test"),
    provider: providerKey("telegram"),
    recordId: interactionId("ir_tg"),
    stableProviderDeliveryId: "spd_deliver_tg",
    target: { kind: "dm", providerUser: providerUserRef("42") },
  });
  assert.equal(observation.outcome.kind, "accepted");
});
