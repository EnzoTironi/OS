import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  adminClient,
  repositoryRoot,
  tenantA,
} from "./support.js";

export interface MutantKills {
  activationBeforeMigration: boolean;
  classifierIgnoresActionMeaning: boolean;
  historicalResolutionUsesLatest: boolean;
  impactGraphMissesDependencies: boolean;
  migrationReplayDuplicates: boolean;
  oldRowUpdatedInPlace: boolean;
  rollbackDeletesNewHistory: boolean;
}

const sourceFiles: readonly string[] = [
  "crates/zoen-engine/src/lib.rs",
  "crates/zoen-engine/src/evolution.rs",
  "crates/zoen-engine/src/migration.rs",
  "crates/zoen-adapters/src/lib.rs",
  "e2e/evolution-breaking.ts",
];

export function createMutantKills(): MutantKills {
  return {
    activationBeforeMigration: false,
    classifierIgnoresActionMeaning: false,
    historicalResolutionUsesLatest: false,
    impactGraphMissesDependencies: false,
    migrationReplayDuplicates: false,
    oldRowUpdatedInPlace: false,
    rollbackDeletesNewHistory: false,
  };
}

export function assertMutantsKilled(mutants: MutantKills): void {
  const results: ReadonlyArray<readonly [string, boolean]> = [
    ["activationBeforeMigration", mutants.activationBeforeMigration],
    ["classifierIgnoresActionMeaning", mutants.classifierIgnoresActionMeaning],
    [
      "historicalResolutionUsesLatest",
      mutants.historicalResolutionUsesLatest,
    ],
    [
      "impactGraphMissesDependencies",
      mutants.impactGraphMissesDependencies,
    ],
    ["migrationReplayDuplicates", mutants.migrationReplayDuplicates],
    ["oldRowUpdatedInPlace", mutants.oldRowUpdatedInPlace],
    ["rollbackDeletesNewHistory", mutants.rollbackDeletesNewHistory],
  ];
  for (const [name, killed] of results) {
    assert.equal(killed, true, `mutant survived: ${name}`);
  }
}

export async function sourceLineCountsUnderLimit(): Promise<
  Record<string, number>
> {
  const counts: Record<string, number> = {};
  for (const file of sourceFiles) {
    const source = await readFile(path.join(repositoryRoot, file), "utf8");
    const lineCount = source.split("\n").length - 1;
    assert.ok(lineCount < 1_000, `${file} has ${lineCount} lines`);
    counts[file] = lineCount;
  }
  return counts;
}

export async function expectConnectCode(
  operation: () => Promise<unknown>,
  expected: Code,
): Promise<boolean> {
  try {
    await operation();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
  }
  return true;
}

export async function migrationAuthorityCommitCount(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM authority_commits
     WHERE tenant_id = $1
       AND commit_kind IN (
         'definition_migration_plan',
         'definition_migration_batch'
       )`,
    [tenantA],
  );
  return Number(result.rows[0]?.count);
}

export async function rejectImmutableHistoryUpdate(
  admin: ReturnType<typeof adminClient>,
  v1Digest: string,
): Promise<boolean> {
  return admin
    .query(
      `UPDATE semantic_claims
       SET value_text = 'rewritten'
       WHERE tenant_id = $1 AND definition_digest = $2`,
      [tenantA, v1Digest],
    )
    .then(
      () => false,
      (error: unknown) =>
        /semantic history and projection manifests are immutable/.test(
          String(error),
        ),
    );
}

export async function rejectLaterOperationDelete(
  admin: ReturnType<typeof adminClient>,
  operationId: string,
): Promise<boolean> {
  const rejected = await admin
    .query(
      `DELETE FROM action_operations
       WHERE tenant_id = $1 AND operation_id = $2`,
      [tenantA, operationId],
    )
    .then(
      () => false,
      (error: unknown) =>
        /Action proposals, approvals, and operations are immutable/.test(
          String(error),
        ),
    );
  const remaining = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM action_operations
     WHERE tenant_id = $1 AND operation_id = $2`,
    [tenantA, operationId],
  );
  return rejected && remaining.rows[0]?.count === "1";
}

export async function usesSingleAuthorityLedger(
  admin: ReturnType<typeof adminClient>,
): Promise<boolean> {
  return (await migrationAuthorityCommitCount(admin)) >= 6;
}
