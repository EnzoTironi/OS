import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
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
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { z } from "zod";
import {
  ActionInputSchema,
  type ActionInput,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  HistoryService,
  type CausalExplanation,
} from "../../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  QuantityValueSchema,
  StrongConsistencySchema,
  TemporalIntervalSchema,
  ValidTimeSchema,
  type DefinitionReference,
  type ExactValue,
  type ValidTime,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  adminClient,
  definitionClient,
  dispatchOnce,
  effectClient,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  providerOperation,
  registerWorker,
  repositoryRoot,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  waitFor,
  worldClient,
  zoenBaseUrl,
  type ActionClient,
  type DefinitionClient,
  type EffectClient,
  type ManagedProcess,
  type WorldClient,
} from "../effects/support.js";
import {
  evidenceInput,
  waitForConnectorStatus,
  waitForState,
} from "../effects/scenario.js";
import { e2ePort } from "../host-env.js";

export {
  actionClient,
  adminClient,
  definitionClient,
  dispatchOnce,
  evidenceInput,
  effectClient,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  providerOperation,
  registerWorker,
  repositoryRoot,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  waitFor,
  waitForConnectorStatus,
  waitForState,
  worldClient,
};
export type {
  ActionClient,
  DefinitionClient,
  EffectClient,
  ManagedProcess,
  WorldClient,
};

export interface QualityVocabulary {
  readonly acceptanceComputation: string;
  readonly acceptedMeasurementRelation: string;
  readonly correctionRelation: string;
  readonly definitionId: string;
  readonly dispositionRelation: string;
  readonly measurementRelation: string;
  readonly nonconformanceRelation: string;
  readonly quarantineAction: string;
  readonly releaseAction: string;
  readonly releaseStatusRelation: string;
  readonly resourceId: string;
  readonly specificationMinimumRelation: string;
  readonly specificationVersionRelation: string;
  readonly uncertaintyRelation: string;
}

export interface QualityFixture {
  readonly canonicalJson: string;
  readonly definition: DefinitionReference;
  readonly digest: string;
  readonly vocabulary: QualityVocabulary;
}

export interface PolicyFixture {
  readonly actionId: string;
  readonly digest: string;
  readonly policyId: string;
  readonly revision: number;
  readonly source: string;
}

export type SemanticValue =
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "integer"; readonly value: string }
  | {
      readonly amount: string;
      readonly kind: "quantity";
      readonly unit: string;
    }
  | { readonly kind: "text"; readonly value: string };

export type EvidenceTime =
  | { readonly at: Date; readonly kind: "instant" }
  | {
      readonly end: Date;
      readonly kind: "interval";
      readonly start: Date;
    };

export const qualityVocabulary: QualityVocabulary = {
  acceptanceComputation: "quality.acceptance",
  acceptedMeasurementRelation: "quality.acceptedMeasurementBasisKpa",
  correctionRelation: "quality.correctionOf",
  definitionId: "quality.assurance",
  dispositionRelation: "quality.disposition",
  measurementRelation: "quality.measurementBasisKpa",
  nonconformanceRelation: "quality.nonconformance",
  quarantineAction: "quality.quarantineLot",
  releaseAction: "quality.releaseLot",
  releaseStatusRelation: "quality.releaseStatus",
  resourceId: "quality.inspection.lot-42",
  specificationMinimumRelation: "quality.specificationMinimumBasisKpa",
  specificationVersionRelation: "quality.specificationVersion",
  uncertaintyRelation: "quality.uncertaintyBasisKpa",
};

export const remappedVocabulary: QualityVocabulary = {
  acceptanceComputation: "lab.acceptance",
  acceptedMeasurementRelation: "lab.acceptedMeasurementBasisKpa",
  correctionRelation: "lab.correctionOf",
  definitionId: "lab.assurance",
  dispositionRelation: "lab.disposition",
  measurementRelation: "lab.measurementBasisKpa",
  nonconformanceRelation: "lab.nonconformance",
  quarantineAction: "lab.quarantineLot",
  releaseAction: "lab.releaseLot",
  releaseStatusRelation: "lab.releaseStatus",
  resourceId: "lab.inspection.lot-42",
  specificationMinimumRelation: "lab.specificationMinimumBasisKpa",
  specificationVersionRelation: "lab.specificationVersion",
  uncertaintyRelation: "lab.uncertaintyBasisKpa",
};

