import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import canonicalize from "canonicalize";
import { z } from "zod";
import { publishedSuiteSchema } from "./published-evidence.js";

const sourceCommitSchema = z
  .string()
  .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const proofRelativePathSchema = z.string().refine((value) => {
  if (
    value === "" ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value
  ) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "" && segment !== "..");
}, "must be a normalized repository-relative POSIX path");
const preparedArtifactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bundle"),
      path: proofRelativePathSchema,
      sha256: digestSchema,
    })
    .strict(),
  z
    .object({
      executable: z.literal(true),
      kind: z.literal("launchable"),
      path: proofRelativePathSchema,
      sha256: digestSchema,
    })
    .strict(),
]);

export const requiredRuntimeProofAssertions = [
  "artifactPathsDiffer",
  "artifactMutationInvalidatesPreparedBuild",
  "authOriginsDiffer",
  "boundedSuitePublishedExactScenarioSet",
  "boundedSuitePublishedOneCompleteBuild",
  "cleanupIsSafeTwice",
  "composeProjectsDiffer",
  "contextTamperingRejectedBeforeEffects",
  "controllerStartupDeathLeavesNoOwnedRuntime",
  "controllerStartupOwnsDetachedWorkerBeforeStart",
  "crossWorktreeTempRootsDiffer",
  "definitionRunsOwnDifferentVolumes",
  "differentWorktreesShareAllocatorWithoutSharingState",
  "fourDifferentAuthJourneysRunConcurrently",
  "guardianLossCleanupConverges",
  "guardianLossDrainsOwnedGroupBeforeRecovery",
  "guardianLossFailsWrapper",
  "guardianLossRetrySucceeds",
  "incompleteClaimIsReapedBeforeRetry",
  "occupiedPreferredPortBlockIsSkipped",
  "ownedDockerAndListenerStateIsEmpty",
  "poolCancellationReconcilesDetachedRunners",
  "portSlotsDiffer",
  "preparationGuardianReapsKilledWorkerBeforeRetry",
  "preparationGuardianCrashReconcilesWriter",
  "preparationActivationReconcileCrashRecovered",
  "preparationInvalidatesManifestBeforeWork",
  "preparationSurvivesControllerCrashAndReleasesWriter",
  "releaseRenameCrashConvergesOnExactCleanupRetry",
  "runRootsDiffer",
  "sameRunIdRetryReconciledStaleOwnership",
  "sameRunIdRetryObservedActiveOwnerBeforeWaiting",
  "sameRunIdRetryWaitsForPriorOwner",
  "sameSemanticScenarioRunsConcurrently",
  "sentinelComposeProjectSurvived",
  "terminatedRunDidNotInterruptSibling",
  "transitionalSlotRemainsReservedDuringCleanup",
  "transitionalPreferredSlotCollisionIsDeterministic",
] as const;

export const runtimeProofManifestReferenceSchema = z
  .object({
    path: proofRelativePathSchema,
    sha256: digestSchema,
  })
  .strict();

export const preparedBuildSnapshotSchema = z
  .object({
    artifacts: z.array(preparedArtifactSchema).min(1),
    buildIdentity: digestSchema,
    preparedAt: z.string().datetime(),
    sourceSha: sourceCommitSchema,
    version: z.literal(2),
  })
  .strict();

export const runtimeProofBodySchema = z
  .object({
    aggregateManifest: runtimeProofManifestReferenceSchema,
    assertions: z.record(z.string().min(1), z.literal(true)),
    buildIdentity: digestSchema,
    preparedManifest: runtimeProofManifestReferenceSchema,
    proofRunId: idSchema,
    sourceCommit: sourceCommitSchema,
    status: z.literal("passed"),
    version: z.literal(1),
  })
  .strict();

export const runtimeProofDescriptorSchema = runtimeProofBodySchema
  .extend({ evidenceDigest: digestSchema })
  .strict();

export type RuntimeProofBody = z.infer<typeof runtimeProofBodySchema>;
export type RuntimeProofDescriptor = z.infer<
  typeof runtimeProofDescriptorSchema
>;

export function runtimeProofEvidenceDigest(value: RuntimeProofBody): string {
  const serialized = canonicalize(value);
  if (serialized === undefined) {
    throw new Error("runtime proof body cannot be canonicalized");
  }
  return sha256(Buffer.from(serialized, "utf8"));
}

type Cli = {
  readonly expectedSource: string;
  readonly proof: string;
  readonly readerOwnerNonce: string;
  readonly readerToken: string;
};

