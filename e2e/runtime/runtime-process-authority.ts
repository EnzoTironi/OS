import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { JourneyRunContext } from "../journey-run-context.js";
import { command } from "./runtime-config.js";
import {
  processMetadataSchema,
  type ProcessOwnership,
} from "./runtime-contracts.js";
import { isNoSuchProcess } from "./runtime-support.js";
import {
  deadlineScopedProcessInspectionTimeoutMilliseconds,
  processGroupPollIntervalMilliseconds,
} from "./runtime-timeouts.js";

const processInspectionTimeoutMilliseconds = 5_000;

export type ProcessOperationDeadline = {
  readonly expiresAt: number;
};

type InspectionAllowance =
  | { readonly kind: "available"; readonly timeoutMilliseconds: number }
  | { readonly kind: "expired" };

export function git(repository: string, arguments_: readonly string[]): string {
  return execFileSync("/usr/bin/git", arguments_, {
    cwd: repository,
    encoding: "utf8",
    env: processInspectionEnvironment(),
  }).trim();
}

export function processOwnership(
  pid: number,
  nonce: string,
  deadline?: ProcessOperationDeadline,
): ProcessOwnership {
  const liveness = processLiveness(pid);
  if (liveness.kind !== "alive") {
    return liveness;
  }
  const allowance = inspectionAllowance(deadline);
  if (allowance.kind === "expired") {
    return { kind: "uncertain", reason: "process inspection deadline expired" };
  }
  const result = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: processInspectionEnvironment(),
      killSignal: "SIGKILL",
      timeout: allowance.timeoutMilliseconds,
    },
  );
  if (deadlineExpired(deadline)) {
    return {
      kind: "uncertain",
      reason: "process inspection deadline expired",
    };
  }
  if (result.error !== undefined || result.status !== 0) {
    const afterInspection = processLiveness(pid);
    return afterInspection.kind === "missing"
      ? afterInspection
      : {
          kind: "uncertain",
          reason: result.error?.message ?? `ps exited ${String(result.status)}`,
        };
  }
  const commandLine = result.stdout.trim();
  if (commandLine === "") {
    const afterInspection = processLiveness(pid);
    return afterInspection.kind === "missing"
      ? afterInspection
      : { kind: "uncertain", reason: "ps returned an empty command" };
  }
  return commandLine.includes(nonce) ? { kind: "owned" } : { kind: "foreign" };
}

export function processLiveness(
  pid: number,
): { readonly kind: "alive" } | Extract<ProcessOwnership, { kind: "missing" | "uncertain" }> {
  try {
    process.kill(pid, 0);
    return { kind: "alive" };
  } catch (error) {
    if (isNoSuchProcess(error)) {
      return { kind: "missing" };
    }
    return { kind: "uncertain", reason: String(error) };
  }
}

type ProcessGroupInspection =
  | { readonly kind: "deadline-expired" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "members";
      readonly members: readonly {
        readonly command: string;
        readonly pgid: number;
        readonly pid: number;
      }[];
    }
  | { readonly kind: "uncertain"; readonly reason: string };

export function inspectProcessGroup(
  pgid: number,
  deadline?: ProcessOperationDeadline,
): ProcessGroupInspection {
  const allowance = inspectionAllowance(deadline);
  if (allowance.kind === "expired") {
    return { kind: "deadline-expired" };
  }
  const result = spawnSync("/bin/ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
    env: processInspectionEnvironment(),
    killSignal: "SIGKILL",
    timeout: allowance.timeoutMilliseconds,
  });
  if (deadlineExpired(deadline)) {
    return { kind: "deadline-expired" };
  }
  if (result.error !== undefined || result.status !== 0) {
    return {
      kind: "uncertain",
      reason: result.error?.message ?? `ps exited ${String(result.status)}`,
    };
  }
  if (!Number.isInteger(result.pid) || result.pid < 1) {
    return {
      kind: "uncertain",
      reason: "ps did not report its inspection pid",
    };
  }
  const inspectionPid = result.pid;
  const members = result.stdout
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*([0-9]+)\s+([0-9]+)\s+(.*)$/.exec(line);
      if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
        return [];
      }
      const memberPid = Number.parseInt(match[1], 10);
      const memberPgid = Number.parseInt(match[2], 10);
      return memberPgid === pgid && memberPid !== inspectionPid
        ? [
            {
              command: match[3],
              pgid: memberPgid,
              pid: memberPid,
            },
          ]
        : [];
    });
  if (deadlineExpired(deadline)) {
    return { kind: "deadline-expired" };
  }
  if (members.length > 0) {
    return { kind: "members", members };
  }
  try {
    process.kill(-pgid, 0);
    return {
      kind: "uncertain",
      reason: "kernel reports a group that ps did not enumerate",
    };
  } catch (error) {
    return isNoSuchProcess(error)
      ? { kind: "empty" }
      : { kind: "uncertain", reason: String(error) };
  }
}

