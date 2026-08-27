import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  compileDefinition,
  type CompiledDefinition,
} from "../../ontology/src/index.js";
import {
  createActionHandle,
  type ActionCommitResult,
  type OsdkActionHandle,
  type OsdkActionsPort,
  type OsdkDefinitionRef,
} from "../../osdk/src/index.js";
import { ActionService } from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "../../sdk/src/gen/zoen/definition/v1/definition_pb.js";

/**
 * Speaker Action client for the personal lake.
 * Must not import `@zoen/harness` (harness already depends on speaker).
 * Default World OSDK actions stay read-only. Writes go through this client.
 */

const WRITE_MEMORY_ACTION_ID = "personal.writeMemory";
const CREATE_REMINDER_ACTION_ID = "personal.createReminder";
const compiledByPath = new Map<string, Promise<CompiledDefinition>>();
const lakeEnsure = new Map<string, Promise<void>>();

/** Fly admin-a JWT already grants this resource. Minted note/reminder ids cannot be pre-granted. */
export const PERSONAL_MEMORY_RESOURCE_ID = "personal.memory";

export type PersonalWriteKind = "note" | "remind";

export interface SpeakerActionIds {
  readonly approvalId: string;
  readonly expiresAt: Date;
  readonly operationId: string;
  readonly proposalId: string;
  readonly resourceId: string;
  readonly validAt: Date;
}

export interface SpeakerDefinitionPort {
  activateRevision(input: {
    readonly currentDigest?: string;
    readonly definitionId: string;
    readonly digest: string;
    readonly tenantId: string;
  }): Promise<void>;
  getActiveRevision(input: {
    readonly definitionId: string;
    readonly tenantId: string;
  }): Promise<{ readonly digest: string } | undefined>;
  publish(input: {
    readonly canonicalJson: string;
    readonly digest: string;
    readonly tenantId: string;
  }): Promise<void>;
}

export interface SpeakerActionClient {
  commitCreateReminder(input: {
    readonly body: string;
    readonly dueAt: string;
  }): Promise<ActionCommitResult>;
  commitWriteMemory(input: {
    readonly body: string;
  }): Promise<ActionCommitResult>;
}

export interface SpeakerActionClientOptions {
  readonly actions: OsdkActionsPort;
  readonly compiled?: CompiledDefinition;
  readonly definition?: OsdkDefinitionRef;
  readonly definitionPath?: string;
  readonly definitions?: SpeakerDefinitionPort;
  readonly ids?: (kind: PersonalWriteKind) => SpeakerActionIds;
  readonly now?: () => Date;
  readonly tenantId?: string;
  readonly timeoutMs?: number;
}

/**
 * Lake fixture path for personal WriteMemory / CreateReminder.
 */
export function defaultPersonalDefinitionPath(
  cwd: string = process.cwd(),
): string {
  return path.join(
    cwd,
    "packages",
    "ontology",
    "fixtures",
    "personal.zoen.ts",
  );
}

/**
 * Connect ActionService as an OSDK port. Propose and Commit stay on zoend.
 */
export function createConnectOsdkActions(options: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}): OsdkActionsPort {
  const actions = createClient(ActionService, connectTransport(options));
  return {
    approve: (request) => actions.approve(request),
    commit: (request) => actions.commit(request),
    discover: (request) => actions.discover(request),
    propose: (request) => actions.propose(request),
  };
}

/**
 * Connect DefinitionService. Publish is idempotent for the same digest.
 */
