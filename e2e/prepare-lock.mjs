#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const noncePattern = /^[0-9a-f]{64}$/;
const journeyCleanupRuntimeTimeoutMilliseconds = 210_000;
const scriptPath = fileURLToPath(import.meta.url);
const mode = process.argv[2] ?? "";

if (mode === "run") {
  await runController(commandAfterSeparator());
} else if (mode === "worker") {
  await runWorker(commandAfterSeparator());
} else if (mode === "guardian") {
  await runGuardian();
} else if (mode === "reader-acquire") {
  await acquireBootstrapReaderCommand();
} else if (mode === "reader-release") {
  await releaseBootstrapReaderCommand();
} else if (mode === "proof-crash-recovery") {
  await provePreparationCrashRecoveryCommand();
} else if (mode === "proof-context-confinement") {
  await proveContextConfinementCommand();
} else if (mode === "proof-reader-hold") {
  await holdProofReaderCommand();
} else if (mode === "create-runtime-proof-root") {
  await createRuntimeProofRootCommand();
} else if (mode === "journey-run") {
  await runJourneyController();
} else if (mode === "journey-worker") {
  await runJourneyWorker();
} else if (mode === "journey-publish") {
  await publishJourneyProcessAuthority();
} else if (mode === "journey-cleaner") {
  await runJourneyCleaner();
} else {
  throw new Error(`unknown preparation command ${JSON.stringify(mode)}`);
}

