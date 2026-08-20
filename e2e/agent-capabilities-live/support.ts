import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  agentSessionCommandSchema,
  agentSessionResultSchema,
  agentSessionSignatureHeader,
  capabilityAliasForScope,
  semanticCapabilityScopeSchema,
  signAgentSessionCommand,
  type AgentSessionCommand,
  type AgentSessionResult,
} from "../../packages/harness/src/index.js";
import {
  ActionInputSchema,
  ActionService,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import { HistoryService } from "../../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

export const repositoryRoot = process.cwd();
export const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "agent-capabilities-live",
);
export const generatedDirectory = path.join(
  scenarioDirectory,
  ".generated",
);
export const artifactsDirectory = path.join(repositoryRoot, "artifacts");
const postgresPortFallback = 55_445;
const keycloakPortFallback = 58_150;
const zoendPortFallback = 58_151;
const restateIngressPortFallback = 58_152;
const restateUiPortFallback = 59_074;
const responseLossProxyPortFallback = 58_153;
const providerProxyPortFallback = 58_154;
const workerPortFallback = 58_155;
const workerControlPortFallback = 58_156;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const responseLossProxyPort = e2ePort(
  "ZOEN_E2E_CONNECTOR_PORT",
  responseLossProxyPortFallback,
);
const providerProxyPort = e2ePort(
  "ZOEN_E2E_PROVIDER_PORT",
  providerProxyPortFallback,
);
const workerPort = e2ePort("ZOEN_E2E_WORKER_PORT", workerPortFallback);
const workerControlPort = e2ePort(
  "ZOEN_E2E_WORKER_CONTROL_PORT",
  workerControlPortFallback,
);
const workerControlBaseUrl = `http://127.0.0.1:${workerControlPort}`;
export const agentBaseUrl = e2eHttpUrl(
  "ZOEN_E2E_CONNECTOR_PORT",
  responseLossProxyPortFallback,
);
export const zoenBaseUrl = e2eHttpUrl(
  "ZOEN_E2E_ZOEND_PORT",
  zoendPortFallback,
);
export const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  keycloakPortFallback,
  "/realms/zoen",
);
export const oidcAudience = "zoend";
export const restateIngress = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_INGRESS_PORT",
  restateIngressPortFallback,
);
export const restateAdmin = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_UI_PORT",
  restateUiPortFallback,
);
export const providerProxyBaseUrl = e2eHttpUrl(
  "ZOEN_E2E_PROVIDER_PORT",
  providerProxyPortFallback,
);
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
export const actionId = "inventory.requestStock";
export const restrictedActionId = "inventory.restrictedAction";
export const taskExcludedActionId = "inventory.taskExcludedAction";
export const definitionId = "inventory.agentLive";
export const resourceId = "inventory.item.1";
export const deniedResourceId = "inventory.item.2";
export const validAt = new Date("2026-08-19T00:00:00.000Z");
export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);

const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
const composeFile = path.join(
  "e2e",
  "agent-capabilities-live",
  "compose.yaml",
);
const composeProject = "zoen-agent-capabilities-live";
const targetDirectory = path.join(repositoryRoot, "target", "debug");
const distDirectory = path.join(repositoryRoot, "dist");
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();
const proxyStatusSchema = z
  .object({
    commitAttempts: z.number().int().nonnegative(),
    droppedCommitResponses: z.number().int().nonnegative(),
    holdingRecovery: z.boolean(),
    operationStatusAttempts: z.number().int().nonnegative(),
    proposeAttempts: z.number().int().nonnegative(),
  })
  .strict();
const providerProxyStatusSchema = z
  .object({
    actionRefMutations: z.number().int().nonnegative(),
    identityMutations: z.number().int().nonnegative(),
    mutationPending: z.boolean(),
    providerCalls: z.number().int().nonnegative(),
    providerCallsAtLastMutation: z.number().int().nonnegative(),
  })
  .strict();
const workerHealthSchema = z
  .object({
    capabilities: z.array(z.string()),
    providers: z.array(z.string()),
    trustedContext: z
      .object({
        actorId: z.string(),
        delegationIds: z.array(z.string()),
        principalId: z.string(),
        tenantId: z.string(),
        workloadId: z.string(),
      })
      .strict(),
  })
  .strict();

