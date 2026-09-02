import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { idSchema, runtimeCommandTimeoutMilliseconds } from "./pool-contracts.js";
import {
  prepareLockScript,
  repositoryRoot,
  suiteOwnerNonce,
  suiteReaderToken,
} from "./pool-environment.js";

export function eventQueue<Event>(): {
  readonly next: () => Promise<Event>;
  readonly publish: (event: Event) => void;
} {
  const events: Event[] = [];
  let wake: (() => void) | undefined;
  return {
    next: async () => {
      while (true) {
        const event = events.shift();
        if (event !== undefined) {
          return event;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
    publish: (event) => {
      events.push(event);
      const notify = wake;
      wake = undefined;
      notify?.();
    },
  };
}

export type SignalControl = {
  readonly current: () => NodeJS.Signals | undefined;
  readonly dispose: () => void;
  readonly signal: Promise<NodeJS.Signals>;
};

export function installSignalControl(): SignalControl {
  let current: NodeJS.Signals | undefined;
  let resolveSignal: (signal: NodeJS.Signals) => void = () => undefined;
  const signal = new Promise<NodeJS.Signals>((resolve) => {
    resolveSignal = resolve;
  });
  const onInterrupt = (): void => {
    if (current === undefined) {
      current = "SIGINT";
      resolveSignal(current);
    }
  };
  const onTerminate = (): void => {
    if (current === undefined) {
      current = "SIGTERM";
      resolveSignal(current);
    }
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  return {
    current: () => current,
    dispose: () => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    },
    signal,
  };
}

export async function writeContextList(
  destination: string,
  pointers: readonly string[],
): Promise<void> {
  const temporary = `${destination}.tmp-${randomBytes(12).toString("hex")}`;
  try {
    await writeFile(temporary, `${pointers.join("\n")}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function generatedId(prefix: string): string {
  return idSchema.parse(
    `${prefix}-${Date.now()}-${randomBytes(8).toString("hex")}`,
  );
}


export function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ENOENT"
  );
}

export function completesWithin(
  completion: Promise<void>,
  milliseconds: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    timer.unref();
    void completion.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map(formatError)].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

export function releaseSuiteReader(): void {
  const result = spawnSync(
    process.execPath,
    [
      prepareLockScript,
      "reader-release",
      "--reader-token",
      suiteReaderToken,
      "--owner-pid",
      String(process.pid),
      "--owner-nonce",
      suiteOwnerNonce,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: process.env,
      killSignal: "SIGKILL",
      timeout: runtimeCommandTimeoutMilliseconds,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `failed to release journey suite reader: ${result.error?.message ?? result.stderr}`,
    );
  }
}

export class PoolInterrupted extends Error {
  readonly signal: NodeJS.Signals;

  constructor(signal: NodeJS.Signals) {
    super(`journey pool interrupted by ${signal}`);
    this.name = "PoolInterrupted";
    this.signal = signal;
  }
}