export function createConnectOsdkDefinitions(options: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}): SpeakerDefinitionPort {
  const definitions = createClient(DefinitionService, connectTransport(options));
  return {
    async activateRevision(input) {
      await definitions.activateRevision({
        activeRevisionPrecondition:
          input.currentDigest === undefined
            ? { case: "expectNoActiveRevision", value: true }
            : { case: "expectedActiveDigest", value: input.currentDigest },
        definitionId: input.definitionId,
        digest: input.digest,
        tenantId: input.tenantId,
      });
    },
    async getActiveRevision(input) {
      const response = await definitions.getActiveRevision({
        definitionId: input.definitionId,
        tenantId: input.tenantId,
      });
      const digest = response.definitionRevision?.digest;
      return digest === undefined || digest.length === 0
        ? undefined
        : { digest };
    },
    async publish(input) {
      await definitions.publish({
        canonicalJson: new TextEncoder().encode(input.canonicalJson),
        digest: input.digest,
        tenantId: input.tenantId,
      });
    },
  };
}

/**
 * Context: speaker writes on personal.memory. Not commercial.sales.
 * Inputs: compiled personal definition plus a live or test Action port.
 * Outputs: Preview then Commit for writeMemory / createReminder.
 * Side effects: Action.propose twice (preview + commit) and Action.commit.
 * Live also Publish+Activate once so zoend has the revision Cedar keys on.
 * Commit sends the kernel previewHash. Still one tool turn.
 */
export function createSpeakerActionClient(
  options: SpeakerActionClientOptions,
): SpeakerActionClient {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());
  const ids = options.ids ?? ((kind) => defaultActionIds(kind, now()));
  return {
    commitCreateReminder: async (input) =>
      withTimeout(
        commitPersonalAction({
          actionId: CREATE_REMINDER_ACTION_ID,
          ids: ids("remind"),
          inputs: {
            body: { kind: "text", value: input.body },
            dueAt: { kind: "text", value: input.dueAt },
          },
          options,
        }),
        timeoutMs,
      ),
    commitWriteMemory: async (input) =>
      withTimeout(
        commitPersonalAction({
          actionId: WRITE_MEMORY_ACTION_ID,
          ids: ids("note"),
          inputs: {
            body: { kind: "text", value: input.body },
          },
          options,
        }),
        timeoutMs,
      ),
  };
}

/**
 * Live zoend Action credentials plus an explicit personal definition path.
 * Does not fall back to the commercial lake.
 */
export function createSpeakerActionClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SpeakerActionClient | undefined {
  const credentials = actionCredentialsFromEnv(env);
  const definitionPath = env.ZOEN_PERSONAL_DEFINITION_PATH?.trim();
  if (credentials === undefined || definitionPath === undefined) {
    return undefined;
  }
  return createSpeakerActionClient({
    actions: createConnectOsdkActions(credentials),
    definition: personalDefinitionRefFromEnv(env),
    definitionPath,
    definitions: createConnectOsdkDefinitions(credentials),
    tenantId: personalTenantIdFromEnv(env),
  });
}

function actionCredentialsFromEnv(env: NodeJS.ProcessEnv):
  | { readonly baseUrl: string; readonly bearerToken: string }
  | undefined {
  const baseUrl = (
    env.ZOEN_ACTION_BASE_URL ??
    env.ZOEN_WORLD_BASE_URL ??
    env.ZOEN_IDENTITY_BASE_URL
  )?.trim();
  const bearerToken = agentBearerToken(env);
  if (baseUrl === undefined || bearerToken === undefined) {
    return undefined;
  }
  return { baseUrl, bearerToken };
}

function personalTenantIdFromEnv(env: NodeJS.ProcessEnv): string {
  return (
    env.ZOEN_TENANT_ID?.trim() ??
    env.ZOEN_WHATSAPP_TENANT?.trim() ??
    "tenant.a"
  );
}

