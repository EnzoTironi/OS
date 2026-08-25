import assert from "node:assert/strict";
import path from "node:path";
import {
  attentionDefinitionId,
  attentionDefinitionVersion,
  createMemoryAttentionStore,
  digestMaterialFields,
  digestSemanticCut,
  evaluateAttention,
  planAttentionDelivery,
  recordAttentionDelivery,
  tenantId,
  type ActiveMembership,
  type AttentionClassPolicy,
  type AttentionDeliveryPreference,
  type AttentionEvaluateDecision,
} from "../packages/attention/src/index.js";
import {
  decideAudienceDisclosure,
  interactionControlRef,
} from "../packages/speaker/src/index.js";
import {
  companionSessionIsReady,
  createHttpCompanionSession,
  createLiveWhatsAppProvider,
  createMessagingGateway,
  parseWhatsAppDoorE164,
  PERSONAL_WHATSAPP_DOOR_E164,
  type CompanionReady,
  type CompanionSession,
  type WhatsAppWireShape,
} from "../packages/transport/src/index.js";
import { parseDefinitionMetadata } from "../packages/sdk/src/definition.js";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  compileDeterministicSurface,
  createPresentationIntent,
} from "../packages/surface/src/index.js";
import { writeScenarioArtifact } from "./host-env.js";
import {
  changeCommitmentRequest,
  commitChangeCommitment,
  previewChangeCommitment,
} from "./whatsapp-dirty-quote/agent.js";
import { REQUIRED_MUTANTS } from "./whatsapp-dirty-quote/mutants.js";
import {
  actionClient,
  actionId,
  activationActionId,
  adminClient,
  agentSourceHasNoBypassWrite,
  command,
  compileCommercial,
  compileSurface,
  composeOutput,
  definitionClient,
  definitionReference,
  entityIds,
  generatedDirectory,
  ingestChangeCommitmentBasis,
  ingestInsertIsAppendOnly,
  ingestQuotedQuantityRivals,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  publish,
  quantityLabels,
  quantityRelationId,
  queryOrderLines,
  queryRelation,
  rejectSqlBeliefWrite,
  repositoryRoot,
  resourceId,
  semanticClaimCount,
  sha256,
  sourceIds,
  startServer,
  stopServer,
  tenantA,
  waitForOidc,
  worldClient,
  writePolicyManifest,
  type CompiledDefinition,
  type ServerProcess,
} from "./whatsapp-dirty-quote/support.js";

const scenario = "whatsapp-dirty-quote";
const publicWebOrigin = "https://app.zoen.local";
const defaultLiveRecipientJid = "553199941160@s.whatsapp.net";
const controlRef = interactionControlRef("ctrl.dirty-quote.changeCommitment");
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const mutantsKilled: string[] = [];

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

function killMutant(name: (typeof REQUIRED_MUTANTS)[number]): void {
  mutantsKilled.push(name);
}

function attentionDeliveryNeeded(
  decision: AttentionEvaluateDecision,
): decision is Extract<
  AttentionEvaluateDecision,
  { kind: "opened" | "reopened" | "materially_changed" }
> {
  return (
    decision.kind === "opened" ||
    decision.kind === "reopened" ||
    decision.kind === "materially_changed"
  );
}

type LiveSendCounter = {
  count: number;
  shapes: WhatsAppWireShape[];
};

function wrapCountingCompanionSession(
  inner: CompanionSession,
  counter: LiveSendCounter,
): CompanionSession {
  return {
    beginPairing: () => inner.beginPairing(),
    close: () => inner.close(),
    open: () => inner.open(),
    presence: (chatJid, state) => inner.presence(chatJid, state),
    ready: () => inner.ready(),
    subscribeInbound: (handler) => inner.subscribeInbound(handler),
    async send(outbound) {
      counter.count += 1;
      counter.shapes.push(outbound.shape);
      return inner.send(outbound);
    },
  };
}

