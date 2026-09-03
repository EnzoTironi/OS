import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { code, inspectionEnvironment } from "./atomic-state.mjs";
import { flag, nonce, noncePattern, positiveInteger } from "./command-line.mjs";

const processInspectionTimeoutMilliseconds = 5_000;
const deadlineScopedProcessInspectionTimeoutMilliseconds = 1_000;

export function abandonChild(child) {
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  if (child.connected) {
    child.disconnect();
  }
  child.unref();
}

export async function armAuthorityChild(
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

export async function waitForAuthorityStart(ownerNonce, kind) {
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

export async function terminateOwnedAuthority(pgid, ownerNonce, waitMilliseconds) {
  signalOwnedGroup(pgid, ownerNonce, "SIGTERM");
  if (await waitForEmptyGroup(pgid, Math.ceil(waitMilliseconds / 100))) {
    return;
  }
  signalOwnedGroup(pgid, ownerNonce, "SIGKILL");
  if (!(await waitForEmptyGroup(pgid, 20))) {
    throw new Error(`owned process group ${pgid} survived SIGKILL`);
  }
}

export async function deadline(promise, milliseconds, message) {
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

export async function runGuardian() {
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

export function waitForGuardianReady(guardian, workerNonce) {
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

export async function stopGuardian(guardian, completion, ownerNonce) {
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

export async function acquireOwnedLock(directory, ownerNonce, deadlineAt) {
  const token = randomBytes(32).toString("hex");
  await mkdir(path.dirname(directory), { recursive: true });
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
      break;
    }
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
    const state = await lockState(directory, deadlineAt);
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
    const waitMilliseconds =
      deadlineAt === undefined
        ? 250
        : Math.max(0, Math.min(250, deadlineAt - Date.now()));
    if (waitMilliseconds === 0) {
      break;
    }
    await delay(waitMilliseconds);
  }
  throw new Error(`timed out waiting for shared runtime lock ${directory}`);
}

export async function releaseOwnedLock(lock, ownerNonce) {
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

async function lockState(directory, deadlineAt) {
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
  const ownership = processOwnership(
    owner.ownerPid,
    owner.ownerNonce,
    deadlineAt,
  );
  if (ownership === "owned") {
    return "live";
  }
  return ownership === "missing" || ownership === "foreign"
    ? "stale"
    : "uncertain";
}

export async function terminatePreparationDescendants(pgid, guardianPid) {
  await terminateSelectedGroupMembers(
    pgid,
    (member) => member.pid !== process.pid && member.pid !== guardianPid,
    "preparation descendants",
  );
}

async function terminateGuardianGroup(pgid) {
  await terminateSelectedGroupMembers(
    pgid,
    (member) => member.pid !== process.pid,
    "orphaned preparation descendants",
  );
}

async function terminateSelectedGroupMembers(pgid, predicate, label) {
  const termDeadlineAt = Date.now() + 5_000;
  const killDeadlineAt = termDeadlineAt + 5_000;
  let members = groupMembers(pgid, termDeadlineAt).filter(predicate);
  if (members.length === 0) {
    return;
  }
  signalProcesses(members.map((member) => member.pid), "SIGTERM");
  members = await waitForGroupMembersToExit(
    pgid,
    members,
    predicate,
    termDeadlineAt,
  );
  if (members.length === 0) {
    return;
  }
  members = groupMembers(pgid, killDeadlineAt).filter(predicate);
  if (members.length === 0) {
    return;
  }
  signalProcesses(members.map((member) => member.pid), "SIGKILL");
  members = await waitForGroupMembersToExit(
    pgid,
    members,
    predicate,
    killDeadlineAt,
  );
  if (members.length > 0) {
    throw new Error(
      `${label} survived SIGKILL: ${members.map((member) => member.pid).join(",")}`,
    );
  }
}

export function processOwnership(pid, ownerNonce, deadlineAt) {
  const liveness = processLiveness(pid);
  if (liveness !== "alive") {
    return liveness;
  }
  const timeout = inspectionTimeout(deadlineAt);
  if (timeout === 0) {
    return "uncertain";
  }
  const result = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: inspectionEnvironment(),
      killSignal: "SIGKILL",
      timeout,
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

export function processLiveness(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return code(error) === "ESRCH" ? "missing" : "uncertain";
  }
}

export function inspectGroup(pgid, deadlineAt) {
  try {
    const members = groupMembers(pgid, deadlineAt);
    return members.length === 0
      ? { kind: "empty" }
      : { kind: "members", members };
  } catch (error) {
    return { kind: "uncertain", reason: String(error) };
  }
}

export function inspectProcessTable(deadlineAt) {
  try {
    return { kind: "members", members: processTableMembers(deadlineAt) };
  } catch (error) {
    return { kind: "uncertain", reason: String(error) };
  }
}

export function processOwnershipInSnapshot(pid, ownerNonce, members) {
  const member = members.find((candidate) => candidate.pid === pid);
  if (member !== undefined) {
    return member.command.includes(ownerNonce) ? "owned" : "foreign";
  }
  return processLiveness(pid) === "missing" ? "missing" : "uncertain";
}

export function groupMembers(pgid, deadlineAt) {
  return processTableMembers(deadlineAt)
    .filter((member) => member.pgid === pgid)
    .map(({ command, pid }) => ({ command, pid }));
}

function processTableMembers(deadlineAt) {
  const timeout = inspectionTimeout(deadlineAt);
  if (timeout === 0) {
    throw new Error("process inspection deadline expired");
  }
  const result = spawnSync("/bin/ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
    env: inspectionEnvironment(),
    killSignal: "SIGKILL",
    timeout,
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
    const memberPgid = match?.[2] === undefined ? undefined : Number(match[2]);
    return memberPid !== undefined &&
      memberPgid !== undefined &&
      memberPid !== inspectionPid
      ? [
          {
            command: match?.[3] ?? "",
            pgid: memberPgid,
            pid: memberPid,
          },
        ]
      : [];
  });
}

function inspectionTimeout(deadlineAt) {
  if (deadlineAt === undefined) {
    return processInspectionTimeoutMilliseconds;
  }
  return Math.max(
    0,
    Math.min(
      deadlineScopedProcessInspectionTimeoutMilliseconds,
      Math.ceil(deadlineAt - Date.now()),
    ),
  );
}

export async function waitForEmptyGroup(pgid, attempts) {
  const deadlineAt = Date.now() + attempts * 100;
  while (Date.now() < deadlineAt) {
    const group = inspectGroup(pgid, deadlineAt);
    if (group.kind === "empty") {
      return true;
    }
    if (group.kind === "uncertain") {
      if (Date.now() >= deadlineAt) {
        return false;
      }
      throw new Error(`cannot inspect preparation group ${pgid}: ${group.reason}`);
    }
    await delay(Math.max(0, Math.min(100, deadlineAt - Date.now())));
  }
  return false;
}

async function waitForGroupMembersToExit(
  pgid,
  initialMembers,
  predicate,
  deadlineAt,
) {
  let members = initialMembers;
  while (members.length > 0 && Date.now() < deadlineAt) {
    await delay(Math.max(0, Math.min(100, deadlineAt - Date.now())));
    if (Date.now() >= deadlineAt) {
      break;
    }
    try {
      members = groupMembers(pgid, deadlineAt).filter(predicate);
    } catch (error) {
      if (Date.now() >= deadlineAt) {
        return members;
      }
      throw error;
    }
  }
  return members;
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

export function signalOwnedGroup(pgid, ownerNonce, signal) {
  const result = signalOwnedGroupIfAnchored(pgid, ownerNonce, signal);
  if (result.kind === "empty" || result.kind === "signaled") {
    return;
  }
  if (result.kind === "uncertain") {
    throw new Error(`cannot inspect preparation group ${pgid}: ${result.reason}`);
  }
  throw new Error(
    `refusing to signal preparation group ${pgid} without its ownership anchor`,
  );
}

export function signalOwnedGroupIfAnchored(
  pgid,
  ownerNonce,
  signal,
  requiredGuardian,
) {
  const group = inspectGroup(pgid);
  if (group.kind === "empty") {
    return { kind: "empty" };
  }
  if (group.kind === "uncertain") {
    return group;
  }
  if (!hasOwnershipAnchor(group.members, pgid, ownerNonce, requiredGuardian)) {
    return { kind: "anchor-missing" };
  }
  signalGroup(pgid, signal);
  return { kind: "signaled" };
}

export function signalOwnedGroupsIfAnchored(groups, signal, deadlineAt) {
  const inspection = inspectProcessTable(deadlineAt);
  if (inspection.kind === "uncertain") {
    return groups.map((group) => ({
      group,
      kind: "uncertain",
      reason: inspection.reason,
    }));
  }
  const requestedGroups = new Set(groups.map((group) => group.pgid));
  const membersByGroup = new Map();
  for (const member of inspection.members) {
    if (!requestedGroups.has(member.pgid)) {
      continue;
    }
    const members = membersByGroup.get(member.pgid) ?? [];
    members.push({ command: member.command, pid: member.pid });
    membersByGroup.set(member.pgid, members);
  }
  const signaled = new Set();
  return groups.map((group) => {
    const members = membersByGroup.get(group.pgid) ?? [];
    if (members.length === 0) {
      return { group, kind: "empty" };
    }
    if (
      !hasOwnershipAnchor(
        members,
        group.pgid,
        group.ownerNonce,
        { pid: group.guardianPid ?? undefined },
      )
    ) {
      return { group, kind: "anchor-missing" };
    }
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
      return {
        group,
        kind: "uncertain",
        reason: "process signaling deadline expired",
      };
    }
    try {
      if (!signaled.has(group.pgid)) {
        signalGroup(group.pgid, signal);
        signaled.add(group.pgid);
      }
      return { group, kind: "signaled" };
    } catch (error) {
      return { group, kind: "uncertain", reason: String(error) };
    }
  });
}

function hasOwnershipAnchor(members, pgid, ownerNonce, requiredGuardian) {
  return members.some(
    (member) =>
      member.command.includes(ownerNonce) &&
      (requiredGuardian === undefined
        ? member.pid === pgid || member.command.includes("guardian")
        : member.command.includes("prepare-lock.mjs") &&
          member.command.includes("guardian") &&
          (requiredGuardian.pid === undefined ||
            member.pid === requiredGuardian.pid)),
  );
}

export function childCompletion(child) {
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
