import assert from "node:assert/strict";
import test from "node:test";
import { InvalidToolInputError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import {
  adaptiveSurfaceTemplate,
} from "./surface/adaptive.js";
import {
  type QueryBinding,
} from "./surface/model.js";
import {
  AiSdkPlanner,
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
  assert.equal(openAiResult.kind, "planned");
  assert.equal(anthropicResult.kind, "planned");
  if (openAiResult.kind !== "planned" || anthropicResult.kind !== "planned") {
    assert.fail("fixed planners must return plans");
  }
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

test("adaptive composition uses one required tool and unwraps Surface IR", async () => {
  const document = adaptiveTestDocument();
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      assert.deepEqual(options.toolChoice, { type: "required" });
      assert.deepEqual(
        options.tools?.map((candidate) => candidate.name),
        ["emit_surface"],
      );
      return {
        content: [
          {
            input: JSON.stringify(document),
            toolCallId: "call.surface",
            toolName: "emit_surface",
            type: "tool-call",
          },
        ],
        finishReason: { raw: "tool_calls", unified: "tool-calls" },
        usage: {
          inputTokens: {
            cacheRead: undefined,
            cacheWrite: undefined,
            noCache: 1,
            total: 1,
          },
          outputTokens: { reasoning: undefined, text: 1, total: 1 },
        },
        warnings: [],
      };
    },
  });

  const result = await new AiSdkPlanner(model).composeSurface({
    maxOutputTokens: 1_024,
    prompt: "{}",
    system: "Emit Surface IR.",
  });

  assert.deepEqual(result.document, document);
});

test("unknown rewritten tool names are rejected as not visible", async () => {
  const request: PlanningRequest = {
    actions: [action],
    instruction: "Request one unit.",
    queries: [],
  };
  const toolName = "action-invented-by-provider";
  const invalidCallModel = new MockLanguageModelV3({
    doGenerate: {
      content: [
        {
          input: JSON.stringify({
            inputs: [
              { id: "quantity", value: { kind: "integer", value: "1" } },
            ],
          }),
          toolCallId: "call.invented",
          toolName,
          type: "tool-call",
        },
      ],
      finishReason: { raw: "tool_calls", unified: "tool-calls" },
      usage: {
        inputTokens: {
          cacheRead: undefined,
          cacheWrite: undefined,
          noCache: 1,
          total: 1,
        },
        outputTokens: { reasoning: undefined, text: 1, total: 1 },
      },
      warnings: [],
    },
  });
  const invalidInputModel = new MockLanguageModelV3({
    doGenerate: async () => {
      throw new InvalidToolInputError({
        cause: new Error("invalid tool input"),
        toolInput: "{}",
        toolName,
      });
    },
  });

  for (const model of [invalidCallModel, invalidInputModel]) {
    assert.deepEqual(await new AiSdkPlanner(model).plan(request), {
      kind: "rejected",
      promptDigest: planningRequestDigest(request),
      reason: "action_not_visible",
    });
  }
});

test("missing tool names are invalid arguments, not visibility misses", async () => {
  const request: PlanningRequest = {
    actions: [action],
    instruction: "Request one unit.",
    queries: [],
  };

  for (const toolName of ["", undefined]) {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        const error = new InvalidToolInputError({
          cause: new Error("invalid tool input"),
          toolInput: "{}",
          toolName: toolName ?? "",
        });
        Object.defineProperty(error, "toolName", { value: toolName });
        throw error;
      },
    });
    assert.deepEqual(await new AiSdkPlanner(model).plan(request), {
      kind: "rejected",
      promptDigest: planningRequestDigest(request),
      reason: "invalid_arguments",
    });
  }
});

function adaptiveTestDocument() {
  const surfaceDefinition = {
    definitionId: definition.definitionId,
    digest: definition.digest,
    revision: definition.revision.toString(),
  };
  const queryBinding = {
    id: "query.relation.inventory.available",
    ref: {
      definition: surfaceDefinition,
      entityId: "inventory.item.1",
      kind: "relation",
      relationId: "inventory.available",
    },
  } satisfies QueryBinding;
  return adaptiveSurfaceTemplate({
    actions: [
      {
        id: "action.inventory.requestStock",
        inputs: [
          {
            inputId: "quantity",
            label: "Quantity",
            valueType: { kind: "integer" },
          },
        ],
        ref: {
          actionId: "inventory.requestStock",
          definition: surfaceDefinition,
          resourceId: "inventory.item.1",
        },
      },
    ],
    definition: surfaceDefinition,
    entityId: "inventory.item.1",
    evidence: [
      {
        fragmentDigest: "b".repeat(64),
        fragmentId: "c".repeat(64),
        kind: "company-source",
        retrievalTraceId: "d".repeat(64),
        sourceDigest: "e".repeat(64),
        sourceId: "source.inventory.policy",
        sourceRevision: "f".repeat(64),
      },
    ],
    explanations: [
      {
        explanationDigest: "1".repeat(64),
        kind: "operation-explanation",
        operationId: "operation.inventory.baseline",
      },
    ],
    generatedAt: "2026-08-20T00:00:00.000Z",
    knowledgeTraceId: "d".repeat(64),
    queries: [
      {
        actualCommitSequence: "1",
        binding: queryBinding,
        knowledgeCut: "2".repeat(64),
        resultDigest: "3".repeat(64),
        validAt: "2026-08-20T00:00:00.000Z",
        values: [{ kind: "integer", value: "10" }],
      },
    ],
    queryContextDigest: "4".repeat(64),
  });
}

class FixedPlanner implements ModelPlanner {
  readonly #providerCallId: string;

  constructor(providerCallId = "call.fixed") {
    this.#providerCallId = providerCallId;
  }

  async plan(): Promise<PlanningResult> {
    return {
      kind: "planned",
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
