import assert from "node:assert/strict";
import test from "node:test";
import { AgentRegistry, type Registration } from "./registry.js";
import {
  agentSessionCommandSchema,
  type AgentAuthority,
  type AgentCapabilityDiscovery,
  type AgentCommitCommand,
  type AgentCommitOutcome,
  type AgentProposalCommand,
  type AgentProposalOutcome,
  runAgentSession,
  type SessionJournal,
  signAgentSessionCommand,
} from "./session.js";
import {
  actionPlanSchema,
  capabilityAliasForScope,
  providerRouteSchema,
  semanticCapabilitySchema,
  semanticCapabilityScopeSchema,
  type ModelPlanner,
  type PlanningResult,
  type QueryContext,
} from "./types.js";

const definition = {
  definitionId: "definition.session",
  digest: "a".repeat(64),
  revision: 1,
};
const actionScope = semanticCapabilityScopeSchema.parse({
  actionId: "action.session",
  definition,
  kind: "action",
  resourceId: "resource.session",
  validAt: "2026-08-19T00:00:00.000Z",
});
if (actionScope.kind !== "action") {
  throw new Error("expected an Action capability scope");
}
const queryScope = semanticCapabilityScopeSchema.parse({
  definition,
  entityId: "resource.session",
  kind: "query",
  selection: { id: "relation.session", kind: "relation" },
  validAt: "2026-08-19T00:00:00.000Z",
});
if (queryScope.kind !== "query") {
  throw new Error("expected a Query capability scope");
}
const parsedAction = semanticCapabilitySchema.parse({
  actionId: actionScope.actionId,
  alias: capabilityAliasForScope(actionScope),
  definition,
  description: "Request a governed change.",
  inputs: [{ id: "quantity", kind: "integer" }],
  kind: "action",
  resourceId: actionScope.resourceId,
  validAt: actionScope.validAt,
});
if (parsedAction.kind !== "action") {
  throw new Error("expected Action capability");
}
const action = parsedAction;
const parsedQuery = semanticCapabilitySchema.parse({
  alias: capabilityAliasForScope(queryScope),
  definition,
  description: "Read the governed state.",
  entityId: queryScope.entityId,
  kind: "query",
  selection: queryScope.selection,
  validAt: queryScope.validAt,
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
    instruction: "Request one unit.",
    modelCapability: "reasoning-fast",
    taskId: "task.session",
  },
});

test("ready policy uses journaled discovery and ordinary commit", async () => {
  const authority = new FixedAuthority({
    kind: "ready",
    intentDigest: "c".repeat(64),
    policy,
    proposalId: command.proposalId,
  });
  const journal = new RecordingJournal();
  const result = await runAgentSession(runtime(authority).runtime, command, journal);
  assert.equal(result.kind, "committed");
  if (result.kind !== "committed") {
    assert.fail("session must commit");
  }
  assert.equal(result.receipt.actionId, action.actionId);
  assert.equal(result.provider.providerRouteId, route.id);
  assert.equal(result.recoveredByOperationId, true);
  assert.deepEqual(journal.names, [
    "discover scoped capabilities",
    "query scoped capabilities",
    "select scoped Action tool",
    "propose ordinary Action",
    "commit or recover ordinary Action",
  ]);
  assert.equal(authority.commitCalls, 1);
});

test("out-of-scope Action plans are terminal", async () => {
  const authority = new FixedAuthority({
    kind: "ready",
    intentDigest: "c".repeat(64),
    policy,
    proposalId: command.proposalId,
  });
  const planner = new InventedActionPlanner();
  const result = await runAgentSession(
    runtime(authority, planner).runtime,
    command,
    new RecordingJournal(),
  );
  assert.deepEqual(result, {
    kind: "invalid_plan",
    provider: {
      configuredModelId: route.modelId,
      modelCapability: route.capability,
      promptDigest: "d".repeat(64),
      providerKind: route.provider,
      providerRouteId: route.id,
    },
    reason: "action_not_visible",
    sessionId: command.sessionId,
    taskId: command.task.taskId,
  });
  assert.equal(planner.calls, 1);
  assert.equal(authority.commitCalls, 0);
});

test("unexpected provider failures become model errors", async () => {
  const authority = new FixedAuthority({
    kind: "ready",
    intentDigest: "c".repeat(64),
    policy,
    proposalId: command.proposalId,
  });
  const planner: ModelPlanner = {
    plan: () => Promise.reject(new Error("provider failed")),
  };
  const result = await runAgentSession(
    runtime(authority, planner).runtime,
    command,
    new RecordingJournal(),
  );
  assert.deepEqual(result, {
    kind: "model_error",
    reason: "provider_call_failed",
    sessionId: command.sessionId,
    taskId: command.task.taskId,
  });
  assert.equal(authority.commitCalls, 0);
});