const compiledDefinitionSchema = z
  .object({
    canonicalJson: z.string(),
    definition: z
      .object({
        definitionId: z.string().min(1),
        revision: z.number().int().positive(),
      })
      .passthrough(),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const compilerPath = path.join(
  repositoryRoot,
  "dist",
  "packages",
  "ontology",
  "src",
  "cli.js",
);
const scenarioDirectory = path.join(repositoryRoot, "e2e", "domain-quality");
const composeFile = path.join("e2e", "domain-quality", "compose.yaml");
const composeProject = "zoen-domain-quality";

export async function compileQuality(
  sourceName: string,
  vocabulary: QualityVocabulary,
): Promise<QualityFixture> {
  const output = await command(process.execPath, [
    compilerPath,
    "compile",
    path.join(repositoryRoot, "archive", "domain", "quality", "src", sourceName),
  ]);
  const compiled = compiledDefinitionSchema.parse(JSON.parse(output));
  assert.equal(compiled.definition.definitionId, vocabulary.definitionId);
  return {
    canonicalJson: compiled.canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      revision: BigInt(compiled.definition.revision),
    }),
    digest: compiled.digest,
    vocabulary,
  };
}

export async function loadPolicy(
  sourceName: string,
  actionId: string,
  policyId: string,
  revision: number,
): Promise<PolicyFixture> {
  const source = await readFile(path.join(scenarioDirectory, sourceName), "utf8");
  return {
    actionId,
    digest: sha256(source),
    policyId,
    revision,
    source,
  };
}

export async function writePolicyManifest(
  outputPath: string,
  definitions: readonly {
    readonly fixture: QualityFixture;
    readonly policies: readonly PolicyFixture[];
  }[],
): Promise<void> {
  const policies = definitions.flatMap(({ fixture, policies: entries }) =>
    entries.map((entry) => ({
      actionId: entry.actionId,
      definitionDigest: fixture.digest,
      digest: entry.digest,
      policyId: entry.policyId,
      revision: entry.revision,
      source: entry.source,
    })),
  );
  await writeFile(outputPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export async function publishDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: QualityFixture,
): Promise<bigint> {
  const response = await client.publish({
    canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
    digest: fixture.digest,
    tenantId,
  });
  const revision = response.definitionRevision;
  assert.ok(revision);
  assert.equal(revision.digest, fixture.digest);
  assert.equal(
    revision.definitionId,
    fixture.definition.definitionId,
  );
  assert.equal(
    revision.revision,
    fixture.definition.revision,
  );
  assert.ok(revision.commitSequence > 0n);
  return revision.commitSequence;
}

export async function activateDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: QualityFixture,
): Promise<void> {
  const response = await client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
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

export async function recordEvidence(
  client: WorldClient,
  input: {
    readonly claimId: string;
    readonly fixture: QualityFixture;
    readonly relationId: string;
    readonly sourceId: string;
    readonly tenantId: string;
    readonly time: EvidenceTime;
    readonly value: SemanticValue;
  },
): Promise<bigint> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.fixture.definition,
      entityId: input.fixture.vocabulary.resourceId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(
          `${input.sourceId}:${input.claimId}:${valueDigest(input.value)}`,
        ),
        sourceId: input.sourceId,
        sourceRef: `urn:zoen:quality:${input.claimId}`,
      }),
      relationId: input.relationId,
      validTime: evidenceTime(input.time),
      value: exactValue(input.value),
    }),
    tenantId: input.tenantId,
  });
  assert.equal(response.claimId, input.claimId);
  assert.ok(response.commitSequence > 0n);
  return response.commitSequence;
}

export function semanticQuery(
  client: WorldClient,
  input: {
    readonly fixture: QualityFixture;
    readonly selection:
      | { readonly id: string; readonly kind: "computation" }
      | { readonly id: string; readonly kind: "relation" };
    readonly snapshotCommit?: bigint;
    readonly tenantId: string;
    readonly validAt: Date;
  },
) {
  return client.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value:
        input.snapshotCommit === undefined
          ? {
              case: "strong",
              value: create(StrongConsistencySchema),
            }
          : {
              case: "snapshotCommit",
              value: input.snapshotCommit,
            },
    }),
    definition: input.fixture.definition,
    entityId: input.fixture.vocabulary.resourceId,
    selection: create(QuerySelectionSchema, {
      value:
        input.selection.kind === "computation"
          ? {
              case: "computationId",
              value: input.selection.id,
            }
          : {
              case: "relationId",
              value: input.selection.id,
            },
    }),
    tenantId: input.tenantId,
    validAt: timestampFromDate(input.validAt),
  });
}

