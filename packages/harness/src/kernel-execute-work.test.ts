import assert from "node:assert/strict";
import test from "node:test";
import {
  createInteractionScratch,
  createInteractionTools,
  INTERACTION_TOOL_NAMES,
} from "../../speaker/src/interaction-tools.js";
import type {
  CodeModeCommitRequest,
  CodeModeProposeRequest,
  CodeModeQueryRequest,
  ExecutionCodeModeHost,
} from "./execution-host.js";
import { createInteractionExecuteWork } from "./interaction-execute-work.js";
import { jsSandboxAllowed } from "./js-sandbox-gate.js";
import {
  executeKernelTask,
  parseSpawnExecutionTask,
  PERSONAL_CREATE_REMINDER,
  createKernelExecuteWork,
  snapshotFromQuery,
} from "./kernel-execute-work.js";
import { liveKernelHostConfigured } from "./zoend-host-env.js";

const REMIND_JSON = JSON.stringify({
  actionId: PERSONAL_CREATE_REMINDER,
  inputs: [
    { id: "body", value: { kind: "text", value: "beber água" } },
    { id: "dueAt", value: { kind: "text", value: "amanhã" } },
  ],
});

function recordingKernelHost(): ExecutionCodeModeHost & {
  readonly commits: CodeModeCommitRequest[];
  readonly proposes: CodeModeProposeRequest[];
  readonly queries: CodeModeQueryRequest[];
} {
  const proposes: CodeModeProposeRequest[] = [];
  const commits: CodeModeCommitRequest[] = [];
  const queries: CodeModeQueryRequest[] = [];
  return {
    commits,
    proposes,
    queries,
    async query(request) {
      queries.push(request);
      return {
        actualCommitSequence: 1,
        values: [
          {
            claimIds: ["claim.quote.sheet"],
            value: { amount: "10", kind: "quantity", unit: "each" },
          },
          {
            claimIds: ["claim.quote.erp"],
            value: { amount: "12", kind: "quantity", unit: "each" },
          },
        ],
      };
    },
    async propose(request) {
      proposes.push(request);
      return {
        kind: "ready",
        proposal: {
          intentDigest: "a".repeat(64),
          operationId: request.operationId,
          proposalId: request.proposalId,
        },
      };
    },
    async commit(request) {
      commits.push(request);
      return {
        action: {
          actionId: PERSONAL_CREATE_REMINDER,
          commitSequence: 7,
          intentDigest: request.intentDigest,
          operationId: request.operationId,
          proposalId: request.proposalId,
          recovered: false,
        },
        kind: "committed",
      };
    },
  };
}

test("sandbox flag stays off in this file", () => {
  assert.equal(process.env.ZOEN_ALLOW_JS_SANDBOX, undefined);
  assert.equal(jsSandboxAllowed(), false);
});

test("parseSpawnExecutionTask maps JSON and NL remind onto createReminder", () => {
  const json = parseSpawnExecutionTask(REMIND_JSON);
  assert.equal(json.kind, "action");
  if (json.kind !== "action") {
    assert.fail("json remind");
  }
  assert.equal(json.request.actionId, PERSONAL_CREATE_REMINDER);
  const spoken = parseSpawnExecutionTask("me lembra de beber água amanhã");
  assert.equal(spoken.kind, "action");
  if (spoken.kind !== "action") {
    assert.fail("nl remind");
  }
  assert.equal(spoken.request.actionId, PERSONAL_CREATE_REMINDER);
  assert.equal(spoken.request.inputs[0]?.id, "body");
});

test("planted zoen propose+commit createReminder through kernel host, not JS sandbox", async () => {
  const inner = recordingKernelHost();
  const work = createKernelExecuteWork(inner);
  const status = await work.executeWork(REMIND_JSON);
  assert.equal(status, `status: committed (${PERSONAL_CREATE_REMINDER})`);
  assert.equal(inner.proposes.length, 1);
  assert.equal(inner.proposes[0]?.actionId, PERSONAL_CREATE_REMINDER);
  assert.equal(inner.commits.length, 1);
  assert.equal(jsSandboxAllowed(), false);
});

