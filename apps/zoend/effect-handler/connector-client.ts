import { createHash } from "node:crypto";
import { TerminalError } from "@restatedev/restate-sdk";
import { z } from "zod";
import type { EffectHandlerConfig, TenantId } from "./config.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const observedAtSchema = z.string().regex(/^[0-9]+$/);
const connectorOutcomeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("definitely_not_sent"),
      observedAtMicros: observedAtSchema,
      reason: z.enum(["credential_revoked", "timeout_before_send"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unknown"),
      observedAtMicros: observedAtSchema,
      providerOperationId: z.string().min(1).optional(),
      reason: z.enum([
        "provider_unavailable",
        "response_body_read_error",
        "response_parse_error",
        "response_schema_error",
        "timeout_after_possible_delivery",
      ]),
      responseDigest: digestSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("accepted_pending"),
      observedAtMicros: observedAtSchema,
      providerOperationId: z.string().min(1),
      responseDigest: digestSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("confirmed"),
      observedAtMicros: observedAtSchema,
      providerOperationId: z.string().min(1),
      responseDigest: digestSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("confirmed_no_effect"),
      observedAtMicros: observedAtSchema,
      providerOperationId: z.string().min(1),
      responseDigest: digestSchema,
    })
    .strict(),
]);

export type ConnectorOutcome = z.infer<typeof connectorOutcomeSchema>;

export type EffectDispatchRequest = Readonly<{
  effectRequestId: string;
  idempotencyKey: string;
  payloadBase64: string;
  requestDigest: string;
}>;

export class ConnectorRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorRetryableError";
  }
}

export class ConnectorClient {
  readonly #config: EffectHandlerConfig["connector"];
  readonly #tenantId: TenantId;

  constructor(config: EffectHandlerConfig) {
    this.#config = config.connector;
    this.#tenantId = config.identity.tenantId;
  }

  async invoke(request: EffectDispatchRequest): Promise<ConnectorOutcome> {
    let response: Response;
    try {
      response = await fetch(this.#config.url, {
        body: JSON.stringify({
          credentialRef: this.#config.credentialRef,
          effectRequestId: request.effectRequestId,
          idempotencyKey: request.idempotencyKey,
          payloadBase64: request.payloadBase64,
          requestDigest: request.requestDigest,
          tenantId: this.#tenantId,
        }),
        headers: {
          authorization: `Bearer ${this.#config.callerToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(this.#config.requestTimeoutMs),
      });
    } catch (error: unknown) {
      return isPreSendFailure(error)
        ? {
            kind: "definitely_not_sent",
            observedAtMicros: nowMicros(),
            reason: "timeout_before_send",
          }
        : {
            kind: "unknown",
            observedAtMicros: nowMicros(),
            reason: "timeout_after_possible_delivery",
          };
    }

    if (!response.ok) {
      await cancelResponse(response);
      if (response.status >= 500 || [408, 425, 429].includes(response.status)) {
        throw new ConnectorRetryableError(
          `effect connector returned HTTP ${response.status}`
        );
      }
      throw new TerminalError(
        `effect connector rejected the request with HTTP ${response.status}`
      );
    }

    let body: Uint8Array;
    try {
      body = new Uint8Array(await response.arrayBuffer());
    } catch {
      return {
        kind: "unknown",
        observedAtMicros: nowMicros(),
        reason: "provider_unavailable",
      };
    }
    const connectorResponseDigest = createHash("sha256")
      .update(body)
      .digest("hex");
    let document: unknown;
    try {
      document = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return {
        kind: "unknown",
        observedAtMicros: nowMicros(),
        reason: "response_parse_error",
        responseDigest: connectorResponseDigest,
      };
    }
    const parsed = connectorOutcomeSchema.safeParse(document);
    if (!parsed.success) {
      return {
        kind: "unknown",
        observedAtMicros: nowMicros(),
        reason: "response_schema_error",
        responseDigest: connectorResponseDigest,
      };
    }
    return parsed.data;
  }
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already unusable; cancellation is best-effort cleanup.
  }
}

function isPreSendFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const { cause } = error;
  if (
    typeof cause !== "object" ||
    cause === null ||
    !("code" in cause) ||
    typeof cause.code !== "string"
  ) {
    return false;
  }
  return ["EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "ENOTFOUND"].includes(
    cause.code
  );
}

function nowMicros(): string {
  return (BigInt(Date.now()) * 1_000n).toString();
}
