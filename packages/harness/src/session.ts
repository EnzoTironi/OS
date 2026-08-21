import * as restate from "@restatedev/restate-sdk";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AgentRegistry } from "./registry.js";
import {
  type ActionCapability,
  type ActionPlan,
  type CapabilityAlias,
  type PlanningRejectionReason,
  type PlanningRequest,
  type PlanningResult,
  type ProviderRoute,
  type QueryCapability,
  type QueryContext,
  type SemanticCapability,
  type SemanticCapabilityScope,
  type TrustedAgentContext,
  providerKindSchema,
  sessionIdSchema,
  taskIdSchema,
  taskScopeSchema,
  type CausalContext,
  type KnowledgeContext,
} from "./types.js";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);

export const agentSessionCommandSchema = z
  .object({
    context: z
      .object({
        explainOperationId: identifier,
        knowledgeQuery: z.string().min(1).max(16_000),
      })
      .strict()
      .optional(),
    expiresAt: z.iso.datetime(),
    operationId: identifier,
    proposalId: identifier,
    sessionId: sessionIdSchema,
    task: taskScopeSchema,
  })
  .strict();
export type AgentSessionCommand = z.infer<typeof agentSessionCommandSchema>;

export const policyEvidenceSchema = z
  .object({
    determiningPolicyIds: z.array(identifier),
    digest,
    policyId: identifier,
    revision: z.string().regex(/^[1-9][0-9]*$/),
  })
  .strict();
export type PolicyEvidence = z.infer<typeof policyEvidenceSchema>;

const providerAttemptSchema = z
  .object({
    configuredModelId: z.string().min(1),
    modelCapability: identifier,
    promptDigest: digest,
    providerKind: providerKindSchema,
    providerRouteId: identifier,
  })
  .strict();
const materialContextSchema = z
  .object({
    digest,
    history: z
      .object({
        explanationDigest: digest,
        operationId: identifier,
      })
      .strict()
      .optional(),
    knowledge: z
      .object({
        fragmentDigests: z.array(digest),
        sourceDigests: z.array(digest),
        traceId: digest,
      })
      .strict()
      .optional(),
    world: z.array(
      z
        .object({
          alias: identifier,
          definitionDigest: digest,
          resultDigest: digest,
        })
        .strict(),
    ),
  })
  .strict();
const providerCorrelationSchema = providerAttemptSchema.extend({
  context: materialContextSchema,
  providerCallId: z.string().min(1),
  responseModelId: z.string().min(1),
});

export const agentCommitReceiptSchema = z
  .object({
    actionId: identifier,
    commitSequence: z.string().regex(/^[1-9][0-9]*$/),
    intentDigest: digest,
    operationId: identifier,
    policy: policyEvidenceSchema,
    proposalId: identifier,
    recordIds: z.array(identifier),
  })
  .strict();
export type AgentCommitReceipt = z.infer<typeof agentCommitReceiptSchema>;

export const agentSessionResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("provider_unavailable"),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("capability_unavailable"),
      missing: z.array(identifier),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("context_error"),
      reason: z.literal("knowledge_or_history_unavailable"),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("model_error"),
      reason: z.literal("provider_call_failed"),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("invalid_plan"),
      provider: providerAttemptSchema,
      reason: z.enum([
        "action_not_visible",
        "invalid_arguments",
        "invalid_tool_selection",
      ]),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("denied"),
      policy: policyEvidenceSchema,
      provider: providerCorrelationSchema,
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("authority_rejected"),
      policy: policyEvidenceSchema.optional(),
      provider: providerCorrelationSchema,
      reason: z.literal("evaluation_error"),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      intentDigest: digest,
      kind: z.literal("awaiting_approval"),
      policy: policyEvidenceSchema,
      proposalId: identifier,
      provider: providerCorrelationSchema,
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("committed"),
      provider: providerCorrelationSchema,
      receipt: agentCommitReceiptSchema,
      recoveredByOperationId: z.boolean(),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("commit_rejected"),
      policy: policyEvidenceSchema.optional(),
      provider: providerCorrelationSchema,
      reason: z.enum([
        "conflict",
        "denied",
        "evaluation_error",
        "identity_collision",
        "operation_mismatch",
        "stale",
      ]),
      sessionId: sessionIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
]);
export type AgentSessionResult = z.infer<typeof agentSessionResultSchema>;

