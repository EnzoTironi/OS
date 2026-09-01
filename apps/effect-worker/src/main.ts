import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  createClient,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { actor, queue, setup } from "rivetkit";
import { createClient as createRivetClient } from "rivetkit/client";
import { type WorkflowLoopContextOf, workflow } from "rivetkit/workflow";
import { z } from "zod";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectEvidenceOutcome,
  EffectKnowledgeState,
  EffectService,
} from "../../../gen/connect/zoen/effect/v1/effect_pb.js";

const stringMapSchema = z.record(z.string().min(1), z.string().min(1));
const oidcClientSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  })
  .strict();
const oidcClientMapSchema = z.record(z.string().min(1), oidcClientSchema);
const environmentSchema = z.intersection(
  z.object({
    RIVET_ENDPOINT: z.string().min(1),
    ZOEN_CONNECTOR_CALLER_TOKEN: z.string().min(1),
    ZOEN_CONNECTOR_CREDENTIAL_REFS: z.string().min(1),
    ZOEN_EFFECT_CONNECTOR_URL: z.url().optional(),
    ZOEN_EFFECT_RECONCILER_BEARER_TOKENS: z.string().min(1).optional(),
    ZOEN_EFFECT_SERVICE_URL: z.url(),
    ZOEN_EFFECT_WORKER_PORT: z.coerce.number().int().min(1).max(65_535),
    ZOEN_KAPSO_API_KEY: z.string().min(1),
    ZOEN_KAPSO_PHONE_NUMBER_ID: z.string().min(1),
    ZOEN_REMINDER_CHANNEL_URL: z.url().optional(),
  }),
  z.union([
    z.object({
      ZOEN_EFFECT_SERVICE_BEARER_TOKENS: z.string().min(1),
    }),
    z.object({
      ZOEN_EFFECT_SERVICE_OIDC_CLIENTS: z.string().min(1),
      ZOEN_EFFECT_SERVICE_OIDC_TOKEN_ENDPOINT: z.url(),
    }),
  ])
);
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();

const dispatchInputSchema = z
  .object({
    dispatchVersion: z.number().int().positive(),
    effectRequestId: z.string().min(1),
    tenantId: z.string().min(1),
  })
  .strict();

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const observedAtSchema = z.string().regex(/^\d+$/);
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

const reminderPayloadSchema = z
  .object({
    body: z.string().min(1),
    channel: z
      .object({
        kind: z.literal("whatsapp"),
        to: z.string().min(1),
      })
      .strict(),
    dueAt: z.string().min(1),
    executorClass: z.literal("reminder_delivery"),
    schemaVersion: z.literal(1),
  })
  .strict();

const kapsoResponseSchema = z
  .object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) })
  .passthrough();

type ConnectorOutcome = z.infer<typeof connectorOutcomeSchema>;
type ReminderPayload = z.infer<typeof reminderPayloadSchema>;
type DispatchInput = z.infer<typeof dispatchInputSchema>;

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

type PayloadClass =
  | { kind: "external" }
  | { kind: "human" }
  | { kind: "missing" }
  | { kind: "reminder"; payload: ReminderPayload };

type ServiceAuthentication =
  | {
      readonly kind: "bearer";
      readonly tokens: Readonly<Record<string, string>>;
    }
  | {
      readonly clients: Readonly<
        Record<string, z.infer<typeof oidcClientSchema>>
      >;
      readonly kind: "oidc";
      readonly tokenEndpoint: string;
    };

const rawEnvironment = environmentSchema.parse(process.env);
const serviceAuthentication = (
  "ZOEN_EFFECT_SERVICE_BEARER_TOKENS" in rawEnvironment
    ? {
        kind: "bearer",
        tokens: parseStringMap(
          rawEnvironment.ZOEN_EFFECT_SERVICE_BEARER_TOKENS
        ),
      }
    : {
        clients: parseOidcClientMap(
          rawEnvironment.ZOEN_EFFECT_SERVICE_OIDC_CLIENTS
        ),
        kind: "oidc",
        tokenEndpoint: rawEnvironment.ZOEN_EFFECT_SERVICE_OIDC_TOKEN_ENDPOINT,
      }
) satisfies ServiceAuthentication;
// The engine gates reconcile on a dedicated reconciler workload identity
// (require_reconciler in crates/zoen-engine/src/effect.rs), separate from the
// claiming worker workload. When ZOEN_EFFECT_RECONCILER_BEARER_TOKENS is set,
// reconcile calls authenticate with it; otherwise they fall back to the
// service credential (back-compatible with single-credential deploys).
const reconcilerTokens =
  rawEnvironment.ZOEN_EFFECT_RECONCILER_BEARER_TOKENS === undefined
    ? undefined
    : parseStringMap(rawEnvironment.ZOEN_EFFECT_RECONCILER_BEARER_TOKENS);
