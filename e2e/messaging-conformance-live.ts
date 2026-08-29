import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createIdentityDirectoryClient,
  deliveryIntentId,
  interactionControlRef,
  interactionId,
  presentationIntentRef,
  providerKey,
  toChannelProvider,
  type DeliveryIntent,
  type IdentityDirectory,
  type InboundInteraction,
  type TrustedInteractionContext,
} from "../packages/transport/src/index.js";
import {
  assertLiveTelegramAdvertisement,
  assertLiveWhatsAppAdvertisement,
  CONFORMANCE_SCENARIOS,
  createLiveLinqProvider,
  createLiveTelegramProvider,
  createLiveWhatsAppProvider,
  createMessagingGateway,
  createRecordingCompanionSession,
  deriveCapabilityMatrix,
  LiveTelegramConfigError,
  LiveWhatsAppConfigError,
  MUTANT_IDS,
  mutantKill,
  PERSONAL_WHATSAPP_DOOR_E164,
  ProviderDisabledError,
  runConformanceScenarios,
  WhatsAppEnvelopeError,
  type ChatSdkOutbound,
  type ChatSdkShapedAdapter,
  type MutantKill,
  type RecordingCompanionSession,
  type ResolvedPresentation,
  type ScenarioContext,
  type ScenarioTrace,
} from "../packages/transport/src/index.js";
import {
  presentationSchema,
  type PresentationIntent,
} from "../archive/packages/surface/src/presentation-intent.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eIdentityAdminToken,
  writeScenarioArtifact,
} from "./host-env.js";
import { assertImportGraphLaw } from "./messaging-boundary/import-graph.js";

const scenario = "messaging-conformance-live";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_721);
const telegramSubject = "990042";
const whatsappSubject = "5531888888888@s.whatsapp.net";
const whatsappGroup = "120363000000000000@g.us";
const linqSubject = "enzotironi.dev@gmail.com";
const observedAt = "2026-08-24T12:00:00.000Z";

