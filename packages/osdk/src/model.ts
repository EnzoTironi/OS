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

export interface OsdkValuePropModel {
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
  readonly props: readonly OsdkValuePropModel[];
  readonly typeId: string;
}

export interface OsdkActionModel {
  readonly action: ActionDefinition;
  readonly apiName: string;
}

export interface OsdkModel {
  readonly actions: readonly OsdkActionModel[];
  readonly definitionId: string;
  readonly digest: string;
  readonly revision: number;
  readonly types: readonly OsdkTypeModel[];
}

/**
 * Projects a compiled definition into the OSDK object/link/action namespace.
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

  const types = sortByApiName(
    definition.types.map((type) => {
      const attributes = type.attributes.map((attribute) => ({
        apiName: attribute.id,
        valueType: attribute.valueType,
      }));
      const links: OsdkLinkModel[] = [];
      const props: OsdkValuePropModel[] = [];
      for (const relation of definition.relations) {
        if (relation.sourceType !== type.id) {
          continue;
        }
        pushRelation(relation, links, props);
      }
      const model: OsdkTypeModel = {
        apiName: apiNameFromId(type.id),
        attributes,
        links: sortByApiName(links),
        props: sortByApiName(props),
        typeId: type.id,
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
    definitionId: definition.definitionId,
    digest,
    revision: definition.revision,
    types,
  };
}

function pushRelation(
  relation: RelationDefinition,
  links: OsdkLinkModel[],
  props: OsdkValuePropModel[],
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
      props.push({
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
      ...type.props.map((member) => ({
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

export function typeModelById(
  model: OsdkModel,
  typeId: string,
): OsdkTypeModel {
  const found = model.types.find((type) => type.typeId === typeId);
  if (found === undefined) {
    throw new Error(`unknown OSDK type id ${typeId}`);
  }
  return found;
}
