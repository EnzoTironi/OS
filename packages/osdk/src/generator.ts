import type { CompiledDefinition, InputDefinition } from "@zoen/ontology";
import type { OsdkActionModel, OsdkModel, OsdkTypeModel } from "./model.js";
import { buildOsdkModel } from "./model.js";
import { emitPropertyName } from "./names.js";
import { emitClaimTypeScript, emitExactValueTypeScript } from "./values.js";

export interface GeneratedOsdkModules {
  readonly files: {
    readonly "actions.ts": string;
    readonly "index.ts": string;
    readonly "objects.ts": string;
  };
}

export function generateOsdkModules(
  compiled: CompiledDefinition,
): GeneratedOsdkModules {
  const model = buildOsdkModel(compiled);
  return {
    files: {
      "actions.ts": emitActionsModule(model),
      "index.ts": emitIndexModule(model),
      "objects.ts": emitObjectsModule(model),
    },
  };
}

function emitObjectsModule(model: OsdkModel): string {
  const interfaces = model.types.map(emitTypeInterfaces).join("\n\n");
  const objectsType = [
    "export interface OsdkObjects {",
    ...model.types.map(
      (type) =>
        `  readonly ${emitPropertyName(type.apiName)}: TypeQuery<${type.apiName}>;`,
    ),
    "}",
  ].join("\n");
  const computationsType = [
    "export interface OsdkComputations {",
    ...model.computations.map(
      (computation) =>
        `  readonly ${emitPropertyName(computation.apiName)}: (input: { readonly entityId: string }) => Promise<ClaimRead>;`,
    ),
    "}",
  ].join("\n");
  return `${generatedHeader()}
import type { ClaimRead, TypeQuery } from "@zoen/osdk";

${interfaces}

${objectsType}

${computationsType}

export const osdkDefinition = ${JSON.stringify(definitionDocument(model), null, 2)} as const;
`;
}

function emitTypeInterfaces(type: OsdkTypeModel): string {
  const values = [
    `export interface ${type.apiName}Values {`,
    ...type.valueRelations.map(
      (relation) =>
        `  readonly ${emitPropertyName(relation.apiName)}: ${emitClaimTypeScript(relation.cardinality)};`,
    ),
    "}",
  ].join("\n");
  const links = [
    `export interface ${type.apiName}Links {`,
    ...type.links.map((link) => {
      switch (link.cardinality) {
        case "many":
          return `  readonly ${emitPropertyName(link.apiName)}: () => Promise<readonly string[]>;`;
        case "one":
          return `  readonly ${emitPropertyName(link.apiName)}: () => Promise<string | null>;`;
        default: {
          const exhaustive: never = link.cardinality;
          return exhaustive;
        }
      }
    }),
    "}",
  ].join("\n");
  const object = [
    `export interface ${type.apiName} {`,
    "  readonly entityId: string;",
    `  readonly links: ${type.apiName}Links;`,
    `  readonly typeId: ${JSON.stringify(type.typeId)};`,
    `  readonly values: ${type.apiName}Values;`,
    "}",
  ].join("\n");
  return `${values}\n\n${links}\n\n${object}`;
}

function emitActionsModule(model: OsdkModel): string {
  const inputTypes = model.actions.map(emitActionInputs).join("\n\n");
  const actionsType = [
    "export interface OsdkActions {",
    ...model.actions.map((action) => emitActionHandle(action)),
    "}",
  ].join("\n");
  return `${generatedHeader()}
import type { ExactValue } from "@zoen/ontology";
import type {
  ActionCommitResult,
  ActionPreviewResult,
} from "@zoen/osdk";

${inputTypes}

${actionsType}
`;
}

function emitActionInputs(action: OsdkActionModel): string {
  const fields = action.action.inputs.map((input) => {
    return `  readonly ${emitPropertyName(input.id)}: ${emitExactValueTypeScript()};`;
  });
  return `export interface ${action.apiName}Inputs {\n${fields.join("\n")}\n}`;
}

function emitActionHandle(action: OsdkActionModel): string {
  const inputs = `${action.apiName}Inputs`;
  return `  readonly ${emitPropertyName(action.apiName)}: {
    /**
     * Propose only. Does not write World claims. Cedar runs on zoend.
     */
    preview(call: {
      readonly expiresAt: Date;
      readonly inputs: ${inputs};
      readonly operationId: string;
      readonly proposalId: string;
      readonly resourceId: string;
      readonly validAt: Date;
    }): Promise<ActionPreviewResult>;
    /**
     * Propose → Approve if required → Commit on zoend (Action + Cedar).
     * This client never writes belief through World.recordEvidence.
     */
    commit(call: {
      readonly approvalId: string;
      readonly expiresAt: Date;
      readonly inputs: ${inputs};
      readonly operationId: string;
      readonly previewHash: string;
      readonly proposalId: string;
      readonly resourceId: string;
      readonly validAt: Date;
    }): Promise<ActionCommitResult>;
  };`;
}

function emitIndexModule(model: OsdkModel): string {
  const objectExports = model.types
    .map(
      (type) =>
        `  ${type.apiName},\n  ${type.apiName}Links,\n  ${type.apiName}Values,`,
    )
    .join("\n");
  const actionExports = model.actions
    .map((action) => `  ${action.apiName}Inputs,`)
    .join("\n");
  return `${generatedHeader()}
export type {
${objectExports}
  OsdkComputations,
  OsdkObjects,
} from "./objects.js";
export { osdkDefinition } from "./objects.js";
export type {
${actionExports}
  OsdkActions,
} from "./actions.js";
`;
}

function definitionDocument(model: OsdkModel) {
  return {
    actions: model.actions.map((action) => ({
      actionId: action.action.id,
      apiName: action.apiName,
      inputs: action.action.inputs.map(inputDocument),
    })),
    computations: model.computations.map((computation) => ({
      apiName: computation.apiName,
      computationId: computation.computationId,
      returns: computation.returns,
    })),
    definitionId: model.definitionId,
    digest: model.digest,
    revision: model.revision,
    types: model.types.map((type) => ({
      apiName: type.apiName,
      links: type.links,
      typeId: type.typeId,
      valueRelations: type.valueRelations,
    })),
  };
}

function inputDocument(input: InputDefinition) {
  return { id: input.id, valueType: input.valueType };
}

function generatedHeader(): string {
  return `// Generated by @zoen/osdk from a compiled .zoen.ts definition.
// objects.<Type> is a SemanticQuery helper. Links walk relations to entity ids.
// computations.<Name> is SemanticQuery selection.computationId.
// Belief writes go through actions.preview / actions.commit (zoend Action + Cedar).`;
}
