import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  ActionInputSchema,
  type ActionInput,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  DefinitionReferenceSchema,
  EventualConsistencySchema,
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
  type SemanticQueryResponse,
  type ValidTime,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { parseDefinitionMetadata } from "../../packages/sdk/src/definition.js";
import {
  compileDeterministicSurface,
  type SurfaceDocument,
} from "../../packages/surface/src/index.js";
import { dispatchOnce } from "../effects/support.js";
import {
  actionClient,
  adminClient,
  command,
  compileDefinition,
  definitionClient,
  historyClient,
  oidcToken,
  publish,
  rebuildProjection,
  repositoryRoot,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  type ActionClient,
  type CompiledDefinition,
  type DefinitionClient,
  type HistoryClient,
  type ServerProcess,
  type WorldClient,
} from "../evolution-compatible/support.js";

export {
  actionClient,
  adminClient,
  command,
  definitionClient,
  dispatchOnce,
  historyClient,
  oidcToken,
  rebuildProjection,
  repositoryRoot,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
};
export type {
  ActionClient,
  DefinitionClient,
  HistoryClient,
  ServerProcess,
  WorldClient,
};

export type PackageName = "commercial" | "party" | "product";

export interface DomainFixture {
  readonly canonicalJson: string;
  readonly compiled: CompiledDefinition;
  readonly definition: DefinitionReference;
  readonly digest: string;
  readonly metadata: ReturnType<typeof parseDefinitionMetadata>;
  readonly packageName: PackageName;
}

export interface PolicySource {
  readonly digest: string;
  readonly source: string;
}

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

export type EvidenceTime =
  | { readonly at: Date; readonly kind: "instant" }
  | {
      readonly end: Date;
      readonly kind: "interval";
      readonly start: Date;
    };

export type QueryConsistency =
  | { readonly kind: "eventual" }
  | { readonly kind: "snapshot"; readonly commit: bigint }
  | { readonly kind: "strong" };

const packageSources = {
  commercial: path.join(
    repositoryRoot,
    "packages",
    "commercial",
    "src",
    "commercial.zoen.ts",
  ),
  party: path.join(
    repositoryRoot,
    "packages",
    "party",
    "src",
    "party.zoen.ts",
  ),
  product: path.join(
    repositoryRoot,
    "packages",
    "product",
    "src",
    "product.zoen.ts",
  ),
} satisfies Record<PackageName, string>;

const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "domain-commercial",
);

export async function compilePackage(
  packageName: PackageName,
): Promise<DomainFixture> {
  const compiled = await compileDefinition(packageSources[packageName]);
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
    packageName,
  };
}

export function packageSource(packageName: PackageName): Promise<string> {
  return readFile(packageSources[packageName], "utf8");
}

export async function loadPolicy(sourceName: string): Promise<PolicySource> {
  const source = await readFile(path.join(scenarioDirectory, sourceName), "utf8");
  return { digest: sha256(source), source };
}

