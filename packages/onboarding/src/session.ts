import { randomUUID } from "node:crypto";
import {
  capabilityGrantId,
  DEFAULT_FIRST_SUCCESS_CONTRACT_ID,
  firstSuccessContractId,
  operationId,
  resumeToken,
  type FirstSuccessContractId,
  type GoalDigest,
  type OperationId,
  type ResumeToken,
  type ZoenAccountId,
} from "./brands.js";
import { computeGoalDigest, normalizeWording } from "./digest.js";
import { assertLegalMissing, planNext } from "./planner.js";
import type { OnboardingSessionStore } from "./store.js";
import type {
  AttemptFirstSuccessResult,
  BeginGrantResult,
  GoalOutcomeSlots,
  GrantProviderResult,
  MissingCapability,
  ObservedCapabilities,
  OnboardingSession,
  QueryEvidence,
  ReplaceGoalResult,
  ResumeGrantResult,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function expiresIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export async function captureGoal(input: {
  readonly store: OnboardingSessionStore;
  readonly accountId: ZoenAccountId;
  readonly wording: string;
  readonly slots?: GoalOutcomeSlots;
  readonly firstSuccessContractId?: FirstSuccessContractId;
}): Promise<OnboardingSession> {
  const wording = normalizeWording(input.wording);
  if (wording.length === 0) {
    throw Object.assign(new Error("GoalEmpty"), { kind: "GoalEmpty" as const });
  }
  const slots: GoalOutcomeSlots = input.slots ?? {
    outcomeKind: "query_result",
    workspaceClass: "enterprise",
  };
  const digest = computeGoalDigest({ wording, slots });
  const existing = await input.store.get(digest, input.accountId);
  if (existing !== null) {
    return existing;
  }
  const capturedAt = nowIso();
  const contractId =
    input.firstSuccessContractId ??
    slots.firstSuccessContractId ??
    DEFAULT_FIRST_SUCCESS_CONTRACT_ID;
  const session: OnboardingSession = {
    digest,
    accountId: input.accountId,
    contract: {
      digest,
      wording,
      slots,
      capturedAt,
      accountId: input.accountId,
    },
    firstSuccessContractId: firstSuccessContractId(contractId),
    pendingGrant: null,
    grants: [],
    firstSuccess: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    unresolvedQuestions: [],
  };
  await input.store.save(session);
  return session;
}

export async function resumeOnboarding(input: {
  readonly store: OnboardingSessionStore;
  readonly digest: GoalDigest;
  readonly accountId: ZoenAccountId;
  readonly observed: ObservedCapabilities;
}): Promise<{
  readonly session: OnboardingSession;
  readonly next: ReturnType<typeof planNext>;
}> {
  const session = await input.store.get(input.digest, input.accountId);
  if (session === null) {
    throw Object.assign(new Error("SessionNotFound"), {
      kind: "SessionNotFound" as const,
    });
  }
  return { session, next: planNext(session, input.observed) };
}

export async function beginCapabilityGrant(input: {
  readonly store: OnboardingSessionStore;
  readonly digest: GoalDigest;
  readonly accountId: ZoenAccountId;
  readonly missing: MissingCapability;
  readonly observed: ObservedCapabilities;
  readonly redirectUrlFor: (missing: MissingCapability, operationId: OperationId) => string;
}): Promise<BeginGrantResult> {
  const session = await input.store.get(input.digest, input.accountId);
  if (session === null) {
    throw Object.assign(new Error("SessionNotFound"), {
      kind: "SessionNotFound" as const,
    });
  }
  assertLegalMissing(session.firstSuccessContractId, input.missing);
  const planned = planNext(session, input.observed);
  if (planned.kind === "ask") {
    if (planned.missing.kind !== input.missing.kind) {
      throw new Error(
        `MissingCapability mismatch: planned ${planned.missing.kind}, got ${input.missing.kind}`,
      );
    }
  } else if (planned.kind === "blocked" && planned.reason === "pending_grant_in_flight") {
    const pending = session.pendingGrant!;
    return {
      session,
      redirectUrl: input.redirectUrlFor(pending.missing, pending.operationId),
      operationId: pending.operationId,
      resumeToken: pending.resumeToken,
    };
  } else {
    throw new Error(`Cannot begin grant while planNext is ${planned.kind}`);
  }

  const op = operationId(randomUUID());
  const token = resumeToken(randomUUID());
  const startedAt = nowIso();
  const nextSession: OnboardingSession = {
    ...session,
    pendingGrant: {
      operationId: op,
      missing: input.missing,
      resumeToken: token,
      startedAt,
      expiresAt: expiresIn(30 * 60_000),
    },
    updatedAt: startedAt,
  };
  await input.store.save(nextSession);
  return {
    session: nextSession,
    redirectUrl: input.redirectUrlFor(input.missing, op),
    operationId: op,
    resumeToken: token,
  };
}

export async function resumeCapabilityGrant(input: {
  readonly store: OnboardingSessionStore;
  readonly digest: GoalDigest;
  readonly accountId: ZoenAccountId;
  readonly operationId: OperationId;
  readonly resumeToken: ResumeToken;
  readonly providerResult: GrantProviderResult;
  readonly observed: ObservedCapabilities;
  /** Required enterprise tenant from Membership only; prompt hints rejected. */
  readonly requiredWorkspaceClass?: "personal" | "enterprise";
}): Promise<ResumeGrantResult> {
  const session = await input.store.get(input.digest, input.accountId);
  if (session === null) {
    return { kind: "rejected", reason: "session_mismatch" };
  }

  const already = session.grants.find(
    (g) => g.operationId === input.operationId,
  );
  if (already !== undefined) {
    return {
      kind: "idempotent_replay",
      session,
      next: planNext(session, input.observed),
    };
  }

  const pending = session.pendingGrant;
  if (pending === null || pending.operationId !== input.operationId) {
    return { kind: "rejected", reason: "operation_mismatch" };
  }
  if (pending.resumeToken !== input.resumeToken) {
    return { kind: "rejected", reason: "operation_mismatch" };
  }
  if (Date.parse(pending.expiresAt) < Date.now()) {
    const cleared: OnboardingSession = {
      ...session,
      pendingGrant: null,
      updatedAt: nowIso(),
    };
    await input.store.save(cleared);
    return { kind: "rejected", reason: "expired" };
  }

  if (input.providerResult.kind === "canceled") {
    const cleared: OnboardingSession = {
      ...session,
      pendingGrant: null,
      updatedAt: nowIso(),
    };
    await input.store.save(cleared);
    return {
      kind: "canceled",
      session: cleared,
      next: planNext(cleared, input.observed),
    };
  }

  if (input.providerResult.kind === "failed") {
    const cleared: OnboardingSession = {
      ...session,
      pendingGrant: null,
      updatedAt: nowIso(),
    };
    await input.store.save(cleared);
    return {
      kind: "canceled",
      session: cleared,
      next: planNext(cleared, input.observed),
    };
  }

  const tenantHint = input.providerResult.tenantHint;
  if (tenantHint !== undefined && tenantHint.length > 0) {
    const allowed = input.observed.memberships.some(
      (m) => m.status === "active" && m.tenantId === tenantHint,
    );
    if (!allowed) {
      return {
        kind: "rejected",
        reason: "prompt_tenant_rejected",
        detail: tenantHint,
      };
    }
  }

  if (
    pending.missing.kind === "workspace" &&
    pending.missing.workspaceClass === "enterprise"
  ) {
    const hasEnterprise = input.observed.memberships.some(
      (m) => m.status === "active" && m.workspaceClass === "enterprise",
    );
    if (!hasEnterprise) {
      return {
        kind: "rejected",
        reason: "personal_cannot_satisfy_enterprise",
      };
    }
  }

  const completedAt = nowIso();
  const grant = {
    id: capabilityGrantId(randomUUID()),
    missing: pending.missing,
    operationId: pending.operationId,
    completedAt,
    attribution: input.providerResult.attribution,
    forGoalDigest: session.digest,
  };
  const nextSession: OnboardingSession = {
    ...session,
    pendingGrant: null,
    grants: [...session.grants, grant],
    updatedAt: completedAt,
  };
  await input.store.save(nextSession);
  return {
    kind: "resumed",
    session: nextSession,
    next: planNext(nextSession, input.observed),
  };
}

export async function attemptFirstSuccess(input: {
  readonly store: OnboardingSessionStore;
  readonly digest: GoalDigest;
  readonly accountId: ZoenAccountId;
  readonly observed: ObservedCapabilities;
  readonly evidence: QueryEvidence | null;
}): Promise<AttemptFirstSuccessResult> {
  const session = await input.store.get(input.digest, input.accountId);
  if (session === null) {
    throw Object.assign(new Error("SessionNotFound"), {
      kind: "SessionNotFound" as const,
    });
  }
  if (session.firstSuccess !== null) {
    return { kind: "matched", session };
  }
  const next = planNext(session, input.observed);
  if (next.kind !== "ready_for_outcome") {
    return { kind: "not_ready", next };
  }
  if (input.evidence === null) {
    return {
      kind: "not_matched",
      detail: "connect-source alone is not FirstSuccess; attributable Query required",
    };
  }
  const membershipTenant = input.observed.memberships.find(
    (m) =>
      m.status === "active" &&
      m.tenantId === input.evidence!.tenantId,
  );
  if (membershipTenant === undefined) {
    return {
      kind: "not_matched",
      detail: "Query TEC.tenant_id must equal Active Membership tenant",
    };
  }
  if (
    input.evidence.queryDigest.length === 0 ||
    !/^[0-9a-f]{64}$/i.test(input.evidence.queryDigest)
  ) {
    return {
      kind: "not_matched",
      detail: "attributable queryDigest required",
    };
  }
  const achievedAt = nowIso();
  const matched: OnboardingSession = {
    ...session,
    firstSuccess: {
      contractId: session.firstSuccessContractId,
      goalDigest: session.digest,
      achievedAt,
      attribution: {
        tenantId: input.evidence.tenantId,
        principalId: input.evidence.principalId,
        queryDigest: input.evidence.queryDigest,
        explainOperationId: input.evidence.explainOperationId,
        knowledgeFragmentDigests:
          input.evidence.knowledgeFragmentDigests ?? [],
      },
    },
    updatedAt: achievedAt,
  };
  await input.store.save(matched);
  return { kind: "matched", session: matched };
}

export async function replaceGoal(input: {
  readonly store: OnboardingSessionStore;
  readonly digest: GoalDigest;
  readonly accountId: ZoenAccountId;
  readonly newWording: string;
  readonly slots?: GoalOutcomeSlots;
  readonly observed: ObservedCapabilities;
}): Promise<ReplaceGoalResult> {
  const session = await input.store.get(input.digest, input.accountId);
  if (session === null) {
    throw Object.assign(new Error("SessionNotFound"), {
      kind: "SessionNotFound" as const,
    });
  }
  const wording = normalizeWording(input.newWording);
  if (wording.length === 0) {
    throw Object.assign(new Error("GoalEmpty"), { kind: "GoalEmpty" as const });
  }
  const slots = input.slots ?? session.contract.slots;
  const newDigest = computeGoalDigest({ wording, slots });
  const capturedAt = nowIso();
  const replaced: OnboardingSession = {
    digest: newDigest,
    accountId: session.accountId,
    contract: {
      digest: newDigest,
      wording,
      slots,
      capturedAt,
      accountId: session.accountId,
    },
    firstSuccessContractId: session.firstSuccessContractId,
    pendingGrant: null,
    grants: session.grants,
    firstSuccess: null,
    createdAt: session.createdAt,
    updatedAt: capturedAt,
    unresolvedQuestions: [],
  };
  await input.store.save(replaced);
  return { session: replaced, next: planNext(replaced, input.observed) };
}
