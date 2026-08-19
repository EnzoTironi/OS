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
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import canonicalize from "canonicalize";
import { type Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  ActionInputSchema,
  ActionService,
  type ActionInput,
  type Proposal,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";

export const repositoryRoot = process.cwd();
export const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "governed-action",
);
export const generatedDirectory = path.join(
  scenarioDirectory,
  ".generated",
);
const serverPath = path.join(repositoryRoot, "target", "debug", "zoend");
const failpointServerPath = path.join(
  repositoryRoot,
  "target",
  "failpoints",
  "debug",
  "zoend",
);
const composeFile = path.join("e2e", "governed-action", "compose.yaml");
const composeProject = "zoen-governed-action";
export const applicationDatabaseUrl =
  "postgres://zoen_app:zoen_app@127.0.0.1:55434/zoen";
export const adminDatabaseUrl =
  "postgres://postgres:postgres@127.0.0.1:55434/zoen";
const baseUrl = "http://127.0.0.1:58083";
export const oidcIssuer = "http://127.0.0.1:58082/realms/zoen";
export const oidcAudience = "zoend";
export const actionId = "inventory.requestStock";
export const activationActionId = "zoen.definition.activate";
export const definitionId = "inventory.governed";
export const resourceId = "inventory.item.1";
export const unrelatedResourceId = "inventory.item.unrelated";
const availableRelation = "inventory.available";
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
const validAt = new Date("2026-08-19T00:00:00.000Z");

export type ActionClient = Client<typeof ActionService>;
export type DefinitionClient = Client<typeof DefinitionService>;
export type WorldClient = Client<typeof WorldService>;

export interface DefinitionFixture {
  canonicalJson: string;
  definition: DefinitionReference;
  digest: string;
  policyDigest: string;
  policyId: string;
  policyRevision: number;
  policySource: string;
}

export interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

export interface ActionCommitFailpoint {
  name: string;
  pauseMs?: number;
}

export type ServerOptions =
  | {
      kind: "default";
      injectedEnvironment?: ActionCommitFailpoint;
    }
  | {
      kind: "failpoints";
      failpoint: ActionCommitFailpoint;
    };

export interface DatabaseSnapshot {
  actionApprovals: number;
  actionOperations: number;
  actionProposals: number;
  authorityCommits: number;
  projectionOutbox: number;
  semanticClaims: number;
}

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
  })
  .passthrough();
const definitionDocumentSchema = z
  .object({
    actions: z.array(z.unknown()),
    definitionId: z.string(),
  })
  .passthrough();

export async function loadFixture(
  name: string,
  revision: number,
): Promise<DefinitionFixture> {
  const sourceName = name === "self" ? "direct" : name;
  const source = (
    await readFile(
      path.join(
        scenarioDirectory,
        `definition-${sourceName}.canonical.json`,
      ),
      "utf8",
    )
  ).trimEnd();
  const canonicalJson = fixtureDefinition(name, revision, source);
  const policySource = await readFile(
    path.join(scenarioDirectory, `${sourceName}.cedar`),
    "utf8",
  );
  const digest = sha256(canonicalJson);
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: fixtureDefinitionId(name),
      digest,
      revision: BigInt(revision),
    }),
    digest,
    policyDigest: sha256(policySource),
    policyId: `policy.${name}`,
    policyRevision: revision,
    policySource,
  };
}

function fixtureDefinition(
  name: string,
  revision: number,
  source: string,
): string {
  const transformed =
    name === "direct"
      ? withRestrictedDiscoveryAction(source)
      : name === "self"
        ? source
            .replace(
              '"relationId":"inventory.requested","value":{"inputId":"quantity"',
              '"relationId":"inventory.available","value":{"inputId":"quantity"',
            )
            .replace('"revision":1', `"revision":${revision}`)
        : source;
  const document = definitionDocumentSchema.parse(JSON.parse(transformed));
  document.definitionId = fixtureDefinitionId(name);
  const canonical = canonicalize(document);
  assert.ok(canonical);
  return canonical;
}

function fixtureDefinitionId(name: string): string {
  return name === "direct" ? definitionId : `${definitionId}.${name}`;
}

function withRestrictedDiscoveryAction(source: string): string {
  const document = definitionDocumentSchema.parse(JSON.parse(source));
  document.actions.push({
    effects: [
      {
        relationId: "inventory.requested",
        value: {
          kind: "literal",
          value: {
            kind: "integer",
            value: "0",
          },
        },
      },
    ],
    id: "inventory.restrictedAction",
    inputs: [],
    precondition: {
      kind: "literal",
      value: {
        kind: "bool",
        value: true,
      },
    },
  });
  const canonical = canonicalize(document);
  assert.ok(canonical);
  return canonical;
}

