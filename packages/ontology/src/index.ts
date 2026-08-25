import type {
  ActionDefinition,
  ComputationDefinition,
  RawDefinitionBundle,
  RelationDefinition,
  TypeDefinition,
} from "./model.js";

export { compileDefinition } from "./compiler.js";
export {
  ACTION_PREVIEW_LOCALE,
  ACTION_PREVIEW_SCHEMA,
  actionPreviewHash,
  buildActionPreviewDocument,
  canonicalPreviewText,
  toWireDocument,
} from "./action-preview.js";
export type {
  ActionPreviewDocument,
  ActionPreviewInput,
  ActionPreviewValue,
} from "./action-preview.js";
export {
  JcsError,
  canonicalizeJson,
  canonicalizeJsonBytes,
  isCanonicalDigestHex,
  sha256Hex,
} from "./jcs.js";
export type {
  ActionDefinition,
  ActionEffect,
  ActionOutputDefinition,
  CanonicalDefinitionBundle,
  CompiledDefinition,
  ComputationDefinition,
  ExactValue,
  Expression,
  InputDefinition,
  RawDefinitionBundle,
  RelationDefinition,
  RelationTarget,
  TypeDefinition,
  ValueType,
} from "./model.js";

export function defineAction(
  definition: ActionDefinition,
): ActionDefinition {
  return definition;
}

export function defineBundle(
  definition: RawDefinitionBundle,
): RawDefinitionBundle {
  return definition;
}

export function defineComputation(
  definition: ComputationDefinition,
): ComputationDefinition {
  return definition;
}

export function defineRelation(
  definition: RelationDefinition,
): RelationDefinition {
  return definition;
}

export function defineType(definition: TypeDefinition): TypeDefinition {
  return definition;
}
