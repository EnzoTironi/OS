import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { DefinitionReferenceSchema } from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { parseDefinitionMetadata } from "../../packages/sdk/src/definition.js";
import {
  activeDigest,
  actionClient,
  activateDefinition,
  adminClient,
  command,
  compilePackage as compileCommercialPackage,
  definitionClient,
  explainOperation,
  explanationShape,
  expectConnectCode,
  historyClient,
  oidcToken,
  proposalRequest,
  publishDefinition,
  rebuildProjection,
  recordEvidence as recordDomainEvidence,
  repositoryRoot,
  runLeakageGate,
  semanticQuery,
  semanticShape,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
  type DefinitionFixture,
  type EvidenceTime,
  type PackageName as CommercialPackageName,
  type PolicySource,
  type ProcessResult,
  type QueryConsistency,
  type SemanticValue,
  type ServerProcess,
} from "../domain-commercial/support.js";
import {
  dispatchOnce,
  effectClient,
  providerOperation,
  registerWorker,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  stopProcess,
  type ManagedProcess,
} from "../effects/support.js";
import {
  compileDefinition,
  type ActionClient,
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
  | CommercialPackageName
  | "inventory"
  | "procurement";

export interface DomainFixture extends DefinitionFixture {
  readonly packageName: PackageName;
}

export interface PolicySet {
  readonly activation: PolicySource;
  readonly domain: PolicySource;
  readonly inventory: PolicySource;
  readonly procurement: PolicySource;
  readonly purchase: PolicySource;
}

const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "domain-inventory-procurement",
);
const packageSources = {
  inventory: path.join(
    repositoryRoot,
    "packages",
    "inventory",
    "src",
    "inventory.zoen.ts",
  ),
  procurement: path.join(
    repositoryRoot,
    "packages",
    "procurement",
    "src",
    "procurement.zoen.ts",
  ),
} satisfies Record<Exclude<PackageName, CommercialPackageName>, string>;

export async function compilePackage(
  packageName: PackageName,
): Promise<DomainFixture> {
  switch (packageName) {
    case "commercial":
    case "party":
    case "product":
      return compileCommercialPackage(packageName);
    case "inventory":
    case "procurement": {
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
    case "party":
    case "product":
      return readFile(
        path.join(
          repositoryRoot,
          "packages",
          packageName,
          "src",
          `${packageName}.zoen.ts`,
        ),
        "utf8",
      );
    case "inventory":
    case "procurement":
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
    Parameters<typeof recordDomainEvidence>[1],
    "sourceNamespace"
  >,
): Promise<bigint> {
  return recordDomainEvidence(client, {
    ...input,
    sourceNamespace: "domain-inventory-procurement",
  });
}

export async function runLeakageMutant(): Promise<ProcessResult> {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "zoen-inventory-procurement-"),
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
      '    if action_id == "inventory.reserveInventory" {',
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
    case "party":
    case "product":
      return policySet.domain;
    case "inventory":
      return policySet.inventory;
    case "procurement":
      return actionId === "procurement.governPurchase"
        ? policySet.purchase
        : policySet.procurement;
    default: {
      const exhaustive: never = packageName;
      return exhaustive;
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
