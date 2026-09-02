import { createHash } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import { type Timestamp, TimestampSchema } from "@bufbuild/protobuf/wkt";
import {
  type CallOptions,
  type Client,
  Code,
  ConnectError,
  createClient,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { TerminalError } from "@restatedev/restate-sdk";
import { z } from "zod";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectService,
  type EffectSnapshot,
} from "../../../gen/connect/zoen/effect/v1/effect_pb.js";
import {
  type EffectHandlerConfig,
  EffectHandlerConfigurationError,
  type EffectRequestId,
  readWorkloadApiKey,
} from "./config.js";
import type { ConnectorOutcome } from "./connector-client.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const claimSchema = z
  .object({
    attemptId: z.string().min(1),
    effectRequestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    payloadBase64: z.string(),
    requestDigest: digestSchema,
  })
  .strict();
const humanTaskPayloadSchema = z
  .object({
    executorClass: z.literal("human_executor"),
    schemaVersion: z.literal(1),
  })
  .passthrough();
const workloadSessionSchema = z
  .object({
    actorId: z.string().min(1),
    credentialId: z.string().min(1),
    discoverableScopes: z.array(
      z
        .object({
          definitionId: z.string().min(1),
          kind: z.string().min(1),
          resourceId: z.string().nullable(),
        })
        .strict()
    ),
    exchangeToken: z.string().min(1),
    principalId: z.string().min(1),
    tenantId: z.string().min(1),
    workloadId: z.string().min(1),
  })
  .strict();

type EffectClient = Client<typeof EffectService>;
type WorkloadSession = z.infer<typeof workloadSessionSchema>;

export type EffectInspection = Readonly<{
  knowledgeCommitSequence: number;
  kind: "external" | "human";
}>;
export type AttemptClaim = Readonly<z.infer<typeof claimSchema>>;

export class EffectServiceClient {
  readonly #authenticationUrl: URL;
  readonly #client: EffectClient;
  readonly #config: EffectHandlerConfig;

