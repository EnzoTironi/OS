import type { LanguageModel } from "ai";
import type { WorldQueryClient } from "../../speaker/src/world-query.js";
import { resolveLanguageModel } from "../../speaker/src/interaction-turn.js";
import {
  plantHostMediaOnWorkbench,
  type CompanionDocumentRef,
} from "./inbound-plant.js";
import { jsSandboxAllowed } from "./js-sandbox-gate.js";
import {
  createExecutionAgent,
  type CreateExecutionAgentOptions,
  type ExecutionResult,
  type ExecutionWorkbench,
} from "./execution.js";
import type { ExecutionCodeModeHost } from "./execution-host.js";
import { createKernelExecuteWork } from "./kernel-execute-work.js";
import { readZoendHostEnv } from "./zoend-host-env.js";

export type CreateInteractionExecuteWorkOptions = Omit<
  CreateExecutionAgentOptions,
  "model"
> & {
  readonly env?: NodeJS.ProcessEnv;
  readonly model?: LanguageModel;
};

/**
 * Bound `spawn_execution` hand-off. Interaction sees a short status string.
 * The workbench result stays the `ExecutionResult` kind union.
 */
export interface InteractionExecuteWork {
  readonly workbench?: ExecutionWorkbench;
  readonly world?: WorldQueryClient;
  executeWork(task: string): Promise<string>;
  run(task: string): Promise<ExecutionResult>;
}

/**
 * Bind a created workbench to WhatsApp serve/loop.
 * `plantInbound` copies companion mediaRef bytes onto isolate inbound/.
 * Kernel host has no isolate VFS, so plantInbound is omitted.
 */
export function bindWhatsAppExecutionPlant(
  work: InteractionExecuteWork | undefined,
): {
  readonly executeWork?: (task: string) => Promise<string>;
  readonly plantInbound?: (input: CompanionDocumentRef) => Promise<void>;
} {
  if (work === undefined) {
    return {};
  }
  const workbench = work.workbench;
  if (workbench === undefined) {
    return { executeWork: (task) => work.executeWork(task) };
  }
  return {
    executeWork: (task) => work.executeWork(task),
    plantInbound: async (input) => {
      await plantHostMediaOnWorkbench(workbench, input);
    },
  };
}

/**
 * Bind `spawn_execution` to the planted `zoen` CLI.
 *
 * Context: WhatsApp serve. Interaction must not import this module.
 * Live path: zoend-backed kernel host, no `ZOEN_ALLOW_JS_SANDBOX`.
 * Test/dev: just-bash workbench only when that flag is set (ADR-0017 / ADR-0024).
 * Inputs: optional kernel `host`, or env token + zoend URL. Optional model for sandbox.
 * Outputs: `executeWork` status string. `committed` only after host commit.
 * Side effects: kernel CLI Propose→Commit on zoend. Worker isolate still cannot speak.
 */
export async function createInteractionExecuteWork(
  options: CreateInteractionExecuteWorkOptions = {},
): Promise<InteractionExecuteWork | undefined> {
  const env = options.env ?? process.env;
  const kernelHost = await kernelHostFrom(options.host, env);
  if (kernelHost !== undefined) {
    const kernel = createKernelExecuteWork(kernelHost);
    return {
      world: kernel.world,
      executeWork: kernel.executeWork,
      run: async (task) => kernelRunResult(await kernel.executeWork(task)),
    };
  }
  if (!jsSandboxAllowed(env)) {
    return undefined;
  }
  const model = options.model ?? resolveLanguageModel(env);
  if (model === undefined) {
    return undefined;
  }
  const workbench = await createExecutionAgent({
    blobs: options.blobs,
    destination: options.destination,
    externals: options.externals,
    files: options.files,
    host: options.host,
    maxSteps: options.maxSteps,
    membershipId: options.membershipId,
    model,
    tenantId: options.tenantId,
  });
  return {
    workbench,
    executeWork: async (task) => executionStatus(await workbench.run(task)),
    run: (task) => workbench.run(task),
  };
}

async function kernelHostFrom(
  host: ExecutionCodeModeHost | undefined,
  env: NodeJS.ProcessEnv,
): Promise<ExecutionCodeModeHost | undefined> {
  if (host?.commit !== undefined && host.propose !== undefined) {
    return host;
  }
  if (host !== undefined) {
    return undefined;
  }
  const parsed = readZoendHostEnv(env);
  if (parsed === undefined) {
    return undefined;
  }
  const { createZoendCodeModeHost } = await import("./zoend-code-mode-host.js");
  return createZoendCodeModeHost(parsed);
}

function kernelRunResult(status: string): ExecutionResult {
  if (status.startsWith("status: denied")) {
    return { kind: "denied", reason: "commit_forbidden" };
  }
  if (status.startsWith("status: failed")) {
    return { kind: "failed", reason: "code_mode_failed" };
  }
  return { invokedTools: [], kind: "ok", text: status };
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
