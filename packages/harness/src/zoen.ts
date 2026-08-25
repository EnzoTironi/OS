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
  type TrustedContext as WireTrustedContext,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  DefinitionReferenceSchema,
  ExactValueSchema,
  type ExactValue as WireExactValue,
  QuantityValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  SemanticQueryResponseSchema,
  StrongConsistencySchema,
  WorldService,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import { DefinitionService } from "../../sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  CausalExplanationSchema,
  HistoryService,
} from "../../sdk/src/gen/zoen/history/v1/history_pb.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  agentCommitReceiptSchema,
  type AgentCapabilityDiscovery,
  type AgentAuthority,
  type AgentCommitCommand,
  type AgentCommitOutcome,
  type AgentProposalCommand,
  type AgentProposalOutcome,
  type PolicyEvidence,
  policyEvidenceSchema,
} from "./session.js";
import {
  type ActionCapability,
  type CausalContext,
  type CapabilityAlias,
  type DefinitionReferenceConfig,
  type ExactInput,
  type QueryCapability,
  type QueryContext,
  capabilityAliasForScope,
  semanticCapabilitySchema,
  semanticValueSchema,
  type SemanticCapability,
  type SemanticCapabilityScope,
  type SemanticValue,
  type TrustedAgentContext,
} from "./types.js";

