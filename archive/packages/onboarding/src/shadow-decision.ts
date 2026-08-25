import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import {
  shadowDecisionId,
  type GoalDigest,
  type ShadowDecisionId,
} from "./brands.js";

export type ShadowRecommendation = {
  readonly actionId: string;
  readonly resourceId: string;
  readonly definition: {
    readonly definitionId: string;
    readonly revision: string;
    readonly digest: string;
  };
  readonly recommendedInputs: ReadonlyArray<{
    readonly inputId: string;
    readonly value: unknown;
  }>;
  readonly recommendedInputsDigest: string;
  readonly stateBasis: {
    readonly digest: string;
    readonly observedCommitSequence: string;
    readonly queryDigests: ReadonlyArray<string>;
    readonly explainOperationId?: string;
  };
  readonly validAt: string;
  readonly computedAt: string;
};

export type ObservedShadowOutcome =
  | {
      readonly kind: "human_decision";
      readonly at: string;
      readonly outcomeRef: string;
      readonly summary: {
        readonly accepted: boolean;
        readonly chosenInputsDigest?: string;
      };
    }
  | {
      readonly kind: "harness_observed";
      readonly at: string;
      readonly outcomeRef: string;
      readonly summary: {
        readonly accepted: boolean;
        readonly chosenInputsDigest?: string;
      };
    };

export type ShadowComparison = {
  readonly classification: "agree" | "differ" | "inconclusive";
  readonly comparedAt: string;
  readonly detail: string;
};

/**
 * Recommendation for one Action under Shadow Mode.
 * CommitReceipt is unrepresentable: no receipt field on this type.
 */
export type ShadowDecision = {
  readonly id: ShadowDecisionId;
  readonly tenantId: string;
  readonly principalId: string;
  readonly goalDigest: GoalDigest;
  readonly recommendation: ShadowRecommendation;
  readonly observed?: ObservedShadowOutcome;
  readonly comparison?: ShadowComparison;
  readonly createdAt: string;
};

export type AssertNoCommitReceipt<T> = T extends { readonly receipt: unknown }
  ? never
  : T;
export type ShadowDecisionIsNonAuthoritative =
  AssertNoCommitReceipt<ShadowDecision>;

/** Harness adapter: query/explain/propose only. No commit method. */
export interface ShadowAuthorityPort {
  query(input: unknown): Promise<{
    readonly resultDigest: string;
    readonly stateBasisDigest: string;
    readonly observedCommitSequence: string;
  }>;
  explain(operationId: string): Promise<{ readonly explanationDigest: string }>;
  proposeRecommendation(input: unknown): Promise<{
    readonly recommendedInputs: ShadowRecommendation["recommendedInputs"];
    readonly recommendedInputsDigest: string;
  }>;
}

export interface ActionModePort {
  setMode(input: {
    readonly actionId: string;
    readonly mode: "human_approval" | "shadow";
  }): Promise<void>;
  getMode?(actionId: string): Promise<"human_approval" | "shadow" | undefined>;
}

