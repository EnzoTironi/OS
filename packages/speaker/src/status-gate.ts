import type { ScheduleFn, ScheduleHandle } from "./turn-coordinator.js";

/**
 * Race one async unit of work against a gate timer.
 *
 * States: armed, then either settled (work finished first, timer cancelled
 * and never fires) or fired (timer won, `onGate` runs exactly once and is
 * awaited before this function returns or rethrows). There is no third
 * state: the timer is one-shot and cancelled the instant `work` settles, so
 * `onGate` cannot run twice and never leaks an unhandled rejection.
 */
export interface RaceWithStatusGateInput<T> {
  readonly work: Promise<T>;
  readonly gateMs: number;
  readonly schedule?: ScheduleFn;
  /** Runs at most once, only when `work` is still pending at `gateMs`. */
  readonly onGate: () => void | Promise<void>;
}

export interface StatusGateResult<T> {
  readonly value: T;
  /** True when the gate fired, i.e. `work` was still pending at `gateMs`. */
  readonly gated: boolean;
}

export async function raceWithStatusGate<T>(
  input: RaceWithStatusGateInput<T>,
): Promise<StatusGateResult<T>> {
  const schedule = input.schedule ?? defaultSchedule;
  let gated = false;
  let firing: Promise<void> | undefined;
  const handle = schedule(() => {
    gated = true;
    firing = Promise.resolve()
      .then(() => input.onGate())
      .catch(() => undefined);
  }, input.gateMs);
  try {
    const value = await input.work;
    return { gated, value };
  } finally {
    handle.cancel();
    await firing;
  }
}

function defaultSchedule(
  callback: () => void,
  delayMs: number,
): ScheduleHandle {
  const timer = setTimeout(callback, delayMs);
  return {
    cancel() {
      clearTimeout(timer);
    },
  };
}
