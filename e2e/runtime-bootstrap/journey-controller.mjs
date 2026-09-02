import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { pathExists, writeJsonAtomically } from "./atomic-state.mjs";
import { flag, nonce, scriptPath } from "./command-line.mjs";
import {
  canonicalJourneyAuthority,
  journeyCleanupAuthorityTimeoutMilliseconds,
  journeyId,
} from "./journey-contract.mjs";
import {
  abandonChild,
  armAuthorityChild,
  childCompletion,
  deadline,
  signalOwnedGroup,
  terminateOwnedAuthority,
  waitForEmptyGroup,
} from "./process-authority.mjs";

export async function runJourneyController() {
  const ownerNonce = nonce(flag("--owner-nonce"));
  const scenario = journeyId(flag("--scenario"));
  const repository = await realpath(process.cwd());
  const externalPointer = process.env.ZOEN_E2E_CONTEXT_POINTER;
  const pointer =
    externalPointer === undefined || externalPointer === ""
      ? path.join(
          repository,
          ".cache",
          "e2e",
          "controllers",
          `${ownerNonce}.pointer.json`,
        )
      : path.resolve(repository, externalPointer);
  await mkdir(path.dirname(pointer), { recursive: true });
  const worker = spawn(
    process.execPath,
    [
      scriptPath,
      "journey-worker",
      "--owner-nonce",
      ownerNonce,
      "--scenario",
      scenario,
      "--pointer",
      pointer,
    ],
    {
      cwd: repository,
      detached: true,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    },
  );
  const completion = childCompletion(worker);
  const workerPid = worker.pid;
  if (workerPid === undefined) {
    const outcome = await completion;
    throw outcome.error ?? new Error("failed to start journey authority worker");
  }
  let canonicalContextFile;
  const captureContext = (message) => {
    if (
      message !== null &&
      typeof message === "object" &&
      message.kind === "journey-context-ready" &&
      message.ownerNonce === ownerNonce &&
      typeof message.contextFile === "string"
    ) {
      canonicalContextFile = path.resolve(message.contextFile);
    }
  };
  worker.on("message", captureContext);
  await armAuthorityChild(
    worker,
    completion,
    ownerNonce,
    "journey-worker",
    "journey authority worker",
    () => reachJourneyStartupBarrier(workerPid, ownerNonce),
  );
  let interrupted = false;
  let activeAuthority = { nonce: ownerNonce, pgid: workerPid };
  let cancellationRequested;
  const cancellation = new Promise((resolve) => {
    cancellationRequested = resolve;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      interrupted = true;
      cancellationRequested();
      const signaledAuthority = { ...activeAuthority };
      try {
        signalOwnedGroup(
          signaledAuthority.pgid,
          signaledAuthority.nonce,
          signal,
        );
      } catch (error) {
        process.stderr.write(`cannot signal journey authority: ${String(error)}\n`);
        process.exitCode = 1;
      }
      const escalation = setTimeout(() => {
        try {
          signalOwnedGroup(
            signaledAuthority.pgid,
            signaledAuthority.nonce,
            "SIGKILL",
          );
        } catch (error) {
          process.stderr.write(`cannot kill journey authority: ${String(error)}\n`);
          process.exitCode = 1;
        }
      }, 5_000);
      escalation.unref();
    });
  }

  let outcome;
  let lifecycleFailure;
  try {
    outcome = await Promise.race([
      completion,
      cancellation.then(() =>
        deadline(
          completion,
          10_000,
          "journey authority did not exit after cancellation",
        ),
      ),
    ]);
  } catch (error) {
    abandonChild(worker);
    lifecycleFailure = error;
  }

  let workerGroupDrained = false;
  try {
    if (!(await waitForEmptyGroup(workerPid, 100))) {
      await terminateOwnedAuthority(workerPid, ownerNonce, 5_000);
    }
    workerGroupDrained = true;
  } catch (error) {
    lifecycleFailure =
      lifecycleFailure === undefined
        ? error
        : new AggregateError(
            [lifecycleFailure, error],
            "journey authority exit and group drain failed",
          );
  }

  let cleanupFailure;
  try {
    if (!workerGroupDrained) {
      throw new Error(
        `journey authority group ${workerPid} is not clean; cleanup is deferred`,
      );
    }
    const cleanup =
      canonicalContextFile === undefined
        ? undefined
        : await startJourneyCleanupAuthority(repository, canonicalContextFile);
    if (cleanup !== undefined) {
      activeAuthority = { nonce: cleanup.nonce, pgid: cleanup.pid };
      try {
        const normalCleanup = deadline(
          cleanup.completion,
          journeyCleanupAuthorityTimeoutMilliseconds,
          "journey cleanup authority timed out",
        );
        const cleanupOutcome = await Promise.race([
          normalCleanup,
          cancellation.then(() =>
            deadline(
              cleanup.completion,
              15_000,
              "journey cleanup authority did not exit after cancellation",
            ),
          ),
        ]);
        if (cleanupOutcome.error !== undefined || cleanupOutcome.code !== 0) {
          throw (
            cleanupOutcome.error ??
            new Error(
              `journey cleanup authority exited ${String(cleanupOutcome.code)}`,
            )
          );
        }
      } catch (error) {
        try {
          await terminateOwnedAuthority(cleanup.pid, cleanup.nonce, 5_000);
        } catch (terminationError) {
          throw new AggregateError(
            [error, terminationError],
            "journey cleanup and teardown failed",
          );
        } finally {
          abandonChild(cleanup.child);
        }
        throw error;
      }
    }
  } catch (error) {
    cleanupFailure = error;
  }

  if (
    (externalPointer === undefined || externalPointer === "") &&
    lifecycleFailure === undefined &&
    cleanupFailure === undefined
  ) {
    await rm(pointer, { force: true });
  }
  if (
    lifecycleFailure !== undefined ||
    outcome?.error !== undefined ||
    cleanupFailure !== undefined
  ) {
    throw new AggregateError(
      [lifecycleFailure, outcome?.error, cleanupFailure].filter(
        (error) => error !== undefined,
      ),
      "journey authority or cleanup failed",
    );
  }
  if (outcome?.code !== 0) {
    process.exitCode = outcome.code ?? (interrupted ? 130 : 1);
  }
  worker.off("message", captureContext);
}