export interface AgentCapabilityDiscovery {
  readonly capabilities: readonly SemanticCapability[];
  readonly missing: readonly CapabilityAlias[];
  readonly trustedContext: TrustedAgentContext;
}

export interface AgentProposalCommand {
  readonly action: ActionCapability;
  readonly expiresAt: string;
  readonly operationId: string;
  readonly plan: ActionPlan;
  readonly proposalId: string;
}

export type AgentProposalOutcome =
  | {
      readonly kind: "ready";
      readonly intentDigest: string;
      readonly policy: PolicyEvidence;
      readonly proposalId: string;
    }
  | {
      readonly kind: "awaiting_approval";
      readonly intentDigest: string;
      readonly policy: PolicyEvidence;
      readonly proposalId: string;
    }
  | {
      readonly kind: "denied";
      readonly policy: PolicyEvidence;
    }
  | {
      readonly kind: "evaluation_error";
      readonly policy?: PolicyEvidence;
    };

export type AgentCommitOutcome =
  | {
      readonly kind: "committed";
      readonly receipt: AgentCommitReceipt;
      readonly recoveredByOperationId: boolean;
    }
  | {
      readonly kind: "rejected";
      readonly policy?: PolicyEvidence;
      readonly reason:
        | "conflict"
        | "denied"
        | "evaluation_error"
        | "identity_collision"
        | "operation_mismatch"
        | "stale";
    };

export interface AgentCommitCommand {
  readonly actionId: string;
  readonly intentDigest: string;
  readonly operationId: string;
  readonly proposalId: string;
}

export interface AgentAuthority {
  commitOrRecover(command: AgentCommitCommand): Promise<AgentCommitOutcome>;
  discover(
    scopes: readonly SemanticCapabilityScope[],
  ): Promise<AgentCapabilityDiscovery>;
  explain(operationId: string): Promise<CausalContext>;
  propose(command: AgentProposalCommand): Promise<AgentProposalOutcome>;
  query(capability: QueryCapability): Promise<QueryContext>;
}

export interface AgentContextAssembler {
  assemble(input: {
    readonly knowledgeQuery: string;
    readonly trustedContext: TrustedAgentContext;
  }): Promise<KnowledgeContext>;
}

export interface SessionJournal {
  run<T>(name: string, action: () => Promise<T>): Promise<T>;
}

export interface AgentSessionRuntime {
  readonly authority: AgentAuthority;
  readonly contextAssembler?: AgentContextAssembler;
  readonly registry: AgentRegistry;
}

type PlanningSelection =
  | {
      readonly kind: "planned";
      readonly planning: Extract<PlanningResult, { kind: "planned" }>;
      readonly route: ProviderRoute;
    }
  | {
      readonly kind: "invalid_plan";
      readonly promptDigest: string;
      readonly reason: PlanningRejectionReason;
      readonly route: ProviderRoute;
    }
  | {
      readonly kind: "provider_unavailable";
    };

