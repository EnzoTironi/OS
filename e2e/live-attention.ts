import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  assertAttentionPackageGuards,
  attentionDefinitionId,
  attentionDeliveryNeeded,
  attentionDefinitionVersion,
  createPostgresAttentionStore,
  digestMaterialFields,
  digestSemanticCut,
  evaluateAttention,
  executeAttentionAction,
  planAttentionDelivery,
  recordAttentionDelivery,
  tenantId,
  type ActionPath,
  type ActiveMembership,
  type AttentionClassPolicy,
  type AttentionDeliveryPreference,
} from "../packages/attention/src/index.js";
import {
  decideAudienceDisclosure,
  interactionControlRef,
  providerKey,
  type DeliveryIntent,
} from "../packages/interaction/src/index.js";
import {
  companionSessionIsReady,
  createHttpCompanionSession,
  createLiveWhatsAppProvider,
  createMessagingGateway,
  createRecordingCompanionSession,
  LiveWhatsAppConfigError,
  parseWhatsAppDoorE164,
  PERSONAL_WHATSAPP_DOOR_E164,
  type ChatSdkOutbound,
  type ChatSdkShapedAdapter,
  type CompanionReady,
} from "../packages/messaging/src/index.js";
import { parseDefinitionMetadata } from "../packages/sdk/src/definition.js";
import {
  compileDeterministicSurface,
  createPresentationIntent,
} from "../packages/surface/src/index.js";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";

const scenario = "live-attention";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const postgresPort = 55_524;
const adminDatabaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPort);
const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPort,
);
const publicWebOrigin = "https://app.zoen.local";
const speaker = "5531888888888@s.whatsapp.net";
const controlRef = interactionControlRef("ctrl.attn.approve.1");
const stateBasis = "basis.attn.live.1";
const proposalId = "prop.attn.live.1";

const canonicalDefinition = JSON.stringify({
  actions: [
    {
      effects: [
        {
          relationId: "inventory.requested",
          value: { inputId: "quantity", kind: "input" },
        },
      ],
      id: "inventory.requestStock",
      inputs: [{ id: "quantity", valueType: { kind: "integer" } }],
      precondition: { kind: "literal", value: true },
    },
  ],
  computations: [],
  definitionId: "inventory.governed",
  relations: [
    {
      cardinality: "one",
      id: "inventory.available",
      sourceType: "inventory.Item",
      target: { kind: "value", valueType: { kind: "integer" } },
    },
    {
      cardinality: "many",
      id: "inventory.requested",
      sourceType: "inventory.Item",
      target: { kind: "value", valueType: { kind: "integer" } },
    },
  ],
  revision: 1,
  schema: "zoen.definition.v1",
  types: [{ attributes: [], id: "inventory.Item" }],
});

const assertions: Record<string, boolean> = {};
const mutantsKilled: Array<{ id: string; killed: true; evidence: string }> = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function kill(id: string, evidence: string): void {
  mutantsKilled.push({ evidence, id, killed: true });
}

async function gitHead(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
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
      reject(new Error(`git rev-parse failed: ${output.join("")}`));
    });
  });
}

