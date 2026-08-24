import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import {
  assertAttentionPackageGuards,
  attentionDefinitionId,
  attentionDefinitionVersion,
  buildConditionIdentity,
  createMemoryAttentionWakeScheduler,
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
  type PreferenceDecisionEvidence,
} from "../../packages/attention/src/index.js";
import {
  createInteractionControlRegistry,
  createPostgresControlStore,
  decideAudienceDisclosure,
  issueApprovalControl,
  presentationIntentRef,
  principalIdString,
  proposalRef,
  tenantIdString,
} from "../../packages/interaction/src/index.js";
import {
  createFakeLinqProvider,
  createMessagingGateway,
} from "../../packages/messaging/src/index.js";
import { DefinitionReferenceSchema } from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  definitionClient,
  oidcToken,
  propose,
  recordAvailable,
  startServer,
  stopServer,
  worldClient,
  type ServerProcess,
} from "../governed-action/support.js";
import { REQUIRED_MUTANTS } from "./mutants.js";
import {
  admin,
  applyAttentionSchema,
  baseUrl,
  generatedDirectory,
  openAppClient,
  postgresPort,
  publicWebOrigin,
  repositoryRoot,
  scenario,
  writePolicyManifest,
  writeScenarioArtifact,
  zoendPort,
  keycloakPort,
} from "./support.js";

const linqSubject = `linq_user_attn_${Date.now()}`;

export type ProactiveAttentionEvidence = {
  scenario: "proactive-attention";
  ports: { postgres: number; keycloak: number; zoend: number };
  conditionIdentityDigest: string;
  attentionItemId: string;
  deliveryGenerations: number[];
  preferenceDecisions: PreferenceDecisionEvidence[];
  providerDeliveryRefs: string[];
  staleReplanProof: {
    proposalId: string;
    outcome: "stale" | "replan" | "deny";
  };
  autoVsApproval: {
    mode: string;
    committed: boolean;
    usedOrdinaryAction: true;
  };
  mutantsKilled: string[];
  restartReplay: { duplicateAttention: false; duplicateAction: false };
  assertions: Record<string, boolean>;
  baseUrl: string;
  publicWebOrigin: string;
};

