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
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { ActionService } from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { bindActionPreviewHash } from "../action-preview-bind.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  QuantityValueSchema,
  StrongConsistencySchema,
  TypeQuerySchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
  type ExactValue,
  type SemanticQueryResponse,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { parseDefinitionMetadata } from "../../packages/sdk/src/definition.js";
import {
  compileDeterministicSurface,
} from "../../packages/harness/src/surface/compiler.js";
import {
  type SurfaceDocument,
} from "../../packages/harness/src/surface/model.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";
import { waitForOidc as waitForOidcDiscovery } from "../oidc.js";
import {
  actionId,
  activationActionId,
  erpClaimId,
  erpSourceId,
  quantityRelationId,
  resourceId,
  scenario,
  sheetClaimId,
  sheetSourceId,
  tenantA,
  validAt,
} from "./ids.js";

export {
  actionId,
  activationActionId,
  correctionEntityId,
  quantityRelationId,
  resourceId,
  scenario,
  tenantA,
  validAt,
} from "./ids.js";

export const repositoryRoot = process.cwd();
export const scenarioDirectory = path.join(repositoryRoot, "e2e", scenario);
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
const postgresPortFallback = 55_526;
const zoendPortFallback = 58_723;
const keycloakPortFallback = 58_722;
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
const cargoTargetDir = (() => {
  const raw = process.env.CARGO_TARGET_DIR;
  if (raw === undefined || raw === "") {
    return path.join(repositoryRoot, "target");
  }
  return path.isAbsolute(raw) ? raw : path.join(repositoryRoot, raw);
})();
const serverPath = path.join(cargoTargetDir, "debug", "zoend");
const commercialSource = path.join(
  repositoryRoot,
  "packages",
  "ontology",
  "fixtures",
  "commercial.zoen.ts",
);
const ingestStorePath = path.join(
  repositoryRoot,
  "crates",
  "zoen-adapters",
  "src",
  "semantic_claim_store.rs",
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
export type WorldClient = Client<typeof WorldService>;

export interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

export type SemanticValue =
  | { readonly kind: "decimal"; readonly value: string }
  | { readonly kind: "integer"; readonly value: string }
  | {
      readonly amount: string;
      readonly kind: "quantity";
      readonly unit: string;
    };

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
): Promise<void> {
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
            policyId: "policy.changeCommitment.r1",
            revision: definition.definition.revision,
            source: actionSource,
          },
          {
            actionId: activationActionId,
            definitionDigest: definition.digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.r1",
            revision: definition.definition.revision,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

export async function waitForOidc(timeoutMs = 90_000): Promise<void> {
  await waitForOidcDiscovery(oidcIssuer, timeoutMs);
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
    `zoen-${scenario}`,
    "--file",
    path.join("e2e", scenario, "compose.yaml"),
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

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactValue(value: SemanticValue): ExactValue {
  switch (value.kind) {
    case "decimal":
      return create(ExactValueSchema, {
        value: { case: "decimalValue", value: value.value },
      });
    case "integer":
      return create(ExactValueSchema, {
        value: { case: "integerValue", value: value.value },
      });
    case "quantity":
      return create(ExactValueSchema, {
        value: {
          case: "quantityValue",
          value: create(QuantityValueSchema, {
            amount: value.amount,
            unit: value.unit,
          }),
        },
      });
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

export async function recordEvidence(
  client: WorldClient,
  input: {
    readonly claimId: string;
    readonly definition: DefinitionReference;
    readonly relationId: string;
    readonly sourceId: string;
    readonly value: SemanticValue;
  },
): Promise<bigint> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.definition,
      entityId: resourceId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(`${input.sourceId}:${input.claimId}`),
        sourceId: input.sourceId,
        sourceRef: `urn:zoen:${scenario}:${input.claimId}`,
      }),
      relationId: input.relationId,
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: exactValue(input.value),
    }),
    tenantId: tenantA,
  });
  assert.equal(response.claimId, input.claimId);
  assert.ok(response.commitSequence > 0n);
  return response.commitSequence;
}

export async function ingestQuotedQuantityRivals(
  client: WorldClient,
  definition: DefinitionReference,
): Promise<{ readonly afterErp: bigint; readonly afterSheet: bigint }> {
  const afterSheet = await recordEvidence(client, {
    claimId: sheetClaimId,
    definition,
    relationId: quantityRelationId,
    sourceId: sheetSourceId,
    value: { amount: "10", kind: "quantity", unit: "each" },
  });
  const afterErp = await recordEvidence(client, {
    claimId: erpClaimId,
    definition,
    relationId: quantityRelationId,
    sourceId: erpSourceId,
    value: { amount: "12", kind: "quantity", unit: "each" },
  });
  return { afterErp, afterSheet };
}

