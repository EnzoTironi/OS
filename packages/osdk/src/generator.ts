import type { CompiledDefinition, InputDefinition } from "@zoen/ontology";
import type { OsdkActionModel, OsdkModel, OsdkTypeModel } from "./model.js";
import { buildOsdkModel } from "./model.js";
import { emitPropertyName } from "./names.js";
import { emitCardinalTypeScript, emitValueTypeScript } from "./values.js";

export interface GeneratedOsdkModules {
  readonly files: {
    readonly "actions.ts": string;
    readonly "index.ts": string;
    readonly "objects.ts": string;
  };
}

/**
 * Context: compile a `.zoen.ts` bundle, then emit typed OSDK modules.
 * Inputs: `CompiledDefinition` from `@zoen/ontology`.
 * Outputs: TypeScript modules for `objects.<Type>`, links, and
 * `actions.<Name>.preview` / `actions.<Name>.commit`.
 * Side effects: none. Pure string generation.
 */
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
        `  readonly ${emitPropertyName(type.apiName)}: ObjectSet<${type.apiName}>;`,
    ),
    "}",
  ].join("\n");
  return `${generatedHeader()}
import type {
  ManyLinkAccessor,
  ObjectSet,
  OsdkQuantity,
  SingleLinkAccessor,
} from "@zoen/osdk";

${interfaces}

${objectsType}

export const osdkDefinition = ${JSON.stringify(definitionDocument(model), null, 2)} as const;
`;
}

function emitTypeInterfaces(type: OsdkTypeModel): string {
  const props = [
    `export interface ${type.apiName}Props {`,
    ...type.attributes.map(
      (attribute) =>
        `  readonly ${emitPropertyName(attribute.apiName)}: ${emitValueTypeScript(attribute.valueType)} | undefined;`,
    ),
    ...type.props.map(
      (prop) =>
        `  readonly ${emitPropertyName(prop.apiName)}: ${emitCardinalTypeScript(prop.cardinality, emitValueTypeScript(prop.valueType))};`,
    ),
    "}",
  ].join("\n");
  const links = [
    `export interface ${type.apiName}Links {`,
    ...type.links.map((link) => {
      switch (link.cardinality) {
        case "many":
          return `  readonly ${emitPropertyName(link.apiName)}: ManyLinkAccessor<${link.targetApiName}>;`;
        case "one":
          return `  readonly ${emitPropertyName(link.apiName)}: SingleLinkAccessor<${link.targetApiName}>;`;
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
    "  readonly $claimProjection: true;",
    "  readonly $primaryKey: string;",
    `  readonly $typeId: ${JSON.stringify(type.typeId)};`,
    `  readonly links: ${type.apiName}Links;`,
    `  readonly props: ${type.apiName}Props;`,
    "}",
  ].join("\n");
  return `${props}\n\n${links}\n\n${object}`;
}

function emitActionsModule(model: OsdkModel): string {
  const inputTypes = model.actions.map(emitActionInputs).join("\n\n");
  const actionsType = [
    "export interface OsdkActions {",
    ...model.actions.map((action) => emitActionHandle(action)),
    "}",
  ].join("\n");
  return `${generatedHeader()}
import type {
  ActionCommitResult,
  ActionPreviewResult,
  OsdkQuantity,
} from "@zoen/osdk";

${inputTypes}

${actionsType}
`;
}

function emitActionInputs(action: OsdkActionModel): string {
  const fields = action.action.inputs.map((input) => {
    return `  readonly ${emitPropertyName(input.id)}: ${emitValueTypeScript(input.valueType)};`;
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
      readonly expiresAt?: Date;
      readonly inputs: ${inputs};
      readonly operationId: string;
      readonly proposalId: string;
      readonly resourceId: string;
      readonly validAt?: Date;
    }): Promise<ActionPreviewResult>;
    /**
     * Propose → Approve if required → Commit on zoend (Action + Cedar).
     * This client never writes belief through World.recordEvidence.
     */
    commit(call: {
      readonly approvalId?: string;
      readonly expiresAt?: Date;
      readonly inputs: ${inputs};
      readonly operationId: string;
      readonly proposalId: string;
      readonly resourceId: string;
      readonly validAt?: Date;
    }): Promise<ActionCommitResult>;
  };`;
}

function emitIndexModule(model: OsdkModel): string {
  const objectExports = model.types
    .map(
      (type) =>
        `  ${type.apiName},\n  ${type.apiName}Links,\n  ${type.apiName}Props,`,
    )
    .join("\n");
  const actionExports = model.actions
    .map((action) => `  ${action.apiName}Inputs,`)
    .join("\n");
  return `${generatedHeader()}
export type {
${objectExports}
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
    definitionId: model.definitionId,
    digest: model.digest,
    revision: model.revision,
    types: model.types.map((type) => ({
      apiName: type.apiName,
      attributes: type.attributes.map((attribute) => ({
        apiName: attribute.apiName,
        valueType: attribute.valueType,
      })),
      links: type.links,
      props: type.props,
      typeId: type.typeId,
    })),
  };
}

function inputDocument(input: InputDefinition) {
  return { id: input.id, valueType: input.valueType };
}

function generatedHeader(): string {
  return `// Generated by @zoen/osdk from a compiled .zoen.ts definition.
// Objects are projections of World claims, not a second store.
// Belief writes go through actions.preview / actions.commit (zoend Action + Cedar).`;
}
