import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildManifest,
  gracefulTerminationMilliseconds,
  journeyTimeoutMilliseconds,
  repositoryRoot,
  work,
} from "./proof-config.js";
import type {
  CapturedOutput,
  ChildOutcome,
  RunningJourney,
  RunningPool,
  TrackedProcess,
} from "./proof-contracts.js";
import { runningJourneys, runningPools } from "./proof-state.js";
import {
  assertOwnedProcess,
  releaseBarrier,
  requiredPid,
} from "./proof-contexts.js";
import { cleanEnvironment, inspectionEnvironment } from "./proof-environment.js";
import {
  appendOutput,
  errorFromUnknown,
  formatOutput,
  isNoSuchProcess,
  withTimeout,
} from "./proof-support.js";
import type { RuntimeProofBarrierStage } from "./runtime-contracts.js";

export function startJourney(input: {
  readonly barrier?: string;
  readonly cwd?: string;
  readonly preparedInputSource?: string;
  readonly releaseBarrier?: string;
  readonly runId: string;
  readonly runtimeBarrier?: {
    readonly directory: string;
    readonly stage: RuntimeProofBarrierStage;
  };
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
        : {
            ZOEN_E2E_RUNTIME_BARRIER_DIR: input.runtimeBarrier.directory,
            ZOEN_E2E_RUNTIME_BARRIER_STAGE: input.runtimeBarrier.stage,
          }),
      ...(input.startupBarrier === undefined
        ? {}
        : { ZOEN_E2E_JOURNEY_STARTUP_BARRIER_DIR: input.startupBarrier }),
      ...(input.preparedInputSource === undefined
        ? {}
        : { ZOEN_E2E_PREPARED_INPUT_SOURCE: input.preparedInputSource }),
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

export function startPool(input: {
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

export function startTracked(input: {
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

export async function requireJourneySuccess(journey: RunningJourney): Promise<void> {
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

export async function requireJourneyFailure(journey: RunningJourney): Promise<void> {
  const outcome = await waitForTracked(
    journey,
    gracefulTerminationMilliseconds,
    `${journey.scenario}/${journey.runId} did not fail after authority loss`,
  );
  assertChildFailed(outcome, `${journey.scenario}/${journey.runId} succeeded`);
  runningJourneys.delete(journey);
}

export async function killWithoutCleanup(journey: RunningJourney): Promise<void> {
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

export async function killControllerOnly(journey: RunningJourney): Promise<void> {
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

export async function terminateTracked(process_: TrackedProcess): Promise<void> {
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

export function collectRejected(
  failures: unknown[],
  results: readonly PromiseSettledResult<unknown>[],
): void {
  for (const result of results) {
    if (result.status === "rejected") {
      failures.push(result.reason);
    }
  }
}

export function signalTrackedPid(
  process_: TrackedProcess,
  signal: NodeJS.Signals,
): void {
  const pid = requiredPid(process_);
  assertOwnedProcess(pid, process_.ownerNonce, pid);
  process.kill(pid, signal);
}

export async function waitForTracked(
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

export function assertChildSucceeded(
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

export function assertChildFailed(outcome: ChildOutcome, message: string): void {
  if (outcome.kind === "error") {
    return;
  }
  assert.notEqual(outcome.code, 0, message);
}
