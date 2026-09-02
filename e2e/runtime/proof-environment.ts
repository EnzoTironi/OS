import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  commandTimeoutMilliseconds,
  crashProofPath,
  proofOwnerNonce,
  proofReaderToken,
  proofRoot,
  repositoryRoot,
  sentinelCompose,
  sentinelProject,
} from "./proof-config.js";
import { isMissingFile, record } from "./proof-support.js";

export async function linkPreparedInputs(worktree: string): Promise<void> {
  assertCleanProofSource(worktree);
  for (const name of ["dist", "node_modules", "target"] as const) {
    await symlink(path.join(repositoryRoot, name), path.join(worktree, name), "dir");
  }
  await symlink(
    path.join(repositoryRoot, "apps", "auth", "node_modules"),
    path.join(worktree, "apps", "auth", "node_modules"),
    "dir",
  );
  await symlink(
    path.join(repositoryRoot, "apps", "auth", "dist"),
    path.join(worktree, "apps", "auth", "dist"),
    "dir",
  );
}

export function cleanEnvironment(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("ZOEN_E2E_") && value !== undefined) {
      environment[name] = value;
    }
  }
  return {
    ...environment,
    ZOEN_E2E_SUITE_READER_TOKEN: proofReaderToken,
    ...extra,
  };
}


export async function assertFreshProofRoot(): Promise<void> {
  const resolvedRoot = await realpath(proofRoot);
  assert.equal(resolvedRoot, proofRoot, "runtime proof root must not traverse a symlink");
  assert.equal(
    crashProofPath,
    path.join(proofRoot, "prepare-crash-proof.json"),
    "preparation crash marker must be unique and proof-local",
  );
  const entries = await readdir(proofRoot);
  assert.deepEqual(
    entries.sort(),
    ["prepare-crash-proof.json"],
    "runtime proof root was already used",
  );
}

export function assertCleanProofSource(repository: string): void {
  const dirty = gitOutput(repository, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  assert.equal(
    dirty,
    "",
    `journey runtime proof requires a clean exact-HEAD worktree:\n${dirty}`,
  );
}

export async function assertPreparationCrashProof(): Promise<void> {
  const markerSchema = z
    .object({
      activationReconcileCrashRecovered: z.literal(true),
      artifactMutationInvalidatedPreparedBuild: z.literal(true),
      contextTamperingRejectedBeforeEffects: z.literal(true),
      controllerCrashRecovered: z.literal(true),
      guardianCrashRecovered: z.literal(true),
      manifestInvalidationProved: z.literal(true),
      provedAt: z.string().datetime(),
      version: z.literal(1),
      workerCrashRecovered: z.literal(true),
    })
    .strict();
  const marker = markerSchema.parse(
    JSON.parse(await readFile(crashProofPath, "utf8")),
  );
  record(
    "preparationSurvivesControllerCrashAndReleasesWriter",
    marker.controllerCrashRecovered,
  );
  record(
    "artifactMutationInvalidatesPreparedBuild",
    marker.artifactMutationInvalidatedPreparedBuild,
  );
  record(
    "contextTamperingRejectedBeforeEffects",
    marker.contextTamperingRejectedBeforeEffects,
  );
  record(
    "preparationGuardianReapsKilledWorkerBeforeRetry",
    marker.workerCrashRecovered,
  );
  record(
    "preparationGuardianCrashReconcilesWriter",
    marker.guardianCrashRecovered,
  );
  record(
    "preparationActivationReconcileCrashRecovered",
    marker.activationReconcileCrashRecovered,
  );
  record(
    "preparationInvalidatesManifestBeforeWork",
    marker.manifestInvalidationProved,
  );
}

export function releaseProofReader(): void {
  executeSync(
    process.execPath,
    [
      path.join(repositoryRoot, "e2e", "prepare-lock.mjs"),
      "reader-release",
      "--reader-token",
      proofReaderToken,
      "--owner-pid",
      String(process.pid),
      "--owner-nonce",
      proofOwnerNonce,
    ],
    {
      cwd: repositoryRoot,
      environment: process.env,
      timeout: 30_000,
    },
  );
}

export function gitOutput(repository: string, arguments_: readonly string[]): string {
  return executeSync("/usr/bin/git", arguments_, {
    cwd: repository,
    environment: { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    timeout: 10_000,
  }).stdout.trim();
}

export function liveScenarioNames(): string[] {
  const output = executeSync(
    process.execPath,
    [path.join(repositoryRoot, "e2e", "scenario-registry.mjs"), "names", "live"],
    { cwd: repositoryRoot, timeout: 10_000 },
  ).stdout;
  const names = output.trim().split(/\s+/).filter(Boolean);
  assert.ok(names.length > 0, "live scenario registry is empty");
  assert.equal(new Set(names).size, names.length, "live scenario registry has duplicates");
  return names;
}

export function inspectionEnvironment(): NodeJS.ProcessEnv {
  return { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" };
}

export function sentinelRunning(): boolean {
  const output = executeSync(
    "docker",
    [
      "compose",
      "--project-name",
      sentinelProject,
      "--file",
      sentinelCompose,
      "ps",
      "--quiet",
    ],
    { timeout: 30_000 },
  ).stdout;
  return output.trim() !== "";
}

export function composeSentinel(...arguments_: string[]): void {
  executeSync(
    "docker",
    [
      "compose",
      "--project-name",
      sentinelProject,
      "--file",
      sentinelCompose,
      ...arguments_,
    ],
    { timeout: commandTimeoutMilliseconds },
  );
}

export function executeSync(
  command: string,
  arguments_: readonly string[],
  options: {
    readonly cwd?: string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly timeout: number;
  },
): { readonly stderr: string; readonly stdout: string } {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.environment ?? process.env,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} failed (${String(result.status)}): ${result.error?.message ?? ""}\n${result.stderr}`,
    );
  }
  return { stderr: result.stderr, stdout: result.stdout };
}