const identifier = z.string().min(1).max(200);
const publishedValueTypeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool") }).passthrough(),
  z.object({ kind: z.literal("decimal") }).passthrough(),
  z
    .object({ kind: z.literal("entity"), typeId: identifier })
    .passthrough(),
  z.object({ kind: z.literal("integer") }).passthrough(),
  z
    .object({ kind: z.literal("quantity"), unit: identifier })
    .passthrough(),
  z.object({ kind: z.literal("text") }).passthrough(),
]);
const publishedDefinitionSchema = z
  .object({
    actions: z.array(
      z
        .object({
          id: identifier,
          inputs: z.array(
            z
              .object({
                id: identifier,
                valueType: publishedValueTypeSchema,
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
    computations: z.array(z.object({ id: identifier }).passthrough()),
    definitionId: identifier,
    relations: z.array(z.object({ id: identifier }).passthrough()),
    revision: z.number().int().positive().safe(),
    schema: z.literal("zoen.definition.v1"),
  })
  .passthrough();
type PublishedDefinition = z.infer<typeof publishedDefinitionSchema>;

export interface ZoenConnectionOptions {
  readonly baseUrl: string;
  readonly bearerToken: string;
}

export interface ConnectedZoenAgent {
  readonly authority: AgentAuthority;
  readonly trustedContext: TrustedAgentContext;
}

export async function connectZoenAgent(
  options: ZoenConnectionOptions,
  scopes: readonly SemanticCapabilityScope[],
): Promise<ConnectedZoenAgent> {
  const transport = connectTransport(options);
  const actionClient = createClient(ActionService, transport);
  const definitionClient = createClient(DefinitionService, transport);
  const historyClient = createClient(HistoryService, transport);
  const worldClient = createClient(WorldService, transport);
  const initial = await discoverCapabilities(
    actionClient,
    definitionClient,
    scopes,
  );
  return {
    authority: new ZoenConnectAuthority(
      actionClient,
      definitionClient,
      historyClient,
      worldClient,
      initial.trustedContext,
    ),
    trustedContext: initial.trustedContext,
  };
}

class ZoenConnectAuthority implements AgentAuthority {
  readonly #actionClient: Client<typeof ActionService>;
  readonly #definitionClient: Client<typeof DefinitionService>;
  readonly #historyClient: Client<typeof HistoryService>;
  readonly #trustedContext: TrustedAgentContext;
  readonly #worldClient: Client<typeof WorldService>;

  constructor(
    actionClient: Client<typeof ActionService>,
    definitionClient: Client<typeof DefinitionService>,
    historyClient: Client<typeof HistoryService>,
    worldClient: Client<typeof WorldService>,
    trustedContext: TrustedAgentContext,
  ) {
    this.#actionClient = actionClient;
    this.#definitionClient = definitionClient;
    this.#historyClient = historyClient;
    this.#trustedContext = trustedContext;
    this.#worldClient = worldClient;
  }

  async discover(
    scopes: readonly SemanticCapabilityScope[],
  ): Promise<AgentCapabilityDiscovery> {
    return discoverCapabilities(
      this.#actionClient,
      this.#definitionClient,
      scopes,
      this.#trustedContext,
    );
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
      tenantId: this.#trustedContext.tenantId,
      validAt: timestampFromDate(new Date(capability.validAt)),
    });
    const json = toJson(SemanticQueryResponseSchema, response);
    const encoded = JSON.stringify(json);
    return {
      actualCommitSequence: response.actualCommitSequence.toString(),
      alias: capability.alias,
      definition: capability.definition,
      entityId: capability.entityId,
      knowledgeCut: response.knowledgeCut.toString(),
      resultDigest: sha256(encoded),
      selection: capability.selection,
      validAt: capability.validAt,
      values: response.values.map((value) => semanticValue(value.value)),
    };
  }

  async explain(operationId: string): Promise<CausalContext> {
    const response = await this.#historyClient.explain({
      target: {
        target: {
          case: "operationId",
          value: operationId,
        },
      },
    });
    const explanation = response.explanation;
    if (explanation === undefined || explanation.subject.case !== "action") {
      throw new Error("HistoryService returned no Action explanation");
    }
    const action = explanation.subject.value;
    const actionId = action.proposal?.structure?.actionId;
    const commitSequence = action.commit?.receipt?.commitSequence;
    if (
      actionId === undefined ||
      actionId.length === 0 ||
      commitSequence === undefined ||
      commitSequence === 0n
    ) {
      throw new Error("Action explanation lacks committed Action identity");
    }
    return {
      actionId,
      commitSequence: commitSequence.toString(),
      complete: explanation.complete,
      explanationDigest: sha256(
        JSON.stringify(toJson(CausalExplanationSchema, explanation)),
      ),
      operationId,
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
      previewHash: proposal.previewHash,
      previewText: proposal.canonicalPreviewText,
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
    command: AgentCommitCommand,
  ): Promise<AgentCommitOutcome> {
    try {
      const status = await this.#actionClient.getOperationStatus({
        operationId: command.operationId,
      });
      if (
        status.status === CommitStatus.COMMITTED &&
        status.receipt !== undefined
      ) {
        if (!receiptMatchesExpectedCommit(status.receipt, command)) {
          return { kind: "rejected", reason: "operation_mismatch" };
        }
        return {
          kind: "committed",
          receipt: commitReceipt(status.receipt),
          recoveredByOperationId: true,
        };
      }
      return {
        kind: "rejected",
        reason: rejectedCommitReason(status.status),
      };
    } catch (error: unknown) {
      if (!(error instanceof ConnectError) || error.code !== Code.NotFound) {
        throw error;
      }
    }

    const response = await this.#actionClient.commit({
      operationId: command.operationId,
      previewHash: command.previewHash,
      proposalId: command.proposalId,
    });
    if (
      response.status === CommitStatus.COMMITTED &&
      response.receipt !== undefined
    ) {
      if (!receiptMatchesExpectedCommit(response.receipt, command)) {
        return { kind: "rejected", reason: "operation_mismatch" };
      }
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

type ActionCapabilityScope = Extract<
  SemanticCapabilityScope,
  { kind: "action" }
>;

interface ActionScopeGroup {
  readonly definition: DefinitionReferenceConfig;
  readonly resourceId: string;
}

async function discoverCapabilities(
  actionClient: Client<typeof ActionService>,
  definitionClient: Client<typeof DefinitionService>,
  scopes: readonly SemanticCapabilityScope[],
  expectedContext?: TrustedAgentContext,
): Promise<AgentCapabilityDiscovery> {
  const groups = groupActionScopes(scopes);
  const permittedByGroup = new Map<string, ReadonlySet<string>>();
  let trustedContext = expectedContext;
  for (const [key, group] of groups) {
    const response = await actionClient.discover({
      definition: definitionReference(group.definition),
      resourceId: group.resourceId,
    });
    const responseContext = parsedTrustedContext(response.trustedContext);
    if (
      trustedContext !== undefined &&
      !sameTrustedContext(trustedContext, responseContext)
    ) {
      throw new Error("Action discovery returned inconsistent trusted context");
    }
    trustedContext = responseContext;
    permittedByGroup.set(
      key,
      new Set(
        response.actions
          .filter((action) => action.decision === PolicyDecision.PERMIT)
          .map((action) => action.actionId),
      ),
    );
  }
  if (trustedContext === undefined) {
    throw new Error("at least one Action capability scope is required");
  }
  const definitions = await loadDefinitions(
    definitionClient,
    trustedContext.tenantId,
    scopes,
  );
  const capabilities: SemanticCapability[] = [];
  const missing: CapabilityAlias[] = [];
  for (const scope of scopes) {
    const definition = definitions.get(definitionKey(scope.definition));
    if (definition === undefined) {
      throw new Error(
        `published definition ${scope.definition.definitionId} was not loaded`,
      );
    }
    switch (scope.kind) {
      case "action": {
        const action = definition.actions.find(
          (candidate) => candidate.id === scope.actionId,
        );
        if (action === undefined) {
          throw new Error(
            `published definition has no Action ${scope.actionId}`,
          );
        }
        const permitted = permittedByGroup.get(actionGroupKey(scope));
        const alias = capabilityAliasForScope(scope);
        if (permitted?.has(scope.actionId) !== true) {
          missing.push(alias);
          break;
        }
        const capability = semanticCapabilitySchema.parse({
          actionId: scope.actionId,
          alias,
          definition: scope.definition,
          description: `Governed Action ${scope.actionId} on ${scope.resourceId}.`,
          inputs: action.inputs.map((input) =>
            actionInputSpec(input.id, input.valueType),
          ),
          kind: "action",
          resourceId: scope.resourceId,
          validAt: scope.validAt,
        });
        if (capability.kind !== "action") {
          throw new Error("Action scope produced a Query capability");
        }
        capabilities.push(capability);
        break;
      }
      case "query": {
        const selectionExists =
          scope.selection.kind === "computation"
            ? definition.computations.some(
                (candidate) => candidate.id === scope.selection.id,
              )
            : definition.relations.some(
                (candidate) => candidate.id === scope.selection.id,
              );
        if (!selectionExists) {
          throw new Error(
            `published definition has no ${scope.selection.kind} ${scope.selection.id}`,
          );
        }
        capabilities.push(
          semanticCapabilitySchema.parse({
            alias: capabilityAliasForScope(scope),
            definition: scope.definition,
            description: `Governed ${scope.selection.kind} query ${scope.selection.id} for ${scope.entityId}.`,
            entityId: scope.entityId,
            kind: "query",
            selection: scope.selection,
            validAt: scope.validAt,
          }),
        );
        break;
      }
      default: {
        const exhaustive: never = scope;
        return exhaustive;
      }
    }
  }
  return { capabilities, missing, trustedContext };
}

function groupActionScopes(
  scopes: readonly SemanticCapabilityScope[],
): ReadonlyMap<string, ActionScopeGroup> {
  const groups = new Map<string, ActionScopeGroup>();
  for (const scope of scopes) {
    if (scope.kind !== "action") {
      continue;
    }
    const key = actionGroupKey(scope);
    if (!groups.has(key)) {
      groups.set(key, {
        definition: scope.definition,
        resourceId: scope.resourceId,
      });
    }
  }
  return groups;
}

async function loadDefinitions(
  client: Client<typeof DefinitionService>,
  tenantId: string,
  scopes: readonly SemanticCapabilityScope[],
): Promise<ReadonlyMap<string, PublishedDefinition>> {
  const references = new Map<string, DefinitionReferenceConfig>();
  for (const scope of scopes) {
    references.set(definitionKey(scope.definition), scope.definition);
  }
  const definitions = new Map<string, PublishedDefinition>();
  for (const [key, reference] of references) {
    const response = await client.getRevision({
      definitionId: reference.definitionId,
      digest: reference.digest,
      tenantId,
    });
    const revision = response.definitionRevision;
    if (
      revision === undefined ||
      revision.definitionId !== reference.definitionId ||
      revision.digest !== reference.digest ||
      revision.revision !== BigInt(reference.revision)
    ) {
      throw new Error("DefinitionService returned the wrong revision");
    }
    const canonicalJson = new TextDecoder().decode(revision.canonicalJson);
    if (sha256(canonicalJson) !== reference.digest) {
      throw new Error("published definition digest does not match its bytes");
    }
    const rawDefinition: unknown = JSON.parse(canonicalJson);
    const definition = publishedDefinitionSchema.parse(rawDefinition);
    if (
      definition.definitionId !== reference.definitionId ||
      definition.revision !== reference.revision
    ) {
      throw new Error("published definition identity does not match its ref");
    }
    definitions.set(key, definition);
  }
  return definitions;
}

function actionInputSpec(
  id: string,
  valueType: z.infer<typeof publishedValueTypeSchema>,
): ActionCapability["inputs"][number] {
  switch (valueType.kind) {
    case "bool":
    case "decimal":
    case "integer":
    case "text":
      return { id, kind: valueType.kind };
    case "entity":
      return { id, kind: "entity", typeId: valueType.typeId };
    case "quantity":
      return { id, kind: "quantity", unit: valueType.unit };
    default: {
      const exhaustive: never = valueType;
      return exhaustive;
    }
  }
}

function parsedTrustedContext(
  context: WireTrustedContext | undefined,
): TrustedAgentContext {
  if (context === undefined) {
    throw new Error("Action discovery returned no trusted context");
  }
  return {
    actorId: context.actorId,
    delegationIds: context.delegation
      .map((grant) => grant.delegationId)
      .sort(),
    principalId: context.principalId,
    tenantId: context.tenantId,
    workloadId: context.workloadId,
  };
}

function sameTrustedContext(
  left: TrustedAgentContext,
  right: TrustedAgentContext,
): boolean {
  return (
    left.actorId === right.actorId &&
    left.principalId === right.principalId &&
    left.tenantId === right.tenantId &&
    left.workloadId === right.workloadId &&
    left.delegationIds.join("\n") === right.delegationIds.join("\n")
  );
}

function actionGroupKey(scope: ActionCapabilityScope): string {
  return JSON.stringify({
    definition: scope.definition,
    resourceId: scope.resourceId,
  });
}

function definitionKey(definition: DefinitionReferenceConfig): string {
  return JSON.stringify(definition);
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

function semanticValue(value: WireExactValue | undefined): SemanticValue {
  if (value === undefined) {
    throw new Error("semantic query returned no exact value");
  }
  switch (value.value.case) {
    case "boolValue":
      return semanticValueSchema.parse({
        kind: "bool",
        value: value.value.value,
      });
    case "decimalValue":
      return semanticValueSchema.parse({
        kind: "decimal",
        value: value.value.value,
      });
    case "integerValue":
      return semanticValueSchema.parse({
        kind: "integer",
        value: value.value.value,
      });
    case "quantityValue":
      return semanticValueSchema.parse({
        amount: value.value.value.amount,
        kind: "quantity",
        unit: value.value.value.unit,
      });
    case "textValue":
      return semanticValueSchema.parse({
        kind: "text",
        value: value.value.value,
      });
    case "entityRefValue":
      return semanticValueSchema.parse({
        kind: "entity",
        value: value.value.value,
      });
    case undefined:
      throw new Error("semantic query returned an unspecified exact value");
    default: {
      const exhaustive: never = value.value;
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

export function receiptMatchesExpectedCommit(
  receipt: Pick<
    CommitReceipt,
    "actionId" | "intentDigest" | "operationId" | "proposalId"
  >,
  command: AgentCommitCommand,
): boolean {
  return (
    receipt.actionId === command.actionId &&
    receipt.intentDigest === command.intentDigest &&
    receipt.operationId === command.operationId &&
    receipt.proposalId === command.proposalId
  );
}

function rejectedCommitReason(
  status: CommitStatus,
):
  | "conflict"
  | "denied"
  | "evaluation_error"
  | "identity_collision"
  | "operation_mismatch"
  | "preview_mismatch"
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
    case CommitStatus.PREVIEW_MISMATCH:
      return "preview_mismatch";
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
