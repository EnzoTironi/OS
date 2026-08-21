import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { z } from "zod";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QuantityValueSchema,
  ValidTimeSchema,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { parseDefinitionMetadata } from "../../packages/sdk/src/definition.js";
import {
  compilePackage as compileDomainPackage,
  type DomainFixture,
  type ManagedProcess,
  type PolicySource,
  type SemanticValue,
  type WorldClient,
  repositoryRoot,
  runLeakageGate,
  startConnector,
  tenantA,
  tenantB,
} from "../domain-manufacturing-accounting/support.js";
import { compileDefinition } from "../evolution-compatible/support.js";
import {
  e2eHttpUrl,
  e2ePort,
} from "../host-env.js";

export {
  actionClient,
  activateDefinition,
  adminClient,
  definitionClient,
  dispatchOnce,
  effectClient,
  expectConnectCode,
  explainOperation,
  historyClient,
  oidcToken,
  proposalRequest,
  publishDefinition,
  recordEvidence,
  registerWorker,
  repositoryRoot,
  runLeakageGate,
  semanticQuery,
  startConnector,
  startServer,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
} from "../domain-manufacturing-accounting/support.js";
export type {
  ActionClient,
  EvidenceTime,
  ManagedProcess,
  SemanticValue,
  WorldClient,
} from "../domain-manufacturing-accounting/support.js";

const proxyMetricsSchema = z.object({
  dispatchCounts: z.record(z.string(), z.number().int().nonnegative()),
  operations: z.array(
    z.object({
      idempotencyKey: z.string().min(1),
      provider: z.enum(["plugnotas", "protheus", "systax"]),
      providerOperationId: z.string().min(1),
    }),
  ),
  statusCounts: z.record(z.string(), z.number().int().nonnegative()),
});

const packageSourcePath = path.join(
  repositoryRoot,
  "packages",
  "fiscal-brazil",
  "src",
  "fiscal-brazil.zoen.ts",
);
const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "fiscal-fault-matrix",
);
const distDirectory = path.join(repositoryRoot, "dist");
const proxyPort = e2ePort("ZOEN_E2E_PROXY_PORT", 58_280);
const zoenUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_271);
const oidcTokenUrl = `${e2eHttpUrl("ZOEN_E2E_KEYCLOAK_PORT", 58_270)}/realms/zoen/protocol/openid-connect/token`;

export type FiscalFixture = Omit<DomainFixture, "packageName"> & {
  readonly packageName: "fiscal-brazil";
};

export type ProxyMode =
  | "cancellation_failure"
  | "credential_failure"
  | "correction_failure"
  | "plug_accepted_pending"
  | "plug_authorized"
  | "plug_http_200_pending"
  | "plug_rejected"
  | "protheus_authorized"
  | "protheus_manual_conflict"
  | "protheus_pending"
  | "schema_drift"
  | "systax_error"
  | "systax_outage"
  | "systax_success"
  | "systax_validation"
  | "timeout_after_receipt";

