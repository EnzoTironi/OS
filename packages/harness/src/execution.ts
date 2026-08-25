import { createBashTool, type Sandbox } from "bash-tool";
import { isStepCount, ToolLoopAgent, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  createExecuteTypescriptTool,
  EXECUTION_EXTERNAL_IDS,
  indexExternals,
  type CodeModeDeniedReason,
  type CodeModeFailedReason,
  type ExecutionExternals,
  type HostToolBinding,
} from "./code-mode.js";
import { actionPlanSchema, type ActionPlan } from "./types.js";

export const EXECUTION_WORKSPACE = "/workspace";
export const WORLD_QUERY_HOST_TOOL_ID = "world_query";
export const ACTION_PREVIEW_HOST_TOOL_ID = "action_preview";

export const EXECUTION_INVOKED_TOOLS = [
  "bash",
  "execute_typescript",
  "readFile",
  "writeFile",
] as const;
export const executionInvokedToolSchema = z.enum(EXECUTION_INVOKED_TOOLS);
export type ExecutionInvokedTool = z.infer<typeof executionInvokedToolSchema>;

export const executionDeniedReasonSchema = z.enum([
  "commit_forbidden",
  "external_not_allowlisted",
  "host_escape",
  "tool_not_allowlisted",
]);
export type ExecutionDeniedReason = z.infer<typeof executionDeniedReasonSchema>;

export const executionFailedReasonSchema = z.enum([
  "code_mode_failed",
  "provider_call_failed",
  "timeout",
]);
export type ExecutionFailedReason = z.infer<typeof executionFailedReasonSchema>;

const worldQueryHostInputSchema = z
  .object({
    alias: z.string().min(1).max(200),
    entityId: z.string().min(1).max(200).optional(),
  })
  .strict();

export type WorldQueryHostInput = z.infer<typeof worldQueryHostInputSchema>;

export type ExecutionResult =
  | {
      readonly invokedTools: readonly ExecutionInvokedTool[];
      readonly kind: "ok";
      readonly text: string;
    }
  | {
      readonly kind: "denied";
      readonly reason: ExecutionDeniedReason;
    }
  | {
      readonly kind: "failed";
      readonly reason: ExecutionFailedReason;
    };

export interface CreateExecutionAgentOptions {
  readonly destination?: string;
  readonly externals?: ExecutionExternals;
  readonly files?: Readonly<Record<string, string>>;
  readonly maxSteps?: number;
  readonly model: LanguageModel;
}

export interface ExecutionWorkbench {
  readonly agent: ToolLoopAgent;
  readonly destination: string;
  readonly sandbox: Sandbox;
  run(prompt: string): Promise<ExecutionResult>;
}

/**
 * Parallel execution workbench. The planner stays one required Action tool
 * call. This agent loops over just-bash plus CodeMode host tools.
 */
export async function createExecutionAgent(
  options: CreateExecutionAgentOptions,
): Promise<ExecutionWorkbench> {
  const destination = options.destination ?? EXECUTION_WORKSPACE;
  const externals = options.externals ?? {};
  indexExternals(externals);
  const toolkit = await createBashTool({
    destination,
    files: options.files === undefined ? {} : { ...options.files },
  });
  const tools: ToolSet = {
    bash: toolkit.tools.bash,
    execute_typescript: createExecuteTypescriptTool({ externals }),
    readFile: toolkit.tools.readFile,
    writeFile: toolkit.tools.writeFile,
  };
  const agent = new ToolLoopAgent({
    id: "zoen-execution",
    instructions: executionInstructions(externals),
    model: options.model,
    stopWhen: isStepCount(options.maxSteps ?? 20),
    tools,
  });
  return {
    agent,
    destination,
    async run(prompt: string): Promise<ExecutionResult> {
      try {
        const result = await agent.generate({ prompt });
        const invoked = parseInvokedTools(
          result.toolCalls.map((call) => call.toolName),
        );
        switch (invoked.kind) {
          case "denied":
            return invoked;
          case "ok":
            return {
              invokedTools: invoked.tools,
              kind: "ok",
              text: result.text,
            };
          default: {
            const exhaustive: never = invoked;
            return exhaustive;
          }
        }
      } catch {
        return { kind: "failed", reason: "provider_call_failed" };
      }
    },
    sandbox: toolkit.sandbox,
  };
}

export function createWorldQueryHostTool(
  execute: (input: WorldQueryHostInput) => Promise<unknown>,
): HostToolBinding {
  return {
    description:
      "Query the governed semantic World. Results are evidence, not commit.",
    execute: async (input: unknown) =>
      execute(worldQueryHostInputSchema.parse(input)),
    inputSchema: worldQueryHostInputSchema,
  };
}

export function createActionPreviewHostTool(
  execute: (plan: ActionPlan) => Promise<unknown>,
): HostToolBinding {
  return {
    description:
      "Preview a governed Action proposal. Cedar commit stays on the host session.",
    execute: async (input: unknown) => execute(actionPlanSchema.parse(input)),
    inputSchema: actionPlanSchema,
  };
}

function parseInvokedTools(names: readonly string[]):
  | { readonly kind: "ok"; readonly tools: ExecutionInvokedTool[] }
  | { readonly kind: "denied"; readonly reason: "tool_not_allowlisted" } {
  const tools: ExecutionInvokedTool[] = [];
  for (const name of names) {
    const parsed = executionInvokedToolSchema.safeParse(name);
    if (!parsed.success) {
      return { kind: "denied", reason: "tool_not_allowlisted" };
    }
    tools.push(parsed.data);
  }
  return { kind: "ok", tools };
}

function executionInstructions(externals: ExecutionExternals): string {
  const listed = EXECUTION_EXTERNAL_IDS.filter(
    (id) => externals[id] !== undefined,
  ).map((id) => `external_${id}`);
  const allowlist =
    listed.length === 0
      ? "No host tools are allowlisted."
      : `Allowlisted host tools: ${listed.join(", ")}.`;
  return [
    "You are Zoen's execution workbench.",
    "You have no user chat channel and no speak_to_user tool.",
    `Use bash, readFile, and writeFile against the just-bash workspace at ${EXECUTION_WORKSPACE}.`,
    "Use execute_typescript to orchestrate allowlisted external_* host tools.",
    allowlist,
    "Only world_query and action_preview may be allowlisted. Commit is never available.",
    "Return a short factual summary for the interaction agent.",
  ].join(" ");
}

export type { CodeModeDeniedReason, CodeModeFailedReason, ExecutionExternals };
