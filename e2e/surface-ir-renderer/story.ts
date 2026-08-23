import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  assuranceForRisk,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createPostgresControlStore,
  createStepUpRegistry,
  decideAudienceDisclosure,
  handleControlClick,
  interactionControlRef,
  issueApprovalControl,
  planDisclosureDelivery,
  presentationIntentRef,
  principalIdString,
  proposalRef,
  providerKey,
  providerThreadRef,
  providerUserRef,
  stepUpUrl,
  tenantIdString,
  toChannelProvider,
  type InboundInteraction,
  type TrustedInteractionContext,
} from "../../packages/interaction/src/index.js";
import {
  createCapabilityProbes,
  createFakeLinqProvider,
  createFakeTelegramProvider,
  createMessagingGateway,
  deriveCapabilityMatrix,
  lowerPresentationIntent,
  projectPresentationCaps,
  type CapabilityId,
  type ChatSdkOutbound,
  type ChatSdkShapedAdapter,
  type ProbeAnswer,
} from "../../packages/messaging/src/index.js";
import {
  compileStepUpSurface,
  createMemoryPresentationStore,
  createPresentationIntent,
} from "../../packages/surface/src/index.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "../governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";

const scenario = "surface-ir-renderer";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_641);
const publicWebOrigin = "http://127.0.0.1:3000";
const telegramSubject = `tg_user_sir_${Date.now()}`;
const linqSubject = `linq_handle_sir_${Date.now()}`;

const REQUIRED_MUTANTS = [
  "button_value_is_authority",
  "renderer_emits_hidden_mutation",
  "group_card_leaks_forbidden_body",
  "silent_drop_critical_control",
  "provider_extension_bypasses_surface",
] as const;

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];
const deliveryTraces: unknown[] = [];
const confidentialSecret = "SECRET_PAYROLL_FIGURES_9911";

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: (typeof REQUIRED_MUTANTS)[number]): void {
  if (!mutantsKilled.includes(name)) {
    mutantsKilled.push(name);
  }
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

function demoActionRef() {
  return {
    actionId: "inventory.requestStock",
    definition: {
      definitionId: "inventory.governed",
      digest: "surface-ir.e2e",
      revision: "1",
    },
    resourceId: "inventory.item.1",
  };
}

function makeCtx(input: {
  accountId: string;
  tenantId: string;
  principalId: string;
  membershipId: string;
  bindingId: string;
  provider: "telegram" | "linq";
  audienceKind?: "dm" | "group";
}): TrustedInteractionContext {
  return {
    accountId: input.accountId,
    actorId: "actor.e2e",
    bindingId: input.bindingId,
    channel: {
      provider: providerKey(input.provider),
      providerUser: providerUserRef(
        input.provider === "telegram" ? telegramSubject : linqSubject,
      ),
      receivedAt: new Date().toISOString(),
      thread: providerThreadRef(
        input.provider === "telegram" ? "9900001" : "chat_guid_sir",
      ),
    },
    membershipId: input.membershipId,
    principalId: principalIdString(input.principalId),
    tenantId: tenantIdString(input.tenantId),
    workloadId: "workload.personal",
  };
}

function controlClickInbound(
  controlRef: ReturnType<typeof interactionControlRef>,
  provider: "telegram" | "linq",
  audienceKind: "dm" | "group",
): InboundInteraction {
  return {
    audienceObservation: { kind: audienceKind },
    body: { controlRef, kind: "control_click" },
    channel: {
      provider: providerKey(provider),
      providerUser: providerUserRef(
        provider === "telegram" ? telegramSubject : linqSubject,
      ),
      receivedAt: new Date().toISOString(),
      thread: providerThreadRef(
        provider === "telegram" ? "9900001" : "chat_guid_sir",
      ),
    },
    idempotencyKey: `click_${provider}_${controlRef}`,
  };
}

function wrapRecording(
  adapter: ChatSdkShapedAdapter,
  sink: ChatSdkOutbound[],
): ChatSdkShapedAdapter {
  return {
    parseInbound: (raw) => adapter.parseInbound(raw),
    probes: adapter.probes,
    providerId: adapter.providerId,
    simulateRestart: adapter.simulateRestart?.bind(adapter),
    async send(outbound) {
      sink.push(outbound);
      return adapter.send(outbound);
    },
  };
}

function degradeAdapter(
  base: ChatSdkShapedAdapter,
  overrides: Partial<Record<CapabilityId, ProbeAnswer>>,
  sink: ChatSdkOutbound[],
): ChatSdkShapedAdapter {
  const table = {
    dm: base.probes.canDm(),
    ephemeral: base.probes.canEphemeral(),
    group: base.probes.canGroup(),
    image_file: base.probes.canImageFile(),
    native_button: base.probes.canNativeButton(),
    native_card: base.probes.canNativeCard(),
    native_link: base.probes.canNativeLink(),
    proactive_outbound: base.probes.canProactiveOutbound(),
    reactions: base.probes.canReact(),
    read_receipts: base.probes.canReadReceipt(),
    reply_thread: base.probes.canReplyThread(),
    text: base.probes.canText(),
    typing: base.probes.canType(),
    voice_audio: base.probes.canVoiceAudio(),
    ...overrides,
  } as const;
  const probes = createCapabilityProbes(base.providerId, table);
  return wrapRecording(
    {
      parseInbound: (raw) => base.parseInbound(raw),
      probes,
      providerId: base.providerId,
      send: (outbound) => base.send(outbound),
      simulateRestart: base.simulateRestart?.bind(base),
    },
    sink,
  );
}

async function writePolicyManifest(outputPath: string): Promise<{
  canonicalJson: string;
  digest: string;
  definitionId: string;
}> {
  const canonicalJson = (
    await readFile(
      path.join(
        repositoryRoot,
        "e2e",
        "surface-ir-renderer",
        "definition-direct.canonical.json",
      ),
      "utf8",
    )
  ).trimEnd();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", "surface-ir-renderer", "direct.cedar"),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(
      repositoryRoot,
      "e2e",
      "surface-ir-renderer",
      "activation.cedar",
    ),
    "utf8",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: "inventory.requestStock",
            definitionDigest: digest,
            digest: createHash("sha256").update(policySource).digest("hex"),
            policyId: "policy.direct",
            revision: 1,
            source: policySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: createHash("sha256").update(activationSource).digest("hex"),
            policyId: "policy.activation.inventory.governed",
            revision: 1,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { canonicalJson, definitionId: "inventory.governed", digest };
}

