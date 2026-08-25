import type {
  AudienceDisclosure,
  DeliveryIntent,
  DeliveryObservation,
} from "../../speaker/src/index.js";
import type {
  AttentionDefinitionId,
  AttentionDefinitionVersion,
  AttentionItemId,
  ConditionIdentityDigest,
  MaterialFingerprint,
  SemanticCutDigest,
  TenantId,
} from "./brands.js";

export type AttentionSubject =
  | { readonly kind: "resource"; readonly resourceId: string }
  | { readonly kind: "entity"; readonly entityId: string }
  | { readonly kind: "operation"; readonly operationId: string };

/**
 * Stable condition identity. Generated notification text is NOT a field.
 * digest = sha256(JCS({ tenantId, definitionId, definitionVersion, subject, semanticCutDigest }))
 */
export type ConditionIdentity = {
  readonly tenantId: TenantId;
  readonly definitionId: AttentionDefinitionId;
  readonly definitionVersion: AttentionDefinitionVersion;
  readonly subject: AttentionSubject;
  readonly semanticCutDigest: SemanticCutDigest;
  readonly digest: ConditionIdentityDigest;
};

export type AttentionLifecycle =
  | { readonly kind: "open"; readonly openedAt: string }
  | {
      readonly kind: "materially_changed";
      readonly at: string;
      readonly previousFingerprint: MaterialFingerprint;
      readonly currentFingerprint: MaterialFingerprint;
    }
  | {
      readonly kind: "resolved";
      readonly resolvedAt: string;
      readonly reason: string;
    }
  | {
      readonly kind: "reopened";
      readonly reopenedAt: string;
      readonly priorResolvedAt: string;
    };

export type PreferenceDecisionEvidence = {
  readonly quietHoursApplied: boolean;
  readonly cooldownApplied: boolean;
  readonly digestHeld: boolean;
  readonly muted: boolean;
  readonly snoozed: boolean;
  readonly escalationUsed: boolean;
  readonly criticalBypassMute: boolean;
  readonly decidedAt: string;
  readonly preferenceIds: readonly string[];
};

