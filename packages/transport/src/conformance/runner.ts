import type { CapabilityProbes } from "../capability-probes.js";
import type { ChatSdkShapedAdapter } from "../chat-sdk-shape.js";
import {
  CONFORMANCE_SCENARIOS,
  type ConformanceScenario,
} from "./scenarios.js";

export type TracePath = "native" | "degrade" | "protocol";

export interface ScenarioTrace {
  readonly scenarioId: string;
  readonly providerId: string;
  readonly path: TracePath;
  readonly interactionRecordId?: string;
  readonly deliveryObservationId?: string;
  readonly outcomeKind: string;
  readonly degradeFallback?: string;
}

export interface ScenarioContext {
  readonly adapter: ChatSdkShapedAdapter;
  readonly probes: CapabilityProbes;
  readonly scenario: ConformanceScenario;
  readonly path: TracePath;
}

export interface ScenarioHandler {
  (ctx: ScenarioContext): Promise<ScenarioTrace>;
}

/** Never skip: unsupported always takes the degrade branch. */
export async function runConformanceScenarios(
  adapters: readonly ChatSdkShapedAdapter[],
  handler: ScenarioHandler,
): Promise<readonly ScenarioTrace[]> {
  const traces: ScenarioTrace[] = [];
  for (const adapter of adapters) {
    for (const scenario of CONFORMANCE_SCENARIOS) {
      const path = selectPath(adapter.probes, scenario);
      const trace = await handler({
        adapter,
        path,
        probes: adapter.probes,
        scenario,
      });
      traces.push(trace);
    }
  }
  return traces;
}

export function selectPath(
  probes: CapabilityProbes,
  scenario: ConformanceScenario,
): TracePath {
  if (scenario.mode.kind === "protocol") {
    return "protocol";
  }
  const answer = probes.probe(scenario.mode.requires);
  if (answer.status === "native") {
    return "native";
  }
  if (
    scenario.mode.kind === "degrade" &&
    answer.degradeTo !== scenario.mode.expectDegradeTo
  ) {
    throw new Error(
      `${probes.providerId}.${scenario.mode.requires} degradeTo ${answer.degradeTo} !== expected ${scenario.mode.expectDegradeTo}`,
    );
  }
  return "degrade";
}