async function main(cli: Cli): Promise<void> {
  const repositoryRoot = await repositoryRootOfCurrentProcess();
  const expectedSource = sourceCommitSchema.parse(cli.expectedSource);
  const head = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  assert.equal(head, expectedSource, "expected source does not match checked-out HEAD");
  assertCleanExactSource(repositoryRoot);

  const proofArgument = path.resolve(cli.proof);
  const proofPath = await realpath(proofArgument);
  assert.equal(proofPath, proofArgument, "proof descriptor must not traverse a symlink");
  const proofBytes = await readFile(proofPath);
  const unparsed: unknown = JSON.parse(proofBytes.toString("utf8"));
  const descriptor = runtimeProofDescriptorSchema.parse(unparsed);
  const proofRoot = path.dirname(proofPath);
  const expectedProofRoot = path.join(
    repositoryRoot,
    "artifacts",
    "runtime-proof",
    descriptor.proofRunId,
  );
  assert.equal(
    proofRoot,
    expectedProofRoot,
    "proof descriptor is not in its declared immutable proof root",
  );
  assert.equal(path.basename(proofPath), "proof.json");
  assert.equal(descriptor.sourceCommit, expectedSource);

  const body = runtimeProofBodySchema.parse({
    aggregateManifest: descriptor.aggregateManifest,
    assertions: descriptor.assertions,
    buildIdentity: descriptor.buildIdentity,
    preparedManifest: descriptor.preparedManifest,
    proofRunId: descriptor.proofRunId,
    sourceCommit: descriptor.sourceCommit,
    status: descriptor.status,
    version: descriptor.version,
  });
  assert.equal(
    descriptor.evidenceDigest,
    runtimeProofEvidenceDigest(body),
    "runtime proof evidence digest does not match its canonical body",
  );
  assertExactAssertions(descriptor.assertions);

  const expectedPreparedRelative = path.posix.join(
    "artifacts",
    "runtime-proof",
    descriptor.proofRunId,
    "prepared.json",
  );
  const expectedAggregateRelative = path.posix.join(
    "artifacts",
    "runtime-proof",
    descriptor.proofRunId,
    "aggregate",
    "suite.json",
  );
  assert.equal(descriptor.preparedManifest.path, expectedPreparedRelative);
  assert.equal(descriptor.aggregateManifest.path, expectedAggregateRelative);

  const preparedPath = await confinedProofFile({
    proofRoot,
    reference: descriptor.preparedManifest.path,
    repositoryRoot,
  });
  const aggregatePath = await confinedProofFile({
    proofRoot,
    reference: descriptor.aggregateManifest.path,
    repositoryRoot,
  });
  const preparedBytes = await readFile(preparedPath);
  const aggregateBytes = await readFile(aggregatePath);
  assert.equal(sha256(preparedBytes), descriptor.preparedManifest.sha256);
  assert.equal(sha256(aggregateBytes), descriptor.aggregateManifest.sha256);

  const prepared = preparedBuildSnapshotSchema.parse(
    JSON.parse(preparedBytes.toString("utf8")),
  );
  const aggregate = publishedSuiteSchema.parse(
    JSON.parse(aggregateBytes.toString("utf8")),
  );
  assert.equal(prepared.sourceSha, expectedSource);
  assertPreparedBuildIdentity(prepared);
  assert.equal(aggregate.sourceSha, expectedSource);
  assert.equal(prepared.buildIdentity, descriptor.buildIdentity);
  assert.equal(aggregate.buildIdentity, descriptor.buildIdentity);

  const liveScenarios = await registeredLiveScenarioNames(repositoryRoot);
  const aggregateScenarios = aggregate.runs.map((run) => run.scenario);
  assert.deepEqual(
    [...aggregateScenarios].sort(),
    [...liveScenarios].sort(),
    "aggregate does not contain the exact registered live scenario set",
  );
  assert.equal(
    new Set(aggregateScenarios).size,
    aggregateScenarios.length,
    "aggregate contains duplicate scenarios",
  );
  assert.equal(
    new Set(aggregate.runs.map((run) => run.runId)).size,
    aggregate.runs.length,
    "aggregate contains duplicate run IDs",
  );
  await verifyAggregateTree({
    aggregateRoot: path.dirname(aggregatePath),
    buildIdentity: descriptor.buildIdentity,
    runs: aggregate.runs,
    sourceCommit: expectedSource,
    suiteId: aggregate.suiteId,
  });

  await writeTextAtomically(
    `${proofPath}.sha256`,
    `${sha256(proofBytes)}  proof.json\n`,
  );
}

