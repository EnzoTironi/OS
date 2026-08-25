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
import {
  verifyStandardWebhook,
  type StandardWebhookHeaders,
} from "../standard-webhooks.js";

const NATIVE: ProbeAnswer = { status: "native" };

const LINQ_TABLE = {
  dm: NATIVE,
  ephemeral: NATIVE,
  group: NATIVE,
  image_file: NATIVE,
  native_button: NATIVE,
  native_card: NATIVE,
  native_link: NATIVE,
  proactive_outbound: NATIVE,
  reactions: NATIVE,
  read_receipts: NATIVE,
  reply_thread: NATIVE,
  text: NATIVE,
  typing: { status: "unsupported", degradeTo: "text" },
  voice_audio: NATIVE,
} as const;

const DEFAULT_BASE_URL = "https://api.linqapp.com/api/partner/v3";
/** Phone stays allowlisted; Mac iMessage handle is the live inbound-first path. */
export const LINQ_LIVE_DEFAULT_ALLOWLIST = [
  "+5531999941160",
  "enzotironi.dev@gmail.com",
] as const;
const DEFAULT_ALLOWLIST = LINQ_LIVE_DEFAULT_ALLOWLIST;
const SANDBOX_LINE = "+14045698064";

export class LiveLinqConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveLinqConfigError";
  }
}

export class LiveLinqAllowlistError extends Error {
  readonly destination: string;

  constructor(destination: string) {
    super(`live Linq send rejected: ${destination} is not allowlisted`);
    this.name = "LiveLinqAllowlistError";
    this.destination = destination;
  }
}

export interface LiveLinqPhoneNumber {
  readonly id: string;
  readonly phoneNumber: string;
}

export interface LiveLinqOutboundObservation {
  readonly chatId?: string;
  readonly httpStatus: number;
  readonly messageId: string;
}

export interface LiveLinqProvider extends ChatSdkShapedAdapter {
  readonly kind: "live";
  listPhoneNumbers(): Promise<readonly LiveLinqPhoneNumber[]>;
  lastOutbound(): LiveLinqOutboundObservation | undefined;
  /**
   * Verify Standard Webhooks headers then parse the envelope into ChatSdkMessage.
   * `webhook-id` is the transport idempotency key.
   */
  acceptSignedWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): { readonly webhookId: string; readonly message: ChatSdkMessage };
}

export interface LiveLinqProviderOptions {
  readonly apiKey: string;
  readonly webhookSecret: string;
  /** Partner sandbox from-number. Defaults to Zoen sandbox line. */
  readonly fromNumber?: string;
  /**
   * Destinations permitted for live send. Defaults to the self-test number.
   * Override via `ZOEN_LINQ_LIVE_ALLOWLIST` (comma-separated) when constructing
   * through {@link createLiveLinqProviderFromEnv}.
   */
  readonly allowlist?: readonly string[];
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/**
 * Fail closed when live Linq is advertised without credentials.
 * Other suites must not call this; only `channel-linq-live` / advertise path.
 */
export function assertLiveLinqAdvertisement(): void {
  if (process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ !== "1") {
    return;
  }
  const key = process.env.LINQ_API_KEY;
  if (key === undefined || key.length === 0) {
    throw new LiveLinqConfigError(
      "ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ=1 without LINQ_API_KEY (fail closed)",
    );
  }
}

export function createLiveLinqProviderFromEnv(
  overrides: Partial<LiveLinqProviderOptions> = {},
): LiveLinqProvider {
  assertLiveLinqAdvertisement();
  const apiKey = overrides.apiKey ?? process.env.LINQ_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new LiveLinqConfigError("LINQ_API_KEY required for live Linq provider");
  }
  const webhookSecret =
    overrides.webhookSecret ??
    process.env.LINQ_WEBHOOK_SECRET ??
    process.env.ZOEN_LINQ_WEBHOOK_SECRET;
  if (webhookSecret === undefined || webhookSecret.length === 0) {
    throw new LiveLinqConfigError(
      "LINQ_WEBHOOK_SECRET (or ZOEN_LINQ_WEBHOOK_SECRET) required for live Linq provider",
    );
  }
  const allowlistEnv = process.env.ZOEN_LINQ_LIVE_ALLOWLIST;
  const allowlist =
    overrides.allowlist ??
    (allowlistEnv !== undefined && allowlistEnv.length > 0
      ? allowlistEnv.split(",").map((value) => value.trim()).filter(Boolean)
      : [...DEFAULT_ALLOWLIST]);
  const fromNumber =
    overrides.fromNumber ??
    process.env.LINQ_SANDBOX_LINE ??
    SANDBOX_LINE;
  return createLiveLinqProvider({
    allowlist,
    apiKey,
    baseUrl: overrides.baseUrl,
    fetch: overrides.fetch,
    fromNumber,
    now: overrides.now,
    webhookSecret,
  });
}

