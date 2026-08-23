import {
  deliveryObservationId,
  interactionControlRef,
  presentationIntentRef,
  providerKey,
  providerMessageRef,
  providerThreadRef,
  providerUserRef,
  type ChannelPresentationCapability,
  type DeliveryIntent,
  type DeliveryObservation,
  type InboundInteraction,
  type ProviderKey,
} from "../../interaction/src/index.js";
import type { ChatSdkShapedAdapter } from "./chat-sdk-shape.js";

export interface MessagingGateway {
  acceptProviderEvent(
    provider: ProviderKey,
    raw: unknown,
  ): Promise<InboundInteraction>;
  deliver(intent: DeliveryIntent): Promise<DeliveryObservation>;
  capabilities(provider: ProviderKey): ChannelPresentationCapability;
}

export interface MessagingGatewayOptions {
  readonly providers: Readonly<Record<string, ChatSdkShapedAdapter>>;
  readonly now?: () => Date;
}

export function createMessagingGateway(
  options: MessagingGatewayOptions,
): MessagingGateway {
  const now = options.now ?? (() => new Date());
  const deliverySeen = new Map<string, DeliveryObservation>();

  return {
    async acceptProviderEvent(provider, raw) {
      const adapter = requireAdapter(options.providers, provider);
      const message = adapter.parseInbound(raw);
      const body = mapBody(message);
      const audience = mapAudience(provider, raw);
      const idempotencyKey = buildIdempotencyKey(provider, raw, message.id);
      return {
        audienceObservation: audience,
        body,
        channel: {
          message: providerMessageRef(message.id),
          provider,
          providerUser: providerUserRef(message.from.id),
          receivedAt: message.receivedAt || now().toISOString(),
          thread: providerThreadRef(message.thread.id),
        },
        idempotencyKey,
      };
    },

    async deliver(intent) {
      const existing = deliverySeen.get(intent.stableProviderDeliveryId);
      if (existing !== undefined) {
        return existing;
      }
      const adapter = requireAdapter(options.providers, intent.provider);
      const caps = capabilitiesFor(intent.provider);
      const text = `presentation:${String(intent.presentation)}`;
      const buttons =
        caps.buttons && intent.controlRefs.length > 0
          ? intent.controlRefs.map((ref, index) => ({
              callbackData: String(ref),
              label: `action_${index + 1}`,
            }))
          : undefined;
      const receipt = await adapter.send({
        buttons,
        clientDeliveryId: intent.stableProviderDeliveryId,
        experience: caps.extensions.imessageExperience,
        text,
        thread:
          intent.target.kind === "dm"
            ? undefined
            : {
                id: String(intent.target.thread),
                kind: String(intent.provider) === "linq" ? "guid" : "chat",
              },
        toUser:
          intent.target.kind === "dm"
            ? { id: String(intent.target.providerUser) }
            : undefined,
      });
      const observation: DeliveryObservation = {
        id: deliveryObservationId(
          `do_${intent.stableProviderDeliveryId}`,
        ),
        intentId: intent.id,
        observedAt: now().toISOString(),
        outcome:
          receipt.status === "accepted"
            ? {
                kind: "accepted",
                providerMessage: providerMessageRef(receipt.messageId),
              }
            : receipt.status === "rejected"
              ? { kind: "rejected", reason: receipt.reason ?? "rejected" }
              : { kind: "unknown" },
      };
      deliverySeen.set(intent.stableProviderDeliveryId, observation);
      return observation;
    },

    capabilities(provider) {
      return capabilitiesFor(provider);
    },
  };
}

function requireAdapter(
  providers: Readonly<Record<string, ChatSdkShapedAdapter>>,
  provider: ProviderKey,
): ChatSdkShapedAdapter {
  const adapter = providers[String(provider)];
  if (adapter === undefined) {
    throw new Error(`unknown provider ${String(provider)}`);
  }
  return adapter;
}

function capabilitiesFor(provider: ProviderKey): ChannelPresentationCapability {
  const key = String(provider);
  if (key === "telegram") {
    return {
      buttons: true,
      cards: true,
      ephemeral: false,
      extensions: { imessageApp: false, imessageExperience: false },
      files: true,
      linkButtons: true,
      provider: providerKey("telegram"),
      reactions: true,
      text: true,
      typing: true,
    };
  }
  if (key === "linq") {
    return {
      buttons: true,
      cards: true,
      ephemeral: true,
      extensions: { imessageApp: false, imessageExperience: true },
      files: true,
      linkButtons: true,
      provider: providerKey("linq"),
      reactions: true,
      text: true,
      typing: false,
    };
  }
  throw new Error(`unknown provider capabilities: ${key}`);
}

function mapBody(
  message: ReturnType<ChatSdkShapedAdapter["parseInbound"]>,
): InboundInteraction["body"] {
  if (message.callbackData !== undefined) {
    return {
      controlRef: interactionControlRef(message.callbackData),
      kind: "control_click",
    };
  }
  if (message.experienceToken !== undefined) {
    return {
      controlRef: interactionControlRef(message.experienceToken),
      kind: "control_click",
    };
  }
  if (message.text !== undefined) {
    return { kind: "text", text: message.text };
  }
  return { kind: "unsupported", reason: "empty payload" };
}

function mapAudience(
  provider: ProviderKey,
  raw: unknown,
): InboundInteraction["audienceObservation"] {
  if (String(provider) === "linq" && raw !== null && typeof raw === "object") {
    const participants = (raw as { participants?: unknown }).participants;
    if (Array.isArray(participants) && participants.length > 1) {
      return {
        kind: "group",
        observedParticipantCount: participants.length,
        observedParticipants: participants.map((value) =>
          providerUserRef(String(value)),
        ),
      };
    }
  }
  if (
    String(provider) === "telegram" &&
    raw !== null &&
    typeof raw === "object"
  ) {
    const message = (raw as { message?: { chat?: { type?: string } } }).message;
    if (message?.chat?.type === "group" || message?.chat?.type === "supergroup") {
      return { kind: "group" };
    }
  }
  return { kind: "dm" };
}

function buildIdempotencyKey(
  provider: ProviderKey,
  raw: unknown,
  messageId: string,
): string {
  if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (typeof record.update_id === "number" || typeof record.update_id === "string") {
      return `${String(provider)}:update:${String(record.update_id)}`;
    }
    if (typeof record.delivery_id === "string") {
      return `${String(provider)}:delivery:${record.delivery_id}`;
    }
  }
  return `${String(provider)}:message:${messageId}`;
}

export { presentationIntentRef, providerKey };
