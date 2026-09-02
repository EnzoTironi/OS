import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join, relative } from "node:path";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  createClient,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { deployApp } from "@rivet-dev/dynamic-apps";
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
import { digestAppFiles } from "../../shared/app-files-digest";

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
    ZOEN_MEMBERSHIP_DISK_ROOT: z
      .string()
      .min(1)
      .default("/data/eve/workbench-disks"),
    ZOEN_REMINDER_CHANNEL_URL: z.url().optional(),
    ZOEN_WORKSHOP_PUBLIC_ORIGIN: z.url().optional(),
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

const TRAILING_SLASHES = /\/+$/;
const BUILD_DIAGNOSTICS_MESSAGE = /error TS|diagnostics|tsc/i;

const workshopPayloadSchema = z
  .object({
    channel: z
      .object({
        kind: z.literal("whatsapp"),
        to: z.string().min(1),
      })
      .strict()
      .optional(),
    executorClass: z.literal("workshop_deploy_app"),
    filesDigest: digestSchema,
    membershipId: z.string().min(1),
    schemaVersion: z.literal(1),
    slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
    summary: z.string().min(1),
  })
  .strict();

type ConnectorOutcome = z.infer<typeof connectorOutcomeSchema>;
type ReminderPayload = z.infer<typeof reminderPayloadSchema>;
type WorkshopPayload = z.infer<typeof workshopPayloadSchema>;
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
  | { kind: "reminder"; payload: ReminderPayload }
  | { kind: "workshop"; payload: WorkshopPayload };

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
      if (payloadClass.kind === "workshop") {
        await runWorkshopEffect(
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
    run: async () => invokeKapso(payload.channel.to, payload.body),
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
        // The engine requires the evidence idempotency key to equal the
        // request idempotency key minted at commit time (effect.rs:
        // "evidence idempotency key does not match the request").
        idempotencyKey: claim.idempotencyKey,
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

async function runWorkshopEffect(
  loopCtx: LoopContext,
  client: ReturnType<typeof effectClient>,
  command: DispatchInput,
  adapterExecutionId: string,
  payload: WorkshopPayload
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
  // Deploy errors that can never succeed without new files (digest drift,
  // TypeScript diagnostics) are terminal: they record DEFINITELY_NOT_SENT with
  // the cause in providerOperationId instead of burning step retries. The
  // repair loop (agent fixes the files on a later turn) is out of scope here.
  const deploy = await loopCtx.step({
    maxRetries: 3,
    name: "deploy workshop app",
    retryBackoffBase: 500,
    retryBackoffMax: 5000,
    retryOnTimeout: true,
    run: async () => deployWorkshopApp(payload),
    timeout: 300_000,
  });
  if (deploy.kind === "not_deployed") {
    await loopCtx.step("record effect attempt", async () => {
      await client.recordAttempt({
        attempt: {
          attemptId: claim.attemptId,
          observedAt: timestampFromDate(new Date()),
          outcome: EffectAttemptOutcome.DEFINITELY_NOT_SENT,
          providerOperationId: deploy.providerOperationId,
          reason: EffectAttemptReason.VALIDATION_FAILED,
          responseDigest: deploy.responseDigest,
        },
        effectRequestId: claim.effectRequestId,
      });
      return "recorded";
    });
    await markDone(loopCtx);
    return;
  }
  await loopCtx.step("record effect attempt", async () => {
    await client.recordAttempt({
      attempt: {
        attemptId: claim.attemptId,
        observedAt: timestampFromDate(new Date()),
        outcome: EffectAttemptOutcome.ACCEPTED_PENDING,
        providerOperationId: deploy.providerOperationId,
        reason: EffectAttemptReason.UNSPECIFIED,
        responseDigest: deploy.responseDigest,
      },
      effectRequestId: claim.effectRequestId,
    });
    return "recorded";
  });
  await loopCtx.step("reconcile confirmed", async () => {
    await effectClient(command.tenantId, reconcilerBearerToken).reconcile({
      effectRequestId: claim.effectRequestId,
      evidence: {
        evidenceDigest: sha256Hex(
          `${claim.effectRequestId}.confirmed.workshop`
        ),
        evidenceId: `evidence.workshop.${claim.effectRequestId}`,
        // The engine requires the evidence idempotency key to equal the
        // request idempotency key minted at commit time (effect.rs:
        // "evidence idempotency key does not match the request").
        idempotencyKey: claim.idempotencyKey,
        observedAt: timestampFromDate(new Date()),
        outcome: EffectEvidenceOutcome.CONFIRMED,
        providerOperationId: deploy.providerOperationId,
        sourceId: "workshop",
        sourceRef: deploy.providerOperationId,
      },
    });
    return "reconciled";
  });
  // Channel step: the mint includes `channel` only when the committing context
  // carried a WhatsApp subject (crates/zoen-engine/src/workshop.rs). Without
  // it the deploy is still confirmed and the person simply is not messaged.
  // A Kapso failure here must not un-confirm the deploy: log and move on.
  const { channel } = payload;
  if (channel !== undefined) {
    const origin = environment.ZOEN_WORKSHOP_PUBLIC_ORIGIN;
    if (origin === undefined) {
      console.error(
        `workshop app ${payload.slug} deployed but ZOEN_WORKSHOP_PUBLIC_ORIGIN is unset; skipping chat notification`
      );
    } else {
      const url = `${origin.replace(TRAILING_SLASHES, "")}/apps/${payload.membershipId}/${payload.slug}`;
      await loopCtx.step("notify channel", async () => {
        try {
          await invokeKapso(channel.to, `tá no ar: ${url}`);
          return "notified";
        } catch (error: unknown) {
          console.error("workshop channel notification failed", error);
          return "notification_failed";
        }
      });
    }
  }
  await markDone(loopCtx);
}

type WorkshopDeployResult =
  | {
      kind: "deployed";
      providerOperationId: string;
      responseDigest: string;
    }
  | {
      kind: "not_deployed";
      providerOperationId: string;
      responseDigest: string;
    };

async function deployWorkshopApp(
  payload: WorkshopPayload
): Promise<WorkshopDeployResult> {
  const root = join(
    environment.ZOEN_MEMBERSHIP_DISK_ROOT,
    payload.membershipId,
    "workspace",
    "apps",
    payload.slug
  );
  const files = await readAppFiles(root);
  if (files === null || Object.keys(files).length === 0) {
    return terminalWorkshopFailure("workshop.apps_directory_missing");
  }
  const entries = Object.entries(files).map(([path, text]) => ({
    path,
    text,
  }));
  // The isolate owns the disk: without this check the commit approves X and
  // the deploy would read Y.
  const actualDigest = digestAppFiles(entries);
  console.error(
    `workshop deploy digest ${actualDigest === payload.filesDigest ? "matches" : "MISMATCHES"} committed digest for ${payload.slug}`
  );
  if (actualDigest !== payload.filesDigest) {
    return terminalWorkshopFailure("workshop.files_changed_after_commit");
  }
  const appId = sanitizeAppId(`${payload.membershipId}-${payload.slug}`);
  let deployment: Awaited<ReturnType<typeof deployApp>>;
  try {
    // Build engine-side through the stable dynamicAppsApp actor. The local
    // AgentOs build VM cannot write its packed artifact to the host-dir
    // mount from inside the guest (the runtime denies guest writes to host
    // mounts on Linux: tar pack fails with EPERM), while the engine-side
    // builder bundles with esbuild-wasm and publishes into the same release
    // store the serving side reads. The workshop service hosts that actor
    // on the dedicated dynamic-apps envoy pool (see dynamicAppsDeployClient).
    deployment = await deployApp(
      { appId, files },
      { client: dynamicAppsDeployClient }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Build diagnostics (broken generated TypeScript) are terminal; anything
    // else may be transient and deserves the step's retry policy.
    if (BUILD_DIAGNOSTICS_MESSAGE.test(message)) {
      return terminalWorkshopFailure("workshop.build_failed", message);
    }
    throw error;
  }
  // ProviderOperationId must be a parse-safe identifier (alphanumerics plus
  // dot/underscore/dash, leading letter): colons and at-signs are rejected by
  // the engine when the attempt is recorded.
  const operationId = `workshop.deploy.${deployment.appId}.${deployment.release}`;
  return {
    kind: "deployed",
    providerOperationId: operationId,
    responseDigest: sha256Hex(operationId),
  };
}

function terminalWorkshopFailure(
  cause: string,
  detail = ""
): WorkshopDeployResult {
  console.error(
    `workshop deploy terminal failure ${cause}${detail.length > 0 ? `: ${detail}` : ""}`
  );
  return {
    kind: "not_deployed",
    providerOperationId: cause,
    responseDigest: sha256Hex(`${cause}:${detail}`),
  };
}

async function readAppFiles(
  root: string
): Promise<Record<string, string> | null> {
  const files: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          files[relative(root, full).split("\\").join("/")] = await readFile(
            full,
            "utf8"
          );
        }
      })
    );
  }
  try {
    await walk(root);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return files;
}

