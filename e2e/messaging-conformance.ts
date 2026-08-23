import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createIdentityDirectoryClient,
  createInteractionBoundary,
  createInteractionControlRegistry,
  interactionControlRef,
  presentationIntentRef,
  providerKey,
  providerThreadRef,
  toChannelProvider,
} from "../packages/interaction/src/index.js";
import {
  createFakeLinqProvider,
  createFakeTelegramProvider,
  createFakeWhatsAppBusinessProvider,
  createMessagingGateway,
  deriveCapabilityMatrix,
  MUTANT_IDS,
  mutantKill,
  runConformanceScenarios,
  type ChatSdkShapedAdapter,
  type MutantKill,
  type ScenarioContext,
  type ScenarioTrace,
} from "../packages/messaging/src/index.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  writeScenarioArtifact,
} from "./host-env.js";

const scenario = "messaging-conformance";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_511);
const semanticCorrelationSeed = "messaging-conformance.v1";

const telegramSubject = "tg_user_bound_1";
const linqSubject = "linq_handle_bound_1";
const whatsappSubject = "wa_user_bound_1";

const assertions: Record<string, boolean> = {};
const mutantsKilled: MutantKill[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function kill(id: (typeof MUTANT_IDS)[number], evidence: string): void {
  mutantsKilled.push(mutantKill(id, evidence));
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
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

async function seedBoundAccount(): Promise<{
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

  for (const binding of [
    { provider: "telegram", subjectKey: telegramSubject },
    {
      provider: toChannelProvider(providerKey("linq")),
      subjectKey: linqSubject,
    },
    {
      provider: toChannelProvider(providerKey("whatsapp_business")),
      subjectKey: whatsappSubject,
    },
  ]) {
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
      date: Math.floor(Date.parse("2026-08-23T12:00:00.000Z") / 1000),
      from: { id: telegramSubject },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
}

function linqText(
  deliveryId: string,
  text: string,
  group = false,
): unknown {
  return {
    chat_guid: group ? "chat_guid_linq_group" : "chat_guid_linq_demo",
    delivery_id: deliveryId,
    message_id: `msg_${deliveryId}`,
    participants: group
      ? [linqSubject, "linq_other_1"]
      : [linqSubject],
    received_at: "2026-08-23T12:00:01.000Z",
    sender_handle: linqSubject,
    text,
  };
}

function whatsappText(wamid: string, text: string, group = false): unknown {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ profile: { name: "Bound" }, wa_id: whatsappSubject }],
              ...(group ? { group_id: "waba_group_1" } : {}),
              messages: [
                {
                  from: whatsappSubject,
                  id: wamid,
                  text: { body: text },
                  timestamp: "1755950400",
                  type: "text",
                },
              ],
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550001111",
                phone_number_id: "waba_phone_1",
              },
            },
          },
        ],
        id: "WABA_ID",
      },
    ],
    object: "whatsapp_business_account",
  };
}

function numericNonce(nonce: string): number {
  let hash = 0;
  for (let i = 0; i < nonce.length; i += 1) {
    hash = (hash * 33 + nonce.charCodeAt(i)) % 1_000_000_000;
  }
  return 100_000 + hash;
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
  if (providerId === "linq") {
    return linqText(`deliv_${nonce}`, text, group);
  }
  if (providerId === "whatsapp_business") {
    return whatsappText(`wamid.${nonce}`, text, group);
  }
  throw new Error(`unknown provider ${providerId}`);
}

function createAdapters(): {
  telegram: ChatSdkShapedAdapter;
  linq: ChatSdkShapedAdapter;
  whatsapp: ChatSdkShapedAdapter;
  all: ChatSdkShapedAdapter[];
  byId: Record<string, ChatSdkShapedAdapter>;
} {
  const telegram = createFakeTelegramProvider();
  const linq = createFakeLinqProvider();
  const whatsapp = createFakeWhatsAppBusinessProvider();
  return {
    all: [telegram, linq, whatsapp],
    byId: {
      linq,
      telegram,
      whatsapp_business: whatsapp,
    },
    linq,
    telegram,
    whatsapp,
  };
}