/** Live Linq ChatSdkShapedAdapter against api.linqapp.com partner v3. */
export function createLiveLinqProvider(
  options: LiveLinqProviderOptions,
): LiveLinqProvider {
  if (options.apiKey.length === 0) {
    throw new LiveLinqConfigError("LINQ_API_KEY required for live Linq provider");
  }
  if (options.webhookSecret.length === 0) {
    throw new LiveLinqConfigError("webhook secret required for live Linq provider");
  }

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fromNumber = options.fromNumber ?? SANDBOX_LINE;
  const allowlist = new Set(
    (options.allowlist ?? DEFAULT_ALLOWLIST).map((value) => value.trim()),
  );
  const http = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const probes: CapabilityProbes = createCapabilityProbes("linq", LINQ_TABLE);
  const delivered = new Map<string, ChatSdkDeliveryReceipt>();
  const acceptedWebhooks = new Map<string, ChatSdkMessage>();
  let lastOutbound: LiveLinqOutboundObservation | undefined;

  async function partnerFetch(
    path: string,
    init: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${options.apiKey}`);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (init.idempotencyKey !== undefined) {
      headers.set("Idempotency-Key", init.idempotencyKey);
    }
    return http(`${baseUrl}${path}`, { ...init, headers });
  }

  const provider: LiveLinqProvider = {
    kind: "live",
    providerId: "linq",
    probes,
    threadKind: "guid",

    lastOutbound() {
      return lastOutbound;
    },

    async listPhoneNumbers() {
      const response = await partnerFetch("/phone_numbers");
      if (!response.ok) {
        throw new Error(
          `live Linq GET /phone_numbers HTTP ${String(response.status)}`,
        );
      }
      const body = (await response.json()) as {
        phone_numbers?: Array<{ id?: unknown; phone_number?: unknown }>;
      };
      const rows = Array.isArray(body.phone_numbers) ? body.phone_numbers : [];
      return rows.map((row) => {
        if (typeof row.id !== "string" || typeof row.phone_number !== "string") {
          throw new Error("live Linq phone_numbers row missing id/phone_number");
        }
        return { id: row.id, phoneNumber: row.phone_number };
      });
    },

    acceptSignedWebhook(rawBody, headers) {
      const webhookId = verifyStandardWebhook({
        headers,
        now,
        rawBody,
        secret: options.webhookSecret,
      });
      const existing = acceptedWebhooks.get(webhookId);
      if (existing !== undefined) {
        return { message: existing, webhookId };
      }
      const parsed = JSON.parse(rawBody) as unknown;
      const message = parseLinqWebhookEnvelope(parsed);
      acceptedWebhooks.set(webhookId, message);
      return { message, webhookId };
    },

    parseInbound(raw: unknown): ChatSdkMessage {
      return parseLinqWebhookEnvelope(raw);
    },

    async send(outbound: ChatSdkOutbound): Promise<ChatSdkDeliveryReceipt> {
      const existing = delivered.get(outbound.clientDeliveryId);
      if (existing !== undefined) {
        return existing;
      }

      const destination = resolveDestination(outbound);
      if (!allowlist.has(destination)) {
        throw new LiveLinqAllowlistError(destination);
      }

      // createChat has no Idempotency-Key; /messages does and auto-picks our only line.
      const body = {
        message: {
          idempotency_key: outbound.clientDeliveryId,
          parts: [{ type: "text", value: outbound.text }],
        },
        to: [destination],
      };

      const response = await partnerFetch("/messages", {
        body: JSON.stringify(body),
        idempotencyKey: outbound.clientDeliveryId,
        method: "POST",
      });

      if (!response.ok) {
        const detail = await response.text();
        const receipt: ChatSdkDeliveryReceipt = {
          messageId: `linq_reject_${outbound.clientDeliveryId}`,
          reason: `HTTP ${String(response.status)}: ${detail.slice(0, 200)}`,
          status: "rejected",
        };
        lastOutbound = {
          httpStatus: response.status,
          messageId: receipt.messageId,
        };
        delivered.set(outbound.clientDeliveryId, receipt);
        return receipt;
      }

      const payload = (await response.json()) as {
        chat_id?: unknown;
        from?: unknown;
        message?: { id?: unknown } | Array<{ id?: unknown }>;
      };
      if (typeof payload.from === "string" && payload.from !== fromNumber) {
        throw new Error(
          `live Linq send used unexpected from-number ${payload.from}`,
        );
      }
      const messageId = extractSentMessageId(payload, outbound.clientDeliveryId);
      const chatId =
        typeof payload.chat_id === "string" ? payload.chat_id : undefined;

      const receipt: ChatSdkDeliveryReceipt = {
        messageId,
        status: "accepted",
        typingRecorded: outbound.typing === true,
      };
      lastOutbound = {
        chatId,
        httpStatus: response.status,
        messageId,
      };
      delivered.set(outbound.clientDeliveryId, receipt);
      return receipt;
    },

    simulateRestart() {
      delivered.clear();
    },
  };

  return provider;
}

export function parseLinqWebhookEnvelope(raw: unknown): ChatSdkMessage {
  const body = asRecord(raw);

  if (typeof body.event_type === "string" && typeof body.data === "object") {
    return parseV3Envelope(body);
  }

  // Fake / harness shape (delivery_id + chat_guid) still accepted for substitution tests.
  if (typeof body.delivery_id === "string" && typeof body.chat_guid === "string") {
    const sender = requireString(body, "sender_handle");
    return {
      experienceToken:
        typeof body.experience_action_token === "string"
          ? body.experience_action_token
          : undefined,
      from: { id: sender },
      id: typeof body.message_id === "string" ? body.message_id : body.delivery_id,
      receivedAt:
        typeof body.received_at === "string"
          ? body.received_at
          : new Date().toISOString(),
      replyToMessageId:
        typeof body.reply_to_message_id === "string"
          ? body.reply_to_message_id
          : undefined,
      text: typeof body.text === "string" ? body.text : undefined,
      thread: { id: body.chat_guid, kind: "guid" },
    };
  }

  throw new Error("live Linq: unrecognized inbound payload");
}

function parseV3Envelope(body: Record<string, unknown>): ChatSdkMessage {
  const eventType = requireString(body, "event_type");
  if (eventType !== "message.received" && eventType !== "message.sent") {
    throw new Error(`live Linq: unsupported event_type ${eventType}`);
  }
  const data = asRecord(body.data);
  const chat = asRecord(data.chat ?? { id: data.chat_id });
  const chatId = requireString(chat, "id");
  const messageId =
    typeof data.id === "string"
      ? data.id
      : typeof asRecord(data.message ?? {}).id === "string"
        ? String(asRecord(data.message).id)
        : requireString(body, "event_id");

  const senderHandle = extractSenderHandle(data);
  const text = extractText(data);
  const receivedAt =
    typeof data.sent_at === "string"
      ? data.sent_at
      : typeof body.created_at === "string"
        ? body.created_at
        : new Date().toISOString();

  return {
    from: { id: senderHandle },
    id: messageId,
    receivedAt,
    text,
    thread: { id: chatId, kind: "guid" },
  };
}

function extractSenderHandle(data: Record<string, unknown>): string {
  const sender = data.sender_handle;
  if (sender !== null && typeof sender === "object") {
    const handle = (sender as { handle?: unknown }).handle;
    if (typeof handle === "string" && handle.length > 0) {
      return handle;
    }
  }
  if (typeof data.from === "string" && data.from.length > 0) {
    return data.from;
  }
  const fromHandle = data.from_handle;
  if (fromHandle !== null && typeof fromHandle === "object") {
    const handle = (fromHandle as { handle?: unknown }).handle;
    if (typeof handle === "string" && handle.length > 0) {
      return handle;
    }
  }
  throw new Error("live Linq: missing sender handle");
}

function extractText(data: Record<string, unknown>): string | undefined {
  const parts = Array.isArray(data.parts)
    ? data.parts
    : Array.isArray(asRecord(data.message ?? {}).parts)
      ? (asRecord(data.message).parts as unknown[])
      : [];
  for (const part of parts) {
    if (part === null || typeof part !== "object") {
      continue;
    }
    const row = part as { type?: unknown; value?: unknown };
    if (row.type === "text" && typeof row.value === "string") {
      return row.value;
    }
  }
  return undefined;
}

function resolveDestination(outbound: ChatSdkOutbound): string {
  if (outbound.toUser?.id !== undefined && outbound.toUser.id.length > 0) {
    return outbound.toUser.id;
  }
  throw new LiveLinqAllowlistError("(missing toUser)");
}

function extractSentMessageId(
  payload: {
    chat_id?: unknown;
    message?: { id?: unknown } | Array<{ id?: unknown }>;
  },
  fallback: string,
): string {
  const message = payload.message;
  if (Array.isArray(message)) {
    const first = message[0];
    if (first !== undefined && typeof first.id === "string") {
      return first.id;
    }
  } else if (message !== undefined && typeof message.id === "string") {
    return message.id;
  }
  if (typeof payload.chat_id === "string") {
    return payload.chat_id;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("live Linq: expected object");
  }
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`live Linq: missing ${key}`);
  }
  return value;
}

export type { StandardWebhookHeaders };
