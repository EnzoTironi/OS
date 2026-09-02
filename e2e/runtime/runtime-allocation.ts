import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:net";
import { mkdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { writeJsonAtomically } from "../journey-run-context.js";
import {
  journeyPortAt,
  journeyPortBlockWidth,
  journeyPortSlotCount,
  preferredJourneyPortSlot,
} from "../journey-runtime-layout.js";
import {
  idSchema,
  nonceSchema,
  runtimeProofBarrierStageSchema,
  type Lease,
  type RuntimeProofBarrierStage,
} from "./runtime-contracts.js";
import {
  booleanFlag,
  positiveInteger,
  requiredFlag,
} from "./runtime-config.js";
import {
  composeProjectName,
  digest,
  fileExists,
} from "./runtime-support.js";
import {
  assertCleanWorktree,
  assertJourneyAuthorityGroup,
  git,
  processOwnership,
} from "./runtime-process-authority.js";
import {
  acquireOwnedLock,
  allocateAttempt,
  assertPreparationAllowsReader,
  readPreparedBuild,
  releaseOwnedLock,
  releaseTransferredBootstrapReader,
  requiredBootstrapReader,
  runtimeRegistryRoot,
} from "./runtime-registry.js";
import { makeContext } from "./runtime-context.js";
import {
  drainCleanupRecoveries,
  reconcileActiveLeases,
} from "./runtime-cleanup-recovery.js";
import {
  cleanupClaimPollIntervalMilliseconds,
  runtimeCommandTimeoutMilliseconds,
} from "./runtime-timeouts.js";

export async function allocateCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const scenario = idSchema.parse(requiredFlag("--scenario"));
  const suiteId = idSchema.parse(requiredFlag("--suite-id"));
  const runId = idSchema.parse(requiredFlag("--run-id"));
  const composeEnabled = requiredFlag("--compose") === "true";
  const exclusive = booleanFlag("--exclusive");
  const ownerPid = positiveInteger(requiredFlag("--owner-pid"), "--owner-pid");
  const ownerPgid = positiveInteger(requiredFlag("--owner-pgid"), "--owner-pgid");
  const ownerGuardianPid = positiveInteger(
    requiredFlag("--owner-guardian-pid"),
    "--owner-guardian-pid",
  );
  const ownerNonce = nonceSchema.parse(requiredFlag("--owner-nonce"));
  const verifiedBuildIdentity = nonceSchema.parse(
    requiredFlag("--verified-build-identity"),
  );
  const readerToken = nonceSchema.parse(requiredFlag("--reader-token"));
  const owner = processOwnership(ownerPid, ownerNonce);
  if (owner.kind !== "owned") {
    throw new Error(
      `journey owner process ${ownerPid} is not verifiably owned (${owner.kind})`,
    );
  }
  assertJourneyAuthorityGroup(
    ownerPgid,
    ownerPid,
    ownerGuardianPid,
    ownerNonce,
  );
  assertCleanWorktree(repository);
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  await mkdir(slotsRoot, { recursive: true });
  const waitStartedAt = Date.now();
  for (;;) {
    const allocationLock = await acquireOwnedLock(
      path.join(registryRoot, "allocation.lock"),
      "journey allocation",
    );
    let recoveries: readonly string[] = [];
    let logicalRunActive: Lease | undefined;
    try {
      const reader = await requiredBootstrapReader(
        registryRoot,
        readerToken,
        ownerPid,
        ownerNonce,
        { guardianPid: ownerGuardianPid, pgid: ownerPgid },
      );
      await assertPreparationAllowsReader(registryRoot);
      const active = await reconcileActiveLeases(slotsRoot);
      if (active.uncertain) {
        throw new Error(
          "journey allocation is blocked by a quarantined or incomplete lease",
        );
      }
      recoveries = active.recoveries;
      logicalRunActive = active.leases.find(
        (lease) =>
          lease.repository === repository &&
          lease.suiteId === suiteId &&
          lease.scenario === scenario &&
          lease.runId === runId,
      );
      if (recoveries.length === 0 && logicalRunActive === undefined) {
        if (
          exclusive
            ? active.leases.length > 0
            : active.leases.some((lease) => lease.exclusive)
        ) {
          throw new Error(
            exclusive
              ? `exclusive credential journey ${scenario} requires an idle runtime`
              : "an exclusive credential journey currently owns the runtime",
          );
        }

        const sourceSha = git(repository, ["rev-parse", "HEAD"]);
        const prepared = await readPreparedBuild(repository);
        if (prepared.sourceSha !== sourceSha) {
          throw new Error(
            `prepared build ${prepared.sourceSha} does not match journey source ${sourceSha}`,
          );
        }
        if (prepared.buildIdentity !== verifiedBuildIdentity) {
          throw new Error(
            "source verification does not match the published prepared build",
          );
        }

        const attempt = await allocateAttempt(repository, suiteId, scenario, runId);
        const runRoot = path.join(
          repository,
          "artifacts",
          "runs",
          suiteId,
          scenario,
          runId,
          `attempt-${attempt}`,
        );
        const paths = {
          artifacts: path.join(runRoot, "artifacts", scenario),
          generated: path.join(runRoot, "generated"),
          logs: path.join(runRoot, "logs"),
          process: path.join(runRoot, "process"),
          repository,
          runRoot,
        };
        await Promise.all([
          mkdir(paths.artifacts, { recursive: true }),
          mkdir(paths.generated, { recursive: true }),
          mkdir(paths.logs, { recursive: true }),
          mkdir(paths.process, { recursive: true }),
        ]);

        const worktreeKey = digest(repository).slice(0, 10);
        const runKey = digest(`${suiteId}\0${scenario}\0${runId}`);
        const projectSuffix = digest(
          `${worktreeKey}\0${runKey}\0${attempt}`,
        ).slice(0, 20);
        const composeProject = composeEnabled
          ? composeProjectName(scenario, projectSuffix)
          : null;
        const ownerToken = randomBytes(32).toString("hex");
        const contextFile = path.join(runRoot, "context.json");
        const preferredSlot = preferredJourneyPortSlot(
          suiteId,
          scenario,
          runId,
        );

        for (let offset = 0; offset < journeyPortSlotCount; offset += 1) {
          const slot = (preferredSlot + offset) % journeyPortSlotCount;
          if (active.reservedSlots.has(slot)) {
            continue;
          }
          const portReservation = await reserveJourneyPortBlock(slot);
          if (portReservation === undefined) {
            continue;
          }
          const leaseDirectory = path.join(
            slotsRoot,
            String(slot).padStart(4, "0"),
          );
          const lease: Lease = {
            attempt,
            composeProject,
            contextFile,
            createdAt: new Date().toISOString(),
            exclusive,
            ownerGuardianPid,
            ownerNonce,
            ownerPid,
            ownerPgid,
            ownerToken,
            repository,
            runId,
            scenario,
            slot,
            suiteId,
            version: 2,
          };
          const context = makeContext({
            attempt,
            buildIdentity: prepared.buildIdentity,
            composeEnabled,
            composeProject,
            contextFile,
            leaseDirectory,
            ownerNonce,
            ownerGuardianPid,
            ownerPid,
            ownerPgid,
            ownerToken,
            paths,
            repository,
            runId,
            scenario,
            slot,
            sourceSha,
            suiteId,
          });
          const claimDirectory = path.join(
            slotsRoot,
            `.claim-${String(slot).padStart(4, "0")}-${ownerToken.slice(0, 16)}`,
          );
          try {
            await mkdir(claimDirectory);
            await writeJsonAtomically(
              path.join(claimDirectory, "lease.json"),
              lease,
            );
            await writeJsonAtomically(contextFile, context);
            await reachRuntimeProofBarrier(runId, ownerToken, "claim-ready");
            await rename(claimDirectory, leaseDirectory);
            await releaseTransferredBootstrapReader(registryRoot, reader);
          } catch (error) {
            await rm(claimDirectory, { force: true, recursive: true });
            throw error;
          } finally {
            await releasePortReservation(portReservation);
          }
          process.stdout.write(`${contextFile}\n`);
          return;
        }
        throw new Error(
          `all ${journeyPortSlotCount} journey port slots are leased or unavailable`,
        );
      }
    } finally {
      await releaseOwnedLock(allocationLock);
    }
    if (recoveries.length > 0) {
      await drainCleanupRecoveries(recoveries, waitStartedAt);
      continue;
    }
    if (logicalRunActive === undefined) {
      throw new Error("journey allocation did not reach a stable decision");
    }
    await reachRuntimeProofBarrier(
      runId,
      logicalRunActive.ownerToken,
      "logical-run-active",
    );
    if (Date.now() - waitStartedAt >= runtimeCommandTimeoutMilliseconds) {
      throw new Error(
        `timed out waiting for prior ${scenario}/${runId} execution to release`,
      );
    }
    await delay(cleanupClaimPollIntervalMilliseconds);
  }
}