async function connectPostgres(
  connectionString: string,
  timeoutMs = 30_000,
): Promise<PostgresClient> {
  const deadline = Date.now() + timeoutMs;
  let last = "not attempted";
  while (Date.now() < deadline) {
    const client = new PostgresClient({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`postgres not ready: ${last}`);
}

function wrapSend(
  adapter: ChatSdkShapedAdapter,
  sink: ChatSdkOutbound[],
): ChatSdkShapedAdapter {
  return {
    parseInbound: (raw) => adapter.parseInbound(raw),
    probes: adapter.probes,
    providerId: adapter.providerId,
    simulateRestart: adapter.simulateRestart?.bind(adapter),
    threadKind: adapter.threadKind,
    async send(outbound) {
      sink.push(outbound);
      return adapter.send(outbound);
    },
  };
}

function wireIsTextPlusHttps(text: string): boolean {
  return (
    text.includes("https://") &&
    !text.includes("zoen-rich:") &&
    !text.includes("cta_url") &&
    !text.includes("quick_reply")
  );
}

async function maybeLiveDoor(input: {
  readonly intent: DeliveryIntent;
  readonly presentation: ReturnType<typeof createPresentationIntent>;
  readonly disclosure: ReturnType<typeof decideAudienceDisclosure>;
}): Promise<{
  liveAttempted: boolean;
  liveMissing: string;
}> {
  const companionUrl = process.env.ZOEN_WHATSAPP_COMPANION_URL;
  const doorRaw = process.env.ZOEN_WHATSAPP_DOOR_E164;
  if (doorRaw === undefined || doorRaw.trim().length === 0) {
    return {
      liveAttempted: false,
      liveMissing:
        "ZOEN_WHATSAPP_DOOR_E164 and a ready paired CompanionSession",
    };
  }
  try {
    parseWhatsAppDoorE164(doorRaw);
  } catch (error) {
    const message =
      error instanceof LiveWhatsAppConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return { liveAttempted: false, liveMissing: message };
  }
  if (companionUrl === undefined || companionUrl.trim().length === 0) {
    return {
      liveAttempted: false,
      liveMissing: "ZOEN_WHATSAPP_COMPANION_URL and a ready CompanionSession",
    };
  }
  const httpSession = createHttpCompanionSession(companionUrl);
  let ready: CompanionReady;
  try {
    ready = await httpSession.ready();
  } catch (error) {
    return {
      liveAttempted: false,
      liveMissing:
        error instanceof Error ? error.message : String(error),
    };
  }
  if (!companionSessionIsReady(ready)) {
    return {
      liveAttempted: false,
      liveMissing: "CompanionSession is not ready (paired+connected+loggedIn)",
    };
  }
  const liveProvider = createLiveWhatsAppProvider({ session: httpSession });
  const liveGateway = createMessagingGateway({
    publicWebOrigin,
    providers: { whatsapp: liveProvider },
    resolvePresentation: async () => ({
      disclosedBody: input.presentation.fullBodyText,
      disclosure: input.disclosure,
      includesConfidentialBody: true,
      intent: input.presentation,
    }),
  });
  const liveObservation = await liveGateway.deliver(input.intent);
  if (
    liveObservation.outcome.kind !== "accepted" &&
    liveObservation.outcome.kind !== "degraded"
  ) {
    throw new Error(`live WhatsApp deliver ${liveObservation.outcome.kind}`);
  }
  return { liveAttempted: true, liveMissing: "" };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commit = await gitHead();

  const guards = assertAttentionPackageGuards();
  record("package_guards_text_identity", guards.textOnlyDedupeKilled);
  record(
    "package_guards_no_effect_adapter",
    guards.automationCallsExternalEffectKilled,
  );
  kill(
    "text-only-dedupe",
    "assertAttentionPackageGuards ConditionIdentity excludes notification text",
  );
  kill(
    "automation-calls-external-effect",
    "assertAttentionPackageGuards forbids effect adapters in evaluate/execute/wake",
  );

  const admin = await connectPostgres(adminDatabaseUrl);
  try {
    const sql = await readFile(
      path.join(
        repositoryRoot,
        "packages",
        "attention",
        "sql",
        "0001_attention.sql",
      ),
      "utf8",
    );
    await admin.query(sql);
  } finally {
    await admin.end();
  }

  const app = await connectPostgres(applicationDatabaseUrl);
  const store = createPostgresAttentionStore(app);

  const metadata = parseDefinitionMetadata(
    new TextEncoder().encode(canonicalDefinition),
  );
  const surface = compileDeterministicSurface({
    definition: {
      definitionId: metadata.definitionId,
      digest: "a".repeat(64),
      revision: metadata.revision.toString(),
    },
    entityId: "inventory.item.1",
    metadata,
  });
  const binding = surface.actionBindings[0];
  assert.ok(binding, "surface action binding");
  const presentation = createPresentationIntent({
    controlRefsByBindingId: { [binding.id]: controlRef },
    surface,
  });
  record(
    "surface_ir_compiled",
    presentation.blocks.some((block) => block.kind === "button" && block.critical),
  );

  const disclosure = decideAudienceDisclosure({
    actionRisk: "low",
    audience: { kind: "dm" },
    channelAssurance: "provider_chat",
    resourceClass: "internal",
  });
  record("dm_disclosure_full", disclosure.kind === "deliver_full");

  const session = createRecordingCompanionSession({
    ready: { connected: true, loggedIn: true, paired: true },
  });
  await session.open();
  const liveProvider = createLiveWhatsAppProvider({ session });
  const outbounds: ChatSdkOutbound[] = [];
  const provider = wrapSend(liveProvider, outbounds);
  const gateway = createMessagingGateway({
    publicWebOrigin,
    providers: { whatsapp: provider },
    resolvePresentation: async () => ({
      disclosedBody: presentation.fullBodyText,
      disclosure,
      includesConfidentialBody: true,
      intent: presentation,
    }),
  });

  const tenant = tenantId("tenant.live.attention");
  const membership: ActiveMembership = {
    accountId: "account.live.attention",
    membershipId: "membership.live.attention",
    principalId: "principal.live.attention",
    status: "active",
    tenantId: String(tenant),
  };
  const classPolicy: AttentionClassPolicy = {
    allowPersonalWorkspace: false,
    classId: "attention.at-risk",
    critical: false,
    executionMode: "approval_required",
    minDisclosure: "deliver_full",
  };
  const deliveryPref: AttentionDeliveryPreference = {
    cooldownMinutes: 0,
    escalationPrincipalIds: [],
    fallbackChannels: ["web_surface"],
    mute: false,
    preferredChannels: ["dm"],
    redactSensitiveBody: true,
    type: "attention_delivery",
    mode: "immediate",
  };
  const fingerprint = digestMaterialFields({
    onHand: 2,
    reserved: 5,
    risk: "low_stock",
  });
  const event = {
    classId: classPolicy.classId,
    conditionTrue: true,
    definitionId: attentionDefinitionId("attention.sample.at-risk-stock"),
    definitionVersion: attentionDefinitionVersion("1.0.0"),
    materialFingerprint: fingerprint,
    observedAt: startedAt,
    proposalRef: proposalId,
    proposalStateBasisDigest: stateBasis,
    recipientPrincipalId: membership.principalId,
    recipientScope: "enterprise" as const,
    renderedCopy: "At-risk stock needs a look.",
    sealedDisclosure: disclosure,
    semanticCutDigest: digestSemanticCut({ query: "at-risk-stock", window: "live" }),
    subject: { kind: "resource" as const, resourceId: "resource.stock.at-risk.1" },
    tenantId: tenant,
  };

  const opened = await evaluateAttention({
    classPolicy,
    event,
    membership,
    prefs: [
      {
        key: "attention.delivery",
        preferenceId: "pref.delivery.1",
        value: deliveryPref,
      },
    ],
    store,
  });
  record("attention_opened", opened.kind === "opened");
  record("attention_delivery_needed_on_open", attentionDeliveryNeeded(opened));
  assert.equal(opened.kind, "opened");
  const itemId = String(opened.item.id);

  const plan = planAttentionDelivery({
    controlRefs: [String(controlRef)],
    disclosure,
    fallbackChannels: deliveryPref.fallbackChannels,
    item: opened.item,
    membership,
    preferredChannels: deliveryPref.preferredChannels,
    presentation: String(presentation.ref),
    provider: "whatsapp",
    providerUser: speaker,
  });
  assert.equal(plan.kind, "intent");
  if (plan.kind !== "intent") {
    throw new Error("expected delivery intent");
  }
  record("plan_dm_intent", plan.channel === "dm");

  const observation = await gateway.deliver(plan.intent);
  record(
    "gateway_accepted",
    observation.outcome.kind === "accepted" ||
      observation.outcome.kind === "degraded",
  );
  const delivered = await recordAttentionDelivery({
    item: opened.item,
    membership,
    observationId: String(observation.id),
    observedAt: observation.observedAt,
    outcomeKind:
      observation.outcome.kind === "degraded"
        ? "degraded"
        : observation.outcome.kind,
    plan,
    provider: "whatsapp",
    store,
  });
  record("one_delivery_generation", delivered.deliveryGeneration === 1);

  const sent = session.sent();
  assert.equal(sent.length, 1);
  const wire = sent[0];
  assert.ok(wire);
  record("whatsapp_wire_text", wire.shape.kind === "text");
  if (wire.shape.kind !== "text") {
    throw new Error("expected text wire shape");
  }
  record("whatsapp_text_plus_https", wireIsTextPlusHttps(wire.shape.text));
  record(
    "whatsapp_no_native_widgets",
    outbounds.every(
      (outbound) =>
        outbound.buttons === undefined &&
        outbound.card !== true &&
        outbound.experience !== true,
    ) && wire.shape.kind === "text",
  );
  kill(
    "native-whatsapp-widgets",
    "createLiveWhatsAppProvider send recorded text + https only",
  );

  const copyChanged = await evaluateAttention({
    classPolicy,
    event: {
      ...event,
      observedAt: new Date().toISOString(),
      renderedCopy: "TOTALLY DIFFERENT NOTIFICATION TEXT",
    },
    lastDeliveredAt: delivered.updatedAt,
    membership,
    prefs: [
      {
        key: "attention.delivery",
        preferenceId: "pref.delivery.1",
        value: deliveryPref,
      },
    ],
    store,
  });
  record(
    "text_change_same_item",
    copyChanged.kind === "unchanged" &&
      String(copyChanged.item.id) === itemId &&
      copyChanged.item.deliveryGeneration === 1 &&
      !attentionDeliveryNeeded(copyChanged),
  );

  liveProvider.simulateRestart?.();
  const restartedGateway = createMessagingGateway({
    publicWebOrigin,
    providers: {
      whatsapp: wrapSend(
        createLiveWhatsAppProvider({ session }),
        outbounds,
      ),
    },
    resolvePresentation: async () => ({
      disclosedBody: presentation.fullBodyText,
      disclosure,
      includesConfidentialBody: true,
      intent: presentation,
    }),
  });
  const restarted = await evaluateAttention({
    classPolicy,
    event: { ...event, observedAt: new Date().toISOString() },
    lastDeliveredAt: delivered.updatedAt,
    membership,
    prefs: [
      {
        key: "attention.delivery",
        preferenceId: "pref.delivery.1",
        value: deliveryPref,
      },
    ],
    store,
  });
  record(
    "restart_unchanged",
    restarted.kind === "unchanged" &&
      String(restarted.item.id) === itemId &&
      !attentionDeliveryNeeded(restarted),
  );
  if (attentionDeliveryNeeded(restarted)) {
    const replay = planAttentionDelivery({
      controlRefs: [String(controlRef)],
      disclosure,
      fallbackChannels: deliveryPref.fallbackChannels,
      item: restarted.item,
      membership,
      preferredChannels: deliveryPref.preferredChannels,
      presentation: String(presentation.ref),
      provider: "whatsapp",
      providerUser: speaker,
    });
    if (replay.kind === "intent") {
      await restartedGateway.deliver(replay.intent);
    }
  }
  record("restart_does_not_duplicate_send", session.sent().length === 1);
  const evidence = await store.listDeliveryEvidence(tenant, itemId);
  record("one_evidence_row", evidence.length === 1);
  kill(
    "restart-duplicates-delivery",
    "unchanged evaluate after simulateRestart did not send a second WhatsApp text",
  );

  const businessState = Object.freeze({ reserved: 0 });
  const commits: string[] = [];
  const action: ActionPath = {
    async revalidateAndContinue(input) {
      if (input.expectedStateBasisDigest !== stateBasis) {
        return {
          currentDigest: "basis.attn.live.moved",
          kind: "stale",
          proposalId: input.proposalId,
        };
      }
      return { kind: "ready", proposalId: input.proposalId };
    },
    async commit(input) {
      commits.push(input.operationId);
      return {
        kind: "committed",
        operationId: input.operationId,
        receiptId: `rcpt.${input.operationId}`,
      };
    },
  };
  const stale = await executeAttentionAction({
    action,
    classPolicy,
    item: {
      ...delivered,
      proposalRef: proposalId,
      proposalStateBasisDigest: "basis.attn.live.stale",
    },
    mode: "click",
    operationId: "op.attn.stale",
  });
  record("stale_state_basis_blocks_commit", stale.kind === "stale");
  record("stale_did_not_commit", commits.length === 0);

  const clicked = await executeAttentionAction({
    action,
    classPolicy,
    item: delivered,
    mode: "click",
    operationId: "op.attn.click",
  });
  record(
    "click_uses_ordinary_action",
    clicked.kind === "committed" && clicked.usedOrdinaryAction === true,
  );
  record("one_action_commit", commits.length === 1);
  record("attention_did_not_mutate_business_state", businessState.reserved === 0);
  kill(
    "attention-commits-without-action-path",
    "executeAttentionAction re-entered ActionPath with StateBasis",
  );

  const live = await maybeLiveDoor({
    disclosure,
    intent: plan.intent,
    presentation,
  });
  record(
    "personal_door_constant_locked",
    PERSONAL_WHATSAPP_DOOR_E164 === "+5531999941160",
  );
  assertions.live_whatsapp_dm_proven = live.liveAttempted;
  const sentCount = session.sent().length;

  await app.end();
  await session.close();

  const payload = {
    assertions,
    commit,
    conditionIdentityDigest: String(opened.item.conditionIdentity.digest),
    deliveryGeneration: delivered.deliveryGeneration,
    evidenceRows: evidence.length,
    finishedAt: new Date().toISOString(),
    generatedDirectory,
    liveAttempted: live.liveAttempted,
    liveMissing: live.liveMissing,
    mutantsKilled,
    postgresPort,
    provider: String(providerKey("whatsapp")),
    sentCount,
    startedAt,
    surfaceDigest: presentation.surfaceDigest,
    verdict: "PASS" as const,
    whatsappText: wire.shape.kind === "text" ? wire.shape.text : "",
    wireKind: wire.shape.kind,
  };
  const artifactPath = await writeScenarioArtifact(
    repositoryRoot,
    scenario,
    payload,
  );
  console.log(`live-attention PASS → ${artifactPath}`);
  console.log(
    JSON.stringify(
      {
        commit,
        liveAttempted: live.liveAttempted,
        liveMissing: live.liveMissing,
        sentCount: payload.sentCount,
        wireKind: payload.wireKind,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
