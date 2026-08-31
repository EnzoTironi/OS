#!/usr/bin/env node
import { createHmac } from "node:crypto";

const [, , url] = process.argv;
const secret = process.env.KAPSO_WEBHOOK_SECRET;
if (
  url === undefined ||
  url.length === 0 ||
  secret === undefined ||
  secret.length === 0
) {
  console.error(
    "usage: KAPSO_WEBHOOK_SECRET=... node scripts/kapso-webhook-admit.mjs <url>"
  );
  process.exit(2);
}

const fixture = JSON.stringify({
  conversation: {
    id: "conv_proof1",
    phone_number: "16315551181",
    phone_number_id: "597907523413541",
    status: "active",
  },
  is_new_conversation: true,
  message: {
    from: "16315551181",
    id: "wamid.proof1",
    kapso: {
      content: "oi",
      direction: "inbound",
      has_media: false,
      origin: "cloud_api",
      processing_status: "pending",
      status: "received",
    },
    text: { body: "oi" },
    timestamp: "1730092800",
    type: "text",
  },
  phone_number_id: "597907523413541",
});

const hmac = createHmac("sha256", secret).update(fixture).digest("hex");
const bad = "0".repeat(hmac.length);

async function post(signature, event) {
  const response = await fetch(url, {
    body: fixture,
    headers: {
      "content-type": "application/json",
      "X-Webhook-Event": event,
      "X-Webhook-Signature": signature,
    },
    method: "POST",
  });
  const body = await response.text();
  return {
    body,
    contentType: response.headers.get("content-type"),
    status: response.status,
  };
}

function printCase(name, result) {
  console.log(`== ${name}`);
  console.log(`status ${result.status}`);
  if (result.contentType !== null) {
    console.log(`content-type ${result.contentType}`);
  }
  console.log(result.body);
}

console.log(`url ${url}`);
console.log(`bytes ${Buffer.byteLength(fixture)}`);
console.log(`hmac ${hmac}`);
console.log(`fixture ${fixture}`);

const valid = await post(hmac, "whatsapp.message.received");
printCase("valid", valid);

const invalid = await post(bad, "whatsapp.message.received");
printCase("bad-signature", invalid);

const unknown = await post(hmac, "whatsapp.message.received-not");
printCase("unknown-event", unknown);

if (valid.status !== 200 || valid.body !== "OK") {
  console.error("expected valid POST 200 OK");
  process.exit(1);
}
if (invalid.status !== 401 || invalid.body !== "Invalid signature") {
  console.error("expected bad signature POST 401 Invalid signature");
  process.exit(1);
}
if (unknown.status !== 200 || unknown.body !== "OK") {
  console.error("expected unknown event POST 200 OK");
  process.exit(1);
}
