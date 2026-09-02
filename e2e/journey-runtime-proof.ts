import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  cp,
  link,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { createConnection, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  type JourneyRunContext,
} from "./journey-run-context.js";
import {
  journeyPortAt,
  journeyPortSlotCount,
  preferredJourneyPortSlot,
} from "./journey-runtime-layout.js";
import { publishedSuiteSchema } from "./published-evidence.js";
import {
  preparedBuildSnapshotSchema,
  requiredRuntimeProofAssertions,
  runtimeProofBodySchema,
  runtimeProofDescriptorSchema,
  runtimeProofEvidenceDigest,
} from "./verify-journey-runtime-proof.js";

type ChildOutcome =
  | { readonly error: Error; readonly kind: "error" }
  | {
      readonly code: number | null;
      readonly kind: "exit";
      readonly signal: NodeJS.Signals | null;
    };

type CapturedOutput = {
  readonly stderr: string[];
  readonly stdout: string[];
};

type TrackedProcess = {
  readonly abandon: () => void;
  readonly child: ChildProcess;
  readonly completion: Promise<ChildOutcome>;
  readonly isSettled: () => boolean;
  readonly output: CapturedOutput;
  readonly ownerNonce: string;
};

type RunningJourney = TrackedProcess & {
  readonly cwd: string;
  readonly pointer: string;
  readonly runId: string;
  readonly scenario: string;
};

type RunningPool = TrackedProcess & {
  readonly suiteId: string;
};

type ProofEvidence = {
  readonly aggregateManifest: ManifestReference;
  readonly buildIdentity: string;
  readonly preparedManifest: ManifestReference;
  readonly sourceCommit: string;
};

type ManifestReference = {
  readonly path: string;
  readonly sha256: string;
};

type RuntimeProofAssertion =
  (typeof requiredRuntimeProofAssertions)[number];

const childOutputLimit = 256 * 1024;
const commandTimeoutMilliseconds = 180_000;
const journeyTimeoutMilliseconds = 12 * 60_000;
const fullSuiteTimeoutMilliseconds = 45 * 60_000;
const gracefulTerminationMilliseconds = 120_000;
const proofIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const journeyStartupMarkerSchema = z
  .object({
    controllerPid: z.number().int().positive(),
    ownerNonce: z.string().regex(/^[0-9a-f]{64}$/),
    runId: z.string().min(1),
    stage: z.literal("journey-worker-ready"),
    workerPgid: z.number().int().positive(),
    workerPid: z.number().int().positive(),
  })
  .strict();
const repositoryRoot = await realpath(process.cwd());
const buildManifest = path.join(repositoryRoot, ".cache", "e2e", "prepared.json");
const proofOwnerNonce = proofFlag("--zoen-proof-owner-nonce");
const proofReaderToken = proofFlag("--zoen-proof-reader-token");
const proofRunId = requiredProofRunId();
const proofRoot = path.join(
  repositoryRoot,
  "artifacts",
  "runtime-proof",
  proofRunId,
);
const crashProofPath = requiredCrashProofPath();
const assertions: Record<string, true> = {};
const contexts: JourneyRunContext[] = [];
const runningJourneys = new Set<RunningJourney>();
const runningPools = new Set<RunningPool>();
const temporaryRoots: string[] = [];
const work = await mkdtemp(path.join(tmpdir(), "zoen-journey-runtime-proof-"));
const sentinelProject = `zoen-sentinel-${randomBytes(6).toString("hex")}`;
const sentinelCompose = path.join(work, "sentinel.yaml");
let alternateWorktree: string | undefined;
let sentinelStarted = false;

let proofEvidence: ProofEvidence | undefined;
let primaryFailure: unknown;
try {
  proofEvidence = await exerciseRuntime();
} catch (error) {
  primaryFailure = error;
}

const teardownFailures = await teardownRuntimeProof();
if (primaryFailure !== undefined || teardownFailures.length > 0) {
  throw new AggregateError(
    [primaryFailure, ...teardownFailures].filter(
      (error) => error !== undefined,
    ),
    "journey runtime proof or teardown failed",
  );
}
if (proofEvidence === undefined) {
  throw new Error("journey runtime proof completed without evidence");
}

const descriptorPath = await publishRuntimeProof(proofEvidence);
process.stdout.write(`${descriptorPath}\n`);

