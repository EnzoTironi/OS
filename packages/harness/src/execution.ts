import { createBashTool, type Sandbox } from "bash-tool";
import { isStepCount, ToolLoopAgent, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  createExecuteTypescriptTool,
  indexHostTools,
  type HostTool,
} from "./code-mode.js";
import { actionPlanSchema, type ActionPlan } from "./types.js";

export const EXECUTION_WORKSPACE = "/workspace";
export const WORLD_QUERY_HOST_TOOL_ID = "world_query";
export const ACTION_PREVIEW_HOST_TOOL_ID = "action_preview";

const worldQueryHostInputSchema = z
  .object({
    alias: z.string().min(1).max(200),
    entityId: z.string().min(1).max(200).optional(),
  })
  .strict();

export type WorldQueryHostInput = z.infer<typeof worldQueryHostInputSchema>;

export type ExecutionResult =
  | {
      readonly invokedTools: readonly string[];
      readonly kind: "completed";
      readonly text: string;
    }
  | {
      readonly invokedTools: readonly string[];
      readonly kind: "failed";
      readonly reason: string;
    };

export interface CreateExecutionAgentOptions {
  readonly destination?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly hostTools?: readonly HostTool[];
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
  const hostTools = options.hostTools ?? [];
  indexHostTools(hostTools);
  const toolkit = await createBashTool({
    destination,
    files: options.files === undefined ? {} : { ...options.files },
  });
  const tools: ToolSet = {
    bash: toolkit.tools.bash,
    execute_typescript: createExecuteTypescriptTool({ hostTools }),
    readFile: toolkit.tools.readFile,
    writeFile: toolkit.tools.writeFile,
  };
  const agent = new ToolLoopAgent({
    id: "zoen-execution",
    instructions: executionInstructions(hostTools),
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
        return {
          invokedTools: result.toolCalls.map((call) => call.toolName),
          kind: "completed",
          text: result.text,
        };
      } catch (error: unknown) {
        return {
          invokedTools: [],
          kind: "failed",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    sandbox: toolkit.sandbox,
  };
}

export function createWorldQueryHostTool(
  execute: (input: WorldQueryHostInput) => Promise<unknown>,
): HostTool {
  return {
    description:
      "Query the governed semantic World. Results are evidence, not commit.",
    execute: async (input: unknown) =>
      execute(worldQueryHostInputSchema.parse(input)),
    id: WORLD_QUERY_HOST_TOOL_ID,
    inputSchema: worldQueryHostInputSchema,
  };
}

export function createActionPreviewHostTool(
  execute: (plan: ActionPlan) => Promise<unknown>,
): HostTool {
  return {
    description:
      "Preview a governed Action proposal. Cedar commit stays on the host session.",
    execute: async (input: unknown) => execute(actionPlanSchema.parse(input)),
    id: ACTION_PREVIEW_HOST_TOOL_ID,
    inputSchema: actionPlanSchema,
  };
}

function executionInstructions(hostTools: readonly HostTool[]): string {
  const externals =
    hostTools.length === 0
      ? "No host tools are allowlisted."
      : `Allowlisted host tools: ${hostTools
          .map((hostTool) => `external_${hostTool.id}`)
          .join(", ")}.`;
  return [
    "You are Zoen's execution workbench.",
    "You have no user chat channel and no speak_to_user tool.",
    `Use bash, readFile, and writeFile against the just-bash workspace at ${EXECUTION_WORKSPACE}.`,
    "Use execute_typescript to orchestrate allowlisted external_* host tools.",
    externals,
    "World query and Action preview may be allowlisted. Commit is never available.",
    "Return a short factual summary for the interaction agent.",
  ].join(" ");
}