export async function runAgentSession(
  runtime: AgentSessionRuntime,
  command: AgentSessionCommand,
  journal: SessionJournal,
): Promise<AgentSessionResult> {
  const discovery = await journal.run("discover scoped capabilities", () =>
    runtime.authority.discover(runtime.registry.capabilityScopes()),
  );
  const actions = discovery.capabilities.filter(
    (capability): capability is ActionCapability => capability.kind === "action",
  );
  if (actions.length === 0) {
    return {
      kind: "capability_unavailable",
      missing: [...discovery.missing],
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }
  const queries = discovery.capabilities.filter(
    (capability): capability is QueryCapability => capability.kind === "query",
  );
  const queryContexts = await journal.run("query scoped capabilities", () =>
    Promise.all(queries.map((query) => runtime.authority.query(query))),
  );
  let planningRequest: PlanningRequest = {
    actions,
    instruction: command.task.instruction,
    queries: queryContexts,
  };
  if (command.context !== undefined) {
    const contextAssembler = runtime.contextAssembler;
    const contextRequest = command.context;
    if (contextAssembler === undefined) {
      return {
        kind: "context_error",
        reason: "knowledge_or_history_unavailable",
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    }
    try {
      const [knowledge, history] = await journal.run(
        "assemble attributable company context",
        () =>
          Promise.all([
            contextAssembler.assemble({
              knowledgeQuery: contextRequest.knowledgeQuery,
              trustedContext: discovery.trustedContext,
            }),
            runtime.authority.explain(
              contextRequest.explainOperationId,
            ),
          ]),
      );
      planningRequest = {
        ...planningRequest,
        history,
        knowledge,
      };
    } catch {
      return {
        kind: "context_error",
        reason: "knowledge_or_history_unavailable",
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    }
  }

  let selection: PlanningSelection;
  try {
    selection = await journal.run(
      "select scoped Action tool",
      async (): Promise<PlanningSelection> => {
        const provider = runtime.registry.resolveProvider(
          command.task.modelCapability,
        );
        switch (provider.kind) {
          case "unavailable":
            return { kind: "provider_unavailable" };
          case "available":
            {
              const planning = await provider.planner.plan(planningRequest);
              switch (planning.kind) {
                case "planned":
                  return {
                    kind: "planned",
                    planning,
                    route: provider.route,
                  };
                case "rejected":
                  return {
                    kind: "invalid_plan",
                    promptDigest: planning.promptDigest,
                    reason: planning.reason,
                    route: provider.route,
                  };
                default: {
                  const exhaustive: never = planning;
                  return exhaustive;
                }
              }
            }
          default: {
            const exhaustive: never = provider;
            return exhaustive;
          }
        }
      },
    );
  } catch {
    return {
      kind: "model_error",
      reason: "provider_call_failed",
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }
  if (selection.kind === "provider_unavailable") {
    return {
      kind: "provider_unavailable",
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }
  if (selection.kind === "invalid_plan") {
    return {
      kind: "invalid_plan",
      provider: providerAttempt(selection.route, selection.promptDigest),
      reason: selection.reason,
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }
  const { planning, route } = selection;

  const action = actions.find(
    (candidate) => candidate.alias === planning.plan.action,
  );
  if (action === undefined) {
    return {
      kind: "invalid_plan",
      provider: providerAttempt(route, planning.promptDigest),
      reason: "action_not_visible",
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }
  const provider = {
    ...providerAttempt(route, planning.promptDigest),
    context: materialContext(planningRequest),
    providerCallId: planning.providerCallId,
    responseModelId: planning.responseModelId,
  };
  const proposal = await journal.run("propose ordinary Action", () =>
    runtime.authority.propose({
      action,
      expiresAt: command.expiresAt,
      operationId: command.operationId,
      plan: planning.plan,
      proposalId: command.proposalId,
    }),
  );
  switch (proposal.kind) {
    case "denied":
      return {
        kind: "denied",
        policy: proposal.policy,
        provider,
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    case "evaluation_error":
      return {
        kind: "authority_rejected",
        policy: proposal.policy,
        provider,
        reason: "evaluation_error",
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    case "awaiting_approval":
      return {
        intentDigest: proposal.intentDigest,
        kind: "awaiting_approval",
        policy: proposal.policy,
        proposalId: proposal.proposalId,
        provider,
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    case "ready":
      break;
    default: {
      const exhaustive: never = proposal;
      return exhaustive;
    }
  }

  const commit = await journal.run("commit or recover ordinary Action", () =>
    runtime.authority.commitOrRecover({
      actionId: action.actionId,
      intentDigest: proposal.intentDigest,
      operationId: command.operationId,
      proposalId: command.proposalId,
    }),
  );
  switch (commit.kind) {
    case "committed":
      return {
        kind: "committed",
        provider,
        receipt: commit.receipt,
        recoveredByOperationId: commit.recoveredByOperationId,
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    case "rejected":
      return {
        kind: "commit_rejected",
        policy: commit.policy,
        provider,
        reason: commit.reason,
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    default: {
      const exhaustive: never = commit;
      return exhaustive;
    }
  }
}

function providerAttempt(route: ProviderRoute, promptDigest: string) {
  return {
    configuredModelId: route.modelId,
    modelCapability: route.capability,
    promptDigest,
    providerKind: route.provider,
    providerRouteId: route.id,
  };
}

export const agentSessionSignatureHeader = "x-zoen-agent-signature";

export function signAgentSessionCommand(
  bindingKey: string,
  command: AgentSessionCommand,
): string {
  return createHmac("sha256", bindingKey)
    .update(serializedSessionCommand(command))
    .digest("hex");
}

export function agentSessionObjectKey(
  trustedTenantId: string,
  sessionId: string,
): string {
  return `${encodeURIComponent(trustedTenantId)}:${encodeURIComponent(sessionId)}`;
}

export interface AgentSessionServiceOptions {
  readonly serviceName?: string;
}

export function createAgentSessionService(
  runtime: AgentSessionRuntime,
  trustedContext: Pick<TrustedAgentContext, "tenantId">,
  bindingKey: string,
  options: AgentSessionServiceOptions = {},
) {
  if (bindingKey.length === 0) {
    throw new Error("agent session binding key is required");
  }
  return restate.object({
    name: options.serviceName ?? "ZoenAgentSession",
    handlers: {
      run: async (context: restate.ObjectContext, input: unknown) => {
        const parsed = agentSessionCommandSchema.safeParse(input);
        if (!parsed.success) {
          throw new restate.TerminalError("invalid agent session command");
        }
        const signature = context
          .request()
          .headers.get(agentSessionSignatureHeader);
        if (
          signature === undefined ||
          !validSessionSignature(bindingKey, parsed.data, signature)
        ) {
          throw new restate.TerminalError(
            "agent session principal binding is invalid",
          );
        }
        if (
          context.key !==
          agentSessionObjectKey(
            trustedContext.tenantId,
            parsed.data.sessionId,
          )
        ) {
          throw new restate.TerminalError(
            "session key does not match the command",
          );
        }
        const result = await runAgentSession(runtime, parsed.data, {
          run: (name, action) =>
            context.run(name, action, {
              initialRetryInterval: 2_000,
              maxRetryAttempts: 5,
              maxRetryInterval: 15_000,
            }),
        });
        return agentSessionResultSchema.parse(result);
      },
    },
  });
}

function validSessionSignature(
  bindingKey: string,
  command: AgentSessionCommand,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    return false;
  }
  const expected = Buffer.from(signAgentSessionCommand(bindingKey, command));
  const actual = Buffer.from(signature);
  return timingSafeEqual(expected, actual);
}

function serializedSessionCommand(command: AgentSessionCommand): string {
  return JSON.stringify({
    expiresAt: command.expiresAt,
    context: command.context,
    operationId: command.operationId,
    proposalId: command.proposalId,
    sessionId: command.sessionId,
    task: {
      instruction: command.task.instruction,
      modelCapability: command.task.modelCapability,
      taskId: command.task.taskId,
    },
  });
}

function materialContext(request: PlanningRequest) {
  const material = {
    history:
      request.history === undefined
        ? undefined
        : {
            explanationDigest: request.history.explanationDigest,
            operationId: request.history.operationId,
          },
    knowledge:
      request.knowledge === undefined
        ? undefined
        : {
            fragmentDigests: request.knowledge.results.map(
              (result) => result.fragmentDigest,
            ),
            sourceDigests: [
              ...new Set(
                request.knowledge.results.map((result) => result.sourceDigest),
              ),
            ].sort(),
            traceId: request.knowledge.traceId,
          },
    world: request.queries.map((query) => ({
      alias: query.alias,
      definitionDigest: query.definition.digest,
      resultDigest: query.resultDigest,
    })),
  };
  return materialContextSchema.parse({
    ...material,
    digest: createHash("sha256")
      .update(JSON.stringify(material))
      .digest("hex"),
  });
}