export async function writePolicyManifest(
  outputPath: string,
  fixtures: readonly DefinitionFixture[],
): Promise<void> {
  const activationSource = await readFile(
    path.join(scenarioDirectory, "activation.cedar"),
    "utf8",
  );
  const activationDigest = sha256(activationSource);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: fixtures.flatMap((fixture) => [
          {
            actionId,
            definitionDigest: fixture.digest,
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: fixture.policyRevision,
            source: fixture.policySource,
          },
          {
            actionId: activationActionId,
            definitionDigest: fixture.digest,
            digest: activationDigest,
            policyId: `policy.activation.${fixture.definition.definitionId}`,
            revision: fixture.policyRevision,
            source: activationSource,
          },
        ]),
      },
      null,
      2,
    )}\n`,
  );
}

export async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
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

export function worldClient(token: string): WorldClient {
  return createClient(WorldService, transport(token));
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

export async function publishDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DefinitionFixture,
): Promise<void> {
  const response = await client.publish({
    canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
    digest: fixture.digest,
    tenantId,
  });
  assert.equal(response.definitionRevision?.digest, fixture.digest);
  assert.equal(
    response.definitionRevision?.revision,
    fixture.definition.revision,
  );
}

export async function activateDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DefinitionFixture,
): Promise<void> {
  const response = await client.activateRevision({
    definitionId: fixture.definition.definitionId,
    digest: fixture.digest,
    tenantId,
  });
  assert.equal(response.activation?.active?.digest, fixture.digest);
  assert.equal(
    response.activation?.active?.revision,
    fixture.definition.revision,
  );
}

interface EvidenceInput {
  claimId: string;
  fixture: DefinitionFixture;
  resource: string;
  tenantId: string;
  value: string;
}

export async function recordAvailable(
  client: WorldClient,
  input: EvidenceInput,
): Promise<void> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.fixture.definition,
      entityId: input.resource,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(input.claimId),
        sourceId: "source.governedActionE2e",
        sourceRef: `urn:zoen:e2e:${input.claimId}`,
      }),
      relationId: availableRelation,
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: integerValue(input.value),
    }),
    tenantId: input.tenantId,
  });
  assert.equal(response.claimId, input.claimId);
}

interface ProposeInput {
  expiresAt: Date;
  extraInputs?: readonly ActionInput[];
  fixture: DefinitionFixture;
  operationId: string;
  proposalId: string;
  quantity: string;
}

export function propose(client: ActionClient, input: ProposeInput) {
  return client.propose({
    actionId,
    definition: input.fixture.definition,
    expiresAt: timestampFromDate(input.expiresAt),
    inputs: [integerInput("quantity", input.quantity), ...(input.extraInputs ?? [])],
    operationId: input.operationId,
    proposalId: input.proposalId,
    resourceId,
    validAt: timestampFromDate(validAt),
  });
}

function integerInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: integerValue(value),
  });
}

export function textInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: {
        case: "textValue",
        value,
      },
    }),
  });
}

function integerValue(value: string) {
  return create(ExactValueSchema, {
    value: {
      case: "integerValue",
      value,
    },
  });
}

export function assertPolicy(
  policy: Proposal["policy"] | undefined,
  fixture: DefinitionFixture,
  requireDeterminingPolicy = true,
): void {
  assert.ok(policy);
  assert.equal(policy.revision?.policyId, fixture.policyId);
  assert.equal(policy.revision?.revision, BigInt(fixture.policyRevision));
  assert.equal(policy.revision?.digest, fixture.policyDigest);
  if (requireDeterminingPolicy) {
    assert.ok(policy.determiningPolicyIds.length > 0);
  }
}

export async function databaseSnapshot(
  client: PostgresClient,
  tenantId: string,
): Promise<DatabaseSnapshot> {
  return {
    actionApprovals: await rowCount(client, "action_approvals", tenantId),
    actionOperations: await rowCount(client, "action_operations", tenantId),
    actionProposals: await rowCount(client, "action_proposals", tenantId),
    authorityCommits: await rowCount(client, "authority_commits", tenantId),
    projectionOutbox: await rowCount(client, "projection_outbox", tenantId),
    semanticClaims: await rowCount(client, "semantic_claims", tenantId),
  };
}

export async function rowCount(
  client: PostgresClient,
  table: string,
  tenantId: string,
): Promise<number> {
  const allowed = new Set([
    "action_approvals",
    "action_operations",
    "action_proposals",
    "authority_commits",
    "projection_outbox",
    "semantic_claims",
  ]);
  assert.ok(allowed.has(table));
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

export async function startServer(
  policyManifestPath: string,
  options: ServerOptions = { kind: "default" },
): Promise<ServerProcess> {
  const failpoint =
    options.kind === "failpoints"
      ? options.failpoint
      : options.injectedEnvironment;
  const executable =
    options.kind === "failpoints" ? failpointServerPath : serverPath;
  const output: string[] = [];
  const child = spawn(executable, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_LISTEN_ADDR: "127.0.0.1:58083",
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
      ...(failpoint === undefined
        ? {}
        : {
            ZOEN_ACTION_COMMIT_FAILPOINT: failpoint.name,
            ...(failpoint.pauseMs === undefined
              ? {}
              : {
                  ZOEN_ACTION_COMMIT_FAILPOINT_PAUSE_MS:
                    failpoint.pauseMs.toString(),
                }),
          }),
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
    await delay(100);
  }
  throw new Error(`zoend did not listen on port 58083:\n${output.join("")}`);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 58083 });
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

export async function expectConnectCode(
  action: () => Promise<unknown>,
  expected: Code,
): Promise<Code> {
  try {
    await action();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
    return error.code;
  }
}

export function corruptToken(token: string): string {
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const signature = parts[2];
  assert.ok(signature);
  const replacement = signature[0] === "A" ? "B" : "A";
  return `${parts[0]}.${parts[1]}.${replacement}${signature.slice(1)}`;
}

export function minutesFromNow(minutes: number): Date {
  return millisecondsFromNow(minutes * 60_000);
}

export function millisecondsFromNow(milliseconds: number): Date {
  return new Date(Date.now() + milliseconds);
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

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