  constructor(config: EffectHandlerConfig) {
    this.#config = config;
    this.#authenticationUrl = new URL(
      "/workload/authenticate",
      config.effectService.zoendUrl
    );
    this.#client = createClient(
      EffectService,
      createConnectTransport({
        baseUrl: config.effectService.zoendUrl.toString(),
        httpVersion: "1.1",
      })
    );
  }

  async inspectEffect(
    effectRequestId: EffectRequestId
  ): Promise<EffectInspection> {
    const response = await this.#withAuthentication("get effect", (options) =>
      this.#client.getEffect({ effectRequestId }, options)
    );
    const { snapshot } = response;
    const request = snapshot?.request;
    if (snapshot === undefined || request === undefined) {
      throw new TerminalError("EffectService returned no effect request");
    }
    if (request.effectRequestId !== effectRequestId) {
      throw new TerminalError(
        "EffectService returned a different effect request"
      );
    }
    const knowledgeCommitSequence = latestCommitSequence(snapshot);
    return {
      kind: isHumanTaskPayload(request.payload) ? "human" : "external",
      knowledgeCommitSequence,
    };
  }

  async claimAttempt(
    effectRequestId: EffectRequestId,
    adapterExecutionId: string,
    expectedKnowledgeCommitSequence: number
  ): Promise<AttemptClaim> {
    if (adapterExecutionId.length === 0) {
      throw new TerminalError("Restate supplied an empty invocation id");
    }
    const response = await this.#withAuthentication(
      "claim effect attempt",
      (options) =>
        this.#client.claimAttempt(
          {
            adapterExecutionId,
            effectRequestId,
            expectedKnowledgeCommitSequence: BigInt(
              expectedKnowledgeCommitSequence
            ),
          },
          options
        )
    );
    const claimed = response.claim;
    const request = claimed?.request;
    if (claimed === undefined || request === undefined) {
      throw new TerminalError("EffectService returned no attempt claim");
    }
    if (request.effectRequestId !== effectRequestId) {
      throw new TerminalError(
        "EffectService claimed a different effect request"
      );
    }
    const requestDigest = sha256(request.payload);
    if (requestDigest !== request.requestDigest) {
      throw new TerminalError(
        "EffectService returned an effect payload with the wrong digest"
      );
    }
    const claim = claimSchema.safeParse({
      attemptId: claimed.attemptId,
      effectRequestId: request.effectRequestId,
      idempotencyKey: request.idempotencyKey,
      payloadBase64: Buffer.from(request.payload).toString("base64"),
      requestDigest: request.requestDigest,
    });
    if (!claim.success) {
      throw new TerminalError("EffectService returned a malformed claim");
    }
    return claim.data;
  }

  async recordAttempt(
    claim: AttemptClaim,
    connectorOutcome: ConnectorOutcome
  ): Promise<void> {
    const attemptResult = toAttemptResult(connectorOutcome);
    const response = await this.#withAuthentication(
      "record effect attempt",
      (options) =>
        this.#client.recordAttempt(
          {
            attempt: {
              attemptId: claim.attemptId,
              observedAt: timestampFromMicros(
                connectorOutcome.observedAtMicros
              ),
              outcome: attemptResult.outcome,
              providerOperationId: providerOperationId(connectorOutcome),
              reason: attemptResult.reason,
              responseDigest: responseDigest(connectorOutcome),
            },
            effectRequestId: claim.effectRequestId,
          },
          options
        )
    );
    if (response.snapshot?.request?.effectRequestId !== claim.effectRequestId) {
      throw new TerminalError(
        "EffectService did not return the recorded effect snapshot"
      );
    }
  }

  async #withAuthentication<T>(
    operationName: string,
    operation: (options: CallOptions) => Promise<T>
  ): Promise<T> {
    const firstSession = await this.#authenticate();
    try {
      return await operation(this.#callOptions(firstSession));
    } catch (error: unknown) {
      if (!isUnauthenticated(error)) {
        throwEffectServiceError(operationName, error);
      }
    }

    process.stdout.write(
      "effect service session rejected; reauthenticating once\n"
    );
    const secondSession = await this.#authenticate();
    try {
      return await operation(this.#callOptions(secondSession));
    } catch (error: unknown) {
      throwEffectServiceError(operationName, error);
    }
  }

  async #authenticate(): Promise<WorkloadSession> {
    let apiKey: string;
    try {
      apiKey = readWorkloadApiKey(this.#config.identity.apiKeyFile);
    } catch (error: unknown) {
      if (error instanceof EffectHandlerConfigurationError) {
        throw terminalError(error.message, error);
      }
      throw error;
    }

    let response: Response;
    try {
      response = await fetch(this.#authenticationUrl, {
        body: JSON.stringify({ apiKey }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(
          this.#config.effectService.requestTimeoutMs
        ),
      });
    } catch (error: unknown) {
      throw new Error("workload credential exchange is unavailable", {
        cause: error,
      });
    }
    if (!response.ok) {
      await cancelResponse(response);
      if (response.status >= 500 || response.status === 429) {
        throw new Error(
          `workload credential exchange returned HTTP ${response.status}`
        );
      }
      throw new TerminalError(
        `workload credential exchange rejected the API key with HTTP ${response.status}`
      );
    }

    let document: unknown;
    try {
      document = await response.json();
    } catch (error: unknown) {
      throw terminalError(
        "workload credential exchange returned malformed JSON",
        error
      );
    }
    const session = workloadSessionSchema.safeParse(document);
    if (!session.success) {
      throw new TerminalError(
        "workload credential exchange returned a malformed session"
      );
    }
    if (
      session.data.tenantId !== this.#config.identity.tenantId ||
      session.data.workloadId !== this.#config.identity.workloadId ||
      session.data.principalId !== this.#config.identity.principalId ||
      session.data.actorId !== this.#config.identity.actorId
    ) {
      throw new TerminalError(
        "workload credential exchange returned a mismatched identity"
      );
    }
    return session.data;
  }

  #callOptions(session: WorkloadSession): CallOptions {
    return {
      headers: {
        authorization: `Bearer ${session.exchangeToken}`,
        "x-zoen-tenant": this.#config.identity.tenantId,
      },
      timeoutMs: this.#config.effectService.requestTimeoutMs,
    };
  }
}

