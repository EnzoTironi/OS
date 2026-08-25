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
  EXECUTION_INVOKED_TOOLS,
  type ExecutionInvokedTool,
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

type InvokedIsBashOnly =
  ExecutionInvokedTool extends "bash"
    ? "bash" extends ExecutionInvokedTool
      ? true
      : never
    : never;
const invokedIsBashOnly: InvokedIsBashOnly = true;
assert.equal(invokedIsBashOnly, true);
assert.deepEqual(EXECUTION_INVOKED_TOOLS, ["bash"]);

function modelToolNames(options: {
  tools?: ReadonlyArray<{ name: string }>;
}): string[] {
  return options.tools?.map((candidate) => candidate.name) ?? [];
}

test("execution isolate bash lists a planted sandbox file", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      const names = modelToolNames(options);
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

  const workbench = await createExecutionAgent({
    files: { "note.txt": "hello workbench" },
    membershipId: "membership.a",
    model,
    tenantId: "tenant.a",
  });
  const listed = await workbench.sandbox.executeCommand("ls -1");
  assert.equal(listed.exitCode, 0);
  assert.match(listed.stdout, /note\.txt/);
  assert.match(listed.stdout, /bin/);

  const result = await workbench.run("List the files in the workspace.");
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    assert.fail("execution should succeed");
  }
  assert.ok(result.invokedTools.includes("bash"));
  assert.equal(workbench.destination, "/workspace/tenant.a/membership.a");
});

test("execution isolate zoen query returns host query-result", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ text: "queried", type: "text" }],
      finishReason: { raw: "stop", unified: "stop" },
      usage,
      warnings: [],
    }),
  });
  const workbench = await createExecutionAgent({
    host: {
      async query(request) {
        assert.equal(request.capabilityId, "cap.query");
        assert.equal(request.entityId, "entity.1");
        assert.deepEqual(request.selection, {
          id: "rel.name",
          kind: "relation",
        });
        return {
          actualCommitSequence: 7n,
          values: [
            {
              claimIds: ["claim.alpha"],
              value: { kind: "text", value: "alpha" },
            },
          ],
        };
      },
    },
    model,
  });

  const planted = await workbench.sandbox.executeCommand("ls -1 bin");
  assert.match(planted.stdout, /zoen/);

  const queried = await workbench.sandbox.executeCommand(
    `zoen query '{"capabilityId":"cap.query","entityId":"entity.1","selection":{"kind":"relation","id":"rel.name"}}'`,
  );
  assert.equal(queried.exitCode, 0, queried.stderr);
  const body: unknown = JSON.parse(queried.stdout);
  assert.deepEqual(body, {
    actualCommitSequence: 7,
    values: [
      {
        claimIds: ["claim.alpha"],
        value: { kind: "text", value: "alpha" },
      },
    ],
  });
});

test("execution isolate zoen commit and host.commit are denied", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ text: "should not commit", type: "text" }],
      finishReason: { raw: "stop", unified: "stop" },
      usage,
      warnings: [],
    }),
  });
  const workbench = await createExecutionAgent({
    host: {
      async query() {
        return { actualCommitSequence: 1, values: [] };
      },
    },
    model,
  });

  const cli = await workbench.sandbox.executeCommand("zoen commit");
  assert.equal(cli.exitCode, 2);
  const cliBody: unknown = JSON.parse(cli.stdout);
  assert.deepEqual(cliBody, {
    kind: "denied",
    reason: "commit_forbidden",
  });
  assert.equal(workbench.gate.commitDenied, true);

  const host = await workbench.host.commit({
    capabilityId: "cap.action",
    intentDigest: "a".repeat(64),
    operationId: "op.1",
    proposalId: "proposal.1",
  });
  assert.deepEqual(host, {
    kind: "denied",
    reason: "commit_forbidden",
  });
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
    source: 'return await external_secret({ alias: "nope" });',
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
});