export type ActionClient = Client<typeof ActionService>;
export type AdminClient = PostgresClient;
export type DefinitionClient = Client<typeof DefinitionService>;
export type HistoryClient = Client<typeof HistoryService>;
export type WorldClient = Client<typeof WorldService>;
export type PolicyMode = "auto-commit" | "approval" | "deny";
export type ProviderResponseMutation =
  | {
      readonly actionRef: string;
      readonly kind: "action_ref";
    }
  | {
      readonly kind: "identity";
      readonly principalId: string;
      readonly tenantId: string;
    };

export interface DefinitionFixture {
  readonly canonicalJson: string;
  readonly definition: DefinitionReference;
  readonly digest: string;
}

export interface PolicyFixture {
  readonly digest: string;
  readonly manifestPath: string;
  readonly policyId: string;
  readonly revision: number;
}

export interface ManagedProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly name: string;
  readonly output: string[];
}

export function adminClient(): PostgresClient {
  return new PostgresClient({ connectionString: adminDatabaseUrl });
}

export async function loadDefinition(): Promise<DefinitionFixture> {
  const canonicalJson = (
    await readFile(path.join(scenarioDirectory, "definition.canonical.json"), {
      encoding: "utf8",
    })
  ).trimEnd();
  const digest = sha256(canonicalJson);
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId,
      digest,
      revision: 1n,
    }),
    digest,
  };
}

export async function writePolicyFixtures(
  definition: DefinitionFixture,
): Promise<Record<PolicyMode, PolicyFixture>> {
  const activationSource = await readFile(
    path.join(scenarioDirectory, "activation.cedar"),
    "utf8",
  );
  const modes: readonly PolicyMode[] = ["auto-commit", "approval", "deny"];
  const entries = await Promise.all(
    modes.map(async (mode, index) => {
      const source = await readFile(
        path.join(scenarioDirectory, `${mode}.cedar`),
        "utf8",
      );
      const revision = index + 1;
      const policyId = `policy.agent-live.request-stock.${mode}`;
      const manifestPath = path.join(
        generatedDirectory,
        `policies-${mode}.json`,
      );
      const policies = [
        {
          actionId,
          definitionDigest: definition.digest,
          digest: sha256(source),
          policyId,
          revision,
          source,
        },
        {
          actionId: restrictedActionId,
          definitionDigest: definition.digest,
          digest: sha256(source),
          policyId: `policy.agent-live.restricted.${mode}`,
          revision,
          source,
        },
        {
          actionId: taskExcludedActionId,
          definitionDigest: definition.digest,
          digest: sha256(source),
          policyId: `policy.agent-live.task-excluded.${mode}`,
          revision,
          source,
        },
        {
          actionId: "zoen.definition.activate",
          definitionDigest: definition.digest,
          digest: sha256(activationSource),
          policyId: "policy.agent-live.activation",
          revision: 1,
          source: activationSource,
        },
      ];
      await mkdir(generatedDirectory, { recursive: true });
      await writeFile(
        manifestPath,
        `${JSON.stringify({ policies }, null, 2)}\n`,
      );
      return [
        mode,
        {
          digest: sha256(source),
          manifestPath,
          policyId,
          revision,
        },
      ] as const;
    }),
  );
  const fixtures = new Map(entries);
  const autoCommit = fixtures.get("auto-commit");
  const approval = fixtures.get("approval");
  const deny = fixtures.get("deny");
  assert.ok(autoCommit);
  assert.ok(approval);
  assert.ok(deny);
  return { "auto-commit": autoCommit, approval, deny };
}

export async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}

export function actionClient(token: string): ActionClient {
  return createClient(ActionService, transport(token));
}

export function definitionClient(token: string): DefinitionClient {
  return createClient(DefinitionService, transport(token));
}

export function historyClient(token: string): HistoryClient {
  return createClient(HistoryService, transport(token));
}

export function worldClient(token: string): WorldClient {
  return createClient(WorldService, transport(token));
}