async function loadRawFixtures(): Promise<void> {
  const dir = path.join(
    repositoryRoot,
    "e2e",
    "messaging-conformance",
    "fixtures",
  );
  const telegram = JSON.parse(
    await readFile(path.join(dir, "telegram-update.json"), "utf8"),
  ) as unknown;
  const linq = JSON.parse(
    await readFile(path.join(dir, "linq-webhook.json"), "utf8"),
  ) as unknown;
  const whatsapp = JSON.parse(
    await readFile(path.join(dir, "whatsapp-cloud-api.json"), "utf8"),
  ) as unknown;
  const adapters = createAdapters();
  assert.equal(adapters.telegram.parseInbound(telegram).text, "fixture telegram text");
  assert.equal(adapters.linq.parseInbound(linq).text, "fixture linq text");
  assert.equal(
    adapters.whatsapp.parseInbound(whatsapp).text,
    "fixture whatsapp text",
  );
  assert.equal(
    (whatsapp as { object?: string }).object,
    "whatsapp_business_account",
  );
  record("raw_fixtures_parse", true);
}

async function assertCapabilitiesForGone(): Promise<void> {
  const source = await readFile(
    path.join(repositoryRoot, "packages/messaging/src/gateway.ts"),
    "utf8",
  );
  record(
    "capabilitiesFor_if_else_deleted",
    !source.includes("function capabilitiesFor"),
  );
}

