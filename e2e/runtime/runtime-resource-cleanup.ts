import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { writeJsonAtomically, type JourneyRunContext } from "../journey-run-context.js";
import { command } from "./runtime-config.js";
import {
  groupCleanSchema,
  processMetadataSchema,
  type Lease,
} from "./runtime-contracts.js";
import {
  assertOwnedPath,
  fileExists,
  isMissingFile,
} from "./runtime-support.js";
import {
  inspectProcessGroup,
  processOwnership,
  signalOwnedJourneyGroup,
  signalProcessGroup,
  waitForEmptyProcessGroup,
} from "./runtime-process-authority.js";
import { contextEnvironment } from "./runtime-context.js";
import {
  composeCleanupTimeoutMilliseconds,
  dockerOwnershipInspectionTimeoutMilliseconds,
  processGroupPollIntervalMilliseconds,
  processGroupTerminationAttemptsPerSignal,
  releaseProofBarrierPollAttempts,
  releaseProofBarrierPollIntervalMilliseconds,
} from "./runtime-timeouts.js";

export function leaseAuthorityGroupState(
  lease: Lease,
): "empty" | "foreign" | "owned" | "uncertain" {
  const group = inspectProcessGroup(lease.ownerPgid);
  if (group.kind !== "members") {
    return group.kind;
  }
  const anchored = group.members.some(
    (member) =>
      member.command.includes(lease.ownerNonce) &&
      (member.pid === lease.ownerPid ||
        member.pid === lease.ownerGuardianPid ||
        member.command.includes("guardian")),
  );
  return anchored ? "owned" : "foreign";
}

export async function waitForLeaseAuthorityRelease(
  lease: Lease,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = leaseAuthorityGroupState(lease);
    if (state === "empty") {
      return true;
    }
    if (state === "uncertain" || state === "foreign") {
      return false;
    }
    await delay(processGroupPollIntervalMilliseconds);
  }
  return false;
}


export async function cleanupOwnedResources(context: JourneyRunContext): Promise<void> {
  await stopOwnedProcess(context);
  if (context.compose.kind === "compose") {
    await assertComposeOwnership(context);
    const files = [context.compose.baseFile];
    if (await fileExists(context.compose.overrideFile)) {
      files.push(context.compose.overrideFile);
    }
    const arguments_ = ["compose", "--project-name", context.compose.project];
    for (const file of files) {
      arguments_.push("--file", file);
    }
    arguments_.push("down", "--volumes", "--remove-orphans");
    const result = spawnSync("docker", arguments_, {
      cwd: context.paths.repository,
      encoding: "utf8",
      env: { ...process.env, ...contextEnvironment(context) },
      killSignal: "SIGKILL",
      timeout: composeCleanupTimeoutMilliseconds,
    });
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(
        `failed to remove owned Compose project ${context.compose.project}: ${result.error?.message ?? result.stderr}`,
      );
    }
  }
  assertOwnedPath(context.paths.runRoot, context.paths.generated);
  await rm(context.paths.generated, { force: true, recursive: true });
}

export async function assertComposeOwnership(context: JourneyRunContext): Promise<void> {
  if (context.compose.kind !== "compose") {
    return;
  }
  assertDockerResourceOwners(
    [
      "ps",
      "--all",
      "--filter",
      `label=com.docker.compose.project=${context.compose.project}`,
      "--format",
      '{{.ID}}\t{{.Label "zoen.e2e.owner"}}',
    ],
    context,
    "container",
  );
  assertDockerResourceOwners(
    [
      "network",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${context.compose.project}`,
      "--format",
      '{{.ID}}\t{{.Label "zoen.e2e.owner"}}',
    ],
    context,
    "network",
  );
  assertDockerResourceOwners(
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${context.compose.project}`,
      "--format",
      '{{.Name}}\t{{.Label "zoen.e2e.owner"}}',
    ],
    context,
    "volume",
  );
}

export function assertDockerResourceOwners(
  arguments_: readonly string[],
  context: JourneyRunContext,
  kind: string,
): void {
  const result = spawnSync("docker", arguments_, {
    encoding: "utf8",
    killSignal: "SIGKILL",
    timeout: dockerOwnershipInspectionTimeoutMilliseconds,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `cannot inspect Compose ${kind} ownership: ${result.error?.message ?? result.stderr}`,
    );
  }
  for (const line of result.stdout.split("\n").filter((entry) => entry !== "")) {
    const separator = line.indexOf("\t");
    const identity = separator < 0 ? line : line.slice(0, separator);
    const owner = separator < 0 ? "" : line.slice(separator + 1);
    if (owner !== context.lease.ownerToken) {
      const project =
        context.compose.kind === "compose" ? context.compose.project : context.runId;
      throw new Error(
        `refusing to remove ${kind} ${identity} from ${project}: owner label mismatch`,
      );
    }
  }
}

