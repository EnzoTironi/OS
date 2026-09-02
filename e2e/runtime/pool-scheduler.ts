import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  idSchema,
  registrySchema,
  type AggregateEvent,
  type ChildOutcome,
  type LiveScenario,
  type PoolEvent,
  type RegisteredScenario,
  type RunningJourney,
} from "./pool-contracts.js";
import { repositoryRoot, scenarioArguments } from "./pool-environment.js";
import {
  PoolInterrupted,
  errorFromUnknown,
  eventQueue,
  generatedId,
  installSignalControl,
  releaseSuiteReader,
  type SignalControl,
  writeContextList,
} from "./pool-control.js";
import {
  childFailure,
  childSucceeded,
  startTrackedChild,
  terminateChildren,
} from "./pool-process.js";
import { reconcileAdmittedJourneys } from "./pool-reconciliation.js";

export async function runPool(): Promise<void> {
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
