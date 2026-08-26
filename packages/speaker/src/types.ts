import type {
  ConversationKey,
  ConversationTurnId,
  DeliveryGroupId,
  DeliveryIntentId,
  DeliveryObservationId,
  InteractionControlRef,
  InteractionId,
  PresentationIntentRef,
  PrincipalIdString,
  ProposalRef,
  ProviderKey,
  ProviderMessageRef,
  ProviderThreadRef,
  ProviderUserRef,
  StepUpSessionId,
  TenantIdString,
  TurnAttemptId,
} from "./brands.js";

/** Transport provenance. Observation only — never authorization. */
export interface ChannelObservation {
  readonly provider: ProviderKey;
  readonly providerUser: ProviderUserRef;
  readonly thread: ProviderThreadRef;
  readonly message?: ProviderMessageRef;
  readonly replyToMessage?: ProviderMessageRef;
  readonly group?: {
    readonly thread: ProviderThreadRef;
    readonly title?: string;
  };
  readonly receivedAt: string;
}

export type InboundKind =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "media";
      readonly mediaRef: string;
      readonly mime?: string;
    }
  | {
      readonly kind: "control_click";
      readonly controlRef: InteractionControlRef;
    }
  | {
      readonly kind: "reaction";
      readonly emoji: string;
      readonly targetMessage: ProviderMessageRef;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface AudienceObservation {
  readonly kind: "dm" | "group" | "channel" | "unknown";
  readonly observedParticipantCount?: number;
  readonly observedParticipants?: readonly ProviderUserRef[];
}

/**
 * Canonical inbound contract. Owned by Zoen.
 * No Chat SDK Card / Thread / Adapter types appear here.
 */
export interface InboundInteraction {
  readonly idempotencyKey: string;
  readonly channel: ChannelObservation;
  readonly body: InboundKind;
  readonly audienceObservation: AudienceObservation;
}

/**
 * Membership resolution only. Channel observation is attached by the boundary.
 * Provider thread/user never appear as tenant/principal fields.
 */
export interface ResolvedChannelIdentity {
  readonly accountId: string;
  readonly bindingId: string;
  readonly membershipId: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly actorId: string;
  readonly workloadId: string;
}

/**
 * Resolved trust after IdentityDirectory. Constructed ONLY from Active Membership.
 */
export interface TrustedInteractionContext {
  readonly accountId: string;
  readonly bindingId: string;
  readonly membershipId: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly actorId: string;
  readonly workloadId: string;
  readonly channel: ChannelObservation;
}

export interface InteractionRecord {
  readonly id: InteractionId;
  readonly acceptedAt: string;
  readonly inbound: InboundInteraction;
  readonly ctx: TrustedInteractionContext;
  readonly semanticCorrelationKey: string;
}

export type DeliveryTarget =
  | { readonly kind: "same_thread"; readonly thread: ProviderThreadRef }
  | { readonly kind: "dm"; readonly providerUser: ProviderUserRef }
  | {
      readonly kind: "ephemeral_in_thread";
      readonly thread: ProviderThreadRef;
    };

export interface DeliveryIntent {
  readonly id: DeliveryIntentId;
  readonly recordId: InteractionId;
  readonly provider: ProviderKey;
  readonly target: DeliveryTarget;
  readonly presentation: PresentationIntentRef;
  readonly controlRefs: readonly InteractionControlRef[];
  readonly stableProviderDeliveryId: string;
  /** Present once the intent is bound to a turn attempt (AD-18). */
  readonly turnAttemptId?: TurnAttemptId;
  readonly deliveryGroupId?: DeliveryGroupId;
  readonly sequenceIndex?: number;
}

export type DeliveryOutcome =
  | { readonly kind: "accepted"; readonly providerMessage: ProviderMessageRef }
  | { readonly kind: "unknown" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "degraded";
      readonly fallback: "text" | "link" | "dm" | "web_surface";
      readonly providerMessage?: ProviderMessageRef;
      readonly surfaceUrl?: string;
    };

export interface DeliveryObservation {
  readonly id: DeliveryObservationId;
  readonly intentId: DeliveryIntentId;
  readonly observedAt: string;
  readonly outcome: DeliveryOutcome;
}

export interface InteractionControl {
  readonly ref: InteractionControlRef;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly proposalRef?: string;
  /** Action operation identity sealed at issue; required for step-up commit. */
  readonly operationId?: string;
  readonly actionBindingId?: string;
  readonly nonce: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly disclosure?: AudienceDisclosure;
  readonly assurance?: AssuranceGate;
  readonly actionRef?: SealedActionRef;
  readonly stepUpSessionId?: StepUpSessionId;
  readonly sealedAudienceKind?: AudienceObservation["kind"];
  /** Kernel preview text. Safe to speak. Never an internal id. */
  readonly previewText?: string;
  /** Hash binding. Host-only. Never rendered. */
  readonly previewHash?: string;
}

/** Structurally matches Surface ActionRef; kept local to avoid React coupling. */
export interface SealedActionRef {
  readonly actionId: string;
  readonly definition: {
    readonly definitionId: string;
    readonly digest: string;
    readonly revision: string;
  };
  readonly resourceId: string;
}

export type DisclosureDenyReason =
  | "audience_unauthorized"
  | "classification_unknown"
  | "assurance_insufficient";

export type RedactionSpec = {
  readonly mode: "labels_only" | "summary" | "unavailable_notice";
  readonly notice: string;
};

/**
 * Typed disclosure decision sealed onto the binding at issue time.
 * Decision record, not a policy engine, not "the channel thread."
 */
export type AudienceDisclosure =
  | { readonly kind: "deliver_full" }
  | {
      readonly kind: "deliver_redacted";
      readonly redaction: RedactionSpec;
    }
  | {
      readonly kind: "redirect_private";
      readonly target: Extract<
        DeliveryTarget,
        { kind: "dm" } | { kind: "ephemeral_in_thread" }
      >;
    }
  | { readonly kind: "require_step_up" }
  | { readonly kind: "deny"; readonly reason: DisclosureDenyReason };

/** How commit may proceed after a live control resolve. Sealed at issue. */
export type AssuranceGate = "channel_inline" | "oidc_step_up";

export interface ApprovalControl {
  readonly ref: InteractionControlRef;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly proposalRef: ProposalRef;
  readonly operationId?: string;
  readonly actionBindingId: string;
  readonly actionRef: SealedActionRef;
  readonly disclosure: AudienceDisclosure;
  readonly assurance: AssuranceGate;
  readonly nonce: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly stepUpSessionId?: StepUpSessionId;
  readonly sealedAudienceKind: AudienceObservation["kind"];
  readonly previewText?: string;
  readonly previewHash?: string;
}

export interface IssueApprovalControlInput {
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly proposalRef: ProposalRef;
  readonly operationId?: string;
  readonly actionBindingId: string;
  readonly actionRef: SealedActionRef;
  readonly disclosure: AudienceDisclosure;
  readonly assurance: AssuranceGate;
  readonly expiresAt: string;
  readonly sealedAudienceKind: AudienceObservation["kind"];
  readonly previewText?: string;
  readonly previewHash?: string;
}

export interface AudienceDisclosureInput {
  readonly resourceClass: "public" | "internal" | "confidential" | "restricted";
  readonly audience: AudienceObservation;
  readonly channelAssurance: "provider_chat" | "web_oidc" | "unknown";
  readonly actionRisk: "low" | "high";
}

export type StepUpSessionStatus =
  | "open"
  | "authenticated"
  | "committed"
  | "expired"
  | "rejected";

export interface StepUpSession {
  readonly id: StepUpSessionId;
  readonly controlRef: InteractionControlRef;
  readonly proposalRef: ProposalRef;
  readonly tenantId: TenantIdString;
  readonly requiredPrincipalId: PrincipalIdString;
  readonly oidcSubject?: string;
  readonly accountId?: string;
  readonly expiresAt: string;
  readonly status: StepUpSessionStatus;
}

export type ControlActivation =
  | {
      readonly kind: "inline_commit_ready";
      readonly control: ApprovalControl;
      readonly proposalRef: ProposalRef;
    }
  | {
      readonly kind: "step_up_required";
      readonly control: ApprovalControl;
      readonly proposalRef: ProposalRef;
      readonly stepUpUrl: string;
    }
  | {
      readonly kind: "denied";
      readonly reason:
        | "unknown_ref"
        | "expired"
        | "already_consumed"
        | "tenant_mismatch"
        | "principal_mismatch"
        | "disclosure_fail_closed"
        | "membership_inactive"
        | "wrong_account"
        | "chat_cookie_insufficient";
    };

export type FreeTextResolution =
  | { readonly kind: "bound"; readonly controlRef: InteractionControlRef }
  | {
      readonly kind: "disambiguate";
      readonly candidates: readonly ProposalRef[];
    }
  | { readonly kind: "unbound"; readonly reason: "no_pending" | "ambiguous" };

export type LinkButtonDegrade =
  | { readonly kind: "native_url_button"; readonly url: string }
  | { readonly kind: "link_text"; readonly url: string; readonly label: string };

export interface ChannelPresentationCapability {
  readonly provider: ProviderKey;
  readonly text: true;
  readonly cards: boolean;
  readonly buttons: boolean;
  readonly linkButtons: boolean;
  readonly files: boolean;
  readonly typing: boolean;
  readonly reactions: boolean;
  readonly ephemeral: boolean;
  readonly voice?: boolean;
  readonly readReceipts?: boolean;
  readonly extensions: {
    readonly imessageExperience: boolean;
    readonly imessageApp: boolean;
  };
}

export interface PlanDeliveryInput {
  readonly recordId: InteractionId;
  readonly ctx: TrustedInteractionContext;
  readonly presentation: PresentationIntentRef;
  readonly controls: readonly InteractionControlRef[];
  readonly target?: DeliveryTarget;
  readonly stableProviderDeliveryId?: string;
  readonly turnAttemptId?: TurnAttemptId;
  readonly deliveryGroupId?: DeliveryGroupId;
  readonly sequenceIndex?: number;
}

/** Product grouping of one or more accepted interactions for one burst. */
export interface ConversationTurn {
  readonly id: ConversationTurnId;
  readonly conversationKey: ConversationKey;
  readonly tenantId: TenantIdString;
  readonly accountId: string;
  readonly workspaceId: string;
  /** Exact InteractionRecord ids. Order = accept order inside the claim. */
  readonly interactionIds: readonly InteractionId[];
  readonly openedAt: string;
  readonly closedAt?: string;
}

export type TurnAttemptPhase =
  | { readonly kind: "debouncing" }
  | { readonly kind: "claiming" }
  | { readonly kind: "assembling_context" }
  | { readonly kind: "reasoning" }
  | { readonly kind: "rendering" }
  | { readonly kind: "planning_delivery" }
  | { readonly kind: "delivering"; readonly deliveryGroupId: DeliveryGroupId }
  | { readonly kind: "completed" }
  | {
      readonly kind: "superseded";
      readonly byAttemptId: TurnAttemptId;
      readonly at: string;
    }
  | { readonly kind: "failed"; readonly reason: string };

export type SemanticCommitRef =
  | { readonly kind: "action"; readonly actionId: string }
  | { readonly kind: "effect_request"; readonly effectRequestId: string }
  | { readonly kind: "approval"; readonly controlRef: InteractionControlRef };

/**
 * One processing chain for a ConversationTurn (or carry-forward reopen).
 * Carry-forward is InteractionRecord refs only — never a stringified blob.
 */
export interface TurnAttempt {
  readonly id: TurnAttemptId;
  readonly turnId: ConversationTurnId;
  readonly conversationKey: ConversationKey;
  readonly claimedInteractionIds: readonly InteractionId[];
  readonly carryForwardInteractionIds: readonly InteractionId[];
  readonly phase: TurnAttemptPhase;
  readonly openedAt: string;
  readonly observedCommitRefs: readonly SemanticCommitRef[];
  readonly supersedesAttemptId?: TurnAttemptId;
  /** SHA-256 hex of the sealed conversation context. Not the prompt. */
  readonly contextHash?: string;
  readonly contextDroppedIds?: readonly string[];
}

export type CancellableTurnPhaseKind =
  | "debouncing"
  | "claiming"
  | "assembling_context"
  | "reasoning"
  | "rendering"
  | "planning_delivery";

export function isCancellableTurnPhase(
  phase: TurnAttemptPhase,
): phase is Extract<TurnAttemptPhase, { kind: CancellableTurnPhaseKind }> {
  switch (phase.kind) {
    case "debouncing":
    case "claiming":
    case "assembling_context":
    case "reasoning":
    case "rendering":
    case "planning_delivery":
      return true;
    default:
      return false;
  }
}

export interface IssueControlInput {
  readonly kind: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly proposalRef?: string;
  readonly actionBindingId?: string;
  readonly expiresAt: string;
}
