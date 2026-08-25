import type {
  ActionDefinition,
  CompiledDefinition,
  RelationDefinition,
  ValueType,
} from "@zoen/ontology";
import { apiNameFromId, assertUniqueApiNames } from "./names.js";

export interface OsdkAttributeModel {
  readonly apiName: string;
  readonly valueType: ValueType;
}

export interface OsdkValueRelationModel {
  readonly apiName: string;
  readonly cardinality: "many" | "one";
  readonly relationId: string;
  readonly valueType: ValueType;
}

export interface OsdkLinkModel {
  readonly apiName: string;
  readonly cardinality: "many" | "one";
  readonly relationId: string;
  readonly targetApiName: string;
  readonly targetTypeId: string;
}

export interface OsdkTypeModel {
  readonly apiName: string;
  readonly attributes: readonly OsdkAttributeModel[];
  readonly links: readonly OsdkLinkModel[];
  readonly typeId: string;
  readonly valueRelations: readonly OsdkValueRelationModel[];
}

export interface OsdkActionModel {
  readonly action: ActionDefinition;
  readonly apiName: string;
}

export interface OsdkComputationModel {
  readonly apiName: string;
  readonly computationId: string;
  readonly returns: ValueType;
}

export interface OsdkModel {
  readonly actions: readonly OsdkActionModel[];
  readonly computations: readonly OsdkComputationModel[];
  readonly definitionId: string;
  readonly digest: string;
  readonly revision: number;
  readonly types: readonly OsdkTypeModel[];
}

/**
 * Projects a compiled definition into objects / links / computations / actions.
 * API names are the last id segment (`commercial.OrderLine` → `OrderLine`).
 */
export function buildOsdkModel(compiled: CompiledDefinition): OsdkModel {
  const { definition, digest } = compiled;
  assertUniqueApiNames(
    definition.types.map((type) => type.id),
    "type",
  );
  assertUniqueApiNames(
    definition.actions.map((action) => action.id),
    "action",
  );
  assertUniqueApiNames(
    definition.computations.map((computation) => computation.id),
    "computation",
  );

  const types = sortByApiName(
    definition.types.map((type) => {
      const attributes = type.attributes.map((attribute) => ({
        apiName: attribute.id,
        valueType: attribute.valueType,
      }));
      const links: OsdkLinkModel[] = [];
      const valueRelations: OsdkValueRelationModel[] = [];
      for (const relation of definition.relations) {
        if (relation.sourceType !== type.id) {
          continue;
        }
        pushRelation(relation, links, valueRelations);
      }
      const model: OsdkTypeModel = {
        apiName: apiNameFromId(type.id),
        attributes,
        links: sortByApiName(links),
        typeId: type.id,
        valueRelations: sortByApiName(valueRelations),
      };
      assertUniqueMemberNames(model);
      return model;
    }),
  );

  return {
    actions: sortByApiName(
      definition.actions.map((action) => ({
        action,
        apiName: apiNameFromId(action.id),
      })),
    ),
    computations: sortByApiName(
      definition.computations.map((computation) => ({
        apiName: apiNameFromId(computation.id),
        computationId: computation.id,
        returns: computation.returns,
      })),
    ),
    definitionId: definition.definitionId,
    digest,
    revision: definition.revision,
    types,
  };
}

function pushRelation(
  relation: RelationDefinition,
  links: OsdkLinkModel[],
  valueRelations: OsdkValueRelationModel[],
): void {
  switch (relation.target.kind) {
    case "type":
      links.push({
        apiName: apiNameFromId(relation.id),
        cardinality: relation.cardinality,
        relationId: relation.id,
        targetApiName: apiNameFromId(relation.target.typeId),
        targetTypeId: relation.target.typeId,
      });
      return;
    case "value":
      valueRelations.push({
        apiName: apiNameFromId(relation.id),
        cardinality: relation.cardinality,
        relationId: relation.id,
        valueType: relation.target.valueType,
      });
      return;
    default: {
      const exhaustive: never = relation.target;
      void exhaustive;
    }
  }
}

function assertUniqueMemberNames(type: OsdkTypeModel): void {
  const seen = new Map<string, string>();
  const members: readonly { readonly apiName: string; readonly kind: string }[] =
    [
      ...type.attributes.map((member) => ({
        apiName: member.apiName,
        kind: "attribute",
      })),
      ...type.valueRelations.map((member) => ({
        apiName: member.apiName,
        kind: "value relation",
      })),
      ...type.links.map((member) => ({
        apiName: member.apiName,
        kind: "link",
      })),
    ];
  for (const member of members) {
    const existing = seen.get(member.apiName);
    if (existing !== undefined) {
      throw new Error(
        `${type.typeId} has colliding member ${member.apiName} (${existing} and ${member.kind})`,
      );
    }
    seen.set(member.apiName, member.kind);
  }
}

function sortByApiName<T extends { readonly apiName: string }>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) =>
    left.apiName < right.apiName ? -1 : left.apiName > right.apiName ? 1 : 0,
  );
}
