import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import { AgentRegistry } from "./registry.js";
import {
  type ActionCapability,
  type ActionPlan,
  type PlanningResult,
  type QueryCapability,
  type QueryContext,
  providerKindSchema,
  sessionIdSchema,
  taskIdSchema,
  taskScopeSchema,
} from "./types.js";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);

export const agentSessionCommandSchema = z
  .object({
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

const providerCorrelationSchema = z
  .object({
    configuredModelId: z.string().min(1),
    modelCapability: identifier,
    promptDigest: digest,
    providerCallId: z.string().min(1),
    providerKind: providerKindSchema,
    providerRouteId: identifier,
    responseModelId: z.string().min(1),
  })
  .strict();

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
      kind: z.literal("model_error"),
      reason: z.literal("provider_call_failed"),
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

export interface AgentAuthority {
  commitOrRecover(
    operationId: string,
    proposalId: string,
  ): Promise<AgentCommitOutcome>;
  propose(command: AgentProposalCommand): Promise<AgentProposalOutcome>;
  query(capability: QueryCapability): Promise<QueryContext>;
}

export interface SessionJournal {
  run<T>(name: string, action: () => Promise<T>): Promise<T>;
}

export interface AgentSessionRuntime {
  readonly authority: AgentAuthority;
  readonly registry: AgentRegistry;
}

export async function runAgentSession(
  runtime: AgentSessionRuntime,
  command: AgentSessionCommand,
  journal: SessionJournal,
): Promise<AgentSessionResult> {
  const resolution = runtime.registry.resolve(command.task);
  switch (resolution.kind) {
    case "provider_unavailable":
      return {
        kind: "provider_unavailable",
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    case "capability_unavailable":
      return {
        kind: "capability_unavailable",
        missing: resolution.missing,
        sessionId: command.sessionId,
        taskId: command.task.taskId,
      };
    case "available":
      break;
    default: {
      const exhaustive: never = resolution;
      return exhaustive;
    }
  }

  const actions = resolution.capabilities.filter(
    (capability): capability is ActionCapability => capability.kind === "action",
  );
  const queries = resolution.capabilities.filter(
    (capability): capability is QueryCapability => capability.kind === "query",
  );
  const queryContexts = await journal.run("query scoped capabilities", () =>
    Promise.all(queries.map((query) => runtime.authority.query(query))),
  );

  let planning: PlanningResult;
  try {
    planning = await journal.run("select scoped Action tool", () =>
      resolution.planner.plan({
        actions,
        instruction: command.task.instruction,
        queries: queryContexts,
      }),
    );
  } catch {
    return {
      kind: "model_error",
      reason: "provider_call_failed",
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }

  const action = actions.find(
    (candidate) => candidate.alias === planning.plan.action,
  );
  if (action === undefined) {
    return {
      kind: "model_error",
      reason: "provider_call_failed",
      sessionId: command.sessionId,
      taskId: command.task.taskId,
    };
  }
  const provider = {
    configuredModelId: resolution.route.modelId,
    modelCapability: resolution.route.capability,
    promptDigest: planning.promptDigest,
    providerCallId: planning.providerCallId,
    providerKind: resolution.route.provider,
    providerRouteId: resolution.route.id,
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
    runtime.authority.commitOrRecover(
      command.operationId,
      command.proposalId,
    ),
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

export function createAgentSessionService(runtime: AgentSessionRuntime) {
  return restate.object({
    name: "ZoenAgentSession",
    handlers: {
      run: async (context: restate.ObjectContext, input: unknown) => {
        const parsed = agentSessionCommandSchema.safeParse(input);
        if (!parsed.success) {
          throw new restate.TerminalError("invalid agent session command");
        }
        if (context.key !== parsed.data.sessionId) {
          throw new restate.TerminalError(
            "session key does not match the command",
          );
        }
        const result = await runAgentSession(runtime, parsed.data, {
          run: (name, action) =>
            context.run(name, action, {
              initialRetryInterval: 100,
              maxRetryAttempts: 3,
              maxRetryInterval: 1_000,
            }),
        });
        return agentSessionResultSchema.parse(result);
      },
    },
  });
}
