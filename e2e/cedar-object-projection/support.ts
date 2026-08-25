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
  ActionInputSchema,
  ActionService,
  type ActionInput,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { bindActionPreviewHash } from "../action-preview-bind.js";
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
  type ExactValue,
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
  "cedar-object-projection",
);
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  "cedar-object-projection",
);
export const actionId = "commercial.recordQuote";
export const activationActionId = "zoen.definition.activate";
export const permittedOrderLineId = "commercial.order-line.permitted";
export const neighborOrderLineId = "commercial.order-line.neighbor";
export const permittedQuoteId = "commercial.quote.permitted";
export const neighborQuoteId = "commercial.quote.neighbor";
export const permittedRequestId = "commercial.request.permitted";
export const neighborRequestId = "commercial.request.neighbor";
export const tenantA = "tenant.a";
export const validAt = new Date("2026-08-21T12:00:00.000Z");
const postgresPortFallback = 55_524;
const zoendPortFallback = 58_721;
const keycloakPortFallback = 58_720;
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
export const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  keycloakPortFallback,
  "/realms/zoen",
);
export const oidcAudience = "zoend";
const compilerPath = path.join(
  repositoryRoot,
  "dist",
  "packages",
  "ontology",
  "src",
  "cli.js",
);
const cargoTargetDir =
  process.env.CARGO_TARGET_DIR === undefined ||
  process.env.CARGO_TARGET_DIR === ""
    ? path.join(repositoryRoot, "target")
    : process.env.CARGO_TARGET_DIR;
const serverPath = path.join(cargoTargetDir, "debug", "zoend");
const commercialSource = path.join(
  repositoryRoot,
  "packages",
  "ontology",
  "fixtures",
  "commercial.zoen.ts",
);

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

export type CompiledDefinition = z.infer<typeof compiledDefinitionSchema>;
export type ActionClient = Client<typeof ActionService>;
export type DefinitionClient = Client<typeof DefinitionService>;
export type HistoryClient = Client<typeof HistoryService>;
export type WorldClient = Client<typeof WorldService>;

export interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

export async function compileCommercial(): Promise<CompiledDefinition> {
  const output = await command(process.execPath, [
    compilerPath,
    "compile",
    commercialSource,
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
  definition: CompiledDefinition,
): Promise<string> {
  const [activationSource, actionSource] = await Promise.all([
    readFile(path.join(scenarioDirectory, "activation.cedar"), "utf8"),
    readFile(path.join(scenarioDirectory, "action.cedar"), "utf8"),
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId,
            definitionDigest: definition.digest,
            digest: sha256(actionSource),
            policyId: "policy.recordQuote.r1",
            revision: 1,
            source: actionSource,
          },
          {
            actionId: activationActionId,
            definitionDigest: definition.digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.r1",
            revision: 1,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return sha256(actionSource);
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
  definition: CompiledDefinition,
) {
  const response = await client.publish({
    canonicalJson: new TextEncoder().encode(definition.canonicalJson),
    digest: definition.digest,
    tenantId: tenantA,
  });
  assert.ok(response.definitionRevision);
  return response.definitionRevision;
}

export function entityInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: exactValue({ case: "entityRefValue", value }),
  });
}

function exactValue(value: NonNullable<ExactValue["value"]>): ExactValue {
  return create(ExactValueSchema, { value });
}

export function recordQuoteRequest(
  definition: DefinitionReference,
  suffix: string,
  resourceId: string,
  quoteId: string,
) {
  return {
    actionId,
    definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [entityInput("quoteReference", quoteId)],
    operationId: `operation.recordQuote.${suffix}`,
    proposalId: `proposal.recordQuote.${suffix}`,
    resourceId,
    validAt: timestampFromDate(validAt),
  };
}

export async function recordRequestReference(
  client: WorldClient,
  definition: DefinitionReference,
  claimId: string,
  orderLineId: string,
  requestId: string,
) {
  return client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId,
      definition,
      entityId: orderLineId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(claimId),
        sourceId: "source.cedar-object-projection",
        sourceRef: `urn:zoen:cedar-object-projection:${claimId}`,
      }),
      relationId: "commercial.requestReference",
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: exactValue({ case: "entityRefValue", value: requestId }),
    }),
    tenantId: tenantA,
  });
}

export async function explainOperation(
  client: HistoryClient,
  operationId: string,
) {
  const response = await client.explain({
    target: { target: { case: "operationId", value: operationId } },
  });
  assert.ok(response.explanation);
  return response.explanation;
}

export async function startServer(
  policyManifestPath: string,
): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
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
  throw new Error(
    `zoend did not listen on port ${zoendPort}:\n${output.join("")}`,
  );
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
    "zoen-cedar-object-projection",
    "--file",
    path.join("e2e", "cedar-object-projection", "compose.yaml"),
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