function latestCommitSequence(snapshot: EffectSnapshot): number {
  const { request } = snapshot;
  if (request === undefined) {
    throw new TerminalError("EffectService returned no effect request");
  }
  const sequences = [
    request.commitSequence,
    ...snapshot.attempts.map((attempt) => attempt.commitSequence),
    ...snapshot.evidence.map((evidence) => evidence.commitSequence),
    ...snapshot.reconciliations.map(
      (reconciliation) => reconciliation.commitSequence
    ),
  ];
  const latest = sequences.reduce(
    (current, candidate) => (candidate > current ? candidate : current),
    0n
  );
  if (latest <= 0n || latest > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TerminalError(
      "EffectService returned an unsupported knowledge commit sequence"
    );
  }
  return Number(latest);
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already unusable; cancellation is best-effort cleanup.
  }
}

function isHumanTaskPayload(payload: Uint8Array): boolean {
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return false;
  }
  return humanTaskPayloadSchema.safeParse(document).success;
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.Unauthenticated;
}

function terminalError(message: string, cause: unknown): TerminalError {
  const error = new TerminalError(message);
  error.cause = cause;
  return error;
}

function throwEffectServiceError(operationName: string, error: unknown): never {
  if (error instanceof TerminalError) {
    throw error;
  }
  if (!(error instanceof ConnectError) || isTransientConnectCode(error.code)) {
    throw error;
  }
  throw new TerminalError(`${operationName} failed: ${error.message}`);
}

function isTransientConnectCode(code: Code): boolean {
  return [
    Code.Aborted,
    Code.Canceled,
    Code.DeadlineExceeded,
    Code.Internal,
    Code.ResourceExhausted,
    Code.Unavailable,
    Code.Unknown,
  ].includes(code);
}

function toAttemptResult(outcome: ConnectorOutcome): Readonly<{
  outcome: EffectAttemptOutcome;
  reason: EffectAttemptReason;
}> {
  switch (outcome.kind) {
    case "definitely_not_sent":
      return {
        outcome: EffectAttemptOutcome.DEFINITELY_NOT_SENT,
        reason:
          outcome.reason === "credential_revoked"
            ? EffectAttemptReason.CREDENTIAL_REVOKED
            : EffectAttemptReason.TIMEOUT_BEFORE_SEND,
      };
    case "unknown":
      return {
        outcome: EffectAttemptOutcome.UNKNOWN,
        reason: unknownReason(outcome.reason),
      };
    case "accepted_pending":
      return {
        outcome: EffectAttemptOutcome.ACCEPTED_PENDING,
        reason: EffectAttemptReason.UNSPECIFIED,
      };
    case "confirmed":
      return {
        outcome: EffectAttemptOutcome.CONFIRMED,
        reason: EffectAttemptReason.UNSPECIFIED,
      };
    case "confirmed_no_effect":
      return {
        outcome: EffectAttemptOutcome.CONFIRMED_NO_EFFECT,
        reason: EffectAttemptReason.UNSPECIFIED,
      };
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}

function unknownReason(
  reason: Extract<ConnectorOutcome, { kind: "unknown" }>["reason"]
): EffectAttemptReason {
  switch (reason) {
    case "provider_unavailable":
      return EffectAttemptReason.PROVIDER_UNAVAILABLE;
    case "response_parse_error":
      return EffectAttemptReason.RESPONSE_PARSE_ERROR;
    case "response_schema_error":
      return EffectAttemptReason.RESPONSE_SCHEMA_ERROR;
    case "timeout_after_possible_delivery":
      return EffectAttemptReason.TIMEOUT_AFTER_POSSIBLE_DELIVERY;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

function timestampFromMicros(value: string): Timestamp {
  const micros = BigInt(value);
  return create(TimestampSchema, {
    nanos: Number((micros % 1_000_000n) * 1_000n),
    seconds: micros / 1_000_000n,
  });
}

function providerOperationId(outcome: ConnectorOutcome): string {
  return "providerOperationId" in outcome
    ? (outcome.providerOperationId ?? "")
    : "";
}

function responseDigest(outcome: ConnectorOutcome): string {
  return "responseDigest" in outcome ? (outcome.responseDigest ?? "") : "";
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
