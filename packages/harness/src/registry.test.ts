import assert from "node:assert/strict";
import test from "node:test";
import {
  planningRequestDigest,
  registerLiveProviders,
} from "./providers.js";
import { AgentRegistry } from "./registry.js";
import {
  actionPlanSchema,
  exactInputSchema,
  providerRouteSchema,
  semanticCapabilitySchema,
  semanticCapabilityScopeSchema,
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
const actionScope = semanticCapabilityScopeSchema.parse({
  actionId: "inventory.requestStock",
  definition,
  kind: "action",
  resourceId: "inventory.item.1",
  validAt: "2026-08-19T00:00:00.000Z",
});
const queryScope = semanticCapabilityScopeSchema.parse({
  definition,
  entityId: "inventory.item.1",
  kind: "query",
  selection: { id: "inventory.available", kind: "relation" },
  validAt: "2026-08-19T00:00:00.000Z",
});
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

test("future resolutions reflect provider and task-scope disposal", () => {
  const registry = new AgentRegistry();
  const provider = registry.registerProvider(openAiRoute, new FixedPlanner());
  const capability = registry.registerCapabilityScope(actionScope);
  registry.registerCapabilityScope(queryScope);

  assert.equal(
    registry.resolveProvider(openAiRoute.capability).kind,
    "available",
  );
  assert.equal(registry.capabilityScopes().length, 2);
  capability.dispose();
  assert.deepEqual(registry.capabilityScopes(), [queryScope]);
  provider.dispose();
  assert.equal(
    registry.resolveProvider(openAiRoute.capability).kind,
    "unavailable",
  );
});

test("provider kinds execute the same planning contract", async () => {
  const openAiRegistry = new AgentRegistry();
  const anthropicRegistry = new AgentRegistry();
  openAiRegistry.registerProvider(
    openAiRoute,
    new FixedPlanner("call.openai"),
  );
  anthropicRegistry.registerProvider(
    anthropicRoute,
    new FixedPlanner("call.anthropic"),
  );
  const openAi = openAiRegistry.resolveProvider(openAiRoute.capability);
  const anthropic = anthropicRegistry.resolveProvider(
    anthropicRoute.capability,
  );
  assert.equal(openAi.kind, "available");
  assert.equal(anthropic.kind, "available");
  if (openAi.kind !== "available" || anthropic.kind !== "available") {
    assert.fail("provider routes must resolve");
  }

  const request: PlanningRequest = {
    actions: [action],
    instruction: "Request one unit.",
    queries: [],
  };
  const openAiResult = await openAi.planner.plan(request);
  const anthropicResult = await anthropic.planner.plan(request);
  assert.deepEqual(openAiResult.plan, anthropicResult.plan);
  assert.equal(openAi.route.provider, "openai");
  assert.equal(anthropic.route.provider, "anthropic");
});

test("provider request attribution includes the visible tool menu", () => {
  const request: PlanningRequest = {
    actions: [action],
    instruction: "Request one unit.",
    queries: [],
  };
  const renamed = semanticCapabilitySchema.parse({
    ...action,
    alias: "different-visible-tool",
  });
  if (renamed.kind !== "action") {
    assert.fail("expected an Action capability");
  }
  assert.notEqual(
    planningRequestDigest(request),
    planningRequestDigest({ ...request, actions: [renamed] }),
  );
});

test("task commands cannot choose provider routes or capability menus", () => {
  const valid = {
    instruction: "Request one unit.",
    modelCapability: "reasoning-fast",
    taskId: "task.registry",
  };
  assert.equal(taskScopeSchema.safeParse(valid).success, true);
  assert.equal(
    taskScopeSchema.safeParse({
      ...valid,
      capabilities: ["request-stock"],
    }).success,
    false,
  );
  assert.equal(
    taskScopeSchema.safeParse({ ...valid, providerRoute: "openai-live" })
      .success,
    false,
  );
});

test("model output cannot carry identity or noncanonical exact values", () => {
  const parsed = actionPlanSchema.safeParse({
    action: "request-stock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "1" } }],
    principalId: "principal.admin",
    tenantId: "tenant.other",
  });
  assert.equal(parsed.success, false);
  assert.equal(
    exactInputSchema.safeParse({ kind: "integer", value: "01" }).success,
    false,
  );
  assert.equal(
    exactInputSchema.safeParse({ kind: "decimal", value: "1.10" }).success,
    false,
  );
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
  assert.equal(
    registry.resolveProvider(compatibleRoute.capability).kind,
    "available",
  );
  registrations[0]?.dispose();
  assert.equal(
    registry.resolveProvider(compatibleRoute.capability).kind,
    "unavailable",
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
