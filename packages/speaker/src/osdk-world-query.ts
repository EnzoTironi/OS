import { readFileSync } from "node:fs";
/**
 * OSDK World adapter for Interaction. Must not import `@zoen/harness`
 * (harness already depends on speaker).
 */
import path from "node:path";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  compileDefinition,
  type CompiledDefinition,
} from "../../ontology/src/index.js";
import {
  createOsdkFromCompiled,
  queryClaims,
  type ClaimRead,
  type OsdkActionsPort,
  type OsdkDefinitionRef,
  type OsdkRuntimeClient,
  type OsdkTypeModel,
  type OsdkWorld,
  type TypeQuery,
} from "../../osdk/src/index.js";
import { WorldService } from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import { snapshotFromClaims, type WorldQueryClient } from "./world-query.js";

const EXISTING_OBJECT_LIMIT = 8;
const compiledByPath = new Map<string, Promise<CompiledDefinition>>();

/**
 * Lake fixture path for tests that pass a definition explicitly.
 * `OrderLine` is used only when that type exists on the compiled definition.
 */
export function defaultCommercialDefinitionPath(
  cwd: string = process.cwd(),
): string {
  return path.join(
    cwd,
    "packages",
    "ontology",
    "fixtures",
    "commercial.zoen.ts",
  );
}

export interface OsdkWorldQueryOptions {
  readonly actions?: OsdkActionsPort;
  readonly compiled?: CompiledDefinition;
  readonly definition?: OsdkDefinitionRef;
  readonly definitionPath?: string;
  readonly entityId?: string;
  readonly now?: () => Date;
  readonly typeApiName?: string;
  readonly world: OsdkWorld;
}

/**
 * Assemble a World snapshot through `createOsdkFromCompiled`.
 * Callers write `objects.OrderLine` (or the membership type on the definition).
 * Belief writes stay on `actions.preview` / `actions.commit`.
 */
