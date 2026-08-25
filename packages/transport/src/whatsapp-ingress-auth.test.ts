import assert from "node:assert/strict";
import test from "node:test";
import { generateWhsecSecret, signStandardWebhook } from "./standard-webhooks.js";
import {
  claimWhatsAppIngressReplay,
  resetWhatsAppIngressReplay,
  verifyWhatsAppInbound,
  WhatsAppIngressAuthError,
} from "./whatsapp-ingress-auth.js";

const secret = generateWhsecSecret();
const body = JSON.stringify({ body: "oi" });
const now = () => new Date("2026-08-25T12:00:00.000Z");
const timestampSeconds = Math.floor(now().getTime() / 1000);

test("WhatsApp inbound HMAC accepts a valid Standard Webhooks signature once", () => {
  resetWhatsAppIngressReplay();
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
  assert.throws(
    () => verifyWhatsAppInbound({ headers, now, rawBody: body, secret }),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "replay",
  );
});

test("WhatsApp inbound HMAC fails closed on missing secret, forged, and stale", () => {
  resetWhatsAppIngressReplay();
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

test("durable ingress replay claims once per namespaced webhook id", async () => {
  const seen = new Set<string>();
  const client = {
    async query(text: string, values?: readonly unknown[]) {
      assert.match(text, /ingress_replay/);
      const key = String(values?.[0]);
      if (seen.has(key)) {
        return { rows: [] };
      }
      seen.add(key);
      return { rows: [{ webhook_id: key }] };
    },
  };
  await claimWhatsAppIngressReplay(client, "msg_pg");
  await assert.rejects(
    () => claimWhatsAppIngressReplay(client, "msg_pg"),
    (error: unknown) =>
      error instanceof WhatsAppIngressAuthError && error.code === "replay",
  );
  await claimWhatsAppIngressReplay(client, "msg_pg", "zoend");
  assert.deepEqual([...seen], ["gateway:msg_pg", "zoend:msg_pg"]);
});
