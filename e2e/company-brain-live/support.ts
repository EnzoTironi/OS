import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  agentSessionObjectKey,
  agentSessionResultSchema,
  agentSessionSignatureHeader,
  companyBrainIngestObjectKey,
  companyBrainIngestSignatureHeader,
  signAgentSessionCommand,
  signCompanyBrainIngestCommand,
  type AgentSessionCommand,
  type AgentSessionResult,
  type CompanyBrainIngestCommand,
  type KnowledgeContext,
} from "../../packages/harness/src/index.js";
import {
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

export const environment = z
  .object({
    OPENCODE_API_KEY: z.string().min(1),
    OPENCODE_BASE_URL: z.literal("https://opencode.ai/zen/v1"),
    ZOEN_PROVIDER_A_ID: z.literal("zen-a"),
    ZOEN_PROVIDER_A_MODEL: z.literal("hy3-free"),
    ZOEN_PROVIDER_B_ID: z.literal("zen-b"),
    ZOEN_PROVIDER_B_MODEL: z.literal("laguna-s-2.1-free"),
  })
  .parse(process.env);
delete process.env.OPENCODE_API_KEY;
export const repositoryRoot = process.cwd();
export const scenario = "company-brain-live";
export const scenarioDirectory = path.join(repositoryRoot, "e2e", scenario);
export const generatedDirectory = path.join(scenarioDirectory, ".generated");
const distDirectory = path.join(repositoryRoot, "dist");
const targetDirectory = path.join(repositoryRoot, "target", "debug");
const postgresPortFallback = 55_446;
const keycloakPortFallback = 58_160;
const zoendPortFallback = 58_161;
const restateIngressPortFallback = 58_162;
const restateUiPortFallback = 59_075;
const providerPortFallback = 58_164;
const workerPortFallback = 58_165;
const workerControlPortFallback = 58_166;
const minioPortFallback = 59_007;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const providerPort = e2ePort("ZOEN_E2E_PROVIDER_PORT", providerPortFallback);
const workerPort = e2ePort("ZOEN_E2E_WORKER_PORT", workerPortFallback);
const workerControlPort = e2ePort(
  "ZOEN_E2E_WORKER_CONTROL_PORT",
  workerControlPortFallback,
);
export const baseUrl = e2eHttpUrl(
  "ZOEN_E2E_ZOEND_PORT",
  zoendPortFallback,
);
const providerBaseUrl = e2eHttpUrl(
  "ZOEN_E2E_PROVIDER_PORT",
  providerPortFallback,
);
const workerControlBaseUrl = e2eHttpUrl(
  "ZOEN_E2E_WORKER_CONTROL_PORT",
  workerControlPortFallback,
);
const restateIngress = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_INGRESS_PORT",
  restateIngressPortFallback,
);
const restateAdmin = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_UI_PORT",
  restateUiPortFallback,
);
export const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  keycloakPortFallback,
  "/realms/zoen",
);
const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);
const minioEndpoint = e2eHttpUrl(
  "ZOEN_E2E_MINIO_PORT",
  minioPortFallback,
);

export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
export const assertions: Record<string, boolean> = {};
export const failureInjections: string[] = [];

export interface ManagedProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly name: string;
  readonly output: string[];
  readonly stderr: string[];
}

let activeAgentWorker: ManagedProcess | undefined;