export interface ShadowDecisionStore {
  get(id: ShadowDecisionId): Promise<ShadowDecision | null>;
  put(decision: ShadowDecision): Promise<void>;
  findByProposalKey?(key: string): Promise<ShadowDecision | null>;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function proposalKey(input: {
  readonly tenantId: string;
  readonly goalDigest: GoalDigest;
  readonly actionId: string;
  readonly resourceId: string;
  readonly definitionDigest: string;
}): string {
  const canonical = canonicalize(input);
  if (canonical === undefined) {
    throw new Error("proposal key is not canonicalizable");
  }
  return sha256Hex(canonical);
}

export async function recommendShadow(input: {
  readonly tenantId: string;
  readonly principalId: string;
  readonly goalDigest: GoalDigest;
  readonly actionId: string;
  readonly resourceId: string;
  readonly definition: ShadowRecommendation["definition"];
  readonly authority: ShadowAuthorityPort;
  readonly store: ShadowDecisionStore;
  readonly now?: string;
  readonly validAt?: string;
  /** Resume: reuse one proposal identity after restart. */
  readonly resumeDecisionId?: ShadowDecisionId;
}): Promise<ShadowDecision> {
  if ("commitOrRecover" in input.authority) {
    throw new Error("ShadowAuthorityPort must not expose commitOrRecover");
  }
  if ("commit" in input.authority) {
    throw new Error("ShadowAuthorityPort must not expose commit");
  }

  const key = proposalKey({
    tenantId: input.tenantId,
    goalDigest: input.goalDigest,
    actionId: input.actionId,
    resourceId: input.resourceId,
    definitionDigest: input.definition.digest,
  });

  if (input.resumeDecisionId !== undefined) {
    const existing = await input.store.get(input.resumeDecisionId);
    if (existing !== null) {
      return existing;
    }
  }
  if (input.store.findByProposalKey !== undefined) {
    const existing = await input.store.findByProposalKey(key);
    if (existing !== null) {
      return existing;
    }
  }

  const now = input.now ?? new Date().toISOString();
  const validAt = input.validAt ?? now;
  const query = await input.authority.query({
    tenantId: input.tenantId,
    actionId: input.actionId,
    resourceId: input.resourceId,
    definition: input.definition,
  });
  const explain = await input.authority.explain(
    `shadow.explain.${input.actionId}`,
  );
  const proposal = await input.authority.proposeRecommendation({
    tenantId: input.tenantId,
    actionId: input.actionId,
    resourceId: input.resourceId,
    definition: input.definition,
  });

  const decision: ShadowDecision = {
    id: shadowDecisionId(`shadow.${key.slice(0, 24)}`),
    tenantId: input.tenantId,
    principalId: input.principalId,
    goalDigest: input.goalDigest,
    recommendation: {
      actionId: input.actionId,
      resourceId: input.resourceId,
      definition: input.definition,
      recommendedInputs: proposal.recommendedInputs,
      recommendedInputsDigest: proposal.recommendedInputsDigest,
      stateBasis: {
        digest: query.stateBasisDigest,
        observedCommitSequence: query.observedCommitSequence,
        queryDigests: [query.resultDigest],
        explainOperationId: explain.explanationDigest,
      },
      validAt,
      computedAt: now,
    },
    createdAt: now,
  };

  await input.store.put(decision);
  return decision;
}

export async function observeShadowOutcome(input: {
  readonly decisionId: ShadowDecisionId;
  readonly observed: ObservedShadowOutcome;
  readonly store: ShadowDecisionStore;
}): Promise<ShadowDecision> {
  const existing = await input.store.get(input.decisionId);
  if (existing === null) {
    throw new Error(`ShadowDecision not found: ${input.decisionId}`);
  }
  if (
    existing.observed !== undefined &&
    existing.observed.outcomeRef === input.observed.outcomeRef
  ) {
    return existing;
  }
  const next: ShadowDecision = {
    ...existing,
    observed: input.observed,
  };
  await input.store.put(next);
  return next;
}

export async function compareShadow(
  decisionId: ShadowDecisionId,
  store: ShadowDecisionStore,
): Promise<ShadowDecision> {
  const existing = await store.get(decisionId);
  if (existing === null) {
    throw new Error(`ShadowDecision not found: ${decisionId}`);
  }
  if (existing.observed === undefined) {
    const next: ShadowDecision = {
      ...existing,
      comparison: {
        classification: "inconclusive",
        comparedAt: new Date().toISOString(),
        detail: "No observed outcome yet",
      },
    };
    await store.put(next);
    return next;
  }

  const recommended = existing.recommendation.recommendedInputsDigest;
  const chosen = existing.observed.summary.chosenInputsDigest;
  let classification: ShadowComparison["classification"];
  let detail: string;
  if (chosen === undefined) {
    classification = "inconclusive";
    detail = "Observed outcome lacks chosenInputsDigest";
  } else if (chosen === recommended) {
    classification = "agree";
    detail = "Recommended inputs match observed choice";
  } else {
    classification = "differ";
    detail = "Recommended inputs differ from observed choice";
  }

  const next: ShadowDecision = {
    ...existing,
    comparison: {
      classification,
      comparedAt: new Date().toISOString(),
      detail,
    },
  };
  await store.put(next);
  return next;
}

/**
 * Flip activation/policy mode for the same actionId.
 * Not a second business handler. Not shadow=true inside Action semantics.
 */
export async function promoteShadowActionMode(input: {
  readonly actionId: string;
  readonly mode: "human_approval";
  readonly policyPort: ActionModePort;
}): Promise<void> {
  await input.policyPort.setMode({
    actionId: input.actionId,
    mode: input.mode,
  });
}

export function createMemoryShadowStore(): ShadowDecisionStore & {
  readonly snapshot: () => Map<string, ShadowDecision>;
} {
  const byId = new Map<string, ShadowDecision>();
  const byKey = new Map<string, ShadowDecisionId>();
  return {
    async get(id) {
      return byId.get(id) ?? null;
    },
    async put(decision) {
      byId.set(decision.id, decision);
      const key = proposalKey({
        tenantId: decision.tenantId,
        goalDigest: decision.goalDigest,
        actionId: decision.recommendation.actionId,
        resourceId: decision.recommendation.resourceId,
        definitionDigest: decision.recommendation.definition.digest,
      });
      byKey.set(key, decision.id);
    },
    async findByProposalKey(key) {
      const id = byKey.get(key);
      if (id === undefined) {
        return null;
      }
      return byId.get(id) ?? null;
    },
    snapshot() {
      return new Map(byId);
    },
  };
}

export function createMemoryActionModePort(): ActionModePort & {
  readonly modes: Map<string, "human_approval" | "shadow">;
} {
  const modes = new Map<string, "human_approval" | "shadow">();
  return {
    modes,
    async setMode(input) {
      modes.set(input.actionId, input.mode);
    },
    async getMode(actionId) {
      return modes.get(actionId);
    },
  };
}
