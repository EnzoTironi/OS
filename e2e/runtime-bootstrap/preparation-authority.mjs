import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  code,
  pathExists,
  runtimeRegistryRoot,
  writeJsonAtomically,
} from "./atomic-state.mjs";
import { flag, nonce, scriptPath } from "./command-line.mjs";
import { isLeaseDirectory } from "./journey-contract.mjs";
import {
  abandonChild,
  acquireOwnedLock,
  childCompletion,
  deadline,
  groupMembers,
  releaseOwnedLock,
  signalOwnedGroup,
  stopGuardian,
  terminatePreparationDescendants,
  waitForGuardianReady,
} from "./process-authority.mjs";
import {
  parseWriter,
  readOptionalWriter,
  reconcileBootstrapReaders,
  removeStaleWriter,
  terminateOrphanedWriter,
  writerState,
} from "./runtime-registry.mjs";

export async function runController(command) {
  if (command.length === 0) {
    throw new Error("preparation run requires a command after --");
  }
  const workerNonce = randomBytes(32).toString("hex");
  const child = spawn(
    process.execPath,
    [
      scriptPath,
      "worker",
      "--worker-nonce",
      workerNonce,
      "--",
      ...command,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  const completion = childCompletion(child);
  const childPid = child.pid;
  if (childPid === undefined) {
    const outcome = await completion;
    throw outcome.error ?? new Error("failed to start preparation worker");
  }
  let interrupted = false;
  let cancellationRequested;
  const cancellation = new Promise((resolve) => {
    cancellationRequested = resolve;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      interrupted = true;
      cancellationRequested();
      try {
        signalOwnedGroup(childPid, workerNonce, signal);
      } catch (error) {
        process.stderr.write(`cannot signal preparation group: ${String(error)}\n`);
        process.exitCode = 1;
      }
      const escalation = setTimeout(
        () => {
          try {
            signalOwnedGroup(childPid, workerNonce, "SIGKILL");
          } catch (error) {
            process.stderr.write(`cannot kill preparation group: ${String(error)}\n`);
            process.exitCode = 1;
          }
        },
        5_000,
      );
      escalation.unref();
    });
  }
  let outcome;
  try {
    outcome = await Promise.race([
      completion,
      cancellation.then(() =>
        deadline(
          completion,
          10_000,
          "preparation worker did not exit after cancellation",
        ),
      ),
    ]);
  } catch (error) {
    abandonChild(child);
    throw error;
  }
  if (outcome.error !== undefined) {
    throw outcome.error;
  }
  if (outcome.code !== 0) {
    process.exitCode = outcome.code ?? (interrupted ? 130 : 1);
  }
}

export async function runWorker(command) {
  if (command.length === 0) {
    throw new Error("preparation worker requires a command after --");
  }
  const workerNonce = nonce(flag("--worker-nonce"));
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const writer = await acquirePreparationWriter(registryRoot, workerNonce);
  let child;
  let guardian;
  let guardianCompletion;
  let guardianPid;
  let outcome;
  let failure;
  try {
    guardian = spawn(
      process.execPath,
      [
        scriptPath,
        "guardian",
        "--worker-nonce",
        workerNonce,
        "--owner-pgid",
        String(process.pid),
      ],
      { stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    guardianCompletion = childCompletion(guardian);
    const guardianReady = waitForGuardianReady(guardian, workerNonce);
    guardianPid = guardian.pid;
    if (guardianPid === undefined) {
      throw new Error("failed to start preparation ownership guardian");
    }
    await guardianReady;
    const activationAbort = new AbortController();
    void guardianCompletion.then((outcome) => {
      activationAbort.abort(
        outcome.error ??
          new Error("preparation guardian exited during writer activation"),
      );
    });
    await activatePreparationWriter(
      registryRoot,
      writer,
      activationAbort.signal,
    );
    child = spawn(command[0], command.slice(1), {
      cwd: repository,
      env: {
        ...process.env,
        ZOEN_E2E_PREPARE_OWNER_NONCE: workerNonce,
        ZOEN_E2E_PREPARE_OWNER_PID: String(process.pid),
      },
      stdio: "inherit",
    });
    const completion = childCompletion(child);
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => child.kill(signal));
    }
    const completedProcess = await Promise.race([
      completion.then((outcome) => ({ kind: "body", outcome })),
      guardianCompletion.then((outcome) => ({ kind: "guardian", outcome })),
    ]);
    if (completedProcess.kind === "guardian") {
      throw (
        completedProcess.outcome.error ??
        new Error("preparation guardian exited before the build command")
      );
    }
    outcome = completedProcess.outcome;
  } catch (error) {
    failure = error;
  } finally {
    const teardownFailures = [];
    try {
      await terminatePreparationDescendants(process.pid, guardianPid);
    } catch (error) {
      teardownFailures.push(error);
    }
    if (guardian !== undefined && guardianCompletion !== undefined) {
      try {
        await stopGuardian(guardian, guardianCompletion, workerNonce);
      } catch (error) {
        teardownFailures.push(error);
      }
    }
    let groupDrained = false;
    try {
      groupDrained = groupMembers(process.pid).every(
        (member) => member.pid === process.pid,
      );
      if (!groupDrained) {
        teardownFailures.push(
          new Error("preparation group still has members after teardown"),
        );
      }
    } catch (error) {
      teardownFailures.push(error);
    }
    if (groupDrained) {
      try {
        await releasePreparationWriter(registryRoot, writer);
      } catch (error) {
        teardownFailures.push(error);
      }
    }
    if (failure !== undefined || teardownFailures.length > 0) {
      throw new AggregateError(
        [failure, ...teardownFailures].filter((error) => error !== undefined),
        "preparation command or ownership teardown failed",
      );
    }
  }
  if (outcome?.error !== undefined) {
    throw outcome.error;
  }
  if (outcome?.code !== 0) {
    process.exitCode = outcome?.code ?? 1;
  }
}

async function acquirePreparationWriter(registryRoot, workerNonce) {
  const writerDirectory = path.join(registryRoot, "preparation");
  await mkdir(path.join(registryRoot, "slots"), { recursive: true });
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    const lock = await acquireOwnedLock(
      path.join(registryRoot, "allocation.lock"),
      workerNonce,
    );
    let shouldWait = false;
    try {
      const existing = await readOptionalWriter(writerDirectory);
      if (existing !== undefined) {
        if (await pathExists(path.join(writerDirectory, "quarantined.json"))) {
          throw new Error("preparation writer is quarantined");
        }
        const state = writerState(existing);
        if (state === "stale") {
          await removeStaleWriter(writerDirectory);
        } else if (state === "orphaned") {
          await terminateOrphanedWriter(existing);
          await removeStaleWriter(writerDirectory);
        } else if (state === "uncertain") {
          throw new Error("preparation writer ownership is uncertain");
        } else {
          shouldWait = true;
        }
      }
      if (!shouldWait) {
        const owner = {
          createdAt: new Date().toISOString(),
          ownerNonce: workerNonce,
          ownerPgid: process.pid,
          ownerPid: process.pid,
          state: "pending",
          version: 1,
        };
        const claim = `${writerDirectory}.claim-${workerNonce.slice(0, 16)}`;
        await mkdir(claim);
        try {
          await writeFile(
            path.join(claim, "owner.json"),
            `${JSON.stringify(owner, null, 2)}\n`,
            { flag: "wx" },
          );
          await rename(claim, writerDirectory);
        } catch (error) {
          await rm(claim, { force: true, recursive: true });
          throw error;
        }
        return { directory: writerDirectory, nonce: workerNonce };
      }
    } finally {
      await releaseOwnedLock(lock, workerNonce);
    }
    await delay(250);
  }
  throw new Error("timed out waiting for the shared preparation writer");
}

