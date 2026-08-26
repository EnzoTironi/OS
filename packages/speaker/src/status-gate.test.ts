import assert from "node:assert/strict";
import test from "node:test";
import { raceWithStatusGate } from "./status-gate.js";
import type { ScheduleHandle } from "./turn-coordinator.js";

function createManualClock() {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];
  return {
    pendingCount(): number {
      return timers.filter((timer) => !timer.cancelled).length;
    },
    schedule(fn: () => void, ms: number): ScheduleHandle {
      const timer = { at: now + ms, cancelled: false, fn };
      timers.push(timer);
      return {
        cancel() {
          timer.cancelled = true;
        },
      };
    },
    async advance(ms: number): Promise<void> {
      now += ms;
      const due = timers.filter((timer) => !timer.cancelled && timer.at <= now);
      for (const timer of due) {
        timer.cancelled = true;
        timer.fn();
      }
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

test("work settling before the gate cancels the timer and never fires onGate", async () => {
  const clock = createManualClock();
  let onGateCalls = 0;
  const result = await raceWithStatusGate({
    gateMs: 2000,
    onGate: () => {
      onGateCalls += 1;
    },
    schedule: clock.schedule,
    work: Promise.resolve("done"),
  });
  assert.equal(result.value, "done");
  assert.equal(result.gated, false);
  assert.equal(result.dispatched, false);
  assert.equal(onGateCalls, 0);
  assert.equal(clock.pendingCount(), 0);
});

test("work still pending at the gate fires onGate exactly once", async () => {
  const clock = createManualClock();
  let onGateCalls = 0;
  const work = deferred<string>();
  const race = raceWithStatusGate({
    gateMs: 2000,
    onGate: () => {
      onGateCalls += 1;
    },
    schedule: clock.schedule,
    work: work.promise,
  });
  await clock.advance(1999);
  assert.equal(onGateCalls, 0, "gate must not fire before gateMs");
  await clock.advance(1);
  assert.equal(onGateCalls, 1, "gate must fire once gateMs elapses");
  await clock.advance(10_000);
  assert.equal(onGateCalls, 1, "gate must never fire twice");
  work.resolve("finally");
  const result = await race;
  assert.equal(result.value, "finally");
  assert.equal(result.gated, true);
  assert.equal(result.dispatched, true);
});

test("onGate is awaited before the race settles, so it never leaks unhandled", async () => {
  const clock = createManualClock();
  const onGateStarted = deferred<void>();
  const onGateFinished = deferred<void>();
  let onGateSettled = false;
  const work = deferred<string>();
  const race = raceWithStatusGate({
    gateMs: 100,
    onGate: async () => {
      onGateStarted.resolve();
      await onGateFinished.promise;
      onGateSettled = true;
    },
    schedule: clock.schedule,
    work: work.promise,
  });
  await clock.advance(100);
  await onGateStarted.promise;
  work.resolve("ready");
  onGateFinished.resolve();
  const result = await race;
  assert.equal(onGateSettled, true);
  assert.equal(result.value, "ready");
  assert.equal(result.gated, true);
  assert.equal(result.dispatched, true);
});

test("onGate rejection is swallowed, not surfaced as an unhandled rejection", async () => {
  const clock = createManualClock();
  const work = deferred<string>();
  const race = raceWithStatusGate({
    gateMs: 50,
    onGate: () => {
      throw new Error("status dispatch failed");
    },
    schedule: clock.schedule,
    work: work.promise,
  });
  await clock.advance(50);
  work.resolve("still delivered");
  const result = await race;
  assert.equal(result.value, "still delivered");
  assert.equal(result.gated, true);
  assert.equal(result.dispatched, false);
});

test("work rejection propagates after a fired onGate finishes running", async () => {
  const clock = createManualClock();
  const onGateStarted = deferred<void>();
  let onGateFinished = false;
  const work = deferred<string>();
  const race = raceWithStatusGate({
    gateMs: 10,
    onGate: async () => {
      onGateStarted.resolve();
      onGateFinished = true;
    },
    schedule: clock.schedule,
    work: work.promise,
  });
  await clock.advance(10);
  await onGateStarted.promise;
  work.reject(new Error("tier 2 blew up"));
  await assert.rejects(race, /tier 2 blew up/);
  assert.equal(onGateFinished, true);
});

test("real setTimeout default schedule still gates a genuinely slow promise", async () => {
  let fired = false;
  const result = await raceWithStatusGate({
    gateMs: 5,
    onGate: () => {
      fired = true;
    },
    work: new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 20);
    }),
  });
  assert.equal(fired, true);
  assert.equal(result.gated, true);
  assert.equal(result.dispatched, true);
  assert.equal(result.value, "late");
});

test("cancel that invokes the callback after settle cannot fire onGate", async () => {
  let onGateCalls = 0;
  const result = await raceWithStatusGate({
    gateMs: 2000,
    onGate: () => {
      onGateCalls += 1;
    },
    schedule: (fn) => ({
      cancel() {
        fn();
      },
    }),
    work: Promise.resolve("done"),
  });
  assert.equal(result.gated, false);
  assert.equal(result.dispatched, false);
  assert.equal(onGateCalls, 0);
});

test("a hung onGate does not stall the race after settleMs", async () => {
  const clock = createManualClock();
  const work = deferred<string>();
  const started = Date.now();
  const race = raceWithStatusGate({
    gateMs: 10,
    onGate: () => new Promise<void>(() => undefined),
    schedule: clock.schedule,
    settleMs: 25,
    work: work.promise,
  });
  await clock.advance(10);
  work.resolve("ready");
  const result = await race;
  const elapsed = Date.now() - started;
  assert.equal(result.value, "ready");
  assert.equal(result.gated, true);
  assert.equal(result.dispatched, false);
  assert.ok(elapsed < 500, `hung onGate stalled the race for ${elapsed}ms`);
});