export async function writePolicyManifest(
  outputPath: string,
  fixtures: readonly DomainFixture[],
  activation: PolicySource,
  commercial: PolicySource,
  identity: PolicySource,
): Promise<void> {
  const policies = fixtures.flatMap((fixture) => {
    const actionPolicy =
      fixture.packageName === "commercial" ? commercial : identity;
    return [
      {
        actionId: "zoen.definition.activate",
        definitionDigest: fixture.digest,
        digest: activation.digest,
        policyId: `policy.activation.${fixture.metadata.definitionId}.r${fixture.metadata.revision}`,
        revision: fixture.metadata.revision,
        source: activation.source,
      },
      ...fixture.metadata.actions.map((action) => ({
        actionId: action.id,
        definitionDigest: fixture.digest,
        digest: actionPolicy.digest,
        policyId: `policy.${action.id}.r${fixture.metadata.revision}`,
        revision: fixture.metadata.revision,
        source: actionPolicy.source,
      })),
    ];
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export async function publishDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DomainFixture,
): Promise<bigint> {
  const published = await publish(client, tenantId, fixture.compiled);
  assert.equal(published.digest, fixture.digest);
  assert.equal(published.definitionId, fixture.metadata.definitionId);
  return published.commitSequence;
}

export async function activateDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DomainFixture,
): Promise<bigint> {
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
  assert.ok(response.activation?.commitSequence);
  return response.activation.commitSequence;
}

export async function activeDigest(
  client: DefinitionClient,
  tenantId: string,
  fixture: DomainFixture,
): Promise<string | undefined> {
  const response = await client.getActiveRevision({
    definitionId: fixture.metadata.definitionId,
    tenantId,
  });
  return response.definitionRevision?.digest;
}

export async function recordEvidence(
  client: WorldClient,
  input: {
    readonly claimId: string;
    readonly entityId: string;
    readonly fixture: DomainFixture;
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
      entityId: input.entityId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(
          `${input.sourceId}:${input.claimId}:${valueDigest(input.value)}`,
        ),
        sourceId: input.sourceId,
        sourceRef: `urn:zoen:domain-commercial:${input.claimId}`,
      }),
      relationId: input.relationId,
      validTime: validTime(input.time),
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
    readonly consistency?: QueryConsistency;
    readonly entityId: string;
    readonly fixture: DomainFixture;
    readonly selection:
      | { readonly id: string; readonly kind: "computation" }
      | { readonly id: string; readonly kind: "relation" };
    readonly tenantId: string;
    readonly validAt: Date;
  },
) {
  const consistency = input.consistency ?? { kind: "strong" };
  return client.semanticQuery({
    consistency: queryConsistency(consistency),
    definition: input.fixture.definition,
    entityId: input.entityId,
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

export function actionInput(id: string, value: SemanticValue): ActionInput {
  return create(ActionInputSchema, {
    inputId: id,
    value: exactValue(value),
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

export function explanationShape(
  explanation: Awaited<ReturnType<typeof explainOperation>>,
): string {
  if (explanation.subject.case !== "action") {
    throw new Error(
      `expected Action explanation, received ${explanation.subject.case ?? "none"}`,
    );
  }
  const action = explanation.subject.value;
  return JSON.stringify({
    commitSequence: action.commit?.receipt?.commitSequence.toString(),
    complete: explanation.complete,
    definitionDigest: action.definition?.reference?.digest,
    dependencies:
      action.proposalStateBasis?.basis?.dependencies
        .map((dependency) => dependency.claimId)
        .sort() ?? [],
    policyIds: action.policies
      .flatMap((policy) => policy.policy?.determiningPolicyIds ?? [])
      .sort(),
    proposalId: action.proposal?.structure?.proposalId,
    recordIds:
      action.commit?.records
        .map((record) => record.structure?.claimId)
        .sort() ?? [],
  });
}

export function semanticShape(response: SemanticQueryResponse): string {
  return JSON.stringify({
    actualCommitSequence: response.actualCommitSequence.toString(),
    definitionDigest: response.definition?.digest,
    values: response.values
      .map((result) => ({
        dependencies: result.dependencies
          .map((dependency) => ({
            claimId: dependency.claimId,
            relationId: dependency.relationId,
            role: dependency.role,
            sourceId: dependency.sourceId,
          }))
          .sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
        value: valueShape(result.value),
      }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  });
}

export function valueShapes(response: SemanticQueryResponse): SemanticValue[] {
  return response.values.map((result) => valueShape(result.value));
}

export function compileSurface(
  fixture: DomainFixture,
  entityId: string,
): SurfaceDocument {
  return compileDeterministicSurface({
    definition: {
      definitionId: fixture.metadata.definitionId,
      digest: fixture.digest,
      revision: fixture.metadata.revision.toString(),
    },
    entityId,
    metadata: fixture.metadata,
    presentation: { title: "Commercial commitment lifecycle" },
  });
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
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "zoen-commercial-"));
  const crate = path.join(temporaryRoot, "zoen-engine");
  try {
    await cp(path.join(repositoryRoot, "crates", "zoen-engine"), crate, {
      recursive: true,
    });
    const libraryPath = path.join(crate, "src", "lib.rs");
    const library = await readFile(libraryPath, "utf8");
    const mutation = [
      "fn domain_action_mutant(action_id: &str) -> bool {",
      '    if action_id == "commercial.changeCommitment" {',
      "        return true;",
      "    }",
      "    false",
      "}",
      "",
    ].join("\n");
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

function queryConsistency(consistency: QueryConsistency) {
  switch (consistency.kind) {
    case "eventual":
      return create(QueryConsistencySchema, {
        value: {
          case: "eventual",
          value: create(EventualConsistencySchema),
        },
      });
    case "snapshot":
      return create(QueryConsistencySchema, {
        value: {
          case: "snapshotCommit",
          value: consistency.commit,
        },
      });
    case "strong":
      return create(QueryConsistencySchema, {
        value: {
          case: "strong",
          value: create(StrongConsistencySchema),
        },
      });
    default: {
      const exhaustive: never = consistency;
      return exhaustive;
    }
  }
}

function validTime(time: EvidenceTime): ValidTime {
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
      return exhaustive;
    }
  }
}

function valueDigest(value: SemanticValue): string {
  switch (value.kind) {
    case "bool":
    case "decimal":
    case "entity-ref":
    case "integer":
    case "text":
      return `${value.kind}:${value.value}`;
    case "quantity":
      return `${value.kind}:${value.amount}:${value.unit}`;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function valueShape(
  exact: SemanticQueryResponse["values"][number]["value"],
): SemanticValue {
  if (exact === undefined) {
    throw new Error("SemanticQuery result has no exact value");
  }
  const value = exact.value;
  switch (value.case) {
    case "boolValue":
      return { kind: "bool", value: value.value };
    case "decimalValue":
      return { kind: "decimal", value: value.value };
    case "entityRefValue":
      return { kind: "entity-ref", value: value.value };
    case "integerValue":
      return { kind: "integer", value: value.value };
    case "quantityValue":
      return {
        amount: value.value.amount,
        kind: "quantity",
        unit: value.value.unit,
      };
    case "textValue":
      return { kind: "text", value: value.value };
    case undefined:
      throw new Error("SemanticQuery result has no exact value");
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