async function provePreparationCrashRecoveryCommand() {
  const output = path.resolve(flag("--output"));
  const work = await mkdtemp(path.join(tmpdir(), "zoen-prepare-crash-proof-"));
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const preparationDirectory = path.join(registryRoot, "preparation");
  const controllerRelease = path.join(work, "controller.release");
  const workerRelease = path.join(work, "worker.release");
  const activationWorkerRelease = path.join(
    work,
    "activation-worker.release",
  );
  const activationGuardianRelease = path.join(
    work,
    "activation-guardian.release",
  );
  const tracked = [];
  let failure;
  try {
    const mutationProof = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(repository, "e2e", "prepared-artifacts.mjs"), "proof-mutation"],
        {
          cwd: repository,
          encoding: "utf8",
          env: process.env,
          timeout: 30_000,
        },
      ),
    );
    if (mutationProof.artifactMutationInvalidatedPreparedBuild !== true) {
      throw new Error("prepared artifact mutation proof did not pass");
    }
    await proveContextConfinement();
    const controllerReady = path.join(work, "controller.ready.json");
    const controllerManifest = path.join(work, "controller-manifest.json");
    await writeFile(controllerManifest, '{"sentinel":true}\n', { flag: "wx" });
    const controller = startProofPreparation(
      controllerReady,
      controllerRelease,
      controllerManifest,
    );
    tracked.push(controller);
    const controllerBodyPid = await proofProbePid(controllerReady);
    if (await pathExists(controllerManifest)) {
      throw new Error("active preparation did not invalidate the old manifest");
    }
    if (!controller.child.kill("SIGKILL")) {
      throw new Error("failed to kill preparation controller proof process");
    }
    const controllerOutcome = await deadline(
      controller.completion,
      10_000,
      "preparation controller did not exit after SIGKILL",
    );
    if (controllerOutcome.code === 0) {
      throw new Error("killed preparation controller unexpectedly succeeded");
    }
    await writeFile(controllerRelease, "release\n", { flag: "wx" });
    await waitForMissingProcess(controllerBodyPid);
    await waitForMissingPath(preparationDirectory);

    const workerReady = path.join(work, "worker.ready.json");
    const workerManifest = path.join(work, "worker-manifest.json");
    await writeFile(workerManifest, '{"sentinel":true}\n', { flag: "wx" });
    const workerController = startProofPreparation(
      workerReady,
      workerRelease,
      workerManifest,
    );
    tracked.push(workerController);
    const workerBodyPid = await proofProbePid(workerReady);
    if (await pathExists(workerManifest)) {
      throw new Error("active preparation retained the prior worker manifest");
    }
    const writer = parseWriter(
      JSON.parse(
        await waitForFile(path.join(preparationDirectory, "owner.json")),
      ),
    );
    if (
      writer.state !== "active" ||
      writer.ownerPid !== writer.ownerPgid ||
      processOwnership(writer.ownerPid, writer.ownerNonce) !== "owned"
    ) {
      throw new Error("preparation worker proof owner is not verifiably active");
    }
    process.kill(writer.ownerPid, "SIGKILL");
    await waitForMissingProcess(workerBodyPid);
    if (!(await waitForEmptyGroup(writer.ownerPgid, 100))) {
      throw new Error(
        "preparation guardian did not drain the killed worker group",
      );
    }
    const recovery = startProofCommand(
      [process.execPath, "-e", "process.exit(0)"],
      path.join(work, "recovery-manifest.json"),
    );
    tracked.push(recovery);
    const [workerOutcome, recoveryOutcome] = await Promise.all([
      deadline(
        workerController.completion,
        20_000,
        "preparation controller did not observe its killed worker",
      ),
      deadline(
        recovery.completion,
        30_000,
        "preparation retry did not reconcile its killed worker",
      ),
    ]);
    if (workerOutcome.code === 0 || recoveryOutcome.code !== 0) {
      throw new Error("preparation worker crash did not converge through retry");
    }
    await waitForMissingPath(preparationDirectory);

    const activationWorkerReady = path.join(
      work,
      "activation-worker.ready.json",
    );
    const activationWorkerReaderReady = path.join(
      work,
      "activation-worker-reader.ready.json",
    );
    const activationWorkerReader = startProofReaderHold(
      activationWorkerReaderReady,
      activationWorkerRelease,
    );
    tracked.push(activationWorkerReader);
    const activationWorkerReaderToken = await proofHeldReaderToken(
      activationWorkerReaderReady,
    );
    const activationWorker = startProofActivation(
      activationWorkerReady,
      activationWorkerRelease,
      path.join(work, "activation-worker-manifest.json"),
    );
    tracked.push(activationWorker);
    await assertProofActivationObservation(
      activationWorkerReady,
      activationWorkerReaderToken,
    );
    const activationWriter = parseWriter(
      JSON.parse(
        await waitForFile(path.join(preparationDirectory, "owner.json")),
      ),
    );
    assertPendingActivationAuthority(activationWriter);
    process.kill(activationWriter.ownerPid, "SIGKILL");
    if (!(await waitForEmptyGroup(activationWriter.ownerPgid, 100))) {
      throw new Error("activation guardian did not drain the killed writer group");
    }
    await writeFile(activationWorkerRelease, "release\n", { flag: "wx" });
    const activationWorkerOutcome = await deadline(
      activationWorker.completion,
      20_000,
      "activation worker controller did not observe its killed worker",
    );
    if (activationWorkerOutcome.code === 0) {
      throw new Error("killed activation writer unexpectedly succeeded");
    }
    const activationReaderOutcome = await deadline(
      activationWorkerReader.completion,
      20_000,
      "real activation reader did not release",
    );
    if (activationReaderOutcome.code !== 0) {
      throw new Error("real activation reader failed during writer recovery");
    }
    const activationRecovery = startProofCommand(
      [process.execPath, "-e", "process.exit(0)"],
      path.join(work, "activation-recovery-manifest.json"),
    );
    tracked.push(activationRecovery);
    const activationRecoveryOutcome = await deadline(
      activationRecovery.completion,
      30_000,
      "activation writer retry did not converge",
    );
    if (activationRecoveryOutcome.code !== 0) {
      throw new Error("activation writer crash was not retryable");
    }
    await waitForMissingPath(preparationDirectory);

    const guardianReady = path.join(work, "activation-guardian.ready.json");
    const guardianReaderReady = path.join(
      work,
      "activation-guardian-reader.ready.json",
    );
    const guardianReader = startProofReaderHold(
      guardianReaderReady,
      activationGuardianRelease,
    );
    tracked.push(guardianReader);
    const guardianReaderToken = await proofHeldReaderToken(guardianReaderReady);
    const guardianController = startProofActivation(
      guardianReady,
      activationGuardianRelease,
      path.join(work, "activation-guardian-manifest.json"),
    );
    tracked.push(guardianController);
    await assertProofActivationObservation(guardianReady, guardianReaderToken);
    const guardianWriter = parseWriter(
      JSON.parse(
        await waitForFile(path.join(preparationDirectory, "owner.json")),
      ),
    );
    assertPendingActivationAuthority(guardianWriter);
    const guardian = groupMembers(guardianWriter.ownerPgid).find(
      (member) =>
        member.command.includes("prepare-lock.mjs") &&
        member.command.includes("guardian") &&
        member.command.includes(guardianWriter.ownerNonce),
    );
    if (guardian === undefined) {
      throw new Error("activation proof could not identify the writer guardian");
    }
    process.kill(guardian.pid, "SIGKILL");
    await writeFile(activationGuardianRelease, "release\n", { flag: "wx" });
    const guardianOutcome = await deadline(
      guardianController.completion,
      20_000,
      "writer did not fail after losing its activation guardian",
    );
    if (guardianOutcome.code === 0) {
      throw new Error("writer unexpectedly survived activation guardian loss");
    }
    const guardianReaderOutcome = await deadline(
      guardianReader.completion,
      20_000,
      "guardian-loss activation reader did not release",
    );
    if (guardianReaderOutcome.code !== 0) {
      throw new Error("guardian-loss activation reader failed");
    }
    if (!(await waitForEmptyGroup(guardianWriter.ownerPgid, 100))) {
      throw new Error("writer group remained after activation guardian loss");
    }
    await waitForMissingPath(preparationDirectory);
  } catch (error) {
    failure = error;
  } finally {
    const cleanupFailures = [];
    for (const release of [
      controllerRelease,
      workerRelease,
      activationWorkerRelease,
      activationGuardianRelease,
    ]) {
      try {
        await writeFile(release, "release\n", { flag: "a" });
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    for (const process_ of tracked) {
      if (
        process_.child.exitCode === null &&
        process_.child.signalCode === null
      ) {
        process_.child.kill("SIGTERM");
      }
    }
    for (const process_ of tracked) {
      try {
        await deadline(
          process_.completion,
          15_000,
          "preparation proof controller did not stop during teardown",
        );
      } catch (error) {
        process_.child.unref();
        cleanupFailures.push(error);
      }
    }
    try {
      const reconciliation = startProofCommand(
        [process.execPath, "-e", "process.exit(0)"],
        path.join(work, "teardown-recovery-manifest.json"),
      );
      try {
        const outcome = await deadline(
          reconciliation.completion,
          30_000,
          "preparation proof teardown reconciliation timed out",
        );
        if (outcome.code !== 0) {
          throw new Error("preparation proof teardown reconciliation failed");
        }
      } catch (error) {
        reconciliation.child.kill("SIGTERM");
        reconciliation.child.unref();
        throw error;
      }
      await waitForMissingPath(preparationDirectory);
    } catch (error) {
      cleanupFailures.push(error);
    }
    await rm(work, { force: true, recursive: true });
    if (cleanupFailures.length > 0) {
      failure =
        failure === undefined
          ? new AggregateError(
              cleanupFailures,
              "preparation crash proof teardown failed",
            )
          : new AggregateError(
              [failure, ...cleanupFailures],
              "preparation crash proof and teardown failed",
            );
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeJsonAtomically(output, {
    activationReconcileCrashRecovered: true,
    artifactMutationInvalidatedPreparedBuild: true,
    contextTamperingRejectedBeforeEffects: true,
    controllerCrashRecovered: true,
    guardianCrashRecovered: true,
    manifestInvalidationProved: true,
    provedAt: new Date().toISOString(),
    workerCrashRecovered: true,
    version: 1,
  });
}

async function proveContextConfinementCommand() {
  await proveContextConfinement();
  process.stdout.write(
    `${JSON.stringify({ contextTamperingRejectedBeforeEffects: true, version: 1 })}\n`,
  );
}

async function proveContextConfinement() {
  const work = await mkdtemp(path.join(tmpdir(), "zoen-context-confinement-proof-"));
  try {
    const root = await realpath(work);
    const repository = path.join(root, "repository");
    await mkdir(repository);
    execFileSync("/usr/bin/git", ["init", "--quiet", repository], {
      encoding: "utf8",
      env: inspectionEnvironment(),
      timeout: 30_000,
    });
    const canonicalRepository = await realpath(repository);
    const registryRoot = await runtimeRegistryRoot(canonicalRepository);
    const slotsRoot = path.join(registryRoot, "slots");
    const slot = 17;
    const leaseDirectory = path.join(slotsRoot, String(slot).padStart(4, "0"));
    const ownerToken = randomBytes(32).toString("hex");
    const ownerNonce = randomBytes(32).toString("hex");
    const identity = {
      attempt: 1,
      repository: canonicalRepository,
      runId: "confinement-run",
      scenario: "definition-publication",
      suiteId: "confinement-suite",
    };
    const layout = canonicalJourneyLayout(identity);
    await Promise.all([
      mkdir(layout.artifacts, { recursive: true }),
      mkdir(layout.generated, { recursive: true }),
      mkdir(layout.logs, { recursive: true }),
      mkdir(layout.process, { recursive: true }),
      mkdir(leaseDirectory, { recursive: true }),
    ]);
    const composeProject = expectedComposeProject(identity);
    const lease = {
      ...identity,
      composeProject,
      contextFile: layout.contextFile,
      createdAt: new Date().toISOString(),
      exclusive: false,
      ownerGuardianPid: process.pid,
      ownerNonce,
      ownerPgid: process.pid,
      ownerPid: process.pid,
      ownerToken,
      slot,
      version: 2,
    };
    const context = {
      attempt: identity.attempt,
      buildIdentity: "1".repeat(64),
      compose: {
        baseFile: path.join(
          canonicalRepository,
          "e2e",
          identity.scenario,
          "compose.yaml",
        ),
        kind: "compose",
        overrideFile: path.join(layout.runRoot, "compose.owner.yaml"),
        project: composeProject,
      },
      contextVersion: 1,
      createdAt: new Date().toISOString(),
      httpNames: expectedJourneyHttpNames(identity),
      lease: { directory: leaseDirectory, ownerToken, slot },
      owner: {
        guardianPid: process.pid,
        nonce: ownerNonce,
        pgid: process.pid,
        pid: process.pid,
      },
      paths: { ...layout, repository: canonicalRepository },
      ports: expectedJourneyPorts(slot),
      runId: identity.runId,
      scenario: identity.scenario,
      sourceSha: "2".repeat(40),
      suiteId: identity.suiteId,
    };
    await writeJsonAtomically(path.join(leaseDirectory, "lease.json"), lease);
    await writeJsonAtomically(layout.contextFile, context);
    const authority = await canonicalJourneyAuthority(
      canonicalRepository,
      layout.contextFile,
    );
    const sentinelRoot = path.join(root, "sentinel");
    const sentinel = path.join(sentinelRoot, "sentinel.txt");
    await mkdir(sentinelRoot);
    await writeFile(sentinel, "intact\n", { flag: "wx" });
    await writeJsonAtomically(layout.contextFile, {
      ...context,
      compose: { ...context.compose, project: `${composeProject}-tampered` },
      paths: { ...context.paths, generated: sentinelRoot, process: sentinelRoot },
      ports: { ...context.ports, auth: context.ports.auth + 1 },
    });
    let rejected = false;
    try {
      await startJourneyCleanupAuthority(canonicalRepository, layout.contextFile);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("tampered journey context reached cleanup effects");
    }
    await recordJourneyExit(authority, ownerNonce, 1);
    if (
      (await readFile(sentinel, "utf8")) !== "intact\n" ||
      (await pathExists(path.join(sentinelRoot, "scenario.json")))
    ) {
      throw new Error("tampered journey context reached an external sentinel");
    }
  } finally {
    await rm(work, { force: true, recursive: true });
  }
}

async function createRuntimeProofRootCommand() {
  const proofRunId = journeyId(flag("--proof-run-id"));
  const repository = await realpath(process.cwd());
  const artifactsRoot = path.join(repository, "artifacts");
  const runtimeProofsRoot = path.join(artifactsRoot, "runtime-proof");
  await ensureExactDirectory(artifactsRoot);
  await ensureExactDirectory(runtimeProofsRoot);
  const proofRoot = path.join(runtimeProofsRoot, proofRunId);
  await mkdir(proofRoot);
  await assertExactDirectory(proofRoot);
  process.stdout.write(`${proofRoot}\n`);
}

async function ensureExactDirectory(directory) {
  try {
    await assertExactDirectory(directory);
  } catch (error) {
    if (code(error) !== "ENOENT") {
      throw error;
    }
    await mkdir(directory);
    await assertExactDirectory(directory);
  }
}

async function assertExactDirectory(directory) {
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${directory} must be a real directory`);
  }
  const resolved = await realpath(directory);
  if (resolved !== directory) {
    throw new Error(`${directory} must not traverse a symlink`);
  }
}

async function runJourneyController() {
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
          120_000,
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

async function startJourneyCleanupAuthority(repository, contextFile) {
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

async function runJourneyCleaner() {
  const ownerNonce = nonce(flag("--owner-nonce"));
  const repository = await realpath(process.cwd());
  const authority = await canonicalJourneyAuthority(
    repository,
    path.resolve(flag("--context")),
  );
  const context = authority.contextFile;
  let guardian;
  let guardianCompletion;
  let runtime;
  let readerToken;
  let completed = false;
  process.once("disconnect", () => {
    if (!completed) {
      process.exit(143);
    }
  });
  if (!process.connected) {
    process.exit(143);
  }
  await waitForAuthorityStart(ownerNonce, "journey-cleaner");
  try {
    guardian = spawn(
      process.execPath,
      [
        scriptPath,
        "guardian",
        "--worker-nonce",
        ownerNonce,
        "--owner-pgid",
        String(process.pid),
      ],
      { stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    guardianCompletion = childCompletion(guardian);
    const guardianReady = waitForGuardianReady(guardian, ownerNonce);
    const guardianPid = guardian.pid;
    if (guardianPid === undefined) {
      throw new Error("failed to start cleanup ownership guardian");
    }
    await guardianReady;
    readerToken = execFileSync(
      process.execPath,
      [
        scriptPath,
        "reader-acquire",
        "--kind",
        "journey",
        "--owner-pid",
        String(process.pid),
        "--owner-pgid",
        String(process.pid),
        "--guardian-pid",
        String(guardianPid),
        "--owner-nonce",
        ownerNonce,
        "--lease-context",
        context,
      ],
      {
        cwd: repository,
        encoding: "utf8",
        env: process.env,
        timeout: 30_000,
      },
    ).trim();
    nonce(readerToken);
    runtime = spawn(
      process.execPath,
      [
        path.join(repository, "dist", "e2e", "journey-runtime.js"),
        "cleanup",
        "--context",
        context,
        "--runtime-owner-nonce",
        randomBytes(32).toString("hex"),
      ],
      { cwd: repository, env: process.env, stdio: "inherit" },
    );
    const runtimeCompletion = childCompletion(runtime);
    const completedProcess = await Promise.race([
      deadline(
        runtimeCompletion,
        journeyCleanupRuntimeTimeoutMilliseconds,
        "journey cleanup runtime timed out",
      ).then((outcome) => ({ kind: "runtime", outcome })),
      guardianCompletion.then((outcome) => ({ kind: "guardian", outcome })),
    ]);
    if (completedProcess.kind === "guardian") {
      await terminatePreparationDescendants(process.pid, guardianPid);
      guardian = undefined;
      throw (
        completedProcess.outcome.error ??
        new Error("cleanup guardian exited before the runtime")
      );
    }
    if (
      completedProcess.outcome.error !== undefined ||
      completedProcess.outcome.code !== 0
    ) {
      throw (
        completedProcess.outcome.error ??
        new Error(
          `journey cleanup exited ${String(completedProcess.outcome.code)}`,
        )
      );
    }
    releaseReaderFromAuthority(repository, readerToken, ownerNonce);
    readerToken = undefined;
    await terminatePreparationDescendants(process.pid, guardianPid);
    await stopGuardian(guardian, guardianCompletion, ownerNonce);
    guardian = undefined;
    completed = true;
  } finally {
    if (runtime !== undefined) {
      await terminatePreparationDescendants(process.pid, guardian?.pid);
    }
    if (readerToken !== undefined) {
      releaseReaderFromAuthority(repository, readerToken, ownerNonce);
    }
    if (guardian !== undefined && guardianCompletion !== undefined) {
      await stopGuardian(guardian, guardianCompletion, ownerNonce);
    }
  }
}

function releaseReaderFromAuthority(repository, token, ownerNonce) {
  execFileSync(
    process.execPath,
    [
      scriptPath,
      "reader-release",
      "--reader-token",
      token,
      "--owner-pid",
      String(process.pid),
      "--owner-nonce",
      ownerNonce,
    ],
    { cwd: repository, env: process.env, stdio: "inherit", timeout: 30_000 },
  );
}

async function runJourneyWorker() {
  const ownerNonce = nonce(flag("--owner-nonce"));
  const scenario = journeyId(flag("--scenario"));
  const pointer = path.resolve(flag("--pointer"));
  const repository = await realpath(process.cwd());
  let body;
  let guardian;
  let guardianCompletion;
  let authority;
  let completed = false;
  process.once("disconnect", () => {
    if (!completed) {
      process.exit(143);
    }
  });
  if (!process.connected) {
    process.exit(143);
  }
  await waitForAuthorityStart(ownerNonce, "journey-worker");
  try {
    guardian = spawn(
      process.execPath,
      [
        scriptPath,
        "guardian",
        "--worker-nonce",
        ownerNonce,
        "--owner-pgid",
        String(process.pid),
      ],
      { stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    guardianCompletion = childCompletion(guardian);
    const guardianReady = waitForGuardianReady(guardian, ownerNonce);
    const guardianPid = guardian.pid;
    if (guardianPid === undefined) {
      throw new Error("failed to start journey ownership guardian");
    }
    await guardianReady;
    body = spawn(
      "/bin/bash",
      [
        path.join(repository, "e2e", "run.sh"),
        "--zoen-script-owner-token",
        ownerNonce,
        "_run-owned",
        scenario,
      ],
      {
        cwd: repository,
        env: {
          ...process.env,
          ZOEN_E2E_CONTEXT_POINTER: pointer,
          ZOEN_E2E_LIFECYCLE_GUARDIAN_PID: String(guardianPid),
          ZOEN_E2E_LIFECYCLE_LEADER_PID: String(process.pid),
          ZOEN_E2E_LIFECYCLE_OWNER_NONCE: ownerNonce,
          ZOEN_E2E_LIFECYCLE_OWNER_PGID: String(process.pid),
          ZOEN_E2E_LIFECYCLE_OWNER_PID: String(process.pid),
          ZOEN_E2E_EXTERNAL_LIFECYCLE: "1",
        },
        stdio: ["inherit", "inherit", "inherit", "pipe", "pipe"],
      },
    );
    const bodyCompletion = childCompletion(body);
    const authorityCompletion = receiveJourneyAuthority(
      body,
      repository,
      ownerNonce,
    );
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => body?.kill(signal));
    }
    const completedProcess = await Promise.race([
      bodyCompletion.then((outcome) => ({ kind: "body", outcome })),
      guardianCompletion.then((outcome) => ({ kind: "guardian", outcome })),
    ]);
    if (completedProcess.kind === "guardian") {
      await terminatePreparationDescendants(process.pid, guardianPid);
      guardian = undefined;
      throw (
        completedProcess.outcome.error ??
        new Error("journey ownership guardian exited before the journey body")
      );
    }
    const outcome = completedProcess.outcome;
    try {
      authority = await deadline(
        authorityCompletion,
        5_000,
        "journey body did not publish its canonical context",
      );
      await recordJourneyExit(authority, ownerNonce, outcome.code ?? null);
    } catch (error) {
      if (outcome.code === 0) {
        throw error;
      }
    }
    await terminatePreparationDescendants(process.pid, guardianPid);
    await stopGuardian(guardian, guardianCompletion, ownerNonce);
    guardian = undefined;
    completed = true;
    if (outcome.error !== undefined) {
      throw outcome.error;
    }
    if (outcome.code !== 0) {
      process.exitCode = outcome.code ?? 1;
    }
  } finally {
    if (body !== undefined) {
      await terminatePreparationDescendants(process.pid, guardian?.pid);
    }
    if (guardian !== undefined && guardianCompletion !== undefined) {
      await stopGuardian(guardian, guardianCompletion, ownerNonce);
    }
  }
}

async function receiveJourneyAuthority(body, repository, ownerNonce) {
  const input = body.stdio[3];
  const acknowledgement = body.stdio[4];
  if (input === null || acknowledgement === null) {
    throw new Error("journey authority handshake pipes were not created");
  }
  const contextFile = await deadline(
    readSingleLine(input),
    120_000,
    "journey body did not publish its context before execution",
  );
  const authority = await canonicalJourneyAuthority(repository, contextFile);
  if (
    authority.context.owner?.nonce !== ownerNonce ||
    authority.context.owner?.pid !== process.pid ||
    authority.context.owner?.pgid !== process.pid
  ) {
    throw new Error("journey context is not owned by its source worker");
  }
  await new Promise((resolve, reject) => {
    if (!process.connected || process.send === undefined) {
      reject(new Error("journey worker lost its controller before context handoff"));
      return;
    }
    process.send(
      {
        contextFile: authority.contextFile,
        kind: "journey-context-ready",
        ownerNonce,
      },
      (error) => {
        if (error === null) {
          resolve();
        } else {
          reject(error);
        }
      },
    );
  });
  await new Promise((resolve, reject) => {
    acknowledgement.end("accepted\n", (error) => {
      if (error === null || error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  return authority;
}

async function readSingleLine(input) {
  let buffered = "";
  for await (const chunk of input) {
    buffered += chunk.toString();
    if (buffered.includes("\n")) {
      break;
    }
    if (buffered.length > 16_384) {
      throw new Error("journey context handshake exceeded its size limit");
    }
  }
  const lines = buffered.split("\n");
  if (lines.length !== 2 || lines[0] === "" || lines[1] !== "") {
    throw new Error("journey context handshake must contain exactly one line");
  }
  return path.resolve(lines[0]);
}

async function publishJourneyProcessAuthority() {
  const contextPath = path.resolve(flag("--context"));
  const ownerPgid = positiveInteger(flag("--owner-pgid"), "--owner-pgid");
  const leaderPid = positiveInteger(flag("--leader-pid"), "--leader-pid");
  const guardianPid = positiveInteger(flag("--guardian-pid"), "--guardian-pid");
  const ownerNonce = nonce(flag("--owner-nonce"));
  const repository = await realpath(process.cwd());
  const authority = await canonicalJourneyAuthority(repository, contextPath);
  const context = authority.context;
  if (
    context === null ||
    typeof context !== "object" ||
    context.owner?.pid !== leaderPid ||
    context.owner?.pgid !== ownerPgid ||
    context.owner?.guardianPid !== guardianPid ||
    context.owner?.nonce !== ownerNonce ||
    typeof context.lease?.ownerToken !== "string" ||
    !noncePattern.test(context.lease.ownerToken) ||
    typeof context.paths?.process !== "string"
  ) {
    throw new Error("journey context does not match its source authority");
  }
  const members = groupMembers(ownerPgid);
  const leader = members.find((member) => member.pid === leaderPid);
  const guardian = members.find((member) => member.pid === guardianPid);
  if (
    leaderPid !== ownerPgid ||
    leader === undefined ||
    !leader.command.includes("journey-worker") ||
    !leader.command.includes(ownerNonce) ||
    guardian === undefined ||
    !guardian.command.includes("guardian") ||
    !guardian.command.includes(ownerNonce)
  ) {
    throw new Error("journey process authority is not anchored in its owned group");
  }
  await writeJsonAtomically(authority.metadataPath, {
    groupCleanToken: randomBytes(32).toString("hex"),
    authorityNonce: ownerNonce,
    ownerToken: context.lease.ownerToken,
    pgid: ownerPgid,
    pid: leaderPid,
    runnerPath: "prepare-lock.mjs",
    startedAt: new Date().toISOString(),
    state: "running",
    version: 1,
  });
}

function abandonChild(child) {
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  if (child.connected) {
    child.disconnect();
  }
  child.unref();
}

async function armAuthorityChild(
  child,
  completion,
  ownerNonce,
  kind,
  label,
  beforeStart,
) {
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error(`${label} has no process id`);
  }
  try {
    await deadline(
      new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (
            message !== null &&
            typeof message === "object" &&
            message.kind === `${kind}-ready` &&
            message.ownerNonce === ownerNonce
          ) {
            cleanup();
            resolve();
          }
        };
        const onCompletion = (outcome) => {
          cleanup();
          reject(
            outcome.error ??
              new Error(`${label} exited ${String(outcome.code)} before readiness`),
          );
        };
        const cleanup = () => child.off("message", onMessage);
        child.on("message", onMessage);
        completion.then(onCompletion);
      }),
      5_000,
      `${label} readiness timed out`,
    );
    await beforeStart?.(pid);
    await deadline(
      new Promise((resolve, reject) => {
        if (!child.connected) {
          reject(new Error(`${label} disconnected before start`));
          return;
        }
        child.send({ kind: `${kind}-start`, ownerNonce }, (error) => {
          if (error === null) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
      5_000,
      `${label} start handshake timed out`,
    );
  } catch (error) {
    try {
      await terminateOwnedAuthority(pid, ownerNonce, 2_000);
    } catch (terminationError) {
      throw new AggregateError(
        [error, terminationError],
        `${label} handshake and teardown failed`,
      );
    } finally {
      abandonChild(child);
    }
    throw error;
  }
}

async function waitForAuthorityStart(ownerNonce, kind) {
  if (!process.connected) {
    throw new Error(`${kind} has no live controller`);
  }
  await deadline(
    new Promise((resolve, reject) => {
      const onMessage = (message) => {
        if (
          message !== null &&
          typeof message === "object" &&
          message.kind === `${kind}-start` &&
          message.ownerNonce === ownerNonce
        ) {
          cleanup();
          resolve();
        }
      };
      const onDisconnect = () => {
        cleanup();
        reject(new Error(`${kind} controller disconnected before start`));
      };
      const cleanup = () => {
        process.off("message", onMessage);
        process.off("disconnect", onDisconnect);
      };
      process.on("message", onMessage);
      process.once("disconnect", onDisconnect);
      if (!process.connected) {
        onDisconnect();
        return;
      }
      process.send?.({ kind: `${kind}-ready`, ownerNonce }, (error) => {
        if (error !== null) {
          cleanup();
          reject(error);
        }
      });
    }),
    5_000,
    `${kind} start handshake timed out`,
  );
  if (!process.connected) {
    throw new Error(`${kind} controller disconnected during start`);
  }
}

async function terminateOwnedAuthority(pgid, ownerNonce, waitMilliseconds) {
  signalOwnedGroup(pgid, ownerNonce, "SIGTERM");
  if (await waitForEmptyGroup(pgid, Math.ceil(waitMilliseconds / 100))) {
    return;
  }
  signalOwnedGroup(pgid, ownerNonce, "SIGKILL");
  if (!(await waitForEmptyGroup(pgid, 20))) {
    throw new Error(`owned process group ${pgid} survived SIGKILL`);
  }
}

async function recordJourneyExit(authority, ownerNonce, exitCode) {
  await assertRealJourneyLayout(
    authority.lease.repository,
    canonicalJourneyLayout(authority.lease),
  );
  const metadataPath = authority.metadataPath;
  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (code(error) === "ENOENT") {
      return;
    }
    throw error;
  }
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    metadata.authorityNonce !== ownerNonce ||
    metadata.pid !== process.pid ||
    metadata.pgid !== process.pid ||
    metadata.state !== "running"
  ) {
    throw new Error(`journey process metadata at ${metadataPath} changed owner`);
  }
  await writeJsonAtomically(metadataPath, {
    ...metadata,
    exitCode,
    exitedAt: new Date().toISOString(),
    state: "exited",
  });
}

function journeyId(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`invalid journey id ${JSON.stringify(value)}`);
  }
  return value;
}

function startProofPreparation(ready, release, manifest) {
  const body = [
    'const fs = require("node:fs");',
    "const ready = process.argv[1];",
    "const release = process.argv[2];",
    'fs.writeFileSync(ready, `${JSON.stringify({ pid: process.pid })}\\n`, { flag: "wx" });',
    "const timer = setInterval(() => {",
    "  if (fs.existsSync(release)) {",
    "    clearInterval(timer);",
    "    process.exit(0);",
    "  }",
    "}, 25);",
  ].join("\n");
  return startProofCommand(
    [process.execPath, "-e", body, ready, release],
    manifest,
  );
}

function startProofActivation(ready, release, manifest) {
  return startProofCommand(
    [process.execPath, "-e", "process.exit(0)"],
    manifest,
    {
      ZOEN_E2E_PREPARE_ACTIVATION_BARRIER_READY: ready,
      ZOEN_E2E_PREPARE_ACTIVATION_BARRIER_RELEASE: release,
    },
  );
}

function startProofReaderHold(ready, release) {
  const ownerNonce = randomBytes(32).toString("hex");
  const child = spawn(
    process.execPath,
    [
      scriptPath,
      "proof-reader-hold",
      "--owner-nonce",
      ownerNonce,
      "--ready",
      ready,
      "--release",
      release,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "ignore",
    },
  );
  return { child, completion: childCompletion(child), ownerNonce };
}

async function holdProofReaderCommand() {
  const ownerNonce = nonce(flag("--owner-nonce"));
  const ready = path.resolve(flag("--ready"));
  const release = path.resolve(flag("--release"));
  const repository = await realpath(process.cwd());
  const readerToken = execFileSync(
    process.execPath,
    [
      scriptPath,
      "reader-acquire",
      "--kind",
      "suite",
      "--owner-pid",
      String(process.pid),
      "--owner-pgid",
      String(process.pid),
      "--owner-nonce",
      ownerNonce,
    ],
    {
      cwd: repository,
      encoding: "utf8",
      env: process.env,
      timeout: 30_000,
    },
  ).trim();
  nonce(readerToken);
  try {
    await writeJsonAtomically(ready, {
      ownerNonce,
      ownerPgid: process.pid,
      ownerPid: process.pid,
      readerToken,
      stage: "reader-held",
    });
    await waitForFile(release);
  } finally {
    execFileSync(
      process.execPath,
      [
        scriptPath,
        "reader-release",
        "--reader-token",
        readerToken,
        "--owner-pid",
        String(process.pid),
        "--owner-nonce",
        ownerNonce,
      ],
      { cwd: repository, env: process.env, stdio: "ignore", timeout: 30_000 },
    );
  }
}

function assertPendingActivationAuthority(writer) {
  if (
    writer.state !== "pending" ||
    writer.ownerPid !== writer.ownerPgid ||
    processOwnership(writer.ownerPid, writer.ownerNonce) !== "owned"
  ) {
    throw new Error("activation proof writer is not verifiably pending");
  }
  if (
    !groupMembers(writer.ownerPgid).some(
      (member) =>
        member.command.includes("prepare-lock.mjs") &&
        member.command.includes("guardian") &&
        member.command.includes(writer.ownerNonce),
    )
  ) {
    throw new Error("activation proof writer has no ownership guardian");
  }
}

function startProofCommand(command, manifest, environment = {}) {
  const child = spawn(
    process.execPath,
    [scriptPath, "run", "--", ...command],
    {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        ...environment,
        ZOEN_E2E_BUILD_MANIFEST: manifest,
      },
      stdio: "ignore",
    },
  );
  return { child, completion: childCompletion(child) };
}

async function proofProbePid(marker) {
  const value = JSON.parse(await waitForFile(marker));
  if (
    value === null ||
    typeof value !== "object" ||
    !Number.isInteger(value.pid) ||
    value.pid < 1
  ) {
    throw new Error(`invalid preparation proof marker ${marker}`);
  }
  return value.pid;
}

async function proofHeldReaderToken(marker) {
  const value = JSON.parse(await waitForFile(marker));
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.readerToken !== "string" ||
    !noncePattern.test(value.readerToken) ||
    value.stage !== "reader-held"
  ) {
    throw new Error(`invalid real reader marker ${marker}`);
  }
  return value.readerToken;
}

async function assertProofActivationObservation(marker, readerToken) {
  const value = JSON.parse(await waitForFile(marker));
  if (
    value === null ||
    typeof value !== "object" ||
    value.stage !== "readers-reconciled" ||
    value.leaseCount !== 0 ||
    !Array.isArray(value.readerTokens) ||
    !value.readerTokens.includes(readerToken)
  ) {
    throw new Error(
      `preparation activation did not reconcile its real reader at ${marker}`,
    );
  }
}

async function waitForFile(candidate) {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (code(error) !== "ENOENT") {
        throw error;
      }
    }
    await delay(25);
  }
  throw new Error(`timed out waiting for ${candidate}`);
}

async function waitForMissingPath(candidate) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (!(await pathExists(candidate))) {
      return;
    }
    await delay(25);
  }
  throw new Error(`timed out waiting for ${candidate} to disappear`);
}

async function waitForMissingProcess(pid) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (processLiveness(pid) === "missing") {
      return;
    }
    await delay(25);
  }
  throw new Error(`timed out waiting for process ${pid} to exit`);
}

async function deadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function acquireBootstrapReaderCommand() {
  const ownerPid = positiveInteger(flag("--owner-pid"), "--owner-pid");
  const ownerPgid = positiveInteger(
    optionalFlag("--owner-pgid") ?? String(ownerPid),
    "--owner-pgid",
  );
  const guardianPidRaw = optionalFlag("--guardian-pid");
  const guardianPid =
    guardianPidRaw === undefined
      ? null
      : positiveInteger(guardianPidRaw, "--guardian-pid");
  const ownerNonce = nonce(flag("--owner-nonce"));
  const kind = readerKind(flag("--kind"));
  const parentToken = optionalFlag("--parent-token");
  const leaseContext = optionalFlag("--lease-context");
  if (processOwnership(ownerPid, ownerNonce) !== "owned") {
    throw new Error(`bootstrap reader owner ${ownerPid} is not verifiably owned`);
  }
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const readersRoot = path.join(registryRoot, "readers");
  await mkdir(readersRoot, { recursive: true });
  const token = randomBytes(32).toString("hex");

  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    const lock = await acquireOwnedLock(
      path.join(registryRoot, "allocation.lock"),
      ownerNonce,
    );
    let shouldWait = false;
    try {
      const readers = await reconcileBootstrapReaders(readersRoot);
      const parent =
        parentToken === undefined
          ? undefined
          : requiredReader(readers, nonce(parentToken), "suite");
      const leaseSponsored =
        leaseContext === undefined
          ? false
          : await hasExactLeaseSponsor(registryRoot, leaseContext);
      const writerDirectory = path.join(registryRoot, "preparation");
      const writer = await readOptionalWriter(writerDirectory);
      if (writer !== undefined) {
        if (await pathExists(path.join(writerDirectory, "quarantined.json"))) {
          throw new Error("preparation writer is quarantined");
        }
        const state = writerState(writer);
        if (state === "stale") {
          await removeStaleWriter(writerDirectory);
        } else if (state === "orphaned") {
          await terminateOrphanedWriter(writer);
          await removeStaleWriter(writerDirectory);
        } else if (state === "uncertain") {
          throw new Error("preparation writer ownership is uncertain");
        } else if (
          (parent === undefined && !leaseSponsored) ||
          writer.state !== "pending"
        ) {
          shouldWait = true;
        }
      }
      if (!shouldWait) {
        await publishBootstrapReader(readersRoot, {
          createdAt: new Date().toISOString(),
          guardianPid,
          kind,
          ownerNonce,
          ownerPgid,
          ownerPid,
          parentToken: parent?.token ?? null,
          token,
          version: 1,
        });
        process.stdout.write(`${token}\n`);
        return;
      }
    } finally {
      await releaseOwnedLock(lock, ownerNonce);
    }
    await delay(250);
  }
  throw new Error("timed out waiting to register a bootstrap reader");
}

async function hasExactLeaseSponsor(registryRoot, contextFile) {
  const repository = await realpath(process.cwd());
  const expectedRegistry = await runtimeRegistryRoot(repository);
  if (expectedRegistry !== registryRoot) {
    throw new Error("cleanup lease sponsor registry changed");
  }
  return (
    (await canonicalJourneyAuthority(repository, contextFile, true)) !== undefined
  );
}

async function canonicalJourneyAuthority(repository, contextFile, allowMissing = false) {
  const resolvedContext = path.resolve(contextFile);
  await assertSafeJourneyContextFileBeforeRead(repository, resolvedContext);
  const context = JSON.parse(await readFile(resolvedContext, "utf8"));
  const identity = parseJourneyContextIdentity(context, resolvedContext);
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  const numeric = path.join(slotsRoot, String(identity.slot).padStart(4, "0"));
  const suffix = `${path.basename(numeric)}-${identity.ownerToken.slice(0, 16)}`;
  const candidates = [
    numeric,
    path.join(slotsRoot, `.reaping-${suffix}`),
    path.join(slotsRoot, `.release-${suffix}`),
  ];
  const found = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "quarantined.json"))) {
      throw new Error(`journey lease ${candidate} is quarantined`);
    }
    try {
      const lease = parseJourneyLease(
        JSON.parse(await readFile(path.join(candidate, "lease.json"), "utf8")),
      );
      found.push({ candidate, lease });
    } catch (error) {
      if (code(error) !== "ENOENT") {
        throw error;
      }
    }
  }
  if (found.length === 0) {
    if (allowMissing) {
      return undefined;
    }
    throw new Error(`journey context ${resolvedContext} has no active lease`);
  }
  if (found.length !== 1) {
    throw new Error(`journey context ${resolvedContext} has conflicting leases`);
  }
  const lease = found[0].lease;
  const layout = canonicalJourneyLayout(lease);
  const expectedProject = expectedComposeProject(lease);
  const expectedPorts = expectedJourneyPorts(lease.slot);
  const expectedNames = expectedJourneyHttpNames(lease);
  if (
    lease.repository !== repository ||
    lease.contextFile !== layout.contextFile ||
    resolvedContext !== layout.contextFile ||
    identity.attempt !== lease.attempt ||
    identity.ownerToken !== lease.ownerToken ||
    identity.runId !== lease.runId ||
    identity.scenario !== lease.scenario ||
    identity.slot !== lease.slot ||
    identity.suiteId !== lease.suiteId ||
    context.paths.repository !== repository ||
    context.paths.runRoot !== layout.runRoot ||
    context.paths.artifacts !== layout.artifacts ||
    context.paths.generated !== layout.generated ||
    context.paths.logs !== layout.logs ||
    context.paths.process !== layout.process ||
    context.lease.directory !== numeric ||
    context.owner?.pid !== lease.ownerPid ||
    context.owner?.pgid !== lease.ownerPgid ||
    context.owner?.guardianPid !== lease.ownerGuardianPid ||
    context.owner?.nonce !== lease.ownerNonce ||
    JSON.stringify(context.ports) !== JSON.stringify(expectedPorts) ||
    JSON.stringify(context.httpNames) !== JSON.stringify(expectedNames) ||
    (context.compose?.kind === "compose"
      ? context.compose.project !== expectedProject ||
        context.compose.baseFile !==
          path.join(repository, "e2e", lease.scenario, "compose.yaml") ||
        context.compose.overrideFile !== path.join(layout.runRoot, "compose.owner.yaml") ||
        lease.composeProject !== expectedProject
      : context.compose?.kind !== "none" || lease.composeProject !== null)
  ) {
    throw new Error(`journey context ${resolvedContext} is not canonical`);
  }
  await assertRealJourneyLayout(repository, layout);
  return {
    context,
    contextFile: layout.contextFile,
    lease,
    metadataPath: path.join(layout.process, "scenario.json"),
  };
}

function parseJourneyContextIdentity(context, source) {
  if (
    context === null ||
    typeof context !== "object" ||
    !Number.isInteger(context.attempt) ||
    context.attempt < 1 ||
    context.contextVersion !== 1 ||
    typeof context.lease !== "object" ||
    !Number.isInteger(context.lease?.slot) ||
    context.lease.slot < 0 ||
    context.lease.slot >= 384 ||
    !noncePattern.test(context.lease?.ownerToken ?? "")
  ) {
    throw new Error(`invalid journey context ${source}`);
  }
  return {
    attempt: context.attempt,
    ownerToken: context.lease.ownerToken,
    runId: journeyId(context.runId),
    scenario: journeyId(context.scenario),
    slot: context.lease.slot,
    suiteId: journeyId(context.suiteId),
  };
}

function parseJourneyLease(lease) {
  if (
    lease === null ||
    typeof lease !== "object" ||
    !Number.isInteger(lease.attempt) ||
    lease.attempt < 1 ||
    !Number.isInteger(lease.ownerPid) ||
    lease.ownerPid < 1 ||
    !Number.isInteger(lease.ownerPgid) ||
    lease.ownerPgid < 1 ||
    !Number.isInteger(lease.ownerGuardianPid) ||
    lease.ownerGuardianPid < 1 ||
    !Number.isInteger(lease.slot) ||
    lease.slot < 0 ||
    lease.slot >= 384 ||
    !noncePattern.test(lease.ownerNonce ?? "") ||
    !noncePattern.test(lease.ownerToken ?? "") ||
    typeof lease.contextFile !== "string" ||
    typeof lease.repository !== "string" ||
    (lease.composeProject !== null && typeof lease.composeProject !== "string") ||
    lease.version !== 2
  ) {
    throw new Error("invalid journey lease");
  }
  journeyId(lease.runId);
  journeyId(lease.scenario);
  journeyId(lease.suiteId);
  return lease;
}

function canonicalJourneyLayout(identity) {
  const runRoot = path.join(
    identity.repository,
    "artifacts",
    "runs",
    identity.suiteId,
    identity.scenario,
    identity.runId,
    `attempt-${identity.attempt}`,
  );
  return {
    artifacts: path.join(runRoot, "artifacts", identity.scenario),
    contextFile: path.join(runRoot, "context.json"),
    generated: path.join(runRoot, "generated"),
    logs: path.join(runRoot, "logs"),
    process: path.join(runRoot, "process"),
    runRoot,
  };
}

function expectedJourneyPorts(slot) {
  const block = 20_000 + slot * 32;
  return {
    adapter: block + 13,
    auth: block + 2,
    connector: block + 7,
    effectWorker: block + 12,
    keycloak: block + 11,
    minio: block + 3,
    postgres: block,
    provider: block + 8,
    restateIngress: block + 5,
    restateNode: block + 4,
    restateUi: block + 6,
    worker: block + 9,
    workerControl: block + 10,
    zoend: block + 1,
  };
}

function expectedComposeProject(identity) {
  const worktreeKey = sha256(identity.repository).slice(0, 10);
  const runKey = sha256(`${identity.suiteId}\0${identity.scenario}\0${identity.runId}`);
  const suffix = sha256(`${worktreeKey}\0${runKey}\0${identity.attempt}`).slice(0, 20);
  const available = 63 - "zoen--".length - suffix.length;
  return `zoen-${identity.scenario.slice(0, available)}-${suffix}`;
}

function expectedJourneyHttpNames(identity) {
  const execution = dnsLabel(
    `${sha256(identity.repository).slice(0, 10)}-${identity.suiteId}-${identity.runId}-attempt-${identity.attempt}`,
  );
  const name = `${execution}.${dnsLabel(identity.scenario)}.zoen.localhost`;
  return { auth: `auth.${name}`, zoend: `zoend.${name}` };
}

function dnsLabel(value) {
  if (value.length <= 63) {
    return value;
  }
  return `${value.slice(0, 46).replace(/-+$/, "")}-${sha256(value).slice(0, 16)}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertConfinedJourneyContextFile(repository, contextFile) {
  const relative = path.relative(path.join(repository, "artifacts", "runs"), contextFile);
  const parts = relative.split(path.sep);
  if (
    path.isAbsolute(relative) ||
    relative.startsWith(`..${path.sep}`) ||
    parts.length !== 5 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0] ?? "") ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[1] ?? "") ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2] ?? "") ||
    !/^attempt-[1-9][0-9]*$/.test(parts[3] ?? "") ||
    parts[4] !== "context.json"
  ) {
    throw new Error(`journey context ${contextFile} escapes its canonical run layout`);
  }
}