export type AttentionItem = {
  readonly id: AttentionItemId;
  readonly conditionIdentity: ConditionIdentity;
  readonly lifecycle: AttentionLifecycle;
  readonly materialFingerprint: MaterialFingerprint;
  readonly recipientPrincipalId: string;
  readonly recipientScope: "enterprise" | "personal";
  readonly classId: string;
  readonly proposalRef?: string;
  readonly proposalStateBasisDigest?: string;
  readonly sealedDisclosure: AudienceDisclosure;
  readonly deliveryGeneration: number;
  readonly lastPreferenceDecision: PreferenceDecisionEvidence;
  readonly lastDeliveryObservationId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AttentionClassPolicy = {
  readonly classId: string;
  readonly critical: boolean;
  readonly executionMode: "notify_only" | "approval_required" | "auto" | "deny";
  readonly minDisclosure: AudienceDisclosure["kind"];
  readonly allowPersonalWorkspace: boolean;
};

/** Local sealed attention delivery prefs. Harness PreferencePayload stays AD-06. */
export type AttentionDeliveryPreference = {
  readonly type: "attention_delivery";
  readonly mode: "immediate" | "digest";
  readonly cooldownMinutes: number;
  readonly maxPerDay?: number;
  readonly preferredChannels: ReadonlyArray<"dm" | "same_thread" | "web_surface">;
  readonly fallbackChannels: ReadonlyArray<"dm" | "web_surface" | "link">;
  readonly mute: boolean;
  readonly snoozeUntil?: string;
  readonly escalationPrincipalIds: readonly string[];
  readonly redactSensitiveBody: boolean;
};

export type AttentionPriorityPreference = {
  readonly type: "attention_priority";
  readonly classId: string;
  readonly priority: "low" | "normal" | "high";
};

export type AttentionTriggerEvent = {
  readonly tenantId: TenantId;
  readonly definitionId: AttentionDefinitionId;
  readonly definitionVersion: AttentionDefinitionVersion;
  readonly subject: AttentionSubject;
  readonly semanticCutDigest: SemanticCutDigest;
  readonly materialFingerprint: MaterialFingerprint;
  readonly observedAt: string;
  readonly conditionTrue: boolean;
  readonly recipientPrincipalId: string;
  readonly recipientScope: "enterprise" | "personal";
  readonly classId: string;
  readonly sealedDisclosure: AudienceDisclosure;
  readonly proposalRef?: string;
  readonly proposalStateBasisDigest?: string;
  /** Rendered copy — NEVER part of ConditionIdentity. */
  readonly renderedCopy?: string;
};

export type AttentionEvaluateDecision =
  | { readonly kind: "opened"; readonly item: AttentionItem }
  | { readonly kind: "unchanged"; readonly item: AttentionItem }
  | { readonly kind: "materially_changed"; readonly item: AttentionItem }
  | { readonly kind: "resolved"; readonly item: AttentionItem }
  | { readonly kind: "reopened"; readonly item: AttentionItem }
  | {
      readonly kind: "suppressed";
      readonly item: AttentionItem;
      readonly reason: string;
    }
  | { readonly kind: "denied"; readonly reason: string };

export type AttentionDeliveryEvidenceRow = {
  readonly tenantId: TenantId;
  readonly attentionItemId: AttentionItemId;
  readonly deliveryGeneration: number;
  readonly deliveryIntentId: string;
  readonly deliveryObservationId: string;
  readonly provider: string;
  readonly outcomeKind: DeliveryObservation["outcome"]["kind"];
  readonly observedAt: string;
};

export type UpsertAttentionInput = {
  readonly item: AttentionItem;
};

export type AttentionUpsertResult = {
  readonly item: AttentionItem;
  readonly created: boolean;
};

export type ActiveMembership = {
  readonly accountId: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly status: "active" | "revoked" | "left" | "inactive";
};

export type PlanAttentionDeliveryInput = {
  readonly item: AttentionItem;
  readonly membership: ActiveMembership;
  readonly disclosure: AudienceDisclosure;
  readonly preferredChannels: AttentionDeliveryPreference["preferredChannels"];
  readonly fallbackChannels: AttentionDeliveryPreference["fallbackChannels"];
  readonly provider: string;
  readonly providerUser: string;
  readonly presentation: string;
  readonly controlRefs: readonly string[];
};

export type PlanAttentionDeliveryResult =
  | {
      readonly kind: "intent";
      readonly intent: DeliveryIntent;
      readonly channel: "dm" | "web_surface" | "link";
    }
  | { readonly kind: "rejected"; readonly reason: string };

export type RevalidateResult =
  | { readonly kind: "ready"; readonly proposalId: string }
  | { readonly kind: "stale"; readonly proposalId: string; readonly currentDigest: string }
  | { readonly kind: "replan"; readonly proposalId: string }
  | { readonly kind: "deny"; readonly reason: string };

export type CommitResult =
  | { readonly kind: "committed"; readonly operationId: string; readonly receiptId: string }
  | { readonly kind: "stale"; readonly currentDigest: string }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "duplicate"; readonly operationId: string };

/** Ordinary Action path. Scheduler must not call effect adapters. */
export interface ActionPath {
  revalidateAndContinue(input: {
    readonly proposalId: string;
    readonly expectedStateBasisDigest?: string;
  }): Promise<RevalidateResult>;
  commit(input: { readonly proposalId: string; readonly operationId: string }): Promise<CommitResult>;
}

export type AttentionWakeJob =
  | {
      readonly kind: "evaluate";
      readonly conditionDigest: ConditionIdentityDigest;
      readonly notBefore: string;
    }
  | {
      readonly kind: "digest_flush";
      readonly tenantId: TenantId;
      readonly principalId: string;
      readonly notBefore: string;
    };