export function createOsdkWorldQueryClient(
  options: OsdkWorldQueryOptions,
): WorldQueryClient {
  return {
    async semanticQuery(input) {
      try {
        const compiled = applyDefinitionRef(
          await loadCompiled(options),
          options.definition,
        );
        const validAt =
          input.validAt ?? (options.now ?? (() => new Date()))();
        const osdk = createOsdkFromCompiled(compiled, {
          actions: options.actions ?? readOnlyActionsPort(),
          tenantId: input.tenantId,
          validAt,
          world: options.world,
        });
        const typed = typeOnDefinition(
          osdk,
          input.typeApiName ?? options.typeApiName,
        );
        const entityId = input.entityId ?? options.entityId;
        const claims = await readObjectClaims({
          definition: {
            definitionId: compiled.definition.definitionId,
            digest: compiled.digest,
            revision: BigInt(compiled.definition.revision),
          },
          entityId,
          tenantId: input.tenantId,
          type: typed.type,
          typeQuery: typed.query,
          validAt,
          world: options.world,
        });
        return snapshotFromClaims(claims, {
          extraEntityIds: entityId === undefined ? [] : [entityId],
        });
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Live zoend World credentials are not enough. The process must name a
 * definition file (`ZOEN_WORLD_DEFINITION_PATH`) or callers inject
 * `compiled`. Shipping speaker does not compile the commercial lake by
 * `process.cwd()`.
 */
export function createWorldQueryClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WorldQueryClient | undefined {
  const credentials = worldCredentialsFromEnv(env);
  const definitionPath = env.ZOEN_WORLD_DEFINITION_PATH?.trim();
  if (credentials === undefined || definitionPath === undefined) {
    return undefined;
  }
  return createOsdkWorldQueryClient({
    definition: definitionRefFromEnv(env),
    definitionPath,
    entityId: env.ZOEN_WORLD_ENTITY_ID?.trim(),
    typeApiName: env.ZOEN_WORLD_TYPE_API_NAME?.trim(),
    world: createConnectOsdkWorld(credentials),
  });
}

/**
 * Call `createWorldQueryClientFromEnv` on every retrieve so a remint
 * after serve start can start succeeding. Does not capture the bearer
 * at construct. Missing env stays store-only for that turn.
 */
export function createLazyWorldQueryClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WorldQueryClient {
  return {
    async semanticQuery(input) {
      const client = createWorldQueryClientFromEnv(env);
      if (client === undefined) {
        return undefined;
      }
      return client.semanticQuery(input);
    },
  };
}

export function createConnectOsdkWorld(options: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}): OsdkWorld {
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
    semanticQuery: (request) => world.semanticQuery(request),
  };
}

function worldCredentialsFromEnv(env: NodeJS.ProcessEnv):
  | { readonly baseUrl: string; readonly bearerToken: string }
  | undefined {
  const baseUrl = (
    env.ZOEN_WORLD_BASE_URL ?? env.ZOEN_IDENTITY_BASE_URL
  )?.trim();
  const bearerToken = agentBearerToken(env);
  if (baseUrl === undefined || bearerToken === undefined) {
    return undefined;
  }
  return { baseUrl, bearerToken };
}

function definitionRefFromEnv(
  env: NodeJS.ProcessEnv,
): OsdkDefinitionRef | undefined {
  const definitionId = env.ZOEN_WORLD_DEFINITION_ID?.trim();
  const digest = env.ZOEN_WORLD_DEFINITION_DIGEST?.trim();
  const revisionRaw = env.ZOEN_WORLD_DEFINITION_REVISION?.trim();
  if (
    definitionId === undefined ||
    digest === undefined ||
    revisionRaw === undefined
  ) {
    return undefined;
  }
  try {
    const revision = BigInt(revisionRaw);
    if (revision <= 0n) {
      return undefined;
    }
    return { definitionId, digest, revision };
  } catch {
    return undefined;
  }
}

function loadCompiled(
  options: OsdkWorldQueryOptions,
): Promise<CompiledDefinition> {
  if (options.compiled !== undefined) {
    return Promise.resolve(options.compiled);
  }
  const definitionPath = options.definitionPath;
  if (definitionPath === undefined || definitionPath === "") {
    throw new Error("definitionPath or compiled is required");
  }
  const cached = compiledByPath.get(definitionPath);
  if (cached !== undefined) {
    return cached;
  }
  const loaded = compileDefinition(definitionPath);
  compiledByPath.set(definitionPath, loaded);
  return loaded;
}

function applyDefinitionRef(
  compiled: CompiledDefinition,
  definition: OsdkDefinitionRef | undefined,
): CompiledDefinition {
  if (definition === undefined) {
    return compiled;
  }
  return {
    ...compiled,
    digest: definition.digest,
    definition: {
      ...compiled.definition,
      definitionId: definition.definitionId,
      revision: Number(definition.revision),
    },
  };
}

function typeOnDefinition(
  osdk: OsdkRuntimeClient,
  typeApiName: string | undefined,
): { readonly query: TypeQuery; readonly type: OsdkTypeModel } {
  if (typeApiName !== undefined) {
    return requireType(osdk, typeApiName);
  }
  if (osdk.objects.OrderLine !== undefined) {
    return requireType(osdk, "OrderLine");
  }
  const first = osdk.model.types[0];
  if (first === undefined) {
    throw new Error("compiled definition has no object types");
  }
  return requireType(osdk, first.apiName);
}

function requireType(
  osdk: OsdkRuntimeClient,
  typeApiName: string,
): { readonly query: TypeQuery; readonly type: OsdkTypeModel } {
  const query = osdk.objects[typeApiName];
  const type = osdk.model.types.find((entry) => entry.apiName === typeApiName);
  if (query === undefined || type === undefined) {
    throw new Error(`OSDK type ${typeApiName} is not on this definition`);
  }
  return { query, type };
}

/**
 * Keep every SemanticQuery row. `objects.<Type>.fetch` collapses
 * cardinality-one fields to `claims[0]`, which drops ADR-0003 rivals.
 */
async function readObjectClaims(input: {
  readonly definition: OsdkDefinitionRef;
  readonly entityId: string | undefined;
  readonly tenantId: string;
  readonly type: OsdkTypeModel;
  readonly typeQuery: TypeQuery;
  readonly validAt: Date;
  readonly world: OsdkWorld;
}): Promise<readonly ClaimRead[]> {
  const entityIds =
    input.entityId !== undefined && input.entityId.length > 0
      ? [input.entityId]
      : [...(await input.typeQuery.ids(EXISTING_OBJECT_LIMIT))];
  const claims: ClaimRead[] = [];
  for (const entityId of entityIds) {
    for (const relation of input.type.valueRelations) {
      claims.push(
        ...(await queryClaims({
          definition: input.definition,
          entityId,
          kind: "relation",
          relationId: relation.relationId,
          tenantId: input.tenantId,
          validAt: input.validAt,
          world: input.world,
        })),
      );
    }
  }
  return claims;
}

function readOnlyActionsPort(): OsdkActionsPort {
  const reject = async (): Promise<never> => {
    throw new Error("OSDK world query does not write beliefs");
  };
  return {
    approve: reject,
    commit: reject,
    discover: reject,
    propose: reject,
  };
}

function agentBearerToken(env: NodeJS.ProcessEnv): string | undefined {
  const file = env.ZOEN_AGENT_BEARER_TOKEN_FILE?.trim();
  if (file !== undefined) {
    try {
      const fromFile = readFileSync(file, "utf8").trim();
      if (fromFile.length > 0) {
        return fromFile;
      }
    } catch {
      // remint has not written yet
    }
  }
  return (env.ZOEN_AGENT_BEARER_TOKEN ?? env.ZOEN_WORLD_BEARER_TOKEN)?.trim();
}