async function exerciseRuntime(): Promise<ProofEvidence> {
  assertCleanProofSource(repositoryRoot);
  await assertFreshProofRoot();
  await assertPreparationCrashProof();

  progress("proving controller startup crash convergence");
  const startupSuite = id("controller-startup");
  const startupBarrier = path.join(work, "controller-startup-barrier");
  const startup = startJourney({
    runId: "controller-startup-crash",
    scenario: "public-surface",
    startupBarrier,
    suiteId: startupSuite,
  });
  const startupMarker = journeyStartupMarkerSchema.parse(
    JSON.parse(
      await waitForFile(
        path.join(
          startupBarrier,
          "controller-startup-crash.journey-worker-ready.ready.json",
        ),
        20_000,
      ),
    ),
  );
  assert.equal(startupMarker.controllerPid, requiredPid(startup));
  assert.equal(startupMarker.ownerNonce, startup.ownerNonce);
  assert.equal(startupMarker.workerPid, startupMarker.workerPgid);
  assertOwnedProcess(
    startupMarker.workerPid,
    startup.ownerNonce,
    startupMarker.workerPgid,
  );
  assert.equal(await pathExists(startup.pointer), false);
  record("controllerStartupOwnsDetachedWorkerBeforeStart", true);
  await killControllerOnly(startup);
  await waitForProcessGroupEmpty(startupMarker.workerPgid, 20_000);
  await waitForTargetRegistryClean([startupSuite], 20_000);
  const startupContext = await maybeCurrentContextOf(startup);
  if (startupContext !== undefined) {
    rememberContext(startupContext);
  }
  await assertSuitesClean([startupSuite]);
  record("controllerStartupDeathLeavesNoOwnedRuntime", true);

  progress("proving occupied preferred port blocks are skipped");
  const occupiedPortSuite = id("occupied-port");
  const occupiedPort = await occupyPreferredSlotPort(
    occupiedPortSuite,
    "public-surface",
  );
  try {
    assert.equal(
      preferredJourneyPortSlot(
        occupiedPortSuite,
        "public-surface",
        occupiedPort.runId,
      ),
      occupiedPort.slot,
    );
    const occupiedPortJourney = startJourney({
      runId: occupiedPort.runId,
      scenario: "public-surface",
      suiteId: occupiedPortSuite,
    });
    await requireJourneySuccess(occupiedPortJourney);
    const occupiedPortContext = await completedContextOf(occupiedPortJourney);
    rememberContext(occupiedPortContext);
    record(
      "occupiedPreferredPortBlockIsSkipped",
      occupiedPortContext.lease.slot !== occupiedPort.slot,
    );
  } finally {
    await closeServer(occupiedPort.server);
  }

  await writeFileExclusive(
    sentinelCompose,
    [
      "services:",
      "  sentinel:",
      "    image: postgres:18",
      "    entrypoint: [/bin/sh, -c]",
      "    command: [sleep 1800]",
      "    labels:",
      "      zoen.e2e.sentinel: keep",
      "",
    ].join("\n"),
  );
  composeSentinel("up", "--detach");
  sentinelStarted = true;

  progress("proving stale claim recovery");
  const claimSuite = id("claim-crash");
  const claimBarrier = path.join(work, "claim-barrier");
  const claimRunId = "claim-crash-retry";
  const claimCrash = startJourney({
    runId: claimRunId,
    runtimeBarrier: claimBarrier,
    scenario: "public-surface",
    suiteId: claimSuite,
  });
  await waitForFile(
    path.join(claimBarrier, `${claimRunId}.claim-ready.ready.json`),
    120_000,
  );
  await killWithoutCleanup(claimCrash);
  const claimRetry = startJourney({
    runId: claimRunId,
    scenario: "public-surface",
    suiteId: claimSuite,
  });
  await requireJourneySuccess(claimRetry);
  const claimRetryContext = await completedContextOf(claimRetry);
  rememberContext(claimRetryContext);
  record("incompleteClaimIsReapedBeforeRetry", claimRetryContext.attempt > 1);

  progress("proving parallel isolation and overlapping logical retry");
  const failureSuite = id("failure-isolation");
  const barrier = path.join(work, "definition-barrier");
  await mkdir(barrier, { recursive: true });
  const interrupted = startJourney({
    barrier,
    runId: "definition-interrupted",
    scenario: "definition-publication",
    suiteId: failureSuite,
  });
  const sibling = startJourney({
    barrier,
    runId: "definition-sibling",
    scenario: "definition-publication",
    suiteId: failureSuite,
  });
  const interruptedContext = await waitForReady(interrupted, barrier);
  const siblingContext = await waitForReady(sibling, barrier);
  rememberContext(interruptedContext);
  rememberContext(siblingContext);
  verifyDistinctRuns(interruptedContext, siblingContext);
  const interruptedVolumes = composeVolumes(interruptedContext);
  const siblingVolumes = composeVolumes(siblingContext);
  record(
    "definitionRunsOwnDifferentVolumes",
    interruptedVolumes.length > 0 &&
      interruptedVolumes.every((volume) => !siblingVolumes.includes(volume)),
  );

  const logicalRunBarrier = path.join(work, "logical-run-active-barrier");
  const retry = startJourney({
    runId: interruptedContext.runId,
    runtimeBarrier: logicalRunBarrier,
    scenario: "definition-publication",
    suiteId: failureSuite,
  });
  const logicalRunMarker = z
    .object({
      ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
      runId: z.literal(interruptedContext.runId),
      stage: z.literal("logical-run-active"),
    })
    .strict()
    .parse(
      JSON.parse(
        await waitForFile(
          path.join(
            logicalRunBarrier,
            `${interruptedContext.runId}.logical-run-active.ready.json`,
          ),
          20_000,
        ),
      ),
    );
  assert.equal(logicalRunMarker.ownerToken, interruptedContext.lease.ownerToken);
  record(
    "sameRunIdRetryWaitsForPriorOwner",
    !retry.isSettled() && !(await pathExists(retry.pointer)),
  );
  record("sameRunIdRetryObservedActiveOwnerBeforeWaiting", true);
  assertOwnedProcess(
    interruptedContext.owner.pid,
    interruptedContext.owner.nonce,
    interruptedContext.owner.pgid,
  );
  process.kill(interruptedContext.owner.pid, "SIGKILL");
  await releaseRuntimeBarrier(
    interruptedContext.runId,
    logicalRunBarrier,
    "logical-run-active",
  );
  await releaseBarrier(siblingContext.runId, barrier);
  await Promise.all([
    requireJourneyFailure(interrupted),
    requireJourneySuccess(sibling),
    requireJourneySuccess(retry),
  ]);
  record("terminatedRunDidNotInterruptSibling", true);
  const retryContext = await completedContextOf(retry);
  rememberContext(retryContext);
  record(
    "sameRunIdRetryReconciledStaleOwnership",
    retryContext.attempt > interruptedContext.attempt,
  );

  progress("proving concurrent semantic journeys");
  const semanticSuite = id("semantic-pair");
  const semanticBarrier = path.join(work, "semantic-barrier");
  const semanticA = startJourney({
    barrier: semanticBarrier,
    runId: "semantic-a",
    scenario: "semantic-query",
    suiteId: semanticSuite,
  });
  const semanticB = startJourney({
    barrier: semanticBarrier,
    runId: "semantic-b",
    scenario: "semantic-query",
    suiteId: semanticSuite,
  });
  const semanticContexts = await Promise.all([
    waitForReady(semanticA, semanticBarrier),
    waitForReady(semanticB, semanticBarrier),
  ]);
  semanticContexts.forEach(rememberContext);
  await Promise.all(
    semanticContexts.map((context) =>
      releaseBarrier(context.runId, semanticBarrier),
    ),
  );
  await Promise.all([
    requireJourneySuccess(semanticA),
    requireJourneySuccess(semanticB),
  ]);
  record("sameSemanticScenarioRunsConcurrently", true);

  progress("proving allocator isolation across worktrees and TMPDIR values");
  alternateWorktree = path.join(work, "alternate-worktree");
  executeSync(
    "/usr/bin/git",
    ["worktree", "add", "--detach", alternateWorktree, "HEAD"],
    {
      cwd: repositoryRoot,
      environment: inspectionEnvironment(),
      timeout: 60_000,
    },
  );
  await linkPreparedInputs(alternateWorktree);
  const crossSuite = id("cross-worktree");
  const crossRunId = "same-logical-run";
  const primaryBarrier = path.join(work, "cross-primary-barrier");
  const alternateBarrier = path.join(work, "cross-alternate-barrier");
  const primaryTemp = await mkdtemp(path.join(tmpdir(), "zoen-primary-tmp-"));
  const alternateTemp = await mkdtemp(path.join(tmpdir(), "zoen-alternate-tmp-"));
  temporaryRoots.push(primaryTemp, alternateTemp);
  const primaryWorktreeRun = startJourney({
    barrier: primaryBarrier,
    runId: crossRunId,
    scenario: "definition-publication",
    suiteId: crossSuite,
    tempRoot: primaryTemp,
  });
  const alternateWorktreeRun = startJourney({
    barrier: alternateBarrier,
    cwd: alternateWorktree,
    runId: crossRunId,
    scenario: "definition-publication",
    suiteId: crossSuite,
    tempRoot: alternateTemp,
  });
  const [primaryContext, alternateContext] = await Promise.all([
    waitForReady(primaryWorktreeRun, primaryBarrier),
    waitForReady(alternateWorktreeRun, alternateBarrier),
  ]);
  rememberContext(primaryContext);
  rememberContext(alternateContext);
  verifyDistinctRuns(primaryContext, alternateContext);
  record("crossWorktreeTempRootsDiffer", primaryTemp !== alternateTemp);
  await Promise.all([
    releaseBarrier(primaryContext.runId, primaryBarrier),
    releaseBarrier(alternateContext.runId, alternateBarrier),
  ]);
  await Promise.all([
    requireJourneySuccess(primaryWorktreeRun),
    requireJourneySuccess(alternateWorktreeRun),
  ]);
  record("differentWorktreesShareAllocatorWithoutSharingState", true);

  progress("proving cleanup transition slot reservation and crash retry");
  const releaseSuite = id("release-crash");
  const releaseCrashBarrier = path.join(work, "release-crash-barrier");
  const releaseCrash = startJourney({
    releaseBarrier: releaseCrashBarrier,
    runId: "release-crash-retry",
    scenario: "public-surface",
    suiteId: releaseSuite,
  });
  await waitForFile(
    path.join(
      releaseCrashBarrier,
      "release-crash-retry.release-renamed.ready.json",
    ),
    120_000,
  );
  const releaseContext = await currentContextOf(releaseCrash);
  rememberContext(releaseContext);
  const transitionBarrier = path.join(work, "transition-sibling-barrier");
  const transitionRunId = collidingJourneyRunId(
    releaseSuite,
    "definition-publication",
    releaseContext.lease.slot,
  );
  assert.equal(
    preferredJourneyPortSlot(
      releaseSuite,
      "definition-publication",
      transitionRunId,
    ),
    releaseContext.lease.slot,
    "transition sibling does not actually prefer the reserved slot",
  );
  record("transitionalPreferredSlotCollisionIsDeterministic", true);
  const transitionSibling = startJourney({
    barrier: transitionBarrier,
    runId: transitionRunId,
    scenario: "definition-publication",
    suiteId: releaseSuite,
  });
  const transitionContext = await waitForReady(
    transitionSibling,
    transitionBarrier,
  );
  rememberContext(transitionContext);
  record(
    "transitionalSlotRemainsReservedDuringCleanup",
    transitionContext.lease.slot !== releaseContext.lease.slot,
  );
  await killWithoutCleanup(releaseCrash);
  await releaseBarrier(transitionContext.runId, transitionBarrier);
  await requireJourneySuccess(transitionSibling);
  await cleanupContext(releaseContext);
  await cleanupContext(releaseContext);
  record("releaseRenameCrashConvergesOnExactCleanupRetry", true);

  progress("proving four simultaneous Auth journeys");
  const fourSuite = id("four-auth-journeys");
  const fourBarrier = path.join(work, "four-auth-barrier");
  const four = [
    ["activation-identity", "activation"],
    ["definition-publication", "definition"],
    ["governed-action", "governed"],
    ["messaging-boundary", "messaging"],
  ].map(([scenario, runId]) =>
    startJourney({
      barrier: fourBarrier,
      runId: requiredString(runId),
      scenario: requiredString(scenario),
      suiteId: fourSuite,
    }),
  );
  const fourContexts = await Promise.all(
    four.map((journey) => waitForReady(journey, fourBarrier)),
  );
  fourContexts.forEach(rememberContext);
  await Promise.all(
    fourContexts.map((context) =>
      releaseBarrier(context.runId, fourBarrier),
    ),
  );
  await Promise.all(four.map((journey) => requireJourneySuccess(journey)));
  record("fourDifferentAuthJourneysRunConcurrently", true);

  progress("proving journey guardian loss is attributable and recoverable");
  const guardianSuite = id("guardian-loss");
  const guardianBarrier = path.join(work, "guardian-loss-barrier");
  const guardianRunId = "guardian-loss-retry";
  const guardianRun = startJourney({
    barrier: guardianBarrier,
    runId: guardianRunId,
    scenario: "definition-publication",
    suiteId: guardianSuite,
  });
  const guardianContext = await waitForReady(guardianRun, guardianBarrier);
  rememberContext(guardianContext);
  assertOwnedProcess(
    guardianContext.owner.guardianPid,
    guardianContext.owner.nonce,
    guardianContext.owner.pgid,
  );
  process.kill(guardianContext.owner.guardianPid, "SIGKILL");
  await requireJourneyFailure(guardianRun);
  record("guardianLossFailsWrapper", true);
  await waitForProcessGroupEmpty(guardianContext.owner.pgid, 30_000);
  record("guardianLossDrainsOwnedGroupBeforeRecovery", true);
  await assertContextClean(guardianContext);
  record("guardianLossCleanupConverges", true);
  const guardianRetry = startJourney({
    runId: guardianRunId,
    scenario: "definition-publication",
    suiteId: guardianSuite,
  });
  await requireJourneySuccess(guardianRetry);
  const guardianRetryContext = await completedContextOf(guardianRetry);
  rememberContext(guardianRetryContext);
  record(
    "guardianLossRetrySucceeds",
    guardianRetryContext.attempt > guardianContext.attempt,
  );

  progress("proving bounded pool cancellation cleanup");
  const cancelledPoolSuite = id("cancelled-pool");
  const poolBarrier = path.join(work, "pool-cancellation-barrier");
  const cancelledPool = startPool({
    barrier: poolBarrier,
    scenarios: ["definition-publication", "messaging-boundary"],
    suiteId: cancelledPoolSuite,
  });
  await waitForBarrierCount(poolBarrier, 2);
  signalTrackedPid(cancelledPool, "SIGTERM");
  const cancelledOutcome = await waitForTracked(
    cancelledPool,
    gracefulTerminationMilliseconds,
    "cancelled pool did not converge",
  );
  assertChildFailed(cancelledOutcome, "cancelled pool unexpectedly succeeded");
  runningPools.delete(cancelledPool);
  (await contextsUnderSuite(cancelledPoolSuite)).forEach(rememberContext);
  await assertSuitesClean([cancelledPoolSuite]);
  record("poolCancellationReconcilesDetachedRunners", true);

  progress("proving idempotent target-only cleanup");
  for (const context of contexts) {
    await cleanupContext(context);
    await cleanupContext(context);
  }
  record("cleanupIsSafeTwice", true);
  await assertSuitesClean([
    startupSuite,
    occupiedPortSuite,
    claimSuite,
    failureSuite,
    semanticSuite,
    crossSuite,
    releaseSuite,
    fourSuite,
    guardianSuite,
    cancelledPoolSuite,
  ]);
  record("ownedDockerAndListenerStateIsEmpty", true);
  record("sentinelComposeProjectSurvived", sentinelRunning());

  progress("running the bounded full live journey set");
  const fullSuite = id("bounded-full-suite");
  const fullPool = startPool({ scenarios: [], suiteId: fullSuite });
  let fullOutcome: ChildOutcome;
  try {
    fullOutcome = await waitForTracked(
      fullPool,
      fullSuiteTimeoutMilliseconds,
      "bounded full suite timed out",
    );
  } catch (error) {
    try {
      await terminateTracked(fullPool);
    } catch (terminationError) {
      throw new AggregateError(
        [errorFromUnknown(error), errorFromUnknown(terminationError)],
        "bounded full suite and cancellation failed",
      );
    }
    throw error;
  }
  assertChildSucceeded(fullOutcome, "bounded full suite failed", fullPool.output);
  runningPools.delete(fullPool);
  const aggregateSourcePath = parseSingleAbsolutePath(
    joined(fullPool.output.stdout),
    "bounded full suite",
  );
  const aggregateSourceReal = await realpath(aggregateSourcePath);
  assert.equal(aggregateSourceReal, aggregateSourcePath);
  assert.equal(path.basename(aggregateSourceReal), "suite.json");
  const generationsRoot = path.join(repositoryRoot, "artifacts", "generations");
  assertDirectChild(generationsRoot, path.dirname(aggregateSourceReal));
  const aggregate = publishedSuiteSchema.parse(
    JSON.parse(await readFile(aggregateSourceReal, "utf8")),
  );
  const sourceCommit = gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  const prepared = preparedBuildSnapshotSchema.parse(
    JSON.parse(await readFile(buildManifest, "utf8")),
  );
  const expectedScenarios = liveScenarioNames();
  const publishedScenarios = aggregate.runs.map((run) => run.scenario);
  record(
    "boundedSuitePublishedOneCompleteBuild",
    aggregate.status === "complete" &&
      aggregate.suiteId === fullSuite &&
      aggregate.sourceSha === sourceCommit &&
      aggregate.buildIdentity === prepared.buildIdentity,
  );
  record(
    "boundedSuitePublishedExactScenarioSet",
    sameStringSet(publishedScenarios, expectedScenarios),
  );
  await assertSuitesClean([fullSuite]);
  assertCleanProofSource(repositoryRoot);

  return snapshotProofEvidence({
    aggregateSourceRoot: path.dirname(aggregateSourceReal),
    buildIdentity: prepared.buildIdentity,
    sourceCommit,
  });
}

