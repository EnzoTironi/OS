import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  ActionInputSchema,
  type ActionInput,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  ExactValueSchema,
  QuantityValueSchema,
  type DefinitionReference,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionId,
  correctionEntityId,
  resourceId,
  validAt,
} from "./ids.js";
import type { ActionClient } from "./support.js";

export function changeCommitmentRequest(
  definition: DefinitionReference,
  suffix: string,
) {
  return {
    actionId,
    definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      entityInput("correctionOf", correctionEntityId),
      quantityInput("quantity", "8", "each"),
      integerInput("revision", "2"),
      decimalInput("unitPrice", "19.99"),
    ],
    operationId: `operation.changeCommitment.${suffix}`,
    proposalId: `proposal.changeCommitment.${suffix}`,
    resourceId,
    validAt: timestampFromDate(validAt),
  };
}

export function previewChangeCommitment(
  actions: ActionClient,
  request: ReturnType<typeof changeCommitmentRequest>,
) {
  return actions.propose(request);
}

export function commitChangeCommitment(
  actions: ActionClient,
  request: ReturnType<typeof changeCommitmentRequest>,
) {
  return actions.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
}

function entityInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: { case: "entityRefValue", value },
    }),
  });
}

function quantityInput(
  inputId: string,
  amount: string,
  unit: string,
): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: {
        case: "quantityValue",
        value: create(QuantityValueSchema, { amount, unit }),
      },
    }),
  });
}

function integerInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: { case: "integerValue", value },
    }),
  });
}

function decimalInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: { case: "decimalValue", value },
    }),
  });
}
