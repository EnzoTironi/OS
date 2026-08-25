import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import type { ExactValue } from "../../ontology/src/index.js";
import {
  decodeClaims,
  type ClaimLineage,
  type ClaimRead,
} from "../../osdk/src/index.js";
import {
  DefinitionReferenceSchema,
  LineageRole,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  WorldService,
  type SemanticQueryResponse,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";

/**
 * One rival or supporting claim the model may mention. Labels only.
 * Entity ids stay off the user-visible path unless a later renderer opts in.
 */
export interface WorldRivalView {
  readonly label: string;
  readonly sourceId?: string;
}

/**
 * Membership-scoped World snapshot. Never invents OrderLines.
 * `href` stays an optional string; the turn boundary parses `URL | null`.
 */
export interface WorldQuerySnapshot {
  readonly entityIds: readonly string[];
  readonly href?: string;
  readonly notes: readonly string[];
  readonly rivals: readonly WorldRivalView[];
}

export interface WorldQueryInput {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly entityId?: string;
  readonly typeApiName?: string;
}

export interface WorldQueryClient {
  semanticQuery(input: WorldQueryInput): Promise<WorldQuerySnapshot | undefined>;
}

export interface ConnectWorldQueryOptions {
  readonly baseUrl: string;
  readonly bearerToken: string;
  readonly definitionDigest: string;
  readonly definitionId: string;
  readonly definitionRevision: bigint;
  readonly entityId: string;
  readonly relationId?: string;
}

/**
 * Connect WorldService.SemanticQuery for a caller-supplied entity.
 * Does not default the entity to a commercial OrderLine.
 */
export function createConnectWorldQueryClient(
  options: ConnectWorldQueryOptions,
): WorldQueryClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${options.bearerToken}`);
    return next(request);
  };
  const transport = createConnectTransport({
    baseUrl: options.baseUrl.replace(/\/$/u, ""),
    httpVersion: "1.1",
    interceptors: [authorization],
  });
  const world = createClient(WorldService, transport);

  return {
    async semanticQuery(input) {
      try {
        const response = await world.semanticQuery({
          consistency: create(QueryConsistencySchema, {
            value: {
              case: "strong",
              value: create(StrongConsistencySchema),
            },
          }),
          definition: create(DefinitionReferenceSchema, {
            definitionId: options.definitionId,
            digest: options.definitionDigest,
            revision: options.definitionRevision,
          }),
          entityId: input.entityId ?? options.entityId,
          selection:
            options.relationId === undefined
              ? undefined
              : create(QuerySelectionSchema, {
                  value: {
                    case: "relationId",
                    value: options.relationId,
                  },
                }),
          tenantId: input.tenantId,
          validAt: timestampFromDate(new Date()),
        });
        return snapshotFromResponse(response, input.entityId ?? options.entityId);
      } catch {
        return undefined;
      }
    },
  };
}

export function snapshotFromResponse(
  response: SemanticQueryResponse,
  queriedEntityId: string,
): WorldQuerySnapshot {
  return snapshotFromClaims(decodeClaims(response, queriedEntityId), {
    extraEntityIds:
      queriedEntityId.length > 0 ? [queriedEntityId] : [],
  });
}

/**
 * Project `ClaimRead` rows into user-visible labels.
 * Entity ids stay on `entityIds` for sanitization only.
 */
export function snapshotFromClaims(
  claims: readonly ClaimRead[],
  options: { readonly extraEntityIds?: readonly string[] } = {},
): WorldQuerySnapshot {
  const entityIds = new Set<string>();
  for (const extraId of options.extraEntityIds ?? []) {
    if (extraId.length > 0) {
      entityIds.add(extraId);
    }
  }
  const rivals: WorldRivalView[] = [];
  const notes: string[] = [];
  const seenRivalLabels = new Set<string>();
  let href: string | undefined;

  for (const claim of claims) {
    if (claim.entityId.length > 0) {
      entityIds.add(claim.entityId);
    }
    const valueLabel = claimValueLabel(claim.value);
    if (valueLabel !== undefined && !looksLikeEntityId(valueLabel)) {
      notes.push(valueLabel);
      const found = firstHttpsUrl(valueLabel);
      if (found !== undefined && href === undefined) {
        href = found;
      }
    }
    for (const lineage of claim.lineage) {
      if (lineage.entityId.length > 0) {
        entityIds.add(lineage.entityId);
      }
      switch (lineage.role) {
        case LineageRole.RIVAL: {
          const rival = rivalViewFromClaim(claim, lineage);
          if (rival !== undefined && !seenRivalLabels.has(rival.label)) {
            seenRivalLabels.add(rival.label);
            rivals.push(rival);
          }
          break;
        }
        case LineageRole.SUPPORTING:
        case LineageRole.COMPUTATION_DEPENDENCY:
        case LineageRole.UNSPECIFIED:
          break;
        default: {
          const exhaustive: never = lineage.role;
          return exhaustive;
        }
      }
    }
  }

  return {
    entityIds: [...entityIds],
    href,
    notes,
    rivals,
  };
}

/**
 * Dotted entity/membership ids. Provenance `source.*` labels stay speakable.
 */
export function looksLikeEntityId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || /^source\./u.test(trimmed)) {
    return false;
  }
  return /^[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z][A-Za-z0-9._-]+$/u.test(trimmed);
}

export function claimValueLabel(
  value: ExactValue | null,
): string | undefined {
  if (value === null) {
    return undefined;
  }
  switch (value.kind) {
    case "text":
    case "decimal":
    case "integer":
      return value.value;
    case "bool":
      return value.value ? "sim" : "não";
    case "quantity":
      return `${value.amount} ${value.unit}`;
    case "entity":
      return undefined;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function rivalViewFromClaim(
  claim: ClaimRead,
  lineage: ClaimLineage,
): WorldRivalView | undefined {
  const sourceId =
    lineage.sourceId.length > 0 ? lineage.sourceId : undefined;
  if (sourceId !== undefined && !looksLikeEntityId(sourceId)) {
    return { label: sourceId, sourceId };
  }
  const valueLabel = claimValueLabel(claim.value);
  if (valueLabel !== undefined && !looksLikeEntityId(valueLabel)) {
    return { label: valueLabel, sourceId };
  }
  return undefined;
}

function firstHttpsUrl(text: string): string | undefined {
  const match = text.match(/https:\/\/[^\s]+/i);
  return match?.[0];
}