export async function startJourneyCleanupAuthority(repository, contextFile) {
  const authority = await canonicalJourneyAuthority(repository, contextFile);
  const nonce_ = randomBytes(32).toString("hex");
  const cleaner = spawn(
    process.execPath,
    [
      scriptPath,
      "journey-cleaner",
      "--owner-nonce",
      nonce_,
      "--context",
      authority.contextFile,
    ],
    {
      cwd: repository,
      detached: true,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    },
  );
  const completion = childCompletion(cleaner);
  const pid = cleaner.pid;
  if (pid === undefined) {
    const outcome = await completion;
    throw outcome.error ?? new Error("failed to start journey cleanup authority");
  }
  await armAuthorityChild(
    cleaner,
    completion,
    nonce_,
    "journey-cleaner",
    "journey cleanup authority",
  );
  return { child: cleaner, completion, nonce: nonce_, pid };
}

async function reachJourneyStartupBarrier(workerPid, ownerNonce) {
  const root = process.env.ZOEN_E2E_JOURNEY_STARTUP_BARRIER_DIR;
  if (root === undefined || root === "") {
    return;
  }
  const runId = journeyId(process.env.ZOEN_E2E_RUN_ID ?? "");
  await mkdir(root, { recursive: true });
  await writeJsonAtomically(
    path.join(root, `${runId}.journey-worker-ready.ready.json`),
    {
      controllerPid: process.pid,
      ownerNonce,
      runId,
      stage: "journey-worker-ready",
      workerPgid: workerPid,
      workerPid,
    },
  );
  const release = path.join(
    root,
    `${runId}.journey-worker-ready.release`,
  );
  for (let attempt = 0; attempt < 1_200; attempt += 1) {
    if (await pathExists(release)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`journey startup barrier timed out for ${runId}`);
}