async function assertSafeJourneyContextFileBeforeRead(repository, contextFile) {
  assertConfinedJourneyContextFile(repository, contextFile);
  let current = repository;
  for (const segment of path.relative(repository, path.dirname(contextFile)).split(path.sep)) {
    current = path.join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`journey context ancestor is unsafe: ${current}`);
    }
  }
  const metadata = await lstat(contextFile);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`journey context is not a regular file: ${contextFile}`);
  }
}

async function assertRealJourneyLayout(repository, layout) {
  const ancestors = [path.join(repository, "artifacts"), path.join(repository, "artifacts", "runs")];
  let current = ancestors[1];
  for (const segment of path.relative(current, layout.runRoot).split(path.sep)) {
    current = path.join(current, segment);
    ancestors.push(current);
  }
  for (const candidate of ancestors) {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`journey owned path is not a real directory: ${candidate}`);
    }
  }
  for (const candidate of [layout.artifacts, layout.generated, layout.logs, layout.process]) {
    let nested = layout.runRoot;
    for (const segment of path.relative(layout.runRoot, candidate).split(path.sep)) {
      nested = path.join(nested, segment);
      try {
        const metadata = await lstat(nested);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new Error(`journey owned path is not a real directory: ${nested}`);
        }
      } catch (error) {
        if (code(error) === "ENOENT") {
          break;
        }
        throw error;
      }
    }
  }
  const contextMetadata = await lstat(layout.contextFile);
  if (contextMetadata.isSymbolicLink() || !contextMetadata.isFile()) {
    throw new Error(`journey context is not a regular file: ${layout.contextFile}`);
  }
}