function httpsUrlCount(text: string): number {
  return text.match(/https:\/\//gi)?.length ?? 0;
}

function wireIsTextPlusHttps(shape: WhatsAppWireShape): boolean {
  return (
    shape.kind === "text" &&
    httpsUrlCount(shape.text) === 1 &&
    !shape.text.includes("cta_url") &&
    !shape.text.includes("quick_reply") &&
    !shape.text.includes("zoen-rich:")
  );
}

function jidUserDigits(jid: string): string {
  const at = jid.indexOf("@");
  const user = at > 0 ? jid.slice(0, at) : jid;
  const device = user.indexOf(":");
  const phone = device > 0 ? user.slice(0, device) : user;
  return phone.replace(/\D/g, "");
}

function resolveLiveRecipientJid(doorE164: string):
  | { readonly jid: string }
  | { readonly missing: string } {
  const raw = (
    process.env.ZOEN_WHATSAPP_LIVE_RECIPIENT_JID ?? defaultLiveRecipientJid
  ).trim();
  const at = raw.indexOf("@");
  if (at <= 0) {
    return { missing: `live recipient is not a person JID: ${raw}` };
  }
  const server = raw.slice(at + 1).toLowerCase();
  if (server !== "s.whatsapp.net" && server !== "c.us") {
    return { missing: `live recipient is not a person JID: ${raw}` };
  }
  if (raw.includes(":")) {
    return {
      missing: `live recipient must be a person JID, never a device: ${raw}`,
    };
  }
  const recipientDigits = jidUserDigits(raw);
  const doorDigits = doorE164.replace(/\D/g, "");
  if (recipientDigits.length === 0 || doorDigits.length === 0) {
    return { missing: "live recipient or door E.164 is empty" };
  }
  if (recipientDigits === doorDigits) {
    return { missing: "live recipient must be a person JID, never the door" };
  }
  return { jid: raw };
}

function failMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type LiveProof = {
  readonly doorE164: string;
  readonly liveAttempted: boolean;
  readonly liveMissing: string;
  readonly liveRecipientJid: string;
  readonly liveSentCount: number;
  readonly restartDidNotSend: boolean;
  readonly wireOk: boolean;
};

const skippedLive = {
  doorE164: "",
  liveAttempted: false,
  liveRecipientJid: "",
  liveSentCount: 0,
  restartDidNotSend: false,
  wireOk: false,
} as const;

function compileListedOrderLine(
  commercial: CompiledDefinition,
): ReturnType<typeof compileDeterministicSurface> {
  const metadata = parseDefinitionMetadata(
    new TextEncoder().encode(commercial.canonicalJson),
  );
  return compileDeterministicSurface({
    definition: {
      definitionId: metadata.definitionId,
      digest: commercial.digest,
      revision: metadata.revision.toString(),
    },
    entityId: resourceId,
    metadata: {
      ...metadata,
      actions: metadata.actions.filter((action) => action.id === actionId),
    },
    presentation: { title: "Dirty quote" },
  });
}

async function proveLiveWhatsApp(commercial: CompiledDefinition): Promise<LiveProof> {
  const companionUrl = (
    process.env.ZOEN_WHATSAPP_COMPANION_URL ?? "http://127.0.0.1:8081"
  ).trim();
  const doorRaw = process.env.ZOEN_WHATSAPP_DOOR_E164;
  if (doorRaw === undefined || doorRaw.trim().length === 0) {
    return {
      ...skippedLive,
      liveMissing:
        "ZOEN_WHATSAPP_DOOR_E164 and a ready paired CompanionSession",
    };
  }
  let doorE164: string;
  try {
    doorE164 = parseWhatsAppDoorE164(doorRaw);
  } catch (error) {
    return { ...skippedLive, liveMissing: failMessage(error) };
  }
  if (companionUrl.length === 0) {
    return {
      ...skippedLive,
      doorE164,
      liveMissing: "ZOEN_WHATSAPP_COMPANION_URL and a ready CompanionSession",
    };
  }
  const recipient = resolveLiveRecipientJid(doorE164);
  if ("missing" in recipient) {
    return { ...skippedLive, doorE164, liveMissing: recipient.missing };
  }
  const recipientJid = recipient.jid;

  const counter: LiveSendCounter = { count: 0, shapes: [] };
  const session = wrapCountingCompanionSession(
    createHttpCompanionSession(companionUrl),
    counter,
  );
  let ready: CompanionReady;
  try {
    ready = await session.ready();
  } catch (error) {
    return { ...skippedLive, doorE164, liveMissing: failMessage(error) };
  }
  if (!companionSessionIsReady(ready)) {
    return {
      ...skippedLive,
      doorE164,
      liveMissing: "CompanionSession is not ready (paired+connected+loggedIn)",
    };
  }

  const listed = compileListedOrderLine(commercial);
  const binding = listed.actionBindings.find(
    (entry) => entry.ref.actionId === actionId,
  );
  if (binding === undefined) {
    return {
      ...skippedLive,
      doorE164,
      liveMissing: "changeCommitment is not bound on the listed OrderLine",
    };
  }
  const presentation = createPresentationIntent({
    controlRefsByBindingId: { [binding.id]: controlRef },
    surface: listed,
  });
  const disclosure = decideAudienceDisclosure({
    actionRisk: "low",
    audience: { kind: "dm" },
    channelAssurance: "provider_chat",
    resourceClass: "internal",
  });
  const disclosedBody = `${resourceId}\n${presentation.fullBodyText}`;
  const store = createMemoryAttentionStore();
  const provider = createLiveWhatsAppProvider({ session });
  const gateway = createMessagingGateway({
    publicWebOrigin,
    providers: { whatsapp: provider },
    resolvePresentation: async () => ({
      disclosedBody,
      disclosure,
      includesConfidentialBody: true,
      intent: presentation,
    }),
  });
  const tenant = tenantId(tenantA);
  const membership: ActiveMembership = {
    accountId: "account.dirty-quote",
    membershipId: "membership.dirty-quote",
    principalId: "principal.admin.a",
    status: "active",
    tenantId: String(tenant),
  };
  const classPolicy: AttentionClassPolicy = {
    allowPersonalWorkspace: false,
    classId: "attention.dirty-quote",
    critical: false,
    executionMode: "notify_only",
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
  const event = {
    classId: classPolicy.classId,
    conditionTrue: true,
    definitionId: attentionDefinitionId("attention.dirty-quote.order-line"),
    definitionVersion: attentionDefinitionVersion("1.0.0"),
    materialFingerprint: digestMaterialFields({
      entityId: resourceId,
      quotedQuantity: ["10 each", "12 each"],
    }),
    observedAt: new Date().toISOString(),
    recipientPrincipalId: membership.principalId,
    recipientScope: "enterprise" as const,
    renderedCopy: `Dirty quote ${resourceId}`,
    sealedDisclosure: disclosure,
    semanticCutDigest: digestSemanticCut({
      entityId: resourceId,
      relationId: quantityRelationId,
    }),
    subject: { entityId: resourceId, kind: "entity" as const },
    tenantId: tenant,
  };
  const prefs = [
    {
      key: "attention.delivery",
      preferenceId: "pref.dirty-quote.delivery",
      value: deliveryPref,
    },
  ];

  async function deliverIfNeeded(
    decision: AttentionEvaluateDecision,
  ): Promise<"sent" | "skipped"> {
    if (!attentionDeliveryNeeded(decision)) {
      return "skipped";
    }
    const plan = planAttentionDelivery({
      controlRefs: [String(controlRef)],
      disclosure,
      fallbackChannels: deliveryPref.fallbackChannels,
      item: decision.item,
      membership,
      preferredChannels: deliveryPref.preferredChannels,
      presentation: String(presentation.ref),
      provider: "whatsapp",
      providerUser: recipientJid,
    });
    if (plan.kind !== "intent") {
      throw new Error(`delivery plan ${plan.reason}`);
    }
    const observation = await gateway.deliver(plan.intent);
    if (
      observation.outcome.kind !== "accepted" &&
      observation.outcome.kind !== "degraded"
    ) {
      const reason =
        observation.outcome.kind === "rejected"
          ? observation.outcome.reason
          : observation.outcome.kind;
      throw new Error(`live WhatsApp deliver ${reason}`);
    }
    await recordAttentionDelivery({
      item: decision.item,
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
    return "sent";
  }

  try {
    const opened = await evaluateAttention({
      classPolicy,
      event,
      membership,
      prefs,
      store,
    });
    if (opened.kind !== "opened") {
      return {
        ...skippedLive,
        doorE164,
        liveMissing: `expected opened attention, got ${opened.kind}`,
        liveRecipientJid: recipientJid,
      };
    }
    const first = await deliverIfNeeded(opened);
    if (first !== "sent" || counter.count !== 1) {
      return {
        ...skippedLive,
        doorE164,
        liveMissing: `first live send did not land (deliver=${first}, send=${String(counter.count)})`,
        liveRecipientJid: recipientJid,
        liveSentCount: counter.count,
      };
    }
    const wire = counter.shapes[0];
    const wireOk = wire !== undefined && wireIsTextPlusHttps(wire);

    const restarted = await evaluateAttention({
      classPolicy,
      event: { ...event, observedAt: new Date().toISOString() },
      lastDeliveredAt: new Date().toISOString(),
      membership,
      prefs,
      store,
    });
    const second = await deliverIfNeeded(restarted);
    const restartDidNotSend =
      restarted.kind === "unchanged" &&
      second === "skipped" &&
      counter.count === 1;
    return {
      doorE164,
      liveAttempted: true,
      liveMissing: "",
      liveRecipientJid: recipientJid,
      liveSentCount: counter.count,
      restartDidNotSend,
      wireOk,
    };
  } catch (error) {
    return {
      ...skippedLive,
      doorE164,
      liveMissing: failMessage(error),
      liveRecipientJid: recipientJid,
      liveSentCount: counter.count,
    };
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commercial = await compileCommercial();
  const definition = definitionReference(commercial);
  observe(
    "commercialCompilesChangeCommitment",
    commercial.definition.definitionId === "commercial.sales" &&
      commercial.definition.revision === 2 &&
      /"id":"commercial.changeCommitment"/.test(commercial.canonicalJson) &&
      commercial.canonicalJson.includes('"id":"commercial.OrderLine"') &&
      commercial.canonicalJson.includes('"id":"commercial.quotedQuantity"'),
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, commercial);
  await waitForOidc();
  const token = await oidcToken("admin-a");
  const definitions = definitionClient(token);
  const actions = actionClient(token);
  const world = worldClient(token);
  const admin = adminClient();
  let server: ServerProcess | undefined;
  await admin.connect();

  let live: LiveProof = {
    ...skippedLive,
    liveMissing: "live proof did not run",
  };

  try {
    server = await startServer(policyManifestPath);
    const published = await publish(definitions, commercial);
    observe(
      "commercialPublished",
      published.digest === commercial.digest && published.revision === 2n,
    );
    const activated = await definitions.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId: commercial.definition.definitionId,
      digest: commercial.digest,
      tenantId: tenantA,
    });
    observe(
      "commercialActivated",
      activated.activation?.active?.digest === commercial.digest,
    );

    const ingest = await ingestQuotedQuantityRivals(world, definition);
    inject("second-quantity-claim-after-sheet");
    const quoted = await queryRelation(world, definition, quantityRelationId);
    const quoteClaimRows = await semanticClaimCount(admin, quantityRelationId);
    observe(
      "twoRivalQuantityClaimsCoexist",
      ingest.afterSheet < ingest.afterErp &&
        quoteClaimRows === 2 &&
        quantityLabels(quoted).join(",") === "10 each,12 each" &&
        sourceIds(quoted).join(",") === "source.erp,source.sheet",
    );
    observe(
      "ingestInsertIsAppendOnly",
      await ingestInsertIsAppendOnly(),
    );
    observe("fuseAtIngestMutantKilled", quoteClaimRows === 2);
    killMutant("Fuse-at-ingest");

    const listed = await queryOrderLines(world, definition);
    observe(
      "semanticQueryListsTheOrderLine",
      entityIds(listed).includes(resourceId),
    );

    const surface = compileSurface(commercial);
    const objectNode = surface.nodes["node.object"];
    observe(
      "surfaceListsTheOrderLine",
      surface.attribution.compiler === "deterministic" &&
        surface.attribution.generatedWithoutLlm &&
        surface.semanticContext.entityId === resourceId &&
        objectNode?.kind === "object-detail" &&
        objectNode.entityId === resourceId &&
        surface.queryBindings.some(
          (binding) =>
            binding.ref.kind === "relation" &&
            binding.ref.relationId === quantityRelationId,
        ) &&
        surface.actionBindings.some(
          (binding) => binding.ref.actionId === actionId,
        ),
    );

    await ingestChangeCommitmentBasis(world, definition);
    const claimsBeforePreview = await semanticClaimCount(admin);
    const committedBeforePreview = await queryRelation(
      world,
      definition,
      "commercial.committedQuantity",
    );
    const previewRequest = changeCommitmentRequest(definition, "preview");
    const preview = await previewChangeCommitment(actions, previewRequest);
    const claimsAfterPreview = await semanticClaimCount(admin);
    const committedAfterPreview = await queryRelation(
      world,
      definition,
      "commercial.committedQuantity",
    );
    const quotedAfterPreview = await queryRelation(
      world,
      definition,
      quantityRelationId,
    );
    inject("propose-changeCommitment-without-commit");
    observe(
      "previewDoesNotWriteBelief",
      preview.decision === PolicyDecision.PERMIT &&
        preview.proposal?.status === ProposalStatus.READY &&
        claimsAfterPreview === claimsBeforePreview &&
        quantityLabels(committedAfterPreview).join(",") ===
          quantityLabels(committedBeforePreview).join(",") &&
        quantityLabels(quotedAfterPreview).join(",") === "10 each,12 each",
    );
    killMutant("Preview writes belief");

    const commitRequest = changeCommitmentRequest(definition, "commit");
    const proposed = await previewChangeCommitment(actions, commitRequest);
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    const committed = await commitChangeCommitment(actions, commitRequest);
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    const committedAfterAction = await queryRelation(
      world,
      definition,
      "commercial.committedQuantity",
    );
    const quotedAfterAction = await queryRelation(
      world,
      definition,
      quantityRelationId,
    );
    observe(
      "commitThroughAction",
      committed.receipt.operationId === commitRequest.operationId &&
        committed.receipt.recordIds.length > 0 &&
        quantityLabels(committedAfterAction).includes("8 each") &&
        quantityLabels(quotedAfterAction).join(",") === "10 each,12 each",
    );
    killMutant("RecordEvidence skips Action");

    inject("direct-sql-touch-after-rivals");
    const sqlRejected = await rejectSqlBeliefWrite(admin);
    const quotedAfterSql = await queryRelation(
      world,
      definition,
      quantityRelationId,
    );
    observe(
      "agentPathHasNoSqlOrBypassWrite",
      (await agentSourceHasNoBypassWrite()) &&
        sqlRejected &&
        quantityLabels(quotedAfterSql).join(",") === "10 each,12 each",
    );
    killMutant("Agent SQL write");

    observe(
      "requiredMutantsKilled",
      REQUIRED_MUTANTS.every((name) => mutantsKilled.includes(name)),
    );

    live = await proveLiveWhatsApp(commercial);
    if (!live.liveAttempted) {
      throw new Error(live.liveMissing);
    }
    observe(
      "personalDoorConstantLocked",
      PERSONAL_WHATSAPP_DOOR_E164 === "+5531999941160",
    );
    observe(
      "liveRecipientIsNotDoor",
      live.liveRecipientJid.length > 0 &&
        !live.liveRecipientJid.includes(":") &&
        (live.liveRecipientJid.endsWith("@s.whatsapp.net") ||
          live.liveRecipientJid.endsWith("@c.us")) &&
        jidUserDigits(live.liveRecipientJid) !==
          live.doorE164.replace(/\D/g, ""),
    );
    observe("liveWireTextPlusHttps", live.wireOk);
    observe(
      "restartDoesNotDuplicateLiveSend",
      live.restartDidNotSend && live.liveSentCount === 1,
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const keycloakVersion = await composeOutput(
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    );
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      definition: {
        digest: commercial.digest,
        id: commercial.definition.definitionId,
        revision: commercial.definition.revision,
      },
      doorE164: live.doorE164,
      failureInjections,
      finishedAt: new Date().toISOString(),
      liveAttempted: live.liveAttempted,
      liveMissing: live.liveMissing,
      liveRecipientJid: live.liveRecipientJid,
      liveSentCount: live.liveSentCount,
      mutantsKilled,
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      operationId: committed.receipt.operationId,
      policies: [actionId, activationActionId],
      protocolDigest: sha256(commercial.canonicalJson),
      resourceId,
      rivals: {
        relationId: quantityRelationId,
        sources: sourceIds(quotedAfterAction),
        values: quantityLabels(quotedAfterAction),
      },
      scenario,
      sourceCommit,
      startedAt,
      tenant: tenantA,
    };
    await writeScenarioArtifact(repositoryRoot, scenario, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error: unknown) {
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]).catch(
      () => "",
    );
    await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      doorE164: live.doorE164,
      failureInjections,
      finishedAt: new Date().toISOString(),
      liveAttempted: live.liveAttempted,
      liveMissing: live.liveMissing || failMessage(error),
      liveRecipientJid: live.liveRecipientJid,
      liveSentCount: live.liveSentCount,
      mutantsKilled,
      scenario,
      sourceCommit,
      startedAt,
      tenant: tenantA,
    });
    throw error;
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