function sanitizeAppId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
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
  const workshop = workshopPayloadSchema.safeParse(parsed);
  if (workshop.success) {
    return { kind: "workshop", payload: workshop.data };
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
    request.header.set(
      "authorization",
      `Bearer ${await bearerToken(tenantId)}`
    );
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

function reconcilerBearerToken(tenantId: string): Promise<string> {
  const token = reconcilerTokens?.[tenantId];
  return token === undefined
    ? serviceBearerToken(tenantId)
    : Promise.resolve(token);
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
  to: string,
  body: string
): Promise<{ providerOperationId: string; responseDigest: string }> {
  const baseUrl =
    environment.ZOEN_REMINDER_CHANNEL_URL ?? "https://api.kapso.ai";
  const response = await fetch(
    `${baseUrl}/meta/whatsapp/${environment.ZOEN_KAPSO_PHONE_NUMBER_ID}/messages`,
    {
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        text: { body, preview_url: false },
        to,
        type: "text",
      }),
      headers: {
        "content-type": "application/json",
        "X-API-Key": environment.ZOEN_KAPSO_API_KEY,
      },
      method: "POST",
    }
  );
  const responseBytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256Hex(Buffer.from(responseBytes).toString("binary"));
  if (!response.ok) {
    throw new Error(`kapso rejected reminder with HTTP ${response.status}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(responseBytes));
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

export const registry = setup({
  shutdown: { disableSignalHandlers: true },
  use: { zoenEffect },
});

const rivetClient = createRivetClient<typeof registry>(
  environment.RIVET_ENDPOINT
);

// The workshop service hosts the dynamicAppsApp actor (the dynamic-apps
// private apps registry, builder included) on a dedicated envoy pool.
// Engine allocation is pool-wide and not factory-aware, so the deploy RPC
// must pin this pool or the actor can be scheduled onto this worker's
// zoenEffect envoy, which has no factory for it (actor_stopped_before_ready).
// deployApp's client option is structural ({ dynamicAppsApp: { get?,
// getOrCreate } }); the RivetKit client resolves any actor group through its
// proxy, so the client is cast to the shape dynamic-apps expects.
const dynamicAppsDeployClient = createRivetClient({
  endpoint: environment.RIVET_ENDPOINT,
  poolName: "dynamic-apps",
}) as unknown as {
  dynamicAppsApp: {
    get?: (key: string | string[]) => {
      deploy: (input: unknown) => Promise<never>;
    };
    getOrCreate: (key: string | string[]) => {
      deploy: (input: unknown) => Promise<never>;
    };
  };
};

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

// The host owns signal policy: drain the Rivet registry gracefully, then exit
// 0 so supervisors (and the e2e harness) observe a clean shutdown instead of
// a re-raised signal or a wrapper-propagated exit code.
let shutdownStarted = false;
const shutdown = () => {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  const forceExit = setTimeout(() => process.exit(0), 10_000);
  ingest.close();
  registry
    .shutdown()
    .catch(() => undefined)
    .finally(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