async function releaseBootstrapReaderCommand() {
  const token = nonce(flag("--reader-token"));
  const ownerPid = positiveInteger(flag("--owner-pid"), "--owner-pid");
  const ownerNonce = nonce(flag("--owner-nonce"));
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const lock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    ownerNonce,
  );
  try {
    const directory = path.join(registryRoot, "readers", token);
    if (!(await pathExists(directory))) {
      return;
    }
    const reader = parseReader(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
    if (
      reader.token !== token ||
      reader.ownerPid !== ownerPid ||
      reader.ownerNonce !== ownerNonce ||
      processOwnership(ownerPid, ownerNonce) !== "owned"
    ) {
      throw new Error("refusing to release a bootstrap reader owned by another process");
    }
    const releasing = `${directory}.release-${randomBytes(8).toString("hex")}`;
    await rename(directory, releasing);
    await rm(releasing, { force: true, recursive: true });
  } finally {
    await releaseOwnedLock(lock, ownerNonce);
  }
}

async function publishBootstrapReader(readersRoot, reader) {
  const claim = path.join(readersRoot, `.claim-${reader.token}`);
  const destination = path.join(readersRoot, reader.token);
  await mkdir(claim);
  try {
    await writeFile(
      path.join(claim, "owner.json"),
      `${JSON.stringify(reader, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(claim, destination);
  } catch (error) {
    await rm(claim, { force: true, recursive: true });
    throw error;
  }
}

async function reconcileBootstrapReaders(readersRoot) {
  await mkdir(readersRoot, { recursive: true });
  const readers = [];
  for (const entry of await readdir(readersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(readersRoot, entry.name);
    if (entry.name.startsWith(".claim-")) {
      await rm(directory, { force: true, recursive: true });
      continue;
    }
    if (entry.name.includes(".release-")) {
      await rm(directory, { force: true, recursive: true });
      continue;
    }
    if (!noncePattern.test(entry.name)) {
      throw new Error(`unknown bootstrap reader entry ${directory}`);
    }
    if (await pathExists(path.join(directory, "quarantined.json"))) {
      throw new Error(`bootstrap reader ${entry.name} is quarantined`);
    }
    let reader;
    try {
      reader = parseReader(
        JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
      );
      if (reader.token !== entry.name) {
        throw new Error("bootstrap reader token does not match its directory");
      }
    } catch (error) {
      await quarantineDirectory(directory, error);
      throw new Error(`bootstrap reader ${entry.name} is corrupt`, {
        cause: error,
      });
    }
    const ownership = processOwnership(reader.ownerPid, reader.ownerNonce);
    if (ownership === "owned") {
      readers.push(reader);
      continue;
    }
    if (ownership === "uncertain") {
      const error = new Error(
        `cannot inspect bootstrap reader owner ${reader.ownerPid}`,
      );
      await quarantineDirectory(directory, error);
      throw error;
    }
    if (reader.guardianPid !== null) {
      const group = inspectGroup(reader.ownerPgid);
      if (group.kind === "uncertain") {
        const error = new Error(
          `cannot inspect bootstrap reader group ${reader.ownerPgid}`,
        );
        await quarantineDirectory(directory, error);
        throw error;
      }
      if (group.kind === "members") {
        const anchored = group.members.some(
          (member) =>
            member.pid === reader.guardianPid &&
            member.command.includes("guardian") &&
            member.command.includes(reader.ownerNonce),
        );
        if (!anchored) {
          const error = new Error(
            `bootstrap reader group ${reader.ownerPgid} lost its ownership anchor`,
          );
          await quarantineDirectory(directory, error);
          throw error;
        }
        signalOwnedGroup(reader.ownerPgid, reader.ownerNonce, "SIGTERM");
        if (!(await waitForEmptyGroup(reader.ownerPgid, 50))) {
          signalOwnedGroup(reader.ownerPgid, reader.ownerNonce, "SIGKILL");
          if (!(await waitForEmptyGroup(reader.ownerPgid, 50))) {
            throw new Error(
              `bootstrap reader group ${reader.ownerPgid} survived SIGKILL`,
            );
          }
        }
      }
    }
    const stale = `${directory}.stale-${randomBytes(8).toString("hex")}`;
    await rename(directory, stale);
    await rm(stale, { force: true, recursive: true });
  }
  return readers;
}

function requiredReader(readers, token, expectedKind) {
  const reader = readers.find((candidate) => candidate.token === token);
  if (reader === undefined) {
    throw new Error(`bootstrap reader ${token} is not live`);
  }
  if (expectedKind !== undefined && reader.kind !== expectedKind) {
    throw new Error(
      `bootstrap reader ${token} must be a ${expectedKind} reader`,
    );
  }
  return reader;
}

async function removeStaleWriter(writerDirectory) {
  const stale = `${writerDirectory}.stale-${randomBytes(8).toString("hex")}`;
  await rename(writerDirectory, stale);
  await rm(stale, { force: true, recursive: true });
}

async function quarantineDirectory(directory, error) {
  await writeJsonAtomically(path.join(directory, "quarantined.json"), {
    quarantinedAt: new Date().toISOString(),
    reason: error instanceof Error ? error.message : String(error),
    status: "manual-reconciliation-required",
    version: 1,
  });
}

async function runController(command) {
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

async function runWorker(command) {
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

async function runGuardian() {
  const workerNonce = nonce(flag("--worker-nonce"));
  const ownerPgid = positiveInteger(flag("--owner-pgid"), "--owner-pgid");
  if (!process.argv.join("\0").includes(workerNonce)) {
    throw new Error("preparation guardian is missing its ownership nonce");
  }
  if (!groupMembers(ownerPgid).some((member) => member.pid === process.pid)) {
    throw new Error(
      `preparation guardian ${process.pid} is not in owned group ${ownerPgid}`,
    );
  }
  let parentConnected = process.connected;
  let terminating = false;
  process.once("message", (message) => {
    if (message === "stop" && !terminating) {
      process.exit(0);
    }
  });
  process.once("disconnect", () => {
    parentConnected = false;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      terminating = true;
      parentConnected = false;
    });
  }
  if (process.connected) {
    process.send?.({ kind: "ready", workerNonce });
  } else {
    parentConnected = false;
  }
  while (parentConnected) {
    await delay(250);
  }
  await terminateGuardianGroup(ownerPgid);
}

function waitForGuardianReady(guardian, workerNonce) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      guardian.kill("SIGKILL");
      reject(new Error("preparation guardian readiness timed out"));
    }, 5_000);
    const onMessage = (message) => {
      if (
        message !== null &&
        typeof message === "object" &&
        message.kind === "ready" &&
        message.workerNonce === workerNonce
      ) {
        cleanup();
        resolve();
      }
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error("preparation guardian disconnected before readiness"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      guardian.off("message", onMessage);
      guardian.off("disconnect", onDisconnect);
    };
    guardian.on("message", onMessage);
    guardian.once("disconnect", onDisconnect);
  });
}

async function stopGuardian(guardian, completion, ownerNonce) {
  if (guardian.connected) {
    guardian.send("stop");
  }
  let outcome;
  try {
    outcome = await deadline(
      completion,
      5_000,
      "ownership guardian did not stop after its clean request",
    );
  } catch (stopError) {
    const guardianPid = guardian.pid;
    if (
      guardianPid === undefined ||
      processOwnership(guardianPid, ownerNonce) !== "owned"
    ) {
      abandonChild(guardian);
      throw stopError;
    }
    guardian.kill("SIGTERM");
    try {
      outcome = await deadline(
        completion,
        5_000,
        "ownership guardian did not stop after SIGTERM",
      );
    } catch (termError) {
      if (processOwnership(guardianPid, ownerNonce) === "owned") {
        guardian.kill("SIGKILL");
      }
      try {
        outcome = await deadline(
          completion,
          2_000,
          "ownership guardian did not exit after SIGKILL",
        );
      } catch (killError) {
        abandonChild(guardian);
        throw new AggregateError(
          [stopError, termError, killError],
          "ownership guardian teardown did not converge",
        );
      }
    }
  }
  if (outcome.error !== undefined || outcome.code !== 0) {
    throw outcome.error ?? new Error("preparation ownership guardian failed");
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

async function readOptionalWriter(directory) {
  try {
    return parseWriter(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
  } catch (error) {
    if (code(error) === "ENOENT") {
      try {
        const metadata = await stat(directory);
        if (Date.now() - metadata.mtimeMs >= 5_000) {
          await removeStaleWriter(directory);
          return undefined;
        }
      } catch (statError) {
        if (code(statError) === "ENOENT") {
          return undefined;
        }
        throw statError;
      }
    }
    throw new Error(`preparation writer ${directory} is incomplete or corrupt`, {
      cause: error,
    });
  }
}

function writerState(writer) {
  const owner = processOwnership(writer.ownerPid, writer.ownerNonce);
  if (owner === "owned") {
    return "live";
  }
  if (owner === "uncertain") {
    return "uncertain";
  }
  const group = inspectGroup(writer.ownerPgid);
  if (group.kind === "empty") {
    return "stale";
  }
  if (group.kind === "uncertain") {
    return "uncertain";
  }
  return group.members.some(
    (member) =>
      member.command.includes("prepare-lock.mjs") &&
      member.command.includes("guardian") &&
      member.command.includes(writer.ownerNonce),
  )
    ? "orphaned"
    : "uncertain";
}

async function terminateOrphanedWriter(writer) {
  const inspection = inspectGroup(writer.ownerPgid);
  if (
    inspection.kind !== "members" ||
    !inspection.members.some(
      (member) =>
        member.command.includes("prepare-lock.mjs") &&
        member.command.includes("guardian") &&
        member.command.includes(writer.ownerNonce),
    )
  ) {
    throw new Error("refusing to signal an orphaned preparation without its guardian");
  }
  signalOwnedGroup(writer.ownerPgid, writer.ownerNonce, "SIGTERM");
  if (await waitForEmptyGroup(writer.ownerPgid, 50)) {
    return;
  }
  signalOwnedGroup(writer.ownerPgid, writer.ownerNonce, "SIGKILL");
  if (!(await waitForEmptyGroup(writer.ownerPgid, 50))) {
    throw new Error(`orphaned preparation group ${writer.ownerPgid} survived SIGKILL`);
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

async function acquireOwnedLock(directory, ownerNonce) {
  const token = randomBytes(32).toString("hex");
  await mkdir(path.dirname(directory), { recursive: true });
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    const claim = `${directory}.claim-${process.pid}-${token.slice(0, 16)}-${attempt}`;
    try {
      await mkdir(claim);
      await writeFile(
        path.join(claim, "owner.json"),
        `${JSON.stringify(
          { ownerNonce, ownerPid: process.pid, token, version: 1 },
          null,
          2,
        )}\n`,
        { flag: "wx" },
      );
      try {
        await rename(claim, directory);
        return { directory, token };
      } catch (error) {
        await rm(claim, { force: true, recursive: true });
        if (code(error) !== "EEXIST" && code(error) !== "ENOTEMPTY") {
          throw error;
        }
      }
    } catch (error) {
      if (code(error) !== "EEXIST") {
        throw error;
      }
    }
    const state = await lockState(directory);
    if (state === "uncertain") {
      throw new Error(`shared runtime lock ${directory} has uncertain ownership`);
    }
    if (state === "stale") {
      const stale = `${directory}.stale-${randomBytes(8).toString("hex")}`;
      try {
        await rename(directory, stale);
        await rm(stale, { force: true, recursive: true });
        continue;
      } catch (error) {
        if (code(error) !== "ENOENT") {
          throw error;
        }
      }
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for shared runtime lock ${directory}`);
}

async function releaseOwnedLock(lock, ownerNonce) {
  const owner = parseLockOwner(
    JSON.parse(await readFile(path.join(lock.directory, "owner.json"), "utf8")),
  );
  if (
    owner.ownerPid !== process.pid ||
    owner.ownerNonce !== ownerNonce ||
    owner.token !== lock.token
  ) {
    throw new Error("refusing to release a shared lock owned by another process");
  }
  const releasing = `${lock.directory}.release-${lock.token.slice(0, 16)}`;
  await rename(lock.directory, releasing);
  await rm(releasing, { force: true, recursive: true });
}

async function lockState(directory) {
  let text;
  try {
    text = await readFile(path.join(directory, "owner.json"), "utf8");
  } catch (error) {
    if (code(error) !== "ENOENT") {
      return "uncertain";
    }
    try {
      return Date.now() - (await stat(directory)).mtimeMs < 5_000
        ? "pending"
        : "stale";
    } catch (statError) {
      if (code(statError) === "ENOENT") {
        return "stale";
      }
      throw statError;
    }
  }
  let owner;
  try {
    owner = parseLockOwner(JSON.parse(text));
  } catch {
    return "uncertain";
  }
  const ownership = processOwnership(owner.ownerPid, owner.ownerNonce);
  if (ownership === "owned") {
    return "live";
  }
  return ownership === "missing" || ownership === "foreign"
    ? "stale"
    : "uncertain";
}

async function terminatePreparationDescendants(pgid, guardianPid) {
  const isOwnedDescendant = (member) =>
    member.pid !== process.pid && member.pid !== guardianPid;
  let members = groupMembers(pgid).filter(isOwnedDescendant);
  if (members.length === 0) {
    return;
  }
  signalProcesses(members.map((member) => member.pid), "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(100);
    members = groupMembers(pgid).filter(isOwnedDescendant);
    if (members.length === 0) {
      return;
    }
  }
  signalProcesses(members.map((member) => member.pid), "SIGKILL");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(100);
    members = groupMembers(pgid).filter(isOwnedDescendant);
    if (members.length === 0) {
      return;
    }
  }
  throw new Error(
    `preparation descendants survived SIGKILL: ${members.map((member) => member.pid).join(",")}`,
  );
}

