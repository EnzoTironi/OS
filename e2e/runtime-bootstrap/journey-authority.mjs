import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { code, writeJsonAtomically } from "./atomic-state.mjs";
import {
  flag,
  nonce,
  noncePattern,
  positiveInteger,
  scriptPath,
} from "./command-line.mjs";
import {
  assertRealJourneyLayout,
  canonicalJourneyAuthority,
  canonicalJourneyLayout,
  journeyId,
} from "./journey-contract.mjs";
import {
  childCompletion,
  deadline,
  groupMembers,
  stopGuardian,
  terminatePreparationDescendants,
  waitForAuthorityStart,
  waitForGuardianReady,
} from "./process-authority.mjs";

const journeyCleanupRuntimeTimeoutMilliseconds = 210_000;

export async function runJourneyCleaner() {
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

export async function runJourneyWorker() {
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

export async function publishJourneyProcessAuthority() {
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

export async function recordJourneyExit(authority, ownerNonce, exitCode) {
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
