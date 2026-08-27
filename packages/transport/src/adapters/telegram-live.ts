import { timingSafeEqual } from "node:crypto";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import {
  createCapabilityProbes,
  type CapabilityProbes,
  type ProbeAnswer,
} from "../capability-probes.js";
import type {
  ChatSdkDeliveryReceipt,
  ChatSdkMessage,
  ChatSdkOutbound,
  ChatSdkShapedAdapter,
} from "../chat-sdk-shape.js";

const NATIVE: ProbeAnswer = { status: "native" };

const TELEGRAM_TABLE = {
  dm: NATIVE,
  ephemeral: { status: "unsupported", degradeTo: "dm" },
  group: NATIVE,
  image_file: NATIVE,
  native_button: NATIVE,
  native_card: NATIVE,
  native_link: NATIVE,
  proactive_outbound: NATIVE,
  reactions: NATIVE,
  read_receipts: { status: "unsupported", degradeTo: "text" },
  reply_thread: NATIVE,
  text: NATIVE,
  typing: NATIVE,
  voice_audio: NATIVE,
} as const;

const DEFAULT_API_URL = "https://api.telegram.org";
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

export class LiveTelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveTelegramConfigError";
  }
}

export class TelegramEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramEnvelopeError";
  }
}

export type TelegramWebhookSecretFailure = "secret_missing" | "secret_rejected";

export class TelegramWebhookSecretError extends Error {
  readonly code: TelegramWebhookSecretFailure;

  constructor(code: TelegramWebhookSecretFailure = "secret_rejected") {
    super(telegramWebhookSecretMessage(code));
    this.name = "TelegramWebhookSecretError";
    this.code = code;
  }

  status(): number {
    switch (this.code) {
      case "secret_missing":
        return 503;
      case "secret_rejected":
        return 401;
      default: {
        const _never: never = this.code;
        return _never;
      }
    }
  }
}

function telegramWebhookSecretMessage(
  code: TelegramWebhookSecretFailure,
): string {
  switch (code) {
    case "secret_missing":
      return "telegram webhook secret missing";
    case "secret_rejected":
      return "telegram webhook secret rejected";
    default: {
      const _never: never = code;
      return _never;
    }
  }
}

export type TelegramIngressMode = "webhook" | "polling";

export interface LiveTelegramProvider extends ChatSdkShapedAdapter {
  readonly kind: "live";
  readonly runtimeMode: TelegramIngressMode;
}

export interface LiveTelegramProviderOptions {
  readonly botToken: string;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
  readonly runtimeMode?: TelegramIngressMode;
}

export function readTelegramBotTokenFromEnv(): string | undefined {
  const token =
    process.env.TELEGRAM_BOT_TOKEN ?? process.env.ZOEN_TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    return undefined;
  }
  return token.trim();
}

export function requireTelegramBotToken(raw: string | undefined): string {
  if (raw === undefined || raw.trim().length === 0) {
    throw new LiveTelegramConfigError(
      "TELEGRAM_BOT_TOKEN required (fail closed)",
    );
  }
  return raw.trim();
}

/**
 * Fail closed when live Telegram is advertised without TELEGRAM_BOT_TOKEN.
 * Other suites must not call this; only `channel-telegram-live` / advertise path.
 */
export function assertLiveTelegramAdvertisement(): void {
  if (process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM !== "1") {
    return;
  }
  requireTelegramBotToken(readTelegramBotTokenFromEnv());
}

export function readTelegramIngressModeFromEnv(): TelegramIngressMode {
  return process.env.TELEGRAM_INGRESS_MODE === "polling" ? "polling" : "webhook";
}

/**
 * Shared Telegram webhook-secret env family.
 * Empty or whitespace values are missing.
 */
export function readTelegramWebhookSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const token of [
    env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
    env.ZOEN_TELEGRAM_WEBHOOK_SECRET,
  ]) {
    if (token !== undefined && token.trim().length > 0) {
      return token.trim();
    }
  }
  return undefined;
}

/**
 * Fail-closed webhook header check. Caller passes the captured secret.
 * Missing/empty secret is 503; mismatch is 401. No process.env default.
 */
export function verifyTelegramWebhookSecret(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  secret: string | undefined,
): void {
  if (secret === undefined || secret.length === 0) {
    throw new TelegramWebhookSecretError("secret_missing");
  }
  const raw = headers[SECRET_HEADER] ?? headers["X-Telegram-Bot-Api-Secret-Token"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value.length !== secret.length) {
    throw new TelegramWebhookSecretError("secret_rejected");
  }
  if (!timingSafeEqual(Buffer.from(value), Buffer.from(secret))) {
    throw new TelegramWebhookSecretError("secret_rejected");
  }
}

