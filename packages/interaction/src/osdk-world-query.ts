/**
 * OSDK World adapter for Interaction. Must not import `@zoen/harness`
 * (harness already depends on interaction).
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
  type ClaimRead,
  type OsdkActionsPort,
  type OsdkDefinitionRef,
  type OsdkRuntimeClient,
  type OsdkWorld,
  type TypeQuery,
} from "../../osdk/src/index.js";
import { WorldService } from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import { snapshotFromClaims, type WorldQueryClient } from "./world-query.js";

const EXISTING_OBJECT_LIMIT = 8;
const compiledByPath = new Map<string, Promise<CompiledDefinition>>();

/**
 * Default in-repo pack for Interaction World assembly.
 * `OrderLine` is used only when that type exists on the compiled definition.
 */
export function defaultCommercialDefinitionPath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, "packages", "commercial", "src", "commercial.zoen.ts");
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
        const osdk = createOsdkFromCompiled(compiled, {
          actions: options.actions ?? readOnlyActionsPort(),
          tenantId: input.tenantId,
          validAt: (options.now ?? (() => new Date()))(),
          world: options.world,
        });
        const typeQuery = typeQueryOnDefinition(
          osdk,
          input.typeApiName ?? options.typeApiName,
        );
        const entityId = input.entityId ?? options.entityId;
        const claims = await readObjectClaims(typeQuery, entityId);
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
 * Live zoend World credentials are enough. Definition/entity from env stay
 * membership-scoped when present; otherwise the commercial pack is compiled
 * and existing objects on that definition are queried.
 */
export function createWorldQueryClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WorldQueryClient | undefined {
  const credentials = worldCredentialsFromEnv(env);
  if (credentials === undefined) {
    return undefined;
  }
  return createOsdkWorldQueryClient({
    definition: definitionRefFromEnv(env),
    definitionPath: env.ZOEN_WORLD_DEFINITION_PATH?.trim(),
    entityId: env.ZOEN_WORLD_ENTITY_ID?.trim(),
    typeApiName: env.ZOEN_WORLD_TYPE_API_NAME?.trim(),
    world: createConnectOsdkWorld(credentials),
  });
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
  const bearerToken = (
    env.ZOEN_AGENT_BEARER_TOKEN ?? env.ZOEN_WORLD_BEARER_TOKEN
  )?.trim();
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
  const definitionPath =
    options.definitionPath ?? defaultCommercialDefinitionPath();
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

function typeQueryOnDefinition(
  osdk: OsdkRuntimeClient,
  typeApiName: string | undefined,
): TypeQuery {
  if (typeApiName !== undefined) {
    const named = osdk.objects[typeApiName];
    if (named === undefined) {
      throw new Error(`OSDK type ${typeApiName} is not on this definition`);
    }
    return named;
  }
  const orderLine = osdk.objects.OrderLine;
  if (orderLine !== undefined) {
    return orderLine;
  }
  const first = osdk.model.types[0];
  if (first === undefined) {
    throw new Error("compiled definition has no object types");
  }
  const fallback = osdk.objects[first.apiName];
  if (fallback === undefined) {
    throw new Error(`OSDK type ${first.apiName} is not on this definition`);
  }
  return fallback;
}

async function readObjectClaims(
  typeQuery: TypeQuery,
  entityId: string | undefined,
): Promise<readonly ClaimRead[]> {
  if (entityId !== undefined && entityId.length > 0) {
    return claimsFromProjection(await typeQuery.fetch(entityId));
  }
  const ids = await typeQuery.ids(EXISTING_OBJECT_LIMIT);
  const claims: ClaimRead[] = [];
  for (const id of ids) {
    claims.push(...claimsFromProjection(await typeQuery.fetch(id)));
  }
  return claims;
}

function claimsFromProjection(projection: {
  readonly values: Readonly<Record<string, ClaimRead | readonly ClaimRead[]>>;
}): ClaimRead[] {
  const claims: ClaimRead[] = [];
  for (const field of Object.values(projection.values)) {
    if (isClaimMany(field)) {
      claims.push(...field);
    } else {
      claims.push(field);
    }
  }
  return claims;
}

function isClaimMany(
  field: ClaimRead | readonly ClaimRead[],
): field is readonly ClaimRead[] {
  return Array.isArray(field);
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
