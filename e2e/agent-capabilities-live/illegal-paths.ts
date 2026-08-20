import type { AgentSessionResult } from "../../packages/harness/src/index.js";
import {
  deniedResourceId,
  injectProviderResponseMutation,
  invokeAgentOnlyBusinessHandler,
  invokeSession,
  operationEvidence,
  proposalCount,
  providerProxyStatus,
  requestStockCapabilityAlias,
  restrictedActionCapabilityAlias,
  sessionCommand,
  tenantA,
  type AdminClient,
  type ProviderResponseMutation,
} from "./support.js";

export interface IllegalPathEvidence {
  readonly agentOnlyBusinessHandlerRejected: boolean;
  readonly attempts: {
    readonly inventedActionRef: MutatedSessionEvidence;
    readonly liveModelIdentityInjection: MutatedSessionEvidence;
    readonly outOfScopeActionRef: MutatedSessionEvidence;
    readonly providerSpecificActionRefDrift: MutatedSessionEvidence;
  };
  readonly failureInjections: readonly string[];
  readonly inventedActionRefIsTerminalWithoutRetry: boolean;
  readonly liveModelIdentityInjectionRejected: boolean;
  readonly outOfScopeActionRefRejectedBeforeAuthority: boolean;
  readonly providerSpecificActionRefDriftRejected: boolean;
  readonly sessions: {
    readonly inventedActionRef: AgentSessionResult;
    readonly liveModelIdentityInjection: AgentSessionResult;
    readonly outOfScopeActionRef: AgentSessionResult;
    readonly providerSpecificActionRefDrift: AgentSessionResult;
  };
}

interface IllegalPathOptions {
  readonly admin: AdminClient;
  readonly bindingKey: string;
  readonly definitionDigest: string;
  readonly providerAId: string;
  readonly providerBId: string;
}

interface MutatedSessionEvidence {
  readonly actionRefMutations: number;
  readonly identityMutations: number;
  readonly mutationPending: boolean;
  readonly operations: number;
  readonly proposals: number;
  readonly providerCalls: number;
  readonly providerCallsAfterMutation: number;
  readonly records: number;
  readonly result: AgentSessionResult;
}

export async function exerciseIllegalPaths(
  options: IllegalPathOptions,
): Promise<IllegalPathEvidence> {
  const agentOnlyOperationId = "operation.agent-live.agent-only-handler";
  const agentOnlyStatus = await invokeAgentOnlyBusinessHandler(
    options.bindingKey,
    agentOnlyOperationId,
  );
  const agentOnlyOperations = await operationEvidence(
    options.admin,
    tenantA,
    agentOnlyOperationId,
  );
  const agentOnlyProposals = await proposalCount(
    options.admin,
    tenantA,
    agentOnlyOperationId,
  );

  const inventedActionRef = await runMutatedSession(options, {
    modelCapability: "reasoning-fast",
    mutation: {
      actionRef: "action-invented-by-provider",
      kind: "action_ref",
    },
    suffix: "invented-action-ref",
  });
  const outOfScopeActionRef = await runMutatedSession(options, {
    modelCapability: "reasoning-fast",
    mutation: {
      actionRef: requestStockCapabilityAlias(
        options.definitionDigest,
        deniedResourceId,
      ),
      kind: "action_ref",
    },
    suffix: "out-of-scope-action-ref",
  });
  const providerSpecificActionRefDrift = await runMutatedSession(options, {
    modelCapability: "reasoning-high",
    mutation: {
      actionRef: restrictedActionCapabilityAlias(options.definitionDigest),
      kind: "action_ref",
    },
    suffix: "provider-specific-action-ref-drift",
  });
  const liveModelIdentityInjection = await runMutatedSession(options, {
    modelCapability: "reasoning-fast",
    mutation: {
      kind: "identity",
      principalId: "principal.forged",
      tenantId: "tenant.b",
    },
    suffix: "live-model-identity-injection",
  });

  return {
    agentOnlyBusinessHandlerRejected:
      agentOnlyStatus >= 400 &&
      agentOnlyOperations.operations === 0 &&
      agentOnlyOperations.records === 0 &&
      agentOnlyProposals === 0,
    attempts: {
      inventedActionRef,
      liveModelIdentityInjection,
      outOfScopeActionRef,
      providerSpecificActionRefDrift,
    },
    failureInjections: [
      "agent-only-business-handler-route",
      "live-provider-invented-action-ref",
      "live-provider-out-of-scope-action-ref",
      "provider-specific-action-ref-drift",
      "live-model-identity-injection",
    ],
    inventedActionRefIsTerminalWithoutRetry: terminalInvalidPlan(
      inventedActionRef,
      "action_not_visible",
      options.providerAId,
      "action_ref",
    ),
    liveModelIdentityInjectionRejected: terminalInvalidPlan(
      liveModelIdentityInjection,
      "invalid_arguments",
      options.providerAId,
      "identity",
    ),
    outOfScopeActionRefRejectedBeforeAuthority: terminalInvalidPlan(
      outOfScopeActionRef,
      "action_not_visible",
      options.providerAId,
      "action_ref",
    ),
    providerSpecificActionRefDriftRejected: terminalInvalidPlan(
      providerSpecificActionRefDrift,
      "action_not_visible",
      options.providerBId,
      "action_ref",
    ),
    sessions: {
      inventedActionRef: inventedActionRef.result,
      liveModelIdentityInjection: liveModelIdentityInjection.result,
      outOfScopeActionRef: outOfScopeActionRef.result,
      providerSpecificActionRefDrift: providerSpecificActionRefDrift.result,
    },
  };
}

