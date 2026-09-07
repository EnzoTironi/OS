import type { ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_STOP_TIMEOUT_MS = 10_000;
const DEFAULT_KILL_TIMEOUT_MS = 3_000;

type StopChildOptions = Readonly<{
  killTimeoutMs?: number;
  signalChild?: (signal: NodeJS.Signals) => void;
  stopTimeoutMs?: number;
}>;

export function processExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

export async function stopChild(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
  name: string,
  options: StopChildOptions = {},
): Promise<void> {
  const signalChild =
    options.signalChild ?? ((nextSignal) => child.kill(nextSignal));
  if (!processExited(child)) {
    signalChild(signal);
  }
  try {
    await waitForProcessExit(
      child,
      options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
      name,
    );
  } catch (error) {
    if (!processExited(child)) {
      signalChild("SIGKILL");
    }
    await waitForProcessExit(
      child,
      options.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS,
      name,
    );
    throw error;
  }
}

export function waitForProcessExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  name: string,
): Promise<void> {
  if (processExited(child)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      child.off("close", onClose);
      child.off("error", onError);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const onClose = () => finish();
    const onError = () => finish();
    const timer = globalThis.setTimeout(
      () => finish(new Error(`${name} did not exit within ${timeoutMs}ms`)),
      timeoutMs,
    );
    child.once("close", onClose);
    child.once("error", onError);
    if (processExited(child)) {
      finish();
    }
  });
}
