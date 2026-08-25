import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  TypeQuerySchema,
} from "@zoen/sdk";
import type { OsdkDefinitionRef, OsdkWorld, SemanticQueryView } from "./ports.js";
import { definitionRevision } from "./ports.js";
import {
  decodeWireValue,
  type PropScalar,
  type WireValue,
} from "./values.js";

export interface DecodedClaim {
  readonly entityId: string;
  readonly scalar: PropScalar;
}

export interface ClaimQuery {
  readonly definition: OsdkDefinitionRef;
  readonly entityId?: string;
  readonly relationId?: string;
  readonly tenantId: string;
  readonly typeId?: string;
  readonly typeLimit?: number;
  readonly validAt?: Date;
  readonly world: OsdkWorld;
}

/**
 * Reads World claims by `relation_id` and/or `type_id`. Objects are assembled
 * from these rows; this is not a second object store.
 */
export async function queryClaims(
  input: ClaimQuery,
): Promise<readonly DecodedClaim[]> {
  const response = await input.world.semanticQuery(semanticQueryInit(input));
  return decodeClaims(response);
}

export function semanticQueryInit(input: ClaimQuery) {
  const typeId = input.typeId;
  return {
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong" as const,
        value: create(StrongConsistencySchema),
      },
    }),
    definition: {
      definitionId: input.definition.definitionId,
      digest: input.definition.digest,
      revision: definitionRevision(input.definition),
    },
    entityId: input.entityId ?? "",
    ...(typeId === undefined
      ? {}
      : {
          query: {
            case: "byType" as const,
            value: create(TypeQuerySchema, {
              limit: input.typeLimit ?? 50,
              typeId,
            }),
          },
        }),
    ...(input.relationId === undefined
      ? {}
      : {
          selection: create(QuerySelectionSchema, {
            value: { case: "relationId" as const, value: input.relationId },
          }),
        }),
    tenantId: input.tenantId,
    ...(input.validAt === undefined
      ? {}
      : { validAt: timestampFromDate(input.validAt) }),
  };
}

export function decodeClaims(
  response: SemanticQueryView,
): DecodedClaim[] {
  const claims: DecodedClaim[] = [];
  for (const row of response.values) {
    const wire = wireValueFromQuery(row.value);
    if (wire.case === undefined) {
      const entityId = row.dependencies[0]?.entityId;
      if (entityId !== undefined) {
        claims.push({ entityId, scalar: entityId });
      }
      continue;
    }
    const scalar = decodeWireValue(wire);
    const entityId =
      row.dependencies[0]?.entityId ??
      (wire.case === "entityRefValue" ? wire.value : undefined);
    if (entityId === undefined) {
      continue;
    }
    claims.push({ entityId, scalar });
  }
  return claims;
}

export function entityIdsFromClaims(
  claims: readonly DecodedClaim[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    if (typeof claim.scalar === "string" && claim.scalar.length > 0) {
      if (!seen.has(claim.scalar)) {
        seen.add(claim.scalar);
        ids.push(claim.scalar);
      }
      continue;
    }
    if (!seen.has(claim.entityId)) {
      seen.add(claim.entityId);
      ids.push(claim.entityId);
    }
  }
  return ids;
}

function wireValueFromQuery(
  value: SemanticQueryView["values"][number]["value"],
): WireValue {
  if (value === undefined) {
    return { case: undefined };
  }
  const inner = value.value;
  switch (inner.case) {
    case "boolValue":
      if (typeof inner.value !== "boolean") {
        throw new Error("bool claim is not a boolean");
      }
      return { case: "boolValue", value: inner.value };
    case "decimalValue":
    case "entityRefValue":
    case "integerValue":
    case "textValue":
      if (typeof inner.value !== "string") {
        throw new Error(`${inner.case} claim is not a string`);
      }
      return { case: inner.case, value: inner.value };
    case "quantityValue":
      if (
        inner.value === undefined ||
        typeof inner.value === "boolean" ||
        typeof inner.value === "string"
      ) {
        throw new Error("quantity claim is malformed");
      }
      return {
        case: "quantityValue",
        value: { amount: inner.value.amount, unit: inner.value.unit },
      };
    case undefined:
      return { case: undefined };
    default: {
      const exhaustive: never = inner.case;
      return exhaustive;
    }
  }
}
