import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { writeJsonAtomically } from "../journey-run-context.js";
import {
  bootstrapReaderSchema,
  lockOwnerSchema,
  nonceSchema,
  preparationOwnerSchema,
  preparedArtifactSnapshotSchema,
  preparedBuildSchema,
  type OwnedLock,
  type PreparedBuild,
} from "./runtime-contracts.js";
import {
  optionalFlag,
  positiveInteger,
  requiredFlag,
  runtimeOwnerNonce,
} from "./runtime-config.js";
import {
  fileExists,
  isAlreadyExists,
  isMissingFile,
  isPathOccupied,
} from "./runtime-support.js";
import {
  git,
  processInspectionEnvironment,
  processOwnership,
} from "./runtime-process-authority.js";

export async function assertRuntimeBootstrapReader(repository: string): Promise<void> {
  const registryRoot = await runtimeRegistryRoot(repository);
  const readerToken = nonceSchema.parse(requiredFlag("--reader-token"));
  const ownerPid = positiveInteger(
    requiredFlag("--reader-owner-pid"),
    "--reader-owner-pid",
  );
  const ownerNonce = nonceSchema.parse(requiredFlag("--reader-owner-nonce"));
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "runtime bootstrap reader validation",
  );
  try {
    await requiredBootstrapReader(
      registryRoot,
      readerToken,
      ownerPid,
      ownerNonce,
    );
    await assertPreparationAllowsReader(registryRoot);
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}


export async function runtimeRegistryRoot(repository: string): Promise<string> {
  const commonGitDirectory = await realpath(
    path.resolve(repository, git(repository, ["rev-parse", "--git-common-dir"])),
  );
  return path.join(commonGitDirectory, "zoen-e2e", "runtime-v1");
}

export async function assertPreparationAllowsReader(
  registryRoot: string,
): Promise<void> {
  const writerDirectory = path.join(registryRoot, "preparation");
  const writer = await readOptionalPreparationOwner(writerDirectory);
  if (writer === undefined) {
    return;
  }
  if (await fileExists(path.join(writerDirectory, "quarantined.json"))) {
    throw new Error(
      `journey allocation is blocked by quarantined preparation ${writerDirectory}`,
    );
  }
  if (writer.state === "active") {
    throw new Error(
      `journey allocation cannot coexist with active preparation ${writer.ownerPid}`,
    );
  }
}

