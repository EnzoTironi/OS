import { createHash } from "node:crypto";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  createClient,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectService,
} from "../../sdk/src/gen/zoen/effect/v1/effect_pb.js";

const stringMapSchema = z.record(z.string().min(1), z.string().min(1));
const environmentSchema = z.object({
  ZOEN_CONNECTOR_CALLER_TOKEN: z.string().min(1),
  ZOEN_CONNECTOR_CREDENTIAL_REFS: z.string().min(1),
  ZOEN_EFFECT_CONNECTOR_URL: z.url(),
  ZOEN_EFFECT_SERVICE_BEARER_TOKENS: z.string().min(1),
  ZOEN_EFFECT_SERVICE_URL: z.url(),
  ZOEN_EFFECT_WORKER_PORT: z.coerce.number().int().min(1).max(65_535),
});

const dispatchInputSchema = z
  .object({
    dispatchVersion: z.number().int().positive(),
    effectRequestId: z.string().min(1),
    tenantId: z.string().min(1),
  })
  .strict();

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const observedAtSchema = z.string().regex(/^[0-9]+$/);
const timeoutBeforeSendError =
  "connector proved that the request timed out before send";
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

type ConnectorOutcome = z.infer<typeof connectorOutcomeSchema>;

interface EffectDispatchRequest {
  effectRequestId: string;
  idempotencyKey: string;
  payloadBase64: string;
  requestDigest: string;
}

interface AttemptResult {
  outcome: EffectAttemptOutcome;
  reason: EffectAttemptReason;
}

type AttemptClaim =
  | { kind: "not_sendable" }
  | ({
      attemptId: string;
      kind: "claimed";
    } & EffectDispatchRequest);

const rawEnvironment = environmentSchema.parse(process.env);
const environment = {
  ...rawEnvironment,
  ZOEN_CONNECTOR_CREDENTIAL_REFS: parseStringMap(
    rawEnvironment.ZOEN_CONNECTOR_CREDENTIAL_REFS,
  ),
  ZOEN_EFFECT_SERVICE_BEARER_TOKENS: parseStringMap(
    rawEnvironment.ZOEN_EFFECT_SERVICE_BEARER_TOKENS,
  ),
};

const zoenEffect = restate.object({
  name: "ZoenEffect",
  handlers: {
    execute: async (context: restate.ObjectContext, input: unknown) => {
      const command = dispatchInputSchema.parse(input);
      const expectedKey = `${command.tenantId}:${command.effectRequestId}:${command.dispatchVersion}`;
      if (context.key !== expectedKey) {
        throw new restate.TerminalError(
          "effect invocation key does not match the tenant, effect, and knowledge revision",
        );
      }
      const client = effectClient(command.tenantId);
      const claim = await context.run(
        "claim effect attempt",
        async (): Promise<AttemptClaim> => {
          try {
            const response = await client.claimAttempt({
              adapterExecutionId: context.request().id,
              effectRequestId: command.effectRequestId,
            });
            const claimed = response.claim;
            const request = claimed?.request;
            if (claimed === undefined || request === undefined) {
              throw new restate.TerminalError(
                "EffectService returned no attempt claim",
              );
            }
            return {
              attemptId: claimed.attemptId,
              effectRequestId: request.effectRequestId,
              idempotencyKey: request.idempotencyKey,
              kind: "claimed",
              payloadBase64: Buffer.from(request.payload).toString("base64"),
              requestDigest: request.requestDigest,
            };
          } catch (error: unknown) {
            if (
              error instanceof ConnectError &&
              error.code === Code.FailedPrecondition
            ) {
              return { kind: "not_sendable" };
            }
            throw error;
          }
        },
      );
      if (claim.kind === "not_sendable") {
        return;
      }

      let outcome: ConnectorOutcome;
      try {
        outcome = await context.run(
          "invoke external connector",
          async () => {
            const result = await invokeConnector(
              claim,
              command.tenantId,
            );
            if (
              result.kind === "definitely_not_sent" &&
              result.reason === "timeout_before_send"
            ) {
              throw new Error(timeoutBeforeSendError);
            }
            return result;
          },
          {
            initialRetryInterval: 100,
            maxRetryAttempts: 3,
            maxRetryInterval: 500,
          },
        );
      } catch (error: unknown) {
        if (
          !(error instanceof restate.TerminalError) ||
          !error.message.includes(timeoutBeforeSendError)
        ) {
          throw error;
        }
        outcome = {
          kind: "definitely_not_sent",
          observedAtMicros: nowMicros(),
          reason: "timeout_before_send",
        };
      }

      const result = toAttemptResult(outcome);
      await context.run("record effect attempt", async () => {
        await client.recordAttempt({
          attempt: {
            attemptId: claim.attemptId,
            observedAt: timestampFromMicros(outcome.observedAtMicros),
            outcome: result.outcome,
            providerOperationId: providerOperationId(outcome),
            reason: result.reason,
            responseDigest: responseDigest(outcome),
          },
          effectRequestId: claim.effectRequestId,
        });
        return "recorded";
      });
    },
  },
});

