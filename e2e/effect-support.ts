import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { createClient, type Client, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { ActionService } from "../gen/connect/zoen/action/v1/action_pb.js";
import { bindActionPreviewHash } from "./action-preview-bind.js";
import { DefinitionService } from "../gen/connect/zoen/definition/v1/definition_pb.js";
import { EffectService } from "../gen/connect/zoen/effect/v1/effect_pb.js";
import { WorldService } from "../gen/connect/zoen/world/v1/world_pb.js";
import { e2eAuthDatabaseUrl } from "./ba-door.js";
import {
  e2eHttpUrl,
  e2eIdentityAdminToken,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "./host-env.js";

export const repositoryRoot = process.cwd();
const postgresPortFallback = 55_441;
const zoendPortFallback = 58_111;
const restateIngressFallback = 58_112;
const restateUiFallback = 59_071;
const connectorPortFallback = 58_113;
const providerPortFallback = 58_114;
const workerPortFallback = 58_115;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const connectorPort = e2ePort("ZOEN_E2E_CONNECTOR_PORT", connectorPortFallback);
const providerPort = e2ePort(
  "ZOEN_E2E_EFFECT_PROVIDER_PORT",
  e2ePort("ZOEN_E2E_PROVIDER_PORT", providerPortFallback),
);
const workerPort = e2ePort(
  "ZOEN_E2E_EFFECT_WORKER_PORT",
  e2ePort("ZOEN_E2E_WORKER_PORT", workerPortFallback),
);
const registrarPortFallback = 58_116;
const registrarPort = e2ePort(
  "ZOEN_E2E_EFFECT_REGISTRAR_PORT",
  registrarPortFallback,
);
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);
export const authDatabaseUrl = e2eAuthDatabaseUrl(postgresPortFallback);
export const zoenBaseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);

export const restateIngress = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_INGRESS_PORT",
  restateIngressFallback,
);
export const restateAdmin = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_UI_PORT",
  restateUiFallback,
);
export const connectorUrl = e2eHttpUrl(
  "ZOEN_E2E_CONNECTOR_PORT",
  connectorPortFallback,
  "/v1/effects",
);
export const providerUrl = e2eHttpUrl(
  "ZOEN_E2E_EFFECT_PROVIDER_PORT",
  providerPort,
  "/v1/operations",
);
export const connectorCallerToken = "connector-worker-token";
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";

const generatedDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ?? "e2e/explain/.generated";
const generatedDirectoryPath = path.isAbsolute(generatedDirectory)
  ? generatedDirectory
  : path.join(repositoryRoot, generatedDirectory);
const composeDirectory = generatedDirectoryPath.replace(/\/\.generated\/?$/, "");
const composeFile = path.join(composeDirectory, "compose.yaml");
const composeProject = `zoen-${path.basename(composeDirectory)}`;
const targetDirectory = path.join(repositoryRoot, "target", "debug");
const distDirectory = path.join(repositoryRoot, "dist");
const effectArtifactDirectory = path.join(
  distDirectory,
  "apps",
  "zoend",
  "effect-handler",
);
export const effectWorkerApiKeyFile = path.join(
  generatedDirectoryPath,
  "effect-worker.api-key",
);
export const effectWorkerReadyFile = path.join(
  generatedDirectoryPath,
  "effect-worker.ready.json",
);
const providerOperationSchema = z
  .object({
    evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
    idempotencyKey: z.string().min(1),
    observedAtMicros: z.string().regex(/^[0-9]+$/),
    outcome: z.enum(["confirmed", "no_effect", "pending"]),
    providerOperationId: z.string().min(1),
    requests: z.number().int().positive(),
    sourceRef: z.string().min(1),
  })
  .strict();
const providerStatsSchema = z
  .object({
    operations: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
  })
  .strict();
const connectorStatusSchema = providerOperationSchema.omit({ requests: true });
const invocationLookupSchema = z
  .object({ invocationId: z.string().min(1) })
  .passthrough();
const issuedCredentialSchema = z
  .object({
    apiKeyOnce: z.string().min(1),
    credentialId: z.string().min(1),
    principalId: z.string().min(1),
    tenantId: z.string().min(1),
    workloadId: z.string().min(1),
  })
  .strict();
