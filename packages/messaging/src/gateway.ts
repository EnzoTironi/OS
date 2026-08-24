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
  type CapabilityId,
  type DegradeTarget,
} from "./capability-probes.js";
import type { ChatSdkOutbound, ChatSdkShapedAdapter } from "./chat-sdk-shape.js";
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
  /**
   * When set and returns a document, deliver lowers via lowerPresentationIntent.
   * Legacy prefix heuristics remain only for unresolved refs (existing callers).
   */
  readonly resolvePresentation?: (
    intent: DeliveryIntent,
  ) => Promise<ResolvedPresentation | undefined>;
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

      const resolved =
        options.resolvePresentation !== undefined
          ? await options.resolvePresentation(intent)
          : undefined;

      if (resolved !== undefined) {
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
          provider: intent.provider,
          publicWebOrigin: options.publicWebOrigin ?? "https://app.zoen.local",
          target,
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
      }

      const needs = presentationNeeds(intent);
      const degrade = firstUnsupported(adapter, needs);
      const text = `presentation:${String(intent.presentation)}`;
      const surfaceUrl =
        degrade?.degradeTo === "web_surface"
          ? surfaceUrlFor(intent)
          : undefined;

      let target = intent.target;
      if (
        degrade?.capability === "ephemeral" &&
        intent.target.kind === "ephemeral_in_thread"
      ) {
        target = {
          kind: "dm",
          providerUser: providerUserRef(
            `dm_fallback:${String(intent.target.thread)}`,
          ),
        };
      }

      const attachButtons =
        needs.buttons &&
        adapter.probes.canNativeButton().status === "native" &&
        degrade === undefined;
      const buttons = attachButtons
        ? intent.controlRefs.map((ref, index) => ({
            callbackData: String(ref),
            label: `action_${index + 1}`,
          }))
        : undefined;

      const outbound: ChatSdkOutbound = {
        buttons,
        card:
          needs.card && adapter.probes.canNativeCard().status === "native"
            ? true
            : undefined,
        clientDeliveryId: intent.stableProviderDeliveryId,
        ephemeral: target.kind === "ephemeral_in_thread",
        experience:
          projectPresentationCaps(adapter.probes).extensions.imessageExperience,
        surfaceUrl,
        text:
          surfaceUrl !== undefined
            ? `${text}\nsurface:${surfaceUrl}`
            : text,
        thread:
          target.kind === "dm"
            ? undefined
            : {
                id: String(target.thread),
                kind: String(intent.provider) === "linq" ? "guid" : "chat",
              },
        toUser:
          target.kind === "dm"
            ? { id: String(target.providerUser) }
            : undefined,
        typing: needs.typing || undefined,
      };

      const receipt = await adapter.send(outbound);
      const outcome = buildOutcome(receipt, degrade, surfaceUrl);
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

function presentationNeeds(intent: DeliveryIntent): {
  buttons: boolean;
  card: boolean;
  typing: boolean;
  ephemeral: boolean;
} {
  const presentation = String(intent.presentation);
  return {
    buttons: intent.controlRefs.length > 0,
    card:
      presentation.startsWith("card:") ||
      presentation.startsWith("rich:") ||
      (intent.controlRefs.length > 0 && presentation.startsWith("card:")),
    ephemeral: intent.target.kind === "ephemeral_in_thread",
    typing: presentation.startsWith("typing:"),
  };
}

function firstUnsupported(
  adapter: ChatSdkShapedAdapter,
  needs: ReturnType<typeof presentationNeeds>,
): { capability: CapabilityId; degradeTo: DegradeTarget } | undefined {
  if (needs.card) {
    const card = adapter.probes.probe("native_card");
    if (card.status === "unsupported") {
      return { capability: "native_card", degradeTo: card.degradeTo };
    }
  }
  if (needs.typing) {
    const typing = adapter.probes.probe("typing");
    if (typing.status === "unsupported") {
      return { capability: "typing", degradeTo: typing.degradeTo };
    }
  }
  if (needs.ephemeral) {
    const ephemeral = adapter.probes.probe("ephemeral");
    if (ephemeral.status === "unsupported") {
      return { capability: "ephemeral", degradeTo: ephemeral.degradeTo };
    }
  }
  if (needs.buttons) {
    const buttons = adapter.probes.probe("native_button");
    if (buttons.status === "unsupported") {
      return { capability: "native_button", degradeTo: buttons.degradeTo };
    }
  }
  return undefined;
}

function surfaceUrlFor(intent: DeliveryIntent): string {
  return `https://surface.zoen.local/p/${String(intent.presentation)}`;
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
  if (key === "telegram" && raw !== null && typeof raw === "object") {
    const message = (raw as { message?: { chat?: { type?: string } } }).message;
    if (message?.chat?.type === "group" || message?.chat?.type === "supergroup") {
      return { kind: "group" };
    }
  }
  if (key === "whatsapp_business" && raw !== null && typeof raw === "object") {
    const groupId = extractWabaGroupId(raw);
    if (groupId !== undefined) {
      return { kind: "group" };
    }
  }
  return { kind: "dm" };
}

function extractWabaGroupId(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const root = raw as Record<string, unknown>;
  const entry = Array.isArray(root.entry) ? root.entry[0] : undefined;
  if (entry === null || typeof entry !== "object") {
    return undefined;
  }
  const changes = (entry as { changes?: unknown }).changes;
  const change = Array.isArray(changes) ? changes[0] : undefined;
  if (change === null || typeof change !== "object") {
    return undefined;
  }
  const value = (change as { value?: unknown }).value;
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const groupId = (value as { group_id?: unknown }).group_id;
  return typeof groupId === "string" ? groupId : undefined;
}

function buildIdempotencyKey(
  provider: ProviderKey,
  raw: unknown,
  messageId: string,
): string {
  if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (
      typeof record.update_id === "number" ||
      typeof record.update_id === "string"
    ) {
      return `${String(provider)}:update:${String(record.update_id)}`;
    }
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
    const wamid = extractWamid(record);
    if (wamid !== undefined) {
      return `${String(provider)}:wamid:${wamid}`;
    }
  }
  return `${String(provider)}:message:${messageId}`;
}

function extractWamid(record: Record<string, unknown>): string | undefined {
  if (record.object !== "whatsapp_business_account") {
    return undefined;
  }
  const entry = Array.isArray(record.entry) ? record.entry[0] : undefined;
  if (entry === null || typeof entry !== "object") {
    return undefined;
  }
  const changes = (entry as { changes?: unknown }).changes;
  const change = Array.isArray(changes) ? changes[0] : undefined;
  if (change === null || typeof change !== "object") {
    return undefined;
  }
  const value = (change as { value?: { messages?: unknown; statuses?: unknown } })
    .value;
  if (value === undefined) {
    return undefined;
  }
  const messages = value.messages;
  if (Array.isArray(messages) && messages[0] !== undefined) {
    const id = (messages[0] as { id?: unknown }).id;
    if (typeof id === "string") {
      return id;
    }
  }
  const statuses = value.statuses;
  if (Array.isArray(statuses) && statuses[0] !== undefined) {
    const id = (statuses[0] as { id?: unknown }).id;
    if (typeof id === "string") {
      return id;
    }
  }
  return undefined;
}

export { presentationIntentRef, providerKey };
