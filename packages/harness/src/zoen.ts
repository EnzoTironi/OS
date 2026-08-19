import { create, toJson } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  ActionInputSchema,
  ActionService,
  CommitStatus,
  type CommitReceipt,
  PolicyDecision,
  type PolicyEvidence as WirePolicyEvidence,
  ProposalStatus,
} from "@zoen/sdk/action/v1";
import {
  DefinitionReferenceSchema,
  ExactValueSchema,
  QuantityValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  SemanticQueryResponseSchema,
  SemanticValueResultSchema,
  StrongConsistencySchema,
  WorldService,
} from "@zoen/sdk/world/v1";
import { createHash } from "node:crypto";
import {
  agentCommitReceiptSchema,
  type AgentAuthority,
  type AgentCommitOutcome,
  type AgentProposalCommand,
  type AgentProposalOutcome,
  type PolicyEvidence,
  policyEvidenceSchema,
} from "./session.js";
import {
  type ActionCapability,
  type DefinitionReferenceConfig,
  type ExactInput,
  type QueryCapability,
  type QueryContext,
} from "./types.js";

export interface ZoenConnectionOptions {
  readonly baseUrl: string;
  readonly bearerToken: string;
}

export interface TrustedAgentContext {
  readonly actorId: string;
  readonly delegationIds: readonly string[];
  readonly principalId: string;
  readonly tenantId: string;
  readonly workloadId: string;
}

export interface ConnectedZoenAgent {
  readonly actions: readonly ActionCapability[];
  readonly authority: AgentAuthority;
  readonly trustedContext: TrustedAgentContext;
}

export async function connectZoenAgent(
  options: ZoenConnectionOptions,
  candidates: readonly ActionCapability[],
): Promise<ConnectedZoenAgent> {
  const transport = connectTransport(options);
  const actionClient = createClient(ActionService, transport);
  const groups = groupCandidates(candidates);
  const visibleActionIds = new Set<string>();
  let trustedContext: TrustedAgentContext | undefined;
  for (const group of groups.values()) {
    const response = await actionClient.discover({
      definition: definitionReference(group.definition),
      resourceId: group.resourceId,
    });
    const context = response.trustedContext;
    if (context === undefined) {
      throw new Error("Action discovery returned no trusted context");
    }
    const parsedContext = {
      actorId: context.actorId,
      delegationIds: context.delegation.map((grant) => grant.delegationId),
      principalId: context.principalId,
      tenantId: context.tenantId,
      workloadId: context.workloadId,
    };
    if (
      trustedContext !== undefined &&
      JSON.stringify(trustedContext) !== JSON.stringify(parsedContext)
    ) {
      throw new Error("Action discovery returned inconsistent trusted context");
    }
    trustedContext = parsedContext;
    for (const action of response.actions) {
      if (action.decision === PolicyDecision.PERMIT) {
        visibleActionIds.add(action.actionId);
      }
    }
  }
  if (trustedContext === undefined) {
    throw new Error("at least one Action candidate is required");
  }
  return {
    actions: candidates.filter((action) =>
      visibleActionIds.has(action.actionId),
    ),
    authority: new ZoenConnectAuthority(
      actionClient,
      createClient(WorldService, transport),
      trustedContext.tenantId,
    ),
    trustedContext,
  };
}

class ZoenConnectAuthority implements AgentAuthority {
  readonly #actionClient: Client<typeof ActionService>;
  readonly #tenantId: string;
  readonly #worldClient: Client<typeof WorldService>;

  constructor(
    actionClient: Client<typeof ActionService>,
    worldClient: Client<typeof WorldService>,
    tenantId: string,
  ) {
    this.#actionClient = actionClient;
    this.#worldClient = worldClient;
    this.#tenantId = tenantId;
  }