export async function requiredBootstrapReader(
  registryRoot: string,
  token: string,
  ownerPid: number,
  ownerNonce: string,
  authority?: { readonly guardianPid: number; readonly pgid: number },
): Promise<z.infer<typeof bootstrapReaderSchema>> {
  const directory = path.join(registryRoot, "readers", token);
  if (await fileExists(path.join(directory, "quarantined.json"))) {
    throw new Error(`bootstrap reader ${token} is quarantined`);
  }
  let reader: z.infer<typeof bootstrapReaderSchema>;
  try {
    reader = bootstrapReaderSchema.parse(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
  } catch (error) {
    throw new Error(`bootstrap reader ${token} is missing or invalid`, {
      cause: error,
    });
  }
  if (
    reader.kind !== "journey" ||
    reader.token !== token ||
    reader.ownerPid !== ownerPid ||
    reader.ownerNonce !== ownerNonce ||
    (authority !== undefined &&
      (reader.ownerPgid !== authority.pgid ||
        reader.guardianPid !== authority.guardianPid))
  ) {
    throw new Error(`bootstrap reader ${token} does not own this journey`);
  }
  const ownership = processOwnership(reader.ownerPid, reader.ownerNonce);
  if (ownership.kind !== "owned") {
    throw new Error(
      `bootstrap reader ${token} owner is not verifiably live (${ownership.kind})`,
    );
  }
  return reader;
}

export async function releaseTransferredBootstrapReader(
  registryRoot: string,
  reader: z.infer<typeof bootstrapReaderSchema>,
): Promise<void> {
  const directory = path.join(registryRoot, "readers", reader.token);
  const releasing = `${directory}.release-${randomBytes(8).toString("hex")}`;
  await rename(directory, releasing);
  await rm(releasing, { force: true, recursive: true });
}

export async function releaseRuntimeBootstrapReaderIfRequested(): Promise<void> {
  const token = optionalFlag("--release-reader-token");
  if (token === undefined) {
    return;
  }
  const readerToken = nonceSchema.parse(token);
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "runtime bootstrap reader release",
  );
  try {
    const reader = await requiredBootstrapReader(
      registryRoot,
      readerToken,
      process.pid,
      runtimeOwnerNonce,
    );
    await releaseTransferredBootstrapReader(registryRoot, reader);
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

export async function assertActivePreparationWriter(
  registryRoot: string,
  writerPid: number,
  writerNonce: string,
): Promise<void> {
  const writerDirectory = path.join(registryRoot, "preparation");
  let writer: z.infer<typeof preparationOwnerSchema>;
  try {
    writer = preparationOwnerSchema.parse(
      JSON.parse(await readFile(path.join(writerDirectory, "owner.json"), "utf8")),
    );
  } catch (error) {
    throw new Error("prepared build publication requires the active preparation writer", {
      cause: error,
    });
  }
  if (
    writer.state !== "active" ||
    writer.ownerPid !== writerPid ||
    writer.ownerNonce !== writerNonce
  ) {
    throw new Error("prepared build publication writer ownership mismatch");
  }
  const ownership = processOwnership(writer.ownerPid, writer.ownerNonce);
  if (ownership.kind !== "owned") {
    throw new Error(
      `prepared build writer ${writer.ownerPid} is not verifiably owned (${ownership.kind})`,
    );
  }
}

export async function readOptionalPreparationOwner(
  directory: string,
): Promise<z.infer<typeof preparationOwnerSchema> | undefined> {
  try {
    return preparationOwnerSchema.parse(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error) && !(await fileExists(directory))) {
      return undefined;
    }
    throw new Error(
      `preparation authority ${directory} is incomplete or corrupt; allocation is blocked`,
      { cause: error },
    );
  }
}

export async function readPreparedBuild(repository: string): Promise<PreparedBuild> {
  const manifestPath = preparedBuildPath(repository);
  try {
    return preparedBuildSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (error) {
    throw new Error(
      `missing or invalid prepared build ${manifestPath}; run just build or just prepare`,
      { cause: error },
    );
  }
}

export function preparedArtifactSnapshot(
  repository: string,
  sourceSha: string,
): z.infer<typeof preparedArtifactSnapshotSchema> {
  const output = execFileSync(
    process.execPath,
    [
      path.join(repository, "e2e", "prepared-artifacts.mjs"),
      "snapshot",
      "--repository",
      repository,
      "--source-sha",
      sourceSha,
    ],
    {
      cwd: repository,
      encoding: "utf8",
      env: processInspectionEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  return preparedArtifactSnapshotSchema.parse(JSON.parse(output));
}

export function preparedBuildPath(repository: string): string {
  const override = process.env.ZOEN_E2E_BUILD_MANIFEST;
  return override === undefined || override === ""
    ? path.join(repository, ".cache", "e2e", "prepared.json")
    : path.resolve(repository, override);
}

export async function allocateAttempt(
  repository: string,
  suiteId: string,
  scenario: string,
  runId: string,
): Promise<number> {
  const root = path.join(repository, "artifacts", "runs", suiteId, scenario, runId);
  await mkdir(root, { recursive: true });
  for (let attempt = 1; attempt < 1_000_000; attempt += 1) {
    try {
      await mkdir(path.join(root, `attempt-${attempt}`));
      return attempt;
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
    }
  }
  throw new Error(`could not claim an attempt for ${suiteId}/${scenario}/${runId}`);
}


export async function acquireOwnedLock(
  directory: string,
  purpose: string,
): Promise<OwnedLock> {
  const ownerPid = process.pid;
  if (processOwnership(ownerPid, runtimeOwnerNonce).kind !== "owned") {
    throw new Error(`cannot identify ${purpose} lock owner ${ownerPid}`);
  }
  const token = randomBytes(32).toString("hex");
  await mkdir(path.dirname(directory), { recursive: true });
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    const claim = `${directory}.claim-${ownerPid}-${token.slice(0, 16)}-${attempt}`;
    try {
      await mkdir(claim);
      try {
        await writeJsonAtomically(path.join(claim, "owner.json"), {
          ownerNonce: runtimeOwnerNonce,
          ownerPid,
          token,
          version: 1,
        });
      } catch (error) {
        await rm(claim, { force: true, recursive: true });
        throw error;
      }
      try {
        await rename(claim, directory);
        return { directory, token };
      } catch (error) {
        await rm(claim, { force: true, recursive: true });
        if (!isPathOccupied(error)) {
          throw error;
        }
      }
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
    }
    const state = await ownedLockState(directory);
    if (state === "uncertain") {
      throw new Error(`${purpose} lock ${directory} has uncertain ownership`);
    }
    if (state === "stale") {
      const stale = `${directory}.stale-${randomBytes(8).toString("hex")}`;
      try {
        await rename(directory, stale);
        await rm(stale, { force: true, recursive: true });
        continue;
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${purpose} lock`);
}

export async function releaseOwnedLock(lock: OwnedLock): Promise<void> {
  const owner = lockOwnerSchema.parse(
    JSON.parse(await readFile(path.join(lock.directory, "owner.json"), "utf8")),
  );
  if (
    owner.ownerPid !== process.pid ||
    owner.ownerNonce !== runtimeOwnerNonce ||
    owner.token !== lock.token
  ) {
    throw new Error(`refusing to release a lock owned by another process`);
  }
  const releasing = `${lock.directory}.release-${lock.token.slice(0, 16)}`;
  await rename(lock.directory, releasing);
  await rm(releasing, { force: true, recursive: true });
}

export async function ownedLockState(
  directory: string,
): Promise<"live" | "pending" | "stale" | "uncertain"> {
  let serialized: string;
  try {
    serialized = await readFile(path.join(directory, "owner.json"), "utf8");
  } catch (error) {
    if (!isMissingFile(error)) {
      return "uncertain";
    }
    try {
      const age = Date.now() - (await stat(directory)).mtimeMs;
      return age < 5_000 ? "pending" : "stale";
    } catch (error) {
      if (isMissingFile(error)) {
        return "stale";
      }
      throw error;
    }
  }
  let owner: z.infer<typeof lockOwnerSchema>;
  try {
    owner = lockOwnerSchema.parse(JSON.parse(serialized));
  } catch {
    return "uncertain";
  }
  const ownership = processOwnership(owner.ownerPid, owner.ownerNonce);
  switch (ownership.kind) {
    case "owned":
      return "live";
    case "foreign":
    case "missing":
      return "stale";
    case "uncertain":
      return "uncertain";
    default: {
      const exhaustive: never = ownership;
      return exhaustive;
    }
  }
}
