import assert from "node:assert/strict";
import { constants } from "node:fs";
import { copyFile, cp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  requiredRuntimeProofAssertions,
  runtimeProofBodySchema,
  runtimeProofDescriptorSchema,
  runtimeProofEvidenceDigest,
} from "../verify-journey-runtime-proof.js";
import {
  buildManifest,
  proofRoot,
  proofRunId,
  repositoryRoot,
  work,
} from "./proof-config.js";
import type { ProofEvidence } from "./proof-contracts.js";
import {
  assertions,
  contexts,
  proofState,
  runningJourneys,
  runningPools,
  temporaryRoots,
} from "./proof-state.js";
import { assertSuitesClean, cleanupContext } from "./proof-cleanup.js";
import {
  contextsUnderSuite,
  maybeCurrentContextOf,
  rememberContext,
} from "./proof-contexts.js";
import {
  assertCleanProofSource,
  composeSentinel,
  executeSync,
  inspectionEnvironment,
  releaseProofReader,
} from "./proof-environment.js";
import { collectRejected, terminateTracked } from "./proof-process.js";
import {
  repositoryRelativePosix,
  sha256,
  writeJsonExclusively,
} from "./proof-support.js";

export async function snapshotProofEvidence(input: {
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

export async function publishRuntimeProof(
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

export async function teardownRuntimeProof(): Promise<unknown[]> {
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
  if (proofState.sentinelStarted) {
    try {
      composeSentinel("down", "--volumes", "--remove-orphans");
    } catch (error) {
      failures.push(error);
    }
  }
  if (proofState.alternateWorktree !== undefined) {
    try {
      executeSync(
        "/usr/bin/git",
        ["worktree", "remove", "--force", proofState.alternateWorktree],
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