export function actionInput(
  inputId: string,
  value: SemanticValue,
): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: exactValue(value),
  });
}

export function historyClient(token: string): Client<typeof HistoryService> {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createClient(
    HistoryService,
    createConnectTransport({
      baseUrl: zoenBaseUrl,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}

export async function explainProposal(
  client: Client<typeof HistoryService>,
  proposalId: string,
): Promise<CausalExplanation> {
  const response = await client.explain({
    target: { target: { case: "proposalId", value: proposalId } },
  });
  assert.ok(response.explanation);
  return response.explanation;
}

export async function explainOperation(
  client: Client<typeof HistoryService>,
  operationId: string,
): Promise<CausalExplanation> {
  const response = await client.explain({
    target: { target: { case: "operationId", value: operationId } },
  });
  assert.ok(response.explanation);
  return response.explanation;
}

export async function expectConnectCode(
  operation: () => Promise<unknown>,
  expected: Code,
): Promise<Code> {
  try {
    await operation();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
    return error.code;
  }
}

export async function restartRestate(): Promise<void> {
  await command("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    "restart",
    "restate",
  ]);
  await waitFor(
    async () =>
      (await canConnect(e2ePort("ZOEN_E2E_RESTATE_UI_PORT", 59_073)))
        ? true
        : undefined,
    "Restate admin port after restart",
  );
  await waitFor(
    async () =>
      (await canConnect(e2ePort("ZOEN_E2E_RESTATE_INGRESS_PORT", 58_132)))
        ? true
        : undefined,
    "Restate ingress port after restart",
  );
}

export interface ProcessResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

export function runLeakageGate(target?: string): Promise<ProcessResult> {
  return runProcess(process.execPath, [
    path.join(repositoryRoot, "scripts", "check-domain-leakage.mjs"),
    ...(target === undefined ? [] : [target]),
  ]);
}

export async function runLeakageMutant(): Promise<ProcessResult> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "zoen-leakage-"));
  const crate = path.join(temporaryRoot, "zoen-engine");
  try {
    await cp(path.join(repositoryRoot, "crates", "zoen-engine"), crate, {
      recursive: true,
    });
    const libraryPath = path.join(crate, "src", "lib.rs");
    const library = await readFile(libraryPath, "utf8");
    const mutation = 'const DOMAIN_ACTION_BRANCH: &str = "quality.releaseLot";\n\n';
    await writeFile(
      libraryPath,
      library.includes("#[cfg(test)]")
        ? library.replace("#[cfg(test)]", `${mutation}#[cfg(test)]`)
        : `${mutation}${library}`,
    );
    return await runLeakageGate(path.join(crate, "src"));
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export function command(
  executable: string,
  arguments_: readonly string[],
): Promise<string> {
  return runProcess(executable, arguments_).then((result) => {
    if (result.code !== 0) {
      throw new Error(`${result.stdout}${result.stderr}`);
    }
    return result.stdout.trim();
  });
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceTime(time: EvidenceTime): ValidTime {
  switch (time.kind) {
    case "instant":
      return create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(time.at),
        },
      });
    case "interval":
      return create(ValidTimeSchema, {
        value: {
          case: "interval",
          value: create(TemporalIntervalSchema, {
            end: timestampFromDate(time.end),
            start: timestampFromDate(time.start),
          }),
        },
      });
    default: {
      const exhaustive: never = time;
      return exhaustive;
    }
  }
}

function exactValue(value: SemanticValue): ExactValue {
  switch (value.kind) {
    case "bool":
      return create(ExactValueSchema, {
        value: { case: "boolValue", value: value.value },
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
      return exhaustive;
    }
  }
}

function valueDigest(value: SemanticValue): string {
  switch (value.kind) {
    case "bool":
      return `bool:${value.value}`;
    case "integer":
      return `integer:${value.value}`;
    case "quantity":
      return `quantity:${value.amount}:${value.unit}`;
    case "text":
      return `text:${value.value}`;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function runProcess(
  executable: string,
  arguments_: readonly string[],
): Promise<ProcessResult> {
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
        if (error !== null && typeof error.code !== "number") {
          reject(error);
          return;
        }
        resolve({
          code: typeof error?.code === "number" ? error.code : 0,
          stderr,
          stdout,
        });
      },
    );
  });
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
