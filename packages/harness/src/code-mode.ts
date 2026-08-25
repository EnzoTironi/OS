import { stripTypeScriptTypes } from "node:module";
import { createContext, Script } from "node:vm";
import { tool, type Tool } from "ai";
import { z } from "zod";
import { jsSandboxAllowed } from "./js-sandbox-gate.js";

export const EXECUTION_EXTERNAL_IDS = ["action_preview", "world_query"] as const;
export const executionExternalIdSchema = z.enum(EXECUTION_EXTERNAL_IDS);
export type ExecutionExternalId = z.infer<typeof executionExternalIdSchema>;

const forbiddenCommitExternalIdSchema = z.enum([
  "action_commit",
  "cedar_commit",
  "commit",
  "commitOrRecover",
  "commit_or_recover",
  "semantic_commit",
]);

export const codeModeDeniedReasonSchema = z.enum([
  "commit_forbidden",
  "external_not_allowlisted",
  "host_escape",
]);
export type CodeModeDeniedReason = z.infer<typeof codeModeDeniedReasonSchema>;

export const codeModeFailedReasonSchema = z.enum([
  "code_mode_failed",
  "timeout",
]);
export type CodeModeFailedReason = z.infer<typeof codeModeFailedReasonSchema>;

export type CodeModeResult =
  | {
      readonly kind: "ok";
      readonly value: unknown;
    }
  | {
      readonly kind: "denied";
      readonly reason: CodeModeDeniedReason;
    }
  | {
      readonly kind: "failed";
      readonly reason: CodeModeFailedReason;
    };

export const codeModeResultSchema: z.ZodType<CodeModeResult> = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("ok"), value: z.unknown() }).strict(),
    z
      .object({
        kind: z.literal("denied"),
        reason: codeModeDeniedReasonSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("failed"),
        reason: codeModeFailedReasonSchema,
      })
      .strict(),
  ],
);

export interface HostToolBinding {
  readonly description: string;
  readonly inputSchema: z.ZodType;
  execute(input: unknown): Promise<unknown>;
}

export type ExecutionExternals = {
  readonly [K in ExecutionExternalId]?: HostToolBinding;
};

const BLOCKED_HOST_ESCAPE =
  /\brequire\s*\(|\bprocess\b|\beval\s*\(|\bnew\s+Function\b|\bglobalThis\b|\b__dirname\b|\b__filename\b/;
const EXTERNAL_CALL = /\bexternal_([A-Za-z][A-Za-z0-9_]*)\b/g;

const codeModeRpcRequestSchema = z
  .object({
    args: z.unknown(),
    id: z.number().int(),
    tool: executionExternalIdSchema,
    type: z.literal("rpc"),
  })
  .strict();

const codeModeRpcResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      id: z.number().int(),
      ok: z.literal(true),
      result: z.unknown(),
      type: z.literal("rpc-result"),
    })
    .strict(),
  z
    .object({
      error: z
        .object({
          message: z.string(),
          name: z.string(),
        })
        .strict(),
      id: z.number().int(),
      ok: z.literal(false),
      type: z.literal("rpc-result"),
    })
    .strict(),
]);

const executeTypescriptInputSchema = z
  .object({
    source: z.string().min(1).max(100_000),
  })
  .strict();

