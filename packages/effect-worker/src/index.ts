import { createHash } from "node:crypto";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectKnowledgeState,
  EffectService,
} from "../../sdk/src/gen/zoen/effect/v1/effect_pb.js";

const environmentSchema = z.object({
  ZOEN_CONNECTOR_CREDENTIAL_REF: z.string().min(1),
  ZOEN_EFFECT_CONNECTOR_URL: z.url(),
  ZOEN_EFFECT_SERVICE_BEARER_TOKEN: z.string().min(1),
  ZOEN_EFFECT_SERVICE_URL: z.url(),
  ZOEN_EFFECT_WORKER_PORT: z.coerce.number().int().min(1).max(65_535),
  ZOEN_EFFECT_WORKER_TENANT_ID: z.string().min(1),
});

const dispatchInputSchema = z
  .object({
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
      externalOperationId: z.string().min(1),
      kind: z.literal("accepted_pending"),
      observedAtMicros: observedAtSchema,
      responseDigest: digestSchema,
    })
    .strict(),
  z
    .object({
      externalOperationId: z.string().min(1),
      kind: z.literal("confirmed"),
      observedAtMicros: observedAtSchema,
      responseDigest: digestSchema,
    })
    .strict(),
  z
    .object({
      externalOperationId: z.string().min(1),
      kind: z.literal("confirmed_no_effect"),
      observedAtMicros: observedAtSchema,
      responseDigest: digestSchema,
    })
    .strict(),
]);

type ConnectorOutcome = z.infer<typeof connectorOutcomeSchema>;

interface EffectDispatchRequest {
  effectRequestId: string;
  externalOperationId: string;
  payloadBase64: string;
  requestDigest: string;
}

interface AttemptResult {
  outcome: EffectAttemptOutcome;
  reason: EffectAttemptReason;
  responseDigest: string;
}

const environment = environmentSchema.parse(process.env);
const authorization: Interceptor = (next) => async (request) => {
  request.header.set(
    "authorization",
    `Bearer ${environment.ZOEN_EFFECT_SERVICE_BEARER_TOKEN}`,
  );
  return next(request);
};
const effectClient = createClient(
  EffectService,
  createConnectTransport({
    baseUrl: environment.ZOEN_EFFECT_SERVICE_URL,
    httpVersion: "1.1",
    interceptors: [authorization],
  }),
);

const zoenEffect = restate.object({
  name: "ZoenEffect",
  handlers: {
    execute: async (context: restate.ObjectContext, input: unknown) => {
      const command = dispatchInputSchema.parse(input);
      const expectedKey = `${command.tenantId}:${command.effectRequestId}`;
      if (
        context.key !== expectedKey ||
        command.tenantId !== environment.ZOEN_EFFECT_WORKER_TENANT_ID
      ) {
        throw new restate.TerminalError(
          "effect invocation key does not match the trusted tenant and effect identity",
        );
      }

      const effect = await context.run("load effect request", async () => {
        const response = await effectClient.getEffect({
          effectRequestId: command.effectRequestId,
        });
        const request = response.snapshot?.request;
        if (request === undefined) {
          throw new restate.TerminalError(
            "EffectService returned no effect request",
          );
        }
        return {
          effectRequestId: request.effectRequestId,
          externalOperationId: request.externalOperationId,
          payloadBase64: Buffer.from(request.payload).toString("base64"),
          requestDigest: request.requestDigest,
          state: request.state,
        };
      });

      if (
        effect.state !== EffectKnowledgeState.NOT_ATTEMPTED &&
        effect.state !== EffectKnowledgeState.DEFINITELY_NOT_SENT
      ) {
        return;
      }

      let outcome: ConnectorOutcome;
      try {
        outcome = await context.run(
          "invoke external connector",
          async () => {
            const result = await invokeConnector(effect, command.tenantId);
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
        await effectClient.recordAttempt({
          attempt: {
            attemptId: `attempt.restate.${context.request().id}`,
            externalOperationId: effect.externalOperationId,
            observedAt: timestampFromMicros(outcome.observedAtMicros),
            outcome: result.outcome,
            reason: result.reason,
            requestDigest: effect.requestDigest,
            responseDigest: result.responseDigest,
          },
          effectRequestId: effect.effectRequestId,
        });
        return "recorded";
      });
    },
  },
});

async function invokeConnector(
  request: EffectDispatchRequest,
  tenantId: string,
): Promise<ConnectorOutcome> {
  let response: Response;
  try {
    response = await fetch(environment.ZOEN_EFFECT_CONNECTOR_URL, {
      body: JSON.stringify({
        credentialRef: environment.ZOEN_CONNECTOR_CREDENTIAL_REF,
        effectRequestId: request.effectRequestId,
        externalOperationId: request.externalOperationId,
        payloadBase64: request.payloadBase64,
        requestDigest: request.requestDigest,
        tenantId,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    return {
      kind: "unknown",
      observedAtMicros: nowMicros(),
      reason: "timeout_after_possible_delivery",
    };
  }

  const body = new Uint8Array(await response.arrayBuffer());
  const responseDigest = createHash("sha256").update(body).digest("hex");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return {
      kind: "unknown",
      observedAtMicros: nowMicros(),
      reason: "response_parse_error",
      responseDigest,
    };
  }
  const parsed = connectorOutcomeSchema.safeParse(value);
  if (!parsed.success) {
    return {
      kind: "unknown",
      observedAtMicros: nowMicros(),
      reason: "response_schema_error",
      responseDigest,
    };
  }
  if (
    "externalOperationId" in parsed.data &&
    parsed.data.externalOperationId !== request.externalOperationId
  ) {
    return {
      kind: "unknown",
      observedAtMicros: nowMicros(),
      reason: "response_schema_error",
      responseDigest,
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
        responseDigest: "",
      };
    case "unknown":
      return {
        outcome: EffectAttemptOutcome.UNKNOWN,
        reason: unknownReason(outcome.reason),
        responseDigest: outcome.responseDigest ?? "",
      };
    case "accepted_pending":
      return {
        outcome: EffectAttemptOutcome.ACCEPTED_PENDING,
        reason: EffectAttemptReason.UNSPECIFIED,
        responseDigest: outcome.responseDigest,
      };
    case "confirmed":
      return {
        outcome: EffectAttemptOutcome.CONFIRMED,
        reason: EffectAttemptReason.UNSPECIFIED,
        responseDigest: outcome.responseDigest,
      };
    case "confirmed_no_effect":
      return {
        outcome: EffectAttemptOutcome.CONFIRMED_NO_EFFECT,
        reason: EffectAttemptReason.UNSPECIFIED,
        responseDigest: outcome.responseDigest,
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

function timestampFromMicros(value: string) {
  const milliseconds = Number(BigInt(value) / 1_000n);
  return timestampFromDate(new Date(milliseconds));
}

function nowMicros(): string {
  return (BigInt(Date.now()) * 1_000n).toString();
}

await restate.serve({
  port: environment.ZOEN_EFFECT_WORKER_PORT,
  services: [zoenEffect],
});