export async function reachRuntimeProofBarrier(
  runId: string,
  ownerToken: string,
  stage: RuntimeProofBarrierStage,
): Promise<void> {
  const root = process.env.ZOEN_E2E_RUNTIME_BARRIER_DIR;
  if (root === undefined || root === "") {
    return;
  }
  const configuredStage = runtimeProofBarrierStageSchema.parse(
    process.env.ZOEN_E2E_RUNTIME_BARRIER_STAGE,
  );
  if (configuredStage !== stage) {
    return;
  }
  await mkdir(root, { recursive: true });
  await writeJsonAtomically(path.join(root, `${runId}.${stage}.ready.json`), {
    ownerToken,
    runId,
    stage,
  });
  const release = path.join(root, `${runId}.${stage}.release`);
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    if (await fileExists(release)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`runtime proof barrier ${stage} timed out for ${runId}`);
}

export async function reserveJourneyPortBlock(
  slot: number,
): Promise<readonly Server[] | undefined> {
  const servers: Server[] = [];
  try {
    for (let offset = 0; offset < journeyPortBlockWidth; offset += 1) {
      const server = createServer();
      try {
        await listen(server, journeyPortAt(slot, offset));
      } catch (error) {
        if (isUnavailablePort(error)) {
          await releasePortReservation(servers);
          return undefined;
        }
        throw error;
      }
      server.unref();
      servers.push(server);
    }
    return servers;
  } catch (error) {
    await releasePortReservation(servers);
    throw error;
  }
}

export function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onListening = (): void => {
      cleanup();
      resolve();
    };
    const cleanup = (): void => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ exclusive: true, host: "127.0.0.1", port });
  });
}

export async function releasePortReservation(servers: readonly Server[]): Promise<void> {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        }),
    ),
  );
}

export function isUnavailablePort(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EACCES", "EADDRINUSE"].includes(String(Reflect.get(error, "code")))
  );
}