const environment = {
  ...rawEnvironment,
  ZOEN_CONNECTOR_CREDENTIAL_REFS: parseStringMap(
    rawEnvironment.ZOEN_CONNECTOR_CREDENTIAL_REFS
  ),
};

class TerminalEffectError extends Error {}

const HUMAN_OBSERVATION_ROUNDS = 120;

export const zoenEffect = actor({
  queues: { execute: queue<DispatchInput>() },
  run: workflow(async (ctx) => {
    await ctx.loop("effect-loop", async (loopCtx) => {
      const message = await loopCtx.queue.next("wait-execute");
      const alreadyDone = await loopCtx.step(
        "check done",
        async (step) => step.state.done
      );
      if (alreadyDone) {
        return;
      }
      const command = dispatchInputSchema.parse(message.body);
      const client = effectClient(command.tenantId);
      const adapterExecutionId = `rivet:${command.tenantId}:${command.effectRequestId}:${command.dispatchVersion}`;
      const payloadClass = await inspectPayloadClass(
        loopCtx,
        client,
        command.effectRequestId
      );

      if (payloadClass.kind === "missing") {
        await markDone(loopCtx);
        return;
      }
      if (payloadClass.kind === "human") {
        await runHumanEffect(loopCtx, client, command.effectRequestId);
        return;
      }
      if (payloadClass.kind === "reminder") {
        await runReminderEffect(
          loopCtx,
          client,
          command,
          adapterExecutionId,
          payloadClass.payload
        );
        return;
      }

      const connectorUrl = environment.ZOEN_EFFECT_CONNECTOR_URL;
      if (connectorUrl === undefined) {
        console.log(
          `no connector configured; skipping external effect ${command.effectRequestId}`
        );
        await markDone(loopCtx);
        return;
      }
      await runExternalEffect(
        loopCtx,
        client,
        command,
        adapterExecutionId,
        connectorUrl
      );
    });
  }),
  state: { done: false },
});

type LoopContext = WorkflowLoopContextOf<typeof zoenEffect>;

async function markDone(loopCtx: LoopContext): Promise<void> {
  await loopCtx.step("mark-done", (step) => {
    step.state.done = true;
    return Promise.resolve();
  });
}

async function inspectPayloadClass(
  loopCtx: LoopContext,
  client: ReturnType<typeof effectClient>,
  effectRequestId: string
): Promise<PayloadClass> {
  return await loopCtx.step(
    "inspect effect payload class",
    async (): Promise<PayloadClass> => {
      try {
        const response = await client.getEffect({ effectRequestId });
        const payload = response.snapshot?.request?.payload;
        if (payload === undefined) {
          return { kind: "missing" };
        }
        return classifyPayload(payload);
      } catch (error: unknown) {
        if (
          error instanceof ConnectError &&
          (error.code === Code.NotFound || error.code === Code.PermissionDenied)
        ) {
          return { kind: "missing" };
        }
        throw error;
      }
    }
  );
}

async function runHumanEffect(
  loopCtx: LoopContext,
  client: ReturnType<typeof effectClient>,
  effectRequestId: string
): Promise<void> {
  for (let round = 0; round < HUMAN_OBSERVATION_ROUNDS; round += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: human-operator polling is intentionally sequential; each round observes only after the previous sleep
    const state = await loopCtx.step(
      `await human operator progress ${round}`,
      async () => {
        const response = await client.getEffect({ effectRequestId });
        return response.snapshot?.request?.state ?? 0;
      }
    );
    if (state !== EffectKnowledgeState.NOT_ATTEMPTED) {
      break;
    }
    await loopCtx.sleepUntil(
      `await human operator tick ${round}`,
      Date.now() + 1000
    );
  }
  await markDone(loopCtx);
}

