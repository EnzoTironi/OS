import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  processOwnershipInspectionTimeoutMilliseconds,
  terminationGraceMilliseconds,
  type ChildOutcome,
  type TrackedChild,
} from "./pool-contracts.js";
import { repositoryRoot, runScript } from "./pool-environment.js";
import { completesWithin, errorFromUnknown } from "./pool-control.js";

export function startTrackedChild(input: {
  readonly arguments: readonly string[];
  readonly captureOutput?: boolean;
  readonly environment: NodeJS.ProcessEnv;
  readonly label: string;
  readonly onOutcome?: (outcome: ChildOutcome) => void;
  readonly progressToStderr?: boolean;
}): TrackedChild {
  const ownerNonce = randomBytes(32).toString("hex");
  const child = spawn(
    runScript,
    ["--zoen-script-owner-token", ownerNonce, ...input.arguments],
    {
      cwd: repositoryRoot,
      detached: true,
      env: input.environment,
      stdio: input.captureOutput
        ? ["ignore", "pipe", "pipe"]
        : input.progressToStderr
          ? ["ignore", process.stderr, process.stderr]
          : "inherit",
    },
  );
  let stderr = "";
  let stdout = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  let settled = false;
  const completion = new Promise<ChildOutcome>((resolve) => {
    const finish = (outcome: ChildOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.onOutcome?.(outcome);
      resolve(outcome);
    };
    child.once("error", (error) => finish({ error, kind: "error" }));
    child.once("exit", (code, signal) =>
      finish({ code, kind: "exit", signal }),
    );
  });
  return {
    abandon: () => {
      child.stderr?.destroy();
      child.stdout?.destroy();
      child.unref();
    },
    completion,
    isSettled: () => settled,
    label: input.label,
    ownerNonce,
    pid: child.pid,
    stderr: () => stderr,
    stdout: () => stdout,
  };
}

export async function terminateChildren(children: readonly TrackedChild[]): Promise<void> {
  const failures: Error[] = [];
  signalUnsettledChildren(children, "SIGTERM", failures);
  const completions = Promise.all(
    children.map((child) => child.completion),
  ).then(() => undefined);
  if (!(await completesWithin(completions, terminationGraceMilliseconds))) {
    signalUnsettledChildren(children, "SIGKILL", failures);
    if (!(await completesWithin(completions, terminationGraceMilliseconds))) {
      for (const child of children) {
        if (!child.isSettled()) {
          child.abandon();
        }
      }
      failures.push(
        new Error("journey wrappers did not exit within the post-SIGKILL bound"),
      );
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "failed to signal journey process groups");
  }
}


export async function boundedChildOutcome(
  child: TrackedChild,
  milliseconds: number,
): Promise<ChildOutcome> {
  let outcome: ChildOutcome | undefined;
  const completed = child.completion.then((value) => {
    outcome = value;
  });
  if (await completesWithin(completed, milliseconds)) {
    if (outcome === undefined) {
      throw new Error(`${child.label} completed without an outcome`);
    }
    return outcome;
  }

  const timeout = new Error(
    `${child.label} did not complete within ${milliseconds}ms`,
  );
  try {
    await terminateChildren([child]);
  } catch (error) {
    throw new AggregateError(
      [timeout, errorFromUnknown(error)],
      `${child.label} timed out and did not terminate cleanly`,
    );
  }
  throw timeout;
}

function signalUnsettledChildren(
  children: readonly TrackedChild[],
  signal: NodeJS.Signals,
  failures: Error[],
): void {
  for (const child of children) {
    if (child.isSettled() || child.pid === undefined) {
      continue;
    }
    const ownership = processOwnership(child.pid, child.ownerNonce);
    if (ownership.kind === "missing" || ownership.kind === "foreign") {
      continue;
    }
    if (ownership.kind === "uncertain") {
      failures.push(
        new Error(
          `cannot verify ${child.label} process group ${child.pid}: ${ownership.reason}`,
        ),
      );
      continue;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (!isNoSuchProcess(error)) {
        failures.push(
          new Error(
            `failed to send ${signal} to ${child.label} process group ${child.pid}: ${String(error)}`,
          ),
        );
      }
    }
  }
}

export function childSucceeded(outcome: ChildOutcome): boolean {
  return outcome.kind === "exit" && outcome.code === 0 && outcome.signal === null;
}

export function childFailure(label: string, outcome: ChildOutcome): Error {
  if (outcome.kind === "error") {
    return new Error(`${label} failed to start: ${outcome.error.message}`);
  }
  return new Error(
    `${label} failed (${outcome.signal ?? `exit ${outcome.code ?? "unknown"}`})`,
  );
}


type ProcessOwnership =
  | { readonly kind: "foreign" }
  | { readonly kind: "missing" }
  | { readonly kind: "owned" }
  | { readonly kind: "uncertain"; readonly reason: string };

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ESRCH"
  );
}

function processOwnership(pid: number, nonce: string): ProcessOwnership {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return isNoSuchProcess(error)
      ? { kind: "missing" }
      : { kind: "uncertain", reason: String(error) };
  }
  const inspected = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "pgid=,command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
      killSignal: "SIGKILL",
      timeout: processOwnershipInspectionTimeoutMilliseconds,
    },
  );
  if (
    inspected.error !== undefined ||
    inspected.status !== 0 ||
    inspected.stdout.trim() === ""
  ) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (isNoSuchProcess(error)) {
        return { kind: "missing" };
      }
    }
    return {
      kind: "uncertain",
      reason: inspected.error?.message ?? `ps exited ${String(inspected.status)}`,
    };
  }
  const match = /^\s*([0-9]+)\s+(.*)$/.exec(inspected.stdout.trim());
  if (match?.[1] === undefined || match[2] === undefined) {
    return { kind: "uncertain", reason: "ps returned an invalid process row" };
  }
  return Number(match[1]) === pid && match[2].includes(nonce)
    ? { kind: "owned" }
    : { kind: "foreign" };
}
