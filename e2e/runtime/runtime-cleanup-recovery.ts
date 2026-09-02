import { randomBytes } from "node:crypto";
import { readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { writeJsonAtomically, type JourneyRunContext } from "../journey-run-context.js";
import {
  cleanupResultSchema,
  leaseSchema,
  lockOwnerSchema,
  nonceSchema,
  type CleanupClaim,
  type Lease,
} from "./runtime-contracts.js";
import {
  optionalFlag,
  positiveInteger,
  runtimeOwnerNonce,
} from "./runtime-config.js";
import {
  fileExists,
  isMissingFile,
} from "./runtime-support.js";
import { processOwnership } from "./runtime-process-authority.js";
import {
  acquireOwnedLock,
  releaseOwnedLock,
  runtimeRegistryRoot,
} from "./runtime-registry.js";
import {
  assertCanonicalContextLayout,
  contextForLease,
  readContext,
} from "./runtime-context.js";
import {
  cleanupOwnedResources,
  leaseAuthorityGroupState,
  reachReleaseProofBarrier,
} from "./runtime-resource-cleanup.js";
import {
  cleanupClaimPollAttempts,
  cleanupClaimPollIntervalMilliseconds,
  cleanupRecoveryAdmissionWindowMilliseconds,
} from "./runtime-timeouts.js";

export async function cleanupContext(
  context: JourneyRunContext,
): Promise<void> {
  for (let attempt = 0; attempt < cleanupClaimPollAttempts; attempt += 1) {
    const claim = await claimCleanup(context);
    if (claim === "done") {
      return;
    }
    if (claim === "busy") {
      await delay(cleanupClaimPollIntervalMilliseconds);
      continue;
    }
    await executeCleanupClaim(claim);
    return;
  }
  throw new Error(`timed out waiting to clean ${context.scenario}/${context.runId}`);
}

export async function drainCleanupRecoveries(
  contextFiles: readonly string[],
  operationStartedAt: number,
): Promise<void> {
  const pending = [...new Set(contextFiles)];
  for (let offset = 0; offset < pending.length; offset += 4) {
    if (
      Date.now() - operationStartedAt >=
      cleanupRecoveryAdmissionWindowMilliseconds
    ) {
      throw new Error("timed out reconciling stale journey leases");
    }
    await Promise.all(
      pending.slice(offset, offset + 4).map(async (contextFile) => {
        const context = await readContext(contextFile);
        await cleanupContext(context);
      }),
    );
  }
}

export async function claimCleanup(
  context: JourneyRunContext,
): Promise<CleanupClaim | "busy" | "done"> {
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  const numericDirectory = path.join(
    slotsRoot,
    String(context.lease.slot).padStart(4, "0"),
  );
  const suffix = `${String(context.lease.slot).padStart(4, "0")}-${context.lease.ownerToken.slice(0, 16)}`;
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "journey cleanup recovery",
  );
  try {
    const reaping = path.join(slotsRoot, `.reaping-${suffix}`);
    const released = path.join(slotsRoot, `.release-${suffix}`);
    if (await fileExists(numericDirectory)) {
      const numericLease = await requiredRecoveryLease(numericDirectory);
      const numericContext = await contextForLease(numericLease, numericDirectory);
      assertSameRunContext(context, numericContext);
      await rename(numericDirectory, reaping);
    }
    const directory = (await fileExists(reaping))
      ? reaping
      : (await fileExists(released))
        ? released
        : undefined;
    if (directory === undefined) {
      await assertCanonicalContextLayout(context, undefined, {
        leaseDirectory: numericDirectory,
        repository,
      });
      await finishReleasedCleanup(context);
      return "done";
    }
    if (await fileExists(path.join(directory, "quarantined.json"))) {
      throw new Error(`cleanup recovery for ${context.runId} is quarantined`);
    }
    const lease = await requiredRecoveryLease(directory);
    const recovered = await contextForLease(lease, directory);
    assertSameRunContext(context, recovered);
    const existing = await readOptionalCleanupOwner(directory);
    if (existing !== undefined) {
      const ownership = processOwnership(existing.ownerPid, existing.ownerNonce);
      if (
        ownership.kind === "owned" &&
        (existing.ownerPid !== process.pid ||
          existing.ownerNonce !== runtimeOwnerNonce)
      ) {
        return "busy";
      }
      if (ownership.kind === "uncertain") {
        await quarantineRecoveryDirectory(
          directory,
          new Error(`cleanup owner ${existing.ownerPid} is uncertain`),
        );
        throw new Error(`cleanup authority for ${context.runId} is uncertain`);
      }
    }
    const token = randomBytes(32).toString("hex");
    await writeJsonAtomically(path.join(directory, "cleaner.json"), {
      ownerNonce: runtimeOwnerNonce,
      ownerPid: process.pid,
      token,
      version: 1,
    });
    return {
      context: recovered,
      directory,
      lease,
      phase: directory === reaping ? "reaping" : "release",
      token,
    };
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

export async function executeCleanupClaim(claim: CleanupClaim): Promise<void> {
  let directory = claim.directory;
  if (claim.phase === "reaping") {
    await cleanupOwnedResources(claim.context);
    await writeCleanupResult(claim.context, "resources-clean");
    const slotsRoot = path.dirname(claim.context.lease.directory);
    const released = path.join(
      slotsRoot,
      `.release-${String(claim.lease.slot).padStart(4, "0")}-${claim.lease.ownerToken.slice(0, 16)}`,
    );
    const lock = await acquireOwnedLock(
      path.join(path.dirname(slotsRoot), "allocation.lock"),
      "journey cleanup transition",
    );
    try {
      await assertCleanupOwner(directory, claim.token);
      await rename(directory, released);
      directory = released;
    } finally {
      await releaseOwnedLock(lock);
    }
  }
  await reachReleaseProofBarrier(claim.context);
  await writeCleanupResult(claim.context, "clean");
  const slotsRoot = path.dirname(claim.context.lease.directory);
  const lock = await acquireOwnedLock(
    path.join(path.dirname(slotsRoot), "allocation.lock"),
    "journey cleanup completion",
  );
  try {
    await assertCleanupOwner(directory, claim.token);
    await rm(directory, { force: true, recursive: true });
  } finally {
    await releaseOwnedLock(lock);
  }
}

export async function readOptionalCleanupOwner(
  directory: string,
): Promise<z.infer<typeof lockOwnerSchema> | undefined> {
  try {
    return lockOwnerSchema.parse(
      JSON.parse(await readFile(path.join(directory, "cleaner.json"), "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    await quarantineRecoveryDirectory(directory, error);
    throw new Error(`invalid cleanup authority ${directory}`, { cause: error });
  }
}

export async function assertCleanupOwner(
  directory: string,
  token: string,
): Promise<void> {
  const owner = lockOwnerSchema.parse(
    JSON.parse(await readFile(path.join(directory, "cleaner.json"), "utf8")),
  );
  if (
    owner.ownerPid !== process.pid ||
    owner.ownerNonce !== runtimeOwnerNonce ||
    owner.token !== token ||
    processOwnership(owner.ownerPid, owner.ownerNonce).kind !== "owned"
  ) {
    throw new Error(`cleanup authority changed for ${directory}`);
  }
}

export async function requiredRecoveryLease(directory: string): Promise<Lease> {
  try {
    return leaseSchema.parse(
      JSON.parse(await readFile(path.join(directory, "lease.json"), "utf8")),
    );
  } catch (error) {
    await quarantineRecoveryDirectory(directory, error);
    throw new Error(`cleanup recovery lease is invalid at ${directory}`, {
      cause: error,
    });
  }
}

export function assertSameRunContext(
  expected: JourneyRunContext,
  recovered: JourneyRunContext,
): void {
  if (JSON.stringify(recovered) !== JSON.stringify(expected)) {
    throw new Error(
      `cleanup recovery context does not match ${expected.scenario}/${expected.runId}`,
    );
  }
}

export function authorizeCleanup(context: JourneyRunContext): void {
  const owner = processOwnership(context.owner.pid, context.owner.nonce);
  if (owner.kind === "uncertain") {
    throw new Error(
      `cannot inspect journey owner ${context.owner.pid}: ${owner.reason}`,
    );
  }
  if (owner.kind !== "owned") {
    return;
  }
  const callerPidRaw = optionalFlag("--caller-pid");
  const callerNonceRaw = optionalFlag("--caller-nonce");
  if (
    callerPidRaw === undefined ||
    callerNonceRaw === undefined ||
    positiveInteger(callerPidRaw, "--caller-pid") !== context.owner.pid ||
    nonceSchema.parse(callerNonceRaw) !== context.owner.nonce
  ) {
    throw new Error(
      `refusing to clean live journey ${context.runId} from a foreign caller`,
    );
  }
}

export async function finishReleasedCleanup(context: JourneyRunContext): Promise<void> {
  const cleanupPath = path.join(context.paths.runRoot, "cleanup.json");
  try {
    const cleanup = cleanupResultSchema.parse(
      JSON.parse(await readFile(cleanupPath, "utf8")),
    );
    if (cleanup.ownerToken !== context.lease.ownerToken) {
      throw new Error(`cleanup ownership mismatch for ${context.runId}`);
    }
    if (cleanup.status !== "clean") {
      throw new Error(
        `cleanup for ${context.runId} stopped before owned lease release`,
      );
    }
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(
        `lease for ${context.runId} disappeared without a clean release receipt`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function writeCleanupResult(
  context: JourneyRunContext,
  status: "resources-clean" | "clean",
): Promise<void> {
  await writeJsonAtomically(path.join(context.paths.runRoot, "cleanup.json"), {
    cleanedAt: new Date().toISOString(),
    ownerToken: context.lease.ownerToken,
    status,
    version: 1,
  });
}


export async function reconcileActiveLeases(
  slotsRoot: string,
): Promise<{
  readonly leases: Lease[];
  readonly recoveries: string[];
  readonly reservedSlots: ReadonlySet<number>;
  readonly uncertain: boolean;
}> {
  const leases: Lease[] = [];
  const recoveries: string[] = [];
  const reservedSlots = new Set<number>();
  let uncertain = false;
  const entries = await readdir(slotsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(slotsRoot, entry.name);
    if (entry.name.startsWith(".claim-")) {
      // Claims are never visible to a runner. Holding allocation.lock proves
      // the process that could have committed this staging directory is gone.
      await rm(directory, { force: true, recursive: true });
      continue;
    }
    if (entry.name.startsWith(".reaping-")) {
      const transition = await inspectCleanupTransition(directory);
      uncertain ||= transition.uncertain;
      if (transition.lease !== undefined) {
        leases.push(transition.lease);
        reservedSlots.add(transition.lease.slot);
      }
      if (transition.recover) {
        recoveries.push(transition.lease?.contextFile ?? "");
      }
      continue;
    }
    if (entry.name.startsWith(".release-")) {
      const transition = await inspectCleanupTransition(directory);
      uncertain ||= transition.uncertain;
      if (transition.lease !== undefined) {
        leases.push(transition.lease);
        reservedSlots.add(transition.lease.slot);
      }
      if (transition.recover) {
        recoveries.push(transition.lease?.contextFile ?? "");
      }
      continue;
    }
    if (!/^\d{4}$/.test(entry.name)) {
      continue;
    }
    const slotDirectory = directory;
    const numericSlot = Number.parseInt(entry.name, 10);
    reservedSlots.add(numericSlot);
    if (await fileExists(path.join(slotDirectory, "quarantined.json"))) {
      uncertain = true;
      continue;
    }
    try {
      const lease = leaseSchema.parse(
        JSON.parse(await readFile(path.join(slotDirectory, "lease.json"), "utf8")),
      );
      await contextForLease(lease, slotDirectory);
      const ownership = processOwnership(lease.ownerPid, lease.ownerNonce);
      if (ownership.kind === "owned") {
        leases.push(lease);
      } else if (ownership.kind === "uncertain") {
        uncertain = true;
      } else {
        const group = leaseAuthorityGroupState(lease);
        if (group === "owned" || group === "empty") {
          const reaping = path.join(
            slotsRoot,
            `.reaping-${entry.name}-${lease.ownerToken.slice(0, 16)}`,
          );
          await rename(slotDirectory, reaping);
          leases.push(lease);
          recoveries.push(lease.contextFile);
        } else {
          await quarantineRecoveryDirectory(
            slotDirectory,
            new Error(
              `stale journey authority group ${lease.ownerPgid} is ${group}`,
            ),
          );
          uncertain = true;
        }
      }
    } catch (error) {
      if (!(await fileExists(slotDirectory))) {
        continue;
      }
      const age = Date.now() - (await stat(slotDirectory)).mtimeMs;
      if (age < 5_000) {
        uncertain = true;
        continue;
      }
      await quarantineRecoveryDirectory(slotDirectory, error);
      uncertain = true;
    }
  }
  return {
    leases,
    recoveries: recoveries.filter((candidate) => candidate !== ""),
    reservedSlots,
    uncertain,
  };
}

export async function inspectCleanupTransition(directory: string): Promise<{
  readonly lease?: Lease;
  readonly recover: boolean;
  readonly uncertain: boolean;
}> {
  if (await fileExists(path.join(directory, "quarantined.json"))) {
    return { recover: false, uncertain: true };
  }
  const lease = await recoveryLease(directory);
  if (lease === undefined) {
    return { recover: false, uncertain: true };
  }
  if ((await recoveryContext(directory, lease)) === undefined) {
    return { lease, recover: false, uncertain: true };
  }
  const cleaner = await readOptionalCleanupOwner(directory);
  if (cleaner !== undefined) {
    const cleanerOwnership = processOwnership(
      cleaner.ownerPid,
      cleaner.ownerNonce,
    );
    if (cleanerOwnership.kind === "owned") {
      return { lease, recover: false, uncertain: false };
    }
    if (cleanerOwnership.kind === "uncertain") {
      await quarantineRecoveryDirectory(
        directory,
        new Error(`cleanup owner ${cleaner.ownerPid} is uncertain`),
      );
      return { lease, recover: false, uncertain: true };
    }
  }
  const leaseOwnership = processOwnership(lease.ownerPid, lease.ownerNonce);
  if (leaseOwnership.kind === "owned") {
    return { lease, recover: false, uncertain: false };
  }
  if (leaseOwnership.kind === "uncertain") {
    await quarantineRecoveryDirectory(
      directory,
      new Error(`journey owner ${lease.ownerPid} is uncertain`),
    );
    return { lease, recover: false, uncertain: true };
  }
  const group = leaseAuthorityGroupState(lease);
  if (group === "owned" || group === "empty") {
    return { lease, recover: true, uncertain: false };
  }
  await quarantineRecoveryDirectory(
    directory,
    new Error(`journey authority group ${lease.ownerPgid} is ${group}`),
  );
  return { lease, recover: false, uncertain: true };
}


export async function recoveryLease(directory: string): Promise<Lease | undefined> {
  try {
    return leaseSchema.parse(
      JSON.parse(await readFile(path.join(directory, "lease.json"), "utf8")),
    );
  } catch (error) {
    await quarantineRecoveryDirectory(directory, error);
    return undefined;
  }
}


export async function recoveryContext(
  directory: string,
  lease: Lease,
): Promise<JourneyRunContext | undefined> {
  try {
    return await contextForLease(lease, directory);
  } catch (error) {
    await quarantineRecoveryDirectory(directory, error);
    return undefined;
  }
}

export async function quarantineRecoveryDirectory(
  directory: string,
  error: unknown,
): Promise<void> {
  await writeJsonAtomically(path.join(directory, "quarantined.json"), {
    quarantinedAt: new Date().toISOString(),
    reason: error instanceof Error ? error.message : String(error),
    status: "manual-reconciliation-required",
    version: 1,
  });
}
