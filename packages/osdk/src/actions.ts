import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ActionDefinition, ValueType } from "@zoen/ontology";
import {
  ActionInputSchema,
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "@zoen/sdk";
import { ExactValueSchema, QuantityValueSchema } from "@zoen/sdk";
import type {
  CommitView,
  OsdkActionsPort,
  OsdkDefinitionRef,
  ProposeView,
} from "./ports.js";
import { definitionRevision } from "./ports.js";
import { isQuantity, type OsdkInputValue, type OsdkQuantity } from "./values.js";

export interface ActionCall<
  TInputs extends object = Readonly<Record<string, OsdkInputValue>>,
> {
  readonly approvalId?: string;
  readonly expiresAt?: Date;
  readonly inputs: TInputs;
  readonly operationId: string;
  readonly proposalId: string;
  readonly resourceId: string;
  readonly validAt?: Date;
}

export type ActionPreviewResult =
  | {
      readonly kind: "deny";
      readonly message?: string;
      readonly wroteBelief: false;
    }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly wroteBelief: false;
    }
  | {
      readonly kind: "permit";
      readonly proposalId: string;
      readonly status: "awaiting_approval" | "ready";
      readonly wroteBelief: false;
    };

export type ActionCommitResult =
  | { readonly kind: "committed"; readonly operationId: string; readonly recordIds: readonly string[] }
  | { readonly kind: "conflict"; readonly message?: string }
  | { readonly kind: "denied"; readonly message?: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "stale" };

export interface OsdkActionHandle<
  TInputs extends object = Readonly<Record<string, OsdkInputValue>>,
> {
  /**
   * Propose only. Does not write World claims. Cedar runs on zoend during
   * Propose. `wroteBelief` is always false.
   */
  preview(call: ActionCall<TInputs>): Promise<ActionPreviewResult>;
  /**
   * Propose, Approve when the proposal is awaiting approval, then Commit.
   * Belief is written only by zoend through Action + Cedar. This client
   * never calls World.recordEvidence.
   */
  commit(call: ActionCall<TInputs>): Promise<ActionCommitResult>;
}

export interface ActionRuntime {
  readonly action: ActionDefinition;
  readonly actions: OsdkActionsPort;
  readonly definition: OsdkDefinitionRef;
  readonly validAt?: Date;
}

/**
 * Context: typed OSDK action handle over zoend ActionService.
 * Inputs: compiled ActionDefinition plus Action Propose/Approve/Commit port.
 * Outputs: preview (no belief write) or commit (Cedar-governed belief write).
 * Side effects: RPC only. No in-memory claim store.
 */
export function createActionHandle<
  TInputs extends object = Readonly<Record<string, OsdkInputValue>>,
>(runtime: ActionRuntime): OsdkActionHandle<TInputs> {
  return {
    commit: (call) => commitAction({ call, runtime }),
    preview: (call) => previewAction({ call, runtime }),
  };
}

/**
 * Context: dry-run a governed action.
 * Inputs: ActionCall plus zoend Action port.
 * Outputs: permit/deny/error. `wroteBelief` is always false.
 * Side effects: Action.Propose only. Never Approve, Commit, or recordEvidence.
 */
export async function previewAction(input: {
  readonly call: ActionCall;
  readonly runtime: ActionRuntime;
}): Promise<ActionPreviewResult> {
  const proposed = await input.runtime.actions.propose(
    proposeRequest(input.runtime, input.call),
  );
  return previewFromPropose(proposed);
}

/**
 * Context: write belief through the existing Action path.
 * Inputs: ActionCall plus zoend Action port.
 * Outputs: committed record ids or a policy/staleness failure.
 * Side effects: Propose → optional Approve → Commit on zoend. Cedar is
 * evaluated there. This function does not write claims locally.
 */
export async function commitAction(input: {
  readonly call: ActionCall;
  readonly runtime: ActionRuntime;
}): Promise<ActionCommitResult> {
  const proposed = await input.runtime.actions.propose(
    proposeRequest(input.runtime, input.call),
  );
  if (proposed.decision !== PolicyDecision.PERMIT || proposed.proposal === undefined) {
    return {
      kind: proposed.decision === PolicyDecision.EVALUATION_ERROR ? "error" : "denied",
      message: proposed.evaluationError,
    };
  }
  const proposalId = proposed.proposal.proposalId ?? input.call.proposalId;
  if (proposed.proposal.status === ProposalStatus.AWAITING_APPROVAL) {
    const approved = await input.runtime.actions.approve({
      approvalId: input.call.approvalId ?? `approval.${proposalId}`,
      proposalId,
      ...(input.call.expiresAt === undefined
        ? {}
        : { expiresAt: timestampFromDate(input.call.expiresAt) }),
    });
    if (approved.decision !== PolicyDecision.PERMIT) {
      return {
        kind:
          approved.decision === PolicyDecision.EVALUATION_ERROR ? "error" : "denied",
        message: approved.evaluationError,
      };
    }
  }
  const committed = await input.runtime.actions.commit({
    operationId: input.call.operationId,
    proposalId,
  });
  return commitFromResponse(committed);
}