async function runReminderEffect(
  loopCtx: LoopContext,
  client: ReturnType<typeof effectClient>,
  command: DispatchInput,
  adapterExecutionId: string,
  payload: ReminderPayload
): Promise<void> {
  const dueAtMs = Date.parse(payload.dueAt);
  if (Number.isNaN(dueAtMs)) {
    throw new TerminalEffectError("reminder payload dueAt is not a date");
  }
  await loopCtx.sleepUntil("wait-due-at", dueAtMs);
  const claim = await claimAttempt(
    loopCtx,
    client,
    command.effectRequestId,
    adapterExecutionId
  );
  if (claim.kind === "not_sendable") {
    await markDone(loopCtx);
    return;
  }
  const delivery = await loopCtx.step({
    maxRetries: 3,
    name: "deliver-reminder",
    retryBackoffBase: 100,
    retryBackoffMax: 500,
    retryOnTimeout: true,
    run: async () => invokeKapso(payload),
    timeout: 10_000,
  });
  await loopCtx.step("record effect attempt", async () => {
    await client.recordAttempt({
      attempt: {
        attemptId: claim.attemptId,
        observedAt: timestampFromDate(new Date()),
        outcome: EffectAttemptOutcome.ACCEPTED_PENDING,
        providerOperationId: delivery.providerOperationId,
        reason: EffectAttemptReason.UNSPECIFIED,
        responseDigest: delivery.responseDigest,
      },
      effectRequestId: claim.effectRequestId,
    });
    return "recorded";
  });
  await loopCtx.step("reconcile confirmed", async () => {
    await effectClient(command.tenantId, reconcilerBearerToken).reconcile({
      effectRequestId: claim.effectRequestId,
      evidence: {
        evidenceDigest: sha256Hex(`${claim.effectRequestId}.confirmed.kapso`),
        evidenceId: `evidence.reminder.${claim.effectRequestId}`,
        // EffectIdempotencyKey grammar allows only alphanumerics plus . _ -
        // (crates/zoen-core parse_identifier) - no colon separators.
        idempotencyKey: `${claim.effectRequestId}.confirmed.kapso`,
        observedAt: timestampFromDate(new Date()),
        outcome: EffectEvidenceOutcome.CONFIRMED,
        providerOperationId: delivery.providerOperationId,
        sourceId: "kapso",
        sourceRef: delivery.providerOperationId,
      },
    });
    return "reconciled";
  });
  await markDone(loopCtx);
}