async function terminateGuardianGroup(pgid) {
  let members = groupMembers(pgid).filter(
    (member) => member.pid !== process.pid,
  );
  signalProcesses(members.map((member) => member.pid), "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(100);
    members = groupMembers(pgid).filter(
      (member) => member.pid !== process.pid,
    );
    if (members.length === 0) {
      return;
    }
  }
  signalProcesses(members.map((member) => member.pid), "SIGKILL");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(100);
    members = groupMembers(pgid).filter(
      (member) => member.pid !== process.pid,
    );
    if (members.length === 0) {
      return;
    }
  }
  throw new Error(
    `orphaned preparation descendants survived SIGKILL: ${members.map((member) => member.pid).join(",")}`,
  );
}

function processOwnership(pid, ownerNonce) {
  const liveness = processLiveness(pid);
  if (liveness !== "alive") {
    return liveness;
  }
  const result = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: inspectionEnvironment(),
      killSignal: "SIGKILL",
      timeout: 5_000,
    },
  );
  if (
    result.error !== undefined ||
    result.status !== 0 ||
    result.stdout.trim() === ""
  ) {
    return processLiveness(pid) === "missing" ? "missing" : "uncertain";
  }
  return result.stdout.includes(ownerNonce) ? "owned" : "foreign";
}

