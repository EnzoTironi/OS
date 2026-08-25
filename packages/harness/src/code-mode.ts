import { stripTypeScriptTypes } from "node:module";
import { createContext, Script } from "node:vm";
import { tool, type Tool } from "ai";
import { z } from "zod";

const hostToolIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const BLOCKED_HOST_ESCAPE =
  /\brequire\s*\(|\bprocess\b|\beval\s*\(|\bnew\s+Function\b|\bglobalThis\b|\b__dirname\b|\b__filename\b/;
const EXTERNAL_CALL = /\bexternal_([A-Za-z][A-Za-z0-9_]*)\b/g;
const FORBIDDEN_HOST_TOOL_IDS = new Set([
  "action_commit",
  "cedar_commit",
  "commit",
  "commitOrRecover",
  "commit_or_recover",
  "semantic_commit",
]);

const codeModeRpcRequestSchema = z
  .object({
    args: z.unknown(),
    id: z.number().int(),
    tool: z.string().min(1),
    type: z.literal("rpc"),
  })
  .strict();

const codeModeRpcResponseSchema = z
  .object({
    error: z
      .object({
        message: z.string(),
        name: z.string().optional(),
      })
      .strict()
      .optional(),
    id: z.number().int(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    type: z.literal("rpc-result"),
  })
  .strict();

const executeTypescriptInputSchema = z
  .object({
    source: z.string().min(1).max(100_000),
  })
  .strict();

export interface HostTool {
  readonly description: string;
  readonly id: string;
  readonly inputSchema: z.ZodType;
  execute(input: unknown): Promise<unknown>;
}

export type CodeModeResult =
  | {
      readonly kind: "completed";
      readonly value: unknown;
    }
  | {
      readonly kind: "failed";
      readonly reason: string;
    };

export interface RunExecuteTypescriptInput {
  readonly hostTools: readonly HostTool[];
  readonly source: string;
  readonly timeoutMs?: number;
}

/**
 * Runs model-authored TypeScript against allowlisted `external_*` host tools.
 * The program cannot `require`, touch `process`, or call Cedar commit.
 */
export async function runExecuteTypescript(
  input: RunExecuteTypescriptInput,
): Promise<CodeModeResult> {
  if (BLOCKED_HOST_ESCAPE.test(input.source)) {
    throw new Error(
      "execute_typescript cannot access require, process, eval, or globalThis",
    );
  }
  const tools = indexHostTools(input.hostTools);
  for (const toolId of referencedHostToolIds(input.source)) {
    if (!tools.has(toolId)) {
      throw new Error(`host tool ${toolId} is not allowlisted`);
    }
  }
  try {
    const value = await withTimeout(
      runInHostInterpreter({
        source: input.source,
        tools,
      }),
      input.timeoutMs ?? 10_000,
    );
    return { kind: "completed", value };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("is not allowlisted")) {
      throw error;
    }
    return {
      kind: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createExecuteTypescriptTool(input: {
  readonly hostTools: readonly HostTool[];
}): Tool {
  const hostTools = input.hostTools;
  return tool({
    description:
      "Run one TypeScript program that may call only allowlisted external_* host tools. Host tools run on the host after JSON-RPC validation. Commit is not available.",
    execute: async ({ source }) =>
      runExecuteTypescript({
        hostTools,
        source,
      }),
    inputSchema: executeTypescriptInputSchema,
  });
}

export function indexHostTools(
  tools: readonly HostTool[],
): ReadonlyMap<string, HostTool> {
  const byId = new Map<string, HostTool>();
  for (const hostTool of tools) {
    const id = hostToolIdSchema.parse(hostTool.id);
    if (FORBIDDEN_HOST_TOOL_IDS.has(id)) {
      throw new Error(
        `host tool ${id} cannot redefine semantic commit`,
      );
    }
    if (byId.has(id)) {
      throw new Error(`host tool ${id} is already registered`);
    }
    byId.set(id, hostTool);
  }
  return byId;
}

export function handleHostRpc(
  raw: string,
  tools: ReadonlyMap<string, HostTool>,
): Promise<string> {
  return dispatchHostRpc(raw, tools);
}

function referencedHostToolIds(source: string): readonly string[] {
  const ids = new Set<string>();
  for (const match of source.matchAll(EXTERNAL_CALL)) {
    const id = match[1];
    if (id !== undefined) {
      ids.add(id);
    }
  }
  return [...ids];
}

async function runInHostInterpreter(input: {
  readonly source: string;
  readonly tools: ReadonlyMap<string, HostTool>;
}): Promise<unknown> {
  const send = (raw: string) => dispatchHostRpc(raw, input.tools);
  const bindings = createExternalBindings([...input.tools.keys()], send);
  const context = createContext(
    {
      Array,
      Boolean,
      Date,
      Error,
      JSON,
      Map,
      Math,
      Number,
      Object,
      Promise,
      RangeError,
      Set,
      String,
      TypeError,
      ...bindings,
    },
    {
      codeGeneration: { strings: false, wasm: false },
      name: "zoen-code-mode",
    },
  );
  const wrapped = `(async () => {\n${input.source}\n})()`;
  const javascript = stripTypeScriptTypes(wrapped, { mode: "strip" });
  const script = new Script(javascript, {
    filename: "execute_typescript.js",
  });
  const completion: unknown = script.runInContext(context);
  return await Promise.resolve(completion);
}

function createExternalBindings(
  toolIds: readonly string[],
  send: (raw: string) => Promise<string>,
): Record<string, (args: unknown) => Promise<unknown>> {
  const bindings: Record<string, (args: unknown) => Promise<unknown>> = {};
  let nextId = 1;
  for (const toolId of toolIds) {
    bindings[`external_${toolId}`] = async (args: unknown) => {
      const requestId = nextId;
      nextId += 1;
      const response = codeModeRpcResponseSchema.parse(
        JSON.parse(
          await send(
            JSON.stringify({
              args,
              id: requestId,
              tool: toolId,
              type: "rpc",
            }),
          ),
        ),
      );
      if (!response.ok) {
        throw new Error(
          response.error?.message ?? `host tool ${toolId} failed`,
        );
      }
      return response.result;
    };
  }
  return bindings;
}

async function dispatchHostRpc(
  raw: string,
  tools: ReadonlyMap<string, HostTool>,
): Promise<string> {
  const request = codeModeRpcRequestSchema.parse(JSON.parse(raw));
  const hostTool = tools.get(request.tool);
  if (hostTool === undefined) {
    return JSON.stringify({
      error: {
        message: `host tool ${request.tool} is not allowlisted`,
        name: "HostToolNotAllowlisted",
      },
      id: request.id,
      ok: false,
      type: "rpc-result",
    });
  }
  try {
    const parsed = hostTool.inputSchema.parse(request.args);
    const result = await hostTool.execute(parsed);
    return JSON.stringify({
      id: request.id,
      ok: true,
      result,
      type: "rpc-result",
    });
  } catch (error: unknown) {
    return JSON.stringify({
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "Error",
      },
      id: request.id,
      ok: false,
      type: "rpc-result",
    });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("execute_typescript timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