export async function stopOwnedProcess(context: JourneyRunContext): Promise<void> {
  const metadataPath = path.join(context.paths.process, "scenario.json");
  let metadata: z.infer<typeof processMetadataSchema>;
  try {
    metadata = processMetadataSchema.parse(
      JSON.parse(await readFile(metadataPath, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      await stopPrepublicationAuthority(context);
      return;
    }
    throw error;
  }
  if (
    metadata.ownerToken !== context.lease.ownerToken ||
    metadata.authorityNonce !== context.owner.nonce ||
    metadata.pgid !== context.owner.pgid ||
    metadata.pid !== context.owner.pid
  ) {
    throw new Error(`process ownership mismatch for ${context.runId}`);
  }
  if (await matchingGroupCleanReceipt(context, metadata)) {
    return;
  }

  let group = inspectProcessGroup(metadata.pgid);
  if (group.kind === "uncertain") {
    throw new Error(
      `cannot inspect journey process group ${metadata.pgid}: ${group.reason}`,
    );
  }
  if (group.kind === "empty") {
    await writeGroupCleanReceipt(context, metadata);
    return;
  }
  const leader = group.members.find((member) => member.pid === metadata.pid);
  if (leader !== undefined) {
    const ownership = processOwnership(metadata.pid, metadata.authorityNonce);
    if (
      ownership.kind !== "owned" ||
      leader.pgid !== metadata.pgid ||
      !leader.command.includes(metadata.runnerPath)
    ) {
      throw new Error(
        `refusing to signal reused or foreign journey leader ${metadata.pid}`,
      );
    }
  } else if (
    !group.members.some(
      (member) =>
        member.pid === context.owner.guardianPid &&
        member.command.includes("prepare-lock.mjs") &&
        member.command.includes("--guardian") &&
        member.command.includes(metadata.authorityNonce),
    )
  ) {
    throw new Error(
      `refusing to signal orphaned journey group ${metadata.pgid} without its ownership guardian`,
    );
  }

  signalOwnedJourneyGroup(context, metadata, "SIGTERM");
  if (
    !(
      await waitForEmptyProcessGroup(
        metadata.pgid,
        processGroupTerminationAttemptsPerSignal,
      )
    )
  ) {
    signalOwnedJourneyGroup(context, metadata, "SIGKILL");
    if (
      !(
        await waitForEmptyProcessGroup(
          metadata.pgid,
          processGroupTerminationAttemptsPerSignal,
        )
      )
    ) {
      group = inspectProcessGroup(metadata.pgid);
      const members =
        group.kind === "members"
          ? group.members.map((member) => member.pid).join(",")
          : group.kind;
      throw new Error(
        `journey process group ${metadata.pgid} survived cleanup (${members})`,
      );
    }
  }
  await writeGroupCleanReceipt(context, metadata);
}

export async function stopPrepublicationAuthority(
  context: JourneyRunContext,
): Promise<void> {
  const lease: Lease = {
    attempt: context.attempt,
    composeProject:
      context.compose.kind === "compose" ? context.compose.project : null,
    contextFile: path.join(context.paths.runRoot, "context.json"),
    createdAt: context.createdAt,
    exclusive: false,
    ownerGuardianPid: context.owner.guardianPid,
    ownerNonce: context.owner.nonce,
    ownerPgid: context.owner.pgid,
    ownerPid: context.owner.pid,
    ownerToken: context.lease.ownerToken,
    repository: context.paths.repository,
    runId: context.runId,
    scenario: context.scenario,
    slot: context.lease.slot,
    suiteId: context.suiteId,
    version: 2,
  };
  const state = leaseAuthorityGroupState(lease);
  if (state === "empty") {
    return;
  }
  if (state !== "owned") {
    throw new Error(
      `cannot prove prepublication journey group ${context.owner.pgid} ownership (${state})`,
    );
  }
  signalProcessGroup(context.owner.pgid, "SIGTERM");
  if (
    await waitForLeaseAuthorityRelease(
      lease,
      processGroupTerminationAttemptsPerSignal,
    )
  ) {
    return;
  }
  if (leaseAuthorityGroupState(lease) === "owned") {
    signalProcessGroup(context.owner.pgid, "SIGKILL");
  }
  if (
    !(
      await waitForLeaseAuthorityRelease(
        lease,
        processGroupTerminationAttemptsPerSignal,
      )
    )
  ) {
    throw new Error(
      `prepublication journey group ${context.owner.pgid} survived cleanup`,
    );
  }
}

export async function matchingGroupCleanReceipt(
  context: JourneyRunContext,
  metadata: z.infer<typeof processMetadataSchema>,
): Promise<boolean> {
  const receiptPath = path.join(context.paths.process, "group-clean.json");
  let receipt: z.infer<typeof groupCleanSchema>;
  try {
    receipt = groupCleanSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw new Error(`invalid journey process cleanup receipt ${receiptPath}`, {
      cause: error,
    });
  }
  if (
    receipt.groupCleanToken !== metadata.groupCleanToken ||
    receipt.ownerToken !== context.lease.ownerToken ||
    receipt.pgid !== metadata.pgid
  ) {
    throw new Error(`journey process cleanup receipt ownership mismatch`);
  }
  return true;
}

export async function writeGroupCleanReceipt(
  context: JourneyRunContext,
  metadata: z.infer<typeof processMetadataSchema>,
): Promise<void> {
  await writeJsonAtomically(path.join(context.paths.process, "group-clean.json"), {
    cleanedAt: new Date().toISOString(),
    groupCleanToken: metadata.groupCleanToken,
    ownerToken: context.lease.ownerToken,
    pgid: metadata.pgid,
    status: "group-empty",
    version: 1,
  });
}


export async function reachReleaseProofBarrier(
  context: JourneyRunContext,
): Promise<void> {
  const root = process.env.ZOEN_E2E_RUNTIME_RELEASE_BARRIER_DIR;
  if (root === undefined || root === "") {
    return;
  }
  await mkdir(root, { recursive: true });
  await writeJsonAtomically(
    path.join(root, `${context.runId}.release-renamed.ready.json`),
    {
      ownerToken: context.lease.ownerToken,
      runId: context.runId,
      stage: "release-renamed",
    },
  );
  const release = path.join(
    root,
    `${context.runId}.release-renamed.release`,
  );
  for (
    let attempt = 0;
    attempt < releaseProofBarrierPollAttempts;
    attempt += 1
  ) {
    if (await fileExists(release)) {
      return;
    }
    await delay(releaseProofBarrierPollIntervalMilliseconds);
  }
  throw new Error(
    `runtime proof barrier release-renamed timed out for ${context.runId}`,
  );
}
