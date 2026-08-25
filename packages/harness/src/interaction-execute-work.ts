import type { LanguageModel } from "ai";
import { resolveLanguageModel } from "../../speaker/src/interaction-turn.js";
import {
  createExecutionAgent,
  type CreateExecutionAgentOptions,
  type ExecutionResult,
  type ExecutionWorkbench,
} from "./execution.js";

export type CreateInteractionExecuteWorkOptions = Omit<
  CreateExecutionAgentOptions,
  "model"
> & {
  readonly model?: LanguageModel;
};

/**
 * Bound `spawn_execution` hand-off. Interaction sees a short status string.
 * The workbench result stays the `ExecutionResult` kind union.
 */
export interface InteractionExecuteWork {
  readonly workbench: ExecutionWorkbench;
  executeWork(task: string): Promise<string>;
  run(task: string): Promise<ExecutionResult>;
}

/**
 * Bind `spawn_execution` to `createExecutionAgent`.
 *
 * Context: WhatsApp (and other channels) compose this in the serve entry.
 * Interaction must not import this module — that would cycle with harness.
 * Inputs: optional `LanguageModel`. Missing `ZOEN_MODEL` returns undefined.
 * Outputs: `run` returns `ok | denied | failed`. `executeWork` is the status string.
 * Side effects: creates one just-bash workbench. No `speak_to_user`. No commit.
 */
export async function createInteractionExecuteWork(
  options: CreateInteractionExecuteWorkOptions = {},
): Promise<InteractionExecuteWork | undefined> {
  const model = options.model ?? resolveLanguageModel();
  if (model === undefined) {
    return undefined;
  }
  const workbench = await createExecutionAgent({
    destination: options.destination,
    externals: options.externals,
    files: options.files,
    maxSteps: options.maxSteps,
    model,
  });
  return {
    workbench,
    executeWork: async (task) => executionStatus(await workbench.run(task)),
    run: (task) => workbench.run(task),
  };
}

/**
 * Short status for the interaction agent. Never a boolean flag.
 */
export function executionStatus(result: ExecutionResult): string {
  switch (result.kind) {
    case "ok": {
      const text = result.text.trim().slice(0, 240);
      return text.length > 0 ? text : "status: ok";
    }
    case "denied":
      return `status: denied (${result.reason})`;
    case "failed":
      return `status: failed (${result.reason})`;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
