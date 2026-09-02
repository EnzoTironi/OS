import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  type JourneyRunContext,
} from "./journey-run-context.js";

const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonceSchema = z.string().regex(/^[0-9a-f]{64}$/);
const scenarioFields = {
  ci: z.boolean(),
  compose: z.boolean(),
  minio: z.boolean(),
  name: idSchema,
  realm: idSchema.optional(),
};
const scenarioSchema = z.discriminatedUnion("class", [
  z
    .object({
      ...scenarioFields,
      class: z.literal("static"),
      weight: z.literal(0),
    })
    .strict(),
  z
    .object({
      ...scenarioFields,
      class: z.literal("live"),
      weight: z.number().int().min(1).max(4),
    })
    .strict(),
  z
    .object({
      ...scenarioFields,
      class: z.literal("credential"),
      weight: z.literal(4),
    })
    .strict(),
]);
const registrySchema = z.array(scenarioSchema);
const reconciliationSchema = z
  .object({
    leases: z.array(
      z
        .object({ runId: idSchema, scenario: idSchema, suiteId: idSchema })
        .strict(),
    ),
    uncertain: z.boolean(),
  })
  .strict();
const cleanupSchema = z
  .object({
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.literal("clean"),
  })
  .passthrough();
const processMetadataSchema = z
  .object({
    groupCleanToken: z.string().regex(/^[0-9a-f]{64}$/),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    pgid: z.number().int().positive(),
  })
  .passthrough();
const groupCleanSchema = z
  .object({
    groupCleanToken: z.string().regex(/^[0-9a-f]{64}$/),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    pgid: z.number().int().positive(),
    status: z.literal("group-empty"),
  })
  .passthrough();

type RegisteredScenario = z.infer<typeof scenarioSchema>;
type LiveScenario = Extract<RegisteredScenario, { readonly class: "live" }>;
type ChildOutcome =
  | { readonly error: Error; readonly kind: "error" }
  | {
      readonly code: number | null;
      readonly kind: "exit";
      readonly signal: NodeJS.Signals | null;
    };
type TrackedChild = {
  readonly abandon: () => void;
  readonly completion: Promise<ChildOutcome>;
  readonly isSettled: () => boolean;
  readonly label: string;
  readonly ownerNonce: string;
  readonly pid: number | undefined;
  readonly stderr: () => string;
  readonly stdout: () => string;
};
type RunningJourney = {
  readonly pointer: string;
  readonly process: TrackedChild;
  readonly scenario: LiveScenario;
};
type PoolEvent =
  | {
      readonly kind: "child";
      readonly outcome: ChildOutcome;
      readonly scenarioName: string;
    }
  | { readonly kind: "signal"; readonly signal: NodeJS.Signals };
type AggregateEvent =
  | { readonly kind: "child"; readonly outcome: ChildOutcome }
  | { readonly kind: "signal"; readonly signal: NodeJS.Signals };

const terminationGraceMilliseconds = 5_000;
const runtimeCommandTimeoutMilliseconds = 120_000;
const cancellationConvergenceMilliseconds = 120_000;
const repositoryRoot = process.cwd();
const runScript = path.join(repositoryRoot, "e2e", "run.sh");
const prepareLockScript = path.join(repositoryRoot, "e2e", "prepare-lock.mjs");
const suiteReaderToken = nonceSchema.parse(
  internalFlag("--zoen-suite-reader-token"),
);
const suiteOwnerNonce = nonceSchema.parse(
  internalFlag("--zoen-suite-owner-nonce"),
);
const scenarioArguments = argumentsAfterSeparator();