const workloadSessionSchema = z
  .object({
    actorId: z.string().min(1),
    credentialId: z.string().min(1),
    exchangeToken: z.string().min(1),
    principalId: z.string().min(1),
    tenantId: z.string().min(1),
    workloadId: z.string().min(1),
  })
  .passthrough();

export type ActionClient = Client<typeof ActionService>;
export type DefinitionClient = Client<typeof DefinitionService>;
export type EffectClient = Client<typeof EffectService>;
export type WorldClient = Client<typeof WorldService>;
export type ProviderOperation = z.infer<typeof providerOperationSchema>;
export type ProviderStats = z.infer<typeof providerStatsSchema>;
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;
export type IssuedWorkloadCredential = z.infer<
  typeof issuedCredentialSchema
>;

export interface WorkloadIdentity {
  actorId: string;
  principalId: string;
  tenantId: string;
  workloadId: "workload.effect-reconciler" | "workload.effect-worker";
}

interface WorkloadCredentialOptions {
  allowedIngress?: readonly {
    kind: "api_event";
    sourceClass: string;
  }[];
  delegation?: readonly {
    actions: readonly string[];
    id: string;
    resources: readonly string[];
  }[];
  expiresAtMicros?: number;
}

export interface ManagedProcess {
  child: ChildProcessWithoutNullStreams;
  name: string;
  output: string[];
  processGroupId?: number;
  stderr: string[];
}

export function adminClient(): PostgresClient {
  return new PostgresClient({ connectionString: adminDatabaseUrl });
}

export function actionClient(
  token: string,
  tenantId: string = tenantA,
): ActionClient {
  return bindActionPreviewHash(
    createClient(ActionService, transport(token, tenantId)),
  );
}

export function definitionClient(
  token: string,
  tenantId: string = tenantA,
): DefinitionClient {
  return createClient(DefinitionService, transport(token, tenantId));
}

export function effectClient(
  token: string,
  tenantId: string = tenantA,
): EffectClient {
  return createClient(EffectService, transport(token, tenantId));
}

export function worldClient(
  token: string,
  tenantId: string = tenantA,
): WorldClient {
  return createClient(WorldService, transport(token, tenantId));
}

export async function startZoend(
  policyManifestPath: string,
  options: { effectWorkerWorkloadId?: string } = {},
): Promise<ManagedProcess> {
  return startProcess({
    command: path.join(targetDirectory, "zoen"),
    arguments: ["serve"],
    environment: {
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_AUTH_DATABASE_URL: authDatabaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_EFFECT_WORKER_WORKLOAD_ID:
        options.effectWorkerWorkloadId ?? "workload.effect-worker",
      ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
    },
    name: "zoend",
    port: zoendPort,
  });
}

export async function startFaultProvider(): Promise<ManagedProcess> {
  return startProcess({
    command: process.execPath,
    arguments: [
      path.join(distDirectory, "e2e", "effect-fault-provider.js"),
    ],
    environment: {
      ZOEN_E2E_PROVIDER_PORT: providerPort.toString(),
    },
    name: "fault provider",
    port: providerPort,
  });
}

export async function startConnector(options?: {
  credentials?: Readonly<
    Record<string, { readonly secret: string; readonly tenantId: string }>
  >;
  providerUrl?: string;
  timeoutMs?: number;
}): Promise<ManagedProcess> {
  return startProcess({
    command: path.join(targetDirectory, "zoen-http-connector"),
    environment: {
      ZOEN_CONNECTOR_CREDENTIALS: JSON.stringify(
        options?.credentials ?? {
          "secret.provider.a": {
            secret: "provider-secret",
            tenantId: tenantA,
          },
          "secret.provider.b": {
            secret: "provider-secret",
            tenantId: tenantB,
          },
        },
      ),
      ZOEN_CONNECTOR_CALLER_TOKEN: connectorCallerToken,
      ZOEN_CONNECTOR_LISTEN_ADDR: e2eListenAddr(
        "ZOEN_E2E_CONNECTOR_PORT",
        connectorPortFallback,
      ),
      ZOEN_CONNECTOR_PROVIDER_TIMEOUT_MS: (
        options?.timeoutMs ?? 250
      ).toString(),
      ZOEN_CONNECTOR_PROVIDER_URL: options?.providerUrl ?? providerUrl,
    },
    name: "HTTP connector",
    port: connectorPort,
  });
}