async function activatePreparationWriter(registryRoot, writer, abortSignal) {
  const slotsRoot = path.join(registryRoot, "slots");
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    abortSignal.throwIfAborted();
    const lock = await acquireOwnedLock(
      path.join(registryRoot, "allocation.lock"),
      writer.nonce,
    );
    let readerCount = 0;
    let leaseCount = 0;
    let reconciledReaderTokens = [];
    try {
      await assertWriterOwner(writer, "pending");
      leaseCount = (
        await readdir(slotsRoot, { withFileTypes: true })
      ).filter(
        (entry) => entry.isDirectory() && isLeaseDirectory(entry.name),
      ).length;
      const bootstrapReaders = await reconcileBootstrapReaders(
        path.join(registryRoot, "readers"),
      );
      reconciledReaderTokens = bootstrapReaders.map((reader) => reader.token);
      readerCount = leaseCount + bootstrapReaders.length;
      if (readerCount === 0) {
        abortSignal.throwIfAborted();
        await rm(preparedBuildPath(), { force: true });
        await writeJsonAtomically(path.join(writer.directory, "owner.json"), {
          createdAt: new Date().toISOString(),
          ownerNonce: writer.nonce,
          ownerPgid: process.pid,
          ownerPid: process.pid,
          state: "active",
          version: 1,
        });
        return;
      }
    } finally {
      await releaseOwnedLock(lock, writer.nonce);
    }
    await reachPreparationActivationBarrier(
      {
        leaseCount,
        readerTokens: reconciledReaderTokens,
        writerNonce: writer.nonce,
      },
      abortSignal,
    );
    await reconcileLeasesIfPossible(leaseCount, abortSignal);
    await delay(250);
  }
  throw new Error("timed out waiting for active journey readers before preparation");
}