export async function compileFiscalPackage(): Promise<FiscalFixture> {
  const compiled = await compileDefinition(packageSourcePath);
  const canonicalBytes = new TextEncoder().encode(compiled.canonicalJson);
  return {
    canonicalJson: compiled.canonicalJson,
    compiled,
    definition: create(DefinitionReferenceSchema, {
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      revision: BigInt(compiled.definition.revision),
    }),
    digest: compiled.digest,
    metadata: parseDefinitionMetadata(canonicalBytes),
    packageName: "fiscal-brazil",
  };
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

export function compileCommercialPackage(): Promise<DomainFixture> {
  return compileDomainPackage("commercial");
}

export function fiscalPackageSource(): Promise<string> {
  return readFile(packageSourcePath, "utf8");
}

export function assertProviderNeutralSource(source: string): void {
  const requiredTypes = [
    "fiscal.TaxDetermination",
    "fiscal.FiscalIntent",
    "fiscal.FiscalDocument",
    "fiscal.FiscalEvent",
    "fiscal.FiscalArtifact",
  ];
  if (!requiredTypes.every((typeId) => source.includes(typeId))) {
    throw new Error("fiscal definition does not keep fiscal concepts distinct");
  }
  if (
    /(?:plugnotas|protheus|systax)\.[A-Za-z0-9._-]+|commercial\.Invoice|idIntegracao|idCalculo|cOperationId/u.test(
      source,
    )
  ) {
    throw new Error("provider or commercial schema leaked into fiscal ontology");
  }
}

export async function loadPolicy(name: string): Promise<PolicySource> {
  const source = await readFile(path.join(scenarioDirectory, name), "utf8");
  return { digest: sha256(source), source };
}

export async function writeFiscalPolicyManifest(
  outputPath: string,
  commercial: DomainFixture,
  fiscal: FiscalFixture,
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
  const fixtures = [commercial, fiscal];
  const policies = fixtures.flatMap((fixture) => [
    policyEntry(fixture, "zoen.definition.activate", activation),
    ...fixture.metadata.actions.map((action) => {
      const policy =
        fixture.metadata.definitionId === "fiscal.brazil"
          ? actionPolicies.get(action.id)
          : domain;
      if (policy === undefined) {
        throw new Error(`missing fiscal policy for ${action.id}`);
      }
      return policyEntry(fixture, action.id, policy);
    }),
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export async function startVendorFaultProxy(
  providerCredential: string,
): Promise<ManagedProcess> {
  return startManagedProcess({
    arguments: [
      path.join(
        distDirectory,
        "e2e",
        "fiscal-fault-matrix",
        "vendor-fault-proxy.js",
      ),
    ],
    command: process.execPath,
    environment: {
      ZOEN_E2E_PROXY_PORT: proxyPort.toString(),
      ZOEN_FISCAL_PROXY_CREDENTIAL: providerCredential,
    },
    name: "fiscal vendor fault proxy",
    port: proxyPort,
  });
}

export async function startFiscalAdapter(input: {
  readonly callerBindings: Readonly<Record<string, string>>;
  readonly provider: "plugnotas" | "protheus" | "systax";
  readonly providerBaseUrl?: string;
  readonly providerCredential: string;
  readonly providerTimeoutMs?: number;
}): Promise<ManagedProcess> {
  const port = fiscalAdapterPort(input.provider);
  return startManagedProcess({
    arguments: [
      path.join(
        distDirectory,
        "packages",
        "fiscal-brazil",
        "src",
        "adapter",
        "main.js",
      ),
    ],
    command: process.execPath,
    environment: {
      ZOEN_FISCAL_ADAPTER_CALLER_BINDINGS: JSON.stringify(
        input.callerBindings,
      ),
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
      ZOEN_FISCAL_ADAPTER_PROVIDER: input.provider,
      ZOEN_FISCAL_ADAPTER_PROVIDER_BASE_URL:
        input.providerBaseUrl ?? `http://127.0.0.1:${proxyPort}`,
      ZOEN_FISCAL_ADAPTER_PROVIDER_CREDENTIAL: input.providerCredential,
      ZOEN_FISCAL_ADAPTER_PROVIDER_TIMEOUT_MS: (
        input.providerTimeoutMs ?? 5_000
      ).toString(),
      ZOEN_FISCAL_ADAPTER_ZOEN_URL: zoenUrl,
    },
    name: `${input.provider} fiscal adapter`,
    port,
  });
}

export function adapterProviderUrl(
  provider: "plugnotas" | "protheus" | "systax",
): string {
  return `http://127.0.0.1:${fiscalAdapterPort(provider)}/v1/operations`;
}

export async function setFiscalProxyMode(mode: ProxyMode): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${proxyPort}/control`, {
    body: JSON.stringify({ mode }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.ok, true, await response.text());
}

export async function fiscalProxyMetrics() {
  const response = await fetch(`http://127.0.0.1:${proxyPort}/metrics`);
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return proxyMetricsSchema.parse(body);
}

export async function connectorStatusResponse(input: {
  readonly credentialRef: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
}): Promise<Response> {
  return fetch(
    `${e2eHttpUrl("ZOEN_E2E_CONNECTOR_PORT", 58_273)}/v1/effects/status`,
    {
      body: JSON.stringify(input),
      headers: {
        authorization: "Bearer connector-worker-token",
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
}

export async function runRustLeakageMutant(
  literal: string,
): Promise<{ readonly code: number; readonly stderr: string; readonly stdout: string }> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "zoen-fiscal-"));
  const crate = path.join(temporaryRoot, "zoen-engine");
  try {
    await cp(path.join(repositoryRoot, "crates", "zoen-engine"), crate, {
      recursive: true,
    });
    const libraryPath = path.join(crate, "src", "lib.rs");
    const library = await readFile(libraryPath, "utf8");
    const mutation = `const FISCAL_DOMAIN_MUTANT: &str = ${JSON.stringify(literal)};\n`;
    await writeFile(
      libraryPath,
      library.includes("#[cfg(test)]")
        ? library.replace("#[cfg(test)]", `${mutation}#[cfg(test)]`)
        : `${mutation}${library}`,
    );
    return runProcess(process.execPath, [
      path.join(repositoryRoot, "scripts", "check-domain-leakage.mjs"),
      path.join(crate, "src"),
    ]);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export function processOutputContains(
  processes: readonly ManagedProcess[],
  value: string,
): boolean {
  return processes
    .flatMap((process) => [...process.output, ...process.stderr])
    .join("")
    .includes(value);
}

function policyEntry(
  fixture: DomainFixture | FiscalFixture,
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

function runProcess(
  command: string,
  arguments_: readonly string[],
): Promise<{ readonly code: number; readonly stderr: string; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...arguments_],
      { cwd: repositoryRoot, encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve({
          code:
            error !== null && "code" in error && typeof error.code === "number"
              ? error.code
              : error === null
                ? 0
                : 1,
          stderr,
          stdout,
        });
      },
    );
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
