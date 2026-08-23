import {
  DEFAULT_FIRST_SUCCESS_CONTRACT_ID,
  type FirstSuccessContractId,
} from "./brands.js";
import type {
  GoalContract,
  MissingCapability,
  ObservedCapabilities,
  OnboardingSession,
  PlanNextResult,
  WorkspaceClass,
} from "./types.js";

export function requiredWorkspaceClass(goal: GoalContract): WorkspaceClass {
  return goal.slots.workspaceClass ?? "enterprise";
}

/**
 * Caps implied by the default read FirstSuccessContract.
 * write_scope is illegal for onboarding.first_attributable_query.
 */
export function requiredCapabilityKinds(
  contractId: FirstSuccessContractId,
  goal: GoalContract,
): ReadonlyArray<MissingCapability["kind"]> {
  const kinds: MissingCapability["kind"][] = [
    "identity",
    "workspace",
    "read_source",
  ];
  if (
    contractId !== DEFAULT_FIRST_SUCCESS_CONTRACT_ID &&
    goal.slots.outcomeKind === "action_committed"
  ) {
    kinds.push("write_scope");
  }
  return kinds;
}

function whyFor(goal: GoalContract, need: string): string {
  const wording =
    goal.wording.length > 80 ? `${goal.wording.slice(0, 77)}…` : goal.wording;
  return `${need} so Zoen can work on “${wording}”.`;
}

function hasVerifiedIdentity(observed: ObservedCapabilities): boolean {
  return (
    observed.accountStatus === "verified" ||
    observed.accountStatus === "merged" ||
    observed.verifiedBindings.length > 0
  );
}

function activeMembership(
  observed: ObservedCapabilities,
  workspaceClass: WorkspaceClass,
): ObservedCapabilities["memberships"][number] | undefined {
  return observed.memberships.find(
    (m) => m.status === "active" && m.workspaceClass === workspaceClass,
  );
}

function hasHealthyReadSource(observed: ObservedCapabilities): boolean {
  return observed.readSources.some(
    (s) => s.status === "connected" && s.scope === "readonly",
  );
}

/**
 * Exactly one MissingCapability (or ready / done / blocked).
 * Priority: identity → workspace → read_source → ambiguity → ready.
 * write_scope never emitted for the default read contract.
 */
export function planNext(
  session: OnboardingSession,
  observed: ObservedCapabilities,
): PlanNextResult {
  if (session.firstSuccess !== null) {
    return { kind: "first_success", record: session.firstSuccess };
  }
  if (session.pendingGrant !== null) {
    return {
      kind: "blocked",
      reason: "pending_grant_in_flight",
      detail: session.pendingGrant.operationId,
    };
  }
  if (observed.accountStatus === "merged") {
    return {
      kind: "blocked",
      reason: "account_merged",
      detail: "Account was merged; resume under the survivor account.",
    };
  }

  const goal = session.contract;
  const required = requiredCapabilityKinds(
    session.firstSuccessContractId,
    goal,
  );
  const workspaceClass = requiredWorkspaceClass(goal);

  if (required.includes("identity") && !hasVerifiedIdentity(observed)) {
    return {
      kind: "ask",
      missing: {
        kind: "identity",
        grantClass: "oidc_login",
        why: whyFor(goal, "Verify who you are"),
      },
    };
  }

  if (required.includes("workspace")) {
    const membership = activeMembership(observed, workspaceClass);
    if (membership === undefined) {
      const personalOnly =
        workspaceClass === "enterprise" &&
        observed.memberships.some(
          (m) => m.status === "active" && m.workspaceClass === "personal",
        ) &&
        !observed.memberships.some(
          (m) => m.status === "active" && m.workspaceClass === "enterprise",
        );
      if (personalOnly) {
        return {
          kind: "blocked",
          reason: "personal_cannot_satisfy_enterprise",
          detail:
            "Personal Membership cannot satisfy an enterprise FirstSuccess path.",
        };
      }
      return {
        kind: "ask",
        missing: {
          kind: "workspace",
          workspaceClass,
          why: whyFor(
            goal,
            workspaceClass === "enterprise"
              ? "Join an enterprise workspace"
              : "Create a personal workspace",
          ),
        },
      };
    }
  }

  if (required.includes("read_source") && !hasHealthyReadSource(observed)) {
    const revoked = observed.readSources.some((s) => s.status === "revoked");
    if (revoked && observed.readSources.every((s) => s.status !== "connected")) {
      return {
        kind: "blocked",
        reason: "source_revoked",
        detail: "Read source was revoked; reconnect a readonly source.",
      };
    }
    return {
      kind: "ask",
      missing: {
        kind: "read_source",
        scope: "readonly",
        why: whyFor(goal, "Connect a read-only source"),
        sourceHint: "sample-erp",
      },
    };
  }

  if (session.unresolvedQuestions.length > 0) {
    const questionId = session.unresolvedQuestions[0]!;
    return {
      kind: "ask",
      missing: {
        kind: "ambiguity",
        questionId,
        prompt: "Which mapping should Zoen use for this goal?",
        why: whyFor(goal, "Resolve one mapping question"),
      },
    };
  }

  if (required.includes("write_scope")) {
    throw new Error(
      "IllegalWriteScopeForContract: default onboarding contract is read-only",
    );
  }

  if (!observed.queryReady) {
    return {
      kind: "blocked",
      reason: "provider_unavailable",
      detail: "Query path is not ready under current Membership TEC.",
    };
  }

  return { kind: "ready_for_outcome" };
}

/** Reject planner emission of write_scope for the default contract. */
export function assertLegalMissing(
  contractId: FirstSuccessContractId,
  missing: MissingCapability,
): void {
  if (
    missing.kind === "write_scope" &&
    contractId === DEFAULT_FIRST_SUCCESS_CONTRACT_ID
  ) {
    throw new Error("IllegalWriteScopeForContract");
  }
}
