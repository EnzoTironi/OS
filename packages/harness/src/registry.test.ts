import assert from "node:assert/strict";
import test from "node:test";
import { registerLiveProviders } from "./providers.js";
import { AgentRegistry } from "./registry.js";
import {
  actionPlanSchema,
  providerRouteSchema,
  semanticCapabilitySchema,
  taskScopeSchema,
  type ModelPlanner,
  type PlanningRequest,
  type PlanningResult,
} from "./types.js";

const definition = {
  definitionId: "inventory.governed",
  digest: "a".repeat(64),
  revision: 1,
};
const parsedAction = semanticCapabilitySchema.parse({
  actionId: "inventory.requestStock",
  alias: "request-stock",
  definition,
  description: "Request one unit of stock.",
  inputs: [{ id: "quantity", kind: "integer" }],
  kind: "action",
  resourceId: "inventory.item.1",
  validAt: "2026-08-19T00:00:00.000Z",
});
if (parsedAction.kind !== "action") {
  throw new Error("expected an Action capability");
}
const action = parsedAction;
const query = semanticCapabilitySchema.parse({
  alias: "available-stock",
  definition,
  description: "Read available stock.",
  entityId: "inventory.item.1",
  kind: "query",
  selection: { id: "inventory.available", kind: "relation" },
  validAt: "2026-08-19T00:00:00.000Z",
});
const openAiRoute = providerRouteSchema.parse({
  capability: "reasoning-fast",
  id: "openai-live",
  modelId: "configured-openai-model",
  provider: "openai",
});
const anthropicRoute = providerRouteSchema.parse({
  capability: "reasoning-fast",
  id: "anthropic-live",
  modelId: "configured-anthropic-model",
  provider: "anthropic",
});
const compatibleRoute = providerRouteSchema.parse({
  capability: "reasoning-high",
  id: "compatible-live",
  modelId: "configured-compatible-model",
  provider: "openai-compatible",
});

test("registrations disappear from future registry resolutions", () => {
  const registry = new AgentRegistry();
  const provider = registry.registerProvider(openAiRoute, new FixedPlanner());
  const capability = registry.registerCapability(action);
  const task = taskScopeSchema.parse({
    capabilities: ["request-stock"],
    instruction: "Request one unit.",
    modelCapability: "reasoning-fast",
    providerRoute: "openai-live",
    taskId: "task.registry",
  });

  assert.equal(registry.resolve(task).kind, "available");
  capability.dispose();
  assert.equal(registry.resolve(task).kind, "capability_unavailable");
  provider.dispose();
  assert.equal(registry.resolve(task).kind, "provider_unavailable");
});

test("provider routes execute the same planning contract", async () => {
  const registry = new AgentRegistry();
  registry.registerProvider(openAiRoute, new FixedPlanner("call.openai"));
  registry.registerProvider(anthropicRoute, new FixedPlanner("call.anthropic"));
  registry.registerCapability(action);
  registry.registerCapability(query);
  const baseTask = {
    capabilities: ["available-stock", "request-stock"],
    instruction: "Request one unit.",
    modelCapability: "reasoning-fast",
    taskId: "task.providers",
  };
  const openAi = registry.resolve(
    taskScopeSchema.parse({ ...baseTask, providerRoute: "openai-live" }),
  );
  const anthropic = registry.resolve(
    taskScopeSchema.parse({ ...baseTask, providerRoute: "anthropic-live" }),
  );
  assert.equal(openAi.kind, "available");
  assert.equal(anthropic.kind, "available");
  if (openAi.kind !== "available" || anthropic.kind !== "available") {
    assert.fail("provider routes must resolve");
  }

  const request: PlanningRequest = {
    actions: [action],
    instruction: baseTask.instruction,
    queries: [],
  };
  const openAiResult = await openAi.planner.plan(request);
  const anthropicResult = await anthropic.planner.plan(request);
  assert.deepEqual(openAiResult.plan, anthropicResult.plan);
  assert.equal(openAi.route.provider, "openai");
  assert.equal(anthropic.route.provider, "anthropic");
});

test("model output cannot carry trusted identity fields", () => {
  const parsed = actionPlanSchema.safeParse({
    action: "request-stock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "1" } }],
    principalId: "principal.admin",
    tenantId: "tenant.other",
  });
  assert.equal(parsed.success, false);
});

test("OpenAI-compatible routes register without other provider secrets", () => {
  const registry = new AgentRegistry();
  const registrations = registerLiveProviders(
    registry,
    { routes: [compatibleRoute] },
    [
      {
        apiKey: "test-key",
        baseURL: "https://provider.invalid/v1",
        kind: "openai-compatible",
      },
    ],
  );
  const resolution = registry.resolve(
    taskScopeSchema.parse({
      capabilities: [],
      instruction: "Select the visible action.",
      modelCapability: "reasoning-high",
      providerRoute: "compatible-live",
      taskId: "task.compatible",
    }),
  );
  assert.equal(resolution.kind, "available");
  registrations[0]?.dispose();
  assert.equal(
    registry.resolve(
      taskScopeSchema.parse({
        capabilities: [],
        instruction: "Select the visible action.",
        modelCapability: "reasoning-high",
        providerRoute: "compatible-live",
        taskId: "task.compatible.after-dispose",
      }),
    ).kind,
    "provider_unavailable",
  );
});

class FixedPlanner implements ModelPlanner {
  readonly #providerCallId: string;

  constructor(providerCallId = "call.fixed") {
    this.#providerCallId = providerCallId;
  }

  async plan(): Promise<PlanningResult> {
    return {
      plan: actionPlanSchema.parse({
        action: "request-stock",
        inputs: [
          { id: "quantity", value: { kind: "integer", value: "1" } },
        ],
      }),
      promptDigest: "b".repeat(64),
      providerCallId: this.#providerCallId,
      responseModelId: "configured-model",
    };
  }
}
