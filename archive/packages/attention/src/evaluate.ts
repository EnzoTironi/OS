import { randomBytes } from "node:crypto";
import { attentionItemId } from "./brands.js";
import { assertNoTextIdentityKey, buildConditionIdentity } from "./identity.js";
import {
  decideAttentionPreferences,
  type PreferenceRow,
} from "./preferences.js";
import type { AttentionStore } from "./store.js";
import type {
  ActiveMembership,
  AttentionClassPolicy,
  AttentionEvaluateDecision,
  AttentionItem,
  AttentionTriggerEvent,
  PreferenceDecisionEvidence,
} from "./types.js";

export type EvaluateAttentionInput = {
  readonly event: AttentionTriggerEvent;
  readonly prefs: readonly PreferenceRow[];
  readonly classPolicy: AttentionClassPolicy;
  readonly membership: ActiveMembership;
  readonly store: AttentionStore;
  readonly now?: () => Date;
  readonly lastDeliveredAt?: string;
};

export function attentionDeliveryNeeded(
  decision: AttentionEvaluateDecision,
): decision is Extract<
  AttentionEvaluateDecision,
  { kind: "opened" | "reopened" | "materially_changed" }
> {
  switch (decision.kind) {
    case "opened":
    case "reopened":
    case "materially_changed":
      return true;
    case "unchanged":
    case "resolved":
    case "suppressed":
    case "denied":
      return false;
    default: {
      const _exhaustive: never = decision;
      void _exhaustive;
      return false;
    }
  }
}

export async function evaluateAttention(
  input: EvaluateAttentionInput,
): Promise<AttentionEvaluateDecision> {
  assertNoTextIdentityKey(input.event);

  if (input.membership.status !== "active") {
    return { kind: "denied", reason: "membership_inactive" };
  }
  if (
    input.membership.tenantId !== String(input.event.tenantId) ||
    input.membership.principalId !== input.event.recipientPrincipalId
  ) {
    return { kind: "denied", reason: "membership_mismatch" };
  }
  if (input.classPolicy.executionMode === "deny") {
    return { kind: "denied", reason: "class_denied" };
  }
  if (
    input.event.recipientScope === "personal" &&
    !input.classPolicy.allowPersonalWorkspace
  ) {
    return { kind: "denied", reason: "scope_mismatch" };
  }

  const now = (input.now ?? (() => new Date()))();
  const identity = buildConditionIdentity({
    tenantId: input.event.tenantId,
    definitionId: input.event.definitionId,
    definitionVersion: input.event.definitionVersion,
    subject: input.event.subject,
    semanticCutDigest: input.event.semanticCutDigest,
  });

  const existing = await input.store.getByCondition(
    identity.tenantId,
    identity.digest,
  );

  const prefDecision = decideAttentionPreferences({
    prefs: input.prefs,
    classPolicy: input.classPolicy,
    now,
    lastDeliveredAt: input.lastDeliveredAt,
  });

  if (!input.event.conditionTrue) {
    if (existing === null) {
      return { kind: "denied", reason: "condition_false_no_item" };
    }
    if (existing.lifecycle.kind === "resolved") {
      return { kind: "resolved", item: existing };
    }
    const resolved = await persist(input.store, {
      ...existing,
      lifecycle: {
        kind: "resolved",
        resolvedAt: now.toISOString(),
        reason: "condition_false",
      },
      updatedAt: now.toISOString(),
      lastPreferenceDecision: prefDecision.evidence,
    });
    return { kind: "resolved", item: resolved };
  }

  if (existing === null) {
    const opened = await persist(input.store, newItem(input.event, identity, now, prefDecision.evidence));
    if (prefDecision.kind === "hold") {
      return {
        kind: "suppressed",
        item: opened,
        reason: prefDecision.reason,
      };
    }
    return { kind: "opened", item: opened };
  }

  if (existing.lifecycle.kind === "resolved") {
    const reopened = await persist(input.store, {
      ...existing,
      lifecycle: {
        kind: "reopened",
        reopenedAt: now.toISOString(),
        priorResolvedAt: existing.lifecycle.resolvedAt,
      },
      materialFingerprint: input.event.materialFingerprint,
      proposalRef: input.event.proposalRef,
      proposalStateBasisDigest: input.event.proposalStateBasisDigest,
      sealedDisclosure: input.event.sealedDisclosure,
      updatedAt: now.toISOString(),
      lastPreferenceDecision: prefDecision.evidence,
    });
    if (prefDecision.kind === "hold") {
      return {
        kind: "suppressed",
        item: reopened,
        reason: prefDecision.reason,
      };
    }
    return { kind: "reopened", item: reopened };
  }

  if (
    String(existing.materialFingerprint) ===
    String(input.event.materialFingerprint)
  ) {
    const unchanged = await persist(input.store, {
      ...existing,
      updatedAt: now.toISOString(),
      lastPreferenceDecision: prefDecision.evidence,
    });
    return { kind: "unchanged", item: unchanged };
  }

  const changed = await persist(input.store, {
    ...existing,
    lifecycle: {
      kind: "materially_changed",
      at: now.toISOString(),
      previousFingerprint: existing.materialFingerprint,
      currentFingerprint: input.event.materialFingerprint,
    },
    materialFingerprint: input.event.materialFingerprint,
    proposalRef: input.event.proposalRef,
    proposalStateBasisDigest: input.event.proposalStateBasisDigest,
    sealedDisclosure: input.event.sealedDisclosure,
    updatedAt: now.toISOString(),
    lastPreferenceDecision: prefDecision.evidence,
  });
  if (prefDecision.kind === "hold") {
    return {
      kind: "suppressed",
      item: changed,
      reason: prefDecision.reason,
    };
  }
  return { kind: "materially_changed", item: changed };
}

function newItem(
  event: AttentionTriggerEvent,
  identity: AttentionItem["conditionIdentity"],
  now: Date,
  evidence: PreferenceDecisionEvidence,
): AttentionItem {
  const iso = now.toISOString();
  return {
    id: attentionItemId(`attn.${randomBytes(12).toString("hex")}`),
    conditionIdentity: identity,
    lifecycle: { kind: "open", openedAt: iso },
    materialFingerprint: event.materialFingerprint,
    recipientPrincipalId: event.recipientPrincipalId,
    recipientScope: event.recipientScope,
    classId: event.classId,
    proposalRef: event.proposalRef,
    proposalStateBasisDigest: event.proposalStateBasisDigest,
    sealedDisclosure: event.sealedDisclosure,
    deliveryGeneration: 0,
    lastPreferenceDecision: evidence,
    createdAt: iso,
    updatedAt: iso,
  };
}

async function persist(
  store: AttentionStore,
  item: AttentionItem,
): Promise<AttentionItem> {
  const result = await store.upsertByCondition({ item });
  return result.item;
}
