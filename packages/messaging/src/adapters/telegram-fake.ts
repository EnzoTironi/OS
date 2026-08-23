import type {
  ChatSdkDeliveryReceipt,
  ChatSdkMessage,
  ChatSdkOutbound,
  ChatSdkShapedAdapter,
} from "../chat-sdk-shape.js";

/**
 * Telegram-like fake: chat id + optional topic, inline-button callback_data,
 * update_id-like dedupe. Structurally different from linq-fake.
 */
export function createFakeTelegramProvider(): ChatSdkShapedAdapter {
  let seq = 0;
  const delivered = new Map<string, ChatSdkDeliveryReceipt>();

  return {
    providerId: "telegram",

    parseInbound(raw: unknown): ChatSdkMessage {
      const body = asRecord(raw);
      const updateId = requireString(body, "update_id");
      if (body.callback_query !== undefined) {
        const query = asRecord(body.callback_query);
        const from = asRecord(query.from);
        const origin = asRecord(query.message);
        const chat = asRecord(origin.chat);
        return {
          callbackData: requireString(query, "data"),
          from: { id: requireString(from, "id") },
          id:
            typeof origin.message_id === "number" ||
            typeof origin.message_id === "string"
              ? String(origin.message_id)
              : `tg_cb_${updateId}`,
          receivedAt: new Date().toISOString(),
          thread: { id: requireString(chat, "id"), kind: "chat" },
        };
      }
      const message = asRecord(body.message);
      const from = asRecord(message.from);
      const chat = asRecord(message.chat);
      const messageId =
        typeof message.message_id === "number" ||
        typeof message.message_id === "string"
          ? String(message.message_id)
          : `tg_upd_${updateId}`;
      return {
        from: { id: requireString(from, "id") },
        id: messageId,
        receivedAt:
          typeof message.date === "number"
            ? new Date(message.date * 1000).toISOString()
            : new Date().toISOString(),
        text: typeof message.text === "string" ? message.text : undefined,
        thread: {
          id: requireString(chat, "id"),
          kind: "chat",
        },
      };
    },

    async send(outbound: ChatSdkOutbound): Promise<ChatSdkDeliveryReceipt> {
      const existing = delivered.get(outbound.clientDeliveryId);
      if (existing !== undefined) {
        return existing;
      }
      seq += 1;
      const receipt: ChatSdkDeliveryReceipt = {
        messageId: `tg_out_${seq}`,
        status: "accepted",
      };
      delivered.set(outbound.clientDeliveryId, receipt);
      return receipt;
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("telegram fake: expected object");
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
    throw new Error(`telegram fake: missing ${key}`);
  }
  return value;
}