  async query(capability: QueryCapability): Promise<QueryContext> {
    const response = await this.#worldClient.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: {
          case: "strong",
          value: create(StrongConsistencySchema),
        },
      }),
      definition: definitionReference(capability.definition),
      entityId: capability.entityId,
      selection: querySelection(capability),
      tenantId: this.#tenantId,
      validAt: timestampFromDate(new Date(capability.validAt)),
    });
    const json = toJson(SemanticQueryResponseSchema, response);
    const encoded = JSON.stringify(json);
    return {
      alias: capability.alias,
      resultDigest: sha256(encoded),
      values: response.values.map((value) =>
        toJson(SemanticValueResultSchema, value),
      ),
    };
  }

  async propose(
    command: AgentProposalCommand,
  ): Promise<AgentProposalOutcome> {
    const response = await this.#actionClient.propose({
      actionId: command.action.actionId,
      definition: definitionReference(command.action.definition),
      expiresAt: timestampFromDate(new Date(command.expiresAt)),
      inputs: command.plan.inputs.map((input) =>
        create(ActionInputSchema, {
          inputId: input.id,
          value: exactValue(input.value),
        }),
      ),
      operationId: command.operationId,
      proposalId: command.proposalId,
      resourceId: command.action.resourceId,
      validAt: timestampFromDate(new Date(command.action.validAt)),
    });
    switch (response.decision) {
      case PolicyDecision.DENY:
        return {
          kind: "denied",
          policy: requiredPolicyEvidence(response.policy),
        };
      case PolicyDecision.EVALUATION_ERROR:
        return {
          kind: "evaluation_error",
          policy: optionalPolicyEvidence(response.policy),
        };
      case PolicyDecision.PERMIT:
        break;
      case PolicyDecision.UNSPECIFIED:
        throw new Error("Action proposal returned an unspecified decision");
      default: {
        const exhaustive: never = response.decision;
        return exhaustive;
      }
    }
    const proposal = response.proposal;
    if (proposal === undefined) {
      throw new Error("permitted Action proposal returned no proposal");
    }
    const base = {
      intentDigest: proposal.intentDigest,
      policy: requiredPolicyEvidence(proposal.policy),
      proposalId: proposal.proposalId,
    };
    switch (proposal.status) {
      case ProposalStatus.READY:
        return { ...base, kind: "ready" };
      case ProposalStatus.AWAITING_APPROVAL:
        return { ...base, kind: "awaiting_approval" };
      case ProposalStatus.UNSPECIFIED:
        throw new Error("Action proposal returned an unspecified status");
      default: {
        const exhaustive: never = proposal.status;
        return exhaustive;
      }
    }
  }

  async commitOrRecover(
    operationId: string,
    proposalId: string,
  ): Promise<AgentCommitOutcome> {
    try {
      const status = await this.#actionClient.getOperationStatus({
        operationId,
      });
      if (
        status.status === CommitStatus.COMMITTED &&
        status.receipt !== undefined
      ) {
        return {
          kind: "committed",
          receipt: commitReceipt(status.receipt),
          recoveredByOperationId: true,
        };
      }
    } catch (error: unknown) {
      if (!(error instanceof ConnectError) || error.code !== Code.NotFound) {
        throw error;
      }
    }

    const response = await this.#actionClient.commit({
      operationId,
      proposalId,
    });
    if (
      response.status === CommitStatus.COMMITTED &&
      response.receipt !== undefined
    ) {
      return {
        kind: "committed",
        receipt: commitReceipt(response.receipt),
        recoveredByOperationId: false,
      };
    }
    return {
      kind: "rejected",
      policy: optionalPolicyEvidence(response.policy),
      reason: rejectedCommitReason(response.status),
    };
  }
}

interface CandidateGroup {
  readonly definition: DefinitionReferenceConfig;
  readonly resourceId: string;
}

