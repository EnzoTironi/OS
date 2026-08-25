import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import {
  executionExternalIdSchema,
  runExecuteTypescript,
  type ExecutionExternalId,
} from "./code-mode.js";
import {
  createExecutionAgent,
  createWorldQueryHostTool,
} from "./execution.js";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

type PingIsNotExternal = "ping" extends ExecutionExternalId ? never : true;
const pingIsNotExternal: PingIsNotExternal = true;
assert.equal(pingIsNotExternal, true);
assert.equal(executionExternalIdSchema.safeParse("ping").success, false);

test("execution agent lists a sandbox file with bash or readFile", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      const names = options.tools?.map((candidate) => candidate.name) ?? [];
      assert.ok(names.includes("bash"));
      assert.ok(names.includes("readFile"));
      assert.ok(names.includes("writeFile"));
      assert.ok(names.includes("execute_typescript"));
      assert.equal(names.includes("speak_to_user"), false);
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ path: "note.txt" }),
              toolCallId: "call.read-note",
              toolName: "readFile",
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

  const workbench = await createExecutionAgent({
    files: { "note.txt": "hello workbench" },
    model,
  });
  const result = await workbench.run("List the files in the workspace.");

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    assert.fail("execution should succeed");
  }
  assert.ok(
    result.invokedTools.includes("bash") ||
      result.invokedTools.includes("readFile"),
  );
  assert.equal(workbench.destination, "/workspace");
});

test("execute_typescript allowlists external_world_query and denies unknown names", async () => {
  const externals = {
    world_query: createWorldQueryHostTool(async (input) => ({
      pong: input.alias,
    })),
  };

  const completed = await runExecuteTypescript({
    externals,
    source: 'return await external_world_query({ alias: "ok" });',
  });
  assert.deepEqual(completed, {
    kind: "ok",
    value: { pong: "ok" },
  });

  const denied = await runExecuteTypescript({
    externals,
    source: "return await external_secret({ alias: \"nope\" });",
  });
  assert.deepEqual(denied, {
    kind: "denied",
    reason: "external_not_allowlisted",
  });

  const forbidden = await runExecuteTypescript({
    externals,
    source: "return await external_commit({});",
  });
  assert.deepEqual(forbidden, {
    kind: "denied",
    reason: "commit_forbidden",
  });

  const escaped = await runExecuteTypescript({
    externals,
    source: "return process.pid;",
  });
  assert.deepEqual(escaped, {
    kind: "denied",
    reason: "host_escape",
  });
});

test("separate workbenches do not share just-bash files", async () => {
  const idle = () =>
    new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ text: "idle", type: "text" }],
        finishReason: { raw: "stop", unified: "stop" },
        usage,
        warnings: [],
      }),
    });
  const workA = await createExecutionAgent({
    destination: "/workspace-a",
    files: { "secret.txt": "secret-from-a" },
    model: idle(),
  });
  const workB = await createExecutionAgent({
    destination: "/workspace-b",
    files: {},
    model: idle(),
  });
  assert.equal(await workA.sandbox.readFile("/workspace-a/secret.txt"), "secret-from-a");
  await assert.rejects(workB.sandbox.readFile("/workspace-a/secret.txt"));
  await assert.rejects(workB.sandbox.readFile("/workspace-b/secret.txt"));
});
