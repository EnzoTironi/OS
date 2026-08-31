export type ValueType =
  | { readonly kind: "bool" }
  | { readonly kind: "decimal" }
  | { readonly kind: "entity"; readonly typeId: string }
  | { readonly kind: "integer" }
  | { readonly kind: "quantity"; readonly unit: string }
  | { readonly kind: "text" };

export type ExactValue =
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "decimal"; readonly value: string }
  | { readonly kind: "entity"; readonly value: string }
  | { readonly kind: "integer"; readonly value: string }
  | {
      readonly kind: "quantity";
      readonly amount: string;
      readonly unit: string;
    }
  | { readonly kind: "text"; readonly value: string };

export type Expression =
  | {
      readonly kind: "binary";
      readonly left: Expression;
      readonly operator: "add" | "greater_than" | "multiply" | "subtract";
      readonly right: Expression;
    }
  | { readonly kind: "input"; readonly inputId: string }
  | { readonly kind: "literal"; readonly value: ExactValue }
  | { readonly kind: "relation"; readonly relationId: string };

export interface InputDefinition {
  readonly id: string;
  readonly valueType: ValueType;
}

export interface TypeDefinition {
  readonly attributes: readonly InputDefinition[];
  readonly id: string;
}

export type RelationTarget =
  | { readonly kind: "type"; readonly typeId: string }
  | { readonly kind: "value"; readonly valueType: ValueType };

export interface RelationDefinition {
  readonly cardinality: "many" | "one";
  readonly id: string;
  readonly sourceType: string;
  readonly target: RelationTarget;
}

export interface ComputationDefinition {
  readonly expression: Expression;
  readonly id: string;
  readonly inputs: readonly InputDefinition[];
  readonly returns: ValueType;
}

export interface ActionEffect {
  readonly relationId: string;
  readonly value: Expression;
}

export interface ActionOutputDefinition {
  readonly id: string;
  readonly valueType: ValueType;
}

export interface ActionDefinition {
  readonly effects: readonly ActionEffect[];
  readonly id: string;
  readonly inputs: readonly InputDefinition[];
  readonly outputs?: readonly ActionOutputDefinition[];
  readonly precondition: Expression;
}

export interface RawDefinitionBundle {
  readonly actions: readonly ActionDefinition[];
  readonly computations: readonly ComputationDefinition[];
  readonly id: string;
  readonly relations: readonly RelationDefinition[];
  readonly revision: number;
  readonly types: readonly TypeDefinition[];
}

export interface CanonicalDefinitionBundle {
  readonly actions: readonly ActionDefinition[];
  readonly computations: readonly ComputationDefinition[];
  readonly definitionId: string;
  readonly relations: readonly RelationDefinition[];
  readonly revision: number;
  readonly schema: "zoen.definition.v1";
  readonly types: readonly TypeDefinition[];
}

export interface CompiledDefinition {
  readonly canonicalJson: string;
  readonly definition: CanonicalDefinitionBundle;
  readonly digest: string;
}
