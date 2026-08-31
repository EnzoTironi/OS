import assert from "node:assert/strict";
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  ActionInputSchema,
  type ActionInput,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QuantityValueSchema,
  ValidTimeSchema,
} from "../gen/connect/zoen/world/v1/world_pb.js";
import {
  loadCanonicalDefinition,
  loadCommercialLake,
  type CompiledDefinition,
} from "./canonical-definition.js";
import {
  dispatchOnce,
  effectClient,
  registerWorker,
  startConnector,
  startWorker,
  stopProcess,
  tenantA,
  tenantB,
  type ManagedProcess,
} from "./effect-support.js";
import {
  actionClient,
  definitionClient,
  publish,
  repositoryRoot,
  startServer,
  stopServer,
  worldClient,
  type DefinitionClient,
  type WorldClient,
} from "./evolution-compatible/support.js";
import {
  compileArchivedTsconfig,
  e2eHttpUrl,
  e2ePort,
} from "./host-env.js";

export {
  actionClient,
  definitionClient,
  dispatchOnce,
  effectClient,
  registerWorker,
  repositoryRoot,
  startConnector,
  startServer,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
};
export type { ManagedProcess };

export type SemanticValue =
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "decimal"; readonly value: string }
  | { readonly kind: "entity-ref"; readonly value: string }
  | { readonly kind: "integer"; readonly value: string }
  | {
      readonly amount: string;
      readonly kind: "quantity";
      readonly unit: string;
    }
  | { readonly kind: "text"; readonly value: string };

export interface PolicySource {
  readonly digest: string;
  readonly source: string;
}

export interface DomainFixture {
  readonly canonicalJson: string;
  readonly compiled: CompiledDefinition;
  readonly definition: ReturnType<typeof definitionReference>;
  readonly digest: string;
  readonly metadata: CompiledDefinition["definition"];
  readonly packageName: string;
}

export type FiscalFixture = Omit<DomainFixture, "packageName"> & {
  readonly packageName: "fiscal-brazil";
};

const generatedDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join(repositoryRoot, "e2e", "fiscal-systax-live", ".generated");
const packageDirectory = generatedDirectory.replace(/\/\.generated\/?$/, "");
const fiscalPackageSourcePath = path.join(
  repositoryRoot,
  "testdata",
  "lakes",
  "fiscal-brazil.canonical.json",
);
const distDirectory = path.join(repositoryRoot, "dist");
const zoenUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_271);
const oidcTokenUrl = `${e2eHttpUrl("ZOEN_E2E_KEYCLOAK_PORT", 58_270)}/realms/zoen/protocol/openid-connect/token`;