function effectClient(tenantId: string) {
  const token = environment.ZOEN_EFFECT_SERVICE_BEARER_TOKENS[tenantId];
  if (token === undefined) {
    throw new restate.TerminalError(
      "effect worker has no service credential for the invocation tenant",
    );
  }
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createClient(
    EffectService,
    createConnectTransport({
      baseUrl: environment.ZOEN_EFFECT_SERVICE_URL,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}

async function invokeConnector(
  request: EffectDispatchRequest,
  tenantId: string,
): Promise<ConnectorOutcome> {
  const credentialRef = environment.ZOEN_CONNECTOR_CREDENTIAL_REFS[tenantId];
  if (credentialRef === undefined) {
    throw new restate.TerminalError(
      "effect worker has no connector credential reference for the invocation tenant",
    );
  }
  let response: Response;
  try {
    response = await fetch(environment.ZOEN_EFFECT_CONNECTOR_URL, {
      body: JSON.stringify({
        credentialRef,
        effectRequestId: request.effectRequestId,
        idempotencyKey: request.idempotencyKey,
        payloadBase64: request.payloadBase64,
        requestDigest: request.requestDigest,
        tenantId,
      }),
      headers: {
        authorization: `Bearer ${environment.ZOEN_CONNECTOR_CALLER_TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error: unknown) {
    return isPreSendConnectorFailure(error)
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
    throw new Error(
      `connector rejected effect request with HTTP ${response.status}`,
    );
  }

  const body = new Uint8Array(await response.arrayBuffer());
  const responseDigestValue = createHash("sha256").update(body).digest("hex");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return {
      kind: "unknown",
      observedAtMicros: nowMicros(),
      reason: "response_parse_error",
      responseDigest: responseDigestValue,
    };
  }
  const parsed = connectorOutcomeSchema.safeParse(value);
  if (!parsed.success) {
    return {
      kind: "unknown",
      observedAtMicros: nowMicros(),
      reason: "response_schema_error",
      responseDigest: responseDigestValue,
    };
  }
  return parsed.data;
}

function toAttemptResult(outcome: ConnectorOutcome): AttemptResult {
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
  reason: Extract<ConnectorOutcome, { kind: "unknown" }>["reason"],
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

function providerOperationId(outcome: ConnectorOutcome): string {
  return "providerOperationId" in outcome
    ? (outcome.providerOperationId ?? "")
    : "";
}

function responseDigest(outcome: ConnectorOutcome): string {
  return "responseDigest" in outcome ? (outcome.responseDigest ?? "") : "";
}

function isPreSendConnectorFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const cause = error.cause;
  if (
    typeof cause !== "object" ||
    cause === null ||
    !("code" in cause) ||
    typeof cause.code !== "string"
  ) {
    return false;
  }
  return ["EAI_AGAIN", "ECONNREFUSED", "ENOTFOUND"].includes(cause.code);
}

function timestampFromMicros(value: string) {
  const milliseconds = Number(BigInt(value) / 1_000n);
  return timestampFromDate(new Date(milliseconds));
}

function nowMicros(): string {
  return (BigInt(Date.now()) * 1_000n).toString();
}

function parseStringMap(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(value);
  return stringMapSchema.parse(parsed);
}

await restate.serve({
  port: environment.ZOEN_EFFECT_WORKER_PORT,
  services: [zoenEffect],
});