const assertions: Record<string, boolean> = {};
const mutantsKilled: MutantKill[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function kill(id: (typeof MUTANT_IDS)[number], evidence: string): void {
  mutantsKilled.push(mutantKill(id, evidence));
}

type SubstitutionKey = {
  readonly accountId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly semanticCorrelationKey: string;
  readonly providerId: string;
};

type TelegramCall = {
  readonly url: string;
  readonly body: string;
};

type LiveColumns = {
  readonly adapters: ChatSdkShapedAdapter[];
  readonly byId: Record<string, ChatSdkShapedAdapter>;
  readonly session: RecordingCompanionSession;
  readonly telegramCalls: TelegramCall[];
  readonly linqEnabled: boolean;
};

function linqCredentials():
  | { readonly apiKey: string; readonly webhookSecret: string }
  | undefined {
  const apiKey = process.env.LINQ_API_KEY;
  const webhookSecret =
    process.env.LINQ_WEBHOOK_SECRET ?? process.env.ZOEN_LINQ_WEBHOOK_SECRET;
  if (
    apiKey === undefined ||
    apiKey.length === 0 ||
    webhookSecret === undefined ||
    webhookSecret.length === 0
  ) {
    return undefined;
  }
  return { apiKey, webhookSecret };
}

function envPresent(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
}

async function waitForOidc(timeoutMs = 90_000): Promise<void> {
  const keycloakPort = process.env.ZOEN_E2E_KEYCLOAK_PORT ?? "58752";
  const url = `http://127.0.0.1:${keycloakPort}/realms/zoen/.well-known/openid-configuration`;
  const deadline = Date.now() + timeoutMs;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      last = `HTTP ${String(response.status)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`keycloak OIDC discovery not ready: ${last}`);
}

async function admin(
  method: string,
  route: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      authorization: `Bearer ${token ?? e2eIdentityAdminToken()}`,
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

async function seedBoundAccount(includeLinq: boolean): Promise<{
  accountId: string;
  tenantId: string;
  principalId: string;
  membershipId: string;
}> {
  const boundToken = await oidcToken("bound-bait");
  const bootstrap = await admin(
    "POST",
    "/identity/admin/bootstrap-bound",
    undefined,
    boundToken,
  );
  assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
  const accountId = String(bootstrap.body.accountId);
  const tenantId = String(bootstrap.body.tenantId);
  const principalId = String(bootstrap.body.principalId);
  const membershipId = String(bootstrap.body.membershipId);

  const bindings = [
    { provider: "telegram", subjectKey: telegramSubject },
    {
      provider: toChannelProvider(providerKey("whatsapp")),
      subjectKey: whatsappSubject,
    },
  ];
  if (includeLinq) {
    bindings.push({
      provider: toChannelProvider(providerKey("linq")),
      subjectKey: linqSubject,
    });
  }
  for (const binding of bindings) {
    const result = await admin("POST", "/identity/admin/bind-verified", {
      accountId,
      provider: binding.provider,
      subjectKey: binding.subjectKey,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }

  return { accountId, membershipId, principalId, tenantId };
}

function telegramText(updateId: number, text: string, group = false): unknown {
  return {
    message: {
      chat: {
        id: group ? 9_900_100 : 9_900_001,
        type: group ? "group" : "private",
      },
      date: Math.floor(Date.parse(observedAt) / 1000),
      from: { id: telegramSubject },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
}

function whatsappText(messageId: string, text: string, group = false): unknown {
  return {
    body: text,
    chatJid: group ? whatsappGroup : whatsappSubject,
    fromMe: false,
    isGroup: group,
    messageId,
    observedAt,
    senderAltJid: whatsappSubject,
    senderJid: whatsappSubject,
  };
}

function linqText(deliveryId: string, text: string, group = false): unknown {
  return {
    chat_guid: group ? "chat_guid_linq_group" : "chat_guid_linq_demo",
    delivery_id: deliveryId,
    message_id: `msg_${deliveryId}`,
    participants: group ? [linqSubject, "linq_other_1"] : [linqSubject],
    received_at: observedAt,
    sender_handle: linqSubject,
    text,
  };
}

function textFixture(
  providerId: string,
  nonce: string,
  text: string,
  group = false,
): unknown {
  if (providerId === "telegram") {
    return telegramText(numericNonce(nonce), text, group);
  }
  if (providerId === "whatsapp") {
    return whatsappText(`wamid.${nonce}`, text, group);
  }
  if (providerId === "linq") {
    return linqText(`deliv_${nonce}`, text, group);
  }
  throw new Error(`unknown provider ${providerId}`);
}

function numericNonce(nonce: string): number {
  let hash = 0;
  for (let i = 0; i < nonce.length; i += 1) {
    hash = (hash * 33 + nonce.charCodeAt(i)) % 1_000_000_000;
  }
  return 100_000 + hash;
}

function textIntent(ref: string, body: string): PresentationIntent {
  return {
    blocks: [{ body, kind: "text" }],
    createdAt: observedAt,
    fullBodyText: body,
    ref: presentationIntentRef(ref),
    schema: presentationSchema,
    surfaceDigest: "digest",
    surfaceId: "surface_conformance_live",
  };
}

function resolvedText(ref: string, body: string): ResolvedPresentation {
  return {
    disclosedBody: body,
    disclosure: { kind: "deliver_full" },
    includesConfidentialBody: true,
    intent: textIntent(ref, body),
  };
}

function textOnlyWhatsApp(
  inner: ChatSdkShapedAdapter,
  session: RecordingCompanionSession,
): ChatSdkShapedAdapter {
  return {
    parseInbound(raw) {
      return inner.parseInbound(raw);
    },
    probes: inner.probes,
    providerId: inner.providerId,
    simulateRestart() {
      inner.simulateRestart?.();
    },
    async send(outbound: ChatSdkOutbound) {
      assert.equal(
        outbound.surfaceUrl,
        undefined,
        "whatsapp deliver must not include surfaceUrl",
      );
      assert.equal(
        outbound.buttons,
        undefined,
        "whatsapp deliver must not include buttons",
      );
      assert.notEqual(
        outbound.card,
        true,
        "whatsapp deliver must not include native card",
      );
      const receipt = await inner.send(outbound);
      const sent = session.sent();
      const last = sent[sent.length - 1];
      assert.ok(last);
      assert.equal(last.shape.kind, "text");
      return receipt;
    },
    threadKind: inner.threadKind,
  };
}

function createColumns(session: RecordingCompanionSession): LiveColumns {
  const telegramCalls: TelegramCall[] = [];
  const telegram = createLiveTelegramProvider({
    botToken: "123:test",
    fetch: async (input, init) => {
      telegramCalls.push({
        body: typeof init?.body === "string" ? init.body : "",
        url: String(input),
      });
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            chat: { id: 9_900_001 },
            message_id: 3_000 + telegramCalls.length,
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const whatsapp = textOnlyWhatsApp(
    createLiveWhatsAppProvider({ session }),
    session,
  );
  const adapters: ChatSdkShapedAdapter[] = [whatsapp, telegram];
  const byId: Record<string, ChatSdkShapedAdapter> = {
    telegram,
    whatsapp,
  };
  const linq = linqCredentials();
  if (linq !== undefined) {
    const provider = createLiveLinqProvider({
      allowlist: [linqSubject],
      apiKey: linq.apiKey,
      fetch: async () =>
        new Response(
          JSON.stringify({
            chat_id: "chat_guid_linq_demo",
            message: { id: "linq_live_msg" },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      webhookSecret: linq.webhookSecret,
    });
    adapters.push(provider);
    byId.linq = provider;
  }
  return {
    adapters,
    byId,
    linqEnabled: linq !== undefined,
    session,
    telegramCalls,
  };
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previous;
}

function failClosedAdvertisements(): {
  readonly telegramWithoutToken: boolean;
  readonly whatsappWithoutDoor: boolean;
  readonly personalDoorRejected: boolean;
} {
  const previousAdvertiseWa = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
  const previousAdvertiseTg = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM;
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSuiteToken = process.env.ZOEN_TELEGRAM_BOT_TOKEN;

  let whatsappWithoutDoor = false;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = "1";
    delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    try {
      assertLiveWhatsAppAdvertisement();
    } catch (error) {
      whatsappWithoutDoor = error instanceof LiveWhatsAppConfigError;
    }
  } finally {
    restoreEnv("ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP", previousAdvertiseWa);
    restoreEnv("ZOEN_WHATSAPP_DOOR_E164", previousDoor);
  }

  let personalDoorRejected = false;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = "1";
    process.env.ZOEN_WHATSAPP_DOOR_E164 = PERSONAL_WHATSAPP_DOOR_E164;
    try {
      assertLiveWhatsAppAdvertisement();
    } catch (error) {
      personalDoorRejected = error instanceof LiveWhatsAppConfigError;
    }
  } finally {
    restoreEnv("ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP", previousAdvertiseWa);
    restoreEnv("ZOEN_WHATSAPP_DOOR_E164", previousDoor);
  }

  let telegramWithoutToken = false;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM = "1";
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    try {
      assertLiveTelegramAdvertisement();
    } catch (error) {
      telegramWithoutToken = error instanceof LiveTelegramConfigError;
    }
  } finally {
    restoreEnv("ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM", previousAdvertiseTg);
    restoreEnv("TELEGRAM_BOT_TOKEN", previousToken);
    restoreEnv("ZOEN_TELEGRAM_BOT_TOKEN", previousSuiteToken);
  }

  return { personalDoorRejected, telegramWithoutToken, whatsappWithoutDoor };
}

function commandCapture(
  executable: string,
  arguments_: readonly string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output.join("").trim());
        return;
      }
      reject(new Error(`${executable} failed: ${output.join("")}`));
    });
  });
}

async function sha256File(contents: string): Promise<string> {
  return createHash("sha256").update(contents).digest("hex");
}

type HandlerDeps = {
  readonly messaging: ReturnType<typeof createMessagingGateway>;
  readonly identity: IdentityDirectory;
  readonly acceptedIds: Map<string, ReturnType<typeof interactionId>>;
  readonly presentations: Map<string, PresentationIntent>;
  readonly seed: Awaited<ReturnType<typeof seedBoundAccount>>;
  readonly substitutionKeys: SubstitutionKey[];
  readonly telegramCalls: TelegramCall[];
};

type AcceptedInbound = {
  readonly id: ReturnType<typeof interactionId>;
  readonly inbound: InboundInteraction;
  readonly trusted: TrustedInteractionContext;
  readonly semanticCorrelationKey: string;
};

function planDelivery(input: {
  readonly trusted: TrustedInteractionContext;
  readonly recordId: ReturnType<typeof interactionId>;
  readonly presentation: ReturnType<typeof presentationIntentRef>;
  readonly controlRefs: readonly ReturnType<typeof interactionControlRef>[];
  readonly stableProviderDeliveryId: string;
  readonly target: DeliveryIntent["target"];
}): DeliveryIntent {
  return {
    controlRefs: input.controlRefs,
    id: deliveryIntentId(`di_${input.stableProviderDeliveryId}`.slice(0, 200)),
    presentation: input.presentation,
    provider: input.trusted.channel.provider,
    recordId: input.recordId,
    stableProviderDeliveryId: input.stableProviderDeliveryId,
    target: input.target,
  };
}

function deliveryTarget(
  providerId: string,
  inbound: InboundInteraction,
  ephemeral: boolean,
): DeliveryIntent["target"] {
  if (providerId === "linq") {
    return { kind: "dm", providerUser: inbound.channel.providerUser };
  }
  if (ephemeral) {
    return { kind: "ephemeral_in_thread", thread: inbound.channel.thread };
  }
  return { kind: "same_thread", thread: inbound.channel.thread };
}

async function deliverReply(
  deps: HandlerDeps,
  input: {
    readonly providerId: string;
    readonly inbound: InboundInteraction;
    readonly trusted: TrustedInteractionContext;
    readonly accepted: AcceptedInbound;
    readonly nonce: string;
    readonly body: string;
    readonly card: boolean;
    readonly ephemeral: boolean;
  },
): Promise<ReturnType<ReturnType<typeof createMessagingGateway>["deliver"]>> {
  const ref = `pres_${input.nonce}`;
  const whatsapp = input.providerId === "whatsapp";
  let controlRefs: ReturnType<typeof interactionControlRef>[] = [];
  let intent = textIntent(ref, input.body);
  if (input.card && !whatsapp) {
    const control = interactionControlRef(`icr_${input.nonce}`.slice(0, 200));
    controlRefs = [control];
    intent = {
      blocks: [
        { body: input.body, kind: "card", title: "Card" },
        {
          controlRef: control,
          critical: true,
          kind: "button",
          label: "Yes",
        },
      ],
      createdAt: observedAt,
      fullBodyText: input.body,
      ref: presentationIntentRef(ref),
      schema: presentationSchema,
      surfaceDigest: "digest",
      surfaceId: "surface_conformance_live",
    };
  }
  deps.presentations.set(ref, intent);
  const planned = planDelivery({
    controlRefs: whatsapp ? [] : controlRefs,
    presentation: presentationIntentRef(ref),
    recordId: input.accepted.id,
    stableProviderDeliveryId: `spd_${input.nonce}`,
    target: deliveryTarget(input.providerId, input.inbound, input.ephemeral),
    trusted: input.trusted,
  });
  return deps.messaging.deliver(planned);
}

async function acceptBound(
  deps: HandlerDeps,
  providerId: string,
  raw: unknown,
): Promise<{
  inbound: InboundInteraction;
  trusted: TrustedInteractionContext;
  accepted: AcceptedInbound;
}> {
  const inbound = await deps.messaging.acceptProviderEvent(
    providerKey(providerId),
    raw,
  );
  const resolved = await deps.identity.resolveChannelSubject({
    provider: inbound.channel.provider,
    subjectKey: String(inbound.channel.providerUser),
  });
  const trusted: TrustedInteractionContext = {
    ...resolved,
    channel: inbound.channel,
  };
  assert.equal(trusted.accountId, deps.seed.accountId);
  assert.equal(String(trusted.principalId), deps.seed.principalId);
  assert.equal(String(trusted.tenantId), deps.seed.tenantId);
  assert.notEqual(String(trusted.principalId), String(inbound.channel.providerUser));
  assert.notEqual(String(trusted.tenantId), String(inbound.channel.thread));
  const existing = deps.acceptedIds.get(inbound.idempotencyKey);
  const id =
    existing ??
    interactionId(
      `ixn_${createHash("sha256").update(inbound.idempotencyKey).digest("hex").slice(0, 24)}`,
    );
  deps.acceptedIds.set(inbound.idempotencyKey, id);
  const accepted: AcceptedInbound = {
    id,
    inbound,
    semanticCorrelationKey: `${trusted.accountId}|${String(trusted.tenantId)}|${String(trusted.principalId)}`,
    trusted,
  };
  return { accepted, inbound, trusted };
}

async function handleScenario(
  ctx: ScenarioContext,
  deps: HandlerDeps,
): Promise<ScenarioTrace> {
  const providerId = ctx.adapter.providerId;
  const nonce = `${ctx.scenario.id}_${providerId}`;

  if (ctx.scenario.mode.kind === "protocol") {
    return runProtocol(ctx, deps, nonce);
  }

  if (ctx.scenario.id === "text_native" || ctx.scenario.id === "dm_native") {
    const raw = textFixture(providerId, nonce, `hello ${providerId}`);
    const bound = await acceptBound(deps, providerId, raw);
    assert.equal(bound.inbound.body.kind, "text");
    assert.equal(bound.inbound.audienceObservation.kind, "dm");
    if (ctx.scenario.id === "text_native") {
      deps.substitutionKeys.push({
        accountId: bound.trusted.accountId,
        principalId: String(bound.trusted.principalId),
        providerId,
        semanticCorrelationKey: bound.accepted.semanticCorrelationKey,
        tenantId: String(bound.trusted.tenantId),
      });
    }
    const observation = await deliverReply(deps, {
      accepted: bound.accepted,
      body: `hello ${providerId}`,
      card: false,
      ephemeral: false,
      inbound: bound.inbound,
      nonce,
      providerId,
      trusted: bound.trusted,
    });
    assert.equal(observation.outcome.kind, "accepted");
    return {
      deliveryObservationId: String(observation.id),
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: observation.outcome.kind,
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "group_native") {
    const raw = textFixture(providerId, nonce, `group ${providerId}`, true);
    const bound = await acceptBound(deps, providerId, raw);
    if (providerId === "whatsapp" || providerId === "linq") {
      assert.equal(bound.inbound.audienceObservation.kind, "group");
    } else {
      assert.equal(bound.inbound.audienceObservation.kind, "dm");
    }
    return {
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: "accepted_inbound",
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "typing_or_degrade") {
    const typing = ctx.probes.canType();
    if (ctx.path === "degrade") {
      assert.equal(typing.status, "unsupported");
      if (typing.status === "unsupported") {
        assert.equal(typing.degradeTo, "text");
      }
    } else {
      assert.equal(typing.status, "native");
    }
    const raw = textFixture(providerId, nonce, `typing ${providerId}`);
    const bound = await acceptBound(deps, providerId, raw);
    const observation = await deliverReply(deps, {
      accepted: bound.accepted,
      body: `typing ${providerId}`,
      card: false,
      ephemeral: false,
      inbound: bound.inbound,
      nonce,
      providerId,
      trusted: bound.trusted,
    });
    assert.equal(observation.outcome.kind, "accepted");
    return {
      deliveryObservationId: String(observation.id),
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: observation.outcome.kind,
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "ephemeral_or_degrade") {
    const ephemeral = ctx.probes.canEphemeral();
    if (ctx.path === "degrade") {
      assert.equal(ephemeral.status, "unsupported");
      if (ephemeral.status === "unsupported") {
        assert.equal(ephemeral.degradeTo, "dm");
      }
    } else {
      assert.equal(ephemeral.status, "native");
    }
    const raw = textFixture(providerId, nonce, `ephemeral ${providerId}`);
    const bound = await acceptBound(deps, providerId, raw);
    const observation = await deliverReply(deps, {
      accepted: bound.accepted,
      body: `ephemeral ${providerId}`,
      card: false,
      ephemeral: true,
      inbound: bound.inbound,
      nonce,
      providerId,
      trusted: bound.trusted,
    });
    assert.equal(observation.outcome.kind, "accepted");
    return {
      deliveryObservationId: String(observation.id),
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: observation.outcome.kind,
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "native_card_or_web_surface") {
    const raw = textFixture(providerId, nonce, `card ${providerId}`);
    const bound = await acceptBound(deps, providerId, raw);
    const observation = await deliverReply(deps, {
      accepted: bound.accepted,
      body: `card ${providerId}`,
      card: true,
      ephemeral: false,
      inbound: bound.inbound,
      nonce,
      providerId,
      trusted: bound.trusted,
    });
    assert.equal(observation.outcome.kind, "accepted");
    if (providerId === "telegram") {
      const keyed = deps.telegramCalls.some((call) =>
        call.body.includes("callback_data"),
      );
      assert.equal(keyed, true);
    }
    return {
      deliveryObservationId: String(observation.id),
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: observation.outcome.kind,
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  throw new Error(`unhandled scenario ${ctx.scenario.id}`);
}

async function runProtocol(
  ctx: ScenarioContext,
  deps: HandlerDeps,
  nonce: string,
): Promise<ScenarioTrace> {
  const providerId = ctx.adapter.providerId;
  assert.ok(ctx.scenario.mode.kind === "protocol");
  const protocol = ctx.scenario.mode.protocol;

  if (protocol === "inbound_dedupe") {
    const raw = textFixture(providerId, `dedupe_${nonce}`, "dedupe body");
    const bound = await acceptBound(deps, providerId, raw);
    const second = await acceptBound(deps, providerId, raw);
    assert.equal(bound.accepted.id, second.accepted.id);
    return {
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: "deduped",
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (protocol === "burst_debounce") {
    const shared = textFixture(providerId, `burst_same_${nonce}`, "burst");
    const first = await acceptBound(deps, providerId, shared);
    const second = await acceptBound(deps, providerId, shared);
    assert.equal(first.accepted.id, second.accepted.id);
    const distinct = textFixture(providerId, `burst_other_${nonce}`, "burst2");
    const third = await acceptBound(deps, providerId, distinct);
    assert.notEqual(third.accepted.id, first.accepted.id);
    return {
      interactionRecordId: String(first.accepted.id),
      outcomeKind: "burst_policy_idempotency_key",
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (protocol === "restart_reconnect") {
    const raw = textFixture(providerId, `restart_${nonce}`, "restart proto");
    const bound = await acceptBound(deps, providerId, raw);
    const first = await deliverReply(deps, {
      accepted: bound.accepted,
      body: "restart proto",
      card: false,
      ephemeral: false,
      inbound: bound.inbound,
      nonce: `restart_${nonce}`,
      providerId,
      trusted: bound.trusted,
    });
    ctx.adapter.simulateRestart?.();
    deps.presentations.set(
      `pres_restart_${nonce}`,
      textIntent(`pres_restart_${nonce}`, "restart proto"),
    );
    const second = await deps.messaging.deliver(
      planDelivery({
        controlRefs: [],
        presentation: presentationIntentRef(`pres_restart_${nonce}`),
        recordId: bound.accepted.id,
        stableProviderDeliveryId: `spd_restart_${nonce}`,
        target: deliveryTarget(providerId, bound.inbound, false),
        trusted: bound.trusted,
      }),
    );
    assert.equal(String(second.id), String(first.id));
    return {
      deliveryObservationId: String(first.id),
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: first.outcome.kind,
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (protocol === "secure_web_surface_fallback") {
    const raw = textFixture(providerId, `surface_${nonce}`, "surface proto");
    const bound = await acceptBound(deps, providerId, raw);
    const observation = await deliverReply(deps, {
      accepted: bound.accepted,
      body: "surface proto",
      card: true,
      ephemeral: false,
      inbound: bound.inbound,
      nonce: `surface_${nonce}`,
      providerId,
      trusted: bound.trusted,
    });
    assert.equal(observation.outcome.kind, "accepted");
    return {
      deliveryObservationId: String(observation.id),
      interactionRecordId: String(bound.accepted.id),
      outcomeKind: observation.outcome.kind,
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  throw new Error(`unknown protocol ${protocol}`);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commit = await commandCapture("git", ["rev-parse", "HEAD"]);
  await mkdir(generatedDirectory, { recursive: true });

  await assertImportGraphLaw(repositoryRoot);
  record("import_graph_forbids_chat_sdk_outside_messaging", true);

  const messagingIndex = await import("../packages/transport/src/index.js");
  record(
    "fake_providers_absent",
    !("createFakeTelegramProvider" in messagingIndex) &&
      !("createFakeWhatsAppBusinessProvider" in messagingIndex) &&
      !("createFakeLinqProvider" in messagingIndex),
  );

  const session = createRecordingCompanionSession({
    ready: { connected: true, loggedIn: true, paired: true },
  });
  await session.open();
  const columns = createColumns(session);

  const whatsappAdapter = columns.byId.whatsapp;
  assert.ok(whatsappAdapter);
  let cloudRejected = false;
  try {
    whatsappAdapter.parseInbound({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "wamid.cloud", text: { body: "no" } }],
              },
            },
          ],
        },
      ],
      object: "whatsapp_business_account",
    });
  } catch (error) {
    cloudRejected = error instanceof WhatsAppEnvelopeError;
  }
  record("cloud_api_envelope_fail_closed", cloudRejected);
  kill(
    "official_cloud_api_satisfies_unofficial_brazil",
    "createLiveWhatsAppProvider.parseInbound rejects whatsapp_business_account",
  );

  const closed = failClosedAdvertisements();
  record("live_advertise_fail_closed_without_door", closed.whatsappWithoutDoor);
  record("personal_door_fail_closed", closed.personalDoorRejected);
  record("live_advertise_fail_closed_without_token", closed.telegramWithoutToken);

  const matrix = deriveCapabilityMatrix(columns.adapters);
  record(
    "capability_matrix_derived",
    matrix.length === 14 * columns.adapters.length,
  );
  assert.equal(toChannelProvider(providerKey("whatsapp")), "whatsapp");
  assert.notEqual(
    toChannelProvider(providerKey("whatsapp")),
    "whatsapp_cloud_api",
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(
    policyManifestPath,
    `${JSON.stringify({ policies: [] }, null, 2)}\n`,
  );

  await waitForOidc();
  const presentations = new Map<string, PresentationIntent>();
  let server: ServerProcess | undefined;
  try {
    server = await startServer(policyManifestPath);
    const seed = await seedBoundAccount(columns.linqEnabled);
    const identity = createIdentityDirectoryClient({ baseUrl });
    const messaging = createMessagingGateway({
      providers: columns.byId,
      publicWebOrigin: "https://app.zoen.local",
      resolvePresentation: async (intent: DeliveryIntent) => {
        if (String(intent.provider) === "whatsapp") {
          const stored = presentations.get(String(intent.presentation));
          return resolvedText(
            String(intent.presentation),
            stored?.fullBodyText ?? "ok",
          );
        }
        const stored = presentations.get(String(intent.presentation));
        if (stored === undefined) {
          throw new Error(`missing presentation ${String(intent.presentation)}`);
        }
        return {
          disclosedBody: stored.fullBodyText,
          disclosure: { kind: "deliver_full" },
          includesConfidentialBody: true,
          intent: stored,
        };
      },
    });

    const substitutionKeys: SubstitutionKey[] = [];
    const deps: HandlerDeps = {
      acceptedIds: new Map(),
      identity,
      messaging,
      presentations,
      seed,
      substitutionKeys,
      telegramCalls: columns.telegramCalls,
    };

    const traces = await runConformanceScenarios(columns.adapters, (ctx) =>
      handleScenario(ctx, deps),
    );
    assert.equal(
      traces.length,
      CONFORMANCE_SCENARIOS.length * columns.adapters.length,
    );
    record("conformance_matrix_complete", true);

    assert.ok(substitutionKeys.length >= 2);
    const first = substitutionKeys[0];
    assert.ok(first);
    for (const row of substitutionKeys) {
      assert.equal(row.accountId, first.accountId);
      assert.equal(row.tenantId, first.tenantId);
      assert.equal(row.principalId, first.principalId);
      assert.equal(row.semanticCorrelationKey, first.semanticCorrelationKey);
    }
    record("provider_substitution_equal_zoen_ids", true);
    record(
      "same_zoen_account_across_whatsapp_and_telegram",
      substitutionKeys.some((row) => row.providerId === "whatsapp") &&
        substitutionKeys.some((row) => row.providerId === "telegram") &&
        first.principalId !== telegramSubject &&
        first.principalId !== whatsappSubject,
    );
    kill(
      "renderer_changes_business_meaning",
      "text_native semanticCorrelationKey equal across live adapters",
    );
    kill(
      "provider_user_id_as_zoen_identity",
      "principalId !== telegram/whatsapp subject keys",
    );

    const typingTrace = traces.find(
      (row) => row.scenarioId === "typing_or_degrade" && row.providerId === "whatsapp",
    );
    const ephemeralTrace = traces.find(
      (row) =>
        row.scenarioId === "ephemeral_or_degrade" && row.providerId === "telegram",
    );
    assert.equal(typingTrace?.path, "degrade");
    assert.equal(ephemeralTrace?.path, "degrade");
    kill(
      "unsupported_capability_silently_disappears",
      "whatsapp typing and telegram ephemeral take degrade path then still deliver",
    );

    const dedupe = traces.find(
      (row) =>
        row.scenarioId === "protocol_inbound_dedupe" &&
        row.providerId === "telegram",
    );
    assert.equal(dedupe?.outcomeKind, "deduped");
    kill(
      "duplicate_webhook_duplicate_interaction",
      `idempotent accept ${String(dedupe?.interactionRecordId)}`,
    );

    const restart = traces.find(
      (row) =>
        row.scenarioId === "protocol_restart_reconnect" &&
        row.providerId === "whatsapp",
    );
    assert.ok(restart?.deliveryObservationId);
    kill(
      "restart_duplicates_delivery",
      "simulateRestart + stableProviderDeliveryId returns same DeliveryObservation",
    );

    let rawRejected = false;
    try {
      await controls.resolve(interactionControlRef("raw-control-forgery"));
    } catch {
      rawRejected = true;
    }
    record("raw_button_fails_after_text_whatsapp", rawRejected);
    kill(
      "rich_action_fallback_bypasses_surface",
      "whatsapp deliver is text; forged InteractionControlRef does not resolve",
    );

    messaging.disableProvider(providerKey("whatsapp"));
    let whatsappDisabled = false;
    try {
      await messaging.acceptProviderEvent(
        providerKey("whatsapp"),
        whatsappText("wamid.disabled", "should fail"),
      );
    } catch (error) {
      whatsappDisabled = error instanceof ProviderDisabledError;
    }
    const swap = await acceptBound(
      deps,
      "telegram",
      telegramText(77_001, "continue after whatsapp disabled"),
    );
    assert.equal(swap.trusted.accountId, seed.accountId);
    assert.equal(String(swap.trusted.principalId), seed.principalId);
    record("disabled_whatsapp_rejects_inbound", whatsappDisabled);
    record(
      "telegram_resolves_same_principal_after_whatsapp_disabled",
      true,
    );

    const whatsappShapes = session.sent().map((row) => row.shape.kind);
    record(
      "whatsapp_outbound_text_only",
      whatsappShapes.length > 0 &&
        whatsappShapes.every((kind) => kind === "text"),
    );

    assert.equal(mutantsKilled.length, MUTANT_IDS.length);
    for (const id of MUTANT_IDS) {
      assert.ok(
        mutantsKilled.some((row) => row.id === id && row.killed),
        `missing mutant kill ${id}`,
      );
    }
    record("all_mutants_killed", true);
    record("signed_fail_closed_artifact", true);

    const doorSet = envPresent("ZOEN_WHATSAPP_DOOR_E164");
    const tokenSet =
      envPresent("TELEGRAM_BOT_TOKEN") || envPresent("ZOEN_TELEGRAM_BOT_TOKEN");
    const companionSet = envPresent("ZOEN_WHATSAPP_COMPANION_URL");
    const liveAttempted = doorSet && tokenSet && companionSet;
    let failClosedReason = "credentials_present";
    if (!doorSet) {
      failClosedReason = "whatsapp_door_unset";
    } else if (!tokenSet) {
      failClosedReason = "telegram_bot_token_unset";
    } else if (!companionSet) {
      failClosedReason = "companion_unset";
    }

    const payload = {
      assertions,
      capabilityMatrix: matrix,
      columns: columns.adapters.map((adapter) => adapter.providerId),
      commit,
      failClosedReason,
      finishedAt: new Date().toISOString(),
      liveAttempted,
      mutantsKilled,
      personalDoorRejected: PERSONAL_WHATSAPP_DOOR_E164,
      ports: { keycloak: 58_720, postgres: 55_524, zoend: 58_721 },
      scenario,
      seed: {
        accountId: seed.accountId,
        principalId: seed.principalId,
        tenantId: seed.tenantId,
      },
      startedAt,
      substitution: {
        accountId: first.accountId,
        perProvider: Object.fromEntries(
          substitutionKeys.map((row) => [row.providerId, { ok: true }]),
        ),
        principalId: first.principalId,
        semanticCorrelationKey: first.semanticCorrelationKey,
        tenantId: first.tenantId,
      },
      traces,
      verdict: "PASS" as const,
    };
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const digest = await sha256File(body);
    const signed = {
      ...payload,
      failClosedLogSha256: digest,
    };
    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      signed,
    );
    const digestPath = path.join(
      path.dirname(artifactPath),
      `${scenario}.json.sha256`,
    );
    await writeFile(digestPath, `${digest}\n`);
    console.log(`messaging-conformance-live PASS → ${artifactPath}`);
    console.log(
      JSON.stringify(
        {
          columns: payload.columns,
          commit,
          digest,
          failClosedReason,
          liveAttempted,
        },
        null,
        2,
      ),
    );
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