export async function issueWorkloadCredential(
  operatorToken: string,
  identity: WorkloadIdentity,
  options: WorkloadCredentialOptions = {},
): Promise<IssuedWorkloadCredential> {
  const response = await requestWorkloadCredential(
    operatorToken,
    identity,
    options,
  );
  const text = await response.text();
  assert.equal(
    response.ok,
    true,
    `workload credential issue failed: HTTP ${response.status} ${text}`,
  );
  return issuedCredentialSchema.parse(JSON.parse(text) as unknown);
}

export function requestWorkloadCredential(
  operatorToken: string,
  identity: WorkloadIdentity,
  options: WorkloadCredentialOptions = {},
): Promise<Response> {
  return fetch(`${zoenBaseUrl}/workload/admin/credentials`, {
    body: JSON.stringify({
      actorId: identity.actorId,
      allowedIngress: options.allowedIngress ?? [],
      delegation: options.delegation ?? [
        {
          actions: [
            identity.workloadId === "workload.effect-worker"
              ? "zoen.effect.execute"
              : "zoen.effect.reconcile",
          ],
          id: `delegation.${identity.workloadId}`,
          resources: ["zoen.effect.requests"],
        },
      ],
      expiresAtMicros:
        options.expiresAtMicros ?? 4_102_444_800_000_000,
      principalId: identity.principalId,
      rateBudget: {
        maxAcceptsPerMinute: 120,
        maxCommitsPerHour: 120,
      },
      tenantId: identity.tenantId,
      workloadId: identity.workloadId,
    }),
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function revokeWorkloadCredential(
  operatorToken: string,
  credentialId: string,
  tenantId: string,
): Promise<void> {
  const response = await fetch(
    `${zoenBaseUrl}/workload/admin/credentials/${encodeURIComponent(credentialId)}`,
    {
      body: JSON.stringify({ reason: "rotation", tenantId }),
      headers: {
        authorization: `Bearer ${operatorToken}`,
        "content-type": "application/json",
      },
      method: "DELETE",
    },
  );
  assert.equal(
    response.ok,
    true,
    `workload credential revoke failed: HTTP ${response.status} ${await response.text()}`,
  );
}

export async function exchangeWorkloadCredential(
  credential: IssuedWorkloadCredential,
  expected: WorkloadIdentity,
): Promise<string> {
  const response = await fetch(`${zoenBaseUrl}/workload/authenticate`, {
    body: JSON.stringify({ apiKey: credential.apiKeyOnce }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  assert.equal(
    response.ok,
    true,
    `workload credential exchange failed: HTTP ${response.status} ${text}`,
  );
  const session = workloadSessionSchema.parse(JSON.parse(text) as unknown);
  assert.deepEqual(
    {
      actorId: session.actorId,
      principalId: session.principalId,
      tenantId: session.tenantId,
      workloadId: session.workloadId,
    },
    expected,
  );
  assert.equal(session.credentialId, credential.credentialId);
  return session.exchangeToken;
}

export async function writeEffectWorkerApiKey(
  credential: IssuedWorkloadCredential,
): Promise<string> {
  return writeEffectWorkerApiKeyValue(credential.apiKeyOnce);
}

export async function writeEffectWorkerApiKeyValue(
  apiKey: string,
): Promise<string> {
  await mkdir(path.dirname(effectWorkerApiKeyFile), { recursive: true });
  await writeFile(effectWorkerApiKeyFile, `${apiKey}\n`, {
    mode: 0o600,
  });
  await chmod(effectWorkerApiKeyFile, 0o600);
  return effectWorkerApiKeyFile;
}

export async function startCredentialValidator(
  identity: WorkloadIdentity,
  options: { awaitReady?: boolean } = {},
): Promise<ManagedProcess> {
  assert.equal(identity.workloadId, "workload.effect-worker");
  const process = spawnProcess({
    command: path.join(
      repositoryRoot,
      "deploy",
      "fly",
      "zoen-ensure-effect-workload-credential",
    ),
    environment: {
      ZOEN_EFFECT_CREDENTIAL_CHECK_INTERVAL_SECONDS: "1",
      ZOEN_EFFECT_WORKER_ACTOR_ID: identity.actorId,
      ZOEN_EFFECT_WORKER_API_KEY_FILE: effectWorkerApiKeyFile,
      ZOEN_EFFECT_WORKER_CREDENTIAL_READY_FILE: effectWorkerReadyFile,
      ZOEN_EFFECT_WORKER_PRINCIPAL_ID: identity.principalId,
      ZOEN_EFFECT_WORKER_WORKLOAD_ID: identity.workloadId,
      ZOEN_TENANT_ID: identity.tenantId,
      ZOEN_ZOEND: zoenBaseUrl,
    },
    name: "effect credential validator",
    processGroup: true,
  });
  if (options.awaitReady === false) {
    return process;
  }
  await waitForCredentialReady(identity, process);
  return process;
}

export async function credentialReady(
  identity: WorkloadIdentity,
): Promise<boolean> {
  try {
    const metadata = await stat(effectWorkerReadyFile);
    const body = await readFile(effectWorkerReadyFile, "utf8");
    return metadata.isFile() && body.includes(identity.principalId);
  } catch {
    return false;
  }
}

export async function waitForCredentialReady(
  identity: WorkloadIdentity,
  process?: ManagedProcess,
): Promise<void> {
  await waitFor(async () => {
    if (process !== undefined && process.child.exitCode !== null) {
      throw new Error(
        `${process.name} exited during startup:\n${process.output.join("")}`,
      );
    }
    return (await credentialReady(identity)) ? true : undefined;
  }, "validated effect worker credential");
}

export async function prepareWorkerArtifact(
  revision = "effect-runtime-fixture",
): Promise<void> {
  await runProcess(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        "apps",
        "zoend",
        "effect-handler",
        "write-build-artifact.mjs",
      ),
      revision,
    ],
  );
}

export async function startWorker(
  identity: WorkloadIdentity,
  options: { artifactRevision?: string } = {},
): Promise<ManagedProcess> {
  assert.equal(identity.workloadId, "workload.effect-worker");
  await prepareWorkerArtifact(options.artifactRevision);
  return startProcess({
    command: process.execPath,
    arguments: [path.join(effectArtifactDirectory, "main.js")],
    environment: {
      NODE_ENV: "test",
      ZOEN_CONNECTOR_CALLER_TOKEN: connectorCallerToken,
      ZOEN_CONNECTOR_CREDENTIAL_REFS: JSON.stringify({
        [identity.tenantId]:
          identity.tenantId === tenantA
            ? "secret.provider.a"
            : "secret.provider.b",
      }),
      ZOEN_EFFECT_CONNECTOR_URL: connectorUrl,
      ZOEN_EFFECT_HANDLER_HOST: "0.0.0.0",
      ZOEN_EFFECT_HANDLER_PORT: workerPort.toString(),
      ZOEN_EFFECT_REGISTRATION_LEASE_MAX_AGE_MS: "1000",
      ZOEN_EFFECT_REGISTRATION_STATUS_URL: `http://127.0.0.1:${registrarPort}/status`,
      ZOEN_EFFECT_WORKER_ACTOR_ID: identity.actorId,
      ZOEN_EFFECT_WORKER_API_KEY_FILE: effectWorkerApiKeyFile,
      ZOEN_EFFECT_WORKER_PRINCIPAL_ID: identity.principalId,
      ZOEN_EFFECT_WORKER_WORKLOAD_ID: identity.workloadId,
      ZOEN_TENANT_ID: identity.tenantId,
      ZOEN_ZOEND: zoenBaseUrl,
    },
    name: "production Restate effect handler",
    port: workerPort,
  });
}

export async function startEffectRegistrar(
  identity: WorkloadIdentity,
): Promise<ManagedProcess> {
  assert.equal(identity.workloadId, "workload.effect-worker");
  return startProcess({
    command: process.execPath,
    arguments: [
      path.join(
        distDirectory,
        "apps",
        "zoend",
        "effect-registrar",
        "main.js",
      ),
    ],
    environment: {
      NODE_ENV: "test",
      RESTATE_ADMIN_URL: restateAdmin,
      ZOEN_EFFECT_CONNECTOR_HEALTH_URL: new URL(
        "/health",
        connectorUrl,
      ).toString(),
      ZOEN_EFFECT_HANDLER_HEALTH_URL: `http://127.0.0.1:${workerPort}/health`,
      ZOEN_EFFECT_HANDLER_IDENTITY_URL: `http://127.0.0.1:${workerPort}/zoen/artifact`,
      ZOEN_EFFECT_HANDLER_REGISTRATION_URI: `http://host.docker.internal:${workerPort}`,
      ZOEN_EFFECT_REGISTRAR_LISTEN_ADDR: `127.0.0.1:${registrarPort}`,
      ZOEN_EFFECT_REGISTRATION_INTERVAL_MS: "100",
      ZOEN_EFFECT_WORKER_ACTOR_ID: identity.actorId,
      ZOEN_EFFECT_WORKER_CREDENTIAL_MAX_AGE_MS: "30000",
      ZOEN_EFFECT_WORKER_CREDENTIAL_READY_FILE: effectWorkerReadyFile,
      ZOEN_EFFECT_WORKER_PRINCIPAL_ID: identity.principalId,
      ZOEN_EFFECT_WORKER_WORKLOAD_ID: identity.workloadId,
      ZOEN_TENANT_ID: identity.tenantId,
      ZOEN_ZOEND: zoenBaseUrl,
    },
    name: "effect registration reconciler",
    port: registrarPort,
  });
}

export async function stopProcess(managed: ManagedProcess): Promise<void> {
  if (managed.child.exitCode !== null) {
    return;
  }
  signalManagedProcess(managed, "SIGINT");
  await Promise.race([once(managed.child, "exit"), delay(2000)]);
  if (managed.child.exitCode === null && managed.child.signalCode === null) {
    signalManagedProcess(managed, "SIGKILL");
    await once(managed.child, "exit");
  }
  assert.ok(
    managed.child.exitCode === 0 ||
      managed.child.signalCode === "SIGINT" ||
      managed.child.signalCode === "SIGKILL",
    `${managed.name} failed during shutdown:\n${managed.output.join("")}`,
  );
}

export async function crashProcess(managed: ManagedProcess): Promise<void> {
  if (managed.child.exitCode !== null || managed.child.signalCode !== null) {
    return;
  }
  signalManagedProcess(managed, "SIGKILL");
  await once(managed.child, "exit");
  assert.equal(managed.child.signalCode, "SIGKILL");
}

export function suspendProcess(managed: ManagedProcess): void {
  assert.equal(managed.child.exitCode, null);
  assert.equal(managed.child.signalCode, null);
  assert.equal(signalManagedProcess(managed, "SIGSTOP"), true);
}

export function resumeProcess(managed: ManagedProcess): void {
  if (managed.child.exitCode === null && managed.child.signalCode === null) {
    assert.equal(signalManagedProcess(managed, "SIGCONT"), true);
  }
}

export async function dispatchOnce(
  tenantId = tenantA,
  gateTimeoutMs = 5000,
): Promise<void> {
  await runProcess(
    path.join(targetDirectory, "zoen-effect-dispatcher"),
    [],
    {
      DATABASE_URL: applicationDatabaseUrl,
      RESTATE_INGRESS: restateIngress,
      ZOEN_EFFECT_DISPATCH_ONCE: "true",
      ZOEN_EFFECT_DISPATCH_GATE_TIMEOUT_MS: gateTimeoutMs.toString(),
      ZOEN_EFFECT_REGISTRATION_HEALTH_URL: `http://127.0.0.1:${registrarPort}/health`,
      ZOEN_TENANT_ID: tenantId,
    },
  );
}

export async function registerWorker(): Promise<string> {
  return waitFor(async () => {
    const health = await fetch(
      `http://127.0.0.1:${registrarPort}/health`,
    );
    if (!health.ok) {
      return undefined;
    }
    const status = await fetch(
      `http://127.0.0.1:${registrarPort}/status`,
    );
    const body = await status.text();
    return status.ok ? body : undefined;
  }, "exact production effect registration");
}

export async function registrarReady(): Promise<boolean> {
  try {
    const health = await fetch(`http://127.0.0.1:${registrarPort}/health`);
    return health.ok;
  } catch {
    return false;
  }
}

export async function lookupInvocation(
  effectRequestId: string,
  dispatchVersion: string,
  tenantId = tenantA,
): Promise<string> {
  const key = `${tenantId}:${effectRequestId}:${dispatchVersion}`;
  const response = await fetch(`${restateIngress}/restate/lookup`, {
    body: JSON.stringify({
      handler: "execute",
      idempotencyKey: key,
      key,
      service: "ZoenEffect",
      target: "idempotentInvocation",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return invocationLookupSchema.parse(body).invocationId;
}

export async function setProviderMode(
  mode:
    | "accepted_pending"
    | "confirmed"
    | "confirmed_no_effect"
    | "hold_confirmed"
    | "parse_error"
    | "schema_error"
    | "timeout_after_delivery"
    | "truncate_after_commit"
    | "unavailable",
): Promise<void> {
  const response = await fetch(
    `${e2eHttpUrl("ZOEN_E2E_EFFECT_PROVIDER_PORT", providerPort)}/control`,
    {
      body: JSON.stringify({ mode }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert.equal(response.ok, true, await response.text());
}

export async function providerOperation(
  idempotencyKey: string,
): Promise<ProviderOperation | undefined> {
  const response = await fetch(
    `${e2eHttpUrl("ZOEN_E2E_EFFECT_PROVIDER_PORT", providerPort)}/v1/operations/by-idempotency/${encodeURIComponent(idempotencyKey)}`,
    { headers: { authorization: "Bearer provider-secret" } },
  );
  if (response.status === 404) {
    return undefined;
  }
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return providerOperationSchema.parse(body);
}

export async function providerStats(): Promise<ProviderStats> {
  const response = await fetch(
    `${e2eHttpUrl("ZOEN_E2E_EFFECT_PROVIDER_PORT", providerPort)}/operations/stats`,
  );
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return providerStatsSchema.parse(body);
}

export async function connectorStatus(
  idempotencyKey: string,
  tenantId = tenantA,
  credentialRef = tenantId === tenantA
    ? "secret.provider.a"
    : "secret.provider.b",
): Promise<ConnectorStatus | undefined> {
  const response = await fetch(`${connectorUrl}/status`, {
    body: JSON.stringify({ credentialRef, idempotencyKey, tenantId }),
    headers: {
      authorization: `Bearer ${connectorCallerToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (response.status === 404) {
    return undefined;
  }
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return connectorStatusSchema.parse(body);
}

export async function stopRestate(): Promise<void> {
  await compose("stop", "restate");
}

export async function startRestate(): Promise<void> {
  await compose("start", "restate");
  await waitForPort(e2ePort("ZOEN_E2E_RESTATE_UI_PORT", restateUiFallback));
  await waitForPort(
    e2ePort("ZOEN_E2E_RESTATE_INGRESS_PORT", restateIngressFallback),
  );
}

export async function restartRestate(): Promise<void> {
  await compose("restart", "restate");
  await waitForPort(e2ePort("ZOEN_E2E_RESTATE_UI_PORT", restateUiFallback));
  await waitForPort(
    e2ePort("ZOEN_E2E_RESTATE_INGRESS_PORT", restateIngressFallback),
  );
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  description: string,
  attempts = 200,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await probe();
    if (result !== undefined) {
      return result;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function startProcess(options: {
  arguments?: readonly string[];
  command: string;
  environment: Readonly<Record<string, string>>;
  name: string;
  port: number;
}): Promise<ManagedProcess> {
  const managedProcess = spawnProcess(options);
  await waitForPort(options.port, managedProcess);
  return managedProcess;
}

function spawnProcess(options: {
  arguments?: readonly string[];
  command: string;
  environment: Readonly<Record<string, string>>;
  name: string;
  processGroup?: boolean;
}): ManagedProcess {
  const output: string[] = [];
  const stderr: string[] = [];
  const child = spawn(options.command, [...(options.arguments ?? [])], {
    cwd: repositoryRoot,
    detached: options.processGroup === true,
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
  const processGroupId = options.processGroup === true ? child.pid : undefined;
  assert.ok(options.processGroup !== true || processGroupId !== undefined);
  return { child, name: options.name, output, processGroupId, stderr };
}

function signalManagedProcess(
  managed: ManagedProcess,
  signal: NodeJS.Signals,
): boolean {
  if (managed.processGroupId === undefined) {
    return managed.child.kill(signal);
  }
  try {
    process.kill(-managed.processGroupId, signal);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

async function waitForPort(
  port: number,
  process?: ManagedProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (process !== undefined && process.child.exitCode !== null) {
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

function transport(token: string, tenantId: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    request.header.set("x-zoen-tenant", tenantId);
    return next(request);
  };
  return createConnectTransport({
    baseUrl: zoenBaseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

function compose(...arguments_: readonly string[]): Promise<string> {
  return runProcess("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    ...arguments_,
  ]);
}

function runProcess(
  command: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(
            new Error(
              `${command} ${arguments_.join(" ")} failed:\n${stdout}${stderr}`,
              { cause: error },
            ),
          );
        }
      },
    );
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
