import assert from "node:assert/strict";
import test from "node:test";
import { AgentRegistry } from "./registry.js";
import {
  agentSessionCommandSchema,
  type AgentAuthority,
  type AgentCommitOutcome,
  type AgentProposalCommand,
  type AgentProposalOutcome,
  runAgentSession,
  type SessionJournal,
} from "./session.js";
import {
  actionPlanSchema,
  providerRouteSchema,
  semanticCapabilitySchema,
  type ModelPlanner,
  type PlanningResult,
} from "./types.js";

const definition = {
  definitionId: "definition.session",
  digest: "a".repeat(64),
  revision: 1,
};
const parsedAction = semanticCapabilitySchema.parse({
  actionId: "action.session",
  alias: "request-change",
  definition,
  description: "Request a governed change.",
  inputs: [{ id: "quantity", kind: "integer" }],
  kind: "action",
  resourceId: "resource.session",
  validAt: "2026-08-19T00:00:00.000Z",
});
if (parsedAction.kind !== "action") {
  throw new Error("expected Action capability");
}
const action = parsedAction;
const parsedQuery = semanticCapabilitySchema.parse({
  alias: "read-state",
  definition,
  description: "Read the governed state.",
  entityId: "resource.session",
  kind: "query",
  selection: { id: "relation.session", kind: "relation" },
  validAt: "2026-08-19T00:00:00.000Z",
});
if (parsedQuery.kind !== "query") {
  throw new Error("expected Query capability");
}
const query = parsedQuery;
const route = providerRouteSchema.parse({
  capability: "reasoning-fast",
  id: "provider.session",
  modelId: "model.session",
  provider: "openai-compatible",
});
const policy = {
  determiningPolicyIds: ["policy.session.permit"],
  digest: "b".repeat(64),
  policyId: "policy.session",
  revision: "1",
};
const command = agentSessionCommandSchema.parse({
  expiresAt: "2026-08-20T00:00:00.000Z",
  operationId: "operation.session",
  proposalId: "proposal.session",
  sessionId: "session.test",
  task: {
    capabilities: ["read-state", "request-change"],
    instruction: "Request one unit.",
    modelCapability: "reasoning-fast",
    providerRoute: "provider.session",
    taskId: "task.session",
  },
});

test("ready policy uses ordinary commit and returns correlation", async () => {
  const authority = new FixedAuthority({
    kind: "ready",
    intentDigest: "c".repeat(64),
    policy,
    proposalId: command.proposalId,
  });
  const journal = new RecordingJournal();
  const result = await runAgentSession(runtime(authority), command, journal);
  assert.equal(result.kind, "committed");
  if (result.kind !== "committed") {
    assert.fail("session must commit");
  }
  assert.equal(result.receipt.actionId, action.actionId);
  assert.equal(result.provider.providerRouteId, route.id);
  assert.equal(result.recoveredByOperationId, true);
  assert.deepEqual(journal.names, [
    "query scoped capabilities",
    "select scoped Action tool",
    "propose ordinary Action",
    "commit or recover ordinary Action",
  ]);
  assert.equal(authority.commitCalls, 1);
});

test("approval policy stops before commit", async () => {
  const authority = new FixedAuthority({
    kind: "awaiting_approval",
    intentDigest: "c".repeat(64),
    policy,
    proposalId: command.proposalId,
  });
  const result = await runAgentSession(
    runtime(authority),
    command,
    new RecordingJournal(),
  );
  assert.equal(result.kind, "awaiting_approval");
  assert.equal(authority.commitCalls, 0);
});

test("deny policy stops before commit", async () => {
  const authority = new FixedAuthority({ kind: "denied", policy });
  const result = await runAgentSession(
    runtime(authority),
    command,
    new RecordingJournal(),
  );
  assert.equal(result.kind, "denied");
  assert.equal(authority.commitCalls, 0);
});

test("session commands reject model-style trusted identity fields", () => {
  const parsed = agentSessionCommandSchema.safeParse({
    ...command,
    principalId: "principal.forged",
    tenantId: "tenant.forged",
  });
  assert.equal(parsed.success, false);
});

function runtime(authority: AgentAuthority) {
  const registry = new AgentRegistry();
  registry.registerCapability(action);
  registry.registerCapability(query);
  registry.registerProvider(route, new FixedPlanner());
  return { authority, registry };
}

class FixedPlanner implements ModelPlanner {
  async plan(): Promise<PlanningResult> {
    return {
      plan: actionPlanSchema.parse({
        action: "request-change",
        inputs: [
          { id: "quantity", value: { kind: "integer", value: "1" } },
        ],
      }),
      promptDigest: "d".repeat(64),
      providerCallId: "provider-call.session",
      responseModelId: "model.session.response",
    };
  }
}

class FixedAuthority implements AgentAuthority {
  commitCalls = 0;
  readonly #proposal: AgentProposalOutcome;

  constructor(proposal: AgentProposalOutcome) {
    this.#proposal = proposal;
  }

  async query() {
    return {
      alias: query.alias,
      resultDigest: "e".repeat(64),
      values: [{ integer: "10" }],
    };
  }

  async propose(command_: AgentProposalCommand) {
    assert.equal(command_.action.actionId, action.actionId);
    assert.equal(command_.plan.action, action.alias);
    return this.#proposal;
  }

  async commitOrRecover(): Promise<AgentCommitOutcome> {
    this.commitCalls += 1;
    return {
      kind: "committed",
      receipt: {
        actionId: action.actionId,
        commitSequence: "1",
        intentDigest: "c".repeat(64),
        operationId: command.operationId,
        policy,
        proposalId: command.proposalId,
        recordIds: ["record.session"],
      },
      recoveredByOperationId: true,
    };
  }
}

class RecordingJournal implements SessionJournal {
  readonly names: string[] = [];

  async run<T>(name: string, action_: () => Promise<T>): Promise<T> {
    this.names.push(name);
    return action_();
  }
}