test("spawn_execution reaches planted zoen commit without speaker write tools", async () => {
  const inner = recordingKernelHost();
  const kernel = createKernelExecuteWork(inner);
  const scratch = createInteractionScratch();
  const tools = createInteractionTools(scratch, {
    executeWork: kernel.executeWork,
  });
  assert.deepEqual(Object.keys(tools).sort(), [...INTERACTION_TOOL_NAMES].sort());
  assert.equal(tools.note, undefined);
  assert.equal(tools.remind, undefined);
  assert.equal(tools.mint_href, undefined);
  assert.equal(tools.request_external, undefined);
  const spawn = tools.spawn_execution;
  assert.ok(spawn?.execute !== undefined);
  const result = await spawn.execute(
    { task: REMIND_JSON },
    { context: undefined, messages: [], toolCallId: "call_spawn" },
  );
  assert.deepEqual(result, {
    status: `status: committed (${PERSONAL_CREATE_REMINDER})`,
  });
  assert.deepEqual(scratch.executionNotes, [
    `status: committed (${PERSONAL_CREATE_REMINDER})`,
  ]);
  assert.equal(inner.commits.length, 1);
});

test("createInteractionExecuteWork binds kernel host without JS sandbox", async () => {
  const inner = recordingKernelHost();
  const work = await createInteractionExecuteWork({ host: inner });
  assert.ok(work !== undefined);
  assert.equal(work.workbench, undefined);
  const status = await work.executeWork("me lembra de beber água amanhã");
  assert.equal(status, `status: committed (${PERSONAL_CREATE_REMINDER})`);
  const snapshot = await work.world?.semanticQuery({
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.wa.enzo",
  });
  assert.deepEqual(inner.queries, [
    {
      capabilityId: "world",
      entityId: "commercial.order-line.dirty-quote",
      selection: { id: "commercial.quotedQuantity", kind: "relation" },
    },
  ]);
  assert.deepEqual(snapshot?.rivals, [
    { label: "10 each" },
    { label: "12 each" },
  ]);
  assert.deepEqual(snapshot?.notes, []);
  assert.deepEqual(snapshot?.entityIds, []);
});

test("world semanticQuery uses input.entityId when provided", async () => {
  const inner = recordingKernelHost();
  const work = createKernelExecuteWork(inner);
  await work.world.semanticQuery({
    entityId: "commercial.order-line.other",
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.wa.enzo",
  });
  assert.deepEqual(inner.queries[0], {
    capabilityId: "world",
    entityId: "commercial.order-line.other",
    selection: { id: "commercial.quotedQuantity", kind: "relation" },
  });
});

test("personal.Note semanticQuery stays on personal.body", async () => {
  const inner = recordingKernelHost();
  const work = createKernelExecuteWork(inner);
  await work.world.semanticQuery({
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.wa.enzo",
    typeApiName: "personal.Note",
  });
  assert.deepEqual(inner.queries[0], {
    capabilityId: "personal.Note",
    entityId: "membership.wa.enzo",
    selection: { id: "personal.body", kind: "relation" },
  });
});

test("snapshotFromQuery maps quantity to rivals and keeps entity ids off labels", () => {
  const snapshot = snapshotFromQuery({
    actualCommitSequence: 3,
    values: [
      {
        claimIds: ["claim.quote.sheet"],
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
      {
        claimIds: ["claim.quote.erp"],
        value: { amount: "12", kind: "quantity", unit: "each" },
      },
      {
        claimIds: ["claim.source"],
        value: { kind: "entity", value: "source.erp" },
      },
      {
        claimIds: ["claim.note"],
        value: { kind: "text", value: "anota o preço" },
      },
    ],
  });
  assert.deepEqual(snapshot, {
    entityIds: ["source.erp"],
    notes: ["anota o preço"],
    rivals: [{ label: "10 each" }, { label: "12 each" }],
  });
});

test("serve would bind the kernel host when Fly token file and zoend URL are set", () => {
  const env = {
    ZOEN_AGENT_BEARER_TOKEN_FILE: "/data/zoen/agent.token",
    ZOEN_IDENTITY_BASE_URL: "http://127.0.0.1:58701",
  };
  assert.equal(liveKernelHostConfigured(env), true);
  assert.equal(liveKernelHostConfigured({}), false);
  assert.equal(jsSandboxAllowed(env), false);
});

test("kernel executeWork fails openly when propose is denied", async () => {
  const status = await executeKernelTask(REMIND_JSON, {
    async query() {
      return {
        error: { capabilityId: "world", kind: "capability_unavailable" },
        kind: "failed",
      };
    },
    async explain() {
      return {
        error: { capabilityId: "world", kind: "capability_unavailable" },
        kind: "failed",
      };
    },
    async propose() {
      return { kind: "ok", result: { kind: "denied" } };
    },
    async commit() {
      return { kind: "denied", reason: "commit_forbidden" };
    },
  });
  assert.equal(status, "status: denied (denied)");
});