const workerHealthSchema = z
  .object({
    capabilities: z.array(z.string()),
    embedding: z
      .object({
        dimensions: z.literal(384),
        modelId: z.literal("Xenova/all-MiniLM-L6-v2"),
        modelRevision: z.literal(
          "751bff37182d3f1213fa05d7196b954e230abad9",
        ),
        versionDigest: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .passthrough(),
    ingestPaused: z.boolean(),
    providers: z.array(z.string()),
    trustedContext: z
      .object({
        principalId: z.string(),
        tenantId: z.string(),
      })
      .passthrough(),
  })
  .passthrough();
const fragmentIdsSchema = z
  .object({
    fragmentIds: z.array(z.string().regex(/^[0-9a-f]{64}$/)),
  })
  .strict();
const knowledgeContextSchema: z.ZodType<KnowledgeContext> = z
  .object({
    embeddingModel: z
      .object({
        modelId: z.string(),
        modelRevision: z.string(),
        versionDigest: z.string(),
      })
      .strict(),
    queryDigest: z.string(),
    results: z.array(
      z
        .object({
          fragmentDigest: z.string(),
          fragmentId: z.string(),
          indexVersion: z.string(),
          lexicalRank: z.number().nullable(),
          lexicalScore: z.number().nullable(),
          parserName: z.string(),
          parserVersionDigest: z.string(),
          sourceDigest: z.string(),
          sourceId: z.string(),
          sourceRevision: z.string(),
          text: z.string(),
          vectorRank: z.number().nullable(),
          vectorScore: z.number().nullable(),
        })
        .strict(),
    ),
    traceId: z.string(),
  })
  .strict();
const ingestionResultSchema = z
  .object({
    fragments: z.array(
      z
        .object({
          fragmentDigest: z.string(),
          fragmentId: z.string(),
          parserName: z.string(),
          parserVersionDigest: z.string(),
          sourceId: z.string(),
          text: z.string(),
        })
        .passthrough(),
    ),
    source: z
      .object({
        contentDigest: z.string(),
        extractionVersion: z.string(),
        objectKey: z.string(),
        parserName: z.string(),
        parserVersionDigest: z.string(),
        sourceId: z.string(),
        sourceRevision: z.string(),
        tenantId: z.string(),
      })
      .passthrough(),
  })
  .strict();

export function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = true;
}

export function inject(name: string): void {
  failureInjections.push(name);
}

export async function startZoend(
  policyManifestPath: string,
): Promise<ManagedProcess> {
  return startProcess({
    command: path.join(targetDirectory, "zoend"),
    environment: {
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_LISTEN_ADDR: e2eListenAddr(
        "ZOEN_E2E_ZOEND_PORT",
        zoendPortFallback,
      ),
      ZOEN_OIDC_AUDIENCE: "zoend",
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    name: "zoend",
    port: zoendPort,
  });
}

export async function startProviderProxy(): Promise<ManagedProcess> {
  return startProcess({
    arguments: [
      path.join(
        distDirectory,
        "e2e",
        "agent-capabilities-live",
        "provider-response-proxy.js",
      ),
    ],
    command: process.execPath,
    environment: {
      ZOEN_UPSTREAM_PROVIDER_BASE_URL: environment.OPENCODE_BASE_URL,
    },
    name: "Zen rate-limit proxy",
    port: providerPort,
  });
}

export async function startAgentWorker(
  bearerToken: string,
  definitionDigest: string,
  pauseBeforeIndex: boolean,
): Promise<ManagedProcess> {
  const worker = await startProcess({
    arguments: [path.join(distDirectory, "e2e", scenario, "worker.js")],
    command: process.execPath,
    environment: {
      DATABASE_URL: applicationDatabaseUrl,
      OPENCODE_API_KEY: environment.OPENCODE_API_KEY,
      OPENCODE_BASE_URL: providerBaseUrl,
      S3_ACCESS_KEY_ID: "zoen-access",
      S3_BUCKET: "zoen-company-brain",
      S3_ENDPOINT: minioEndpoint,
      S3_REGION: "us-east-1",
      S3_SECRET_ACCESS_KEY: "zoen-secret",
      ZOEN_AGENT_BEARER_TOKEN: bearerToken,
      ZOEN_AGENT_DEFINITION_DIGEST: definitionDigest,
      ZOEN_AGENT_SERVICE_URL: baseUrl,
      ZOEN_PROVIDER_A_ID: environment.ZOEN_PROVIDER_A_ID,
      ZOEN_PROVIDER_A_MODEL: environment.ZOEN_PROVIDER_A_MODEL,
      ZOEN_PROVIDER_B_ID: environment.ZOEN_PROVIDER_B_ID,
      ZOEN_PROVIDER_B_MODEL: environment.ZOEN_PROVIDER_B_MODEL,
      ...(pauseBeforeIndex
        ? { ZOEN_PAUSE_INGEST_BEFORE_INDEX: "true" }
        : {}),
    },
    name: "Company Brain Restate worker",
    port: workerPort,
  });
  activeAgentWorker = worker;
  await waitForPort(workerControlPort, worker);
  const health = await workerHealth();
  assert.ok(health.providers.includes("local-minilm"));
  return worker;
}

export async function registerAgentWorker(): Promise<void> {
  const response = await fetch(`${restateAdmin}/deployments`, {
    body: JSON.stringify({
      uri: `http://host.docker.internal:${workerPort}`,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.ok(response.ok, await response.text());
}

export async function invokeIngest(
  command: CompanyBrainIngestCommand,
  bindingKey: string,
) {
  const response = await requestIngest(command, bindingKey);
  const body = await response.text();
  assert.ok(response.ok, body);
  const raw: unknown = JSON.parse(body);
  return ingestionResultSchema.parse(raw);
}

export async function invokeRejectedIngest(
  command: CompanyBrainIngestCommand,
  bindingKey: string,
): Promise<string> {
  const response = await requestIngest(command, bindingKey);
  const body = await response.text();
  assert.equal(response.ok, false, body);
  return body;
}

function requestIngest(
  command: CompanyBrainIngestCommand,
  bindingKey: string,
): Promise<Response> {
  return fetch(
    `${restateIngress}/ZoenCompanyIngest/${encodeURIComponent(
      companyBrainIngestObjectKey(command),
    )}/run`,
    {
      body: JSON.stringify(command),
      headers: {
        "content-type": "application/json",
        [companyBrainIngestSignatureHeader]: signCompanyBrainIngestCommand(
          bindingKey,
          command,
        ),
      },
      method: "POST",
      signal: AbortSignal.timeout(600_000),
    },
  );
}

export async function invokeSession(
  command: AgentSessionCommand,
  bindingKey: string,
): Promise<AgentSessionResult> {
  let response: Response;
  try {
    response = await fetch(
      `${restateIngress}/ZoenAgentSession/${encodeURIComponent(
        agentSessionObjectKey(tenantA, command.sessionId),
      )}/run`,
      {
        body: JSON.stringify(command),
        headers: {
          "content-type": "application/json",
          [agentSessionSignatureHeader]: signAgentSessionCommand(
            bindingKey,
            command,
          ),
        },
        method: "POST",
        signal: AbortSignal.timeout(300_000),
      },
    );
  } catch (error: unknown) {
    await dumpSessionAbortDiagnostics();
    throw error;
  }
  const body = await response.text();
  assert.ok(response.ok, body);
  const raw: unknown = JSON.parse(body);
  return agentSessionResultSchema.parse(raw);
}

export async function workerHealth() {
  const response = await fetch(`${workerControlBaseUrl}/health`);
  const raw: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(raw));
  return workerHealthSchema.parse(raw);
}

export async function retrieve(query: string): Promise<KnowledgeContext> {
  const response = await fetch(`${workerControlBaseUrl}/retrieve`, {
    body: JSON.stringify({ query }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(300_000),
  });
  const raw: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(raw));
  return knowledgeContextSchema.parse(raw);
}

export async function fragmentIds(): Promise<readonly string[]> {
  const response = await fetch(`${workerControlBaseUrl}/fragment-ids`);
  const raw: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(raw));
  return fragmentIdsSchema.parse(raw).fragmentIds;
}

export async function postControl(route: string): Promise<void> {
  const response = await fetch(`${workerControlBaseUrl}${route}`, {
    method: "POST",
  });
  assert.equal(response.ok, true, await response.text());
}

export async function providerProxyStatus() {
  const response = await fetch(`${providerBaseUrl}/control/status`);
  const raw: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(raw));
  return z
    .object({
      lastUpstreamStatus: z.number().nullable(),
      providerCalls: z.number().int().nonnegative(),
      rateLimitRetries: z.number().int().nonnegative(),
    })
    .passthrough()
    .parse(raw);
}

async function dumpSessionAbortDiagnostics(): Promise<void> {
  let status: unknown;
  try {
    status = await providerProxyStatus();
  } catch (error: unknown) {
    status = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const workerStderr = activeAgentWorker?.stderr.join("") ?? "";
  const recentWorkerStderr = workerStderr
    .split(/\r?\n/u)
    .slice(-100)
    .join("\n")
    .slice(-20_000);
  const diagnostics = JSON.stringify(
    { providerProxyStatus: status, recentWorkerStderr },
    null,
    2,
  ).replaceAll(environment.OPENCODE_API_KEY, "[REDACTED]");
  process.stderr.write(`${diagnostics}\n`);
}

export async function operationEvidence(
  admin: PostgresClient,
  tenantId: string,
  operationId: string,
) {
  const result = await admin.query<{
    operations: string;
    principal_id: string | null;
    records: string;
  }>(
    `
      SELECT count(DISTINCT operation.operation_id)::text AS operations,
             count(DISTINCT record.claim_id)::text AS records,
             max(operation.committed_principal_id) AS principal_id
      FROM action_operations AS operation
      LEFT JOIN action_operation_records AS record
        ON record.tenant_id = operation.tenant_id
       AND record.operation_id = operation.operation_id
      WHERE operation.tenant_id = $1 AND operation.operation_id = $2
    `,
    [tenantId, operationId],
  );
  const row = result.rows[0];
  return {
    operations: Number(row?.operations),
    principalId: row?.principal_id ?? undefined,
    records: Number(row?.records),
  };
}

export async function rowCount(
  admin: PostgresClient,
  table: string,
  tenantId: string,
): Promise<number> {
  const allowed = new Set(["semantic_claims"]);
  assert.ok(allowed.has(table));
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

export async function traceReconstructs(
  admin: PostgresClient,
  tenantId: string,
  trace: KnowledgeContext,
): Promise<boolean> {
  for (const result of trace.results) {
    const stored = await admin.query<{
      fragment_digest: string;
      parser_name: string;
      parser_version_digest: string;
      source_digest: string;
    }>(
      `
        SELECT fragment.fragment_digest,
               fragment.parser_name,
               fragment.parser_version_digest,
               source.content_digest AS source_digest
        FROM company_fragments AS fragment
        JOIN company_sources AS source
          ON source.tenant_id = fragment.tenant_id
         AND source.source_id = fragment.source_id
         AND source.source_revision = fragment.source_revision
        WHERE fragment.tenant_id = $1 AND fragment.fragment_id = $2
      `,
      [tenantId, result.fragmentId],
    );
    const row = stored.rows[0];
    if (
      row?.fragment_digest !== result.fragmentDigest ||
      row.parser_name !== result.parserName ||
      row.parser_version_digest !== result.parserVersionDigest ||
      row.source_digest !== result.sourceDigest
    ) {
      return false;
    }
  }
  return trace.results.length > 0;
}

export async function tenantObjectIsolation(
  admin: PostgresClient,
): Promise<boolean> {
  const result = await admin.query<{
    object_key: string;
    tenant_id: string;
  }>(
    `
      SELECT tenant_id, object_key
      FROM company_sources
      WHERE source_id = 'source.policy'
      ORDER BY tenant_id
    `,
  );
  return (
    result.rows.length === 2 &&
    result.rows.every((row) =>
      row.object_key.startsWith(`company-brain/${row.tenant_id}/`),
    )
  );
}

export async function objectDigestMatches(
  admin: PostgresClient,
  tenantId: string,
  sourceId: string,
  sourceRevision: string,
): Promise<boolean> {
  const result = await admin.query<{
    content_digest: string;
    object_key: string;
  }>(
    `
      SELECT content_digest, object_key
      FROM company_sources
      WHERE tenant_id = $1 AND source_id = $2 AND source_revision = $3
    `,
    [tenantId, sourceId, sourceRevision],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return false;
  }
  const s3 = new S3Client({
    credentials: {
      accessKeyId: "zoen-access",
      secretAccessKey: "zoen-secret",
    },
    endpoint: minioEndpoint,
    forcePathStyle: true,
    region: "us-east-1",
  });
  const object = await s3.send(
    new GetObjectCommand({
      Bucket: "zoen-company-brain",
      Key: row.object_key,
    }),
  );
  if (object.Body === undefined) {
    return false;
  }
  const bytes = await object.Body.transformToByteArray();
  return sha256(bytes) === row.content_digest;
}

export async function postgresVersion(admin: PostgresClient): Promise<string> {
  const result = await admin.query<{ server_version: string }>(
    "SHOW server_version",
  );
  return result.rows[0]?.server_version ?? "";
}

export async function trackedFilesContain(value: string): Promise<boolean> {
  const output = await command("git", ["ls-files", "-z"]);
  const paths = output.split("\0").filter((file) => file.length > 0);
  for (const file of paths) {
    const content = await readFile(path.join(repositoryRoot, file));
    if (content.includes(Buffer.from(value))) {
      return true;
    }
  }
  return false;
}

export async function killWorker(process: ManagedProcess): Promise<void> {
  assert.equal(process.name, "Company Brain Restate worker");
  assert.equal(process.child.exitCode, null);
  process.child.kill("SIGKILL");
  await once(process.child, "exit");
  assert.equal(process.child.signalCode, "SIGKILL");
}

export async function stopProcess(process: ManagedProcess): Promise<void> {
  if (process.child.exitCode !== null || process.child.signalCode !== null) {
    return;
  }
  process.child.kill("SIGINT");
  await once(process.child, "exit");
  assert.ok(
    process.child.exitCode === 0 || process.child.signalCode === "SIGINT",
    `${process.name} failed during shutdown:\n${process.output.join("")}`,
  );
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  description: string,
): Promise<T> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${description}`);
}

export function command(
  executable: string,
  arguments_: readonly string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function startProcess(options: {
  readonly arguments?: readonly string[];
  readonly command: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly name: string;
  readonly port: number;
}): Promise<ManagedProcess> {
  const output: string[] = [];
  const stderr: string[] = [];
  const child = spawn(options.command, [...(options.arguments ?? [])], {
    cwd: repositoryRoot,
    env: { ...process.env, ...options.environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    stderr.push(text);
  });
  const managed = { child, name: options.name, output, stderr };
  await waitForPort(options.port, managed);
  return managed;
}

async function waitForPort(
  port: number,
  process?: ManagedProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (
      process !== undefined &&
      (process.child.exitCode !== null || process.child.signalCode !== null)
    ) {
      throw new Error(
        `${process.name} exited during startup:\n${process.output.join("")}`,
      );
    }
    if (await canConnect(port)) {
      return;
    }
    await delay(50);
  }
  throw new Error(
    `${process?.name ?? `service on port ${port}`} did not start:\n${
      process?.output.join("") ?? ""
    }`,
  );
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
