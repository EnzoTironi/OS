import type { OsdkLinkModel, OsdkModel, OsdkTypeModel } from "./model.js";
import { typeModelById } from "./model.js";
import type { OsdkDefinitionRef, OsdkWorld } from "./ports.js";
import {
  entityIdsFromClaims,
  queryClaims,
} from "./query.js";
import type { PropValue } from "./values.js";

export interface SingleLinkAccessor<TObject> {
  fetch(): Promise<TObject | undefined>;
}

export interface ManyLinkAccessor<TObject> {
  fetchPage(options?: { readonly limit?: number }): Promise<readonly TObject[]>;
}

export interface ObjectSet<TObject> {
  fetch(entityId: string): Promise<TObject>;
  fetchPage(options?: { readonly limit?: number }): Promise<readonly TObject[]>;
}

/**
 * Claim projection of one World entity. Not a row in a second object store.
 */
export interface ProjectedObject {
  readonly $claimProjection: true;
  readonly $primaryKey: string;
  readonly $typeId: string;
  readonly links: Readonly<
    Record<
      string,
      ManyLinkAccessor<ProjectedObject> | SingleLinkAccessor<ProjectedObject>
    >
  >;
  readonly props: Readonly<Record<string, PropValue>>;
}

export interface ObjectRuntime {
  readonly definition: OsdkDefinitionRef;
  readonly model: OsdkModel;
  readonly tenantId: string;
  readonly validAt?: Date;
  readonly world: OsdkWorld;
}

export function createObjectSet(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
): ObjectSet<ProjectedObject> {
  return {
    fetch: (entityId) => fetchProjectedObject(runtime, type, entityId),
    fetchPage: (options) => fetchProjectedPage(runtime, type, options?.limit),
  };
}

export function createObjectSets(
  runtime: ObjectRuntime,
): Readonly<Record<string, ObjectSet<ProjectedObject>>> {
  const objects: Record<string, ObjectSet<ProjectedObject>> = {};
  for (const type of runtime.model.types) {
    objects[type.apiName] = createObjectSet(runtime, type);
  }
  return objects;
}

async function fetchProjectedObject(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
  entityId: string,
): Promise<ProjectedObject> {
  const props: Record<string, PropValue> = {};
  for (const attribute of type.attributes) {
    props[attribute.apiName] = undefined;
  }
  for (const prop of type.props) {
    const claims = await queryClaims({
      definition: runtime.definition,
      entityId,
      relationId: prop.relationId,
      tenantId: runtime.tenantId,
      validAt: runtime.validAt,
      world: runtime.world,
    });
    switch (prop.cardinality) {
      case "many":
        props[prop.apiName] = claims.map((claim) => claim.scalar);
        break;
      case "one": {
        const first = claims[0];
        props[prop.apiName] = first?.scalar;
        break;
      }
      default: {
        const exhaustive: never = prop.cardinality;
        return exhaustive;
      }
    }
  }
  return {
    $claimProjection: true,
    $primaryKey: entityId,
    $typeId: type.typeId,
    links: createLinks(runtime, type, entityId),
    props,
  };
}

async function fetchProjectedPage(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
  limit?: number,
): Promise<readonly ProjectedObject[]> {
  const listed = await queryClaims({
    definition: runtime.definition,
    tenantId: runtime.tenantId,
    typeId: type.typeId,
    typeLimit: limit ?? 50,
    validAt: runtime.validAt,
    world: runtime.world,
  });
  const ids = entityIdsFromClaims(listed);
  const objects: ProjectedObject[] = [];
  for (const entityId of ids) {
    objects.push(await fetchProjectedObject(runtime, type, entityId));
  }
  return objects;
}

function createLinks(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
  sourceEntityId: string,
): ProjectedObject["links"] {
  const links: Record<
    string,
    ManyLinkAccessor<ProjectedObject> | SingleLinkAccessor<ProjectedObject>
  > = {};
  for (const link of type.links) {
    switch (link.cardinality) {
      case "many":
        links[link.apiName] = {
          fetchPage: (options) =>
            fetchLinkTargets(runtime, link, sourceEntityId, options?.limit),
        };
        break;
      case "one":
        links[link.apiName] = {
          fetch: async () => {
            const targets = await fetchLinkTargets(
              runtime,
              link,
              sourceEntityId,
              1,
            );
            return targets[0];
          },
        };
        break;
      default: {
        const exhaustive: never = link.cardinality;
        return exhaustive;
      }
    }
  }
  return links;
}

async function fetchLinkTargets(
  runtime: ObjectRuntime,
  link: OsdkLinkModel,
  sourceEntityId: string,
  limit?: number,
): Promise<readonly ProjectedObject[]> {
  const claims = await queryClaims({
    definition: runtime.definition,
    entityId: sourceEntityId,
    relationId: link.relationId,
    tenantId: runtime.tenantId,
    validAt: runtime.validAt,
    world: runtime.world,
  });
  const targetIds = entityIdsFromClaims(claims).slice(0, limit ?? 50);
  const targetType = typeModelById(runtime.model, link.targetTypeId);
  const targets: ProjectedObject[] = [];
  for (const entityId of targetIds) {
    targets.push(await fetchProjectedObject(runtime, targetType, entityId));
  }
  return targets;
}
