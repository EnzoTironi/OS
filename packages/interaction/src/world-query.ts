import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  DefinitionReferenceSchema,
  LineageRole,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  WorldService,
  type ExactValue,
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
 * Callers must pass a real entity/definition from env or the live World.
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

/**
 * Build a World client from env when zoend credentials and a real entity exist.
 * Missing definition/entity is a skip, not an invented OrderLine.
 */
export function createWorldQueryClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WorldQueryClient | undefined {
  const baseUrl = (
    env.ZOEN_WORLD_BASE_URL ?? env.ZOEN_IDENTITY_BASE_URL
  )?.trim();
  const bearerToken = (
    env.ZOEN_AGENT_BEARER_TOKEN ?? env.ZOEN_WORLD_BEARER_TOKEN
  )?.trim();
  const definitionId = env.ZOEN_WORLD_DEFINITION_ID?.trim();
  const definitionDigest = env.ZOEN_WORLD_DEFINITION_DIGEST?.trim();
  const revisionRaw = env.ZOEN_WORLD_DEFINITION_REVISION?.trim();
  const entityId = env.ZOEN_WORLD_ENTITY_ID?.trim();
  if (
    baseUrl === undefined ||
    bearerToken === undefined ||
    definitionId === undefined ||
    definitionDigest === undefined ||
    revisionRaw === undefined ||
    entityId === undefined
  ) {
    return undefined;
  }
  const revision = BigInt(revisionRaw);
  if (revision <= 0n) {
    return undefined;
  }
  return createConnectWorldQueryClient({
    baseUrl,
    bearerToken,
    definitionDigest,
    definitionId,
    definitionRevision: revision,
    entityId,
    relationId: env.ZOEN_WORLD_RELATION_ID?.trim(),
  });
}

export function snapshotFromResponse(
  response: SemanticQueryResponse,
  queriedEntityId: string,
): WorldQuerySnapshot {
  const entityIds = new Set<string>();
  if (queriedEntityId.length > 0) {
    entityIds.add(queriedEntityId);
  }
  const rivals: WorldRivalView[] = [];
  const notes: string[] = [];
  let href: string | undefined;

  for (const row of response.values) {
    const label = exactValueLabel(row.value);
    if (label !== undefined) {
      notes.push(label);
      const found = firstHttpsUrl(label);
      if (found !== undefined && href === undefined) {
        href = found;
      }
    }
    for (const dependency of row.dependencies) {
      if (dependency.entityId.length > 0) {
        entityIds.add(dependency.entityId);
      }
      const sourceId =
        dependency.sourceId.length > 0 ? dependency.sourceId : undefined;
      switch (dependency.role) {
        case LineageRole.RIVAL: {
          const rivalLabel =
            sourceId !== undefined && !looksLikeEntityId(sourceId)
              ? sourceId
              : dependency.relationId.length > 0
                ? dependency.relationId
                : undefined;
          if (rivalLabel !== undefined) {
            rivals.push({ label: rivalLabel, sourceId });
          }
          break;
        }
        case LineageRole.SUPPORTING:
        case LineageRole.COMPUTATION_DEPENDENCY:
        case LineageRole.UNSPECIFIED:
          break;
        default: {
          const exhaustive: never = dependency.role;
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

export function looksLikeEntityId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z][A-Za-z0-9._-]+$/.test(value.trim());
}

function exactValueLabel(value: ExactValue | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  switch (value.value.case) {
    case "textValue":
    case "decimalValue":
    case "integerValue":
      return value.value.value;
    case "boolValue":
      return value.value.value ? "sim" : "não";
    case "quantityValue":
      return `${value.value.value.amount} ${value.value.value.unit}`;
    case "entityRefValue":
      return undefined;
    case undefined:
      return undefined;
    default: {
      const exhaustive: never = value.value;
      return exhaustive;
    }
  }
}

function firstHttpsUrl(text: string): string | undefined {
  const match = text.match(/https:\/\/[^\s]+/i);
  return match?.[0];
}