export async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(oidcTokenUrl, {
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
  if (
    typeof body !== "object" ||
    body === null ||
    !("access_token" in body) ||
    typeof body.access_token !== "string"
  ) {
    throw new Error(`fiscal oidc token ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

function definitionReference(compiled: CompiledDefinition) {
  return create(DefinitionReferenceSchema, {
    definitionId: compiled.definition.definitionId,
    digest: compiled.digest,
    revision: BigInt(compiled.definition.revision),
  });
}

async function namedPackage(
  compiled: CompiledDefinition,
  packageName: string,
): Promise<DomainFixture> {
  return {
    canonicalJson: compiled.canonicalJson,
    compiled,
    definition: definitionReference(compiled),
    digest: compiled.digest,
    metadata: compiled.definition,
    packageName,
  };
}

export async function loadFiscalPackage(): Promise<FiscalFixture> {
  const fixture = await namedPackage(
    await loadCanonicalDefinition(fiscalPackageSourcePath),
    "fiscal-brazil",
  );
  return { ...fixture, packageName: "fiscal-brazil" };
}

export async function loadCommercialPackage(): Promise<DomainFixture> {
  return namedPackage(await loadCommercialLake(repositoryRoot), "commercial");
}

export async function recordFiscalEvidence(
  client: WorldClient,
  fixture: FiscalFixture,
  input: {
    readonly at: Date;
    readonly claimId: string;
    readonly entityId: string;
    readonly relationId: string;
    readonly sourceId: string;
    readonly tenantId: string;
    readonly value: SemanticValue;
  },
): Promise<bigint> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: fixture.definition,
      entityId: input.entityId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(
          `${input.sourceId}:${input.claimId}:${JSON.stringify(input.value)}`,
        ),
        sourceId: input.sourceId,
        sourceRef: `urn:zoen:fiscal:${input.claimId}`,
      }),
      relationId: input.relationId,
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(input.at),
        },
      }),
      value: semanticExactValue(input.value),
    }),
    tenantId: input.tenantId,
  });
  assert.equal(response.claimId, input.claimId);
  assert.ok(response.commitSequence > 0n);
  return response.commitSequence;
}

export async function publishDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DomainFixture,
): Promise<void> {
  const published = await publish(client, tenantId, fixture.compiled);
  assert.equal(published.digest, fixture.digest);
  assert.equal(published.definitionId, fixture.metadata.definitionId);
}

export async function activateDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DomainFixture,
): Promise<void> {
  const response = await client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
    definitionId: fixture.metadata.definitionId,
    digest: fixture.digest,
    tenantId,
  });
  assert.equal(response.activation?.active?.digest, fixture.digest);
  assert.equal(
    response.activation?.active?.revision,
    BigInt(fixture.metadata.revision),
  );
}

export function proposalRequest(input: {
  readonly actionId: string;
  readonly fixture: DomainFixture;
  readonly inputs: readonly {
    readonly id: string;
    readonly value: SemanticValue;
  }[];
  readonly resourceId: string;
  readonly suffix: string;
  readonly validAt: Date;
}) {
  return {
    actionId: input.actionId,
    definition: input.fixture.definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: input.inputs.map((entry) => actionInput(entry.id, entry.value)),
    operationId: `operation.${input.fixture.packageName}.${input.suffix}`,
    proposalId: `proposal.${input.fixture.packageName}.${input.suffix}`,
    resourceId: input.resourceId,
    validAt: timestampFromDate(input.validAt),
  };
}

function actionInput(id: string, value: SemanticValue): ActionInput {
  return create(ActionInputSchema, {
    inputId: id,
    value: semanticExactValue(value),
  });
}

async function loadPolicy(name: string): Promise<PolicySource> {
  const source = await readFile(path.join(packageDirectory, name), "utf8");
  return { digest: sha256(source), source };
}

export async function writeFiscalPolicyManifest(
  outputPath: string,
  commercial: DomainFixture,
  fiscal: FiscalFixture,
  contextFixtures: readonly DomainFixture[] = [],
): Promise<void> {
  const [
    activation,
    cancellation,
    correction,
    domain,
    submission,
    taxDetermination,
  ] = await Promise.all([
    loadPolicy("activation.cedar"),
    loadPolicy("cancel.cedar"),
    loadPolicy("correct.cedar"),
    loadPolicy("domain.cedar"),
    loadPolicy("submit.cedar"),
    loadPolicy("tax.cedar"),
  ]);
  const actionPolicies = new Map<string, PolicySource>([
    ["fiscal.cancelDocument", cancellation],
    ["fiscal.correctDocument", correction],
    ["fiscal.requestTaxDetermination", taxDetermination],
    ["fiscal.submitDocument", submission],
  ]);
  const fixtures = [...contextFixtures, commercial, fiscal];
  const policies = fixtures.flatMap((fixture) => [
    policyEntry(fixture, "zoen.definition.activate", activation),
    ...fixture.metadata.actions.map((action) => {
      const policy =
        fixture.metadata.definitionId === "fiscal.brazil"
          ? (actionPolicies.get(action.id) ?? domain)
          : domain;
      return policyEntry(fixture, action.id, policy);
    }),
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export async function startFiscalAdapter(input: {
  readonly callerBindings: Readonly<Record<string, string>>;
  readonly listenProvider?: "plugnotas" | "protheus" | "systax";
  readonly provider?: "plugnotas" | "protheus" | "systax";
  readonly providerBaseUrl?: string;
  readonly providerCredential?: string;
  readonly providerTimeoutMs?: number;
}): Promise<ManagedProcess> {
  const listenProvider = input.listenProvider ?? input.provider ?? "systax";
  const port = fiscalAdapterPort(listenProvider);
  if (input.provider === undefined || input.providerCredential === undefined) {
    throw new Error("a fiscal adapter route requires a provider");
  }
  const route = {
    baseUrl: input.providerBaseUrl,
    credential: input.providerCredential,
    provider: input.provider,
    timeoutMs: input.providerTimeoutMs ?? 10_000,
  };
  const routes =
    input.provider === "systax"
      ? { documents: {}, tax: route }
      : { documents: { "*": route } };
  compileArchivedTsconfig(
    repositoryRoot,
    "archive/domain/fiscal-brazil/tsconfig.json",
  );
  return startManagedProcess({
    arguments: [
      path.join(
        distDirectory,
        "archive",
        "domain",
        "fiscal-brazil",
        "src",
        "adapter",
        "main.js",
      ),
    ],
    command: process.execPath,
    environment: {
      ZOEN_FISCAL_ADAPTER_CALLER_BINDINGS: JSON.stringify(input.callerBindings),
      ZOEN_FISCAL_ADAPTER_LISTEN_ADDR: `127.0.0.1:${port}`,
      ZOEN_FISCAL_ADAPTER_OIDC_CLIENTS: JSON.stringify({
        [tenantA]: {
          clientId: "fiscal-adapter-a",
          clientSecret: "fiscal-adapter-a-secret",
        },
        [tenantB]: {
          clientId: "fiscal-adapter-b",
          clientSecret: "fiscal-adapter-b-secret",
        },
      }),
      ZOEN_FISCAL_ADAPTER_OIDC_TOKEN_URL: oidcTokenUrl,
      ZOEN_FISCAL_ADAPTER_ROUTES: JSON.stringify(routes),
      ZOEN_FISCAL_ADAPTER_ZOEN_URL: zoenUrl,
    },
    name: "fiscal adapter",
    port,
  });
}

export function adapterProviderUrl(
  provider: "plugnotas" | "protheus" | "systax" = "systax",
): string {
  return `http://127.0.0.1:${fiscalAdapterPort(provider)}/v1/operations`;
}

function policyEntry(
  fixture: DomainFixture,
  actionId: string,
  policy: PolicySource,
) {
  return {
    actionId,
    definitionDigest: fixture.digest,
    digest: policy.digest,
    policyId: `policy.${actionId}.r${fixture.metadata.revision}`,
    revision: fixture.metadata.revision,
    source: policy.source,
  };
}

function semanticExactValue(value: SemanticValue) {
  switch (value.kind) {
    case "bool":
      return create(ExactValueSchema, {
        value: { case: "boolValue", value: value.value },
      });
    case "decimal":
      return create(ExactValueSchema, {
        value: { case: "decimalValue", value: value.value },
      });
    case "entity-ref":
      return create(ExactValueSchema, {
        value: { case: "entityRefValue", value: value.value },
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
    case "text":
      return create(ExactValueSchema, {
        value: { case: "textValue", value: value.value },
      });
    default: {
      const exhaustive: never = value;
      throw new Error(`unsupported semantic value: ${String(exhaustive)}`);
    }
  }
}

function fiscalAdapterPort(
  provider: "plugnotas" | "protheus" | "systax",
): number {
  switch (provider) {
    case "plugnotas":
      return e2ePort("ZOEN_E2E_PLUGNOTAS_ADAPTER_PORT", 58_282);
    case "protheus":
      return e2ePort("ZOEN_E2E_PROTHEUS_ADAPTER_PORT", 58_283);
    case "systax":
      return e2ePort("ZOEN_E2E_SYSTAX_ADAPTER_PORT", 58_281);
    default: {
      const exhaustive: never = provider;
      throw new Error(`unsupported provider: ${String(exhaustive)}`);
    }
  }
}

function startManagedProcess(options: {
  readonly arguments: readonly string[];
  readonly command: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly name: string;
  readonly port: number;
}): Promise<ManagedProcess> {
  const child = spawn(options.command, [...options.arguments], {
    cwd: repositoryRoot,
    env: { ...process.env, ...options.environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  const output: string[] = [];
  const stderr: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  const managed = {
    child,
    name: options.name,
    output,
    stderr,
  };
  return waitForPort(options.port, managed).then(() => managed);
}

async function waitForPort(
  port: number,
  process: {
    readonly child: ChildProcessWithoutNullStreams;
    readonly name: string;
    readonly output: string[];
    readonly stderr: string[];
  },
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (process.child.exitCode !== null) {
      throw new Error(
        `${process.name} exited during startup:\n${process.output.join("")}${process.stderr.join("")}`,
      );
    }
    if (await canConnect(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${process.name} did not start`);
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(200, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