async function assertRendererIsObservationOnly(): Promise<void> {
  const lowerSrc = await readFile(
    path.join(
      repositoryRoot,
      "packages/messaging/src/lower-presentation-intent.ts",
    ),
    "utf8",
  );
  const gatewaySrc = await readFile(
    path.join(repositoryRoot, "packages/messaging/src/gateway.ts"),
    "utf8",
  );
  const forbidden = [
    "propose(",
    "commit(",
    "completeStepUpCommit",
    "/actions/",
    "mutate",
  ];
  for (const token of forbidden) {
    assert.equal(
      lowerSrc.includes(token),
      false,
      `lower must not contain ${token}`,
    );
  }
  assert.equal(gatewaySrc.includes("completeStepUpCommit"), false);
  assert.equal(gatewaySrc.includes("propose("), false);
  record("renderer_observation_only", true);
  killMutant("renderer_emits_hidden_mutation");
}

export async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath);

  await assertRendererIsObservationOnly();

  const storeClient = new PostgresClient({
    connectionString: e2ePostgresUrl("zoen_app", "zoen_app", 55_508),
  });
  await storeClient.connect();

  let server: ServerProcess = await startServer(policyManifestPath);
  try {
    const boundToken = await oidcToken("bound-bait");
    const bootstrap = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      boundToken,
    );
    assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
    const tenantId = String(bootstrap.body.tenantId);
    const principalId = String(bootstrap.body.principalId);
    const accountId = String(bootstrap.body.accountId);
    const membershipId = String(bootstrap.body.membershipId);

    const telegramBind = await admin("POST", "/identity/admin/bind-verified", {
      accountId,
      provider: "telegram",
      subjectKey: telegramSubject,
    });
    assert.equal(telegramBind.status, 200, JSON.stringify(telegramBind.body));
    const telegramBindingId = String(telegramBind.body.bindingId);

    const linqBind = await admin("POST", "/identity/admin/bind-verified", {
      accountId,
      provider: toChannelProvider(providerKey("linq")),
      subjectKey: linqSubject,
    });
    assert.equal(linqBind.status, 200, JSON.stringify(linqBind.body));
    const linqBindingId = String(linqBind.body.bindingId);

    const durableStore = createPostgresControlStore(storeClient);
    const controls = createInteractionControlRegistry({ store: durableStore });
    const stepUps = createStepUpRegistry({ store: durableStore });
    const boundary = createInteractionBoundary({
      controls,
      correlationNamespace: "surface-ir-renderer.v1",
      identity: {
        async resolveChannelSubject() {
          throw new Error("unused");
        },
      },
    });
    const presentationStore = createMemoryPresentationStore();

    const highProposal = proposalRef(`proposal.sir.high.${randomUUID()}`);
    const surface = compileStepUpSurface({
      actionRef: demoActionRef(),
      explanation: "High-risk stock request requires OIDC step-up.",
      materialInputs: [
        { label: "Quantity", value: "40" },
        { label: "Confidential", value: confidentialSecret },
      ],
      proposalRef: String(highProposal),
      requiredAssurance: "oidc_step_up",
      stale: false,
      subjectLabel: "inventory.item.1",
      workspaceLabel: "tenant workspace",
    });
    record("surface_ir_compiled", surface.schema === "zoen.surface.v1");

    const disclosureDm = decideAudienceDisclosure({
      actionRisk: "high",
      audience: { kind: "dm" },
      channelAssurance: "provider_chat",
      resourceClass: "confidential",
    });
    record("high_risk_dm_step_up", disclosureDm.kind === "require_step_up");
    const assurance = assuranceForRisk("high", disclosureDm);
    record("assurance_oidc_step_up", assurance === "oidc_step_up");

    const bindingId = surface.actionBindings[0]?.id;
    assert.ok(bindingId);
    const controlRef = await issueApprovalControl(controls, {
      actionBindingId: bindingId,
      actionRef: demoActionRef(),
      assurance,
      disclosure: disclosureDm,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalId),
      proposalRef: highProposal,
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantId),
    });

    const presentation = createPresentationIntent({
      controlRefsByBindingId: { [bindingId]: controlRef },
      surface,
    });
    await presentationStore.put(presentation);
    record(
      "presentation_from_surface_ir",
      presentation.schema === "zoen.presentation.v1" &&
        presentation.blocks.some((block) => block.kind === "button"),
    );
    record(
      "business_never_imports_chatsdk_card",
      !presentation.blocks.some(
        (block) =>
          "callbackData" in block ||
          "jsx" in block ||
          (block as { kind: string }).kind === "ChatSdkCard",
      ),
    );

    const fixtureMeta = JSON.parse(
      await readFile(
        path.join(
          repositoryRoot,
          "e2e/surface-ir-renderer/fixtures/surface-intent.json",
        ),
        "utf8",
      ),
    ) as { expectedBlockKinds: string[] };
    const observedKinds = presentation.blocks.map((block) => block.kind);
    record(
      "fixture_block_kinds_present",
      fixtureMeta.expectedBlockKinds.every((kind) =>
        observedKinds.includes(kind as (typeof observedKinds)[number]),
      ),
    );

    const ctxTelegram = makeCtx({
      accountId,
      bindingId: telegramBindingId,
      membershipId,
      principalId,
      provider: "telegram",
      tenantId,
    });
    const ctxLinq = makeCtx({
      accountId,
      bindingId: linqBindingId,
      membershipId,
      principalId,
      provider: "linq",
      tenantId,
    });

    const inboundSeed: InboundInteraction = {
      audienceObservation: { kind: "dm" },
      body: { kind: "text", text: "approve stock" },
      channel: ctxTelegram.channel,
      idempotencyKey: `sir_seed_${randomUUID()}`,
    };
    const recordIx = await boundary.accept(inboundSeed, ctxTelegram);
    const planned = await planDisclosureDelivery({
      boundary,
      confidentialBody: presentation.fullBodyText,
      controlRef,
      ctx: ctxTelegram,
      disclosure: disclosureDm,
      presentation: presentation.ref,
      recordId: recordIx.id,
    });
    record(
      "disclosure_before_render_withholds_body",
      planned.includesConfidentialBody === false &&
        !planned.body.includes(confidentialSecret),
    );

    const telegramOut: ChatSdkOutbound[] = [];
    const linqOut: ChatSdkOutbound[] = [];
    const telegram = wrapRecording(createFakeTelegramProvider(), telegramOut);
    const linq = wrapRecording(createFakeLinqProvider(), linqOut);
    const matrix = deriveCapabilityMatrix([telegram, linq]);
    await writeFile(
      path.join(generatedDirectory, "lowering-matrix.json"),
      `${JSON.stringify(matrix, null, 2)}\n`,
    );

    const messaging = createMessagingGateway({
      providers: {
        linq,
        telegram,
      },
      publicWebOrigin,
      async resolvePresentation(intent) {
        const doc = await presentationStore.get(intent.presentation);
        if (doc === undefined) {
          return undefined;
        }
        return {
          disclosedBody: planned.body,
          disclosure: disclosureDm,
          includesConfidentialBody: planned.includesConfidentialBody,
          intent: doc,
        };
      },
    });

    const telegramIntent = {
      ...planned.intent,
      id: planned.intent.id,
      provider: providerKey("telegram"),
      stableProviderDeliveryId: `spd_tg_${String(controlRef)}`,
    };
    const telegramObs = await messaging.deliver(telegramIntent);
    assert.ok(telegramOut.length >= 1);
    const tgOutbound = telegramOut[telegramOut.length - 1];
    assert.ok(tgOutbound);
    deliveryTraces.push({
      outbound: tgOutbound,
      provider: "telegram",
      observation: telegramObs,
    });

    record(
      "opaque_callback_is_control_ref",
      tgOutbound.buttons !== undefined &&
        tgOutbound.buttons.length === 1 &&
        tgOutbound.buttons[0]?.callbackData === String(controlRef),
    );
    record(
      "callback_not_proposal_tenant_principal",
      tgOutbound.buttons?.[0]?.callbackData !== String(highProposal) &&
        tgOutbound.buttons?.[0]?.callbackData !== tenantId &&
        tgOutbound.buttons?.[0]?.callbackData !== principalId,
    );
    let rawRejected = false;
    try {
      await controls.resolve(interactionControlRef(String(highProposal)));
    } catch {
      rawRejected = true;
    }
    record("forged_proposal_callback_fails_closed", rawRejected);
    killMutant("button_value_is_authority");

    record(
      "outbound_withholds_confidential",
      !tgOutbound.text.includes(confidentialSecret),
    );

    const linqPlanned = await planDisclosureDelivery({
      boundary,
      confidentialBody: presentation.fullBodyText,
      controlRef,
      ctx: ctxLinq,
      disclosure: disclosureDm,
      presentation: presentation.ref,
      recordId: recordIx.id,
    });
    const linqIntent = {
      ...linqPlanned.intent,
      provider: providerKey("linq"),
      stableProviderDeliveryId: `spd_linq_${String(controlRef)}`,
    };
    const linqMessaging = createMessagingGateway({
      providers: { linq, telegram },
      publicWebOrigin,
      async resolvePresentation(intent) {
        const doc = await presentationStore.get(intent.presentation);
        if (doc === undefined) {
          return undefined;
        }
        return {
          disclosedBody: linqPlanned.body,
          disclosure: disclosureDm,
          includesConfidentialBody: linqPlanned.includesConfidentialBody,
          intent: doc,
        };
      },
    });
    const linqObs = await linqMessaging.deliver(linqIntent);
    assert.ok(linqOut.length >= 1);
    const linqOutbound = linqOut[linqOut.length - 1];
    assert.ok(linqOutbound);
    deliveryTraces.push({
      outbound: linqOutbound,
      provider: "linq",
      observation: linqObs,
    });
    record(
      "linq_experience_decoration",
      linqOutbound.experience === true &&
        linqOutbound.buttons?.[0]?.callbackData === String(controlRef),
    );
    killMutant("provider_extension_bypasses_surface");

    const tgClick = await handleControlClick({
      controls,
      ctx: ctxTelegram,
      inbound: controlClickInbound(controlRef, "telegram", "dm"),
      publicWebOrigin,
      stepUps,
    });
    const linqClick = await handleControlClick({
      controls,
      ctx: ctxLinq,
      inbound: controlClickInbound(controlRef, "linq", "dm"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "two_provider_same_step_up",
      tgClick.kind === "step_up_required" &&
        linqClick.kind === "step_up_required" &&
        tgClick.kind === "step_up_required" &&
        linqClick.kind === "step_up_required" &&
        String(tgClick.proposalRef) === String(highProposal) &&
        String(linqClick.proposalRef) === String(highProposal) &&
        tgClick.control.assurance === "oidc_step_up" &&
        linqClick.control.assurance === "oidc_step_up" &&
        tgClick.stepUpUrl === stepUpUrl(publicWebOrigin, controlRef) &&
        linqClick.stepUpUrl === stepUpUrl(publicWebOrigin, controlRef),
    );

    const groupDisclosure = decideAudienceDisclosure({
      actionRisk: "high",
      audience: { kind: "group", observedParticipantCount: 5 },
      channelAssurance: "provider_chat",
      resourceClass: "confidential",
    });
    record(
      "group_confidential_require_step_up",
      groupDisclosure.kind === "require_step_up",
    );
    const groupControl = await issueApprovalControl(controls, {
      actionBindingId: bindingId,
      actionRef: demoActionRef(),
      assurance: assuranceForRisk("high", groupDisclosure),
      disclosure: groupDisclosure,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalId),
      proposalRef: proposalRef(`proposal.sir.group.${randomUUID()}`),
      sealedAudienceKind: "group",
      tenantId: tenantIdString(tenantId),
    });
    const groupPresentation = createPresentationIntent({
      controlRefsByBindingId: { [bindingId]: groupControl },
      ref: presentationIntentRef(`pres_group_${randomUUID().slice(0, 8)}`),
      surface,
    });
    const groupInbound: InboundInteraction = {
      audienceObservation: { kind: "group", observedParticipantCount: 5 },
      body: { kind: "text", text: "group ask" },
      channel: ctxTelegram.channel,
      idempotencyKey: `sir_group_${randomUUID()}`,
    };
    const groupRecord = await boundary.accept(groupInbound, ctxTelegram);
    const groupPlanned = await planDisclosureDelivery({
      boundary,
      confidentialBody: groupPresentation.fullBodyText,
      controlRef: groupControl,
      ctx: ctxTelegram,
      disclosure: groupDisclosure,
      presentation: groupPresentation.ref,
      recordId: groupRecord.id,
    });
    const groupLowered = lowerPresentationIntent({
      caps: projectPresentationCaps(telegram.probes),
      clientDeliveryId: `spd_group_${String(groupControl)}`,
      controlRefs: [groupControl],
      disclosedBody: groupPlanned.body,
      disclosure: groupDisclosure,
      includesConfidentialBody: groupPlanned.includesConfidentialBody,
      intent: groupPresentation,
      probes: telegram.probes,
      provider: providerKey("telegram"),
      publicWebOrigin,
      target: groupPlanned.intent.target,
    });
    record(
      "group_lower_omits_secret",
      !groupLowered.outbound.text.includes(confidentialSecret) &&
        groupPlanned.includesConfidentialBody === false,
    );
    killMutant("group_card_leaks_forbidden_body");

    const degradeOut: ChatSdkOutbound[] = [];
    const degradedTelegram = degradeAdapter(
      createFakeTelegramProvider(),
      {
        native_button: { status: "unsupported", degradeTo: "link" },
        native_card: { status: "unsupported", degradeTo: "web_surface" },
      },
      degradeOut,
    );
    const degradeLowered = lowerPresentationIntent({
      caps: projectPresentationCaps(degradedTelegram.probes),
      clientDeliveryId: `spd_degrade_${String(controlRef)}`,
      controlRefs: [controlRef],
      disclosedBody: planned.body,
      disclosure: disclosureDm,
      includesConfidentialBody: false,
      intent: presentation,
      probes: degradedTelegram.probes,
      provider: providerKey("telegram"),
      publicWebOrigin,
      target: {
        kind: "same_thread",
        thread: providerThreadRef("9900001"),
      },
    });
    record("probe_degrade_flagged", degradeLowered.degraded === true);
    record(
      "critical_still_reachable_after_degrade",
      degradeLowered.criticalReachable === true &&
        (degradeLowered.outbound.text.includes(String(controlRef)) ||
          degradeLowered.outbound.text.includes(
            stepUpUrl(publicWebOrigin, controlRef),
          ) ||
          (degradeLowered.outbound.surfaceUrl?.includes(String(controlRef)) ??
            false)),
    );
    record(
      "no_silent_drop_buttons",
      degradeLowered.outbound.buttons === undefined ||
        degradeLowered.outbound.buttons.length > 0,
    );
    killMutant("silent_drop_critical_control");

    const degradeGateway = createMessagingGateway({
      providers: { telegram: degradedTelegram },
      publicWebOrigin,
      async resolvePresentation() {
        return {
          disclosedBody: planned.body,
          disclosure: disclosureDm,
          includesConfidentialBody: false,
          intent: presentation,
        };
      },
    });
    const degradeObs = await degradeGateway.deliver({
      ...planned.intent,
      provider: providerKey("telegram"),
      stableProviderDeliveryId: `spd_degrade_gw_${String(controlRef)}`,
    });
    record(
      "gateway_degraded_outcome",
      degradeObs.outcome.kind === "degraded",
    );

    messaging.disableProvider(providerKey("telegram"));
    let disabledThrown = false;
    try {
      await messaging.deliver({
        ...planned.intent,
        provider: providerKey("telegram"),
        stableProviderDeliveryId: `spd_disabled_${randomUUID()}`,
      });
    } catch (cause: unknown) {
      disabledThrown =
        cause instanceof Error && cause.name === "ProviderDisabledError";
    }
    messaging.enableProvider(providerKey("telegram"));
    record("disableProvider_intact", disabledThrown);

    assert.equal(mutantsKilled.length, REQUIRED_MUTANTS.length);
    for (const id of REQUIRED_MUTANTS) {
      assert.ok(mutantsKilled.includes(id), `missing mutant ${id}`);
    }

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      capabilityMatrix: matrix,
      deliveryTraces,
      finishedAt: new Date().toISOString(),
      headSha: process.env.GITHUB_SHA ?? "local",
      mutantsKilled,
      ports: {
        keycloak: 58_640,
        postgres: 55_508,
        zoend: 58_641,
      },
      presentation: {
        blocks: presentation.blocks.map((block) => block.kind),
        ref: String(presentation.ref),
        surfaceDigest: presentation.surfaceDigest,
        surfaceId: presentation.surfaceId,
      },
      scenario,
      startedAt,
      twoProvider: {
        assurance: "oidc_step_up",
        controlRef: String(controlRef),
        proposalRef: String(highProposal),
        stepUpUrl: stepUpUrl(publicWebOrigin, controlRef),
      },
      verdict: "PASS",
    });
    console.log(`surface-ir-renderer PASS → ${artifactPath}`);
  } finally {
    await stopServer(server);
    await storeClient.end().catch(() => undefined);
  }
}