function personalDefinitionRefFromEnv(
  env: NodeJS.ProcessEnv,
): OsdkDefinitionRef | undefined {
  const definitionId = env.ZOEN_PERSONAL_DEFINITION_ID?.trim();
  const digest = env.ZOEN_PERSONAL_DEFINITION_DIGEST?.trim();
  const revisionRaw = env.ZOEN_PERSONAL_DEFINITION_REVISION?.trim();
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

async function commitPersonalAction(input: {
  readonly actionId: string;
  readonly ids: SpeakerActionIds;
  readonly inputs: Record<string, { readonly kind: "text"; readonly value: string }>;
  readonly options: SpeakerActionClientOptions;
}): Promise<ActionCommitResult> {
  const compiled = applyDefinitionRef(
    await loadCompiled(input.options),
    input.options.definition,
  );
  await ensurePersonalLake(compiled, input.options);
  const handle = actionHandle(compiled, input.actionId, input.options.actions);
  const proposed = await handle.preview({
    expiresAt: input.ids.expiresAt,
    inputs: input.inputs,
    operationId: input.ids.operationId,
    proposalId: input.ids.proposalId,
    resourceId: input.ids.resourceId,
    validAt: input.ids.validAt,
  });
  if (proposed.kind !== "permit") {
    return {
      kind: proposed.kind === "deny" ? "denied" : "error",
      message: proposed.message,
    };
  }
  return handle.commit({
    approvalId: input.ids.approvalId,
    expiresAt: input.ids.expiresAt,
    inputs: input.inputs,
    operationId: input.ids.operationId,
    previewHash: proposed.previewHash,
    proposalId: input.ids.proposalId,
    resourceId: input.ids.resourceId,
    validAt: input.ids.validAt,
  });
}

/**
 * One stderr line for a personal write. No preview text, no JWT, no inbound.
 */
export function emitPersonalWriteLog(
  actionId: string,
  result: string,
  reason?: string,
): void {
  const line =
    reason === undefined
      ? { actionId, event: "personalWrite", result }
      : { actionId, event: "personalWrite", reason, result };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

async function ensurePersonalLake(
  compiled: CompiledDefinition,
  options: SpeakerActionClientOptions,
): Promise<void> {
  const definitions = options.definitions;
  const tenantId = options.tenantId;
  if (definitions === undefined || tenantId === undefined) {
    return;
  }
  const definitionId = compiled.definition.definitionId;
  const digest = compiled.digest;
  const key = `${tenantId}:${definitionId}:${digest}`;
  const existing = lakeEnsure.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const work = (async () => {
    await definitions.publish({
      canonicalJson: compiled.canonicalJson,
      digest,
      tenantId,
    });
    const active = await definitions.getActiveRevision({
      definitionId,
      tenantId,
    });
    if (active?.digest === digest) {
      return;
    }
    await definitions.activateRevision({
      currentDigest: active?.digest,
      definitionId,
      digest,
      tenantId,
    });
  })();
  lakeEnsure.set(key, work);
  try {
    await work;
  } catch (error: unknown) {
    lakeEnsure.delete(key);
    throw error;
  }
}

function actionHandle(
  compiled: CompiledDefinition,
  actionId: string,
  actions: OsdkActionsPort,
): OsdkActionHandle<unknown> {
  const action = compiled.definition.actions.find(
    (entry) => entry.id === actionId,
  );
  if (action === undefined) {
    throw new Error(`personal lake is missing action ${actionId}`);
  }
  return createActionHandle({
    action,
    actions,
    definition: {
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      revision: BigInt(compiled.definition.revision),
    },
  });
}

function loadCompiled(
  options: SpeakerActionClientOptions,
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

function defaultActionIds(kind: PersonalWriteKind, now: Date): SpeakerActionIds {
  const suffix = randomBytes(8).toString("hex");
  const actionPrefix = kind === "remind" ? "createReminder" : "writeMemory";
  return {
    approvalId: `approval.${actionPrefix}.${suffix}`,
    expiresAt: new Date(now.getTime() + 300_000),
    operationId: `operation.${actionPrefix}.${suffix}`,
    proposalId: `proposal.${actionPrefix}.${suffix}`,
    resourceId: PERSONAL_MEMORY_RESOURCE_ID,
    validAt: now,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("action commit timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function connectTransport(options: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${options.bearerToken}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl: options.baseUrl.replace(/\/$/u, ""),
    httpVersion: "1.1",
    interceptors: [authorization],
  });
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