test("approval and deny policy outcomes stop before commit", async () => {
  for (const proposal of [
    {
      kind: "awaiting_approval",
      intentDigest: "c".repeat(64),
      policy,
      proposalId: command.proposalId,
    },
    { kind: "denied", policy },
  ] satisfies readonly AgentProposalOutcome[]) {
    const authority = new FixedAuthority(proposal);
    const result = await runAgentSession(
      runtime(authority).runtime,
      command,
      new RecordingJournal(),
    );
    assert.equal(
      result.kind,
      proposal.kind === "denied" ? "denied" : "awaiting_approval",
    );
    assert.equal(authority.commitCalls, 0);
  }
});

test("journaled scope and provider survive registry unmount", async () => {
  const authority = new FixedAuthority({
    kind: "ready",
    intentDigest: "c".repeat(64),
    policy,
    proposalId: command.proposalId,
  });
  const configured = runtime(authority);
  const result = await runAgentSession(
    configured.runtime,
    command,
    new UnmountingJournal({
      capabilities: [configured.action, configured.query],
      provider: configured.provider,
    }),
  );
  assert.equal(result.kind, "committed");
  assert.equal(configured.runtime.registry.capabilityScopes().length, 0);
  assert.equal(
    configured.runtime.registry.resolveProvider(route.capability).kind,
    "unavailable",
  );
  assert.equal(authority.discoveryCalls, 1);
  assert.equal(authority.commitCalls, 1);
});

test("session commands reject model identity and caller capability fields", () => {
  const parsed = agentSessionCommandSchema.safeParse({
    ...command,
    capabilities: [action.alias],
    principalId: "principal.forged",
    tenantId: "tenant.forged",
  });
  assert.equal(parsed.success, false);
});

test("session signatures bind the complete command to one OIDC credential", () => {
  const signature = signAgentSessionCommand("oidc-token-a", command);
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.notEqual(
    signature,
    signAgentSessionCommand("oidc-token-b", command),
  );
  assert.notEqual(
    signature,
    signAgentSessionCommand("oidc-token-a", {
      ...command,
      task: { ...command.task, instruction: "Request two units." },
    }),
  );
});

function runtime(
  authority: AgentAuthority,
  planner: ModelPlanner = new FixedPlanner(),
) {
  const registry = new AgentRegistry();
  const actionRegistration = registry.registerCapabilityScope(actionScope);
  const queryRegistration = registry.registerCapabilityScope(queryScope);
  const providerRegistration = registry.registerProvider(
    route,
    planner,
  );
  return {
    action: actionRegistration,
    provider: providerRegistration,
    query: queryRegistration,
    runtime: { authority, registry },
  };
}

class FixedPlanner implements ModelPlanner {
  async plan(): Promise<PlanningResult> {
    return {
      kind: "planned",
      plan: actionPlanSchema.parse({
        action: action.alias,
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

class InventedActionPlanner implements ModelPlanner {
  calls = 0;

  async plan(): Promise<PlanningResult> {
    this.calls += 1;
    return {
      kind: "planned",
      plan: actionPlanSchema.parse({
        action: "action-invented",
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
  discoveryCalls = 0;
  readonly #proposal: AgentProposalOutcome;

  constructor(proposal: AgentProposalOutcome) {
    this.#proposal = proposal;
  }

  async discover(): Promise<AgentCapabilityDiscovery> {
    this.discoveryCalls += 1;
    return {
      capabilities: [action, query],
      missing: [],
      trustedContext: {
        actorId: "actor.session",
        delegationIds: ["delegation.session"],
        principalId: "principal.session",
        tenantId: "tenant.session",
        workloadId: "workload.session",
      },
    };
  }

  async query(): Promise<QueryContext> {
    return {
      alias: query.alias,
      resultDigest: "e".repeat(64),
      values: [{ kind: "integer", value: "10" }],
    };
  }

  async propose(command_: AgentProposalCommand) {
    assert.equal(command_.action.actionId, action.actionId);
    assert.equal(command_.plan.action, action.alias);
    return this.#proposal;
  }

  async commitOrRecover(
    command_: AgentCommitCommand,
  ): Promise<AgentCommitOutcome> {
    this.commitCalls += 1;
    assert.deepEqual(command_, {
      actionId: action.actionId,
      intentDigest: "c".repeat(64),
      operationId: command.operationId,
      proposalId: command.proposalId,
    });
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

class UnmountingJournal implements SessionJournal {
  readonly #capabilities: readonly Registration[];
  readonly #provider: Registration;

  constructor(options: {
    readonly capabilities: readonly Registration[];
    readonly provider: Registration;
  }) {
    this.#capabilities = options.capabilities;
    this.#provider = options.provider;
  }

  async run<T>(name: string, action_: () => Promise<T>): Promise<T> {
    const result = await action_();
    if (name === "discover scoped capabilities") {
      for (const registration of this.#capabilities) {
        registration.dispose();
      }
    }
    if (name === "select scoped Action tool") {
      this.#provider.dispose();
    }
    return result;
  }
}