export async function ingestChangeCommitmentBasis(
  client: WorldClient,
  definition: DefinitionReference,
): Promise<void> {
  await recordEvidence(client, {
    claimId: "claim.proposed.quantity",
    definition,
    relationId: "commercial.proposedQuantity",
    sourceId: "source.customer-message",
    value: { amount: "4", kind: "quantity", unit: "each" },
  });
  await recordEvidence(client, {
    claimId: "claim.committed.quantity",
    definition,
    relationId: "commercial.committedQuantity",
    sourceId: "source.commercial-control",
    value: { amount: "10", kind: "quantity", unit: "each" },
  });
  await recordEvidence(client, {
    claimId: "claim.committed.unit-price",
    definition,
    relationId: "commercial.committedUnitPrice",
    sourceId: "source.commercial-control",
    value: { kind: "decimal", value: "19.99" },
  });
  await recordEvidence(client, {
    claimId: "claim.committed.revision",
    definition,
    relationId: "commercial.commitmentRevision",
    sourceId: "source.commercial-control",
    value: { kind: "integer", value: "1" },
  });
}

function strongConsistency() {
  return create(QueryConsistencySchema, {
    value: {
      case: "strong",
      value: create(StrongConsistencySchema),
    },
  });
}

export function queryRelation(
  client: WorldClient,
  definition: DefinitionReference,
  relationId: string,
) {
  return client.semanticQuery({
    consistency: strongConsistency(),
    definition,
    entityId: resourceId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: relationId },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
}

export function queryOrderLines(
  client: WorldClient,
  definition: DefinitionReference,
) {
  return client.semanticQuery({
    consistency: strongConsistency(),
    definition,
    entityId: "",
    query: {
      case: "byType",
      value: create(TypeQuerySchema, {
        limit: 10,
        typeId: "commercial.OrderLine",
      }),
    },
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
}

export function quantityLabels(response: SemanticQueryResponse): string[] {
  return response.values
    .map((result) => {
      const value = result.value?.value;
      assert.equal(value?.case, "quantityValue");
      return `${value.value.amount} ${value.value.unit}`;
    })
    .sort();
}

export function entityIds(response: SemanticQueryResponse): string[] {
  return response.values
    .map((result) => {
      const value = result.value?.value;
      assert.equal(value?.case, "entityRefValue");
      return value.value;
    })
    .sort();
}

export function sourceIds(response: SemanticQueryResponse): string[] {
  const ids = new Set<string>();
  for (const result of response.values) {
    for (const dependency of result.dependencies) {
      if (dependency.sourceId !== "") {
        ids.add(dependency.sourceId);
      }
    }
  }
  return [...ids].sort();
}

export async function semanticClaimCount(
  admin: PostgresClient,
  relationId?: string,
): Promise<number> {
  const result =
    relationId === undefined
      ? await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM semantic_claims
           WHERE tenant_id = $1
             AND entity_id = $2`,
          [tenantA, resourceId],
        )
      : await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM semantic_claims
           WHERE tenant_id = $1
             AND entity_id = $2
             AND relation_id = $3`,
          [tenantA, resourceId, relationId],
        );
  return Number(result.rows[0]?.count ?? "0");
}

export async function rejectSqlBeliefWrite(
  admin: PostgresClient,
): Promise<boolean> {
  try {
    await admin.query(
      `UPDATE semantic_claims
       SET value_text = '99'
       WHERE tenant_id = $1
         AND entity_id = $2
         AND relation_id = $3`,
      [tenantA, resourceId, quantityRelationId],
    );
    return false;
  } catch (cause: unknown) {
    return (
      cause instanceof Error &&
      /immutable|cannot|reject|trigger|protect/iu.test(cause.message)
    );
  }
}

export function compileSurface(definition: CompiledDefinition): SurfaceDocument {
  const metadata = parseDefinitionMetadata(
    new TextEncoder().encode(definition.canonicalJson),
  );
  return compileDeterministicSurface({
    definition: {
      definitionId: metadata.definitionId,
      digest: definition.digest,
      revision: metadata.revision.toString(),
    },
    entityId: resourceId,
    metadata,
    presentation: { title: "Dirty quote" },
  });
}

export async function ingestInsertIsAppendOnly(): Promise<boolean> {
  const source = await readFile(ingestStorePath, "utf8");
  return (
    source.includes("INSERT INTO semantic_claims") &&
    !/ON CONFLICT/iu.test(source) &&
    !/UPDATE semantic_claims/iu.test(source) &&
    !/DELETE FROM semantic_claims/iu.test(source)
  );
}

export async function agentSourceHasNoBypassWrite(): Promise<boolean> {
  const source = await readFile(
    path.join(scenarioDirectory, "agent.ts"),
    "utf8",
  );
  return (
    !/from ["']pg["']/u.test(source) &&
    !/PostgresClient/u.test(source) &&
    !/recordEvidence/u.test(source) &&
    !/DATABASE_URL/u.test(source)
  );
}