function processLiveness(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return code(error) === "ESRCH" ? "missing" : "uncertain";
  }
}

function inspectGroup(pgid) {
  try {
    const members = groupMembers(pgid);
    return members.length === 0
      ? { kind: "empty" }
      : { kind: "members", members };
  } catch (error) {
    return { kind: "uncertain", reason: String(error) };
  }
}

function groupMembers(pgid) {
  const result = spawnSync("/bin/ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
    env: inspectionEnvironment(),
    killSignal: "SIGKILL",
    timeout: 5_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(result.error?.message ?? `ps exited ${String(result.status)}`);
  }
  if (!Number.isInteger(result.pid) || result.pid < 1) {
    throw new Error("ps did not report its inspection pid");
  }
  const inspectionPid = result.pid;
  return result.stdout.split("\n").flatMap((line) => {
    const match = /^\s*([0-9]+)\s+([0-9]+)\s+(.*)$/.exec(line);
    const memberPid = match?.[1] === undefined ? undefined : Number(match[1]);
    return memberPid !== undefined &&
      memberPid !== inspectionPid &&
      Number(match?.[2]) === pgid
      ? [{ command: match?.[3] ?? "", pid: memberPid }]
      : [];
  });
}

async function waitForEmptyGroup(pgid, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const group = inspectGroup(pgid);
    if (group.kind === "empty") {
      return true;
    }
    if (group.kind === "uncertain") {
      throw new Error(`cannot inspect preparation group ${pgid}: ${group.reason}`);
    }
    await delay(100);
  }
  return false;
}