export interface RunExecuteTypescriptInput {
  readonly externals: ExecutionExternals;
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
  if (!jsSandboxAllowed()) {
    return { kind: "denied", reason: "host_escape" };
  }
  if (BLOCKED_HOST_ESCAPE.test(input.source)) {
    return { kind: "denied", reason: "host_escape" };
  }
  const tools = indexExternals(input.externals);
  for (const referenced of referencedExternalNames(input.source)) {
    const classified = classifyExternalReference(referenced);
    switch (classified.kind) {
      case "allowlisted":
        if (!tools.has(classified.id)) {
          return { kind: "denied", reason: "external_not_allowlisted" };
        }
        break;
      case "denied":
        return { kind: "denied", reason: classified.reason };
      default: {
        const exhaustive: never = classified;
        return exhaustive;
      }
    }
  }
  const timeoutMs = input.timeoutMs ?? 10_000;
  try {
    const value = await withTimeout(
      runInHostInterpreter({
        source: input.source,
        timeoutMs,
        tools,
      }),
      timeoutMs,
    );
    return { kind: "ok", value };
  } catch (error: unknown) {
    if (isExecuteTimeout(error)) {
      return { kind: "failed", reason: "timeout" };
    }
    return { kind: "failed", reason: "code_mode_failed" };
  }
}

export function createExecuteTypescriptTool(input: {
  readonly externals: ExecutionExternals;
}): Tool {
  const externals = input.externals;
  return tool({
    description:
      "Run one TypeScript program that may call only allowlisted external_* host tools. Host tools run on the host after JSON-RPC validation. Commit is not available.",
    execute: async ({ source }) =>
      runExecuteTypescript({
        externals,
        source,
      }),
    inputSchema: executeTypescriptInputSchema,
  });
}

export function indexExternals(
  externals: ExecutionExternals,
): ReadonlyMap<ExecutionExternalId, HostToolBinding> {
  const byId = new Map<ExecutionExternalId, HostToolBinding>();
  for (const id of EXECUTION_EXTERNAL_IDS) {
    const binding = externals[id];
    if (binding !== undefined) {
      byId.set(id, binding);
    }
  }
  return byId;
}

export function handleHostRpc(
  raw: string,
  tools: ReadonlyMap<ExecutionExternalId, HostToolBinding>,
): Promise<string> {
  return dispatchHostRpc(raw, tools);
}

function referencedExternalNames(source: string): readonly string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(EXTERNAL_CALL)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return [...names];
}

function classifyExternalReference(raw: string):
  | { readonly kind: "allowlisted"; readonly id: ExecutionExternalId }
  | { readonly kind: "denied"; readonly reason: CodeModeDeniedReason } {
  const allowlisted = executionExternalIdSchema.safeParse(raw);
  if (allowlisted.success) {
    return { kind: "allowlisted", id: allowlisted.data };
  }
  if (forbiddenCommitExternalIdSchema.safeParse(raw).success) {
    return { kind: "denied", reason: "commit_forbidden" };
  }
  return { kind: "denied", reason: "external_not_allowlisted" };
}

async function runInHostInterpreter(input: {
  readonly source: string;
  readonly timeoutMs: number;
  readonly tools: ReadonlyMap<ExecutionExternalId, HostToolBinding>;
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
  try {
    const completion: unknown = script.runInContext(context, {
      breakOnSigint: true,
      timeout: input.timeoutMs,
    });
    return await Promise.resolve(completion);
  } catch (error: unknown) {
    if (isExecuteTimeout(error)) {
      throw new Error("execute_typescript timed out");
    }
    throw error;
  }
}

function isExecuteTimeout(error: unknown): boolean {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";
  return (
    message === "execute_typescript timed out" ||
    message.includes("Script execution timed out")
  );
}

function createExternalBindings(
  toolIds: readonly ExecutionExternalId[],
  send: (raw: string) => Promise<string>,
): { [K in ExecutionExternalId as `external_${K}`]?: (args: unknown) => Promise<unknown> } {
  const bindings: {
    [K in ExecutionExternalId as `external_${K}`]?: (
      args: unknown,
    ) => Promise<unknown>;
  } = {};
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
      switch (response.ok) {
        case true:
          return response.result;
        case false:
          throw new Error(response.error.message);
        default: {
          const exhaustive: never = response;
          return exhaustive;
        }
      }
    };
  }
  return bindings;
}

async function dispatchHostRpc(
  raw: string,
  tools: ReadonlyMap<ExecutionExternalId, HostToolBinding>,
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