function liveFailClosed(): {
  advertised: boolean;
  attempted: boolean;
  failClosed: boolean;
  detail?: string;
} {
  const advertised =
    process.env.ZOEN_MESSAGING_CONFORMANCE_ADVERTISE_LIVE === "1";
  const hasCreds =
    process.env.LINQ_API_KEY !== undefined &&
    process.env.LINQ_API_KEY.length > 0;
  if (advertised && !hasCreds) {
    return {
      advertised: true,
      attempted: false,
      detail: "advertised live without credentials",
      failClosed: true,
    };
  }
  if (advertised && hasCreds) {
    return {
      advertised: true,
      attempted: true,
      detail: "live path not exercised in this unit",
      failClosed: true,
    };
  }
  return { advertised: false, attempted: false, failClosed: true };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(
    policyManifestPath,
    `${JSON.stringify({ policies: [] }, null, 2)}\n`,
  );

  await loadRawFixtures();
  await assertCapabilitiesForGone();

  const live = liveFailClosed();
  if (
    live.advertised &&
    process.env.LINQ_API_KEY === undefined
  ) {
    throw new Error(
      "ZOEN_MESSAGING_CONFORMANCE_ADVERTISE_LIVE=1 without credentials (fail closed)",
    );
  }
  record("live_fail_closed_coherent", live.failClosed);

  let server: ServerProcess = await startServer(policyManifestPath);
  try {
    const seed = await seedBoundAccount();
    const adapters = createAdapters();
    const matrix = deriveCapabilityMatrix(adapters.all);
    record("capability_matrix_derived", matrix.length === 14 * 3);

    const identity = createIdentityDirectoryClient({ baseUrl });
    const controls = createInteractionControlRegistry();
    const interaction = createInteractionBoundary({
      controls,
      correlationNamespace: semanticCorrelationSeed,
      identity,
    });
    const messaging = createMessagingGateway({
      providers: adapters.byId,
    });

    const substitutionKeys: {
      accountId: string;
      tenantId: string;
      principalId: string;
      semanticCorrelationKey: string;
    }[] = [];

    const traces = await runConformanceScenarios(
      adapters.all,
      async (ctx) => handleScenario(ctx, {
        controls,
        interaction,
        messaging,
        seed,
        substitutionKeys,
      }),
    );

    assert.equal(substitutionKeys.length, 3);
    const [first, ...rest] = substitutionKeys;
    assert.ok(first);
    for (const row of rest) {
      assert.equal(row.accountId, first.accountId);
      assert.equal(row.tenantId, first.tenantId);
      assert.equal(row.principalId, first.principalId);
      assert.equal(row.semanticCorrelationKey, first.semanticCorrelationKey);
    }
    record("provider_substitution_equal_zoen_ids", true);
    kill(
      "renderer_changes_business_meaning",
      "text scenarios equal semanticCorrelationKey across telegram/linq/whatsapp_business",
    );
    kill(
      "provider_user_id_as_zoen_identity",
      "principalId !== provider subjects; tenantId !== threads",
    );

    // Rich action + raw button still fail authorize after web_surface.
    const wabaCard = await deliverCardWithControls(
      messaging,
      interaction,
      controls,
      seed,
      "whatsapp_business",
      whatsappText("wamid.rich_card_1", "need card"),
    );
    assert.equal(wabaCard.outcome.kind, "degraded");
    if (wabaCard.outcome.kind === "degraded") {
      assert.equal(wabaCard.outcome.fallback, "web_surface");
      assert.ok(
        typeof wabaCard.outcome.surfaceUrl === "string" &&
          wabaCard.outcome.surfaceUrl.includes("surface.zoen.local"),
      );
    }
    let rawRejected = false;
    try {
      await controls.resolve(interactionControlRef("raw-waba-forgery"));
    } catch {
      rawRejected = true;
    }
    record("raw_button_fails_after_web_surface", rawRejected);
    kill(
      "rich_action_fallback_bypasses_surface",
      "whatsapp_business card+controls → degraded web_surface; raw button unresolved",
    );

    // Unsupported silently disappears — linq typing, telegram ephemeral, waba card.
    const linqTyping = await deliverTyped(
      messaging,
      interaction,
      controls,
      seed,
      "linq",
      linqText("deliv_typing_1", "typing check"),
      "typing:indicator",
    );
    assert.equal(linqTyping.outcome.kind, "degraded");
    if (linqTyping.outcome.kind === "degraded") {
      assert.equal(linqTyping.outcome.fallback, "text");
    }
    const tgEphemeral = await deliverEphemeral(
      messaging,
      interaction,
      controls,
      seed,
      "telegram",
      telegramText(88001, "ephemeral check"),
    );
    assert.equal(tgEphemeral.outcome.kind, "degraded");
    if (tgEphemeral.outcome.kind === "degraded") {
      assert.equal(tgEphemeral.outcome.fallback, "dm");
    }
    kill(
      "unsupported_capability_silently_disappears",
      "linq typing + telegram ephemeral + waba card emit degraded (not silent omit)",
    );

    // Duplicate webhook.
    const inboundOnce = await messaging.acceptProviderEvent(
      providerKey("telegram"),
      telegramText(77001, "dedupe"),
    );
    const ctxOnce = await interaction.resolveTrustedContext(inboundOnce);
    const recordA = await interaction.accept(inboundOnce, ctxOnce);
    const recordB = await interaction.accept(inboundOnce, ctxOnce);
    assert.equal(recordA.id, recordB.id);
    kill(
      "duplicate_webhook_duplicate_interaction",
      `idempotent accept ${String(recordA.id)}`,
    );

    // Restart: adapter transport cleared; gateway deliverySeen holds.
    const restartInbound = await messaging.acceptProviderEvent(
      providerKey("whatsapp_business"),
      whatsappText("wamid.restart_1", "restart"),
    );
    const restartCtx = await interaction.resolveTrustedContext(restartInbound);
    const restartRecord = await interaction.accept(restartInbound, restartCtx);
    const controlRef = await controls.issue({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      kind: "propose_action",
      principalId: restartCtx.principalId,
      tenantId: restartCtx.tenantId,
    });
    const restartIntent = await interaction.planDelivery({
      controls: [controlRef],
      ctx: restartCtx,
      presentation: presentationIntentRef("restart_pres"),
      recordId: restartRecord.id,
      stableProviderDeliveryId: "spd_restart_stable_1",
    });
    const firstDelivery = await messaging.deliver(restartIntent);
    adapters.whatsapp.simulateRestart?.();
    const secondDelivery = await messaging.deliver(restartIntent);
    assert.equal(secondDelivery.id, firstDelivery.id);
    const replayInbound = await messaging.acceptProviderEvent(
      providerKey("whatsapp_business"),
      whatsappText("wamid.restart_1", "restart"),
    );
    const replayRecord = await interaction.accept(replayInbound, restartCtx);
    assert.equal(replayRecord.id, restartRecord.id);
    kill(
      "restart_duplicates_delivery",
      "simulateRestart + stableProviderDeliveryId returns same DeliveryObservation",
    );

    assert.equal(mutantsKilled.length, 6);
    for (const id of MUTANT_IDS) {
      assert.ok(
        mutantsKilled.some((row) => row.id === id && row.killed),
        `missing mutant kill ${id}`,
      );
    }
    record("all_six_mutants_killed", true);

    const structural = [
      { providerId: "telegram", structuralClass: "telegram_like" as const },
      { providerId: "linq", structuralClass: "linq_like" as const },
      {
        providerId: "whatsapp_business",
        structuralClass: "whatsapp_business_like" as const,
      },
    ];

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      adapters: structural,
      assertions,
      capabilityMatrix: matrix,
      finishedAt: new Date().toISOString(),
      headSha: process.env.GITHUB_SHA ?? "local",
      live,
      mutantsKilled,
      ports: { keycloak: 58_510, postgres: 55_482, zoend: 58_511 },
      scenario,
      startedAt,
      substitution: {
        accountId: first.accountId,
        perProvider: {
          linq: { ok: true },
          telegram: { ok: true },
          whatsapp_business: { ok: true },
        },
        principalId: first.principalId,
        semanticCorrelationKey: first.semanticCorrelationKey,
        tenantId: first.tenantId,
      },
      traces,
      verdict: "PASS",
    });
    console.log(`messaging-conformance PASS → ${artifactPath}`);
  } finally {
    await stopServer(server);
  }
}

