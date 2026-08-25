import {
  deliveryIntentId,
  interactionId,
  presentationIntentRef,
  providerKey,
  providerUserRef,
  type DeliveryIntent,
  type InteractionControlRef,
} from "../../speaker/src/index.js";
import type { AttentionStore } from "./store.js";
import type {
  ActiveMembership,
  AttentionItem,
  PlanAttentionDeliveryInput,
  PlanAttentionDeliveryResult,
} from "./types.js";

export type DeliverAttentionInput = {
  readonly store: AttentionStore;
  readonly item: AttentionItem;
  readonly membership: ActiveMembership;
  readonly plan: PlanAttentionDeliveryResult;
  readonly observationId: string;
  readonly observedAt: string;
  readonly outcomeKind: "accepted" | "unknown" | "rejected" | "degraded";
  readonly provider: string;
};

/**
 * Plan delivery against sealed AudienceDisclosure.
 * Fallback may only target disclosure-safe channels.
 */
export function planAttentionDelivery(
  input: PlanAttentionDeliveryInput,
): PlanAttentionDeliveryResult {
  if (input.membership.status !== "active") {
    return { kind: "rejected", reason: "membership_inactive" };
  }
  if (
    input.membership.tenantId !==
      String(input.item.conditionIdentity.tenantId) ||
    input.membership.principalId !== input.item.recipientPrincipalId
  ) {
    return { kind: "rejected", reason: "membership_mismatch" };
  }

  const disclosure = input.disclosure;
  if (disclosure.kind === "deny") {
    return { kind: "rejected", reason: `disclosure_deny:${disclosure.reason}` };
  }
  if (disclosure.kind === "require_step_up") {
    // Sensitive body held; web_surface / link only when preferred.
    const channel = pickSafeChannel(input, ["web_surface", "link"]);
    if (channel === undefined) {
      return { kind: "rejected", reason: "no_disclosure_safe_channel" };
    }
    return {
      kind: "intent",
      channel,
      intent: buildIntent(input, channel),
    };
  }

  if (disclosure.kind === "redirect_private") {
    if (disclosure.target.kind === "dm") {
      return {
        kind: "intent",
        channel: "dm",
        intent: buildIntent(input, "dm"),
      };
    }
    return {
      kind: "intent",
      channel: "dm",
      intent: buildIntent(input, "dm"),
    };
  }

  // deliver_full | deliver_redacted — preferred then disclosure-safe fallback.
  const channel = pickSafeChannel(input, [
    ...input.preferredChannels,
    ...input.fallbackChannels,
  ]);
  if (channel === undefined) {
    return { kind: "rejected", reason: "no_disclosure_safe_channel" };
  }
  if (!channelSatisfiesDisclosure(channel, disclosure.kind)) {
    return { kind: "rejected", reason: "fallback_ignores_audience" };
  }
  return {
    kind: "intent",
    channel,
    intent: buildIntent(input, channel),
  };
}

export async function recordAttentionDelivery(
  input: DeliverAttentionInput,
): Promise<AttentionItem> {
  if (input.plan.kind !== "intent") {
    throw new Error(`cannot record delivery: ${input.plan.reason}`);
  }
  const nextGeneration = input.item.deliveryGeneration + 1;
  await input.store.recordDeliveryEvidence({
    tenantId: input.item.conditionIdentity.tenantId,
    attentionItemId: input.item.id,
    deliveryGeneration: nextGeneration,
    deliveryIntentId: String(input.plan.intent.id),
    deliveryObservationId: input.observationId,
    provider: input.provider,
    outcomeKind: input.outcomeKind,
    observedAt: input.observedAt,
  });
  const updated: AttentionItem = {
    ...input.item,
    deliveryGeneration: nextGeneration,
    lastDeliveryObservationId: input.observationId,
    updatedAt: input.observedAt,
  };
  const result = await input.store.upsertByCondition({ item: updated });
  return result.item;
}

export function stableAttentionDeliveryId(
  item: AttentionItem,
  generation = item.deliveryGeneration + 1,
): string {
  return `attn:${String(item.id)}:${generation}`;
}

function pickSafeChannel(
  input: PlanAttentionDeliveryInput,
  ordered: readonly string[],
): "dm" | "web_surface" | "link" | undefined {
  for (const candidate of ordered) {
    if (
      candidate === "dm" ||
      candidate === "web_surface" ||
      candidate === "link"
    ) {
      if (channelSatisfiesDisclosure(candidate, input.disclosure.kind)) {
        return candidate;
      }
    }
    // same_thread is never a fallback for sealed DM disclosure.
    if (candidate === "same_thread") {
      if (
        input.disclosure.kind === "deliver_full" ||
        input.disclosure.kind === "deliver_redacted"
      ) {
        // Thread is not audience authority; only allow when disclosure already
        // accepted the current audience observation as full/redacted.
        continue;
      }
    }
  }
  return undefined;
}

function channelSatisfiesDisclosure(
  channel: "dm" | "web_surface" | "link",
  disclosureKind: PlanAttentionDeliveryInput["disclosure"]["kind"],
): boolean {
  if (disclosureKind === "deny") {
    return false;
  }
  if (disclosureKind === "require_step_up") {
    return channel === "web_surface" || channel === "link";
  }
  if (disclosureKind === "redirect_private") {
    return channel === "dm" || channel === "web_surface";
  }
  return true;
}

function buildIntent(
  input: PlanAttentionDeliveryInput,
  channel: "dm" | "web_surface" | "link",
): DeliveryIntent {
  const generation = input.item.deliveryGeneration + 1;
  const target =
    channel === "dm"
      ? {
          kind: "dm" as const,
          providerUser: providerUserRef(input.providerUser),
        }
      : {
          kind: "dm" as const,
          providerUser: providerUserRef(input.providerUser),
        };
  return {
    id: deliveryIntentId(`di_attn_${String(input.item.id)}_${generation}`),
    recordId: interactionId(`ir_attn_${String(input.item.id)}`),
    provider: providerKey(input.provider),
    target,
    presentation: presentationIntentRef(input.presentation),
    controlRefs: input.controlRefs as readonly InteractionControlRef[],
    stableProviderDeliveryId: stableAttentionDeliveryId(input.item, generation),
  };
}