async function snapshotProofEvidence(input: {
  readonly aggregateSourceRoot: string;
  readonly buildIdentity: string;
  readonly sourceCommit: string;
}): Promise<ProofEvidence> {
  const preparedDestination = path.join(proofRoot, "prepared.json");
  const aggregateDestination = path.join(proofRoot, "aggregate");
  await copyFile(buildManifest, preparedDestination, constants.COPYFILE_EXCL);
  await cp(input.aggregateSourceRoot, aggregateDestination, {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
  const aggregateDestinationManifest = path.join(
    aggregateDestination,
    "suite.json",
  );
  return {
    aggregateManifest: {
      path: repositoryRelativePosix(aggregateDestinationManifest),
      sha256: sha256(await readFile(aggregateDestinationManifest)),
    },
    buildIdentity: input.buildIdentity,
    preparedManifest: {
      path: repositoryRelativePosix(preparedDestination),
      sha256: sha256(await readFile(preparedDestination)),
    },
    sourceCommit: input.sourceCommit,
  };
}

async function publishRuntimeProof(
  evidence: ProofEvidence,
): Promise<string> {
  assertCleanProofSource(repositoryRoot);
  assert.deepEqual(
    Object.keys(assertions).sort(),
    [...requiredRuntimeProofAssertions].sort(),
    "runtime proof did not produce its exact assertion set",
  );
  const body = runtimeProofBodySchema.parse({
    aggregateManifest: evidence.aggregateManifest,
    assertions,
    buildIdentity: evidence.buildIdentity,
    preparedManifest: evidence.preparedManifest,
    proofRunId,
    sourceCommit: evidence.sourceCommit,
    status: "passed",
    version: 1,
  });
  const descriptor = runtimeProofDescriptorSchema.parse({
    ...body,
    evidenceDigest: runtimeProofEvidenceDigest(body),
  });
  const descriptorPath = path.join(proofRoot, "proof.json");
  await writeJsonExclusively(descriptorPath, descriptor);
  return descriptorPath;
}

async function teardownRuntimeProof(): Promise<unknown[]> {
  const failures: unknown[] = [];
  const journeys = [...runningJourneys];
  const pools = [...runningPools];
  collectRejected(
    failures,
    await Promise.allSettled(journeys.map(terminateTracked)),
  );
  collectRejected(failures, await Promise.allSettled(pools.map(terminateTracked)));
  const discoveredContexts = await Promise.allSettled(
    journeys.map(maybeCurrentContextOf),
  );
  for (const result of discoveredContexts) {
    if (result.status === "rejected") {
      failures.push(result.reason);
    } else if (result.value !== undefined) {
      rememberContext(result.value);
    }
  }
  const discoveredPoolContexts = await Promise.allSettled(
    pools.map(async (pool) => {
      const found = await contextsUnderSuite(pool.suiteId);
      for (const context of found) {
        assert.equal(
          context.suiteId,
          pool.suiteId,
          `pool teardown found foreign suite ${context.suiteId}`,
        );
      }
      return found;
    }),
  );
  for (const result of discoveredPoolContexts) {
    if (result.status === "rejected") {
      failures.push(result.reason);
    } else {
      result.value.forEach(rememberContext);
    }
  }
  journeys.forEach((journey) => runningJourneys.delete(journey));
  pools.forEach((pool) => runningPools.delete(pool));
  collectRejected(
    failures,
    await Promise.allSettled(contexts.map(cleanupContext)),
  );
  const poolSuiteIds = [...new Set(pools.map((pool) => pool.suiteId))];
  if (poolSuiteIds.length > 0) {
    try {
      await assertSuitesClean(poolSuiteIds);
    } catch (error) {
      failures.push(error);
    }
  }
  if (sentinelStarted) {
    try {
      composeSentinel("down", "--volumes", "--remove-orphans");
    } catch (error) {
      failures.push(error);
    }
  }
  if (alternateWorktree !== undefined) {
    try {
      executeSync(
        "/usr/bin/git",
        ["worktree", "remove", "--force", alternateWorktree],
        {
          cwd: repositoryRoot,
          environment: inspectionEnvironment(),
          timeout: 60_000,
        },
      );
    } catch (error) {
      failures.push(error);
    }
  }
  for (const temporaryRoot of temporaryRoots) {
    try {
      await rm(temporaryRoot, { force: true, recursive: true });
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await rm(work, { force: true, recursive: true });
  } catch (error) {
    failures.push(error);
  }
  try {
    releaseProofReader();
  } catch (error) {
    failures.push(error);
  }
  return failures;
}

function startJourney(input: {
  readonly barrier?: string;
  readonly cwd?: string;
  readonly releaseBarrier?: string;
  readonly runId: string;
  readonly runtimeBarrier?: string;
  readonly scenario: string;
  readonly startupBarrier?: string;
  readonly suiteId: string;
  readonly tempRoot?: string;
}): RunningJourney {
  const cwd = input.cwd ?? repositoryRoot;
  const ownerNonce = randomBytes(32).toString("hex");
  const pointer = path.join(
    work,
    `${input.suiteId}-${input.scenario}-${input.runId}-${randomBytes(6).toString("hex")}.pointer`,
  );
  const tracked = startTracked({
    arguments: [
      "--zoen-script-owner-token",
      ownerNonce,
      "run",
      input.scenario,
    ],
    command: path.join(cwd, "e2e", "run.sh"),
    cwd,
    environment: cleanEnvironment({
      ...(input.barrier === undefined
        ? {}
        : { ZOEN_E2E_BARRIER_DIR: input.barrier }),
      ...(input.releaseBarrier === undefined
        ? {}
        : { ZOEN_E2E_RUNTIME_RELEASE_BARRIER_DIR: input.releaseBarrier }),
      ...(input.runtimeBarrier === undefined
        ? {}
        : { ZOEN_E2E_RUNTIME_BARRIER_DIR: input.runtimeBarrier }),
      ...(input.startupBarrier === undefined
        ? {}
        : { ZOEN_E2E_JOURNEY_STARTUP_BARRIER_DIR: input.startupBarrier }),
      ...(input.tempRoot === undefined ? {} : { TMPDIR: input.tempRoot }),
      ZOEN_E2E_BUILD_MANIFEST: buildManifest,
      ZOEN_E2E_CONTEXT_POINTER: pointer,
      ZOEN_E2E_RUN_ID: input.runId,
      ZOEN_E2E_SUITE_ID: input.suiteId,
    }),
    ownerNonce,
  });
  const journey: RunningJourney = {
    ...tracked,
    cwd,
    pointer,
    runId: input.runId,
    scenario: input.scenario,
  };
  runningJourneys.add(journey);
  return journey;
}

function startPool(input: {
  readonly barrier?: string;
  readonly scenarios: readonly string[];
  readonly suiteId: string;
}): RunningPool {
  const ownerNonce = randomBytes(32).toString("hex");
  const tracked = startTracked({
    arguments: [
      "--zoen-script-owner-token",
      ownerNonce,
      "parallel",
      ...input.scenarios,
    ],
    command: path.join(repositoryRoot, "e2e", "run.sh"),
    cwd: repositoryRoot,
    environment: cleanEnvironment({
      ...(input.barrier === undefined
        ? {}
        : { ZOEN_E2E_BARRIER_DIR: input.barrier }),
      ZOEN_E2E_BUILD_MANIFEST: buildManifest,
      ZOEN_E2E_SUITE_ID: input.suiteId,
    }),
    forwardStderr: input.scenarios.length === 0,
    ownerNonce,
  });
  const pool: RunningPool = { ...tracked, suiteId: input.suiteId };
  runningPools.add(pool);
  return pool;
}

function startTracked(input: {
  readonly arguments: readonly string[];
  readonly command: string;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly forwardStderr?: boolean;
  readonly ownerNonce: string;
}): TrackedProcess {
  const child = spawn(input.command, input.arguments, {
    cwd: input.cwd,
    detached: true,
    env: input.environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: CapturedOutput = { stderr: [], stdout: [] };
  child.stdout?.on("data", (chunk: Buffer) =>
    appendOutput(output.stdout, chunk),
  );
  child.stderr?.on("data", (chunk: Buffer) => {
    appendOutput(output.stderr, chunk);
    if (input.forwardStderr === true) {
      process.stderr.write(chunk);
    }
  });
  let settled = false;
  const completion = new Promise<ChildOutcome>((resolve) => {
    child.once("error", (error) => {
      settled = true;
      resolve({ error, kind: "error" });
    });
    child.once("exit", (code, signal) => {
      settled = true;
      resolve({ code, kind: "exit", signal });
    });
  });
  return {
    abandon: () => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (child.connected) {
        child.disconnect();
      }
      child.unref();
    },
    child,
    completion,
    isSettled: () => settled,
    output,
    ownerNonce: input.ownerNonce,
  };
}

async function requireJourneySuccess(journey: RunningJourney): Promise<void> {
  let outcome: ChildOutcome;
  try {
    outcome = await waitForTracked(
      journey,
      journeyTimeoutMilliseconds,
      `${journey.scenario}/${journey.runId} timed out`,
    );
  } catch (error) {
    try {
      await terminateTracked(journey);
    } catch (terminationError) {
      throw new AggregateError(
        [errorFromUnknown(error), errorFromUnknown(terminationError)],
        `${journey.scenario}/${journey.runId} timed out and teardown failed`,
      );
    }
    throw error;
  }
  assertChildSucceeded(
    outcome,
    `${journey.scenario}/${journey.runId} failed`,
    journey.output,
  );
  runningJourneys.delete(journey);
}

async function requireJourneyFailure(journey: RunningJourney): Promise<void> {
  const outcome = await waitForTracked(
    journey,
    gracefulTerminationMilliseconds,
    `${journey.scenario}/${journey.runId} did not fail after authority loss`,
  );
  assertChildFailed(outcome, `${journey.scenario}/${journey.runId} succeeded`);
  runningJourneys.delete(journey);
}

async function killWithoutCleanup(journey: RunningJourney): Promise<void> {
  const pid = requiredPid(journey);
  assertOwnedProcess(pid, journey.ownerNonce, pid);
  process.kill(-pid, "SIGKILL");
  const outcome = await waitForTracked(
    journey,
    20_000,
    `${journey.scenario}/${journey.runId} survived SIGKILL`,
  );
  assertChildFailed(outcome, "killed journey unexpectedly succeeded");
  runningJourneys.delete(journey);
}

async function killControllerOnly(journey: RunningJourney): Promise<void> {
  const pid = requiredPid(journey);
  assertOwnedProcess(pid, journey.ownerNonce, pid);
  process.kill(pid, "SIGKILL");
  const outcome = await waitForTracked(
    journey,
    20_000,
    `${journey.scenario}/${journey.runId} controller survived SIGKILL`,
  );
  assertChildFailed(outcome, "killed journey controller unexpectedly succeeded");
  runningJourneys.delete(journey);
}

async function terminateTracked(process_: TrackedProcess): Promise<void> {
  if (process_.isSettled()) {
    await process_.completion;
    process_.abandon();
    return;
  }
  const pid = requiredPid(process_);
  try {
    assertOwnedProcess(pid, process_.ownerNonce, pid);
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    await delay(25);
    if (process_.isSettled()) {
      await process_.completion;
      process_.abandon();
      return;
    }
    if (!isNoSuchProcess(error)) {
      throw error;
    }
  }
  try {
    await withTimeout(
      process_.completion,
      gracefulTerminationMilliseconds,
      `owned process group ${pid} did not stop after SIGTERM`,
    );
    process_.abandon();
    return;
  } catch (primaryError) {
    try {
      assertOwnedProcess(pid, process_.ownerNonce, pid);
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (!isNoSuchProcess(error)) {
        throw new AggregateError(
          [errorFromUnknown(primaryError), errorFromUnknown(error)],
          `owned process group ${pid} could not be terminated`,
        );
      }
    }
    try {
      await withTimeout(
        process_.completion,
        20_000,
        `owned process group ${pid} survived SIGKILL`,
      );
      process_.abandon();
    } catch (killTimeout) {
      let ownershipAfterKill: Error;
      try {
        assertOwnedProcess(pid, process_.ownerNonce, pid);
        ownershipAfterKill = new Error(
          `process ${pid} remains verifiably owned after SIGKILL`,
        );
      } catch (error) {
        ownershipAfterKill = new Error(
          `process ${pid} completion handle remained open after ownership changed: ${errorFromUnknown(error).message}`,
        );
      }
      process_.abandon();
      throw new AggregateError(
        [errorFromUnknown(primaryError), errorFromUnknown(killTimeout), ownershipAfterKill],
        `owned process group ${pid} did not settle after bounded teardown`,
      );
    }
  }
}

function collectRejected(
  failures: unknown[],
  results: readonly PromiseSettledResult<unknown>[],
): void {
  for (const result of results) {
    if (result.status === "rejected") {
      failures.push(result.reason);
    }
  }
}

function signalTrackedPid(
  process_: TrackedProcess,
  signal: NodeJS.Signals,
): void {
  const pid = requiredPid(process_);
  assertOwnedProcess(pid, process_.ownerNonce, pid);
  process.kill(pid, signal);
}

async function waitForTracked(
  process_: TrackedProcess,
  milliseconds: number,
  message: string,
): Promise<ChildOutcome> {
  return withTimeout(
    process_.completion,
    milliseconds,
    `${message}:\n${formatOutput(process_.output)}`,
  );
}

function assertChildSucceeded(
  outcome: ChildOutcome,
  message: string,
  output: CapturedOutput,
): void {
  if (outcome.kind === "error") {
    throw new Error(`${message}: ${outcome.error.message}\n${formatOutput(output)}`);
  }
  assert.equal(
    outcome.code,
    0,
    `${message} (${outcome.signal ?? outcome.code}):\n${formatOutput(output)}`,
  );
}

function assertChildFailed(outcome: ChildOutcome, message: string): void {
  if (outcome.kind === "error") {
    return;
  }
  assert.notEqual(outcome.code, 0, message);
}

async function contextOf(
  journey: RunningJourney,
  minimumAttempt = 1,
): Promise<JourneyRunContext> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const pointer = journeyContextPointerSchema.parse(
        JSON.parse(await readFile(journey.pointer, "utf8")),
      );
      if (pointer.attempt >= minimumAttempt) {
        return journeyRunContextSchema.parse(
          JSON.parse(await readFile(pointer.contextFile, "utf8")),
        );
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    if (journey.isSettled()) {
      const outcome = await journey.completion;
      throw new Error(
        `${journey.scenario}/${journey.runId} exited before publishing context (${childOutcomeText(outcome)}):\n${formatOutput(journey.output)}`,
      );
    }
    await delay(100);
  }
  throw new Error(
    `timed out waiting for ${journey.pointer} at attempt ${minimumAttempt}`,
  );
}

async function currentContextOf(
  journey: RunningJourney,
): Promise<JourneyRunContext> {
  const pointer = journeyContextPointerSchema.parse(
    JSON.parse(await readFile(journey.pointer, "utf8")),
  );
  return journeyRunContextSchema.parse(
    JSON.parse(await readFile(pointer.contextFile, "utf8")),
  );
}

async function maybeCurrentContextOf(
  journey: RunningJourney,
): Promise<JourneyRunContext | undefined> {
  try {
    return await currentContextOf(journey);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

async function completedContextOf(
  journey: RunningJourney,
): Promise<JourneyRunContext> {
  const contextPath = executeSync(
    path.join(repositoryRoot, "e2e", "run.sh"),
    ["resolve-pointer", journey.pointer],
    {
      cwd: repositoryRoot,
      environment: cleanEnvironment({}),
      timeout: 30_000,
    },
  ).stdout.trim();
  return journeyRunContextSchema.parse(
    JSON.parse(await readFile(contextPath, "utf8")),
  );
}

async function waitForReady(
  journey: RunningJourney,
  barrier: string,
): Promise<JourneyRunContext> {
  const context = await contextOf(journey);
  await waitForFile(
    path.join(barrier, `${context.runId}.auth-ready.ready.json`),
    journeyTimeoutMilliseconds,
  );
  return context;
}

async function releaseBarrier(runId: string, barrier: string): Promise<void> {
  await writeFileExclusive(
    path.join(barrier, `${runId}.auth-ready.release`),
    "release\n",
  );
}

async function releaseRuntimeBarrier(
  runId: string,
  barrier: string,
  stage: string,
): Promise<void> {
  await writeFileExclusive(
    path.join(barrier, `${runId}.${stage}.release`),
    "release\n",
  );
}

async function waitForFile(
  filePath: string,
  milliseconds: number,
): Promise<string> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${filePath}`);
}

async function waitForBarrierCount(
  directory: string,
  count: number,
): Promise<void> {
  const deadline = Date.now() + journeyTimeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const ready = (await readdir(directory)).filter((entry) =>
        entry.endsWith(".auth-ready.ready.json"),
      );
      if (ready.length >= count) {
        return;
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${count} barriers in ${directory}`);
}

async function contextsUnderSuite(
  suiteId: string,
): Promise<JourneyRunContext[]> {
  const suiteRoot = path.join(repositoryRoot, ".cache", "e2e", "suites", suiteId);
  let entries;
  try {
    entries = await readdir(suiteRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  const found: JourneyRunContext[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".pointer")) {
      continue;
    }
    const pointer = journeyContextPointerSchema.parse(
      JSON.parse(await readFile(path.join(suiteRoot, entry.name), "utf8")),
    );
    const context = journeyRunContextSchema.parse(
      JSON.parse(await readFile(pointer.contextFile, "utf8")),
    );
    assert.equal(
      context.suiteId,
      suiteId,
      `suite pointer ${entry.name} resolves to foreign suite ${context.suiteId}`,
    );
    if (
      !found.some(
        (candidate) => candidate.lease.ownerToken === context.lease.ownerToken,
      )
    ) {
      found.push(context);
    }
  }
  return found;
}

function rememberContext(context: JourneyRunContext): void {
  if (
    !contexts.some(
      (candidate) => candidate.lease.ownerToken === context.lease.ownerToken,
    )
  ) {
    contexts.push(context);
  }
}

function assertOwnedProcess(
  pid: number,
  ownerNonce: string,
  expectedPgid: number,
): void {
  const inspected = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "pgid=,command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: inspectionEnvironment(),
      killSignal: "SIGKILL",
      timeout: 5_000,
    },
  );
  assert.equal(
    inspected.error,
    undefined,
    `cannot inspect owned process ${pid}: ${inspected.error?.message}`,
  );
  assert.equal(inspected.status, 0, `cannot inspect owned process ${pid}`);
  const match = /^\s*([0-9]+)\s+(.*)$/.exec(inspected.stdout.trim());
  assert.ok(match?.[1] !== undefined && match[2] !== undefined);
  assert.equal(Number(match[1]), expectedPgid);
  assert.ok(match[2].includes(ownerNonce));
}

async function waitForOwnedProcess(process_: TrackedProcess): Promise<void> {
  const deadline = Date.now() + 5_000;
  const pid = requiredPid(process_);
  while (Date.now() < deadline) {
    try {
      assertOwnedProcess(pid, process_.ownerNonce, pid);
      return;
    } catch (error) {
      if (process_.isSettled()) {
        throw error;
      }
    }
    await delay(10);
  }
  throw new Error(`process ${pid} did not publish its exact command authority`);
}

function requiredPid(process_: TrackedProcess): number {
  const pid = process_.child.pid;
  assert.ok(pid !== undefined, "owned child has no pid");
  return pid;
}

async function waitForProcessGroupEmpty(
  pgid: number,
  milliseconds: number,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (processGroupMembers(pgid).length === 0) {
      return;
    }
    await delay(100);
  }
  throw new Error(`process group ${pgid} did not become empty`);
}

