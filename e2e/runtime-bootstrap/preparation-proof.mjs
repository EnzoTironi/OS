import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  code,
  pathExists,
  runtimeRegistryRoot,
  writeJsonAtomically,
} from "./atomic-state.mjs";
import { flag, nonce, noncePattern, scriptPath } from "./command-line.mjs";
import { proveContextConfinement } from "./context-confinement-proof.mjs";
import { journeyId } from "./journey-contract.mjs";
import {
  childCompletion,
  deadline,
  groupMembers,
  processLiveness,
  processOwnership,
  waitForEmptyGroup,
} from "./process-authority.mjs";
import { parseWriter } from "./runtime-registry.mjs";

export async function provePreparationCrashRecoveryCommand() {
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

export async function createRuntimeProofRootCommand() {
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

export async function holdProofReaderCommand() {
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
