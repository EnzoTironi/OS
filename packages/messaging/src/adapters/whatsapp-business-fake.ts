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

const WHATSAPP_BUSINESS_TABLE = {
  dm: NATIVE,
  ephemeral: { status: "unsupported", degradeTo: "dm" },
  group: NATIVE,
  image_file: NATIVE,
  native_button: NATIVE,
  native_card: { status: "unsupported", degradeTo: "web_surface" },
  native_link: NATIVE,
  proactive_outbound: NATIVE,
  reactions: NATIVE,
  read_receipts: { status: "unsupported", degradeTo: "text" },
  reply_thread: NATIVE,
  text: NATIVE,
  typing: { status: "unsupported", degradeTo: "text" },
  voice_audio: NATIVE,
} as const;

/** WhatsApp Business Cloud API: object/entry/changes/value + wamid. */
export function createFakeWhatsAppBusinessProvider(): ChatSdkShapedAdapter {
  let seq = 0;
  const delivered = new Map<string, ChatSdkDeliveryReceipt>();
  const probes: CapabilityProbes = createCapabilityProbes(
    "whatsapp_business",
    WHATSAPP_BUSINESS_TABLE,
  );

  return {
    providerId: "whatsapp_business",
    probes,

    parseInbound(raw: unknown): ChatSdkMessage {
      const root = asRecord(raw);
      if (root.object !== "whatsapp_business_account") {
        throw new Error("whatsapp business fake: expected Cloud API envelope");
      }
      const entry = firstArrayObject(root, "entry");
      const change = firstArrayObject(entry, "changes");
      const value = asRecord(change.value);
      const metadata = asRecord(value.metadata ?? {});
      const phoneNumberId =
        typeof metadata.phone_number_id === "string"
          ? metadata.phone_number_id
          : "waba_phone_default";

      if (Array.isArray(value.messages) && value.messages.length > 0) {
        const message = asRecord(value.messages[0]);
        const wamid = requireString(message, "id");
        const from =
          typeof message.from === "string" && message.from.length > 0
            ? message.from
            : typeof message.wa_id === "string" && message.wa_id.length > 0
              ? message.wa_id
              : (() => {
                  throw new Error("whatsapp business fake: missing from/wa_id");
                })();
        const interactive = message.interactive;
        if (interactive !== undefined) {
          const inter = asRecord(interactive);
          const buttonReply =
            inter.button_reply !== undefined
              ? asRecord(inter.button_reply)
              : inter.list_reply !== undefined
                ? asRecord(inter.list_reply)
                : undefined;
          if (buttonReply !== undefined) {
            return {
              callbackData: requireString(buttonReply, "id"),
              from: { id: from },
              id: wamid,
              receivedAt: receivedAtOf(message),
              thread: { id: `${phoneNumberId}:${from}`, kind: "chat" },
            };
          }
        }
        const textObj =
          message.text !== undefined ? asRecord(message.text) : undefined;
        const context =
          message.context !== undefined ? asRecord(message.context) : undefined;
        return {
          from: { id: from },
          id: wamid,
          receivedAt: receivedAtOf(message),
          replyToMessageId:
            context !== undefined && typeof context.id === "string"
              ? context.id
              : undefined,
          text:
            textObj !== undefined && typeof textObj.body === "string"
              ? textObj.body
              : undefined,
          thread: {
            id:
              typeof value.group_id === "string"
                ? String(value.group_id)
                : `${phoneNumberId}:${from}`,
            kind: "chat",
          },
        };
      }

      if (Array.isArray(value.statuses) && value.statuses.length > 0) {
        const status = asRecord(value.statuses[0]);
        const wamid = requireString(status, "id");
        const recipient =
          typeof status.recipient_id === "string"
            ? status.recipient_id
            : "unknown";
        return {
          from: { id: recipient },
          id: wamid,
          receivedAt: receivedAtOf(status),
          text: undefined,
          thread: { id: `${phoneNumberId}:${recipient}`, kind: "chat" },
        };
      }

      throw new Error("whatsapp business fake: no messages or statuses");
    },

    async send(outbound: ChatSdkOutbound): Promise<ChatSdkDeliveryReceipt> {
      const existing = delivered.get(outbound.clientDeliveryId);
      if (existing !== undefined) {
        return existing;
      }
      seq += 1;
      const receipt: ChatSdkDeliveryReceipt = {
        messageId: `wamid.out_${seq}`,
        status: "accepted",
        typingRecorded: outbound.typing === true,
      };
      delivered.set(outbound.clientDeliveryId, receipt);
      return receipt;
    },

    simulateRestart() {
      delivered.clear();
      seq = 0;
    },
  };
}

function receivedAtOf(record: Record<string, unknown>): string {
  if (typeof record.timestamp === "string" || typeof record.timestamp === "number") {
    const n = Number(record.timestamp);
    if (Number.isFinite(n)) {
      return new Date(n * 1000).toISOString();
    }
  }
  return new Date().toISOString();
}

function firstArrayObject(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`whatsapp business fake: missing ${key}[0]`);
  }
  return asRecord(value[0]);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("whatsapp business fake: expected object");
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
    throw new Error(`whatsapp business fake: missing ${key}`);
  }
  return value;
}