function preparedBuildPath() {
  const override = process.env.ZOEN_E2E_BUILD_MANIFEST;
  return override === undefined || override === ""
    ? path.join(process.cwd(), ".cache", "e2e", "prepared.json")
    : path.resolve(process.cwd(), override);
}

async function releasePreparationWriter(registryRoot, writer) {
  const lock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    writer.nonce,
  );
  try {
    await assertWriterOwner(writer);
    const releasing = `${writer.directory}.release-${writer.nonce.slice(0, 16)}`;
    await rename(writer.directory, releasing);
    await rm(releasing, { force: true, recursive: true });
  } finally {
    await releaseOwnedLock(lock, writer.nonce);
  }
}

async function assertWriterOwner(writer, expectedState) {
  const current = parseWriter(
    JSON.parse(
      await readFile(path.join(writer.directory, "owner.json"), "utf8"),
    ),
  );
  if (
    current.ownerPid !== process.pid ||
    current.ownerNonce !== writer.nonce ||
    (expectedState !== undefined && current.state !== expectedState)
  ) {
    throw new Error("preparation writer ownership mismatch");
  }
}

async function reconcileLeasesIfPossible(readerCount, abortSignal) {
  if (readerCount === 0) {
    return;
  }
  abortSignal.throwIfAborted();
  const runtime = path.join(process.cwd(), "dist", "e2e", "journey-runtime.js");
  try {
    await stat(runtime);
  } catch (error) {
    if (code(error) === "ENOENT") {
      throw new Error(
        "journey leases exist but the prepared runtime needed to reconcile them is missing",
      );
    }
    throw error;
  }
  const runtimeNonce = randomBytes(32).toString("hex");
  const child = spawn(
    process.execPath,
    [runtime, "reconcile", "--runtime-owner-nonce", runtimeNonce],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const completion = childCompletion(child);
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const aborted = new Promise((resolve) => {
    if (abortSignal.aborted) {
      resolve({ kind: "abort", reason: abortSignal.reason });
      return;
    }
    abortSignal.addEventListener(
      "abort",
      () => resolve({ kind: "abort", reason: abortSignal.reason }),
      { once: true },
    );
  });
  const completed = completion.then((outcome) => ({ kind: "child", outcome }));
  const event = await deadline(
    Promise.race([completed, aborted]),
    120_000,
    "journey lease reconciliation timed out",
  ).catch(async (error) => {
    child.kill("SIGTERM");
    try {
      await deadline(completion, 5_000, "journey reconciliation ignored SIGTERM");
    } catch (termError) {
      child.kill("SIGKILL");
      abandonChild(child);
      throw new AggregateError(
        [error, termError],
        "journey lease reconciliation did not terminate",
      );
    }
    throw error;
  });
  if (event.kind === "abort") {
    child.kill("SIGTERM");
    try {
      await deadline(completion, 5_000, "journey reconciliation ignored abort");
    } catch (error) {
      child.kill("SIGKILL");
      abandonChild(child);
      throw new AggregateError(
        [event.reason, error],
        "preparation guardian failed during lease reconciliation",
      );
    }
    throw event.reason;
  }
  if (event.outcome.error !== undefined || event.outcome.code !== 0) {
    throw (
      event.outcome.error ??
      new Error(`journey lease reconciliation failed: ${stderr}`)
    );
  }
}

function preparationActivationBarrier() {
  const ready = process.env.ZOEN_E2E_PREPARE_ACTIVATION_BARRIER_READY;
  const release = process.env.ZOEN_E2E_PREPARE_ACTIVATION_BARRIER_RELEASE;
  if (ready === undefined && release === undefined) {
    return undefined;
  }
  if (ready === undefined || release === undefined) {
    throw new Error("preparation activation proof requires ready and release paths");
  }
  return { ready: path.resolve(ready), release: path.resolve(release) };
}

async function reachPreparationActivationBarrier(observation, abortSignal) {
  const barrier = preparationActivationBarrier();
  if (barrier === undefined || observation.readerTokens.length === 0) {
    return;
  }
  await writeJsonAtomically(barrier.ready, {
    leaseCount: observation.leaseCount,
    ownerPid: process.pid,
    readerTokens: observation.readerTokens,
    stage: "readers-reconciled",
    writerNonce: observation.writerNonce,
  });
  for (let attempt = 0; attempt < 4_800; attempt += 1) {
    abortSignal.throwIfAborted();
    if (await pathExists(barrier.release)) {
      return;
    }
    await delay(25);
  }
  throw new Error("preparation activation proof barrier timed out");
}
