import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeScenarioArtifact } from "../host-env.js";
import { gitHead } from "../scenario-evidence.js";
import type { MutantKills } from "./acceptance.js";
import {
  repositoryRoot,
  sha256,
  type CompiledDefinition,
} from "./support.js";

export async function writeEvolutionBreakingArtifact(input: {
  actionContractOnly: CompiledDefinition;
  assertions: Record<string, boolean>;
  failureInjections: readonly string[];
  foreignTenantRejections: {
    apply: boolean;
    prepare: boolean;
    rollback: boolean;
  };
  mutants: MutantKills;
  postgresVersion: string | undefined;
  sourceLineCounts: Record<string, number>;
  startedAt: string;
  v1: CompiledDefinition;
  v1ReceiptOperationId: string;
  v1ToV2Assessment: { classification: unknown };
  v2: CompiledDefinition;
  v2ReceiptOperationId: string;
  v2ToV3Assessment: { classification: unknown };
  v2ToV3RecipeOperationId: string;
  v3: CompiledDefinition;
  v3ReceiptOperationId: string;
  v1ToV2RecipeOperationId: string;
  reverseClassification: unknown;
}): Promise<void> {
  const protocol = await readFile(
    path.join(
      repositoryRoot,
      "proto",
      "zoen",
      "definition",
      "v1",
      "definition.proto",
    ),
  );
  const sourceCommit = gitHead(repositoryRoot);
  const manifest = {
    architecture: {
      authorityCommitLedger: "authority_commits",
      restate: "NotApplicable: operation and batch identities recover progress",
      wasm: "NotApplicable: canonical v1 has no Wasm artifact or reference",
    },
    assertions: input.assertions,
    classifications: {
      forbidden: input.reverseClassification,
      v1ToV2: input.v1ToV2Assessment.classification,
      v2ToV3: input.v2ToV3Assessment.classification,
    },
    componentVersions: {
      postgres: input.postgresVersion,
      sessionDoor: "better-auth",
    },
    definitionDigests: {
      actionContractOnly: input.actionContractOnly.digest,
      v1: input.v1.digest,
      v2: input.v2.digest,
      v3: input.v3.digest,
    },
    failureInjections: input.failureInjections,
    finishedAt: new Date().toISOString(),
    foreignTenantRejections: input.foreignTenantRejections,
    mutants: input.mutants,
    observedOperations: {
      migrationV1ToV2: input.v1ToV2RecipeOperationId,
      migrationV2ToV3: input.v2ToV3RecipeOperationId,
      v1Action: input.v1ReceiptOperationId,
      v2Action: input.v2ReceiptOperationId,
      v3Action: input.v3ReceiptOperationId,
    },
    protocolDigest: sha256(protocol),
    scenario: "evolution-breaking",
    sourceLineCounts: input.sourceLineCounts,
    sourceCommit,
    startedAt: input.startedAt,
  };
  await writeScenarioArtifact(repositoryRoot, "evolution-breaking", manifest);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