function proposeRequest(runtime: ActionRuntime, call: ActionCall) {
  const validAt = call.validAt ?? runtime.validAt;
  const expiresAt = call.expiresAt ?? new Date(Date.now() + 300_000);
  return {
    actionId: runtime.action.id,
    definition: {
      definitionId: runtime.definition.definitionId,
      digest: runtime.definition.digest,
      revision: definitionRevision(runtime.definition),
    },
    expiresAt: timestampFromDate(expiresAt),
    inputs: encodeActionInputs(runtime.action, call.inputs),
    operationId: call.operationId,
    proposalId: call.proposalId,
    resourceId: call.resourceId,
    ...(validAt === undefined ? {} : { validAt: timestampFromDate(validAt) }),
  };
}

function previewFromPropose(proposed: ProposeView): ActionPreviewResult {
  switch (proposed.decision) {
    case PolicyDecision.DENY:
      return {
        kind: "deny",
        message: proposed.evaluationError,
        wroteBelief: false,
      };
    case PolicyDecision.EVALUATION_ERROR:
      return {
        kind: "error",
        message: proposed.evaluationError ?? "action preview evaluation error",
        wroteBelief: false,
      };
    case PolicyDecision.PERMIT: {
      if (proposed.proposal === undefined) {
        return {
          kind: "error",
          message: "permit without proposal",
          wroteBelief: false,
        };
      }
      return {
        kind: "permit",
        proposalId: proposed.proposal.proposalId ?? "",
        status:
          proposed.proposal.status === ProposalStatus.AWAITING_APPROVAL
            ? "awaiting_approval"
            : "ready",
        wroteBelief: false,
      };
    }
    case PolicyDecision.UNSPECIFIED:
      return {
        kind: "error",
        message: "unspecified policy decision",
        wroteBelief: false,
      };
    default: {
      const exhaustive: never = proposed.decision;
      return exhaustive;
    }
  }
}

function commitFromResponse(response: CommitView): ActionCommitResult {
  switch (response.status) {
    case CommitStatus.COMMITTED:
      return {
        kind: "committed",
        operationId: response.receipt?.operationId ?? "",
        recordIds: response.receipt?.recordIds ?? [],
      };
    case CommitStatus.CONFLICT:
    case CommitStatus.IDENTITY_COLLISION:
      return { kind: "conflict", message: response.error };
    case CommitStatus.DENIED:
      return { kind: "denied", message: response.error };
    case CommitStatus.EVALUATION_ERROR:
    case CommitStatus.OPERATION_MISMATCH:
    case CommitStatus.UNSPECIFIED:
      return {
        kind: "error",
        message: response.error || `commit status ${response.status}`,
      };
    case CommitStatus.STALE:
      return { kind: "stale" };
    default: {
      const exhaustive: never = response.status;
      return exhaustive;
    }
  }
}

function encodeActionInputs(action: ActionDefinition, inputs: object) {
  const record = asInputRecord(inputs);
  return action.inputs.map((input) => {
    const raw = record[input.id];
    if (raw === undefined) {
      throw new Error(`action ${action.id} missing input ${input.id}`);
    }
    return create(ActionInputSchema, {
      inputId: input.id,
      value: encodeExactValue(input.valueType, raw),
    });
  });
}

function asInputRecord(
  inputs: object,
): Readonly<Record<string, OsdkInputValue>> {
  const record: Record<string, OsdkInputValue> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (isInputValue(value)) {
      record[key] = value;
    }
  }
  return record;
}

function isInputValue(value: unknown): value is OsdkInputValue {
  if (typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  return (
    "amount" in value &&
    "unit" in value &&
    typeof value.amount === "string" &&
    typeof value.unit === "string"
  );
}

function encodeExactValue(valueType: ValueType, raw: OsdkInputValue) {
  switch (valueType.kind) {
    case "bool":
      if (typeof raw !== "boolean") {
        throw new Error("expected boolean action input");
      }
      return create(ExactValueSchema, {
        value: { case: "boolValue", value: raw },
      });
    case "decimal":
      if (typeof raw !== "string") {
        throw new Error("expected decimal string action input");
      }
      return create(ExactValueSchema, {
        value: { case: "decimalValue", value: raw },
      });
    case "entity":
      if (typeof raw !== "string") {
        throw new Error("expected entity ref action input");
      }
      return create(ExactValueSchema, {
        value: { case: "entityRefValue", value: raw },
      });
    case "integer":
      if (typeof raw !== "string") {
        throw new Error("expected integer string action input");
      }
      return create(ExactValueSchema, {
        value: { case: "integerValue", value: raw },
      });
    case "quantity":
      if (!isQuantity(raw)) {
        throw new Error("expected quantity action input");
      }
      if (raw.unit !== valueType.unit) {
        throw new Error(
          `quantity unit ${raw.unit} does not match ${valueType.unit}`,
        );
      }
      return create(ExactValueSchema, {
        value: {
          case: "quantityValue",
          value: create(QuantityValueSchema, {
            amount: raw.amount,
            unit: raw.unit,
          }),
        },
      });
    case "text":
      if (typeof raw !== "string") {
        throw new Error("expected text action input");
      }
      return create(ExactValueSchema, {
        value: { case: "textValue", value: raw },
      });
    default: {
      const exhaustive: never = valueType;
      return exhaustive;
    }
  }
}

export type { OsdkQuantity };
