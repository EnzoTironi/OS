import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ActionDefinition, ExactValue } from "@zoen/ontology";
import {
  ActionInputSchema,
  ApproveRequestSchema,
  CommitRequestSchema,
  CommitStatus,
  DiscoverRequestSchema,
  PolicyDecision,
  ProposalStatus,
  ProposeRequestSchema,
  type ActionCapability,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  ExactValueSchema,
  QuantityValueSchema,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import type { OsdkActionsPort, OsdkDefinitionRef } from "./ports.js";
import { assertExactValueMatchesType, isExactValue } from "./values.js";

export interface ActionCall<TInputs> {
  readonly expiresAt: Date;
  readonly inputs: TInputs;
  readonly operationId: string;
  readonly proposalId: string;
  readonly resourceId: string;
  readonly validAt: Date;
}

export interface CommitCall<TInputs> extends ActionCall<TInputs> {
  readonly approvalId: string;
}

export type ActionPreviewResult =
  | { readonly kind: "deny"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "permit";
      readonly proposalId: string;
      readonly status: "awaiting_approval" | "ready";
    };

export type ActionCommitResult =
  | {
      readonly kind: "committed";
      readonly operationId: string;
      readonly recordIds: readonly string[];
    }
  | { readonly kind: "conflict"; readonly message: string }
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "stale"; readonly message: string };

export interface OsdkActionHandle<TInputs> {
  /**
   * Propose only. Does not write World claims. Cedar runs on zoend.
   */
  preview(call: ActionCall<TInputs>): Promise<ActionPreviewResult>;
  /**
   * Propose → Approve when awaiting → Commit on zoend (Action + Cedar).
   * This client never writes belief through World.recordEvidence.
   */
  commit(call: CommitCall<TInputs>): Promise<ActionCommitResult>;
}

export type DiscoveredAction = Pick<
  ActionCapability,
  "actionId" | "decision" | "evaluationError"
>;

export interface ActionRuntime {
  readonly action: ActionDefinition;
  readonly actions: OsdkActionsPort;
  readonly definition: OsdkDefinitionRef;
}

/**
 * Context: first Action door (Cedar capability list for a resource).
 * Inputs: compiled definition reference and the resource entity id.
 * Outputs: action id + decision + evaluation error. No optional policy bag.
 * Side effects: Action.discover on zoend. Does not Propose or write claims.
 */
export async function discoverActions(input: {
  readonly actions: OsdkActionsPort;
  readonly definition: OsdkDefinitionRef;
  readonly resourceId: string;
}): Promise<readonly DiscoveredAction[]> {
  const response = await input.actions.discover(
    create(DiscoverRequestSchema, {
      definition: input.definition,
      resourceId: input.resourceId,
    }),
  );
  return response.actions.map((item) => ({
    actionId: item.actionId,
    decision: item.decision,
    evaluationError: item.evaluationError,
  }));
}

export function createActionHandle<TInputs>(
  runtime: ActionRuntime,
): OsdkActionHandle<TInputs> {
  return {
    commit: (call) => commitAction({ call, runtime }),
    preview: (call) => previewAction({ call, runtime }),
  };
}

export async function previewAction(input: {
  readonly call: ActionCall<unknown>;
  readonly runtime: ActionRuntime;
}): Promise<ActionPreviewResult> {
  const proposed = await input.runtime.actions.propose(
    proposeRequest(input.runtime, input.call),
  );
  return previewFromPropose(proposed);
}

export async function commitAction(input: {
  readonly call: CommitCall<unknown>;
  readonly runtime: ActionRuntime;
}): Promise<ActionCommitResult> {
  const proposed = await input.runtime.actions.propose(
    proposeRequest(input.runtime, input.call),
  );
  if (proposed.decision !== PolicyDecision.PERMIT || proposed.proposal === undefined) {
    if (proposed.decision === PolicyDecision.EVALUATION_ERROR) {
      return {
        kind: "error",
        message: proposed.evaluationError || "action evaluation error",
      };
    }
    return {
      kind: "denied",
      message: proposed.evaluationError || "action denied",
    };
  }
  if (proposed.proposal.status === ProposalStatus.AWAITING_APPROVAL) {
    const approved = await input.runtime.actions.approve(
      create(ApproveRequestSchema, {
        approvalId: input.call.approvalId,
        expiresAt: timestampFromDate(input.call.expiresAt),
        proposalId: proposed.proposal.proposalId,
      }),
    );
    if (approved.decision !== PolicyDecision.PERMIT) {
      if (approved.decision === PolicyDecision.EVALUATION_ERROR) {
        return {
          kind: "error",
          message: approved.evaluationError || "action approval evaluation error",
        };
      }
      return {
        kind: "denied",
        message: approved.evaluationError || "action approval denied",
      };
    }
  }
  const committed = await input.runtime.actions.commit(
    create(CommitRequestSchema, {
      operationId: input.call.operationId,
      proposalId: proposed.proposal.proposalId,
    }),
  );
  return commitFromResponse(committed);
}