function processGroupMembers(pgid: number): number[] {
  const inspected = spawnSync("/bin/ps", ["-axo", "pid=,pgid="], {
    encoding: "utf8",
    env: inspectionEnvironment(),
    killSignal: "SIGKILL",
    timeout: 5_000,
  });
  assert.equal(
    inspected.error,
    undefined,
    `cannot inspect process group ${pgid}: ${inspected.error?.message}`,
  );
  assert.equal(inspected.status, 0, `cannot inspect process group ${pgid}`);
  return inspected.stdout.split("\n").flatMap((line) => {
    const match = /^\s*([0-9]+)\s+([0-9]+)\s*$/.exec(line);
    return match?.[1] !== undefined && Number(match[2]) === pgid
      ? [Number(match[1])]
      : [];
  });
}

function verifyDistinctRuns(a: JourneyRunContext, b: JourneyRunContext): void {
  assert.equal(a.scenario, b.scenario);
  record("composeProjectsDiffer", composeProject(a) !== composeProject(b));
  record("portSlotsDiffer", a.lease.slot !== b.lease.slot);
  record("authOriginsDiffer", a.ports.auth !== b.ports.auth);
  record("runRootsDiffer", a.paths.runRoot !== b.paths.runRoot);
  record("artifactPathsDiffer", a.paths.artifacts !== b.paths.artifacts);
}