export function parseTelegramBotUpdate(raw: unknown): ChatSdkMessage {
  const update = asRecord(raw, "telegram update");
  if (update.callback_query !== undefined) {
    return parseCallbackQuery(update);
  }
  if (update.message_reaction !== undefined) {
    return parseReaction(update);
  }
  const message = firstMessage(update);
  const from =
    message.from !== undefined ? asRecord(message.from, "from") : undefined;
  const chat = asRecord(message.chat, "chat");
  const reply = message.reply_to_message;
  const replyToMessageId =
    reply !== null && typeof reply === "object" && !Array.isArray(reply)
      ? optionalMessageId(asRecord(reply, "reply_to_message"))
      : undefined;
  const media = parseMedia(message);
  return {
    from: { id: from !== undefined ? requireString(from, "id") : requireString(chat, "id") },
    id: requireMessageId(message, update),
    mediaRef: media?.mediaRef,
    mime: media?.mime,
    receivedAt: receivedAt(message.date),
    replyToMessageId,
    text: typeof message.text === "string" ? message.text : undefined,
    thread: { id: requireString(chat, "id"), kind: "chat" },
  };
}

export function createLiveTelegramProviderFromEnv(
  overrides: Partial<LiveTelegramProviderOptions> = {},
): LiveTelegramProvider {
  assertLiveTelegramAdvertisement();
  const botToken =
    overrides.botToken ?? requireTelegramBotToken(readTelegramBotTokenFromEnv());
  return createLiveTelegramProvider({
    apiUrl: overrides.apiUrl ?? process.env.TELEGRAM_API_BASE_URL,
    botToken,
    fetch: overrides.fetch,
    runtimeMode: overrides.runtimeMode ?? readTelegramIngressModeFromEnv(),
  });
}

export function createLiveTelegramProvider(
  options: LiveTelegramProviderOptions,
): LiveTelegramProvider {
  const botToken = requireTelegramBotToken(options.botToken);
  const apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const http = options.fetch ?? fetch;
  const runtimeMode = options.runtimeMode ?? "webhook";
  const official = createTelegramAdapter({
    apiUrl,
    botToken,
    logger: quietLogger(),
    mode: "webhook",
  });
  const probes: CapabilityProbes = createCapabilityProbes(
    "telegram",
    TELEGRAM_TABLE,
  );
  const delivered = new Map<string, ChatSdkDeliveryReceipt>();

  const provider: LiveTelegramProvider = {
    kind: "live",
    parseInbound(raw) {
      return parseTelegramBotUpdate(raw);
    },
    probes,
    providerId: "telegram",
    runtimeMode,
    async send(outbound) {
      const existing = delivered.get(outbound.clientDeliveryId);
      if (existing !== undefined) {
        return existing;
      }
      const chatId = outbound.thread?.id ?? outbound.toUser?.id;
      if (chatId === undefined || chatId.length === 0) {
        throw new LiveTelegramConfigError(
          "telegram send requires ChatSdkOutbound.thread (chat id)",
        );
      }
      const decoded = official.decodeThreadId(
        official.encodeThreadId({ chatId }),
      );
      try {
        if (outbound.typing === true) {
          await botApi(http, apiUrl, botToken, "sendChatAction", {
            action: "typing",
            chat_id: decoded.chatId,
          });
        }
        const result = await botApi(http, apiUrl, botToken, "sendMessage", {
          chat_id: decoded.chatId,
          reply_markup: inlineKeyboard(outbound),
          text: outbound.text,
        });
        const messageId =
          result !== null &&
          typeof result === "object" &&
          (typeof (result as { message_id?: unknown }).message_id === "number" ||
            typeof (result as { message_id?: unknown }).message_id === "string")
            ? String((result as { message_id: number | string }).message_id)
            : outbound.clientDeliveryId;
        const receipt: ChatSdkDeliveryReceipt = {
          messageId,
          status: "accepted",
          typingRecorded: outbound.typing === true,
        };
        delivered.set(outbound.clientDeliveryId, receipt);
        return receipt;
      } catch (error) {
        const receipt: ChatSdkDeliveryReceipt = {
          messageId: `tg_reject_${outbound.clientDeliveryId}`,
          reason: error instanceof Error ? error.message : String(error),
          status: "rejected",
        };
        delivered.set(outbound.clientDeliveryId, receipt);
        return receipt;
      }
    },
    simulateRestart() {
      delivered.clear();
    },
    threadKind: "chat",
  };
  return provider;
}