function proposeRequest(runtime: ActionRuntime, call: ActionCall<unknown>) {
  return create(ProposeRequestSchema, {
    actionId: runtime.action.id,
    definition: runtime.definition,
    expiresAt: timestampFromDate(call.expiresAt),
    inputs: encodeActionInputs(runtime.action, call.inputs),
    operationId: call.operationId,
    proposalId: call.proposalId,
    resourceId: call.resourceId,
    validAt: timestampFromDate(call.validAt),
  });
}

function previewFromPropose(
  proposed: Awaited<ReturnType<OsdkActionsPort["propose"]>>,
): ActionPreviewResult {
  switch (proposed.decision) {
    case PolicyDecision.DENY:
      return {
        kind: "deny",
        message: proposed.evaluationError || "action denied",
      };
    case PolicyDecision.EVALUATION_ERROR:
      return {
        kind: "error",
        message: proposed.evaluationError || "action preview evaluation error",
      };
    case PolicyDecision.PERMIT: {
      if (proposed.proposal === undefined) {
        return { kind: "error", message: "permit without proposal" };
      }
      return {
        kind: "permit",
        proposalId: proposed.proposal.proposalId,
        status:
          proposed.proposal.status === ProposalStatus.AWAITING_APPROVAL
            ? "awaiting_approval"
            : "ready",
      };
    }
    case PolicyDecision.UNSPECIFIED:
      return { kind: "error", message: "unspecified policy decision" };
    default: {
      const exhaustive: never = proposed.decision;
      return exhaustive;
    }
  }
}

function commitFromResponse(
  response: Awaited<ReturnType<OsdkActionsPort["commit"]>>,
): ActionCommitResult {
  switch (response.status) {
    case CommitStatus.COMMITTED: {
      if (response.receipt === undefined) {
        return { kind: "error", message: "committed without receipt" };
      }
      return {
        kind: "committed",
        operationId: response.receipt.operationId,
        recordIds: response.receipt.recordIds,
      };
    }
    case CommitStatus.CONFLICT:
    case CommitStatus.IDENTITY_COLLISION:
      return {
        kind: "conflict",
        message: response.error || "commit identity collision",
      };
    case CommitStatus.DENIED:
      return { kind: "denied", message: response.error || "commit denied" };
    case CommitStatus.EVALUATION_ERROR:
    case CommitStatus.OPERATION_MISMATCH:
    case CommitStatus.UNSPECIFIED:
      return {
        kind: "error",
        message: response.error || `commit status ${response.status}`,
      };
    case CommitStatus.STALE:
      return { kind: "stale", message: response.error || "commit stale" };
    default: {
      const exhaustive: never = response.status;
      return exhaustive;
    }
  }
}

function encodeActionInputs(action: ActionDefinition, inputs: unknown) {
  if (inputs === null || typeof inputs !== "object") {
    throw new Error(`action ${action.id} inputs must be an object`);
  }
  return action.inputs.map((input) => {
    if (!(input.id in inputs)) {
      throw new Error(`action ${action.id} missing input ${input.id}`);
    }
    const raw = Reflect.get(inputs, input.id);
    if (!isExactValue(raw)) {
      throw new Error(`action ${action.id} input ${input.id} is not ExactValue`);
    }
    assertExactValueMatchesType(input.valueType, raw);
    return create(ActionInputSchema, {
      inputId: input.id,
      value: encodeProtoExactValue(raw),
    });
  });
}

function encodeProtoExactValue(raw: ExactValue) {
  switch (raw.kind) {
    case "bool":
      return create(ExactValueSchema, {
        value: { case: "boolValue", value: raw.value },
      });
    case "decimal":
      return create(ExactValueSchema, {
        value: { case: "decimalValue", value: raw.value },
      });
    case "entity":
      return create(ExactValueSchema, {
        value: { case: "entityRefValue", value: raw.value },
      });
    case "integer":
      return create(ExactValueSchema, {
        value: { case: "integerValue", value: raw.value },
      });
    case "quantity":
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
      return create(ExactValueSchema, {
        value: { case: "textValue", value: raw.value },
      });
    default: {
      const exhaustive: never = raw;
      return exhaustive;
    }
  }
}
