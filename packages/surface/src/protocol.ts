import {
  EffectKnowledgeState,
  LineageRole,
  type EffectSnapshot,
  type ExactValue,
  type SemanticQueryResponse,
} from "@zoen/sdk";
import type {
  EffectStatusView,
  QueryBindingView,
  SurfaceExactValue,
} from "./model.js";

export function queryBindingView(
  response: SemanticQueryResponse,
): QueryBindingView {
  return {
    actualCommitSequence: response.actualCommitSequence.toString(),
    values: response.values.map((result) => {
      if (result.value === undefined) {
        throw new Error("SemanticQuery returned a value without a payload");
      }
      return {
        evidence: result.dependencies.map((dependency) => ({
          claimId: dependency.claimId,
          role: lineageRoleName(dependency.role),
          sourceRef: dependency.sourceRef,
        })),
        value: exactValueView(result.value),
      };
    }),
  };
}

export function effectStatusView(snapshot: EffectSnapshot): EffectStatusView {
  const request = snapshot.request;
  if (request === undefined) {
    return { kind: "none" };
  }
  switch (request.state) {
    case EffectKnowledgeState.NOT_ATTEMPTED:
    case EffectKnowledgeState.DEFINITELY_NOT_SENT:
    case EffectKnowledgeState.ACCEPTED_PENDING:
      return {
        effectRequestId: request.effectRequestId,
        kind: "pending",
      };
    case EffectKnowledgeState.UNKNOWN:
    case EffectKnowledgeState.UNSPECIFIED:
      return {
        effectRequestId: request.effectRequestId,
        kind: "unknown",
      };
    case EffectKnowledgeState.CONFIRMED:
      return {
        effectRequestId: request.effectRequestId,
        kind: "settled",
        outcome: "confirmed",
      };
    case EffectKnowledgeState.CONFIRMED_NO_EFFECT:
      return {
        effectRequestId: request.effectRequestId,
        kind: "settled",
        outcome: "confirmed-no-effect",
      };
    case EffectKnowledgeState.CONTRADICTED:
      return {
        effectRequestId: request.effectRequestId,
        kind: "contradicted",
      };
    default: {
      const exhaustive: never = request.state;
      return exhaustive;
    }
  }
}

function exactValueView(value: ExactValue): SurfaceExactValue {
  switch (value.value.case) {
    case "boolValue":
      return { kind: "bool", value: value.value.value };
    case "decimalValue":
      return { kind: "decimal", value: value.value.value };
    case "entityRefValue":
      return { kind: "entity-ref", value: value.value.value };
    case "integerValue":
      return { kind: "integer", value: value.value.value };
    case "quantityValue":
      return {
        amount: value.value.value.amount,
        kind: "quantity",
        unit: value.value.value.unit,
      };
    case "textValue":
      return { kind: "text", value: value.value.value };
    case undefined:
      throw new Error("ExactValue has no value");
    default: {
      const exhaustive: never = value.value;
      return exhaustive;
    }
  }
}

function lineageRoleName(role: LineageRole): string {
  switch (role) {
    case LineageRole.SUPPORTING:
      return "supporting";
    case LineageRole.RIVAL:
      return "rival";
    case LineageRole.COMPUTATION_DEPENDENCY:
      return "computation-dependency";
    case LineageRole.UNSPECIFIED:
      return "unspecified";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}
