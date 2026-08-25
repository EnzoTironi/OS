import type { ExactValue } from "@zoen/ontology";
import type { OsdkLinkModel, OsdkModel, OsdkTypeModel } from "./model.js";
import type { OsdkDefinitionRef, OsdkWorld } from "./ports.js";
import {
  entityIdsFromClaims,
  queryClaims,
} from "./query.js";

export interface TypeQuery<TProjection = ClaimProjection> {
  fetch(entityId: string): Promise<TProjection>;
  ids(limit: number): Promise<readonly string[]>;
}

/**
 * Projection of World claims for one entity. Not a hydrated object row.
 * Cardinality-one values are `ExactValue | null` (known empty).
 * Links walk relations and return entity ids, not nested objects.
 */
export interface ClaimProjection {
  readonly entityId: string;
  readonly links: Readonly<
    Record<
      string,
      () => Promise<readonly string[]> | Promise<string | null>
    >
  >;
  readonly typeId: string;
  readonly values: Readonly<
    Record<string, ExactValue | null | readonly ExactValue[]>
  >;
}

export interface ObjectRuntime {
  readonly definition: OsdkDefinitionRef;
  readonly model: OsdkModel;
  readonly tenantId: string;
  readonly validAt: Date;
  readonly world: OsdkWorld;
}

export function createTypeQuery(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
): TypeQuery {
  return {
    fetch: (entityId) => fetchClaimProjection(runtime, type, entityId),
    ids: (limit) => fetchTypeIds(runtime, type, limit),
  };
}

export function createTypeQueries(
  runtime: ObjectRuntime,
): Readonly<Record<string, TypeQuery>> {
  const objects: Record<string, TypeQuery> = {};
  for (const type of runtime.model.types) {
    objects[type.apiName] = createTypeQuery(runtime, type);
  }
  return objects;
}

async function fetchClaimProjection(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
  entityId: string,
): Promise<ClaimProjection> {
  const values: Record<string, ExactValue | null | readonly ExactValue[]> = {};
  for (const prop of type.props) {
    const claims = await queryClaims({
      definition: runtime.definition,
      entityId,
      kind: "relation",
      relationId: prop.relationId,
      tenantId: runtime.tenantId,
      validAt: runtime.validAt,
      world: runtime.world,
    });
    switch (prop.cardinality) {
      case "many":
        values[prop.apiName] = claims.flatMap((claim) =>
          claim.value === null ? [] : [claim.value],
        );
        break;
      case "one": {
        const first = claims[0];
        values[prop.apiName] = first?.value ?? null;
        break;
      }
      default: {
        const exhaustive: never = prop.cardinality;
        return exhaustive;
      }
    }
  }
  return {
    entityId,
    links: createLinkWalks(runtime, type, entityId),
    typeId: type.typeId,
    values,
  };
}

async function fetchTypeIds(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
  limit: number,
): Promise<readonly string[]> {
  const listed = await queryClaims({
    definition: runtime.definition,
    kind: "byType",
    limit,
    tenantId: runtime.tenantId,
    typeId: type.typeId,
    validAt: runtime.validAt,
    world: runtime.world,
  });
  return entityIdsFromClaims(listed);
}

function createLinkWalks(
  runtime: ObjectRuntime,
  type: OsdkTypeModel,
  sourceEntityId: string,
): ClaimProjection["links"] {
  const links: Record<
    string,
    () => Promise<readonly string[]> | Promise<string | null>
  > = {};
  for (const link of type.links) {
    switch (link.cardinality) {
      case "many":
        links[link.apiName] = () => walkRelationIds(runtime, link, sourceEntityId);
        break;
      case "one":
        links[link.apiName] = async () => {
          const ids = await walkRelationIds(runtime, link, sourceEntityId);
          return ids[0] ?? null;
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

async function walkRelationIds(
  runtime: ObjectRuntime,
  link: OsdkLinkModel,
  sourceEntityId: string,
): Promise<readonly string[]> {
  const claims = await queryClaims({
    definition: runtime.definition,
    entityId: sourceEntityId,
    kind: "relation",
    relationId: link.relationId,
    tenantId: runtime.tenantId,
    validAt: runtime.validAt,
    world: runtime.world,
  });
  return entityIdsFromClaims(claims);
}