async function botApi(
  http: typeof fetch,
  apiUrl: string,
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      body[key] = value;
    }
  }
  const response = await http(`${apiUrl}/bot${botToken}/${method}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const json = (await response.json()) as {
    description?: unknown;
    ok?: unknown;
    result?: unknown;
  };
  if (response.ok !== true || json.ok !== true) {
    const description =
      typeof json.description === "string" ? json.description : "telegram api";
    throw new LiveTelegramConfigError(
      `Telegram ${method} HTTP ${String(response.status)}: ${description}`,
    );
  }
  return json.result;
}

function inlineKeyboard(
  outbound: ChatSdkOutbound,
): Record<string, unknown> | undefined {
  const row: Array<Record<string, string>> = [];
  const url = outbound.surfaceUrl?.trim();
  if (url !== undefined && url.length > 0) {
    row.push({ text: "Open", url });
  }
  for (const button of outbound.buttons ?? []) {
    row.push({
      callback_data: button.callbackData.slice(0, 64),
      text: button.label,
    });
  }
  if (row.length === 0) {
    return undefined;
  }
  return { inline_keyboard: [row] };
}

function parseCallbackQuery(update: Record<string, unknown>): ChatSdkMessage {
  const query = asRecord(update.callback_query, "callback_query");
  const from = asRecord(query.from, "callback_query.from");
  const origin =
    query.message !== undefined
      ? asRecord(query.message, "callback_query.message")
      : {};
  const chat =
    origin.chat !== undefined
      ? asRecord(origin.chat, "callback_query.message.chat")
      : {};
  return {
    callbackData: requireString(query, "data"),
    from: { id: requireString(from, "id") },
    id: optionalMessageId(origin) ?? `tg_cb_${requireString(update, "update_id")}`,
    receivedAt: receivedAt(origin.date),
    thread: { id: requireString(chat, "id"), kind: "chat" },
  };
}

function parseReaction(update: Record<string, unknown>): ChatSdkMessage {
  const reaction = asRecord(update.message_reaction, "message_reaction");
  const chat = asRecord(reaction.chat, "message_reaction.chat");
  const user =
    reaction.user !== undefined
      ? asRecord(reaction.user, "message_reaction.user")
      : undefined;
  const newest = Array.isArray(reaction.new_reaction)
    ? reaction.new_reaction[0]
    : undefined;
  const emoji =
    newest !== null &&
    typeof newest === "object" &&
    typeof (newest as { emoji?: unknown }).emoji === "string"
      ? (newest as { emoji: string }).emoji
      : undefined;
  return {
    from: {
      id:
        user !== undefined
          ? requireString(user, "id")
          : requireString(chat, "id"),
    },
    id: requireString(reaction, "message_id"),
    reactionEmoji: emoji,
    reactionTargetMessageId: requireString(reaction, "message_id"),
    receivedAt: receivedAt(reaction.date),
    thread: { id: requireString(chat, "id"), kind: "chat" },
  };
}

function firstMessage(update: Record<string, unknown>): Record<string, unknown> {
  if (update.message !== undefined) {
    return asRecord(update.message, "message");
  }
  if (update.edited_message !== undefined) {
    return asRecord(update.edited_message, "edited_message");
  }
  if (update.channel_post !== undefined) {
    return asRecord(update.channel_post, "channel_post");
  }
  throw new TelegramEnvelopeError("telegram update missing message");
}

function parseMedia(
  message: Record<string, unknown>,
): { mediaRef: string; mime?: string } | undefined {
  if (message.document !== undefined) {
    const document = asRecord(message.document, "document");
    return {
      mediaRef: requireString(document, "file_id"),
      mime:
        typeof document.mime_type === "string" ? document.mime_type : undefined,
    };
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const photo = asRecord(message.photo[message.photo.length - 1], "photo");
    return { mediaRef: requireString(photo, "file_id"), mime: "image/jpeg" };
  }
  if (message.voice !== undefined) {
    const voice = asRecord(message.voice, "voice");
    return {
      mediaRef: requireString(voice, "file_id"),
      mime: typeof voice.mime_type === "string" ? voice.mime_type : "audio/ogg",
    };
  }
  if (message.video !== undefined) {
    const video = asRecord(message.video, "video");
    return {
      mediaRef: requireString(video, "file_id"),
      mime: typeof video.mime_type === "string" ? video.mime_type : "video/mp4",
    };
  }
  return undefined;
}

function requireMessageId(
  message: Record<string, unknown>,
  update: Record<string, unknown>,
): string {
  return optionalMessageId(message) ?? `tg_upd_${requireString(update, "update_id")}`;
}

function optionalMessageId(record: Record<string, unknown>): string | undefined {
  const value = record.message_id;
  if (typeof value === "number" || typeof value === "string") {
    const text = String(value);
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

function receivedAt(date: unknown): string {
  if (typeof date === "number") {
    return new Date(date * 1000).toISOString();
  }
  return new Date().toISOString();
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TelegramEnvelopeError(`telegram ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new TelegramEnvelopeError(`telegram update missing ${key}`);
  }
  return value;
}

function quietLogger(): {
  child: (prefix: string) => ReturnType<typeof quietLogger>;
  debug: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
} {
  const logger = {
    child(_prefix: string) {
      return logger;
    },
    debug(_message: string, ..._args: unknown[]) {},
    error(_message: string, ..._args: unknown[]) {},
    info(_message: string, ..._args: unknown[]) {},
    warn(_message: string, ..._args: unknown[]) {},
  };
  return logger;
}
