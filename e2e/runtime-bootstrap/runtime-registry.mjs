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
import {
  flag,
  nonce,
  noncePattern,
  optionalFlag,
  positiveInteger,
  readerKind,
} from "./command-line.mjs";
import {
  canonicalJourneyAuthority,
  journeyBootstrapReaderCommandTimeoutMilliseconds,
} from "./journey-contract.mjs";
import {
  acquireOwnedLock,
  inspectProcessTable,
  processOwnership,
  processOwnershipInSnapshot,
  releaseOwnedLock,
  signalOwnedGroupsIfAnchored,
} from "./process-authority.mjs";

const bootstrapReaderExitHeadroomMilliseconds = 6_000;
const bootstrapRegistryReconciliationBudgetMilliseconds =
  journeyBootstrapReaderCommandTimeoutMilliseconds -
  bootstrapReaderExitHeadroomMilliseconds;
const maximumBootstrapReaderEntries = 768;
const processGroupPollIntervalMilliseconds = 100;
const ownedGroupSignalDrainMilliseconds = 5_000;
const registryMutationHeadroomMilliseconds = 1_000;

export async function acquireBootstrapReaderCommand() {
  const deadlineAt =
    Date.now() + bootstrapRegistryReconciliationBudgetMilliseconds;
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
  if (processOwnership(ownerPid, ownerNonce, deadlineAt) !== "owned") {
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
      deadlineAt,
    );
    let shouldWait = false;
    try {
      const writerDirectory = path.join(registryRoot, "preparation");
      const writer = await readOptionalWriter(writerDirectory);
      if (
        writer !== undefined &&
        (await pathExists(path.join(writerDirectory, "quarantined.json")))
      ) {
        throw new Error("preparation writer is quarantined");
      }
      const reconciliation = await reconcileBootstrapReaders(readersRoot, {
        deadlineAt,
        writer,
        writerDirectory,
      });
      const readers = reconciliation.readers;
      const parent =
        parentToken === undefined
          ? undefined
          : requiredReader(readers, nonce(parentToken), "suite");
      const leaseSponsored =
        leaseContext === undefined
          ? false
          : await hasExactLeaseSponsor(registryRoot, leaseContext);
      if (writer !== undefined) {
        const state = reconciliation.writerState;
        if (state === "stale" || state === "orphaned") {
          assertBeforeDeadline(deadlineAt, "preparation writer reconciliation");
          await removeStaleWriter(writerDirectory);
        } else if (
          (parent === undefined && !leaseSponsored) ||
          writer.state !== "pending"
        ) {
          shouldWait = true;
        }
      }
      if (!shouldWait) {
        if (readers.length >= maximumBootstrapReaderEntries) {
          throw new Error(
            `bootstrap registry reached its ${maximumBootstrapReaderEntries} live reader limit`,
          );
        }
        assertBeforeDeadline(deadlineAt, "bootstrap reader registration");
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
    const waitMilliseconds = Math.max(
      0,
      Math.min(250, deadlineAt - Date.now()),
    );
    if (waitMilliseconds === 0) {
      break;
    }
    await delay(waitMilliseconds);
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

export async function releaseBootstrapReaderCommand() {
  const deadlineAt =
    Date.now() + bootstrapRegistryReconciliationBudgetMilliseconds;
  const token = nonce(flag("--reader-token"));
  const ownerPid = positiveInteger(flag("--owner-pid"), "--owner-pid");
  const ownerNonce = nonce(flag("--owner-nonce"));
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const lock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    ownerNonce,
    deadlineAt,
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
      processOwnership(ownerPid, ownerNonce, deadlineAt) !== "owned"
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

export async function reconcileBootstrapReaders(readersRoot, options = {}) {
  if (options.writer !== undefined && options.writerDirectory === undefined) {
    throw new Error("preparation writer reconciliation requires its directory");
  }
  const deadlineAt =
    options.deadlineAt ??
    Date.now() + bootstrapRegistryReconciliationBudgetMilliseconds;
  await mkdir(readersRoot, { recursive: true });
  const candidates = [];
  const entries = await readdir(readersRoot, { withFileTypes: true });
  const stableEntryCount = entries.filter(
    (entry) => entry.isDirectory() && noncePattern.test(entry.name),
  ).length;
  if (stableEntryCount > maximumBootstrapReaderEntries) {
    throw new Error(
      `bootstrap registry exceeds its ${maximumBootstrapReaderEntries} reader entry limit`,
    );
  }
  for (const entry of entries) {
    assertBeforeDeadline(deadlineAt, "bootstrap reader reconciliation");
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
    candidates.push({ directory, reader });
  }

  const inspection = inspectProcessTable(deadlineAt);
  if (inspection.kind === "uncertain") {
    throw new Error(
      `cannot inspect bootstrap registry processes: ${inspection.reason}`,
    );
  }
  const readers = [];
  const livePgids = new Set();
  const staleReaders = [];
  for (const candidate of candidates) {
    assertBeforeDeadline(deadlineAt, "bootstrap reader reconciliation");
    const { directory, reader } = candidate;
    const ownership = processOwnershipInSnapshot(
      reader.ownerPid,
      reader.ownerNonce,
      inspection.members,
    );
    if (ownership === "owned") {
      readers.push(reader);
      livePgids.add(reader.ownerPgid);
      continue;
    }
    if (ownership === "uncertain") {
      const error = new Error(
        `cannot inspect bootstrap reader owner ${reader.ownerPid}`,
      );
      await quarantineDirectory(directory, error);
      throw error;
    }
    staleReaders.push({
      directory,
      group:
        reader.guardianPid === null
          ? undefined
          : {
              directory,
              guardianPid: reader.guardianPid,
              label: "bootstrap reader",
              ownerNonce: reader.ownerNonce,
              pgid: reader.ownerPgid,
            },
    });
  }

  const writerStateValue =
    options.writer === undefined
      ? undefined
      : writerStateInSnapshot(options.writer, inspection.members);
  if (writerStateValue === "uncertain") {
    throw new Error("preparation writer ownership is uncertain");
  }
  if (writerStateValue === "live") {
    livePgids.add(options.writer.ownerPgid);
  }
  const writerGroup =
    writerStateValue === "orphaned"
      ? {
          directory: options.writerDirectory,
          guardianPid: null,
          label: "orphaned preparation",
          ownerNonce: options.writer.ownerNonce,
          pgid: options.writer.ownerPgid,
        }
      : undefined;
  const groups = staleReaders.flatMap((candidate) =>
    candidate.group === undefined ? [] : [candidate.group],
  );
  if (writerGroup !== undefined) {
    groups.push(writerGroup);
  }
  for (const group of groups) {
    if (livePgids.has(group.pgid)) {
      const error = new Error(
        `${group.label} group ${group.pgid} overlaps a live runtime owner`,
      );
      await quarantineDirectory(group.directory, error);
      throw error;
    }
  }
  const groupFailures = await drainOrphanedGroups(groups, deadlineAt);
  if (groupFailures.size > 0) {
    const failures = [];
    for (const [group, failure] of groupFailures) {
      failures.push(failure);
      try {
        await quarantineDirectory(group.directory, failure);
      } catch (quarantineError) {
        failures.push(quarantineError);
      }
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    throw new AggregateError(
      failures,
      "orphaned runtime groups did not converge",
    );
  }
  for (const candidate of staleReaders) {
    assertBeforeDeadline(deadlineAt, "bootstrap reader reconciliation");
    const directory = candidate.directory;
    const stale = `${directory}.stale-${randomBytes(8).toString("hex")}`;
    await rename(directory, stale);
    await rm(stale, { force: true, recursive: true });
  }
  return { readers, writerState: writerStateValue };
}

function writerStateInSnapshot(writer, members) {
  const owner = processOwnershipInSnapshot(
    writer.ownerPid,
    writer.ownerNonce,
    members,
  );
  if (owner === "owned") {
    return "live";
  }
  if (owner === "uncertain") {
    return "uncertain";
  }
  const group = members.filter((member) => member.pgid === writer.ownerPgid);
  if (group.length === 0) {
    return "stale";
  }
  return group.some(
    (member) =>
      member.command.includes("prepare-lock.mjs") &&
      member.command.includes("guardian") &&
      member.command.includes(writer.ownerNonce),
  )
    ? "orphaned"
    : "uncertain";
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

export async function removeStaleWriter(writerDirectory) {
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

export async function readOptionalWriter(directory) {
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

async function drainOrphanedGroups(groups, deadlineAt) {
  const failures = new Map();
  const pending = new Set(groups);
  if (pending.size === 0) {
    return failures;
  }
  const drainDeadlineAt = deadlineAt - registryMutationHeadroomMilliseconds;
  const termDrainDeadlineAt = Date.now() + ownedGroupSignalDrainMilliseconds;
  const killDrainDeadlineAt =
    termDrainDeadlineAt + ownedGroupSignalDrainMilliseconds;
  if (killDrainDeadlineAt > drainDeadlineAt) {
    throw new Error("bootstrap group drain has no complete signaling window");
  }
  const termAnchorMissing = signalPendingGroups(
    pending,
    failures,
    "SIGTERM",
    termDrainDeadlineAt,
  );
  await observePendingGroups(pending, failures, termDrainDeadlineAt);
  for (const group of termAnchorMissing) {
    if (pending.delete(group)) {
      failures.set(
        group,
        new Error(`${group.label} group ${group.pgid} lost its ownership anchor`),
      );
    }
  }
  if (pending.size === 0) {
    return failures;
  }
  const killAnchorMissing = signalPendingGroups(
    pending,
    failures,
    "SIGKILL",
    killDrainDeadlineAt,
  );
  await observePendingGroups(pending, failures, killDrainDeadlineAt);
  for (const group of pending) {
    failures.set(
      group,
      killAnchorMissing.has(group)
        ? new Error(
            `${group.label} group ${group.pgid} lost its ownership anchor`,
          )
        : new Error(`${group.label} group ${group.pgid} survived SIGKILL`),
    );
  }
  return failures;
}

function signalPendingGroups(pending, failures, signal, deadlineAt) {
  const anchorMissing = new Set();
  const results = signalOwnedGroupsIfAnchored([...pending], signal, deadlineAt);
  for (const result of results) {
    if (result.kind === "empty") {
      pending.delete(result.group);
    } else if (result.kind === "anchor-missing") {
      anchorMissing.add(result.group);
    } else if (result.kind === "uncertain") {
      pending.delete(result.group);
      failures.set(
        result.group,
        new Error(
          `cannot inspect ${result.group.label} group ${result.group.pgid}: ${result.reason}`,
        ),
      );
    }
  }
  return anchorMissing;
}

async function observePendingGroups(pending, failures, deadlineAt) {
  while (pending.size > 0 && Date.now() < deadlineAt) {
    const inspection = inspectProcessTable(deadlineAt);
    if (inspection.kind === "uncertain") {
      if (Date.now() >= deadlineAt) {
        return;
      }
      for (const group of pending) {
        failures.set(
          group,
          new Error(
            `cannot inspect ${group.label} group ${group.pgid}: ${inspection.reason}`,
          ),
        );
      }
      pending.clear();
      return;
    }
    const liveGroups = new Set(inspection.members.map((member) => member.pgid));
    for (const group of pending) {
      if (!liveGroups.has(group.pgid)) {
        pending.delete(group);
      }
    }
    const waitMilliseconds = Math.max(
      0,
      Math.min(
        processGroupPollIntervalMilliseconds,
        deadlineAt - Date.now(),
      ),
    );
    if (pending.size > 0 && waitMilliseconds > 0) {
      await delay(waitMilliseconds);
    }
  }
}

function assertBeforeDeadline(deadlineAt, label) {
  if (Date.now() >= deadlineAt) {
    throw new Error(`${label} exceeded its internal deadline`);
  }
}

export function parseWriter(value) {
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
