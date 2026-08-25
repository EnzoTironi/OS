import { z } from "zod";
import { exactInputSchema } from "./types.js";

const hostIdSchema = z.string().min(1).max(200);

export const isolatePathSegmentSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

const commitSequenceSchema = z
  .union([
    z.number().int().nonnegative(),
    z.bigint(),
    z.string().regex(/^[0-9]+$/),
  ])
  .transform((value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "bigint") {
      return Number(value);
    }
    return Number(value);
  });

export const codeModeSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ id: hostIdSchema, kind: z.literal("computation") }).strict(),
  z.object({ id: hostIdSchema, kind: z.literal("relation") }).strict(),
]);
export type CodeModeSelection = z.infer<typeof codeModeSelectionSchema>;

export const codeModeQueryRequestSchema = z
  .object({
    capabilityId: hostIdSchema,
    entityId: hostIdSchema,
    selection: codeModeSelectionSchema,
  })
  .strict();
export type CodeModeQueryRequest = z.infer<typeof codeModeQueryRequestSchema>;

export const codeModeSemanticValueSchema = z
  .object({
    claimIds: z.array(hostIdSchema),
    value: exactInputSchema,
  })
  .strict();
export type CodeModeSemanticValue = z.infer<typeof codeModeSemanticValueSchema>;

export const codeModeQueryResultSchema = z
  .object({
    actualCommitSequence: commitSequenceSchema,
    values: z.array(codeModeSemanticValueSchema),
  })
  .strict();
export type CodeModeQueryResult = z.output<typeof codeModeQueryResultSchema>;
export type CodeModeQueryResultInput = z.input<typeof codeModeQueryResultSchema>;

export const codeModeExplainRequestSchema = z
  .object({
    capabilityId: hostIdSchema,
    claimId: hostIdSchema,
  })
  .strict();
export type CodeModeExplainRequest = z.infer<typeof codeModeExplainRequestSchema>;

export const codeModeExplainResultSchema = z
  .object({
    complete: z.boolean(),
    explanationDigest: z.string().min(1),
  })
  .strict();
export type CodeModeExplainResult = z.infer<typeof codeModeExplainResultSchema>;

export const codeModeActionInputSchema = z
  .object({
    id: hostIdSchema,
    value: exactInputSchema,
  })
  .strict();

export const codeModeProposeRequestSchema = z
  .object({
    actionId: hostIdSchema,
    capabilityId: hostIdSchema,
    inputs: z.array(codeModeActionInputSchema),
    operationId: hostIdSchema,
    proposalId: hostIdSchema,
    resourceId: hostIdSchema,
  })
  .strict();
export type CodeModeProposeRequest = z.infer<typeof codeModeProposeRequestSchema>;

export const codeModeProposalSchema = z
  .object({
    intentDigest: z.string().min(1),
    operationId: hostIdSchema,
    proposalId: hostIdSchema,
  })
  .strict();
export type CodeModeProposal = z.infer<typeof codeModeProposalSchema>;

export const codeModeProposalOutcomeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("awaiting_approval"),
      proposal: codeModeProposalSchema,
    })
    .strict(),
  z.object({ kind: z.literal("denied") }).strict(),
  z.object({ kind: z.literal("evaluation_error") }).strict(),
  z.object({ kind: z.literal("precondition_denied") }).strict(),
  z
    .object({
      kind: z.literal("ready"),
      proposal: codeModeProposalSchema,
    })
    .strict(),
]);
export type CodeModeProposalOutcome = z.infer<
  typeof codeModeProposalOutcomeSchema
>;

export const codeModeCommitRequestSchema = z
  .object({
    capabilityId: hostIdSchema,
    intentDigest: z.string().min(1),
    operationId: hostIdSchema,
    proposalId: hostIdSchema,
  })
  .strict();
export type CodeModeCommitRequest = z.infer<typeof codeModeCommitRequestSchema>;