function groupCandidates(
  candidates: readonly ActionCapability[],
): ReadonlyMap<string, CandidateGroup> {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    const key = [
      candidate.definition.definitionId,
      candidate.definition.revision,
      candidate.definition.digest,
      candidate.resourceId,
    ].join(":");
    groups.set(key, {
      definition: candidate.definition,
      resourceId: candidate.resourceId,
    });
  }
  return groups;
}

function connectTransport(options: ZoenConnectionOptions) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${options.bearerToken}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl: options.baseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

function definitionReference(definition: DefinitionReferenceConfig) {
  return create(DefinitionReferenceSchema, {
    definitionId: definition.definitionId,
    digest: definition.digest,
    revision: BigInt(definition.revision),
  });
}

function querySelection(capability: QueryCapability) {
  switch (capability.selection.kind) {
    case "computation":
      return create(QuerySelectionSchema, {
        value: {
          case: "computationId",
          value: capability.selection.id,
        },
      });
    case "relation":
      return create(QuerySelectionSchema, {
        value: {
          case: "relationId",
          value: capability.selection.id,
        },
      });
    default: {
      const exhaustive: never = capability.selection;
      return exhaustive;
    }
  }
}

function exactValue(input: ExactInput) {
  switch (input.kind) {
    case "bool":
      return create(ExactValueSchema, {
        value: { case: "boolValue", value: input.value },
      });
    case "decimal":
      return create(ExactValueSchema, {
        value: { case: "decimalValue", value: input.value },
      });
    case "entity":
      return create(ExactValueSchema, {
        value: { case: "entityRefValue", value: input.value },
      });
    case "integer":
      return create(ExactValueSchema, {
        value: { case: "integerValue", value: input.value },
      });
    case "quantity":
      return create(ExactValueSchema, {
        value: {
          case: "quantityValue",
          value: create(QuantityValueSchema, {
            amount: input.amount,
            unit: input.unit,
          }),
        },
      });
    case "text":
      return create(ExactValueSchema, {
        value: { case: "textValue", value: input.value },
      });
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

function optionalPolicyEvidence(
  policy: WirePolicyEvidence | undefined,
): PolicyEvidence | undefined {
  const revision = policy?.revision;
  if (policy === undefined || revision === undefined) {
    return undefined;
  }
  return policyEvidenceSchema.parse({
    determiningPolicyIds: policy.determiningPolicyIds,
    digest: revision.digest,
    policyId: revision.policyId,
    revision: revision.revision.toString(),
  });
}

function requiredPolicyEvidence(
  policy: WirePolicyEvidence | undefined,
): PolicyEvidence {
  const parsed = optionalPolicyEvidence(policy);
  if (parsed === undefined) {
    throw new Error("authority result returned no policy evidence");
  }
  return parsed;
}

function commitReceipt(receipt: CommitReceipt) {
  return agentCommitReceiptSchema.parse({
    actionId: receipt.actionId,
    commitSequence: receipt.commitSequence.toString(),
    intentDigest: receipt.intentDigest,
    operationId: receipt.operationId,
    policy: requiredPolicyEvidence(receipt.policy),
    proposalId: receipt.proposalId,
    recordIds: receipt.recordIds,
  });
}

function rejectedCommitReason(
  status: CommitStatus,
):
  | "conflict"
  | "denied"
  | "evaluation_error"
  | "identity_collision"
  | "operation_mismatch"
  | "stale" {
  switch (status) {
    case CommitStatus.STALE:
      return "stale";
    case CommitStatus.DENIED:
      return "denied";
    case CommitStatus.EVALUATION_ERROR:
      return "evaluation_error";
    case CommitStatus.CONFLICT:
      return "conflict";
    case CommitStatus.OPERATION_MISMATCH:
      return "operation_mismatch";
    case CommitStatus.IDENTITY_COLLISION:
      return "identity_collision";
    case CommitStatus.COMMITTED:
      throw new Error("committed Action returned no receipt");
    case CommitStatus.UNSPECIFIED:
      throw new Error("Action commit returned an unspecified status");
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
