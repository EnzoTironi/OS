import { readFileSync } from "node:fs";
import type { DefinitionReferenceConfig } from "./types.js";

/**
 * Live credentials for the planted CLI to talk to zoend over HTTP.
 * Token file is the Fly agent bearer. Missing file fails on the call, not at bind.
 */
export interface ZoendHostEnv {
  readonly baseUrl: string;
  readonly bearerToken?: string;
  readonly definition?: DefinitionReferenceConfig;
  readonly definitionPath?: string;
  readonly tenantId?: string;
  readonly worldDefinitionPath?: string;
  readBearerToken(): string | undefined;
}

/**
 * True when serve should bind the kernel host (Fly sets token file + identity URL).
 */
export function liveKernelHostConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return zoendBaseUrl(env) !== undefined && agentTokenHint(env) !== undefined;
}

export function readZoendHostEnv(
  env: NodeJS.ProcessEnv = process.env,
): ZoendHostEnv | undefined {
  const baseUrl = zoendBaseUrl(env);
  if (baseUrl === undefined || agentTokenHint(env) === undefined) {
    return undefined;
  }
  return {
    baseUrl,
    bearerToken: env.ZOEN_AGENT_BEARER_TOKEN?.trim(),
    definition: definitionRefFromEnv(env),
    definitionPath: env.ZOEN_PERSONAL_DEFINITION_PATH?.trim(),
    readBearerToken: () => agentBearerToken(env),
    tenantId: env.ZOEN_TENANT_ID?.trim(),
    worldDefinitionPath: env.ZOEN_WORLD_DEFINITION_PATH?.trim(),
  };
}

export function zoendBaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  const raw = (
    env.ZOEN_ACTION_BASE_URL ??
    env.ZOEN_WORLD_BASE_URL ??
    env.ZOEN_IDENTITY_BASE_URL
  )?.trim();
  return raw === undefined || raw.length === 0
    ? undefined
    : raw.replace(/\/$/u, "");
}

function agentTokenHint(env: NodeJS.ProcessEnv): string | undefined {
  const inline = env.ZOEN_AGENT_BEARER_TOKEN?.trim();
  if (inline !== undefined && inline.length > 0) {
    return inline;
  }
  const file = env.ZOEN_AGENT_BEARER_TOKEN_FILE?.trim();
  return file === undefined || file.length === 0 ? undefined : file;
}

export function agentBearerToken(env: NodeJS.ProcessEnv): string | undefined {
  const inline = env.ZOEN_AGENT_BEARER_TOKEN?.trim();
  if (inline !== undefined && inline.length > 0) {
    return inline;
  }
  const file = env.ZOEN_AGENT_BEARER_TOKEN_FILE?.trim();
  if (file === undefined || file.length === 0) {
    return undefined;
  }
  try {
    const token = readFileSync(file, "utf8").trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

function definitionRefFromEnv(
  env: NodeJS.ProcessEnv,
): DefinitionReferenceConfig | undefined {
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
  const revision = Number(revisionRaw);
  if (!Number.isInteger(revision) || revision <= 0) {
    return undefined;
  }
  return { definitionId, digest, revision };
}