function assertPreparedBuildIdentity(
  prepared: z.infer<typeof preparedBuildSnapshotSchema>,
): void {
  const paths = prepared.artifacts.map((artifact) => artifact.path);
  assert.deepEqual(
    paths,
    [...paths].sort((left, right) => left.localeCompare(right, "en")),
    "prepared artifact paths are not sorted",
  );
  assert.equal(
    new Set(paths).size,
    paths.length,
    "prepared artifact paths are not unique",
  );
  const launchables = prepared.artifacts
    .filter((artifact) => artifact.kind === "launchable")
    .map((artifact) => artifact.path)
    .sort();
  assert.deepEqual(launchables, [
    "target/debug/zoen",
    "target/debug/zoen-effect-dispatcher",
    "target/debug/zoen-http-connector",
    "target/debug/zoen-projection",
  ]);
  const bundles = prepared.artifacts.filter(
    (artifact) => artifact.kind === "bundle",
  );
  assert.ok(
    bundles.some((artifact) => artifact.path.startsWith("dist/")),
    "prepared root dist is empty",
  );
  assert.ok(
    bundles.some((artifact) => artifact.path.startsWith("apps/auth/dist/")),
    "prepared Auth dist is empty",
  );
  assert.ok(
    bundles.every(
      (artifact) =>
        artifact.path.startsWith("dist/") ||
        artifact.path.startsWith("apps/auth/dist/"),
    ),
    "prepared manifest contains an unexpected bundle root",
  );
  const identity = canonicalize({
    artifacts: prepared.artifacts,
    sourceSha: prepared.sourceSha,
    version: prepared.version,
  });
  assert.notEqual(identity, undefined);
  assert.equal(
    prepared.buildIdentity,
    sha256(Buffer.from(identity ?? "", "utf8")),
    "prepared build identity is not bound to its exact artifacts",
  );
}

function parseCli(arguments_: readonly string[]): Cli {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      (name !== "--expected-source" &&
        name !== "--proof" &&
        name !== "--zoen-reader-owner-nonce" &&
        name !== "--zoen-reader-token") ||
      value === undefined ||
      values.has(name)
    ) {
      throw new Error(
        "usage: verify-journey-runtime-proof --proof PATH --expected-source SHA --zoen-reader-token TOKEN --zoen-reader-owner-nonce NONCE",
      );
    }
    values.set(name, value);
  }
  const proof = values.get("--proof");
  const expectedSource = values.get("--expected-source");
  const readerToken = values.get("--zoen-reader-token");
  const readerOwnerNonce = values.get("--zoen-reader-owner-nonce");
  if (
    proof === undefined ||
    expectedSource === undefined ||
    readerToken === undefined ||
    readerOwnerNonce === undefined ||
    values.size !== 4
  ) {
    throw new Error(
      "usage: verify-journey-runtime-proof --proof PATH --expected-source SHA --zoen-reader-token TOKEN --zoen-reader-owner-nonce NONCE",
    );
  }
  return {
    expectedSource,
    proof,
    readerOwnerNonce: digestSchema.parse(readerOwnerNonce),
    readerToken: digestSchema.parse(readerToken),
  };
}

function releaseReader(cli: Cli): void {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "e2e", "prepare-lock.mjs"),
      "reader-release",
      "--reader-token",
      cli.readerToken,
      "--owner-pid",
      String(process.pid),
      "--owner-nonce",
      cli.readerOwnerNonce,
    ],
    commandOptions(),
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `failed to release runtime proof verifier reader: ${result.error?.message ?? result.stderr}`,
    );
  }
}

async function repositoryRootOfCurrentProcess(): Promise<string> {
  const result = spawnSync(
    "/usr/bin/git",
    ["-C", process.cwd(), "rev-parse", "--show-toplevel"],
    commandOptions(),
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `cannot resolve current repository: ${result.error?.message ?? result.stderr}`,
    );
  }
  return realpath(result.stdout.trim());
}