export const codeModeHostErrorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      capabilityId: hostIdSchema,
      kind: z.literal("capability_unavailable"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("capability_denied"),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("invalid_request"),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("provider_unavailable"),
      message: z.string().min(1),
    })
    .strict(),
]);
export type CodeModeHostError = z.infer<typeof codeModeHostErrorSchema>;

/**
 * Capability-plane host imported by `wit/zoen-code-mode`.
 * The worker adapter never forwards `commit`.
 */
export interface ExecutionCodeModeHost {
  query(request: CodeModeQueryRequest): Promise<CodeModeQueryResultInput>;
  explain?(request: CodeModeExplainRequest): Promise<CodeModeExplainResult>;
  propose?(request: CodeModeProposeRequest): Promise<CodeModeProposalOutcome>;
}

export type WorkerHostOk<T> = {
  readonly kind: "ok";
  readonly result: T;
};

export type WorkerHostDenied = {
  readonly kind: "denied";
  readonly reason: "commit_forbidden";
};

export type WorkerHostFailed = {
  readonly error: CodeModeHostError;
  readonly kind: "failed";
};

export type WorkerHostResult<T> =
  | WorkerHostDenied
  | WorkerHostFailed
  | WorkerHostOk<T>;

export interface WorkerCodeModeHost {
  query(request: CodeModeQueryRequest): Promise<WorkerHostResult<CodeModeQueryResult>>;
  explain(
    request: CodeModeExplainRequest,
  ): Promise<WorkerHostResult<CodeModeExplainResult>>;
  propose(
    request: CodeModeProposeRequest,
  ): Promise<WorkerHostResult<CodeModeProposalOutcome>>;
  commit(request: CodeModeCommitRequest): Promise<WorkerHostDenied>;
}

/**
 * Latch set when the worker attempts Cedar/Action commit.
 */
export interface ExecutionIsolateGate {
  readonly commitDenied: boolean;
  noteCommitDenied(): void;
}

export function createExecutionIsolateGate(): ExecutionIsolateGate {
  let commitDenied = false;
  return {
    get commitDenied() {
      return commitDenied;
    },
    noteCommitDenied() {
      commitDenied = true;
    },
  };
}

/**
 * Bind WIT host functions for the isolate. `commit` is always denied.
 *
 * Context: just-bash `zoen` CLI and tests call this instead of Wasmtime.
 * Inputs: optional inner `query` / `explain` / `propose` implementations.
 * Outputs: `ok` query-result, `failed` host-error, or `denied` + `commit_forbidden`.
 * Side effects: records commit attempts on `gate`. Never commits belief.
 */
export function createWorkerCodeModeHost(
  inner: ExecutionCodeModeHost | undefined,
  gate: ExecutionIsolateGate,
): WorkerCodeModeHost {
  return {
    async query(request) {
      return callOptionalHost(
        inner === undefined
          ? undefined
          : async (next) =>
              codeModeQueryResultSchema.parse(await inner.query(next)),
        request,
        request.capabilityId,
      );
    },
    async explain(request) {
      const explain = inner?.explain;
      return callOptionalHost(
        explain === undefined ? undefined : (next) => explain.call(inner, next),
        request,
        request.capabilityId,
      );
    },
    async propose(request) {
      const propose = inner?.propose;
      return callOptionalHost(
        propose === undefined ? undefined : (next) => propose.call(inner, next),
        request,
        request.capabilityId,
      );
    },
    async commit(_request) {
      gate.noteCommitDenied();
      return { kind: "denied", reason: "commit_forbidden" };
    },
  };
}

async function callOptionalHost<TRequest, TResult>(
  execute: ((request: TRequest) => Promise<TResult>) | undefined,
  request: TRequest,
  capabilityId: string,
): Promise<WorkerHostResult<TResult>> {
  if (execute === undefined) {
    return {
      error: { capabilityId, kind: "capability_unavailable" },
      kind: "failed",
    };
  }
  try {
    return { kind: "ok", result: await execute(request) };
  } catch (error: unknown) {
    return {
      error: {
        kind: "invalid_request",
        message: error instanceof Error ? error.message : String(error),
      },
      kind: "failed",
    };
  }
}
