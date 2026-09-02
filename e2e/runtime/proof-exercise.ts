import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { preferredJourneyPortSlot } from "../journey-runtime-layout.js";
import { publishedSuiteSchema } from "../published-evidence.js";
import { preparedBuildSnapshotSchema } from "../verify-journey-runtime-proof.js";
import {
  buildManifest,
  fullSuiteTimeoutMilliseconds,
  gracefulTerminationMilliseconds,
  repositoryRoot,
  sentinelCompose,
  work,
} from "./proof-config.js";
import { journeyStartupMarkerSchema, type ChildOutcome, type ProofEvidence } from "./proof-contracts.js";
import { contexts, proofState, runningPools, temporaryRoots } from "./proof-state.js";
import {
  assertChildFailed,
  assertChildSucceeded,
  killControllerOnly,
  killWithoutCleanup,
  requireJourneyFailure,
  requireJourneySuccess,
  signalTrackedPid,
  startJourney,
  startPool,
  terminateTracked,
  waitForTracked,
} from "./proof-process.js";
import {
  assertOwnedProcess,
  completedContextOf,
  composeVolumes,
  contextsUnderSuite,
  currentContextOf,
  maybeCurrentContextOf,
  rememberContext,
  releaseBarrier,
  releaseRuntimeBarrier,
  requiredPid,
  verifyDistinctRuns,
  waitForBarrierCount,
  waitForFile,
  waitForOwnedProcess,
  waitForProcessGroupEmpty,
  waitForReady,
} from "./proof-contexts.js";
import {
  assertContextClean,
  assertSuitesClean,
  cleanupContext,
  closeServer,
  occupyPreferredSlotPort,
  waitForTargetRegistryClean,
} from "./proof-cleanup.js";
import {
  assertCleanProofSource,
  assertFreshProofRoot,
  assertPreparationCrashProof,
  composeSentinel,
  executeSync,
  gitOutput,
  inspectionEnvironment,
  linkPreparedInputs,
  liveScenarioNames,
  sentinelRunning,
} from "./proof-environment.js";
import { snapshotProofEvidence } from "./proof-lifecycle.js";
import {
  assertDirectChild,
  childOutcomeText,
  collidingJourneyRunId,
  errorFromUnknown,
  id,
  joined,
  parseSingleAbsolutePath,
  pathExists,
  progress,
  record,
  requiredString,
  sameStringSet,
  writeFileExclusive,
} from "./proof-support.js";

export async function exerciseRuntime(): Promise<ProofEvidence> {
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
  proofState.sentinelStarted = true;

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
  proofState.alternateWorktree = path.join(work, "alternate-worktree");
  executeSync(
    "/usr/bin/git",
    ["worktree", "add", "--detach", proofState.alternateWorktree, "HEAD"],
    {
      cwd: repositoryRoot,
      environment: inspectionEnvironment(),
      timeout: 60_000,
    },
  );
  await linkPreparedInputs(proofState.alternateWorktree);
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
    cwd: proofState.alternateWorktree,
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
