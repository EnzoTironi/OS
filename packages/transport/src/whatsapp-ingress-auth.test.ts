import assert from "node:assert/strict";
import test from "node:test";
import { generateWhsecSecret, signStandardWebhook } from "./standard-webhooks.js";
import {
  admitWhatsAppIngress,
  createMemoryIngressReplayStore,
  createPostgresIngressReplayStore,
  GATEWAY_INGRESS_REPLAY_NAMESPACE,
  verifyWhatsAppInbound,
  WhatsAppIngressAuthError,
} from "./whatsapp-ingress-auth.js";

const secret = generateWhsecSecret();
const body = JSON.stringify({ body: "oi" });
const now = () => new Date("2026-08-25T12:00:00.000Z");
const timestampSeconds = Math.floor(now().getTime() / 1000);

test("WhatsApp inbound HMAC is pure and replay is a store", async () => {
  const headers = signStandardWebhook({
    rawBody: body,
    secret,
    timestampSeconds,
    webhookId: "msg_ok",
  });
  assert.equal(
    verifyWhatsAppInbound({ headers, now, rawBody: body, secret }),
    "msg_ok",
  );
  assert.equal(
    verifyWhatsAppInbound({ headers, now, rawBody: body, secret }),
    "msg_ok",
  );
  const store = createMemoryIngressReplayStore();
  let runs = 0;
  await admitWhatsAppIngress({
    store,
    webhookId: "msg_ok",
    work: async () => {
      runs += 1;
    },
  });
  await assert.rejects(
    () =>
      admitWhatsAppIngress({
        store,
        webhookId: "msg_ok",
        work: async () => {
          runs += 1;
        },
      }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "replay",
  );
  assert.equal(runs, 1);
});

test("WhatsApp inbound HMAC fails closed on missing secret, forged, and stale", () => {
  assert.throws(
    () =>
      verifyWhatsAppInbound({
        headers: {},
        now,
        rawBody: body,
      }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError &&
      error.code === "secret_missing" &&
      error.status() === 503,
  );
  const headers = signStandardWebhook({
    rawBody: body,
    secret,
    timestampSeconds,
    webhookId: "msg_bad",
  });
  assert.throws(
    () =>
      verifyWhatsAppInbound({
        headers: { ...headers, "webhook-signature": "v1,AAAA" },
        now,
        rawBody: body,
        secret,
      }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "bad_signature",
  );
  assert.throws(
    () =>
      verifyWhatsAppInbound({
        headers: {
          ...headers,
          "webhook-timestamp": String(timestampSeconds - 20 * 60),
        },
        now,
        rawBody: body,
        secret,
      }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "stale_timestamp",
  );
});

test("durable ingress replay uses one webhook-id key", async () => {
  const seen = new Set<string>();
  const client = {
    async query(text: string, values?: readonly unknown[]) {
      assert.match(text, /ingress_replay/);
      const key = String(values?.[0]);
      if (text.includes("SELECT")) {
        return { rows: seen.has(key) ? [{ webhook_id: key }] : [] };
      }
      if (seen.has(key)) {
        return { rows: [] };
      }
      seen.add(key);
      return { rows: [{ webhook_id: key }] };
    },
  };
  const store = createPostgresIngressReplayStore(client);
  await admitWhatsAppIngress({
    store,
    webhookId: "msg_pg",
    work: async () => undefined,
  });
  await assert.rejects(
    () =>
      admitWhatsAppIngress({
        store,
        webhookId: "msg_pg",
        work: async () => undefined,
      }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "replay",
  );
  assert.deepEqual([...seen], [`${GATEWAY_INGRESS_REPLAY_NAMESPACE}msg_pg`]);
});

test("gateway and zoend replay keys do not collide", async () => {
  const seen = new Set<string>();
  const queried: string[] = [];
  const client = {
    async query(text: string, values?: readonly unknown[]) {
      assert.match(text, /ingress_replay/);
      const key = String(values?.[0]);
      queried.push(key);
      if (text.includes("SELECT")) {
        return { rows: seen.has(key) ? [{ webhook_id: key }] : [] };
      }
      if (seen.has(key)) {
        return { rows: [] };
      }
      seen.add(key);
      return { rows: [{ webhook_id: key }] };
    },
  };
  const store = createPostgresIngressReplayStore(client);
  await admitWhatsAppIngress({
    store,
    webhookId: "shared",
    work: async () => undefined,
  });
  seen.add("zoend:shared");
  await assert.rejects(
    () =>
      admitWhatsAppIngress({
        store,
        webhookId: "shared",
        work: async () => undefined,
      }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "replay",
  );
  assert.deepEqual(queried, [
    "gateway:shared",
    "gateway:shared",
    "gateway:shared",
  ]);
  assert.equal(seen.has("gateway:shared"), true);
  assert.equal(seen.has("zoend:shared"), true);
  assert.equal(seen.has("shared"), false);
});

test("failed hop releases inflight so a retry can run", async () => {
  const store = createMemoryIngressReplayStore();
  await assert.rejects(
    () =>
      admitWhatsAppIngress({
        store,
        webhookId: "msg_retry",
        work: async () => {
          throw new Error("gateway down");
        },
      }),
    /gateway down/,
  );
  let ran = false;
  await admitWhatsAppIngress({
    store,
    webhookId: "msg_retry",
    work: async () => {
      ran = true;
    },
  });
  assert.equal(ran, true);
});
