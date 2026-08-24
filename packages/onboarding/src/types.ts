import type {
  AmbiguityQuestionId,
  CapabilityGrantId,
  FirstSuccessContractId,
  GoalDigest,
  InviteId,
  OperationId,
  ResumeToken,
  SourceConnectionId,
  ZoenAccountId,
} from "./brands.js";

export type OutcomeSlotKind =
  | "query_result"
  | "evidence_recorded"
  | "action_committed";

export type GoalOutcomeSlots = {
  readonly outcomeKind: OutcomeSlotKind;
  readonly domainHints?: readonly string[];
  readonly firstSuccessContractId?: FirstSuccessContractId;
  /** Enterprise Sample / invite path vs personal. Never becomes TEC. */
  readonly workspaceClass?: WorkspaceClass;
};

export type GoalContractPayload = {
  readonly wording: string;
  readonly slots: GoalOutcomeSlots;
};

export type GoalContract = {
  readonly digest: GoalDigest;
  readonly wording: string;
  readonly slots: GoalOutcomeSlots;
  readonly capturedAt: string;
  readonly accountId: ZoenAccountId;
};

export type WorkspaceClass = "personal" | "enterprise";

/**
 * Closed sum. The only way to choose the next user question.
 * No free-form phase string. No wizard step index.
 */
export type MissingCapability =
  | {
      readonly kind: "identity";
      readonly grantClass: "verify_binding" | "oidc_login";
      readonly why: string;
    }
  | {
      readonly kind: "workspace";
      readonly workspaceClass: WorkspaceClass;
      readonly why: string;
      readonly inviteRef?: InviteId;
    }
  | {
      readonly kind: "read_source";
      readonly scope: "readonly";
      readonly why: string;
      readonly sourceHint?: string;
    }
  | {
      readonly kind: "write_scope";
      readonly scope: "action_effect";
      readonly why: string;
      readonly actionId: string;
    }
  | {
      readonly kind: "ambiguity";
      readonly questionId: AmbiguityQuestionId;
      readonly prompt: string;
      readonly why: string;
    };

export type ObservedCapabilities = {
  readonly accountStatus: "provisional" | "verified" | "merged";
  readonly verifiedBindings: ReadonlyArray<{
    readonly provider: "web_oidc" | "whatsapp" | "telegram" | "linq";
    readonly bindingId: string;
  }>;
  readonly memberships: ReadonlyArray<{
    readonly membershipId: string;
    readonly tenantId: string;
    readonly workspaceClass: WorkspaceClass;
    readonly status: "active" | "inactive";
  }>;
  readonly readSources: ReadonlyArray<{
    readonly connectionId: SourceConnectionId;
    readonly scope: "readonly" | "readwrite";
    readonly status: "connected" | "revoked" | "failed";
  }>;
  readonly queryReady: boolean;
};

export type CapabilityGrant = {
  readonly id: CapabilityGrantId;
  readonly missing: MissingCapability;
  readonly operationId: OperationId;
  readonly completedAt: string;
  readonly attribution: {
    readonly accountId: ZoenAccountId;
    readonly membershipId?: string;
    readonly sourceConnectionId?: SourceConnectionId;
    readonly tenantId?: string;
  };
  /** Goal digest active when the grant completed. Survives replaceGoal. */
  readonly forGoalDigest: GoalDigest;
};

export type PendingGrant = {
  readonly operationId: OperationId;
  readonly missing: MissingCapability;
  readonly resumeToken: ResumeToken;
  readonly startedAt: string;
  readonly expiresAt: string;
};

export type FirstSuccessRecord = {
  readonly contractId: FirstSuccessContractId;
  readonly goalDigest: GoalDigest;
  readonly achievedAt: string;
  readonly attribution: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly queryDigest: string;
    readonly explainOperationId?: string;
    readonly knowledgeFragmentDigests: ReadonlyArray<string>;
  };
};

/**
 * Durable product state keyed by (GoalDigest, ZoenAccountId).
 * Forbidden: tenantId-as-authority, principalId, Cedar, free-form phase.
 */
export type OnboardingSession = {
  readonly digest: GoalDigest;
  readonly accountId: ZoenAccountId;
  readonly contract: GoalContract;
  readonly firstSuccessContractId: FirstSuccessContractId;
  readonly pendingGrant: PendingGrant | null;
  readonly grants: ReadonlyArray<CapabilityGrant>;
  readonly firstSuccess: FirstSuccessRecord | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Ambiguity queue refs only; AD-07 owns bootstrap depth. */
  readonly unresolvedQuestions: ReadonlyArray<AmbiguityQuestionId>;
};

export type PlanNextResult =
  | { readonly kind: "ask"; readonly missing: MissingCapability }
  | { readonly kind: "ready_for_outcome" }
  | { readonly kind: "first_success"; readonly record: FirstSuccessRecord }
  | {
      readonly kind: "blocked";
      readonly reason:
        | "pending_grant_in_flight"
        | "account_merged"
        | "provider_unavailable"
        | "source_revoked"
        | "personal_cannot_satisfy_enterprise"
        | "prompt_tenant_rejected";
      readonly detail: string;
    };

export type BeginGrantResult = {
  readonly session: OnboardingSession;
  readonly redirectUrl: string;
  readonly operationId: OperationId;
  readonly resumeToken: ResumeToken;
};

export type ResumeGrantResult =
  | {
      readonly kind: "resumed";
      readonly session: OnboardingSession;
      readonly next: PlanNextResult;
    }
  | {
      readonly kind: "idempotent_replay";
      readonly session: OnboardingSession;
      readonly next: PlanNextResult;
    }
  | {
      readonly kind: "canceled";
      readonly session: OnboardingSession;
      readonly next: PlanNextResult;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "session_mismatch"
        | "operation_mismatch"
        | "tenant_not_authorized"
        | "personal_cannot_satisfy_enterprise"
        | "prompt_tenant_rejected"
        | "expired";
      readonly detail?: string;
    };

export type AttemptFirstSuccessResult =
  | { readonly kind: "matched"; readonly session: OnboardingSession }
  | { readonly kind: "not_ready"; readonly next: PlanNextResult }
  | { readonly kind: "not_matched"; readonly detail: string };

export type ReplaceGoalResult = {
  readonly session: OnboardingSession;
  readonly next: PlanNextResult;
};

export type OnboardingError =
  | { readonly kind: "SessionNotFound" }
  | { readonly kind: "GoalEmpty" }
  | { readonly kind: "IllegalWriteScopeForContract" }
  | { readonly kind: "PromptTenantRejected" }
  | { readonly kind: "AuthorityLookupFailed"; readonly detail: string };

export type QueryEvidence = {
  readonly tenantId: string;
  readonly principalId: string;
  readonly queryDigest: string;
  readonly explainOperationId?: string;
  readonly knowledgeFragmentDigests?: ReadonlyArray<string>;
};

export type GrantProviderResult =
  | {
      readonly kind: "granted";
      readonly attribution: CapabilityGrant["attribution"];
      /** Rejected at boundary; never becomes TEC. */
      readonly tenantHint?: string;
    }
  | { readonly kind: "canceled" }
  | { readonly kind: "failed"; readonly detail: string };
