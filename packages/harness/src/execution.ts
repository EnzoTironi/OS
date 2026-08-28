import { createBashTool, type Sandbox } from "bash-tool";
import { Bash } from "just-bash";
import { isStepCount, ToolLoopAgent, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  type CodeModeDeniedReason,
  type CodeModeFailedReason,
  type ExecutionExternals,
  type HostToolBinding,
} from "./code-mode.js";
import {
  anydocCliBashInstructions,
  createAnydocCliCommand,
} from "./anydoc-cli.js";
import {
  createZoenCliCommand,
  plantExecutionIsolateFiles,
  zoenCliBashInstructions,
} from "./execution-cli.js";
import {
  createExecutionIsolateGate,
  createWorkerCodeModeHost,
  isolatePathSegmentSchema,
  type ExecutionCodeModeHost,
  type ExecutionIsolateGate,
  type WorkerCodeModeHost,
} from "./execution-host.js";
import { actionPlanSchema, type ActionPlan } from "./types.js";
import { assertJsSandboxAllowed } from "./js-sandbox-gate.js";
import { inspectBashInvocation } from "./vfs-guard.js";

export const EXECUTION_WORKSPACE = "/workspace";
export const WORLD_QUERY_HOST_TOOL_ID = "world_query";
export const ACTION_PREVIEW_HOST_TOOL_ID = "action_preview";

export const EXECUTION_INVOKED_TOOLS = ["bash"] as const;
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
  readonly blobs?: Readonly<Record<string, Uint8Array>>;
  readonly destination?: string;
  readonly externals?: ExecutionExternals;
  readonly files?: Readonly<Record<string, string>>;
  readonly host?: ExecutionCodeModeHost;
  readonly maxSteps?: number;
  readonly membershipId?: string;
  readonly model: LanguageModel;
  readonly tenantId?: string;
}

export interface ExecutionWorkbench {
  readonly agent: ToolLoopAgent;
  readonly destination: string;
  readonly gate: ExecutionIsolateGate;
  readonly host: WorkerCodeModeHost;
  readonly sandbox: Sandbox;
  run(prompt: string): Promise<ExecutionResult>;
}

/**
 * Isolate destination for one membership/tenant. Override with `destination`.
 */
export function executionIsolateDestination(options: {
  readonly destination?: string;
  readonly membershipId?: string;
  readonly tenantId?: string;
}): string {
  if (options.destination !== undefined) {
    return options.destination;
  }
  const tenant =
    options.tenantId === undefined
      ? undefined
      : isolatePathSegmentSchema.parse(options.tenantId);
  const membership =
    options.membershipId === undefined
      ? undefined
      : isolatePathSegmentSchema.parse(options.membershipId);
  if (tenant !== undefined && membership !== undefined) {
    return `${EXECUTION_WORKSPACE}/${tenant}/${membership}`;
  }
  if (tenant !== undefined) {
    return `${EXECUTION_WORKSPACE}/${tenant}`;
  }
  return EXECUTION_WORKSPACE;
}

/**
 * Parallel execution workbench. The planner stays one required Action tool
 * call. The model-visible ToolSet is only `bash` against a just-bash VFS.
 * World query and propose go through the planted `zoen` CLI onto the same
 * host functions as `wit/zoen-code-mode`. Office/PDF/CSV convert through
 * the planted `anydoc` CLI. Commit is denied.
 */
export async function createExecutionAgent(
  options: CreateExecutionAgentOptions,
): Promise<ExecutionWorkbench> {
  assertJsSandboxAllowed();
  const destination = executionIsolateDestination(options);
  const files = plantExecutionIsolateFiles(
    options.files === undefined ? {} : { ...options.files },
  );
  const gate = createExecutionIsolateGate();
  const host = createWorkerCodeModeHost(options.host, gate);
  const bash = new Bash({
    cwd: destination,
    customCommands: [createAnydocCliCommand(), createZoenCliCommand(host)],
  });
  const toolkit = await createBashTool({
    destination,
    extraInstructions: `${zoenCliBashInstructions()} ${anydocCliBashInstructions()}`,
    files,
    sandbox: bash,
  });
  await plantIsolateBlobs(bash.fs, destination, options.blobs);
  const bashTool = toolkit.tools.bash;
  const tools: ToolSet = {
    bash: {
      ...bashTool,
      execute: async (input, extra) => {
        const command =
          input !== null &&
          typeof input === "object" &&
          "command" in input &&
          typeof input.command === "string"
            ? input.command
            : "";
        const verdict = inspectBashInvocation(command, destination);
        if (verdict.kind === "deny") {
          return {
            exitCode: 1,
            stderr: verdict.reason,
            stdout: "",
          };
        }
        if (bashTool.execute === undefined) {
          return {
            exitCode: 1,
            stderr: "bash tool execute missing",
            stdout: "",
          };
        }
        return bashTool.execute(input, extra);
      },
    },
  };
  const agent = new ToolLoopAgent({
    id: "zoen-execution",
    instructions: executionInstructions(destination),
    model: options.model,
    stopWhen: isStepCount(options.maxSteps ?? 20),
    tools,
  });
  return {
    agent,
    destination,
    gate,
    host,
    async run(prompt: string): Promise<ExecutionResult> {
      try {
        const result = await agent.generate({ prompt });
        if (gate.commitDenied) {
          return { kind: "denied", reason: "commit_forbidden" };
        }
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
        if (gate.commitDenied) {
          return { kind: "denied", reason: "commit_forbidden" };
        }
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

export {
  createKernelCodeModeHost,
  createWorkerCodeModeHost,
  type CodeModeCommitOutcome,
  type CodeModeQueryRequest,
  type CodeModeQueryResult,
  type ExecutionCodeModeHost,
  type WorkerCodeModeHost,
} from "./execution-host.js";
export {
  runZoenCli,
  ZOEN_CLI_RELATIVE_PATH,
  type ZoenCliProcessResult,
} from "./execution-cli.js";

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

function executionInstructions(destination: string): string {
  return [
    "You are Zoen's execution workbench.",
    "You have no user chat channel and no speak_to_user tool.",
    "The only model-visible tool is bash.",
    `Use bash to list, read, and write files in the just-bash workspace at ${destination}.`,
    "Use the planted zoen CLI for world query and action propose: zoen query, zoen propose.",
    "Use the planted anydoc CLI to convert inbound Word/Excel/PowerPoint/ODT/CSV/PDF to markdown.",
    "Scanned PDF pages fail as NeedsOcr with named pages. Hosted OCR is out of Zoen.",
    "zoen commit is forbidden on this isolate. The kernel CLI host commits on zoend.",
    "Return a short factual summary for the interaction agent.",
  ].join(" ");
}

async function plantIsolateBlobs(
  fs: {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
  },
  destination: string,
  blobs: Readonly<Record<string, Uint8Array>> | undefined,
): Promise<void> {
  if (blobs === undefined) {
    return;
  }
  for (const [relative, bytes] of Object.entries(blobs)) {
    const absolute = `${destination}/${relative}`;
    const slash = absolute.lastIndexOf("/");
    if (slash > 0) {
      await fs.mkdir(absolute.slice(0, slash), { recursive: true });
    }
    await fs.writeFile(absolute, bytes);
  }
}

export type { CodeModeDeniedReason, CodeModeFailedReason, ExecutionExternals };