function signalProcesses(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (code(error) !== "ESRCH") {
        throw error;
      }
    }
  }
}

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (code(error) !== "ESRCH") {
      throw error;
    }
  }
}

function signalOwnedGroup(pgid, ownerNonce, signal) {
  const group = inspectGroup(pgid);
  if (group.kind === "empty") {
    return;
  }
  if (group.kind === "uncertain") {
    throw new Error(`cannot inspect preparation group ${pgid}: ${group.reason}`);
  }
  const anchored = group.members.some(
    (member) =>
      member.command.includes(ownerNonce) &&
      (member.pid === pgid || member.command.includes("guardian")),
  );
  if (!anchored) {
    throw new Error(
      `refusing to signal preparation group ${pgid} without its ownership anchor`,
    );
  }
  signalGroup(pgid, signal);
}

function childCompletion(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };
    child.once("error", (error) => finish({ error }));
    child.once("exit", (code, signal) => finish({ code, signal }));
  });
}

async function runtimeRegistryRoot(repository) {
  const common = execFileSync(
    "/usr/bin/git",
    ["rev-parse", "--git-common-dir"],
    { cwd: repository, encoding: "utf8", env: inspectionEnvironment() },
  ).trim();
  return path.join(
    await realpath(path.resolve(repository, common)),
    "zoen-e2e",
    "runtime-v1",
  );
}

