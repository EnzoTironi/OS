import type {
  ActionPath,
  AttentionClassPolicy,
  AttentionItem,
  CommitResult,
  RevalidateResult,
} from "./types.js";

export type ExecuteAttentionInput = {
  readonly item: AttentionItem;
  readonly classPolicy: AttentionClassPolicy;
  readonly action: ActionPath;
  readonly operationId: string;
  readonly mode: "click" | "auto";
};

export type ExecuteAttentionResult =
  | {
      readonly kind: "notify_only";
      readonly item: AttentionItem;
    }
  | {
      readonly kind: "awaiting_approval";
      readonly item: AttentionItem;
      readonly proposalId: string;
    }
  | {
      readonly kind: "committed";
      readonly item: AttentionItem;
      readonly commit: Extract<CommitResult, { kind: "committed" }>;
      readonly usedOrdinaryAction: true;
    }
  | {
      readonly kind: "stale";
      readonly item: AttentionItem;
      readonly revalidate: Extract<RevalidateResult, { kind: "stale" }>;
    }
  | {
      readonly kind: "denied";
      readonly reason: string;
    }
  | {
      readonly kind: "duplicate";
      readonly operationId: string;
    };

/**
 * Click/auto-execute re-enters ordinary ActionPath.
 * Never calls effect adapters. Same commit implementation for both modes.
 */
export async function executeAttentionAction(
  input: ExecuteAttentionInput,
): Promise<ExecuteAttentionResult> {
  if (input.classPolicy.executionMode === "deny") {
    return { kind: "denied", reason: "class_denied" };
  }
  if (input.classPolicy.executionMode === "notify_only") {
    return { kind: "notify_only", item: input.item };
  }
  if (input.item.proposalRef === undefined) {
    return { kind: "notify_only", item: input.item };
  }

  if (
    input.mode === "auto" &&
    input.classPolicy.executionMode === "approval_required"
  ) {
    return {
      kind: "awaiting_approval",
      item: input.item,
      proposalId: input.item.proposalRef,
    };
  }

  const revalidated = await input.action.revalidateAndContinue({
    proposalId: input.item.proposalRef,
    expectedStateBasisDigest: input.item.proposalStateBasisDigest,
  });

  if (revalidated.kind === "stale") {
    return { kind: "stale", item: input.item, revalidate: revalidated };
  }
  if (revalidated.kind === "deny") {
    return { kind: "denied", reason: revalidated.reason };
  }
  if (revalidated.kind === "replan") {
    return { kind: "denied", reason: "replan_required" };
  }

  const commit = await input.action.commit({
    proposalId: revalidated.proposalId,
    operationId: input.operationId,
  });

  if (commit.kind === "stale") {
    return {
      kind: "stale",
      item: input.item,
      revalidate: {
        kind: "stale",
        proposalId: revalidated.proposalId,
        currentDigest: commit.currentDigest,
      },
    };
  }
  if (commit.kind === "denied") {
    return { kind: "denied", reason: commit.reason };
  }
  if (commit.kind === "duplicate") {
    return { kind: "duplicate", operationId: commit.operationId };
  }

  return {
    kind: "committed",
    item: input.item,
    commit,
    usedOrdinaryAction: true,
  };
}