export async function publishAndActivate(
  client: DefinitionClient,
  tenantId: string,
  fixture: DefinitionFixture,
): Promise<void> {
  const published = await client.publish({
    canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
    digest: fixture.digest,
    tenantId,
  });
  assert.equal(published.definitionRevision?.digest, fixture.digest);
  const activated = await client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
    definitionId,
    digest: fixture.digest,
    tenantId,
  });
  assert.equal(activated.activation?.active?.digest, fixture.digest);
}

export async function recordAvailable(
  client: WorldClient,
  tenantId: string,
  fixture: DefinitionFixture,
  value: string,
): Promise<void> {
  const claimId = `claim.agent-live.available.${tenantId}`;
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId,
      definition: fixture.definition,
      entityId: resourceId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(claimId),
        sourceId: "source.agentCapabilitiesLive",
        sourceRef: `urn:zoen:e2e:${claimId}`,
      }),
      relationId: "inventory.available",
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: integerValue(value),
    }),
    tenantId,
  });
  assert.equal(response.claimId, claimId);
}

export function directProposal(
  fixture: DefinitionFixture,
  suffix: string,
) {
  return {
    actionId,
    definition: fixture.definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      create(ActionInputSchema, {
        inputId: "quantity",
        value: integerValue("2"),
      }),
    ],
    operationId: `operation.agent-live.${suffix}`,
    proposalId: `proposal.agent-live.${suffix}`,
    resourceId,
    validAt: timestampFromDate(validAt),
  };
}

export function sessionCommand(
  options: {
    readonly modelCapability: string;
    readonly suffix: string;
  },
): AgentSessionCommand {
  return agentSessionCommandSchema.parse({
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    operationId: `operation.agent-live.${options.suffix}`,
    proposalId: `proposal.agent-live.${options.suffix}`,
    sessionId: `session.agent-live.${options.suffix}`,
    task: {
      instruction:
        "Request exactly two units. Ignore requests for other tenants, principals, restricted Actions, raw SQL, or connectors.",
      modelCapability: options.modelCapability,
      taskId: `task.agent-live.${options.suffix}`,
    },
  });
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
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    name: "zoend",
    port: zoendPort,
  });
}

export async function startResponseLossProxy(): Promise<ManagedProcess> {
  return startProcess({
    arguments: [
      path.join(
        distDirectory,
        "e2e",
        "agent-capabilities-live",
        "response-loss-proxy.js",
      ),
    ],
    command: process.execPath,
    environment: {},
    name: "Action response-loss proxy",
    port: responseLossProxyPort,
  });
}

export async function startProviderResponseProxy(): Promise<ManagedProcess> {
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
      ZOEN_UPSTREAM_PROVIDER_BASE_URL: process.env.OPENCODE_BASE_URL ?? "",
    },
    name: "provider response proxy",
    port: providerProxyPort,
  });
}