async function runMutatedSession(
  options: IllegalPathOptions,
  scenario: {
    readonly modelCapability: string;
    readonly mutation: ProviderResponseMutation;
    readonly suffix: string;
  },
): Promise<MutatedSessionEvidence> {
  const before = await providerProxyStatus();
  await injectProviderResponseMutation(scenario.mutation);
  const command = sessionCommand({
    actionAlias: requestStockCapabilityAlias(options.definitionDigest),
    modelCapability: scenario.modelCapability,
    suffix: scenario.suffix,
  });
  const result = await invokeSession(command, options.bindingKey);
  const after = await providerProxyStatus();
  const operations = await operationEvidence(
    options.admin,
    tenantA,
    command.operationId,
  );
  return {
    actionRefMutations:
      after.actionRefMutations - before.actionRefMutations,
    identityMutations: after.identityMutations - before.identityMutations,
    mutationPending: after.mutationPending,
    operations: operations.operations,
    proposals: await proposalCount(options.admin, tenantA, command.operationId),
    providerCalls: after.providerCalls - before.providerCalls,
    providerCallsAfterMutation:
      after.providerCalls - after.providerCallsAtLastMutation,
    records: operations.records,
    result,
  };
}

function terminalInvalidPlan(
  evidence: MutatedSessionEvidence,
  reason: "action_not_visible" | "invalid_arguments",
  providerRouteId: string,
  mutationKind: ProviderResponseMutation["kind"],
): boolean {
  return (
    evidence.result.kind === "invalid_plan" &&
    evidence.result.reason === reason &&
    evidence.result.provider.providerRouteId === providerRouteId &&
    evidence.providerCalls >= 1 &&
    evidence.providerCallsAfterMutation === 0 &&
    mutationCount(evidence, mutationKind) === 1 &&
    !evidence.mutationPending &&
    evidence.proposals === 0 &&
    evidence.operations === 0 &&
    evidence.records === 0
  );
}

function mutationCount(
  evidence: MutatedSessionEvidence,
  mutationKind: ProviderResponseMutation["kind"],
): number {
  switch (mutationKind) {
    case "action_ref":
      return evidence.actionRefMutations;
    case "identity":
      return evidence.identityMutations;
    default: {
      const exhaustive: never = mutationKind;
      return exhaustive;
    }
  }
}
