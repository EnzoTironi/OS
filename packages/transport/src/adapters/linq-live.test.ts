import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateWhsecSecret,
  signStandardWebhook,
  verifyStandardWebhook,
  WebhookVerificationError,
} from "../standard-webhooks.js";
import {
  assertLiveLinqAdvertisement,
  createLiveLinqProvider,
  LINQ_LIVE_DEFAULT_ALLOWLIST,
  LiveLinqAllowlistError,
  LiveLinqConfigError,
  parseLinqWebhookEnvelope,
} from "./linq-live.js";

const FIXTURE_RECEIVED = {
  api_version: "v3",
  created_at: "2026-02-05T19:31:13.736Z",
  data: {
    chat: {
      id: "8f392755-6865-4b18-880a-227f9d8b458f",
      is_group: false,
      owner_handle: {
        handle: "+14045698064",
        id: "6d6c617f-187a-4dcd-a0d5-988347a8c092",
        is_me: true,
      },
    },
    direction: "inbound",
    id: "89e3566e-1d13-49e5-a8ee-48490d5bfeb7",
    parts: [{ type: "text", value: "Hello from docs fixture" }],
    sender_handle: {
      handle: "+5531999941160",
      id: "e604375a-5913-483a-8278-c631e8f0ffda",
      is_me: false,
    },
    sent_at: "2026-02-05T19:31:13.074Z",
    service: "iMessage",
  },
  event_id: "2915e81c-5068-4796-ace2-21d2c94ad298",
  event_type: "message.received",
  partner_id: "5be16771-9835-5670-857d-823e6440589e",
  trace_id: "8af9171a45022df2eb74ba4e4c83be0f",
  webhook_version: "2026-02-03",
};

test("parseLinqWebhookEnvelope maps docs message.received to ChatSdkMessage", () => {
  const message = parseLinqWebhookEnvelope(FIXTURE_RECEIVED);
  assert.equal(message.thread.kind, "guid");
  assert.equal(message.thread.id, "8f392755-6865-4b18-880a-227f9d8b458f");
  assert.equal(message.from.id, "+5531999941160");
  assert.equal(message.text, "Hello from docs fixture");
  assert.equal(message.id, "89e3566e-1d13-49e5-a8ee-48490d5bfeb7");
});

test("standard webhooks verify accepts signed payload and rejects bad/stale", () => {
  const secret = generateWhsecSecret();
  const rawBody = JSON.stringify(FIXTURE_RECEIVED);
  const now = new Date("2026-08-24T12:00:00.000Z");
  const headers = signStandardWebhook({
    rawBody,
    secret,
    timestampSeconds: Math.floor(now.getTime() / 1000),
    webhookId: FIXTURE_RECEIVED.event_id,
  });
  const webhookId = verifyStandardWebhook({
    headers,
    now: () => now,
    rawBody,
    secret,
  });
  assert.equal(webhookId, FIXTURE_RECEIVED.event_id);

  assert.throws(
    () =>
      verifyStandardWebhook({
        headers: { ...headers, "webhook-signature": "v1,dG9vbG9vbG9vbA==" },
        now: () => now,
        rawBody,
        secret,
      }),
    (error: unknown) =>
      error instanceof WebhookVerificationError && error.code === "bad_signature",
  );

  assert.throws(
    () =>
      verifyStandardWebhook({
        headers: {
          ...headers,
          "webhook-timestamp": String(Math.floor(now.getTime() / 1000) - 600),
        },
        now: () => now,
        rawBody,
        secret,
      }),
    (error: unknown) =>
      error instanceof WebhookVerificationError &&
      error.code === "stale_timestamp",
  );
});

test("acceptSignedWebhook is idempotent on webhook-id", () => {
  const secret = generateWhsecSecret();
  const now = new Date("2026-08-24T12:00:00.000Z");
  const provider = createLiveLinqProvider({
    apiKey: "test-key",
    now: () => now,
    webhookSecret: secret,
  });
  const rawBody = JSON.stringify(FIXTURE_RECEIVED);
  const headers = signStandardWebhook({
    rawBody,
    secret,
    timestampSeconds: Math.floor(now.getTime() / 1000),
    webhookId: FIXTURE_RECEIVED.event_id,
  });
  const first = provider.acceptSignedWebhook(rawBody, headers);
  const second = provider.acceptSignedWebhook(rawBody, headers);
  assert.equal(first.webhookId, second.webhookId);
  assert.equal(first.message.id, second.message.id);
  assert.equal(first.message.from.id, "+5531999941160");
});

test("default allowlist includes phone and inbound-first Mac handle", () => {
  assert.deepEqual([...LINQ_LIVE_DEFAULT_ALLOWLIST], [
    "+5531999941160",
    "enzotironi.dev@gmail.com",
  ]);
});

test("live send rejects non-allowlisted destination", async () => {
  const provider = createLiveLinqProvider({
    allowlist: ["+5531999941160"],
    apiKey: "test-key",
    webhookSecret: generateWhsecSecret(),
  });
  await assert.rejects(
    () =>
      provider.send({
        clientDeliveryId: "spd_forbid_1",
        text: "should not send",
        toUser: { id: "+15555550100" },
      }),
    (error: unknown) => error instanceof LiveLinqAllowlistError,
  );
});

test("live send uses Idempotency-Key and converges after restart", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const messageId = "69e8b4b7-c9cd-4feb-ab69-3ff80469646f";
  const provider = createLiveLinqProvider({
    allowlist: ["+5531999941160"],
    apiKey: "test-key",
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ init, url });
      return new Response(
        JSON.stringify({
          chat_id: "446e2437-410b-492b-94ad-7030194d9484",
          from: "+14045698064",
          message: { id: messageId },
        }),
        { status: 202 },
      );
    },
    fromNumber: "+14045698064",
    webhookSecret: generateWhsecSecret(),
  });

  const first = await provider.send({
    clientDeliveryId: "spd_idem_1",
    text: "Zoen sandbox probe",
    toUser: { id: "+5531999941160" },
  });
  assert.equal(first.status, "accepted");
  assert.equal(first.messageId, messageId);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/messages$/);
  assert.equal(
    new Headers(calls[0]!.init?.headers).get("Idempotency-Key"),
    "spd_idem_1",
  );

  provider.simulateRestart?.();
  const second = await provider.send({
    clientDeliveryId: "spd_idem_1",
    text: "Zoen sandbox probe",
    toUser: { id: "+5531999941160" },
  });
  assert.equal(second.messageId, messageId);
  assert.equal(calls.length, 2);
  assert.equal(
    new Headers(calls[1]!.init?.headers).get("Idempotency-Key"),
    "spd_idem_1",
  );
});

test("advertise live without LINQ_API_KEY fails closed", () => {
  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ;
  const previousKey = process.env.LINQ_API_KEY;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ = "1";
    delete process.env.LINQ_API_KEY;
    assert.throws(
      () => assertLiveLinqAdvertisement(),
      (error: unknown) => error instanceof LiveLinqConfigError,
    );
  } finally {
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ = previousAdvertise;
    }
    if (previousKey === undefined) {
      delete process.env.LINQ_API_KEY;
    } else {
      process.env.LINQ_API_KEY = previousKey;
    }
  }
});
