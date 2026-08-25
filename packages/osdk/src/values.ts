import type { ExactValue, ValueType } from "@zoen/ontology";
import type { ExactValue as ProtoExactValue } from "../../sdk/src/gen/zoen/world/v1/world_pb.js";

/**
 * Maps a live `ValueType` from `model.ts` to the TypeScript surface a
 * generated action input uses. The wire value is still `ExactValue`.
 */
export function emitExactValueTypeScript(): string {
  return "ExactValue";
}

export function emitClaimTypeScript(cardinality: "many" | "one"): string {
  switch (cardinality) {
    case "many":
      return "readonly ExactValue[]";
    case "one":
      return "ExactValue | null";
    default: {
      const exhaustive: never = cardinality;
      return exhaustive;
    }
  }
}

/**
 * Boundary: proto `ExactValue` oneof → ontology `ExactValue`.
 * Missing or empty oneof is a known-empty claim (`null`), not omitted.
 */
export function exactValueFromProto(
  value: ProtoExactValue | undefined,
): ExactValue | null {
  if (value === undefined) {
    return null;
  }
  const inner = value.value;
  switch (inner.case) {
    case "boolValue":
      return { kind: "bool", value: inner.value };
    case "decimalValue":
      return { kind: "decimal", value: inner.value };
    case "entityRefValue":
      return { kind: "entity", value: inner.value };
    case "integerValue":
      return { kind: "integer", value: inner.value };
    case "quantityValue":
      return {
        amount: inner.value.amount,
        kind: "quantity",
        unit: inner.value.unit,
      };
    case "textValue":
      return { kind: "text", value: inner.value };
    case undefined:
      return null;
    default: {
      const exhaustive: never = inner;
      return exhaustive;
    }
  }
}

export function isExactValue(value: unknown): value is ExactValue {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    return false;
  }
  switch (value.kind) {
    case "bool":
      return "value" in value && typeof value.value === "boolean";
    case "decimal":
    case "entity":
    case "integer":
    case "text":
      return "value" in value && typeof value.value === "string";
    case "quantity":
      return (
        "amount" in value &&
        "unit" in value &&
        typeof value.amount === "string" &&
        typeof value.unit === "string"
      );
    default:
      return false;
  }
}

export function assertExactValueMatchesType(
  valueType: ValueType,
  value: ExactValue,
): void {
  if (value.kind !== valueType.kind) {
    throw new Error(
      `ExactValue kind ${value.kind} does not match ${valueType.kind}`,
    );
  }
  if (valueType.kind === "quantity" && value.kind === "quantity") {
    if (value.unit !== valueType.unit) {
      throw new Error(
        `quantity unit ${value.unit} does not match ${valueType.unit}`,
      );
    }
  }
}