export async function waitForEmptyProcessGroup(
  input: {
    readonly deadline: ProcessOperationDeadline;
    readonly pgid: number;
  },
): Promise<boolean> {
  while (!deadlineExpired(input.deadline)) {
    const group = inspectProcessGroup(input.pgid, input.deadline);
    if (group.kind === "empty") {
      return true;
    }
    if (group.kind === "deadline-expired") {
      return false;
    }
    if (group.kind === "uncertain") {
      throw new Error(
        `cannot inspect process group ${input.pgid}: ${group.reason}`,
      );
    }
    const remainingMilliseconds = input.deadline.expiresAt - Date.now();
    if (remainingMilliseconds <= 0) {
      return false;
    }
    await delay(
      Math.min(processGroupPollIntervalMilliseconds, remainingMilliseconds),
    );
  }
  return false;
}

export function signalProcessGroup(input: {
  readonly deadline: ProcessOperationDeadline;
  readonly pgid: number;
  readonly signal: NodeJS.Signals;
}): void {
  if (deadlineExpired(input.deadline)) {
    throw new Error(
      `refusing to signal process group ${input.pgid} after its cleanup deadline`,
    );
  }
  try {
    process.kill(-input.pgid, input.signal);
  } catch (error) {
    if (!isNoSuchProcess(error)) {
      throw error;
    }
  }
}

export function signalOwnedJourneyGroup(
  input: {
    readonly context: JourneyRunContext;
    readonly deadline: ProcessOperationDeadline;
    readonly metadata: z.infer<typeof processMetadataSchema>;
    readonly signal: NodeJS.Signals;
  },
): void {
  const group = inspectProcessGroup(input.metadata.pgid, input.deadline);
  if (group.kind === "empty") {
    return;
  }
  if (group.kind === "deadline-expired") {
    throw new Error(
      `cannot inspect journey group ${input.metadata.pgid}: cleanup deadline expired`,
    );
  }
  if (group.kind === "uncertain") {
    throw new Error(
      `cannot inspect journey group ${input.metadata.pgid}: ${group.reason}`,
    );
  }
  const leader = group.members.find(
    (member) => member.pid === input.metadata.pid,
  );
  const anchoredByLeader =
    leader !== undefined &&
    leader.command.includes(input.metadata.runnerPath) &&
    processOwnership(
      input.metadata.pid,
      input.metadata.authorityNonce,
      input.deadline,
    ).kind === "owned";
  const anchoredByGuardian = group.members.some(
    (member) =>
      member.pid === input.context.owner.guardianPid &&
      member.command.includes("prepare-lock.mjs") &&
      member.command.includes("--guardian") &&
      member.command.includes(input.metadata.authorityNonce),
  );
  if (!anchoredByLeader && !anchoredByGuardian) {
    throw new Error(
      `refusing to signal journey group ${input.metadata.pgid} without its ownership anchor`,
    );
  }
  signalProcessGroup({
    deadline: input.deadline,
    pgid: input.metadata.pgid,
    signal: input.signal,
  });
}

export function assertJourneyAuthorityGroup(
  ownerPgid: number,
  ownerPid: number,
  guardianPid: number,
  ownerNonce: string,
): void {
  if (ownerPid !== ownerPgid || guardianPid === ownerPid) {
    throw new Error(
      "journey authority must be the group leader with a distinct guardian",
    );
  }
  const group = inspectProcessGroup(ownerPgid);
  if (group.kind !== "members") {
    const reason = group.kind === "uncertain" ? `: ${group.reason}` : "";
    throw new Error(`journey authority group ${ownerPgid} is not live${reason}`);
  }
  const leader = group.members.find((member) => member.pid === ownerPgid);
  const guardian = group.members.find((member) => member.pid === guardianPid);
  if (
    leader === undefined ||
    !leader.command.includes("prepare-lock.mjs") ||
    !leader.command.includes("journey-worker") ||
    !leader.command.includes(ownerNonce) ||
    guardian === undefined ||
    !guardian.command.includes("prepare-lock.mjs") ||
    !guardian.command.includes("guardian") ||
    !guardian.command.includes(ownerNonce)
  ) {
    throw new Error(
      `journey authority group ${ownerPgid} lacks its exact leader and guardian`,
    );
  }
}

export function processInspectionEnvironment(): NodeJS.ProcessEnv {
  return { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" };
}

function inspectionAllowance(
  deadline: ProcessOperationDeadline | undefined,
): InspectionAllowance {
  if (deadline === undefined) {
    return {
      kind: "available",
      timeoutMilliseconds: processInspectionTimeoutMilliseconds,
    };
  }
  const remainingMilliseconds = deadline.expiresAt - Date.now();
  return remainingMilliseconds > 0
    ? {
        kind: "available",
        timeoutMilliseconds: Math.min(
          deadlineScopedProcessInspectionTimeoutMilliseconds,
          remainingMilliseconds,
        ),
      }
    : { kind: "expired" };
}

function deadlineExpired(
  deadline: ProcessOperationDeadline | undefined,
): boolean {
  return deadline !== undefined && Date.now() >= deadline.expiresAt;
}

export function assertCleanWorktree(repository: string): void {
  const dirty = git(repository, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty !== "") {
    throw new Error(
      `journey provenance requires a clean worktree; commit or remove:\n${dirty}`,
    );
  }
}
