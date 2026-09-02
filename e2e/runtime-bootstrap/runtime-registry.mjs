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
import { canonicalJourneyAuthority } from "./journey-contract.mjs";
import {
  acquireOwnedLock,
  inspectGroup,
  processOwnership,
  releaseOwnedLock,
  signalOwnedGroupIfAnchored,
  waitForEmptyGroup,
} from "./process-authority.mjs";

const guardianNaturalDrainAttempts = 110;
const ownedGroupSignalDrainAttempts = 50;

export async function acquireBootstrapReaderCommand() {
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
          await terminateOrphanedWriter(writer, writerDirectory);
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

export async function releaseBootstrapReaderCommand() {
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

export async function reconcileBootstrapReaders(readersRoot) {
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
      try {
        await drainOrphanedGroup({
          guardianPid: reader.guardianPid,
          label: "bootstrap reader",
          ownerNonce: reader.ownerNonce,
          pgid: reader.ownerPgid,
        });
      } catch (error) {
        await quarantineDirectory(directory, error);
        throw error;
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

export function writerState(writer) {
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

export async function terminateOrphanedWriter(writer, writerDirectory) {
  try {
    await drainOrphanedGroup({
      label: "orphaned preparation",
      ownerNonce: writer.ownerNonce,
      pgid: writer.ownerPgid,
    });
  } catch (error) {
    await quarantineDirectory(writerDirectory, error);
    throw error;
  }
}

async function drainOrphanedGroup(group) {
  if (await waitForEmptyGroup(group.pgid, guardianNaturalDrainAttempts)) {
    return;
  }
  const term = await signalOrObserveOwnedGroup(group, "SIGTERM");
  if (term === "empty") {
    return;
  }
  if (term === "anchor-missing") {
    throw new Error(
      `${group.label} group ${group.pgid} lost its ownership anchor`,
    );
  }
  const kill = await signalOrObserveOwnedGroup(group, "SIGKILL");
  if (kill === "empty") {
    return;
  }
  if (kill === "anchor-missing") {
    throw new Error(
      `${group.label} group ${group.pgid} lost its ownership anchor`,
    );
  }
  throw new Error(`${group.label} group ${group.pgid} survived SIGKILL`);
}

async function signalOrObserveOwnedGroup(group, signal) {
  const result = signalOwnedGroupIfAnchored(
    group.pgid,
    group.ownerNonce,
    signal,
    { pid: group.guardianPid },
  );
  if (result.kind === "uncertain") {
    throw new Error(
      `cannot inspect ${group.label} group ${group.pgid}: ${result.reason}`,
    );
  }
  if (result.kind === "empty") {
    return "empty";
  }
  const empty = await waitForEmptyGroup(
    group.pgid,
    ownedGroupSignalDrainAttempts,
  );
  if (empty) {
    return "empty";
  }
  return result.kind;
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
