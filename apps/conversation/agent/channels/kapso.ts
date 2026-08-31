import { createMemoryState } from "@chat-adapter/state-memory";
import { createKapsoAdapter, type KapsoAdapter } from "@kapso/chat-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

const HTTPS_URL = /https:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/u;
const MULTI_SPACE = /[ \t]{2,}/g;
const PADDED_NEWLINE = / *\n */g;

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

function readString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function flattenButton(button: unknown): string[] {
  if (typeof button === "string") {
    return [button];
  }
  if (!isRecord(button)) {
    return [];
  }
  const parts: string[] = [];
  const label = readString(button, "title") ?? readString(button, "text");
  if (label !== undefined) {
    parts.push(label);
  }
  const url = readString(button, "url");
  if (url !== undefined) {
    parts.push(url);
  }
  return parts;
}

function flattenButtons(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(flattenButton);
}

function flattenCards(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parts: string[] = [];
  for (const card of value) {
    const nested = flattenStructured(card);
    if (nested !== undefined) {
      parts.push(nested);
    }
  }
  return parts;
}

function flattenStructured(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { buttons, cards } = value;
  const parts: string[] = [];
  const text =
    readString(value, "text") ??
    readString(value, "title") ??
    readString(value, "body");
  if (text !== undefined) {
    parts.push(text);
  }
  parts.push(...flattenButtons(buttons), ...flattenCards(cards));
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n");
}

function keepOneHttps(text: string): string {
  let kept = false;
  return text
    .replace(HTTPS_URL, (url) => {
      const trimmed = url.replace(TRAILING_URL_PUNCTUATION, "");
      if (kept) {
        return "";
      }
      kept = true;
      return trimmed;
    })
    .replace(MULTI_SPACE, " ")
    .replace(PADDED_NEWLINE, "\n")
    .trim();
}

function flattenOutbound(message: string): string {
  const trimmed = message.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = parseJson(trimmed);
    if (parsed !== undefined) {
      const structured = flattenStructured(parsed);
      if (structured !== undefined) {
        return keepOneHttps(structured);
      }
    }
  }
  return keepOneHttps(trimmed);
}

function flattenInputRequests(
  requests: ReadonlyArray<{
    prompt: string;
    options?: ReadonlyArray<{ label: string }>;
  }>
): string {
  const structured = flattenStructured({
    cards: requests.map((request) => ({
      buttons: (request.options ?? []).map((option) => ({
        title: option.label,
      })),
      title: request.prompt,
    })),
  });
  return keepOneHttps(structured ?? "");
}

let loadedKapsoAdapter: KapsoAdapter | undefined;

function loadKapsoAdapter(): KapsoAdapter {
  loadedKapsoAdapter ??= createKapsoAdapter({
    kapsoApiKey: process.env.KAPSO_API_KEY,
    phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
    webhookSecret: process.env.KAPSO_WEBHOOK_SECRET,
  });
  return loadedKapsoAdapter;
}

const adapter: KapsoAdapter = new Proxy({} as KapsoAdapter, {
  get(_target, property) {
    const real = loadKapsoAdapter();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

function skipDefaultErrorPost(): Promise<void> {
  return Promise.resolve();
}

export const { bot, channel, send } = chatSdkChannel({
  adapters: {
    kapso: adapter,
  },
  events: {
    async "input.requested"(event, ctx) {
      if (ctx.thread === null || event.requests.length === 0) {
        return;
      }
      const body = flattenInputRequests(event.requests);
      if (body.length === 0) {
        return;
      }
      await ctx.thread.post(body);
    },
    async "message.completed"(event, ctx) {
      if (event.finishReason === "tool-calls" || event.message === null) {
        return;
      }
      if (ctx.thread === null) {
        return;
      }
      const body = flattenOutbound(event.message);
      if (body.length === 0) {
        return;
      }
      await ctx.thread.post(body);
    },
    "session.failed": skipDefaultErrorPost,
    "turn.failed": skipDefaultErrorPost,
  },
  state: createMemoryState(),
  streaming: false,
  userName: "zoen",
});

bot.onDirectMessage(async (thread: Thread, message: Message) => {
  const text = message.text.trim();
  if (text.length === 0) {
    return;
  }
  const decoded = adapter.decodeThreadId(thread.id);
  await send(text, {
    auth: {
      attributes: { tenant: decoded.phoneNumberId },
      authenticator: "kapso",
      principalId: `${decoded.waId}@s.whatsapp.net`,
      principalType: "user",
    },
    thread,
  });
});

export default channel;
