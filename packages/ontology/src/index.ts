import {
  ACTION_PREVIEW_LOCALE as actionPreviewLocale,
  ACTION_PREVIEW_SCHEMA as actionPreviewSchema,
  toWireDocument as actionPreviewToWire,
  buildActionPreviewDocument as createActionPreviewDocument,
  actionPreviewHash as hashActionPreview,
  canonicalPreviewText as previewText,
} from "./action-preview.js";
import {
  compileDefinition as compileOntologyDefinition,
  canonicalDefinitionFromJson as definitionFromCanonicalJson,
} from "./compiler.js";
import {
  canonicalizeJsonBytes as canonicalizeJsonFromBytes,
  canonicalizeJson as canonicalizeJsonText,
  isCanonicalDigestHex as digestIsCanonicalHex,
  sha256Hex as hexSha256,
  JcsError as JsonCanonicalError,
} from "./jcs.js";
import type {
  ActionDefinition,
  ComputationDefinition,
  RawDefinitionBundle,
  RelationDefinition,
  TypeDefinition,
} from "./model.js";

export type {
  ActionPreviewDocument,
  ActionPreviewInput,
  ActionPreviewValue,
} from "./action-preview.js";
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

export const ACTION_PREVIEW_LOCALE = actionPreviewLocale;
export const ACTION_PREVIEW_SCHEMA = actionPreviewSchema;
export const actionPreviewHash = hashActionPreview;
export const buildActionPreviewDocument = createActionPreviewDocument;
export const canonicalDefinitionFromJson = definitionFromCanonicalJson;
export const canonicalizeJson = canonicalizeJsonText;
export const canonicalizeJsonBytes = canonicalizeJsonFromBytes;
export const canonicalPreviewText = previewText;
export const compileDefinition = compileOntologyDefinition;
export const isCanonicalDigestHex = digestIsCanonicalHex;
export const JcsError = JsonCanonicalError;
export type JcsError = InstanceType<typeof JsonCanonicalError>;
export const sha256Hex = hexSha256;
export const toWireDocument = actionPreviewToWire;

export function defineAction(definition: ActionDefinition): ActionDefinition {
  return definition;
}

export function defineBundle(
  definition: RawDefinitionBundle
): RawDefinitionBundle {
  return definition;
}

export function defineComputation(
  definition: ComputationDefinition
): ComputationDefinition {
  return definition;
}

export function defineRelation(
  definition: RelationDefinition
): RelationDefinition {
  return definition;
}

export function defineType(definition: TypeDefinition): TypeDefinition {
  return definition;
}
