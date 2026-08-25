import type { ValueType } from "@zoen/ontology";

export interface OsdkQuantity {
  readonly amount: string;
  readonly unit: string;
}

export type OsdkInputValue = boolean | string | OsdkQuantity;

export type PropScalar = boolean | string | OsdkQuantity;

export type PropValue = PropScalar | readonly PropScalar[] | undefined;

export type WireValue =
  | { readonly case: "boolValue"; readonly value: boolean }
  | { readonly case: "decimalValue"; readonly value: string }
  | { readonly case: "entityRefValue"; readonly value: string }
  | { readonly case: "integerValue"; readonly value: string }
  | {
      readonly case: "quantityValue";
      readonly value: { readonly amount: string; readonly unit: string };
    }
  | { readonly case: "textValue"; readonly value: string }
  | { readonly case: undefined; readonly value?: undefined };

export function isQuantity(value: OsdkInputValue): value is OsdkQuantity {
  return typeof value === "object" && value !== null;
}

export function emitValueTypeScript(valueType: ValueType): string {
  switch (valueType.kind) {
    case "bool":
      return "boolean";
    case "decimal":
    case "entity":
    case "integer":
    case "text":
      return "string";
    case "quantity":
      return "OsdkQuantity";
    default: {
      const exhaustive: never = valueType;
      return exhaustive;
    }
  }
}

export function emitCardinalTypeScript(
  cardinality: "many" | "one",
  inner: string,
): string {
  switch (cardinality) {
    case "many":
      return `readonly ${inner}[]`;
    case "one":
      return `${inner} | undefined`;
    default: {
      const exhaustive: never = cardinality;
      return exhaustive;
    }
  }
}

export function decodeWireValue(value: WireValue): PropScalar {
  switch (value.case) {
    case "boolValue":
      return value.value;
    case "decimalValue":
    case "entityRefValue":
    case "integerValue":
    case "textValue":
      return value.value;
    case "quantityValue":
      return { amount: value.value.amount, unit: value.value.unit };
    case undefined:
      throw new Error("semantic query value is empty");
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}