function parseWriter(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value.state !== "pending" && value.state !== "active") ||
    !Number.isInteger(value.ownerPid) ||
    value.ownerPid < 1 ||
    !Number.isInteger(value.ownerPgid) ||
    value.ownerPgid < 1 ||
    !noncePattern.test(value.ownerNonce) ||
    typeof value.createdAt !== "string" ||
    value.version !== 1
  ) {
    throw new Error("invalid preparation owner");
  }
  return value;
}

function parseLockOwner(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Number.isInteger(value.ownerPid) ||
    value.ownerPid < 1 ||
    !noncePattern.test(value.ownerNonce) ||
    !noncePattern.test(value.token) ||
    value.version !== 1
  ) {
    throw new Error("invalid shared runtime lock owner");
  }
  return value;
}

function parseReader(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.createdAt !== "string" ||
    (value.kind !== "journey" && value.kind !== "suite") ||
    !(
      value.guardianPid === null ||
      (Number.isInteger(value.guardianPid) && value.guardianPid > 0)
    ) ||
    !Number.isInteger(value.ownerPid) ||
    value.ownerPid < 1 ||
    !Number.isInteger(value.ownerPgid) ||
    value.ownerPgid < 1 ||
    !noncePattern.test(value.ownerNonce) ||
    !noncePattern.test(value.token) ||
    (value.parentToken !== null && !noncePattern.test(value.parentToken)) ||
    value.version !== 1
  ) {
    throw new Error("invalid bootstrap reader");
  }
  return value;
}

function isLeaseDirectory(name) {
  return (
    /^\d{4}$/.test(name) ||
    name.startsWith(".claim-") ||
    name.startsWith(".reaping-") ||
    name.startsWith(".release-")
  );
}

function commandAfterSeparator() {
  const separator = process.argv.indexOf("--");
  if (separator < 0) {
    throw new Error("missing -- before preparation command");
  }
  return process.argv.slice(separator + 1);
}

function flag(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalFlag(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function readerKind(value) {
  if (value !== "journey" && value !== "suite") {
    throw new Error("--kind must be journey or suite");
  }
  return value;
}

function nonce(value) {
  if (!noncePattern.test(value)) {
    throw new Error("process owner nonce must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function positiveInteger(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function writeJsonAtomically(outputPath, value) {
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
  });
  await rename(temporary, outputPath);
}

function inspectionEnvironment() {
  return { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" };
}

function code(error) {
  return error instanceof Error && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
}

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (code(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}
