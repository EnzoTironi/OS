import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { DefinitionReferenceSchema } from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { parseDefinitionMetadata } from "../../packages/sdk/src/definition.js";
import {
  compileDeterministicSurface,
  type SurfaceDocument,
} from "../../packages/surface/src/index.js";
import {
  activeDigest,
  actionClient,
  activateDefinition,
  adminClient,
  command,
  compilePackage as compileInventoryPackage,
  definitionClient,
  dispatchOnce,
  effectClient,
  expectConnectCode,
  explainOperation,
  explanationShape,
  historyClient,
  oidcToken,
  packageSource as inventoryPackageSource,
  proposalRequest,
  providerOperation,
  publishDefinition,
  rebuildProjection,
  recordEvidence as recordInventoryEvidence,
  registerWorker,
  repositoryRoot,
  runLeakageGate,
  semanticQuery,
  semanticShape,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startServer,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
  type ActionClient,
  type DomainFixture as InventoryDomainFixture,
  type EvidenceTime,
  type ManagedProcess,
  type PackageName as InventoryPackageName,
  type PolicySource,
  type ProcessResult,
  type QueryConsistency,
  type SemanticValue,
  type ServerProcess,
} from "../domain-inventory-procurement/support.js";
import {
  compileDefinition,
  type DefinitionClient,
  type HistoryClient,
  type WorldClient,
} from "../evolution-compatible/support.js";

export {
  activeDigest,
  actionClient,
  activateDefinition,
  adminClient,
  command,
  definitionClient,
  dispatchOnce,
  effectClient,
  expectConnectCode,
  explainOperation,
  explanationShape,
  historyClient,
  oidcToken,
  proposalRequest,
  providerOperation,
  publishDefinition,
  rebuildProjection,
  registerWorker,
  repositoryRoot,
  runLeakageGate,
  semanticQuery,
  semanticShape,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startServer,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
};
export type {
  ActionClient,
  DefinitionClient,
  EvidenceTime,
  HistoryClient,
  ManagedProcess,
  PolicySource,
  ProcessResult,
  QueryConsistency,
  SemanticValue,
  ServerProcess,
  WorldClient,
};

export type PackageName =
  | InventoryPackageName
  | "accounting-foundation"
  | "manufacturing";

export interface DomainFixture extends Omit<InventoryDomainFixture, "packageName"> {
  readonly packageName: PackageName;
}

export interface PolicySet {
  readonly accounting: PolicySource;
  readonly activation: PolicySource;
  readonly domain: PolicySource;
  readonly execution: PolicySource;
  readonly manufacturing: PolicySource;
  readonly settlement: PolicySource;
}

const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "domain-manufacturing-accounting",
);
const packageSources = {
  "accounting-foundation": path.join(
    repositoryRoot,
    "packages",
    "accounting-foundation",
    "src",
    "accounting-foundation.zoen.ts",
  ),
  manufacturing: path.join(
    repositoryRoot,
    "packages",
    "manufacturing",
    "src",
    "manufacturing.zoen.ts",
  ),
} satisfies Record<
  Exclude<PackageName, InventoryPackageName>,
  string
>;

export async function compilePackage(
  packageName: PackageName,
): Promise<DomainFixture> {
  switch (packageName) {
    case "commercial":
    case "inventory":
    case "party":
    case "procurement":
    case "product":
      return compileInventoryPackage(packageName);
    case "accounting-foundation":
    case "manufacturing": {
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
    default: {
      const exhaustive: never = packageName;
      return exhaustive;
    }
  }
}

export function packageSource(packageName: PackageName): Promise<string> {
  switch (packageName) {
    case "commercial":
    case "inventory":
    case "party":
    case "procurement":
    case "product":
      return inventoryPackageSource(packageName);
    case "accounting-foundation":
    case "manufacturing":
      return readFile(packageSources[packageName], "utf8");
    default: {
      const exhaustive: never = packageName;
      return exhaustive;
    }
  }
}

export async function loadPolicy(sourceName: string): Promise<PolicySource> {
  const source = await readFile(path.join(scenarioDirectory, sourceName), "utf8");
  return { digest: sha256(source), source };
}

export async function writePolicyManifest(
  outputPath: string,
  fixtures: readonly DomainFixture[],
  policySet: PolicySet,
): Promise<void> {
  const policies = fixtures.flatMap((fixture) => [
    {
      actionId: "zoen.definition.activate",
      definitionDigest: fixture.digest,
      digest: policySet.activation.digest,
      policyId: `policy.activation.${fixture.metadata.definitionId}.r${fixture.metadata.revision}`,
      revision: fixture.metadata.revision,
      source: policySet.activation.source,
    },
    ...fixture.metadata.actions.map((action) => {
      const policy = actionPolicy(fixture.packageName, action.id, policySet);
      return {
        actionId: action.id,
        definitionDigest: fixture.digest,
        digest: policy.digest,
        policyId: `policy.${action.id}.r${fixture.metadata.revision}`,
        revision: fixture.metadata.revision,
        source: policy.source,
      };
    }),
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export function recordEvidence(
  client: WorldClient,
  input: Omit<
    Parameters<typeof recordInventoryEvidence>[1],
    "sourceNamespace"
  >,
): Promise<bigint> {
  return recordInventoryEvidence(client, {
    ...input,
    sourceNamespace: "domain-manufacturing-accounting",
  });
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
    presentation: { title: "Manufacturing and accounting operations" },
  });
}

export async function runLeakageMutant(): Promise<ProcessResult> {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "zoen-manufacturing-accounting-"),
  );
  const crate = path.join(temporaryRoot, "zoen-engine");
  try {
    await cp(path.join(repositoryRoot, "crates", "zoen-engine"), crate, {
      recursive: true,
    });
    const libraryPath = path.join(crate, "src", "lib.rs");
    const library = await readFile(libraryPath, "utf8");
    const mutation = [
      "fn domain_action_mutant(action_id: &str) -> bool {",
      '    if action_id == "accounting.applySettlement" {',
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

function actionPolicy(
  packageName: PackageName,
  actionId: string,
  policySet: PolicySet,
): PolicySource {
  switch (packageName) {
    case "commercial":
    case "inventory":
    case "party":
    case "procurement":
    case "product":
      return policySet.domain;
    case "manufacturing":
      return [
        "manufacturing.recordCompletion",
        "manufacturing.recordPartialCompletion",
        "manufacturing.startWork",
      ].includes(actionId)
        ? policySet.execution
        : policySet.manufacturing;
    case "accounting-foundation":
      return actionId === "accounting.applySettlement"
        ? policySet.settlement
        : policySet.accounting;
    default: {
      const exhaustive: never = packageName;
      return exhaustive;
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