function composeProject(context: JourneyRunContext): string {
  if (context.compose.kind !== "compose") {
    throw new Error(`${context.scenario} has no Compose project`);
  }
  return context.compose.project;
}

function composeVolumes(context: JourneyRunContext): string[] {
  const output = executeSync(
    "docker",
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${composeProject(context)}`,
      "--format",
      "{{.Name}}",
    ],
    { timeout: 30_000 },
  ).stdout;
  return output.split("\n").filter(Boolean);
}

async function cleanupContext(context: JourneyRunContext): Promise<void> {
  executeSync(
    path.join(repositoryRoot, "e2e", "run.sh"),
    ["cleanup", path.join(context.paths.runRoot, "context.json")],
    {
      cwd: repositoryRoot,
      environment: cleanEnvironment({}),
      timeout: commandTimeoutMilliseconds,
    },
  );
}

async function assertSuitesClean(suiteIds: readonly string[]): Promise<void> {
  const selectedContexts = contexts.filter((context) =>
    suiteIds.includes(context.suiteId),
  );
  for (const context of selectedContexts) {
    await assertContextClean(context);
  }
  for (const suiteId of suiteIds) {
    for (const resource of ["ps", "network", "volume"] as const) {
      const arguments_ =
        resource === "ps"
          ? [
              "ps",
              "--all",
              "--filter",
              `label=zoen.e2e.suite=${suiteId}`,
              "--quiet",
            ]
          : [
              resource,
              "ls",
              "--filter",
              `label=zoen.e2e.suite=${suiteId}`,
              "--quiet",
            ];
      const output = executeSync("docker", arguments_, {
        timeout: 30_000,
      }).stdout;
      assert.equal(output.trim(), "", `${resource} resources remain for ${suiteId}`);
    }
  }

  const reconciliationText = executeSync(
    path.join(repositoryRoot, "e2e", "run.sh"),
    ["reconcile"],
    {
      cwd: repositoryRoot,
      environment: cleanEnvironment({}),
      timeout: commandTimeoutMilliseconds,
    },
  ).stdout;
  const reconciliation = z
    .object({
      leases: z.array(
        z
          .object({
            runId: z.string(),
            scenario: z.string(),
            suiteId: z.string(),
          })
          .passthrough(),
      ),
      uncertain: z.boolean(),
    })
    .strict()
    .parse(JSON.parse(reconciliationText));
  assert.equal(
    reconciliation.leases.some((lease) => suiteIds.includes(lease.suiteId)),
    false,
    "reconciliation still reports a target suite lease",
  );
  const targetEntries = await targetRegistryEntries(suiteIds, selectedContexts);
  assert.deepEqual(
    targetEntries,
    [],
    `target suite registry state remains: ${targetEntries.join(", ")}`,
  );
  const ports = new Set(
    selectedContexts.flatMap((context) => Object.values(context.ports)),
  );
  for (const port of ports) {
    assert.equal(await portOpen(port), false, `listener remains on leased port ${port}`);
  }
}

async function waitForTargetRegistryClean(
  suiteIds: readonly string[],
  milliseconds: number,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if ((await targetRegistryEntries(suiteIds, [])).length === 0) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `target registry did not self-clean: ${(await targetRegistryEntries(suiteIds, [])).join(", ")}`,
  );
}

async function targetRegistryEntries(
  suiteIds: readonly string[],
  selectedContexts: readonly JourneyRunContext[],
): Promise<string[]> {
  const slotsRoot = path.join(runtimeRegistryRoot(), "slots");
  let entries;
  try {
    entries = await readdir(slotsRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  const ownerTokens = new Set(
    selectedContexts.map((context) => context.lease.ownerToken),
  );
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(slotsRoot, entry.name);
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path.join(directory, "lease.json"), "utf8"));
    } catch (error) {
      if (isMissingFile(error)) {
        if (
          [...ownerTokens].some((token) =>
            entry.name.includes(token.slice(0, 16)),
          )
        ) {
          matches.push(entry.name);
        }
        continue;
      }
      throw error;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid lease in ${directory}`);
    }
    const suiteId = Reflect.get(value, "suiteId");
    const ownerToken = Reflect.get(value, "ownerToken");
    if (
      (typeof suiteId === "string" && suiteIds.includes(suiteId)) ||
      (typeof ownerToken === "string" && ownerTokens.has(ownerToken))
    ) {
      matches.push(entry.name);
    }
  }
  return matches.sort();
}

