import assert from "node:assert/strict";
import {
  execFile,
  type ChildProcessWithoutNullStreams,
  spawn,
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
  ActionInputSchema,
  ActionService,
  PolicyDecision,
  type CommitReceipt,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { bindActionPreviewHash } from "../action-preview-bind.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import { HistoryService } from "../../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  EventualConsistencySchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  QuantityValueSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
  type QueryConsistency,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

export const repositoryRoot = process.cwd();
export const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "evolution-compatible",
);
export const fixtureDirectory = path.join(
  repositoryRoot,
  "packages",
  "ontology",
  "fixtures",
);
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  "evolution-compatible",
);
export const definitionId = "inventory.definition";
export const resourceId = "inventory.item.1";
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
const postgresPortFallback = 55_438;
const zoendPortFallback = 58_089;
const keycloakPortFallback = 58_088;
const minioPortFallback = 59_005;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
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
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  keycloakPortFallback,
  "/realms/zoen",
);
const oidcAudience = "zoend";
const compilerPath = path.join(
  repositoryRoot,
  "dist",
  "packages",
  "ontology",
  "src",
  "cli.js",
);
const serverPath = path.join(repositoryRoot, "target", "debug", "zoend");
const workerPath = path.join(
  repositoryRoot,
  "target",
  "debug",
  "zoen-projection",
);
const validAt = new Date("2026-08-19T00:00:00.000Z");

