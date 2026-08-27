import assert from "node:assert/strict";
import test from "node:test";
import type { LanguageModel } from "ai";
import { resolveLanguageModel } from "../../speaker/src/interaction-turn.js";
import { executionModelEnv } from "./whatsapp-execution-model.js";

const providerEnv = {
  OPENAI_API_KEY: "test-not-a-secret",
  OPENAI_BASE_URL: "https://example.test/v1",
} as const;

function resolvedModelId(model: LanguageModel | undefined): string | undefined {
  if (model === undefined) {
    return undefined;
  }
  if (typeof model === "string") {
    return model;
  }
  if ("modelId" in model && typeof model.modelId === "string") {
    return model.modelId;
  }
  return undefined;
}

test("executionModelEnv overlays ZOEN_EXECUTION_MODEL onto ZOEN_MODEL when set", () => {
  const env = {
    ...providerEnv,
    ZOEN_EXECUTION_MODEL: "openai-compatible/execution-test-model",
    ZOEN_MODEL: "openai-compatible/interaction-test-model",
  };
  assert.equal(
    resolvedModelId(resolveLanguageModel(env)),
    "interaction-test-model",
  );
  assert.equal(
    resolvedModelId(resolveLanguageModel(executionModelEnv(env))),
    "execution-test-model",
  );
});

test("executionModelEnv falls back to ZOEN_MODEL when execution env is unset", () => {
  const env = {
    ...providerEnv,
    ZOEN_MODEL: "openai-compatible/interaction-test-model",
  };
  assert.equal(
    resolvedModelId(resolveLanguageModel(executionModelEnv(env))),
    "interaction-test-model",
  );
});

test("empty ZOEN_EXECUTION_MODEL leaves ZOEN_MODEL unchanged", () => {
  const env = {
    ...providerEnv,
    ZOEN_EXECUTION_MODEL: "   ",
    ZOEN_MODEL: "openai-compatible/interaction-test-model",
  };
  assert.equal(
    resolvedModelId(resolveLanguageModel(executionModelEnv(env))),
    "interaction-test-model",
  );
});