async function assertContextClean(context: JourneyRunContext): Promise<void> {
  const targetEntries = await targetRegistryEntries([context.suiteId], [context]);
  assert.deepEqual(
    targetEntries,
    [],
    `lease state remains for ${context.scenario}/${context.runId}`,
  );
  const cleanup: unknown = JSON.parse(
    await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8"),
  );
  assert.ok(cleanup !== null && typeof cleanup === "object" && !Array.isArray(cleanup));
  assert.equal(Reflect.get(cleanup, "ownerToken"), context.lease.ownerToken);
  assert.equal(Reflect.get(cleanup, "status"), "clean");
  const metadataPath = path.join(context.paths.process, "scenario.json");
  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) {
      return;
    }
    throw error;
  }
  assert.ok(
    metadata !== null && typeof metadata === "object" && !Array.isArray(metadata),
  );
  const pgid = Reflect.get(metadata, "pgid");
  const groupCleanToken = Reflect.get(metadata, "groupCleanToken");
  assert.ok(typeof pgid === "number" && Number.isInteger(pgid) && pgid > 0);
  assert.match(requiredStringValue(groupCleanToken), /^[0-9a-f]{64}$/);
  const receipt: unknown = JSON.parse(
    await readFile(path.join(context.paths.process, "group-clean.json"), "utf8"),
  );
  assert.ok(receipt !== null && typeof receipt === "object" && !Array.isArray(receipt));
  assert.equal(Reflect.get(receipt, "ownerToken"), context.lease.ownerToken);
  assert.equal(Reflect.get(receipt, "groupCleanToken"), groupCleanToken);
  assert.equal(Reflect.get(receipt, "pgid"), pgid);
  assert.equal(Reflect.get(receipt, "status"), "group-empty");
  assert.deepEqual(processGroupMembers(pgid), []);
}

