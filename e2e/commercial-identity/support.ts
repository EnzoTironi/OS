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
import {
  ActionInputSchema,
  ActionService,
  type ActionInput,
} from "../../gen/connect/zoen/action/v1/action_pb.js";
import { bindActionPreviewHash } from "../action-preview-bind.js";
import { DefinitionService } from "../../gen/connect/zoen/definition/v1/definition_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
  type ExactValue,
} from "../../gen/connect/zoen/world/v1/world_pb.js";
import {
  e2eAuthDatabaseUrl,
  sessionDoorProcessEnv,
} from "../ba-door.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eIdentityAdminToken,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

export const repositoryRoot = process.cwd();
export const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "commercial-identity",
);
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  "commercial-identity",
);
export const actionId = "commercial.recordQuote";
export const activationActionId = "zoen.definition.activate";
export const quoteEntityId = "commercial.quote.q-1001";
export const resourceId = "commercial.order-line.ol-1001";
export const tenantA = "tenant.a";
export const validAt = new Date("2026-08-24T12:00:00.000Z");
const postgresPortFallback = 55_518;
const zoendPortFallback = 58_691;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
export const authDatabaseUrl = e2eAuthDatabaseUrl(postgresPortFallback);
export const zoendBaseUrl = baseUrl;
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

export type CompiledDefinition = z.infer<typeof compiledDefinitionSchema>;
export type ActionClient = Client<typeof ActionService>;
export type DefinitionClient = Client<typeof DefinitionService>;
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
            policyId: "policy.recordQuote.r2",
            revision: definition.definition.revision,
            source: actionSource,
          },
          {
            actionId: activationActionId,
            definitionDigest: definition.digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.r2",
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

export function definitionClient(
  token: string,
  tenantId: string,
): DefinitionClient {
  return createClient(DefinitionService, transport(token, tenantId));
}

export function actionClient(
  token: string,
  tenantId: string,
): ActionClient {
  return bindActionPreviewHash(
    createClient(ActionService, transport(token, tenantId)),
  );
}

export function worldClient(
  token: string,
  tenantId: string,
): WorldClient {
  return createClient(WorldService, transport(token, tenantId));
}

function transport(token: string, tenantId: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    request.header.set("x-zoen-tenant", tenantId);
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

export function textInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: exactValue({ case: "textValue", value }),
  });
}

function exactValue(value: NonNullable<ExactValue["value"]>): ExactValue {
  return create(ExactValueSchema, { value });
}

export function recordQuoteRequest(
  definition: DefinitionReference,
  suffix: string,
  quote: string,
) {
  return {
    actionId,
    definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [entityInput("quoteReference", quote)],
    operationId: `operation.recordQuote.${suffix}`,
    proposalId: `proposal.recordQuote.${suffix}`,
    resourceId,
    validAt: timestampFromDate(validAt),
  };
}

export async function startServer(
  policyManifestPath: string,
): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, [], {
    cwd: repositoryRoot,
    env: sessionDoorProcessEnv({
      applicationDatabaseUrl,
      authDatabaseUrl,
      extra: {
        ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
        ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
        ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
      },
    }),
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

export function queryQuoteReference(
  client: WorldClient,
  definition: DefinitionReference,
) {
  return client.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
    definition,
    entityId: resourceId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: "commercial.quoteReference" },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
}

export function recordQuoteText(
  client: WorldClient,
  definition: DefinitionReference,
  claimId: string,
) {
  return client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId,
      definition,
      entityId: resourceId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(claimId),
        sourceId: "source.commercial-identity",
        sourceRef: `urn:zoen:commercial-identity:${claimId}`,
      }),
      relationId: "commercial.quoteReference",
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: exactValue({ case: "textValue", value: "quote.q-1001" }),
    }),
    tenantId: tenantA,
  });
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