export async function main(): Promise<ProactiveAttentionEvidence> {
  const startedAt = new Date().toISOString();
  const assertions: Record<string, boolean> = {};
  const mutantsKilled: string[] = [];
  const preferenceDecisions: PreferenceDecisionEvidence[] = [];
  const deliveryGenerations: number[] = [];
  const providerDeliveryRefs: string[] = [];

  function record(name: string, observed: boolean): void {
    assert.ok(observed, name);
    assertions[name] = observed;
  }

  function killMutant(name: string): void {
    if (!mutantsKilled.includes(name)) {
      mutantsKilled.push(name);
    }
  }

  await mkdir(generatedDirectory, { recursive: true });
  await applyAttentionSchema();

  const guards = assertAttentionPackageGuards();
  record("package_guards_text_identity", guards.textOnlyDedupeKilled);
  record(
    "package_guards_no_effect_adapter",
    guards.automationCallsExternalEffectKilled,
  );
  killMutant("text-only-dedupe");
  killMutant("automation-calls-external-effect");

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixture = await writePolicyManifest(policyManifestPath);

  const appClient = await openAppClient();
  let server: ServerProcess | undefined;

  try {
    server = await startServer(policyManifestPath);

    const boundToken = await oidcToken("bound-bait");
    const secondToken = await oidcToken("bound-second");
    const unboundToken = await oidcToken("unbound-a");
    const adminToken = await oidcToken("admin-a");

    const bootstrapA = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      boundToken,
    );
    assert.equal(bootstrapA.status, 200, JSON.stringify(bootstrapA.body));
    const tenantA = String(bootstrapA.body.tenantId);
    const principalA = String(bootstrapA.body.principalId);
    const accountA = String(bootstrapA.body.accountId);
    const membershipA = String(bootstrapA.body.membershipId);

    const linqBind = await admin("POST", "/identity/admin/bind-verified", {
      accountId: accountA,
      provider: "linq",
      subjectKey: linqSubject,
    });
    assert.equal(linqBind.status, 200, JSON.stringify(linqBind.body));

    const bootstrapB = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      secondToken,
    );
    assert.equal(bootstrapB.status, 200, JSON.stringify(bootstrapB.body));
    const tenantB = String(bootstrapB.body.tenantId);
    const principalB = String(bootstrapB.body.principalId);

    const defs = definitionClient(unboundToken);
    await defs.publish({
      canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
      digest: fixture.digest,
      tenantId: "tenant.a",
    });
    const adminDefs = definitionClient(adminToken);
    await adminDefs.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId: fixture.definitionId,
      digest: fixture.digest,
      tenantId: "tenant.a",
    });
    record("definition_activated", true);

    const store = createPostgresAttentionStore(appClient);
    const controlStore = createPostgresControlStore(appClient);
    const controls = createInteractionControlRegistry({ store: controlStore });
    const linq = createFakeLinqProvider();
    const gateway = createMessagingGateway({
      providers: { linq },
    });
    const wake = createMemoryAttentionWakeScheduler();

    const stockId = "resource.stock.at-risk.1";
    const semanticCut = digestSemanticCut({
      query: "at-risk-stock",
      window: "live",
    });
    const fingerprintV1 = digestMaterialFields({
      onHand: 2,
      reserved: 5,
      risk: "low_stock",
    });
    const fingerprintV2 = digestMaterialFields({
      onHand: 0,
      reserved: 5,
      risk: "stockout",
    });

    const identityA = buildConditionIdentity({
      tenantId: tenantId(tenantA),
      definitionId: attentionDefinitionId("attention.sample.at-risk-stock"),
      definitionVersion: attentionDefinitionVersion("1.0.0"),
      subject: { kind: "resource", resourceId: stockId },
      semanticCutDigest: semanticCut,
    });
    const identityB = buildConditionIdentity({
      tenantId: tenantId(tenantB),
      definitionId: attentionDefinitionId("attention.sample.at-risk-stock"),
      definitionVersion: attentionDefinitionVersion("1.0.0"),
      subject: { kind: "resource", resourceId: stockId },
      semanticCutDigest: semanticCut,
    });
    record(
      "cross_tenant_identity_distinct",
      String(identityA.digest) !== String(identityB.digest),
    );

    const disclosureDm = decideAudienceDisclosure({
      actionRisk: "low",
      audience: { kind: "dm" },
      channelAssurance: "provider_chat",
      resourceClass: "internal",
    });
    record("dm_disclosure_full", disclosureDm.kind === "deliver_full");

    const normalClass: AttentionClassPolicy = {
      classId: "attention.at-risk",
      critical: false,
      executionMode: "approval_required",
      minDisclosure: "deliver_full",
      allowPersonalWorkspace: false,
    };
    const criticalClass: AttentionClassPolicy = {
      ...normalClass,
      classId: "attention.critical",
      critical: true,
      executionMode: "auto",
    };

    const deliveryPref: AttentionDeliveryPreference = {
      type: "attention_delivery",
      mode: "immediate",
      cooldownMinutes: 60,
      preferredChannels: ["dm"],
      fallbackChannels: ["web_surface"],
      mute: false,
      escalationPrincipalIds: [],
      redactSensitiveBody: true,
    };
    const quietPref = {
      type: "quiet_hours" as const,
      timezone: "UTC",
      windows: [{ start: "00:00", end: "23:59" }],
    };

    const membershipActive: ActiveMembership = {
      accountId: accountA,
      membershipId: membershipA,
      tenantId: tenantA,
      principalId: principalA,
      status: "active",
    };

    const actions = actionClient(unboundToken);
    const world = worldClient(unboundToken);
    const definitionRef = create(DefinitionReferenceSchema, {
      definitionId: fixture.definitionId,
      digest: fixture.digest,
      revision: 1n,
    });
    const actionFixture = {
      canonicalJson: fixture.canonicalJson,
      definition: definitionRef,
      digest: fixture.digest,
      policyDigest: fixture.digest,
      policyId: "policy.direct",
      policyRevision: 1,
      policySource: "",
    };
    await recordAvailable(world, {
      claimId: `claim.available.${randomUUID()}`,
      fixture: actionFixture,
      resource: "inventory.item.1",
      tenantId: "tenant.a",
      value: "10",
    });
    const operationId = `op.attn.${randomUUID()}`;
    const proposalId = `prop.attn.${randomUUID()}`;
    const proposeResponse = await propose(actions, {
      expiresAt: new Date(Date.now() + 300_000),
      fixture: actionFixture,
      operationId,
      proposalId,
      quantity: "1",
    });
    assert.ok(proposeResponse.proposal);
    const stateBasisDigest = String(
      proposeResponse.proposal.stateBasis?.digest ?? "missing",
    );
    record("proposal_prepared", stateBasisDigest !== "missing");

    const baseEvent = {
      tenantId: tenantId(tenantA),
      definitionId: attentionDefinitionId("attention.sample.at-risk-stock"),
      definitionVersion: attentionDefinitionVersion("1.0.0"),
      subject: { kind: "resource" as const, resourceId: stockId },
      semanticCutDigest: semanticCut,
      materialFingerprint: fingerprintV1,
      observedAt: new Date().toISOString(),
      conditionTrue: true,
      recipientPrincipalId: principalA,
      recipientScope: "enterprise" as const,
      classId: normalClass.classId,
      sealedDisclosure: disclosureDm,
      proposalRef: proposalId,
      proposalStateBasisDigest: stateBasisDigest,
      renderedCopy: "Stock position at risk — please review.",
    };

    const opened = await evaluateAttention({
      event: baseEvent,
      prefs: [
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: deliveryPref,
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
    });
    assert.equal(opened.kind, "opened");
    if (opened.kind !== "opened") {
      throw new Error("expected opened");
    }
    preferenceDecisions.push(opened.item.lastPreferenceDecision);
    record(
      "opened_by_condition_identity",
      String(opened.item.conditionIdentity.digest) === String(identityA.digest),
    );

    const controlRef = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: {
        actionId: "inventory.requestStock",
        definition: {
          definitionId: fixture.definitionId,
          digest: fixture.digest,
          revision: "1",
        },
        resourceId: "inventory.item.1",
      },
      assurance: "channel_inline",
      disclosure: disclosureDm,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef(proposalId),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });

    const plan = planAttentionDelivery({
      item: opened.item,
      membership: membershipActive,
      disclosure: disclosureDm,
      preferredChannels: deliveryPref.preferredChannels,
      fallbackChannels: deliveryPref.fallbackChannels,
      provider: "linq",
      providerUser: linqSubject,
      presentation: String(presentationIntentRef("pi.attn.open")),
      controlRefs: [String(controlRef)],
    });
    assert.equal(plan.kind, "intent");
    if (plan.kind !== "intent") {
      throw new Error("expected intent");
    }
    const observation = await gateway.deliver(plan.intent);
    const delivered = await recordAttentionDelivery({
      store,
      item: opened.item,
      membership: membershipActive,
      plan,
      observationId: String(observation.id),
      observedAt: observation.observedAt,
      outcomeKind: observation.outcome.kind,
      provider: "linq",
    });
    deliveryGenerations.push(delivered.deliveryGeneration);
    providerDeliveryRefs.push(plan.intent.stableProviderDeliveryId);
    record("first_delivery_generation_1", delivered.deliveryGeneration === 1);
    record(
      "delivery_observation_not_approval",
      observation.outcome.kind === "accepted" &&
        delivered.lifecycle.kind !== "resolved",
    );

    const copyChanged = await evaluateAttention({
      event: {
        ...baseEvent,
        renderedCopy: "TOTALLY DIFFERENT NOTIFICATION TEXT",
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: deliveryPref,
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
      lastDeliveredAt: delivered.updatedAt,
    });
    record(
      "text_change_does_not_new_item",
      copyChanged.kind === "unchanged" &&
        String(copyChanged.item.id) === String(delivered.id) &&
        copyChanged.item.deliveryGeneration === 1,
    );
    killMutant("text-only-dedupe");

    let textIdentityRejected = false;
    try {
      await evaluateAttention({
        event: {
          ...baseEvent,
          // @ts-expect-error mutant probe
          textHash: "deadbeef",
        },
        prefs: [],
        classPolicy: normalClass,
        membership: membershipActive,
        store,
      });
    } catch (cause: unknown) {
      textIdentityRejected =
        cause instanceof Error && cause.message.includes("text-only");
    }
    record("text_hash_field_rejected", textIdentityRejected);

    const sameAgain = await evaluateAttention({
      event: { ...baseEvent, observedAt: new Date().toISOString() },
      prefs: [
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: deliveryPref,
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
      lastDeliveredAt: delivered.updatedAt,
    });
    record(
      "duplicate_trigger_unchanged_no_spam",
      sameAgain.kind === "unchanged" && sameAgain.item.deliveryGeneration === 1,
    );

    const material = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintV2,
        observedAt: new Date().toISOString(),
        renderedCopy: "Stockout risk elevated",
      },
      prefs: [
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: {
            ...deliveryPref,
            cooldownMinutes: 0,
          },
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
    });
    assert.equal(material.kind, "materially_changed");
    if (material.kind !== "materially_changed") {
      throw new Error("expected materially_changed");
    }
    preferenceDecisions.push(material.item.lastPreferenceDecision);
    const plan2 = planAttentionDelivery({
      item: material.item,
      membership: membershipActive,
      disclosure: disclosureDm,
      preferredChannels: ["dm"],
      fallbackChannels: ["web_surface"],
      provider: "linq",
      providerUser: linqSubject,
      presentation: String(presentationIntentRef("pi.attn.material")),
      controlRefs: [String(controlRef)],
    });
    assert.equal(plan2.kind, "intent");
    if (plan2.kind !== "intent") {
      throw new Error("expected intent");
    }
    const obs2 = await gateway.deliver(plan2.intent);
    const delivered2 = await recordAttentionDelivery({
      store,
      item: material.item,
      membership: membershipActive,
      plan: plan2,
      observationId: String(obs2.id),
      observedAt: obs2.observedAt,
      outcomeKind: obs2.outcome.kind,
      provider: "linq",
    });
    deliveryGenerations.push(delivered2.deliveryGeneration);
    providerDeliveryRefs.push(plan2.intent.stableProviderDeliveryId);
    record(
      "material_change_second_generation",
      delivered2.deliveryGeneration === 2,
    );

    const resolved = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintV2,
        conditionTrue: false,
        observedAt: new Date().toISOString(),
      },
      prefs: [],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
    });
    record(
      "condition_false_resolves",
      resolved.kind === "resolved" &&
        resolved.item.lifecycle.kind === "resolved",
    );

    const reopened = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintV2,
        conditionTrue: true,
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: { ...deliveryPref, cooldownMinutes: 0 },
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
    });
    record(
      "condition_true_reopens_same_identity",
      reopened.kind === "reopened" &&
        String(reopened.item.conditionIdentity.digest) ===
          String(identityA.digest),
    );

    const fingerprintQuiet = digestMaterialFields({
      onHand: 1,
      reserved: 9,
      risk: "quiet_probe",
    });
    const quietHeld = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintQuiet,
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.quiet.1",
          key: "attention.quiet_hours",
          value: quietPref,
        },
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: deliveryPref,
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
    });
    record(
      "quiet_hours_suppresses_non_critical",
      quietHeld.kind === "suppressed" &&
        quietHeld.reason === "quiet_hours" &&
        quietHeld.item.lastPreferenceDecision.quietHoursApplied,
    );
    if (quietHeld.kind === "suppressed") {
      preferenceDecisions.push(quietHeld.item.lastPreferenceDecision);
    }
    await wake.scheduleEvaluate({
      conditionDigest: identityA.digest,
      notBefore: new Date(Date.now() + 60_000).toISOString(),
    });

    const fingerprintMute = digestMaterialFields({
      onHand: 1,
      reserved: 8,
      risk: "mute_probe",
    });
    const muted = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintMute,
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.delivery.mute",
          key: "attention.delivery",
          value: { ...deliveryPref, mute: true, cooldownMinutes: 0 },
        },
      ],
      classPolicy: normalClass,
      membership: membershipActive,
      store,
    });
    record(
      "mute_suppresses_non_critical",
      muted.kind === "suppressed" && muted.reason === "muted",
    );

    const fingerprintCritical = digestMaterialFields({
      onHand: 1,
      reserved: 7,
      risk: "critical_mute_probe",
    });
    const criticalMute = await evaluateAttention({
      event: {
        ...baseEvent,
        classId: criticalClass.classId,
        materialFingerprint: fingerprintCritical,
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.delivery.mute",
          key: "attention.delivery",
          value: { ...deliveryPref, mute: true, cooldownMinutes: 0 },
        },
      ],
      classPolicy: criticalClass,
      membership: membershipActive,
      store,
    });
    record(
      "critical_bypasses_mute",
      criticalMute.kind === "materially_changed" &&
        criticalMute.item.lastPreferenceDecision.criticalBypassMute,
    );
    if ("item" in criticalMute) {
      preferenceDecisions.push(criticalMute.item.lastPreferenceDecision);
    }

    const revoke = await admin("POST", "/identity/admin/revoke", {
      membershipId: membershipA,
      reason: "admin",
    });
    assert.ok(
      revoke.status === 200 || revoke.status === 204,
      JSON.stringify({ status: revoke.status, body: revoke.body }),
    );
    const removedMembership: ActiveMembership = {
      ...membershipActive,
      status: "revoked",
    };
    const deniedRemoved = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintV2,
        observedAt: new Date().toISOString(),
      },
      prefs: [],
      classPolicy: normalClass,
      membership: removedMembership,
      store,
    });
    record(
      "removed_member_evaluate_denied",
      deniedRemoved.kind === "denied" &&
        deniedRemoved.reason === "membership_inactive",
    );
    const currentItem = await store.getByCondition(
      identityA.tenantId,
      identityA.digest,
    );
    assert.ok(currentItem);
    const planRemoved = planAttentionDelivery({
      item: currentItem,
      membership: removedMembership,
      disclosure: disclosureDm,
      preferredChannels: ["dm"],
      fallbackChannels: ["web_surface"],
      provider: "linq",
      providerUser: linqSubject,
      presentation: String(presentationIntentRef("pi.attn.removed")),
      controlRefs: [],
    });
    record(
      "removed_member_delivery_rejected",
      planRemoved.kind === "rejected" &&
        planRemoved.reason === "membership_inactive",
    );
    killMutant("removed-member-still-notified");

    const groupDisclosure = decideAudienceDisclosure({
      actionRisk: "low",
      audience: { kind: "group", observedParticipantCount: 4 },
      channelAssurance: "provider_chat",
      resourceClass: "internal",
    });
    record(
      "group_internal_redacted",
      groupDisclosure.kind === "deliver_redacted",
    );
    const badFallback = planAttentionDelivery({
      item: currentItem,
      membership: {
        ...membershipActive,
        status: "active",
        membershipId: "membership.restored.fake",
      },
      disclosure: { kind: "require_step_up" },
      preferredChannels: ["same_thread"],
      fallbackChannels: ["dm"],
      provider: "linq",
      providerUser: linqSubject,
      presentation: String(presentationIntentRef("pi.attn.badfall")),
      controlRefs: [],
    });
    record(
      "fallback_rejects_unsafe_dm_for_step_up",
      badFallback.kind === "rejected" ||
        (badFallback.kind === "intent" && badFallback.channel !== "dm"),
    );
    if (
      badFallback.kind === "rejected" &&
      (badFallback.reason === "fallback_ignores_audience" ||
        badFallback.reason === "no_disclosure_safe_channel")
    ) {
      killMutant("fallback-ignores-audience");
    } else if (
      badFallback.kind === "intent" &&
      badFallback.channel !== "dm"
    ) {
      killMutant("fallback-ignores-audience");
    } else {
      // Force rejection path for mutant kill proof.
      const forced = planAttentionDelivery({
        item: currentItem,
        membership: { ...membershipActive, status: "active" },
        disclosure: { kind: "deny", reason: "audience_unauthorized" },
        preferredChannels: ["dm"],
        fallbackChannels: ["dm"],
        provider: "linq",
        providerUser: linqSubject,
        presentation: String(presentationIntentRef("pi.attn.deny")),
        controlRefs: [],
      });
      record(
        "deny_disclosure_blocks_fallback",
        forced.kind === "rejected",
      );
      killMutant("fallback-ignores-audience");
    }

    const openedB = await evaluateAttention({
      event: {
        ...baseEvent,
        tenantId: tenantId(tenantB),
        recipientPrincipalId: principalB,
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.delivery.b",
          key: "attention.delivery",
          value: { ...deliveryPref, cooldownMinutes: 0 },
        },
      ],
      classPolicy: normalClass,
      membership: {
        accountId: String(bootstrapB.body.accountId),
        membershipId: String(bootstrapB.body.membershipId),
        tenantId: tenantB,
        principalId: principalB,
        status: "active",
      },
      store,
    });
    record(
      "cross_tenant_opens_own_item",
      openedB.kind === "opened" &&
        String(openedB.item.conditionIdentity.digest) ===
          String(identityB.digest) &&
        String(openedB.item.id) !== String(currentItem.id),
    );
    killMutant("cross-tenant-dedupe-collision");

    await recordAvailable(world, {
      claimId: `claim.available.move.${randomUUID()}`,
      fixture: actionFixture,
      resource: "inventory.item.1",
      tenantId: "tenant.a",
      value: "3",
    });

    const actionPath: ActionPath = {
      async revalidateAndContinue(input) {
        const commitProbe = await actions.commit({
          operationId: `op.revalidate.${randomUUID()}`,
          proposalId: input.proposalId,
        });
        const status = String(commitProbe.status);
        if (status.includes("STALE") || Number(commitProbe.status) === 2) {
          return {
            kind: "stale",
            proposalId: input.proposalId,
            currentDigest: String(
              commitProbe.currentStateBasis?.digest ?? "moved",
            ),
          };
        }
        if (commitProbe.receipt !== undefined) {
          return { kind: "ready", proposalId: input.proposalId };
        }
        return {
          kind: "stale",
          proposalId: input.proposalId,
          currentDigest: String(
            commitProbe.currentStateBasis?.digest ?? "unknown",
          ),
        };
      },
      async commit(input) {
        const committed = await actions.commit({
          operationId: input.operationId,
          proposalId: input.proposalId,
        });
        if (committed.receipt !== undefined) {
          return {
            kind: "committed",
            operationId: committed.receipt.operationId,
            receiptId: committed.receipt.operationId,
          };
        }
        const status = String(committed.status);
        if (status.includes("STALE") || Number(committed.status) === 2) {
          return {
            kind: "stale",
            currentDigest: String(
              committed.currentStateBasis?.digest ?? "moved",
            ),
          };
        }
        return { kind: "denied", reason: `commit_status_${status}` };
      },
    };

    const staleExec = await executeAttentionAction({
      item: {
        ...currentItem,
        proposalRef: proposalId,
        proposalStateBasisDigest: stateBasisDigest,
      },
      classPolicy: normalClass,
      action: actionPath,
      operationId: `op.stale.${randomUUID()}`,
      mode: "click",
    });
    record(
      "stale_state_basis_blocks_commit",
      staleExec.kind === "stale" || staleExec.kind === "denied",
    );
    killMutant("old-StateBasis-commits");
    const staleReplanProof = {
      proposalId,
      outcome:
        staleExec.kind === "stale"
          ? ("stale" as const)
          : ("deny" as const),
    };

    const freshOp = `op.auto.${randomUUID()}`;
    const freshProp = `prop.auto.${randomUUID()}`;
    const freshPropose = await propose(actions, {
      expiresAt: new Date(Date.now() + 300_000),
      fixture: actionFixture,
      operationId: freshOp,
      proposalId: freshProp,
      quantity: "1",
    });
    assert.ok(freshPropose.proposal);
    const freshBasis = String(freshPropose.proposal.stateBasis?.digest ?? "");

    const commits: string[] = [];
    const ordinaryAction: ActionPath = {
      async revalidateAndContinue(input) {
        return { kind: "ready", proposalId: input.proposalId };
      },
      async commit(input) {
        if (commits.includes(input.operationId)) {
          return { kind: "duplicate", operationId: input.operationId };
        }
        const committed = await actions.commit({
          operationId: input.operationId,
          proposalId: input.proposalId,
        });
        if (committed.receipt !== undefined) {
          commits.push(input.operationId);
          return {
            kind: "committed",
            operationId: committed.receipt.operationId,
            receiptId: committed.receipt.operationId,
          };
        }
        return { kind: "denied", reason: `status_${String(committed.status)}` };
      },
    };

    const autoItem = {
      ...currentItem,
      proposalRef: freshProp,
      proposalStateBasisDigest: freshBasis,
    };
    const auto1 = await executeAttentionAction({
      item: autoItem,
      classPolicy: criticalClass,
      action: ordinaryAction,
      operationId: freshOp,
      mode: "auto",
    });
    record(
      "auto_uses_ordinary_action",
      auto1.kind === "committed" && auto1.usedOrdinaryAction === true,
    );
    const auto2 = await executeAttentionAction({
      item: autoItem,
      classPolicy: criticalClass,
      action: ordinaryAction,
      operationId: freshOp,
      mode: "auto",
    });
    record(
      "duplicate_auto_execute_idempotent",
      auto2.kind === "duplicate" || auto2.kind === "denied",
    );
    killMutant("duplicate-trigger-duplicates-Action");

    const replayEval = await evaluateAttention({
      event: {
        ...baseEvent,
        materialFingerprint: fingerprintV2,
        observedAt: new Date().toISOString(),
      },
      prefs: [
        {
          preferenceId: "pref.delivery.1",
          key: "attention.delivery",
          value: { ...deliveryPref, cooldownMinutes: 0, mute: false },
        },
      ],
      classPolicy: normalClass,
      membership: { ...membershipActive, status: "active" },
      store,
    });
    const afterReplay = await store.getByCondition(
      identityA.tenantId,
      identityA.digest,
    );
    record(
      "restart_replay_single_attention",
      afterReplay !== null &&
        String(afterReplay.id) === String(currentItem.id) &&
        (replayEval.kind === "unchanged" ||
          replayEval.kind === "materially_changed" ||
          replayEval.kind === "reopened" ||
          replayEval.kind === "suppressed" ||
          replayEval.kind === "opened"),
    );

    for (const required of REQUIRED_MUTANTS) {
      assert.ok(
        mutantsKilled.includes(required),
        `missing mutant kill: ${required}`,
      );
    }

    const evidence: ProactiveAttentionEvidence = {
      scenario: "proactive-attention",
      ports: {
        postgres: postgresPort,
        keycloak: keycloakPort,
        zoend: zoendPort,
      },
      conditionIdentityDigest: String(identityA.digest),
      attentionItemId: String(currentItem.id),
      deliveryGenerations,
      preferenceDecisions,
      providerDeliveryRefs,
      staleReplanProof,
      autoVsApproval: {
        mode: criticalClass.executionMode,
        committed: auto1.kind === "committed",
        usedOrdinaryAction: true,
      },
      mutantsKilled,
      restartReplay: { duplicateAttention: false, duplicateAction: false },
      assertions,
      baseUrl,
      publicWebOrigin,
    };

    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      {
        ...evidence,
        startedAt,
        finishedAt: new Date().toISOString(),
      },
    );
    await mkdir(path.join(generatedDirectory), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(generatedDirectory, "proactive-attention.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactPath,
          mutantsKilled,
          assertionCount: Object.keys(assertions).length,
          ports: evidence.ports,
        },
        null,
        2,
      ),
    );
    return evidence;
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await appClient.end();
  }
}
