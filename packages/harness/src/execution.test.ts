import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { runExecuteTypescript, type HostTool } from "./code-mode.js";
import { createExecutionAgent } from "./execution.js";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

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

  assert.equal(result.kind, "completed");
  assert.ok(
    result.invokedTools.includes("bash") ||
      result.invokedTools.includes("readFile"),
  );
  if (result.kind !== "completed") {
    assert.fail("execution should complete");
  }
  assert.equal(workbench.destination, "/workspace");
});

test("execute_typescript allowlists external_ping and rejects unknown names", async () => {
  const ping: HostTool = {
    description: "Stub ping",
    async execute(input: unknown) {
      const parsed = z.object({ message: z.string() }).strict().parse(input);
      return { pong: parsed.message };
    },
    id: "ping",
    inputSchema: z.object({ message: z.string() }).strict(),
  };

  const completed = await runExecuteTypescript({
    hostTools: [ping],
    source: 'return await external_ping({ message: "ok" });',
  });
  assert.deepEqual(completed, {
    kind: "completed",
    value: { pong: "ok" },
  });

  await assert.rejects(
    () =>
      runExecuteTypescript({
        hostTools: [ping],
        source: "return await external_secret({ message: \"nope\" });",
      }),
    /host tool secret is not allowlisted/,
  );
});