function runtimeRegistryRoot(): string {
  const common = gitOutput(repositoryRoot, ["rev-parse", "--git-common-dir"]);
  return path.resolve(repositoryRoot, common, "zoen-e2e", "runtime-v1");
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (open_: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open_);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function occupyPreferredSlotPort(
  suiteId: string,
  scenario: string,
): Promise<{
  readonly runId: string;
  readonly server: Server;
  readonly slot: number;
}> {
  const attemptedSlots = new Set<number>();
  for (let candidate = 0; candidate < journeyPortSlotCount * 16; candidate += 1) {
    const runId = `occupied-port-${candidate}`;
    const slot = preferredJourneyPortSlot(suiteId, scenario, runId);
    if (attemptedSlots.has(slot)) {
      continue;
    }
    attemptedSlots.add(slot);
    if (await slotIsReserved(slot)) {
      continue;
    }
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.once("listening", resolve);
        server.listen({
          exclusive: true,
          host: "127.0.0.1",
          port: journeyPortAt(slot, 0),
        });
      });
      server.unref();
      if (await slotIsReserved(slot)) {
        await closeServer(server);
        continue;
      }
      return { runId, server, slot };
    } catch (error) {
      if (!isAddressInUse(error)) {
        throw error;
      }
    }
  }
  throw new Error("could not find an available preferred slot proof port");
}