async function runPool(): Promise<void> {
  let signalControl: SignalControl | undefined;
  let failure: unknown;
  try {
    const scenarios = await selectedLiveScenarios();
    const capacity = parallelCapacity(scenarios);
    const suiteId = idSchema.parse(
      process.env.ZOEN_E2E_SUITE_ID || generatedId("verify"),
    );
    const suiteRoot = path.join(
      repositoryRoot,
      ".cache",
      "e2e",
      "suites",
      suiteId,
    );
    const contextList = path.join(
      suiteRoot,
      `contexts-${randomBytes(12).toString("hex")}.list`,
    );
    signalControl = installSignalControl();
    await mkdir(suiteRoot, { recursive: true });
    const interrupted = signalControl.current();
    if (interrupted !== undefined) {
      throw new PoolInterrupted(interrupted);
    }
    const pointers = await scheduleJourneys({
      capacity,
      scenarios,
      signalControl,
      suiteId,
      suiteRoot,
    });
    const interruptedAfterJourneys = signalControl.current();
    if (interruptedAfterJourneys !== undefined) {
      throw new PoolInterrupted(interruptedAfterJourneys);
    }
    await writeContextList(contextList, pointers);
    const aggregateManifest = await aggregateSuite({
      contextList,
      expectedScenarios: scenarios.map((scenario) => scenario.name).join(","),
      signalControl,
      suiteId,
    });
    process.stdout.write(`${aggregateManifest}\n`);
  } catch (error) {
    failure = error;
  } finally {
    signalControl?.dispose();
    try {
      releaseSuiteReader();
    } catch (error) {
      failure =
        failure === undefined
          ? error
          : new AggregateError(
              [errorFromUnknown(failure), errorFromUnknown(error)],
              "journey pool failed and could not release its suite reader",
            );
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
}

async function selectedLiveScenarios(): Promise<readonly LiveScenario[]> {
  const registryPath = path.join(repositoryRoot, "e2e", "scenarios.json");
  const unparsed: unknown = JSON.parse(await readFile(registryPath, "utf8"));
  const registry = registrySchema.parse(unparsed);
  validateRegistry(registry);
  const live = registry.filter(isLiveScenario);
  const requested = scenarioArguments.map((name) => idSchema.parse(name));

  if (requested.length === 0) {
    if (live.length === 0) {
      throw new Error("e2e/scenarios.json contains no live scenarios");
    }
    return live;
  }
  if (new Set(requested).size !== requested.length) {
    throw new Error("journey pool scenario selection contains duplicates");
  }
  const liveByName = new Map(live.map((scenario) => [scenario.name, scenario]));
  return requested.map((name) => {
    const scenario = liveByName.get(name);
    if (scenario === undefined) {
      throw new Error(`${name} is not a registered live scenario`);
    }
    return scenario;
  });
}

function validateRegistry(registry: readonly RegisteredScenario[]): void {
  const names = new Set<string>();
  for (const scenario of registry) {
    if (names.has(scenario.name)) {
      throw new Error(`duplicate scenario registry entry: ${scenario.name}`);
    }
    names.add(scenario.name);
  }
}

function isLiveScenario(scenario: RegisteredScenario): scenario is LiveScenario {
  return scenario.class === "live";
}

function parallelCapacity(scenarios: readonly LiveScenario[]): number {
  const raw = process.env.ZOEN_E2E_PARALLEL_WEIGHT ?? "4";
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(
      "ZOEN_E2E_PARALLEL_WEIGHT must be a positive integer",
    );
  }
  const capacity = Number(raw);
  const maxWeight = Math.max(...scenarios.map((scenario) => scenario.weight));
  if (!Number.isSafeInteger(capacity) || capacity > 4 || capacity < maxWeight) {
    throw new Error(
      `ZOEN_E2E_PARALLEL_WEIGHT must be an integer from ${maxWeight} through 4`,
    );
  }
  return capacity;
}

async function scheduleJourneys(input: {
  readonly capacity: number;
  readonly scenarios: readonly LiveScenario[];
  readonly signalControl: SignalControl;
  readonly suiteId: string;
  readonly suiteRoot: string;
}): Promise<readonly string[]> {
  const pending = [...input.scenarios];
  const running = new Map<string, RunningJourney>();
  const admitted: RunningJourney[] = [];
  const pointers = new Map<string, string>();
  const events = eventQueue<PoolEvent>();
  let accepting = input.signalControl.current() === undefined;
  let occupiedWeight = 0;

  void input.signalControl.signal.then((signal) => {
    accepting = false;
    events.publish({ kind: "signal", signal });
  });

  try {
    while (pending.length > 0 || running.size > 0) {
      while (accepting) {
        const index = pending.findIndex(
          (scenario) =>
            occupiedWeight + scenario.weight <= input.capacity,
        );
        if (index < 0) {
          break;
        }
        const scenario = pending.splice(index, 1)[0];
        if (scenario === undefined) {
          throw new Error("journey scheduler lost a pending scenario");
        }
        const journey = startJourney({
          onOutcome: (outcome) => {
            if (!childSucceeded(outcome)) {
              accepting = false;
            }
            events.publish({
              kind: "child",
              outcome,
              scenarioName: scenario.name,
            });
          },
          scenario,
          suiteId: input.suiteId,
          suiteRoot: input.suiteRoot,
        });
        running.set(scenario.name, journey);
        admitted.push(journey);
        occupiedWeight += scenario.weight;
      }

      if (running.size === 0) {
        const interrupted = input.signalControl.current();
        if (interrupted !== undefined) {
          throw new PoolInterrupted(interrupted);
        }
        throw new Error("journey scheduler cannot admit a pending scenario");
      }

      const event = await events.next();
      if (event.kind === "signal") {
        throw new PoolInterrupted(event.signal);
      }
      const journey = running.get(event.scenarioName);
      if (journey === undefined) {
        throw new Error(
          `journey scheduler received a duplicate completion for ${event.scenarioName}`,
        );
      }
      running.delete(event.scenarioName);
      occupiedWeight -= journey.scenario.weight;
      if (!childSucceeded(event.outcome)) {
        throw childFailure(journey.process.label, event.outcome);
      }
      pointers.set(journey.scenario.name, journey.pointer);
    }
  } catch (error) {
    accepting = false;
    const shutdownFailures: Error[] = [];
    try {
      await terminateChildren(
        admitted.map((journey) => journey.process),
      );
    } catch (terminationError) {
      shutdownFailures.push(errorFromUnknown(terminationError));
    }
    try {
      await reconcileAdmittedJourneys(admitted, input.suiteId);
    } catch (reconciliationError) {
      shutdownFailures.push(errorFromUnknown(reconciliationError));
    }
    if (shutdownFailures.length > 0) {
      throw new AggregateError(
        [errorFromUnknown(error), ...shutdownFailures],
        "journey pool failed and did not fully converge admitted journeys",
      );
    }
    throw error;
  }

  return input.scenarios.map((scenario) => {
    const pointer = pointers.get(scenario.name);
    if (pointer === undefined) {
      throw new Error(`journey ${scenario.name} completed without a pointer`);
    }
    return pointer;
  });
}

function startJourney(input: {
  readonly onOutcome: (outcome: ChildOutcome) => void;
  readonly scenario: LiveScenario;
  readonly suiteId: string;
  readonly suiteRoot: string;
}): RunningJourney {
  const runId = generatedId(input.scenario.name);
  const pointer = path.join(
    input.suiteRoot,
    `${input.scenario.name}-${runId}.pointer`,
  );
  const child = startTrackedChild({
    arguments: ["run", input.scenario.name],
    environment: {
      ...process.env,
      ZOEN_E2E_CONTEXT_POINTER: pointer,
      ZOEN_E2E_RUN_ID: runId,
      ZOEN_E2E_SUITE_ID: input.suiteId,
    },
    label: `journey ${input.scenario.name}`,
    onOutcome: input.onOutcome,
    progressToStderr: true,
  });
  return { pointer, process: child, scenario: input.scenario };
}

async function aggregateSuite(input: {
  readonly contextList: string;
  readonly expectedScenarios: string;
  readonly signalControl: SignalControl;
  readonly suiteId: string;
}): Promise<string> {
  const interrupted = input.signalControl.current();
  if (interrupted !== undefined) {
    throw new PoolInterrupted(interrupted);
  }
  const aggregate = startTrackedChild({
    arguments: [
      "aggregate",
      input.suiteId,
      input.expectedScenarios,
      input.contextList,
    ],
    captureOutput: true,
    environment: process.env,
    label: `aggregate suite ${input.suiteId}`,
  });
  const event = await Promise.race([
    aggregate.completion.then<AggregateEvent>((outcome) => ({
      kind: "child",
      outcome,
    })),
    input.signalControl.signal.then<AggregateEvent>((signal) => ({
      kind: "signal",
      signal,
    })),
  ]);
  if (event.kind === "signal") {
    await terminateChildren([aggregate]);
    throw new PoolInterrupted(event.signal);
  }
  if (!childSucceeded(event.outcome)) {
    throw childFailure(aggregate.label, event.outcome);
  }
  const interruptedAfterAggregate = input.signalControl.current();
  if (interruptedAfterAggregate !== undefined) {
    throw new PoolInterrupted(interruptedAfterAggregate);
  }
  const output = aggregate.stdout().trim();
  if (output === "" || output.includes("\n") || !path.isAbsolute(output)) {
    throw new Error(
      `aggregate suite ${input.suiteId} did not emit one absolute manifest path`,
    );
  }
  return output;
}

function startTrackedChild(input: {
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

async function terminateChildren(children: readonly TrackedChild[]): Promise<void> {
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

async function reconcileAdmittedJourneys(
  journeys: readonly RunningJourney[],
  suiteId: string,
): Promise<void> {
  const deadlineAt = Date.now() + cancellationConvergenceMilliseconds;
  const contexts = new Map<string, JourneyRunContext>();
  let lastFailures: Error[] = [];
  let lastOwned: z.infer<typeof reconciliationSchema>["leases"] = [];
  while (Date.now() < deadlineAt) {
    const iterationFailures: Error[] = [];
    await Promise.all(
      journeys.map(async (journey) => {
        try {
          const pointer = journeyContextPointerSchema.parse(
            JSON.parse(await readFile(journey.pointer, "utf8")),
          );
          const context = journeyRunContextSchema.parse(
            JSON.parse(await readFile(pointer.contextFile, "utf8")),
          );
          if (context.suiteId !== suiteId) {
            throw new Error(
              `cancelled pointer ${journey.pointer} belongs to ${context.suiteId}`,
            );
          }
          contexts.set(context.lease.ownerToken, context);
        } catch (error) {
          if (!isMissingFile(error)) {
            iterationFailures.push(errorFromUnknown(error));
          }
        }
      }),
    );

    const cleanupResults = await Promise.allSettled(
      [...contexts.values()].map((context) => cleanupContext(context)),
    );
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        iterationFailures.push(errorFromUnknown(result.reason));
      }
    }

    try {
      const reconciliation = await reconcileRuntime();
      if (reconciliation.uncertain) {
        throw new Error(
          "shared journey registry remains uncertain after cancellation",
        );
      }
      lastOwned = reconciliation.leases.filter(
        (lease) => lease.suiteId === suiteId,
      );
      if (lastOwned.length === 0) {
        const receiptResults = await Promise.allSettled(
          [...contexts.values()].map(assertContextClean),
        );
        for (const result of receiptResults) {
          if (result.status === "rejected") {
            iterationFailures.push(errorFromUnknown(result.reason));
          }
        }
        if (iterationFailures.length === 0) {
          return;
        }
      }
    } catch (error) {
      iterationFailures.push(errorFromUnknown(error));
    }
    lastFailures = iterationFailures;
    await delay(250);
  }
  if (lastOwned.length > 0) {
    lastFailures.push(
      new Error(
        `cancelled suite still owns leases: ${lastOwned.map((lease) => `${lease.scenario}/${lease.runId}`).join(",")}`,
      ),
    );
  }
  throw new AggregateError(
    lastFailures.length > 0
      ? lastFailures
      : [new Error("cancelled suite cleanup exceeded its deadline")],
    "cancelled journey suite did not converge to owned cleanup",
  );
}

async function cleanupContext(context: JourneyRunContext): Promise<void> {
  const cleanup = startTrackedChild({
    arguments: [
      "cleanup",
      path.join(context.paths.runRoot, "context.json"),
    ],
    environment: process.env,
    label: `cleanup ${context.scenario}/${context.runId}`,
  });
  const outcome = await boundedChildOutcome(
    cleanup,
    runtimeCommandTimeoutMilliseconds,
  );
  if (!childSucceeded(outcome)) {
    throw childFailure(cleanup.label, outcome);
  }
}

async function reconcileRuntime(): Promise<z.infer<typeof reconciliationSchema>> {
  const reconciliation = startTrackedChild({
    arguments: ["reconcile"],
    captureOutput: true,
    environment: process.env,
    label: "journey registry reconciliation",
  });
  const outcome = await boundedChildOutcome(
    reconciliation,
    runtimeCommandTimeoutMilliseconds,
  );
  if (!childSucceeded(outcome)) {
    throw new Error(
      `journey registry reconciliation failed: ${reconciliation.stderr() || childFailure("reconcile", outcome).message}`,
    );
  }
  return reconciliationSchema.parse(JSON.parse(reconciliation.stdout()));
}

async function assertContextClean(context: JourneyRunContext): Promise<void> {
  try {
    await stat(context.lease.directory);
    throw new Error(`lease directory remains for ${context.scenario}/${context.runId}`);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  const cleanup = cleanupSchema.parse(
    JSON.parse(
      await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8"),
    ),
  );
  if (cleanup.ownerToken !== context.lease.ownerToken) {
    throw new Error(`cleanup receipt owner mismatch for ${context.runId}`);
  }
  const metadataPath = path.join(context.paths.process, "scenario.json");
  let metadata: z.infer<typeof processMetadataSchema>;
  try {
    metadata = processMetadataSchema.parse(
      JSON.parse(await readFile(metadataPath, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return;
    }
    throw error;
  }
  const groupClean = groupCleanSchema.parse(
    JSON.parse(
      await readFile(
        path.join(context.paths.process, "group-clean.json"),
        "utf8",
      ),
    ),
  );
  if (
    metadata.ownerToken !== context.lease.ownerToken ||
    groupClean.ownerToken !== context.lease.ownerToken ||
    groupClean.groupCleanToken !== metadata.groupCleanToken ||
    groupClean.pgid !== metadata.pgid
  ) {
    throw new Error(`process cleanup receipt mismatch for ${context.runId}`);
  }
}

async function boundedChildOutcome(
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

function childSucceeded(outcome: ChildOutcome): boolean {
  return outcome.kind === "exit" && outcome.code === 0 && outcome.signal === null;
}

function childFailure(label: string, outcome: ChildOutcome): Error {
  if (outcome.kind === "error") {
    return new Error(`${label} failed to start: ${outcome.error.message}`);
  }
  return new Error(
    `${label} failed (${outcome.signal ?? `exit ${outcome.code ?? "unknown"}`})`,
  );
}

function eventQueue<Event>(): {
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

type SignalControl = {
  readonly current: () => NodeJS.Signals | undefined;
  readonly dispose: () => void;
  readonly signal: Promise<NodeJS.Signals>;
};

function installSignalControl(): SignalControl {
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

async function writeContextList(
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

function generatedId(prefix: string): string {
  return idSchema.parse(
    `${prefix}-${Date.now()}-${randomBytes(8).toString("hex")}`,
  );
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ESRCH"
  );
}

type ProcessOwnership =
  | { readonly kind: "foreign" }
  | { readonly kind: "missing" }
  | { readonly kind: "owned" }
  | { readonly kind: "uncertain"; readonly reason: string };

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
      timeout: 5_000,
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

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ENOENT"
  );
}

function completesWithin(
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

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map(formatError)].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function releaseSuiteReader(): void {
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

function internalFlag(name: string): string {
  const separator = process.argv.indexOf("--");
  const limit = separator < 0 ? process.argv.length : separator;
  const index = process.argv.indexOf(name);
  const value = index < 2 || index >= limit ? undefined : process.argv[index + 1];
  if (value === undefined || value === "" || index + 1 >= limit) {
    throw new Error(`${name} is required before --`);
  }
  return value;
}

function argumentsAfterSeparator(): readonly string[] {
  const separator = process.argv.indexOf("--");
  if (separator < 0) {
    throw new Error("journey pool requires -- before scenario names");
  }
  return process.argv.slice(separator + 1);
}

class PoolInterrupted extends Error {
  readonly signal: NodeJS.Signals;

  constructor(signal: NodeJS.Signals) {
    super(`journey pool interrupted by ${signal}`);
    this.name = "PoolInterrupted";
    this.signal = signal;
  }
}

try {
  await runPool();
} catch (error) {
  if (error instanceof PoolInterrupted) {
    process.exitCode = error.signal === "SIGINT" ? 130 : 143;
  } else {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}
