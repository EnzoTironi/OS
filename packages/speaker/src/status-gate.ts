import type { ScheduleFn, ScheduleHandle } from "./turn-coordinator.js";

/**
 * Race one async unit of work against a gate timer.
 *
 * Armed, then either settled (work finished first, timer cancelled) or
 * fired (`onGate` runs exactly once). A custom `schedule` that invokes
 * from `cancel` cannot fire after settle: the callback checks `settled`
 * first. After work settles, an in-flight `onGate` is awaited only up to
 * `settleMs` so a hung dispatch cannot stall a result already in hand.
 * `dispatched` is true only when `onGate` finished without throwing.
 */
export const STATUS_GATE_SETTLE_MS = 1000;

export interface RaceWithStatusGateInput<T> {
  readonly work: Promise<T>;
  readonly gateMs: number;
  readonly schedule?: ScheduleFn;
  /** Max wait for an in-flight `onGate` after work settles. */
  readonly settleMs?: number;
  /** Runs at most once, only when `work` is still pending at `gateMs`. */
  readonly onGate: () => void | Promise<void>;
}

export interface StatusGateResult<T> {
  readonly value: T;
  /** True when the gate fired, i.e. `work` was still pending at `gateMs`. */
  readonly gated: boolean;
  /** True when `onGate` completed without throwing. */
  readonly dispatched: boolean;
}

export async function raceWithStatusGate<T>(
  input: RaceWithStatusGateInput<T>,
): Promise<StatusGateResult<T>> {
  const schedule = input.schedule ?? defaultSchedule;
  const settleMs = input.settleMs ?? STATUS_GATE_SETTLE_MS;
  let gated = false;
  let settled = false;
  let dispatched = false;
  let firing: Promise<void> | undefined;
  const handle = schedule(() => {
    if (settled || gated) {
      return;
    }
    gated = true;
    firing = Promise.resolve()
      .then(() => input.onGate())
      .then(() => {
        dispatched = true;
      })
      .catch(() => undefined);
  }, input.gateMs);
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await input.work };
  } catch (error) {
    outcome = { ok: false, error };
  }
  settled = true;
  handle.cancel();
  if (firing !== undefined) {
    await Promise.race([firing, delay(settleMs)]);
  }
  if (outcome.ok) {
    return { dispatched, gated, value: outcome.value };
  }
  throw outcome.error;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