async function slotIsReserved(slot: number): Promise<boolean> {
  const basename = String(slot).padStart(4, "0");
  const slotsRoot = path.join(runtimeRegistryRoot(), "slots");
  try {
    return (await readdir(slotsRoot, { withFileTypes: true })).some(
      (entry) =>
        entry.isDirectory() &&
        (entry.name === basename ||
          entry.name.startsWith(`.claim-${basename}-`) ||
          entry.name.startsWith(`.reaping-${basename}-`) ||
          entry.name.startsWith(`.release-${basename}-`)),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "EADDRINUSE"
  );
}

async function linkPreparedInputs(worktree: string): Promise<void> {
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
  assertCleanProofSource(worktree);
}

function cleanEnvironment(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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

function proofFlag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  assert.ok(value !== undefined && /^[0-9a-f]{64}$/.test(value), `${name} is invalid`);
  return value;
}

function requiredProofRunId(): string {
  const value = process.env.ZOEN_E2E_PROOF_RUN_ID;
  assert.ok(
    value !== undefined && value.length <= 80 && proofIdPattern.test(value),
    "ZOEN_E2E_PROOF_RUN_ID is invalid",
  );
  return value;
}

function requiredCrashProofPath(): string {
  const value = process.env.ZOEN_E2E_PREPARE_CRASH_PROOF;
  assert.ok(value !== undefined && value !== "");
  return path.resolve(value);
}

async function assertFreshProofRoot(): Promise<void> {
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

function assertCleanProofSource(repository: string): void {
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

async function assertPreparationCrashProof(): Promise<void> {
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

function releaseProofReader(): void {
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

function gitOutput(repository: string, arguments_: readonly string[]): string {
  return executeSync("/usr/bin/git", arguments_, {
    cwd: repository,
    environment: { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    timeout: 10_000,
  }).stdout.trim();
}

function liveScenarioNames(): string[] {
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

function inspectionEnvironment(): NodeJS.ProcessEnv {
  return { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" };
}

function sentinelRunning(): boolean {
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

function composeSentinel(...arguments_: string[]): void {
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

function executeSync(
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

async function withTimeout<Value>(
  promise: Promise<Value>,
  milliseconds: number,
  message: string,
): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function record(name: RuntimeProofAssertion, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = true;
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

function collidingJourneyRunId(
  suiteId: string,
  scenario: string,
  slot: number,
): string {
  assert.ok(slot >= 0 && slot < journeyPortSlotCount);
  for (let candidate = 0; candidate < journeyPortSlotCount * 32; candidate += 1) {
    const runId = `transition-collision-${candidate}`;
    if (preferredJourneyPortSlot(suiteId, scenario, runId) === slot) {
      return runId;
    }
  }
  throw new Error(`could not enumerate a run id for preferred slot ${slot}`);
}

function requiredString(value: string | undefined): string {
  assert.ok(value !== undefined);
  return value;
}

function requiredStringValue(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new Error("expected a non-empty string");
  }
  return value;
}

function appendOutput(output: string[], chunk: Buffer): void {
  output.push(chunk.toString());
  while (joined(output).length > childOutputLimit) {
    output.shift();
  }
}

function joined(output: readonly string[]): string {
  return output.join("");
}

function formatOutput(output: CapturedOutput): string {
  return [joined(output.stdout), joined(output.stderr)].filter(Boolean).join("\n");
}

function parseSingleAbsolutePath(output: string, label: string): string {
  const withoutNewline = output.endsWith("\n") ? output.slice(0, -1) : output;
  assert.ok(
    withoutNewline !== "" &&
      !withoutNewline.includes("\n") &&
      !withoutNewline.includes("\r") &&
      path.isAbsolute(withoutNewline),
    `${label} did not emit exactly one absolute path: ${JSON.stringify(output)}`,
  );
  return withoutNewline;
}

function repositoryRelativePosix(candidate: string): string {
  const relative = path.relative(repositoryRoot, candidate);
  assert.ok(
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${candidate} is outside ${repositoryRoot}`,
  );
  return relative.split(path.sep).join(path.posix.sep);
}

function assertDirectChild(parent: string, candidate: string): void {
  const relative = path.relative(parent, candidate);
  assert.ok(
    relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      path.dirname(relative) === ".",
    `${candidate} is not one immutable generation below ${parent}`,
  );
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  return (
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  );
}

async function writeFileExclusive(outputPath: string, value: string): Promise<void> {
  const handle = await open(outputPath, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJsonExclusively(
  outputPath: string,
  value: unknown,
): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new Error(`${outputPath} could not be serialized`);
  }
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFileExclusive(temporary, `${serialized}\n`);
  try {
    await link(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function sha256(value: NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(value).digest("hex");
}

function childOutcomeText(outcome: ChildOutcome): string {
  return outcome.kind === "error"
    ? outcome.error.message
    : String(outcome.signal ?? outcome.code);
}

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ENOENT"
  );
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ESRCH"
  );
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

function progress(message: string): void {
  process.stderr.write(`[runtime-proof] ${message}\n`);
}
