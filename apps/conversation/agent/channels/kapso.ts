import { createKapsoAdapter } from "@kapso/chat-adapter";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

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

function flattenInputRequests(
  requests: ReadonlyArray<{
    prompt: string;
    options?: ReadonlyArray<{ label: string }>;
  }>,
): string {
  const structured = flattenStructured({
    cards: requests.map((request) => ({
      title: request.prompt,
      buttons: (request.options ?? []).map((option) => ({ title: option.label })),
    })),
  });
  return keepOneHttps(structured ?? "");
}

const adapter = createKapsoAdapter({
  kapsoApiKey: process.env.KAPSO_API_KEY,
  phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
  webhookSecret: process.env.KAPSO_WEBHOOK_SECRET,
});

export const { bot, channel, send } = chatSdkChannel({
  userName: "zoen",
  adapters: {
    kapso: adapter,
  },
  state: createMemoryState(),
  streaming: false,
  events: {
    async "message.completed"(event, ctx) {
      if (event.finishReason === "tool-calls" || event.message === null) return;
      if (ctx.thread === null) return;
      const body = flattenOutbound(event.message);
      if (body.length === 0) return;
      await ctx.thread.post(body);
    },
    async "input.requested"(event, ctx) {
      if (ctx.thread === null || event.requests.length === 0) return;
      const body = flattenInputRequests(event.requests);
      if (body.length === 0) return;
      await ctx.thread.post(body);
    },
    // Default handlers post eve error text as WhatsApp sendText. Everyday replies stay flattened assistant text.
    async "turn.failed"() {},
    async "session.failed"() {},
  },
});

bot.onDirectMessage(async (thread: Thread, message: Message) => {
  const text = message.text.trim();
  if (text.length === 0) return;
  const decoded = adapter.decodeThreadId(thread.id);
  await send(text, {
    thread,
    auth: {
      authenticator: "kapso",
      principalType: "user",
      principalId: `${decoded.waId}@s.whatsapp.net`,
      attributes: { tenant: decoded.phoneNumberId },
    },
  });
});

export default channel;
