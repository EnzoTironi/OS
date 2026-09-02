import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  journeyRunContext,
  writeJsonAtomically,
} from "./journey-run-context.js";

type ChildOutcome =
  | { readonly kind: "error"; readonly error: Error }
  | {
      readonly code: number | null;
      readonly kind: "exit";
      readonly signal: NodeJS.Signals | null;
    };

const supervisorPath = fileURLToPath(import.meta.url);

if (process.argv.includes("--child")) {
  await runDetachedChild();
} else {
  await superviseJourney();
}

async function superviseJourney(): Promise<void> {
  const runnerPath = path.resolve(requiredFlag("--runner"));
  const context = journeyRunContext();
  const logPath = path.join(context.paths.logs, `${context.scenario}.log`);
  const metadataPath = path.join(context.paths.process, "scenario.json");
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn(
    process.execPath,
    [
      supervisorPath,
      "--child",
      "--runner",
      runnerPath,
      "--owner-token",
      context.lease.ownerToken,
    ],
    {
      cwd: context.paths.repository,
      detached: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  const completion = childCompletion(child);

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    log.write(chunk);
  });

  const childPid = child.pid;
  if (childPid === undefined) {
    const outcome = await completion;
    throw outcome.kind === "error"
      ? outcome.error
      : new Error(`failed to start journey runner ${runnerPath}`);
  }

  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) {
        return;
      }
      stopping = true;
      signalProcessGroup(childPid, signal);
    });
  }

  const startedAt = new Date().toISOString();
  try {
    await writeJsonAtomically(metadataPath, {
      ownerToken: context.lease.ownerToken,
      pid: childPid,
      runnerPath,
      startedAt,
      state: "running",
      version: 1,
    });
    await startDetachedChild(child, context.lease.ownerToken);
  } catch (error) {
    await terminateProcessGroup(childPid, completion);
    log.end();
    throw error;
  }

  const outcome = await completion;
  if (outcome.kind === "error") {
    log.end();
    throw outcome.error;
  }
  await writeJsonAtomically(metadataPath, {
    exitCode: outcome.code,
    exitedAt: new Date().toISOString(),
    ownerToken: context.lease.ownerToken,
    pid: childPid,
    runnerPath,
    startedAt,
    state: "exited",
    version: 1,
  });
  log.end();

  if (outcome.code !== 0) {
    process.exitCode = outcome.code ?? (outcome.signal === null ? 1 : 128);
  }
}

async function runDetachedChild(): Promise<void> {
  const runnerPath = path.resolve(requiredFlag("--runner"));
  const ownerToken = requiredFlag("--owner-token");
  ignoreClosedOutput(process.stdout);
  ignoreClosedOutput(process.stderr);

  await new Promise<void>((resolve, reject) => {
    let started = false;
    process.once("message", (message: unknown) => {
      if (
        message === null ||
        typeof message !== "object" ||
        Reflect.get(message, "command") !== "start" ||
        Reflect.get(message, "ownerToken") !== ownerToken
      ) {
        reject(new Error("detached journey received an invalid start message"));
        return;
      }
      started = true;
      resolve();
    });
    process.once("disconnect", () => {
      if (!started) {
        reject(new Error("journey supervisor disconnected before ownership publication"));
      }
    });
  });
  if (process.connected) {
    process.disconnect?.();
  }
  process.argv = [
    process.execPath,
    runnerPath,
    `--zoen-run-owner-token=${ownerToken}`,
  ];
  await import(pathToFileURL(runnerPath).href);
}

function childCompletion(child: ChildProcess): Promise<ChildOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ChildOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(outcome);
    };
    child.once("error", (error) => finish({ error, kind: "error" }));
    child.once("exit", (code, signal) =>
      finish({ code, kind: "exit", signal }),
    );
  });
}

function startDetachedChild(child: ChildProcess, ownerToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.send({ command: "start", ownerToken }, (error) => {
      if (error === null) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

async function terminateProcessGroup(
  childPid: number,
  completion: Promise<ChildOutcome>,
): Promise<void> {
  signalProcessGroup(childPid, "SIGTERM");
  const exited = await Promise.race([
    completion.then(() => true),
    new Promise<false>((resolve) => {
      setTimeout(() => resolve(false), 2_000);
    }),
  ]);
  if (!exited) {
    signalProcessGroup(childPid, "SIGKILL");
    await completion;
  }
}

function signalProcessGroup(childPid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-childPid, signal);
  } catch (error) {
    if (!isNoSuchProcess(error)) {
      process.stderr.write(
        `failed to signal journey process group ${childPid}: ${String(error)}\n`,
      );
    }
  }
}

function ignoreClosedOutput(stream: NodeJS.WriteStream): void {
  stream.on("error", (error) => {
    if (!("code" in error && error.code === "EPIPE")) {
      process.exitCode = 1;
    }
  });
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ESRCH"
  );
}

function requiredFlag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}
