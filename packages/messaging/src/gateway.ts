import {
  deliveryObservationId,
  interactionControlRef,
  presentationIntentRef,
  providerKey,
  providerMessageRef,
  providerThreadRef,
  providerUserRef,
  type AudienceDisclosure,
  type ChannelPresentationCapability,
  type DeliveryIntent,
  type DeliveryObservation,
  type DeliveryOutcome,
  type InboundInteraction,
  type ProviderKey,
} from "../../interaction/src/index.js";
import type { PresentationIntent } from "../../surface/src/presentation-intent.js";
import {
  projectPresentationCaps,
  type DegradeTarget,
} from "./capability-probes.js";
import type { ChatSdkShapedAdapter } from "./chat-sdk-shape.js";
import { lowerPresentationIntent } from "./lower-presentation-intent.js";

export class ProviderDisabledError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`provider ${provider} disabled`);
    this.name = "ProviderDisabledError";
    this.provider = provider;
  }
}

export interface MessagingGateway {
  acceptProviderEvent(
    provider: ProviderKey,
    raw: unknown,
  ): Promise<InboundInteraction>;
  deliver(intent: DeliveryIntent): Promise<DeliveryObservation>;
  capabilities(provider: ProviderKey): ChannelPresentationCapability;
  disableProvider(provider: ProviderKey): void;
  enableProvider(provider: ProviderKey): void;
  isProviderEnabled(provider: ProviderKey): boolean;
}

/** Resolved Surface IR + sealed disclosure for one DeliveryIntent. */
export interface ResolvedPresentation {
  readonly intent: PresentationIntent;
  readonly disclosedBody: string;
  readonly includesConfidentialBody: boolean;
  readonly disclosure: AudienceDisclosure;
}

export interface MessagingGatewayOptions {
  readonly providers: Readonly<Record<string, ChatSdkShapedAdapter>>;
  readonly now?: () => Date;
  readonly publicWebOrigin?: string;
  /** Required Surface IR for deliver. No prefix fallback. */
  readonly resolvePresentation: (
    intent: DeliveryIntent,
  ) => Promise<ResolvedPresentation>;
}

export function createMessagingGateway(
  options: MessagingGatewayOptions,
): MessagingGateway {
  const now = options.now ?? (() => new Date());
  const deliverySeen = new Map<string, DeliveryObservation>();
  const disabled = new Set<string>();

  return {
    disableProvider(provider) {
      disabled.add(String(provider));
    },

    enableProvider(provider) {
      disabled.delete(String(provider));
    },

    isProviderEnabled(provider) {
      return !disabled.has(String(provider));
    },

    async acceptProviderEvent(provider, raw) {
      const adapter = requireAdapter(options.providers, provider, disabled);
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
          replyToMessage:
            message.replyToMessageId !== undefined
              ? providerMessageRef(message.replyToMessageId)
              : undefined,
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
      const adapter = requireAdapter(
        options.providers,
        intent.provider,
        disabled,
      );

      const resolved = await options.resolvePresentation(intent);
      const caps = projectPresentationCaps(adapter.probes);
      let target = intent.target;
      const ephemeralProbe = adapter.probes.canEphemeral();
      if (
        ephemeralProbe.status === "unsupported" &&
        target.kind === "ephemeral_in_thread"
      ) {
        target = {
          kind: "dm",
          providerUser: providerUserRef(
            `dm_fallback:${String(target.thread)}`,
          ),
        };
      }
      const lowered = lowerPresentationIntent({
        caps,
        clientDeliveryId: intent.stableProviderDeliveryId,
        controlRefs: intent.controlRefs,
        disclosedBody: resolved.disclosedBody,
        disclosure: resolved.disclosure,
        includesConfidentialBody: resolved.includesConfidentialBody,
        intent: resolved.intent,
        probes: adapter.probes,
        publicWebOrigin: options.publicWebOrigin ?? "https://app.zoen.local",
        target,
        threadKind: adapter.threadKind,
      });
      const receipt = await adapter.send(lowered.outbound);
      const degradeMeta =
        lowered.degraded && lowered.fallback !== undefined
          ? { degradeTo: lowered.fallback }
          : undefined;
      const outcome = buildOutcome(
        receipt,
        degradeMeta,
        lowered.outbound.surfaceUrl,
      );
      const observation: DeliveryObservation = {
        id: deliveryObservationId(`do_${intent.stableProviderDeliveryId}`),
        intentId: intent.id,
        observedAt: now().toISOString(),
        outcome,
      };
      deliverySeen.set(intent.stableProviderDeliveryId, observation);
      return observation;
    },

    capabilities(provider) {
      const adapter = requireAdapter(options.providers, provider, disabled);
      return projectPresentationCaps(adapter.probes);
    },
  };
}

function buildOutcome(
  receipt: { status: string; messageId: string; reason?: string },
  degrade: { degradeTo: DegradeTarget } | undefined,
  surfaceUrl: string | undefined,
): DeliveryOutcome {
  if (receipt.status === "rejected") {
    return { kind: "rejected", reason: receipt.reason ?? "rejected" };
  }
  if (receipt.status !== "accepted") {
    return { kind: "unknown" };
  }
  if (degrade !== undefined) {
    return {
      fallback: degrade.degradeTo,
      kind: "degraded",
      providerMessage: providerMessageRef(receipt.messageId),
      surfaceUrl:
        degrade.degradeTo === "web_surface" ? surfaceUrl : undefined,
    };
  }
  return {
    kind: "accepted",
    providerMessage: providerMessageRef(receipt.messageId),
  };
}

function requireAdapter(
  providers: Readonly<Record<string, ChatSdkShapedAdapter>>,
  provider: ProviderKey,
  disabled: ReadonlySet<string>,
): ChatSdkShapedAdapter {
  const key = String(provider);
  if (disabled.has(key)) {
    throw new ProviderDisabledError(key);
  }
  const adapter = providers[key];
  if (adapter === undefined) {
    throw new Error(`unknown provider ${key}`);
  }
  if (adapter.probes === undefined) {
    throw new Error(`provider ${key} missing CapabilityProbes`);
  }
  return adapter;
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
  if (message.reactionEmoji !== undefined && message.reactionTargetMessageId) {
    return {
      emoji: message.reactionEmoji,
      kind: "reaction",
      targetMessage: providerMessageRef(message.reactionTargetMessageId),
    };
  }
  if (message.mediaRef !== undefined) {
    return {
      kind: "media",
      mediaRef: message.mediaRef,
      mime: message.mime,
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
  const key = String(provider);
  if (key === "linq" && raw !== null && typeof raw === "object") {
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
  return { kind: "dm" };
}

function buildIdempotencyKey(
  provider: ProviderKey,
  raw: unknown,
  messageId: string,
): string {
  if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    // Standard Webhooks / Linq partner envelope: webhook-id == event_id.
    if (typeof record.event_id === "string" && record.event_id.length > 0) {
      return `${String(provider)}:webhook:${record.event_id}`;
    }
    if (typeof record["webhook-id"] === "string") {
      return `${String(provider)}:webhook:${String(record["webhook-id"])}`;
    }
    if (typeof record.delivery_id === "string") {
      return `${String(provider)}:delivery:${record.delivery_id}`;
    }
  }
  return `${String(provider)}:message:${messageId}`;
}

export { presentationIntentRef, providerKey };
