process.env.ZOEN_ALLOW_JS_SANDBOX = "1";

import assert from "node:assert/strict";
import test from "node:test";
import type { LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import {
  resolveExecutionLanguageModel,
  resolveLanguageModel,
} from "../../speaker/src/interaction-turn.js";
import {
  createInteractionExecuteWork,
  executionStatus,
} from "./interaction-execute-work.js";
import type { ExecutionResult } from "./execution.js";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

type ExecutionKind = ExecutionResult["kind"];
type KindIsClosedUnion =
  ExecutionKind extends "ok" | "denied" | "failed"
    ? "ok" | "denied" | "failed" extends ExecutionKind
      ? true
      : never
    : never;
const kindIsClosedUnion: KindIsClosedUnion = true;
assert.equal(kindIsClosedUnion, true);

type ResultHasBooleanOkFlag = ExecutionResult extends { ok: boolean }
  ? true
  : false;
const resultHasBooleanOkFlag: ResultHasBooleanOkFlag = false;
assert.equal(resultHasBooleanOkFlag, false);

async function withModelEnv(
  patch: Readonly<Record<string, string | undefined>>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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

function assertExecutionKind(result: ExecutionResult): ExecutionKind {
  switch (result.kind) {
    case "ok":
      assert.equal(typeof result.text, "string");
      assert.ok(Array.isArray(result.invokedTools));
      assert.equal(typeof (result as { ok?: unknown }).ok, "undefined");
      return result.kind;
    case "denied":
      assert.equal(typeof result.reason, "string");
      return result.kind;
    case "failed":
      assert.equal(typeof result.reason, "string");
      return result.kind;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

test("createInteractionExecuteWork without a LanguageModel fails closed", async () => {
  await withModelEnv(
    { ZOEN_EXECUTION_MODEL: undefined, ZOEN_MODEL: undefined },
    async () => {
      const work = await createInteractionExecuteWork();
      assert.equal(work, undefined);
    },
  );
});

test("createInteractionExecuteWork uses ZOEN_EXECUTION_MODEL when both envs are set", async () => {
  await withModelEnv(
    {
      OPENAI_API_KEY: "test-not-a-secret",
      OPENAI_BASE_URL: "https://example.test/v1",
      ZOEN_EXECUTION_MODEL: "openai-compatible/execution-test-model",
      ZOEN_MODEL: "openai-compatible/interaction-test-model",
    },
    async () => {
      assert.equal(
        resolvedModelId(resolveLanguageModel()),
        "interaction-test-model",
      );
      assert.equal(
        resolvedModelId(resolveExecutionLanguageModel()),
        "execution-test-model",
      );
      const work = await createInteractionExecuteWork();
      assert.ok(work !== undefined);
    },
  );
});

test("createInteractionExecuteWork falls back to ZOEN_MODEL when execution env is unset", async () => {
  await withModelEnv(
    {
      OPENAI_API_KEY: "test-not-a-secret",
      OPENAI_BASE_URL: "https://example.test/v1",
      ZOEN_EXECUTION_MODEL: undefined,
      ZOEN_MODEL: "openai-compatible/interaction-test-model",
    },
    async () => {
      assert.equal(
        resolvedModelId(resolveExecutionLanguageModel()),
        "interaction-test-model",
      );
      const work = await createInteractionExecuteWork();
      assert.ok(work !== undefined);
    },
  );
});

test("createInteractionExecuteWork with MockLanguageModelV3 returns ExecutionResult.kind union", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      const names = options.tools?.map((candidate) => candidate.name) ?? [];
      assert.ok(names.includes("bash"));
      assert.equal(names.includes("readFile"), false);
      assert.equal(names.includes("writeFile"), false);
      assert.equal(names.includes("execute_typescript"), false);
      assert.equal(names.includes("speak_to_user"), false);
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ command: "ls -1" }),
              toolCallId: "call.ls",
              toolName: "bash",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool_calls", unified: "tool-calls" },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ text: "note.txt is present", type: "text" }],
        finishReason: { raw: "stop", unified: "stop" },
        usage,
        warnings: [],
      };
    },
  });

  const work = await createInteractionExecuteWork({
    files: { "note.txt": "hello workbench" },
    model,
  });
  assert.ok(work !== undefined);
  const result = await work.run("List the files in the workspace.");
  const kind = assertExecutionKind(result);
  assert.ok(kind === "ok" || kind === "denied" || kind === "failed");
  assert.equal(typeof kind, "string");
  assert.notEqual(typeof kind, "boolean");
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    assert.fail("execution should succeed");
  }
  const status = await work.executeWork("List the files in the workspace.");
  assert.equal(typeof status, "string");
  assert.doesNotMatch(status, /Recebi/i);
});

test("createInteractionExecuteWork maps provider failure to failed kind", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error("provider down");
    },
  });
  const work = await createInteractionExecuteWork({ model });
  assert.ok(work !== undefined);
  const result = await work.run("List the files in the workspace.");
  assert.equal(assertExecutionKind(result), "failed");
  assert.deepEqual(result, { kind: "failed", reason: "provider_call_failed" });
  assert.equal(await work.executeWork("List the files in the workspace."), "status: failed (provider_call_failed)");
});

test("executionStatus covers the ExecutionResult kind union", () => {
  const ok: ExecutionResult = {
    invokedTools: ["bash"],
    kind: "ok",
    text: "rivals still stand",
  };
  const denied: ExecutionResult = {
    kind: "denied",
    reason: "commit_forbidden",
  };
  const failed: ExecutionResult = {
    kind: "failed",
    reason: "timeout",
  };
  assert.equal(executionStatus(ok), "rivals still stand");
  assert.equal(executionStatus(denied), "status: denied (commit_forbidden)");
  assert.equal(executionStatus(failed), "status: failed (timeout)");
  for (const result of [ok, denied, failed]) {
    assert.ok(
      result.kind === "ok" ||
        result.kind === "denied" ||
        result.kind === "failed",
    );
  }
});
