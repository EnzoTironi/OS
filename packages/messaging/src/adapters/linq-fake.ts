import type {
  ChatSdkDeliveryReceipt,
  ChatSdkMessage,
  ChatSdkOutbound,
  ChatSdkShapedAdapter,
} from "../chat-sdk-shape.js";

/**
 * Linq/iMessage-like fake: chat GUID + participant roster, experience action
 * token carrier, webhook delivery-id-like dedupe. Structurally different from
 * telegram-fake.
 */
export function createFakeLinqProvider(): ChatSdkShapedAdapter {
  let seq = 0;
  const delivered = new Map<string, ChatSdkDeliveryReceipt>();

  return {
    providerId: "linq",

    parseInbound(raw: unknown): ChatSdkMessage {
      const body = asRecord(raw);
      const deliveryId = requireString(body, "delivery_id");
      const chatGuid = requireString(body, "chat_guid");
      const sender = requireString(body, "sender_handle");
      const experienceToken =
        typeof body.experience_action_token === "string"
          ? body.experience_action_token
          : undefined;
      return {
        experienceToken,
        from: { id: sender },
        id: typeof body.message_id === "string" ? body.message_id : deliveryId,
        receivedAt:
          typeof body.received_at === "string"
            ? body.received_at
            : new Date().toISOString(),
        text: typeof body.text === "string" ? body.text : undefined,
        thread: {
          id: chatGuid,
          kind: "guid",
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
        messageId: `linq_out_${seq}`,
        status: "accepted",
      };
      delivered.set(outbound.clientDeliveryId, receipt);
      return receipt;
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("linq fake: expected object");
  }
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`linq fake: missing ${key}`);
  }
  return value;
}
