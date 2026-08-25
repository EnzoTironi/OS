import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ExactValue } from "@zoen/ontology";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  SemanticQueryRequestSchema,
  StrongConsistencySchema,
  TypeQuerySchema,
  type SemanticQueryRequest,
  type SemanticQueryResponse,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import { lineageFrom, type ClaimRead } from "./claims.js";
import type { OsdkDefinitionRef, OsdkWorld } from "./ports.js";
import { exactValueFromProto } from "./values.js";

/**
 * Live SemanticQuery shapes: entity+relation, entity+computation, or
 * by-type (ids only). Not an optional-field bag.
 */
export type ClaimQuery =
  | {
      readonly definition: OsdkDefinitionRef;
      readonly entityId: string;
      readonly kind: "computation";
      readonly computationId: string;
      readonly tenantId: string;
      readonly validAt: Date;
      readonly world: OsdkWorld;
    }
  | {
      readonly definition: OsdkDefinitionRef;
      readonly entityId: string;
      readonly kind: "relation";
      readonly relationId: string;
      readonly tenantId: string;
      readonly validAt: Date;
      readonly world: OsdkWorld;
    }
  | {
      readonly definition: OsdkDefinitionRef;
      readonly kind: "byType";
      readonly limit: number;
      readonly tenantId: string;
      readonly typeId: string;
      readonly validAt: Date;
      readonly world: OsdkWorld;
    };

export async function queryClaims(
  input: ClaimQuery,
): Promise<readonly ClaimRead[]> {
  const response = await input.world.semanticQuery(semanticQueryRequest(input));
  const fallbackEntityId = input.kind === "byType" ? null : input.entityId;
  return decodeClaims(response, fallbackEntityId);
}

export function semanticQueryRequest(input: ClaimQuery): SemanticQueryRequest {
  switch (input.kind) {
    case "byType":
      return create(SemanticQueryRequestSchema, {
        consistency: create(QueryConsistencySchema, {
          value: {
            case: "strong",
            value: create(StrongConsistencySchema),
          },
        }),
        definition: input.definition,
        entityId: "",
        query: {
          case: "byType",
          value: create(TypeQuerySchema, {
            limit: input.limit,
            typeId: input.typeId,
          }),
        },
        tenantId: input.tenantId,
        validAt: timestampFromDate(input.validAt),
      });
    case "computation":
      return create(SemanticQueryRequestSchema, {
        consistency: create(QueryConsistencySchema, {
          value: {
            case: "strong",
            value: create(StrongConsistencySchema),
          },
        }),
        definition: input.definition,
        entityId: input.entityId,
        selection: create(QuerySelectionSchema, {
          value: { case: "computationId", value: input.computationId },
        }),
        tenantId: input.tenantId,
        validAt: timestampFromDate(input.validAt),
      });
    case "relation":
      return create(SemanticQueryRequestSchema, {
        consistency: create(QueryConsistencySchema, {
          value: {
            case: "strong",
            value: create(StrongConsistencySchema),
          },
        }),
        definition: input.definition,
        entityId: input.entityId,
        selection: create(QuerySelectionSchema, {
          value: { case: "relationId", value: input.relationId },
        }),
        tenantId: input.tenantId,
        validAt: timestampFromDate(input.validAt),
      });
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

export function decodeClaims(
  response: SemanticQueryResponse,
  fallbackEntityId: string | null,
): ClaimRead[] {
  const claims: ClaimRead[] = [];
  for (const row of response.values) {
    const value = exactValueFromProto(row.value);
    const entityId = entityIdFromRow(row.dependencies, value) ?? fallbackEntityId;
    if (entityId === null) {
      continue;
    }
    claims.push({
      entityId,
      lineage: lineageFrom(row.dependencies),
      value,
    });
  }
  return claims;
}

export function entityIdsFromClaims(claims: readonly ClaimRead[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    const id = claim.value?.kind === "entity" ? claim.value.value : claim.entityId;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function entityIdFromRow(
  dependencies: readonly { readonly entityId: string }[],
  value: ExactValue | null,
): string | null {
  const fromDependency = dependencies[0]?.entityId;
  if (fromDependency !== undefined && fromDependency.length > 0) {
    return fromDependency;
  }
  if (value?.kind === "entity") {
    return value.value;
  }
  return null;
}
