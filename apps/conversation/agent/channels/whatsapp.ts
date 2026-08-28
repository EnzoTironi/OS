import { createHmac, timingSafeEqual } from "node:crypto";
import { defineChannel, POST } from "eve/channels";

type InboundText = {
  jid: string;
  phoneNumberId: string;
  text: string;
};

type WebhookDecision =
  | { kind: "text"; inbound: InboundText }
  | { kind: "drop"; reason: string };

const KAPSO_MESSAGES_URL = "https://api.kapso.ai/meta/whatsapp/v24.0";
const HTTPS_URL = /https:\/\/[^\s<>"'`]+/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function attrString(
  value: string | readonly string[] | undefined,
): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}

function signaturesMatch(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hmacHex(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function jidFromFrom(from: unknown): string | undefined {
  if (typeof from !== "string" || !/^\d+$/.test(from)) return undefined;
  return `${from}@s.whatsapp.net`;
}

function recipientDigits(jid: string): string | undefined {
  const digits = jid.endsWith("@s.whatsapp.net")
    ? jid.slice(0, -"@s.whatsapp.net".length)
    : jid;
  return /^\d+$/.test(digits) ? digits : undefined;
}

function inboundText(message: Record<string, unknown>): string | undefined {
  const type = readString(message, "type");
  if (type !== undefined && type !== "text") return undefined;
  const textField = message.text;
  if (isRecord(textField)) {
    const body = readString(textField, "body");
    if (body !== undefined) return body;
  }
  const kapso = message.kapso;
  if (isRecord(kapso)) return readString(kapso, "content");
  return undefined;
}

function decideWebhook(eventName: string, payload: unknown): WebhookDecision {
  if (!isRecord(payload)) return { kind: "drop", reason: "payload is not an object" };
  if (payload.batch === true || Array.isArray(payload.data)) {
    return { kind: "drop", reason: "batch envelope" };
  }
  if (eventName !== "whatsapp.message.received") {
    return { kind: "drop", reason: `unknown event ${eventName || "(missing)"}` };
  }
  const message = payload.message;
  if (!isRecord(message)) return { kind: "drop", reason: "missing message" };
  const text = inboundText(message);
  if (text === undefined) return { kind: "drop", reason: "non-text" };
  const jid = jidFromFrom(message.from);
  if (jid === undefined) return { kind: "drop", reason: "message.from is not digits" };
  const conversation = isRecord(payload.conversation) ? payload.conversation : undefined;
  const phoneNumberId =
    readString(payload, "phone_number_id") ??
    (conversation !== undefined ? readString(conversation, "phone_number_id") : undefined);
  const customerId =
    readString(payload, "customer_id") ??
    (conversation !== undefined ? readString(conversation, "customer_id") : undefined);
  const tenant = phoneNumberId ?? customerId;
  if (tenant === undefined) return { kind: "drop", reason: "missing phone_number_id" };
  return {
    kind: "text",
    inbound: { jid, phoneNumberId: tenant, text },
  };
}

function flattenStructured(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts: string[] = [];
  const text =
    readString(value, "text") ?? readString(value, "title") ?? readString(value, "body");
  if (text !== undefined) parts.push(text);
  const buttons = value.buttons;
  if (Array.isArray(buttons)) {
    for (const button of buttons) {
      if (typeof button === "string") {
        parts.push(button);
        continue;
      }
      if (!isRecord(button)) continue;
      const label = readString(button, "title") ?? readString(button, "text");
      if (label !== undefined) parts.push(label);
      const url = readString(button, "url");
      if (url !== undefined) parts.push(url);
    }
  }
  const cards = value.cards;
  if (Array.isArray(cards)) {
    for (const card of cards) {
      const nested = flattenStructured(card);
      if (nested !== undefined) parts.push(nested);
    }
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n");
}

function keepOneHttps(text: string): string {
  let kept = false;
  return text
    .replace(HTTPS_URL, (url) => {
      const trimmed = url.replace(/[),.;:!?]+$/u, "");
      if (kept) return "";
      kept = true;
      return trimmed;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function flattenOutbound(message: string): string {
  const trimmed = message.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = parseJson(trimmed);
    if (parsed !== undefined) {
      const structured = flattenStructured(parsed);
      if (structured !== undefined) return keepOneHttps(structured);
    }
  }
  return keepOneHttps(trimmed);
}

function sessionAuth(inbound: InboundText) {
  return {
    authenticator: "kapso",
    principalType: "user",
    principalId: inbound.jid,
    attributes: { tenant: inbound.phoneNumberId, jid: inbound.jid },
  };
}

function dropOk(reason: string): Response {
  console.log(`kapso webhook drop: ${reason}`);
  return Response.json({ ok: true, dropped: true });
}

async function sendKapsoText(input: {
  apiKey: string;
  phoneNumberId: string;
  to: string;
  body: string;
}): Promise<void> {
  const response = await fetch(
    `${KAPSO_MESSAGES_URL}/${encodeURIComponent(input.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-Key": input.apiKey,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    console.error(`kapso outbound failed: ${response.status} ${detail}`);
  }
}

export default defineChannel({
  routes: [
    POST("/whatsapp/webhook", async (request, { from }) => {
      const secret = process.env.KAPSO_WEBHOOK_SECRET;
      if (secret === undefined || secret.length === 0) {
        console.error("KAPSO_WEBHOOK_SECRET is missing");
        return Response.json(
          { ok: false, error: "KAPSO_WEBHOOK_SECRET is missing" },
          { status: 503 },
        );
      }

      const rawBody = await request.text();
      const signature = request.headers.get("x-webhook-signature") ?? "";
      // Kapso's Node sample HMACs JSON.stringify of a parsed object. Verify the exact request bytes.
      const expected = hmacHex(secret, rawBody);
      if (!signaturesMatch(signature, expected)) {
        return Response.json({ ok: false, error: "invalid signature" }, { status: 401 });
      }

      const eventName = request.headers.get("x-webhook-event") ?? "";
      const payload = parseJson(rawBody);
      if (payload === undefined) return dropOk("invalid json");

      const decision = decideWebhook(eventName, payload);
      if (decision.kind === "drop") return dropOk(decision.reason);

      const session = await from(decision.inbound.jid).send(decision.inbound.text, {
        auth: sessionAuth(decision.inbound),
      });
      return Response.json({ ok: true, sessionId: session.id });
    }),
  ],
  events: {
    async "message.completed"(event, _channel, ctx) {
      if (event.finishReason === "tool-calls" || event.message === null) return;
      const body = flattenOutbound(event.message);
      if (body.length === 0) return;

      const auth = ctx.session.auth.current ?? ctx.session.auth.initiator;
      const apiKey = process.env.KAPSO_API_KEY?.trim();
      const phoneNumberId =
        attrString(auth?.attributes.tenant) ?? process.env.KAPSO_PHONE_NUMBER_ID?.trim();
      const to = auth !== null ? recipientDigits(auth.principalId) : undefined;
      if (apiKey === undefined || apiKey.length === 0 || phoneNumberId === undefined || to === undefined) {
        console.log("kapso outbound skip: KAPSO_API_KEY or phone id missing");
        return;
      }

      try {
        await sendKapsoText({ apiKey, phoneNumberId, to, body });
      } catch (error) {
        console.error("kapso outbound failed", error);
      }
    },
  },
});