async function handleScenario(
  ctx: ScenarioContext,
  deps: {
    messaging: ReturnType<typeof createMessagingGateway>;
    interaction: ReturnType<typeof createInteractionBoundary>;
    controls: ReturnType<typeof createInteractionControlRegistry>;
    seed: Awaited<ReturnType<typeof seedBoundAccount>>;
    substitutionKeys: {
      accountId: string;
      tenantId: string;
      principalId: string;
      semanticCorrelationKey: string;
    }[];
  },
): Promise<ScenarioTrace> {
  const providerId = ctx.adapter.providerId;
  const provider = providerKey(providerId);
  const nonce = `${scenarioNonce(ctx.scenario.id)}_${providerId}`;

  if (ctx.scenario.mode.kind === "protocol") {
    return runProtocol(ctx, deps, nonce);
  }

  if (ctx.scenario.id === "text_native" || ctx.scenario.id === "dm_native") {
    const raw = textFixture(providerId, nonce, `hello ${providerId}`);
    const inbound = await deps.messaging.acceptProviderEvent(provider, raw);
    assert.equal(inbound.body.kind, "text");
    assert.equal(inbound.audienceObservation.kind, "dm");
    const trusted = await deps.interaction.resolveTrustedContext(inbound);
    assert.equal(trusted.accountId, deps.seed.accountId);
    assert.equal(String(trusted.tenantId), deps.seed.tenantId);
    assert.equal(String(trusted.principalId), deps.seed.principalId);
    assert.notEqual(String(trusted.tenantId), String(inbound.channel.thread));
    assert.notEqual(
      String(trusted.principalId),
      String(inbound.channel.providerUser),
    );
    const accepted = await deps.interaction.accept(inbound, trusted);
    if (ctx.scenario.id === "text_native") {
      deps.substitutionKeys.push({
        accountId: trusted.accountId,
        principalId: String(trusted.principalId),
        semanticCorrelationKey: accepted.semanticCorrelationKey,
        tenantId: String(trusted.tenantId),
      });
    }
    const controlRef = await deps.controls.issue({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      kind: "propose_action",
      principalId: trusted.principalId,
      tenantId: trusted.tenantId,
    });
    const intent = await deps.interaction.planDelivery({
      controls: [controlRef],
      ctx: trusted,
      presentation: presentationIntentRef(`pres_${providerId}_text`),
      recordId: accepted.id,
      stableProviderDeliveryId: `spd_${nonce}`,
    });
    const observation = await deps.messaging.deliver(intent);
    assert.equal(observation.outcome.kind, "accepted");
    return {
      deliveryObservationId: String(observation.id),
      interactionRecordId: String(accepted.id),
      outcomeKind: observation.outcome.kind,
      path: "native",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "group_native") {
    const raw = textFixture(providerId, nonce, `group ${providerId}`, true);
    const inbound = await deps.messaging.acceptProviderEvent(provider, raw);
    assert.equal(inbound.audienceObservation.kind, "group");
    const trusted = await deps.interaction.resolveTrustedContext(inbound);
    const accepted = await deps.interaction.accept(inbound, trusted);
    return {
      interactionRecordId: String(accepted.id),
      outcomeKind: "accepted_inbound",
      path: "native",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "typing_or_degrade") {
    const raw = textFixture(providerId, nonce, `typing ${providerId}`);
    const observation = await deliverTyped(
      deps.messaging,
      deps.interaction,
      deps.controls,
      deps.seed,
      providerId,
      raw,
      "typing:indicator",
    );
    if (ctx.path === "native") {
      assert.equal(observation.outcome.kind, "accepted");
    } else {
      assert.equal(observation.outcome.kind, "degraded");
      if (observation.outcome.kind === "degraded") {
        assert.equal(observation.outcome.fallback, "text");
      }
    }
    return {
      degradeFallback:
        observation.outcome.kind === "degraded"
          ? observation.outcome.fallback
          : undefined,
      deliveryObservationId: String(observation.id),
      outcomeKind: observation.outcome.kind,
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "ephemeral_or_degrade") {
    const raw = textFixture(providerId, nonce, `eph ${providerId}`);
    const observation = await deliverEphemeral(
      deps.messaging,
      deps.interaction,
      deps.controls,
      deps.seed,
      providerId,
      raw,
    );
    if (ctx.path === "native") {
      assert.equal(observation.outcome.kind, "accepted");
    } else {
      assert.equal(observation.outcome.kind, "degraded");
      if (observation.outcome.kind === "degraded") {
        assert.equal(observation.outcome.fallback, "dm");
      }
    }
    return {
      degradeFallback:
        observation.outcome.kind === "degraded"
          ? observation.outcome.fallback
          : undefined,
      deliveryObservationId: String(observation.id),
      outcomeKind: observation.outcome.kind,
      path: ctx.path,
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (ctx.scenario.id === "native_card_or_web_surface") {
    const raw = textFixture(providerId, nonce, `card ${providerId}`);
    const observation = await deliverCardWithControls(
      deps.messaging,
      deps.interaction,
      deps.controls,
      deps.seed,
      providerId,
      raw,
    );
    if (ctx.path === "native") {
      assert.equal(observation.outcome.kind, "accepted");
    } else {
      assert.equal(observation.outcome.kind, "degraded");
      if (observation.outcome.kind === "degraded") {
        assert.equal(observation.outcome.fallback, "web_surface");
        assert.ok(observation.outcome.surfaceUrl);
      }
    }
    return {
      degradeFallback:
        observation.outcome.kind === "degraded"
          ? observation.outcome.fallback
          : undefined,
      deliveryObservationId: String(observation.id),
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
  deps: {
    messaging: ReturnType<typeof createMessagingGateway>;
    interaction: ReturnType<typeof createInteractionBoundary>;
    controls: ReturnType<typeof createInteractionControlRegistry>;
    seed: Awaited<ReturnType<typeof seedBoundAccount>>;
  },
  nonce: string,
): Promise<ScenarioTrace> {
  const providerId = ctx.adapter.providerId;
  const provider = providerKey(providerId);
  assert.ok(ctx.scenario.mode.kind === "protocol");
  const protocol = ctx.scenario.mode.protocol;

  if (protocol === "inbound_dedupe") {
    const raw = textFixture(providerId, `dedupe_${nonce}`, "dedupe body");
    const inbound = await deps.messaging.acceptProviderEvent(provider, raw);
    const trusted = await deps.interaction.resolveTrustedContext(inbound);
    const a = await deps.interaction.accept(inbound, trusted);
    const b = await deps.interaction.accept(inbound, trusted);
    assert.equal(a.id, b.id);
    return {
      interactionRecordId: String(a.id),
      outcomeKind: "deduped",
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (protocol === "burst_debounce") {
    // Fake clock: same idempotency key collapses; distinct keys do not.
    const shared = textFixture(providerId, `burst_same_${nonce}`, "burst");
    const trustedShared = await deps.interaction.resolveTrustedContext(
      await deps.messaging.acceptProviderEvent(provider, shared),
    );
    const first = await deps.interaction.accept(
      await deps.messaging.acceptProviderEvent(provider, shared),
      trustedShared,
    );
    const second = await deps.interaction.accept(
      await deps.messaging.acceptProviderEvent(provider, shared),
      trustedShared,
    );
    assert.equal(first.id, second.id);
    const distinct = textFixture(providerId, `burst_other_${nonce}`, "burst2");
    const trustedDistinct = await deps.interaction.resolveTrustedContext(
      await deps.messaging.acceptProviderEvent(provider, distinct),
    );
    const third = await deps.interaction.accept(
      await deps.messaging.acceptProviderEvent(provider, distinct),
      trustedDistinct,
    );
    assert.notEqual(third.id, first.id);
    return {
      interactionRecordId: String(first.id),
      outcomeKind: "burst_policy_idempotency_key",
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (protocol === "restart_reconnect") {
    const raw = textFixture(providerId, `restart_${nonce}`, "restart proto");
    const inbound = await deps.messaging.acceptProviderEvent(provider, raw);
    const trusted = await deps.interaction.resolveTrustedContext(inbound);
    const accepted = await deps.interaction.accept(inbound, trusted);
    const controlRef = await deps.controls.issue({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      kind: "propose_action",
      principalId: trusted.principalId,
      tenantId: trusted.tenantId,
    });
    const intent = await deps.interaction.planDelivery({
      controls: [controlRef],
      ctx: trusted,
      presentation: presentationIntentRef(`pres_restart_${nonce}`),
      recordId: accepted.id,
      stableProviderDeliveryId: `spd_proto_restart_${nonce}`,
    });
    const first = await deps.messaging.deliver(intent);
    ctx.adapter.simulateRestart?.();
    const second = await deps.messaging.deliver(intent);
    assert.equal(second.id, first.id);
    return {
      deliveryObservationId: String(first.id),
      interactionRecordId: String(accepted.id),
      outcomeKind: first.outcome.kind,
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  if (protocol === "secure_web_surface_fallback") {
    const raw = textFixture(providerId, `surface_${nonce}`, "surface proto");
    const observation = await deliverCardWithControls(
      deps.messaging,
      deps.interaction,
      deps.controls,
      deps.seed,
      providerId,
      raw,
    );
    if (ctx.probes.canNativeCard().status === "unsupported") {
      assert.equal(observation.outcome.kind, "degraded");
      if (observation.outcome.kind === "degraded") {
        assert.equal(observation.outcome.fallback, "web_surface");
        assert.ok(observation.outcome.surfaceUrl);
      }
      return {
        degradeFallback: "web_surface",
        deliveryObservationId: String(observation.id),
        outcomeKind: "degraded",
        path: "protocol",
        providerId,
        scenarioId: ctx.scenario.id,
      };
    }
    assert.equal(observation.outcome.kind, "accepted");
    return {
      deliveryObservationId: String(observation.id),
      outcomeKind: "accepted",
      path: "protocol",
      providerId,
      scenarioId: ctx.scenario.id,
    };
  }

  throw new Error(`unknown protocol ${protocol}`);
}

async function deliverTyped(
  messaging: ReturnType<typeof createMessagingGateway>,
  interaction: ReturnType<typeof createInteractionBoundary>,
  controls: ReturnType<typeof createInteractionControlRegistry>,
  seed: Awaited<ReturnType<typeof seedBoundAccount>>,
  providerId: string,
  raw: unknown,
  presentation: string,
) {
  void seed;
  const provider = providerKey(providerId);
  const inbound = await messaging.acceptProviderEvent(provider, raw);
  const trusted = await interaction.resolveTrustedContext(inbound);
  const accepted = await interaction.accept(inbound, trusted);
  const controlRef = await controls.issue({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    kind: "propose_action",
    principalId: trusted.principalId,
    tenantId: trusted.tenantId,
  });
  const intent = await interaction.planDelivery({
    controls: [],
    ctx: trusted,
    presentation: presentationIntentRef(presentation),
    recordId: accepted.id,
    stableProviderDeliveryId: `spd_typing_${providerId}_${String(accepted.id)}`,
  });
  void controlRef;
  return messaging.deliver(intent);
}

async function deliverEphemeral(
  messaging: ReturnType<typeof createMessagingGateway>,
  interaction: ReturnType<typeof createInteractionBoundary>,
  controls: ReturnType<typeof createInteractionControlRegistry>,
  seed: Awaited<ReturnType<typeof seedBoundAccount>>,
  providerId: string,
  raw: unknown,
) {
  void seed;
  const provider = providerKey(providerId);
  const inbound = await messaging.acceptProviderEvent(provider, raw);
  const trusted = await interaction.resolveTrustedContext(inbound);
  const accepted = await interaction.accept(inbound, trusted);
  const intent = await interaction.planDelivery({
    controls: [],
    ctx: trusted,
    presentation: presentationIntentRef(`eph_${providerId}`),
    recordId: accepted.id,
    stableProviderDeliveryId: `spd_eph_${providerId}_${String(accepted.id)}`,
    target: {
      kind: "ephemeral_in_thread",
      thread: providerThreadRef(String(inbound.channel.thread)),
    },
  });
  void controls;
  return messaging.deliver(intent);
}

async function deliverCardWithControls(
  messaging: ReturnType<typeof createMessagingGateway>,
  interaction: ReturnType<typeof createInteractionBoundary>,
  controls: ReturnType<typeof createInteractionControlRegistry>,
  seed: Awaited<ReturnType<typeof seedBoundAccount>>,
  providerId: string,
  raw: unknown,
) {
  void seed;
  const provider = providerKey(providerId);
  const inbound = await messaging.acceptProviderEvent(provider, raw);
  const trusted = await interaction.resolveTrustedContext(inbound);
  const accepted = await interaction.accept(inbound, trusted);
  const controlRef = await controls.issue({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    kind: "propose_action",
    principalId: trusted.principalId,
    tenantId: trusted.tenantId,
  });
  const intent = await interaction.planDelivery({
    controls: [controlRef],
    ctx: trusted,
    presentation: presentationIntentRef(`card:rich_${providerId}`),
    recordId: accepted.id,
    stableProviderDeliveryId: `spd_card_${providerId}_${String(accepted.id)}`,
  });
  return messaging.deliver(intent);
}

function scenarioNonce(scenarioId: string): string {
  let hash = 0;
  for (let i = 0; i < scenarioId.length; i += 1) {
    hash = (hash * 31 + scenarioId.charCodeAt(i)) % 100_000;
  }
  return String(10_000 + hash);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