const compiledDefinitionSchema = z
  .object({
    canonicalJson: z.string(),
    definition: z
      .object({
        definitionId: z.string(),
        revision: z.number().int().positive(),
      })
      .passthrough(),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();
const projectionOutcomeSchema = z
  .object({
    manifestDigest: z.string().regex(/^[0-9a-f]{64}$/),
    manifestObjectKey: z.string().min(1),
    parquetDigest: z.string().regex(/^[0-9a-f]{64}$/),
    parquetObjectKey: z.string().min(1),
    projectedRows: z.number().int().nonnegative(),
    throughCommit: z.number().int().positive(),
    wroteManifest: z.boolean(),
  })
  .strict();

export type CompiledDefinition = z.infer<typeof compiledDefinitionSchema>;
export type DefinitionClient = Client<typeof DefinitionService>;
export type ActionClient = Client<typeof ActionService>;
export type WorldClient = Client<typeof WorldService>;
export type HistoryClient = Client<typeof HistoryService>;

export interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

export async function compileDefinition(
  sourcePath: string,
): Promise<CompiledDefinition> {
  const output = await command(process.execPath, [
    compilerPath,
    "compile",
    sourcePath,
  ]);
  return compiledDefinitionSchema.parse(JSON.parse(output));
}

export function definitionReference(
  definition: CompiledDefinition,
): DefinitionReference {
  return create(DefinitionReferenceSchema, {
    definitionId: definition.definition.definitionId,
    digest: definition.digest,
    revision: BigInt(definition.definition.revision),
  });
}

export async function writePolicyManifest(
  outputPath: string,
  definitions: readonly CompiledDefinition[],
): Promise<void> {
  const activationSource = await readFile(
    path.join(scenarioDirectory, "activation.cedar"),
    "utf8",
  );
  const actionSource = await readFile(
    path.join(scenarioDirectory, "action.cedar"),
    "utf8",
  );
  const policies = definitions.flatMap((definition) => [
    {
      actionId: "inventory.replenish",
      definitionDigest: definition.digest,
      digest: sha256(actionSource),
      policyId: `policy.replenish.v${definition.definition.revision}`,
      revision: definition.definition.revision,
      source: actionSource,
    },
    {
      actionId: "zoen.definition.activate",
      definitionDigest: definition.digest,
      digest: sha256(activationSource),
      policyId: `policy.activation.v${definition.definition.revision}`,
      revision: definition.definition.revision,
      source: activationSource,
    },
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ policies }, null, 2)}\n`,
  );
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

export function definitionClient(token: string): DefinitionClient {
  return createClient(DefinitionService, transport(token));
}

export function actionClient(token: string): ActionClient {
  return bindActionPreviewHash(createClient(ActionService, transport(token)));
}

export function worldClient(token: string): WorldClient {
  return createClient(WorldService, transport(token));
}

export function historyClient(token: string): HistoryClient {
  return createClient(HistoryService, transport(token));
}

function transport(token: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

export async function publish(
  client: DefinitionClient,
  tenantId: string,
  definition: CompiledDefinition,
) {
  const response = await client.publish({
    canonicalJson: new TextEncoder().encode(definition.canonicalJson),
    digest: definition.digest,
    tenantId,
  });
  assert.ok(response.definitionRevision);
  return response.definitionRevision;
}

export async function commitReplenish(
  client: ActionClient,
  definition: DefinitionReference,
  suffix: string,
  amount: string,
): Promise<CommitReceipt> {
  const request = replenishProposal(definition, suffix, amount);
  const proposed = await client.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.ok(proposed.proposal);
  const committed = await client.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.ok(committed.receipt);
  return committed.receipt;
}

export function replenishProposal(
  definition: DefinitionReference,
  suffix: string,
  amount: string,
) {
  return {
    actionId: "inventory.replenish",
    definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      create(ActionInputSchema, {
        inputId: "quantity",
        value: quantity(amount),
      }),
    ],
    operationId: `operation.${suffix}`,
    proposalId: `proposal.${suffix}`,
    resourceId,
    validAt: timestampFromDate(validAt),
  };
}

export async function recordQuantity(
  client: WorldClient,
  definition: DefinitionReference,
  relationId: string,
  amount: string,
  claimId: string,
): Promise<bigint> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId,
      definition,
      entityId: resourceId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(claimId),
        sourceId: "source.evolutionCompatible",
        sourceRef: `urn:zoen:evolution:${claimId}`,
      }),
      relationId,
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: quantity(amount),
    }),
    tenantId: tenantA,
  });
  assert.equal(response.claimId, claimId);
  return response.commitSequence;
}

export async function queryQuantity(
  client: WorldClient,
  definition: DefinitionReference,
  selection:
    | { kind: "relation"; id: string }
    | { kind: "computation"; id: string },
): Promise<{
  amount: string;
  definition: DefinitionReference | undefined;
}> {
  return executeQuantityQuery(
    client,
    definition,
    selection,
    create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
  );
}

export async function queryProjectedQuantity(
  client: WorldClient,
  definition: DefinitionReference,
  selection:
    | { kind: "relation"; id: string }
    | { kind: "computation"; id: string },
): Promise<{
  amount: string;
  definition: DefinitionReference | undefined;
}> {
  return executeQuantityQuery(
    client,
    definition,
    selection,
    create(QueryConsistencySchema, {
      value: {
        case: "eventual",
        value: create(EventualConsistencySchema),
      },
    }),
  );
}

async function executeQuantityQuery(
  client: WorldClient,
  definition: DefinitionReference,
  selection:
    | { kind: "relation"; id: string }
    | { kind: "computation"; id: string },
  consistency: QueryConsistency,
): Promise<{
  amount: string;
  definition: DefinitionReference | undefined;
}> {
  const response = await client.semanticQuery({
    consistency,
    definition,
    entityId: resourceId,
    selection: create(QuerySelectionSchema, {
      value:
        selection.kind === "relation"
          ? { case: "relationId", value: selection.id }
          : { case: "computationId", value: selection.id },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
  assert.equal(response.values.length, 1);
  const value = response.values[0]?.value?.value;
  assert.equal(value?.case, "quantityValue");
  assert.ok(value?.value);
  return {
    amount: value.value.amount,
    definition: response.definition,
  };
}

function quantity(amount: string) {
  return create(ExactValueSchema, {
    value: {
      case: "quantityValue",
      value: create(QuantityValueSchema, { amount, unit: "kg" }),
    },
  });
}

export async function startServer(
  policyManifestPath: string,
): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, [], {
    cwd: repositoryRoot,
    env: {
      ...projectionEnvironment(),
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForPort(child, output);
  return { child, output };
}

export async function stopServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGINT");
  await once(server.child, "exit");
  assert.equal(
    server.child.exitCode,
    0,
    `zoend failed during shutdown:\n${server.output.join("")}`,
  );
}

async function waitForPort(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during startup:\n${output.join("")}`);
    }
    if (await canConnect()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`zoend did not listen on port ${zoendPort}:\n${output.join("")}`);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: zoendPort });
    let settled = false;
    const finish = (connected: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

export function adminClient(): PostgresClient {
  return new PostgresClient({ connectionString: adminDatabaseUrl });
}

export function composeOutput(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    "zoen-evolution-compatible",
    "--file",
    path.join("e2e", "evolution-compatible", "compose.yaml"),
    ...arguments_,
  ]);
}

export function command(
  executable: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
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

export async function rebuildProjection(tenantId: string) {
  const output = await command(
    workerPath,
    ["--rebuild", tenantId],
    projectionEnvironment(),
  );
  const parsed: unknown = JSON.parse(output);
  return projectionOutcomeSchema.parse(parsed);
}

function projectionEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: applicationDatabaseUrl,
    S3_ACCESS_KEY_ID: "zoen-access",
    S3_ALLOW_HTTP: "true",
    S3_BUCKET: "zoen-projections",
    S3_ENDPOINT: e2eHttpUrl("ZOEN_E2E_MINIO_PORT", minioPortFallback),
    S3_REGION: "us-east-1",
    S3_SECRET_ACCESS_KEY: "zoen-secret",
  };
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