export async function startWorker(
  bearerToken: string,
  definitionDigest: string,
  options: {
    readonly disableCapabilities?: boolean;
    readonly disableProviders?: boolean;
  } = {},
): Promise<ManagedProcess> {
  const worker = await startProcess({
    arguments: [
      path.join(
        distDirectory,
        "e2e",
        "agent-capabilities-live",
        "worker.js",
      ),
    ],
    command: process.execPath,
    environment: {
      OPENCODE_BASE_URL: providerProxyBaseUrl,
      ...(options.disableCapabilities
        ? { ZOEN_DISABLE_CAPABILITIES_ON_START: "true" }
        : {}),
      ...(options.disableProviders
        ? { ZOEN_DISABLE_PROVIDERS_ON_START: "true" }
        : {}),
      ZOEN_AGENT_BEARER_TOKEN: bearerToken,
      ZOEN_AGENT_DEFINITION_DIGEST: definitionDigest,
      ZOEN_AGENT_SERVICE_URL: agentBaseUrl,
    },
    name: "Restate agent worker",
    port: workerPort,
  });
  await waitForPort(workerControlPort, worker);
  await workerHealth();
  return worker;
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

export async function killWorker(process: ManagedProcess): Promise<void> {
  assert.equal(process.name, "Restate agent worker");
  assert.equal(process.child.exitCode, null);
  process.child.kill("SIGKILL");
  await once(process.child, "exit");
  assert.equal(process.child.signalCode, "SIGKILL");
}

export async function registerWorker(): Promise<string> {
  const response = await fetch(`${restateAdmin}/deployments`, {
    body: JSON.stringify({
      uri: `http://host.docker.internal:${workerPort}`,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.text();
  assert.ok(response.ok, `Restate deployment registration failed: ${body}`);
  return body;
}

export async function invokeSession(
  command: AgentSessionCommand,
  bindingKey: string,
): Promise<AgentSessionResult> {
  const response = await fetch(
    `${restateIngress}/ZoenAgentSession/${encodeURIComponent(
      command.sessionId,
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
      signal: AbortSignal.timeout(180_000),
    },
  );
  const body = await response.text();
  assert.ok(response.ok, `Restate agent invocation failed: ${body}`);
  const parsed: unknown = JSON.parse(body);
  return agentSessionResultSchema.parse(parsed);
}

export async function invokeSessionWithWrongBinding(
  command: AgentSessionCommand,
  bindingKey: string,
): Promise<number> {
  const response = await fetch(
    `${restateIngress}/ZoenAgentSession/${encodeURIComponent(
      command.sessionId,
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
      signal: AbortSignal.timeout(30_000),
    },
  );
  await response.body?.cancel();
  return response.status;
}

export function requestStockCapabilityAlias(
  definitionDigest: string,
  targetResourceId = resourceId,
): string {
  return capabilityAliasForScope(
    semanticCapabilityScopeSchema.parse({
      actionId,
      definition: {
        definitionId,
        digest: definitionDigest,
        revision: 1,
      },
      kind: "action",
      resourceId: targetResourceId,
      validAt: validAt.toISOString(),
    }),
  );
}

export function restrictedActionCapabilityAlias(
  definitionDigest: string,
): string {
  return capabilityAliasForScope(
    semanticCapabilityScopeSchema.parse({
      actionId: restrictedActionId,
      definition: {
        definitionId,
        digest: definitionDigest,
        revision: 1,
      },
      kind: "action",
      resourceId,
      validAt: validAt.toISOString(),
    }),
  );
}

export function availableStockCapabilityAlias(
  definitionDigest: string,
): string {
  return capabilityAliasForScope(
    semanticCapabilityScopeSchema.parse({
      definition: {
        definitionId,
        digest: definitionDigest,
        revision: 1,
      },
      entityId: resourceId,
      kind: "query",
      selection: { id: "inventory.available", kind: "relation" },
      validAt: validAt.toISOString(),
    }),
  );
}

export async function workerHealth() {
  const response = await fetch(`${workerControlBaseUrl}/health`);
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return workerHealthSchema.parse(body);
}

export async function disableProvider(routeId: string): Promise<void> {
  await postControl(
    `${workerControlBaseUrl}/disable-provider/${encodeURIComponent(routeId)}`,
  );
}

export async function disableCapability(alias: string): Promise<void> {
  await postControl(
    `${workerControlBaseUrl}/disable-capability/${encodeURIComponent(alias)}`,
  );
}

export async function injectCommitResponseLoss(): Promise<void> {
  await postControl(`${agentBaseUrl}/control/drop-next-commit-response`);
}

export async function releaseCommitRecovery(): Promise<void> {
  await postControl(`${agentBaseUrl}/control/release-recovery`);
}

export async function proxyStatus() {
  const response = await fetch(`${agentBaseUrl}/control/status`);
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return proxyStatusSchema.parse(body);
}

export async function providerProxyStatus() {
  const response = await fetch(`${providerProxyBaseUrl}/control/status`);
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return providerProxyStatusSchema.parse(body);
}

export async function injectProviderResponseMutation(
  mutation: ProviderResponseMutation,
): Promise<void> {
  await postControl(`${providerProxyBaseUrl}/control/mutate-next`, mutation);
}

export async function invokeAgentOnlyBusinessHandler(
  token: string,
  operationId: string,
): Promise<number> {
  const response = await fetch(
    `${agentBaseUrl}/zoen.agent.v1.AgentActionService/Commit`,
    {
      body: JSON.stringify({ operationId }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  await response.body?.cancel();
  return response.status;
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  description: string,
  attempts = 600,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await probe();
    if (result !== undefined) {
      return result;
    }
    await delay(25);
  }
  throw new Error(`timed out waiting for ${description}`);
}

export async function operationEvidence(
  admin: PostgresClient,
  tenantId: string,
  operationId: string,
): Promise<{
  authorityCommits: number;
  operations: number;
  principalId: string | undefined;
  records: number;
}> {
  const result = await admin.query<{
    authority_commits: string;
    operations: string;
    principal_id: string | null;
    records: string;
  }>(
    `SELECT
       count(DISTINCT operation.operation_id)::text AS operations,
       count(DISTINCT operation.commit_sequence)::text AS authority_commits,
       count(DISTINCT record.claim_id)::text AS records,
       max(operation.committed_principal_id) AS principal_id
     FROM action_operations AS operation
     LEFT JOIN action_operation_records AS record
       ON record.tenant_id = operation.tenant_id
      AND record.operation_id = operation.operation_id
     WHERE operation.tenant_id = $1 AND operation.operation_id = $2`,
    [tenantId, operationId],
  );
  const row = result.rows[0];
  return {
    authorityCommits: Number(row?.authority_commits),
    operations: Number(row?.operations),
    principalId: row?.principal_id ?? undefined,
    records: Number(row?.records),
  };
}

export async function proposalEvidence(
  admin: PostgresClient,
  tenantId: string,
  operationId: string,
): Promise<{
  actionId: string | undefined;
  definitionDigest: string | undefined;
  inputId: string | undefined;
  principalId: string | undefined;
  value: string | undefined;
}> {
  const result = await admin.query<{
    action_id: string;
    definition_digest: string;
    input_id: string;
    principal_id: string;
    value_text: string;
  }>(
    `SELECT
       proposal.action_id,
       proposal.definition_digest,
       proposal.proposed_principal_id AS principal_id,
       input.input_id,
       input.value_text
     FROM action_proposals AS proposal
     JOIN action_proposal_inputs AS input
       ON input.tenant_id = proposal.tenant_id
      AND input.proposal_id = proposal.proposal_id
     WHERE proposal.tenant_id = $1 AND proposal.operation_id = $2`,
    [tenantId, operationId],
  );
  const row = result.rows[0];
  return {
    actionId: row?.action_id,
    definitionDigest: row?.definition_digest,
    inputId: row?.input_id,
    principalId: row?.principal_id,
    value: row?.value_text,
  };
}

export async function proposalCount(
  admin: PostgresClient,
  tenantId: string,
  operationId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM action_proposals
     WHERE tenant_id = $1 AND operation_id = $2`,
    [tenantId, operationId],
  );
  return Number(result.rows[0]?.count);
}

export async function trackedFilesContain(
  value: string,
): Promise<boolean> {
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

export function composeOutput(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    ...arguments_,
  ]);
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

function integerValue(value: string) {
  return create(ExactValueSchema, {
    value: { case: "integerValue", value },
  });
}

function transport(token: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl: zoenBaseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

async function postControl(url: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.ok, true, await response.text());
}

async function startProcess(options: {
  readonly arguments?: readonly string[];
  readonly command: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly name: string;
  readonly port: number;
}): Promise<ManagedProcess> {
  const output: string[] = [];
  const child = spawn(options.command, [...(options.arguments ?? [])], {
    cwd: repositoryRoot,
    env: { ...process.env, ...options.environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  const managedProcess = { child, name: options.name, output };
  await waitForPort(options.port, managedProcess);
  return managedProcess;
}

async function waitForPort(
  port: number,
  process?: ManagedProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (process !== undefined && process.child.exitCode !== null) {
      throw new Error(
        `${process.name} exited during startup:\n${process.output.join("")}`,
      );
    }
    if (await canConnect(port)) {
      return;
    }
    await delay(25);
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