async function runExternalEffect(
  loopCtx: LoopContext,
  client: ReturnType<typeof effectClient>,
  command: DispatchInput,
  adapterExecutionId: string,
  connectorUrl: string
): Promise<void> {
  const claim = await claimAttempt(
    loopCtx,
    client,
    command.effectRequestId,
    adapterExecutionId
  );
  if (claim.kind === "not_sendable") {
    await markDone(loopCtx);
    return;
  }
  const outcome = await loopCtx.step({
    maxRetries: 3,
    name: "invoke external connector",
    retryBackoffBase: 100,
    retryBackoffMax: 500,
    retryOnTimeout: true,
    run: async () => invokeConnector(claim, command.tenantId, connectorUrl),
    timeout: 30_000,
  });
  const result = toAttemptResult(outcome);
  await loopCtx.step("record effect attempt", async () => {
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
  await markDone(loopCtx);
}

async function claimAttempt(
  loopCtx: LoopContext,
  client: ReturnType<typeof effectClient>,
  effectRequestId: string,
  adapterExecutionId: string
): Promise<AttemptClaim> {
  return await loopCtx.step("claim effect attempt", async () => {
    try {
      const response = await client.claimAttempt({
        adapterExecutionId,
        effectRequestId,
      });
      const claimed = response.claim;
      const request = claimed?.request;
      if (claimed === undefined || request === undefined) {
        throw new TerminalEffectError(
          "EffectService returned no attempt claim"
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
        (error.code === Code.FailedPrecondition ||
          error.code === Code.PermissionDenied)
      ) {
        return { kind: "not_sendable" };
      }
      throw error;
    }
  });
}

function classifyPayload(payload: Uint8Array): PayloadClass {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return { kind: "external" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "external" };
  }
  const reminder = reminderPayloadSchema.safeParse(parsed);
  if (reminder.success) {
    return { kind: "reminder", payload: reminder.data };
  }
  const record = parsed as {
    executorClass?: unknown;
    schemaVersion?: unknown;
  };
  if (record.executorClass === "human_executor" && record.schemaVersion === 1) {
    return { kind: "human" };
  }
  return { kind: "external" };
}

function effectClient(
  tenantId: string,
  bearerToken: (id: string) => Promise<string> = serviceBearerToken
) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${await bearerToken(tenantId)}`);
    request.header.set("x-zoen-tenant", tenantId);
    return next(request);
  };
  return createClient(
    EffectService,
    createConnectTransport({
      baseUrl: environment.ZOEN_EFFECT_SERVICE_URL,
      httpVersion: "1.1",
      interceptors: [authorization],
    })
  );
}

async function reconcilerBearerToken(tenantId: string): Promise<string> {
  const token = reconcilerTokens?.[tenantId];
  return token ?? serviceBearerToken(tenantId);
}

async function serviceBearerToken(tenantId: string): Promise<string> {
  switch (serviceAuthentication.kind) {
    case "bearer": {
      const token = serviceAuthentication.tokens[tenantId];
      if (token === undefined) {
        throw new TerminalEffectError(
          "effect worker has no service credential for the invocation tenant"
        );
      }
      return token;
    }
    case "oidc": {
      const client = serviceAuthentication.clients[tenantId];
      if (client === undefined) {
        throw new TerminalEffectError(
          "effect worker has no OIDC client for the invocation tenant"
        );
      }
      const response = await fetch(serviceAuthentication.tokenEndpoint, {
        body: new URLSearchParams({
          client_id: client.clientId,
          client_secret: client.clientSecret,
          grant_type: "client_credentials",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`OIDC token endpoint returned HTTP ${response.status}`);
      }
      const body: unknown = await response.json();
      return tokenResponseSchema.parse(body).access_token;
    }
    default: {
      const exhaustive: never = serviceAuthentication;
      return exhaustive;
    }
  }
}

async function invokeKapso(
  payload: ReminderPayload
): Promise<{ providerOperationId: string; responseDigest: string }> {
  const baseUrl =
    environment.ZOEN_REMINDER_CHANNEL_URL ?? "https://api.kapso.ai";
  const response = await fetch(
    `${baseUrl}/meta/whatsapp/${environment.ZOEN_KAPSO_PHONE_NUMBER_ID}/messages`,
    {
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        text: { body: payload.body, preview_url: false },
        to: payload.channel.to,
        type: "text",
      }),
      headers: {
        "content-type": "application/json",
        "X-API-Key": environment.ZOEN_KAPSO_API_KEY,
      },
      method: "POST",
    }
  );
  const body = new Uint8Array(await response.arrayBuffer());
  const digest = sha256Hex(Buffer.from(body).toString("binary"));
  if (!response.ok) {
    throw new Error(`kapso rejected reminder with HTTP ${response.status}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch (parseError: unknown) {
    throw new Error("kapso response was not JSON", { cause: parseError });
  }
  const parsed = kapsoResponseSchema.parse(value);
  const [message] = parsed.messages;
  if (message === undefined) {
    throw new Error("kapso response carried no message id");
  }
  return { providerOperationId: message.id, responseDigest: digest };
}

async function invokeConnector(
  request: EffectDispatchRequest,
  tenantId: string,
  connectorUrl: string
): Promise<ConnectorOutcome> {
  const credentialRef = environment.ZOEN_CONNECTOR_CREDENTIAL_REFS[tenantId];
  if (credentialRef === undefined) {
    throw new TerminalEffectError(
      "effect worker has no connector credential reference for the invocation tenant"
    );
  }
  let response: Response;
  try {
    response = await fetch(connectorUrl, {
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
      `connector rejected effect request with HTTP ${response.status}`
    );
  }

  const body = new Uint8Array(await response.arrayBuffer());
  const responseDigestValue = sha256Hex(Buffer.from(body).toString("binary"));
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
  const { cause } = error;
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseStringMap(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(value);
  return stringMapSchema.parse(parsed);
}

function parseOidcClientMap(
  value: string
): z.infer<typeof oidcClientMapSchema> {
  const parsed: unknown = JSON.parse(value);
  return oidcClientMapSchema.parse(parsed);
}

export const registry = setup({ use: { zoenEffect } });

const rivetClient = createRivetClient<typeof registry>(
  environment.RIVET_ENDPOINT
);

async function handleSchedule(
  request: IncomingMessage,
  response: ServerResponse,
  body: Buffer
): Promise<void> {
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || key.length === 0) {
    response.writeHead(400).end();
    return;
  }
  const input = dispatchInputSchema.parse(JSON.parse(body.toString("utf8")));
  const handle = rivetClient.zoenEffect.getOrCreate([key]);
  await handle.send("execute", input);
  response
    .writeHead(202, { "content-type": "application/json" })
    .end(JSON.stringify({ actorKey: key }));
}

const ingest = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/schedule") {
    response.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    handleSchedule(request, response, Buffer.concat(chunks)).catch(
      (error: unknown) => {
        console.error("schedule ingest failed", error);
        response.writeHead(500).end();
      }
    );
  });
});

ingest.listen(environment.ZOEN_EFFECT_WORKER_PORT);
registry.startEnvoy();