function assertCleanExactSource(repositoryRoot: string): void {
  const dirty = gitText(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  assert.equal(
    dirty,
    "",
    `runtime proof source is not clean exact HEAD:\n${dirty}`,
  );
}

function assertExactAssertions(assertions: Readonly<Record<string, true>>): void {
  assert.deepEqual(
    Object.keys(assertions).sort(),
    [...requiredRuntimeProofAssertions].sort(),
    "runtime proof assertion set is incomplete or contains unknown claims",
  );
}

async function confinedProofFile(input: {
  readonly proofRoot: string;
  readonly reference: string;
  readonly repositoryRoot: string;
}): Promise<string> {
  const lexical = path.resolve(input.repositoryRoot, input.reference);
  const resolved = await realpath(lexical);
  assert.equal(resolved, lexical, `${input.reference} must not traverse a symlink`);
  assertContained(input.proofRoot, resolved, input.reference);
  return resolved;
}

function assertContained(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  assert.ok(
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} escapes ${root}`,
  );
}

async function registeredLiveScenarioNames(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const value: unknown = JSON.parse(
    await readFile(path.join(repositoryRoot, "e2e", "scenarios.json"), "utf8"),
  );
  const registry = z
    .array(
      z
        .object({
          class: z.enum(["credential", "live", "static"]),
          name: idSchema,
        })
        .passthrough(),
    )
    .parse(value);
  const live = registry
    .filter((scenario) => scenario.class === "live")
    .map((scenario) => scenario.name);
  assert.equal(new Set(live).size, live.length, "live scenario registry has duplicates");
  assert.ok(live.length > 0, "live scenario registry is empty");
  return live;
}

async function verifyAggregateTree(input: {
  readonly aggregateRoot: string;
  readonly buildIdentity: string;
  readonly runs: readonly {
    readonly attempt: number;
    readonly runId: string;
    readonly scenario: string;
  }[];
  readonly sourceCommit: string;
  readonly suiteId: string;
}): Promise<void> {
  const root = await realpath(input.aggregateRoot);
  assert.equal(root, input.aggregateRoot, "aggregate root must not traverse a symlink");
  const entries = await readdir(root, { withFileTypes: true });
  const expectedNames = ["suite.json", ...input.runs.map((run) => run.scenario)].sort();
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    expectedNames,
    "aggregate root contains an incomplete or foreign scenario tree",
  );
  for (const run of input.runs) {
    const scenarioRoot = path.join(root, run.scenario);
    const scenarioRootReal = await realpath(scenarioRoot);
    assert.equal(scenarioRootReal, scenarioRoot);
    assertContained(root, scenarioRootReal, run.scenario);
    await assertRegularTree(root, scenarioRootReal);
    const primaryPath = path.join(scenarioRootReal, `${run.scenario}.json`);
    const primaryReal = await realpath(primaryPath);
    assert.equal(primaryReal, primaryPath);
    const primary: unknown = JSON.parse(await readFile(primaryReal, "utf8"));
    const evidence = z
      .object({
        journeyRun: z
          .object({
            attempt: z.number().int().positive(),
            buildIdentity: digestSchema,
            runId: idSchema,
            suiteId: idSchema,
          })
          .strict(),
        sourceCommit: sourceCommitSchema,
      })
      .passthrough()
      .parse(primary);
    assert.equal(evidence.sourceCommit, input.sourceCommit);
    assert.equal(evidence.journeyRun.attempt, run.attempt);
    assert.equal(evidence.journeyRun.buildIdentity, input.buildIdentity);
    assert.equal(evidence.journeyRun.runId, run.runId);
    assert.equal(evidence.journeyRun.suiteId, input.suiteId);
  }
}

async function assertRegularTree(root: string, directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  assert.ok(entries.length > 0, `${directory} is empty`);
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `${candidate} is a symbolic link`);
    if (entry.isDirectory()) {
      const resolved = await realpath(candidate);
      assert.equal(resolved, candidate);
      assertContained(root, resolved, candidate);
      await assertRegularTree(root, resolved);
      continue;
    }
    assert.ok(entry.isFile(), `${candidate} is not a regular file`);
    const resolved = await realpath(candidate);
    assert.equal(resolved, candidate);
    assertContained(root, resolved, candidate);
  }
}

async function writeTextAtomically(outputPath: string, value: string): Promise<void> {
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, outputPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function gitText(repositoryRoot: string, arguments_: readonly string[]): string {
  const result = spawnSync(
    "/usr/bin/git",
    ["-C", repositoryRoot, ...arguments_],
    commandOptions(),
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function commandOptions(): {
  readonly encoding: "utf8";
  readonly env: NodeJS.ProcessEnv;
  readonly killSignal: "SIGKILL";
  readonly timeout: number;
} {
  return {
    encoding: "utf8",
    env: { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    killSignal: "SIGKILL",
    timeout: 10_000,
  };
}

function sha256(value: NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const cli = parseCli(process.argv.slice(2));
  let commandFailure: unknown;
  try {
    await main(cli);
  } catch (error) {
    commandFailure = error;
  }
  let readerReleaseFailure: unknown;
  try {
    releaseReader(cli);
  } catch (error) {
    readerReleaseFailure = error;
  }
  if (commandFailure !== undefined || readerReleaseFailure !== undefined) {
    throw new AggregateError(
      [commandFailure, readerReleaseFailure].filter(
        (error) => error !== undefined,
      ),
      "runtime proof verification failed",
    );
  }
}
