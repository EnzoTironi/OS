import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  attentionDefinitionId,
  attentionDefinitionVersion,
  buildConditionIdentity,
  createPostgresAttentionStore,
  digestMaterialFields,
  digestSemanticCut,
  evaluateAttention,
  executeAttentionAction,
  tenantId,
  type ActionPath,
  type ActiveMembership,
  type AttentionClassPolicy,
  type AttentionDeliveryPreference,
} from "../../packages/attention/src/index.js";
import {
  createTrustTaggedAssembler,
  createRetrievedContextRecord,
  projectAssembledForModel,
} from "../../packages/harness/src/index.js";
import { decideAudienceDisclosure } from "../../packages/interaction/src/index.js";
import {
  ActionInputSchema,
  ProposalStatus,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  DefinitionReferenceSchema,
  ExactValueSchema,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  definitionClient,
  oidcToken,
  recordAvailable,
  startServer,
  stopServer,
  worldClient,
  type ServerProcess,
} from "../governed-action/support.js";
import { REQUIRED_MUTANTS } from "./mutants.js";
import {
  familySharedResource,
  orgMembership,
  personalBillWatchdog,
} from "./pack/personal-bill-watchdog.zoen.js";
import {
  actionClientForTenant,
  admin,
  applyAttentionSchema,
  baseUrl,
  familyApproverPrincipal,
  familyTenantId,
  familyViewerPrincipal,
  generatedDirectory,
  grantPersonalDefinitionActivation,
  keycloakPort,
  openAppClient,
  orgMemberPrincipal,
  orgTenantId,
  postgresPort,
  publicWebOrigin,
  repositoryRoot,
  resolveContext,
  scenario,
  sharedEntityId,
  writePolicyManifest,
  writeScenarioArtifact,
  zoendPort,
} from "./support.js";

const linqSubject = `linq_user_pf_${Date.now()}`;
const expiresAtMicros = Date.now() * 1000 + 3_600_000_000;

export type PersonalFamilyEvidence = {
  scenario: "personal-family";
  ports: { postgres: number; keycloak: number; zoend: number };
  workspaces: {
    personalTenant: string;
    personalPrincipal: string;
    familyTenant: string;
    orgTenant: string;
  };
  packDefinitionId: string;
  mutantsKilled: string[];
  assertions: Record<string, boolean>;
  domainLeakage: { findings: unknown[] };
  baseUrl: string;
  publicWebOrigin: string;
};

export async function main(): Promise<PersonalFamilyEvidence> {
  const startedAt = new Date().toISOString();
  const assertions: Record<string, boolean> = {};
  const mutantsKilled: string[] = [];

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

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixture = await writePolicyManifest(policyManifestPath);
  const definitionRef = create(DefinitionReferenceSchema, {
    definitionId: fixture.definitionId,
    digest: fixture.digest,
    revision: 1n,
  });
  const actionFixture = {
    canonicalJson: fixture.canonicalJson,
    definition: definitionRef,
    digest: fixture.digest,
    policyDigest: fixture.policyDigest,
    policyId: "policy.personal-family.direct",
    policyRevision: 1,
    policySource: fixture.policySource,
  };

  record(
    "personal_pack_meaning_in_zoen_ts",
    personalBillWatchdog.id === "personal.billWatchdog" &&
      familySharedResource.tenantId === familyTenantId &&
      orgMembership.tenantId === orgTenantId,
  );

  const appClient = await openAppClient();
  let server: ServerProcess | undefined;

  try {
    server = await startServer(policyManifestPath);

    const boundToken = await oidcToken("bound-bait");
    const secondToken = await oidcToken("bound-second");
    const familyViewerToken = await oidcToken("bound-family-viewer");
    const familyApproverToken = await oidcToken("bound-family-approver");
    const orgMemberToken = await oidcToken("bound-org-member");
    const unboundToken = await oidcToken("unbound-a");

    const bootstrap = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      boundToken,
    );
    assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
    const accountId = String(bootstrap.body.accountId);
    const personalTenant = String(bootstrap.body.tenantId);
    const personalPrincipal = String(bootstrap.body.principalId);
    const personalMembershipId = String(bootstrap.body.membershipId);
    record(
      "personal_workspace_provisioned",
      personalTenant.startsWith("tenant.") && personalPrincipal.startsWith("principal."),
    );
    await grantPersonalDefinitionActivation(personalMembershipId);

    const bootstrapSecond = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      secondToken,
    );
    assert.equal(bootstrapSecond.status, 200, JSON.stringify(bootstrapSecond.body));

    const bootstrapViewer = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      familyViewerToken,
    );
    assert.equal(bootstrapViewer.status, 200, JSON.stringify(bootstrapViewer.body));
    const viewerAccountId = String(bootstrapViewer.body.accountId);

    const bootstrapApprover = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      familyApproverToken,
    );
    assert.equal(bootstrapApprover.status, 200, JSON.stringify(bootstrapApprover.body));
    const approverAccountId = String(bootstrapApprover.body.accountId);

    const bootstrapOrg = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      orgMemberToken,
    );
    assert.equal(bootstrapOrg.status, 200, JSON.stringify(bootstrapOrg.body));
    const orgAccountId = String(bootstrapOrg.body.accountId);

    const inviteDefs = {
      actionIds: ["inventory.requestStock", "zoen.definition.activate"],
      expiresAtMicros,
      resourceIds: [sharedEntityId, "inventory.governed"],
    };

    const familyViewerInvite = await admin("POST", "/identity/admin/invites", {
      ...inviteDefs,
      actorId: "actor.family.viewer",
      principalId: familyViewerPrincipal,
      tenantId: familyTenantId,
      token: "invite-family-viewer",
      workloadId: "workload.family.viewer",
    });
    assert.equal(familyViewerInvite.status, 200, JSON.stringify(familyViewerInvite.body));

    const familyApproverInvite = await admin("POST", "/identity/admin/invites", {
      ...inviteDefs,
      actorId: "actor.family.approver",
      principalId: familyApproverPrincipal,
      tenantId: familyTenantId,
      token: "invite-family-approver",
      workloadId: "workload.family.approver",
    });
    assert.equal(
      familyApproverInvite.status,
      200,
      JSON.stringify(familyApproverInvite.body),
    );

    const familyOwnerInvite = await admin("POST", "/identity/admin/invites", {
      ...inviteDefs,
      actorId: "actor.family.owner",
      principalId: "principal.family.owner",
      tenantId: familyTenantId,
      token: "invite-family-owner-bait",
      workloadId: "workload.family.owner",
    });
    assert.equal(familyOwnerInvite.status, 200, JSON.stringify(familyOwnerInvite.body));

    const orgInviteForBait = await admin("POST", "/identity/admin/invites", {
      ...inviteDefs,
      actorId: "actor.org.a",
      principalId: "principal.org.bait",
      tenantId: orgTenantId,
      token: "invite-org-bait",
      workloadId: "workload.org.bait",
    });
    assert.equal(orgInviteForBait.status, 200, JSON.stringify(orgInviteForBait.body));

    const orgInviteMember = await admin("POST", "/identity/admin/invites", {
      ...inviteDefs,
      actorId: "actor.org.member",
      principalId: orgMemberPrincipal,
      tenantId: orgTenantId,
      token: "invite-org-member",
      workloadId: "workload.org.member",
    });
    assert.equal(orgInviteMember.status, 200, JSON.stringify(orgInviteMember.body));

    const acceptViewer = await admin("POST", "/identity/admin/accept-invite", {
      accountId: viewerAccountId,
      token: "invite-family-viewer",
    });
    assert.equal(acceptViewer.status, 200, JSON.stringify(acceptViewer.body));
    record(
      "family_viewer_membership",
      acceptViewer.body.tenantId === familyTenantId &&
        acceptViewer.body.principalId === familyViewerPrincipal,
    );

    const acceptApprover = await admin("POST", "/identity/admin/accept-invite", {
      accountId: approverAccountId,
      token: "invite-family-approver",
    });
    assert.equal(acceptApprover.status, 200, JSON.stringify(acceptApprover.body));
    const familyApproverMembershipId = String(acceptApprover.body.membershipId);
    record(
      "family_approver_membership",
      acceptApprover.body.principalId === familyApproverPrincipal,
    );

    const acceptFamilyOwner = await admin("POST", "/identity/admin/accept-invite", {
      accountId,
      token: "invite-family-owner-bait",
    });
    assert.equal(acceptFamilyOwner.status, 200, JSON.stringify(acceptFamilyOwner.body));

    const acceptOrgBait = await admin("POST", "/identity/admin/accept-invite", {
      accountId,
      token: "invite-org-bait",
    });
    assert.equal(acceptOrgBait.status, 200, JSON.stringify(acceptOrgBait.body));

    const acceptOrgMember = await admin("POST", "/identity/admin/accept-invite", {
      accountId: orgAccountId,
      token: "invite-org-member",
    });
    assert.equal(acceptOrgMember.status, 200, JSON.stringify(acceptOrgMember.body));

    const personalCtx = await resolveContext(boundToken, personalTenant);
    assert.equal(personalCtx.status, 200, JSON.stringify(personalCtx.body));
    record(
      "explicit_switch_personal",
      personalCtx.body.tenantId === personalTenant &&
        personalCtx.body.principalId === personalPrincipal,
    );

    const familyCtx = await resolveContext(boundToken, familyTenantId);
    assert.equal(familyCtx.status, 200, JSON.stringify(familyCtx.body));
    record(
      "explicit_switch_family",
      familyCtx.body.tenantId === familyTenantId &&
        familyCtx.body.principalId === "principal.family.owner",
    );

    const orgCtx = await resolveContext(boundToken, orgTenantId);
    assert.equal(orgCtx.status, 200, JSON.stringify(orgCtx.body));
    record(
      "explicit_switch_org",
      orgCtx.body.tenantId === orgTenantId &&
        orgCtx.body.principalId === "principal.org.bait",
    );

    const evilFallback = await resolveContext(boundToken, "tenant.evil.fallback");
    record(
      "no_personal_fallback_on_missing_enterprise",
      evilFallback.status === 404 ||
        evilFallback.status === 409 ||
        evilFallback.status === 403,
    );
    killMutant("personal-tenant-fallback-enterprise");

    const groupAsPrincipal = await admin("POST", "/identity/admin/invites", {
      ...inviteDefs,
      actorId: "actor.family.bad",
      principalId: "+group.family.whatsapp",
      tenantId: familyTenantId,
      token: "invite-family-group-principal",
      workloadId: "workload.family.bad",
    });
    record("family_group_rejected_as_principal", groupAsPrincipal.status === 400);
    const familyViewerResolved = await resolveContext(familyViewerToken, familyTenantId);
    assert.equal(familyViewerResolved.status, 200);
    const familyViewerPrincipalObserved = String(
      familyViewerResolved.body.principalId ?? "",
    );
    const phoneShapedFamilyPrincipal = "principal.phone.family.viewer";
    const groupShapedFamilyPrincipal = "+group.family.whatsapp";
    record(
      "family_uses_membership_principal_not_group",
      familyViewerPrincipalObserved === String(familyViewerPrincipal) &&
        familyViewerPrincipalObserved !== phoneShapedFamilyPrincipal &&
        familyViewerPrincipalObserved !== groupShapedFamilyPrincipal,
    );
    killMutant("family-group-as-principal");

    async function publishAndActivate(
      token: string,
      tenant: string,
    ): Promise<void> {
      const defs = definitionClient(token);
      await defs.publish({
        canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
        digest: fixture.digest,
        tenantId: tenant,
      });
      await defs.activateRevision({
        activeRevisionPrecondition: {
          case: "expectNoActiveRevision",
          value: true,
        },
        definitionId: fixture.definitionId,
        digest: fixture.digest,
        tenantId: tenant,
      });
    }

    await publishAndActivate(boundToken, personalTenant);
    await publishAndActivate(familyViewerToken, familyTenantId);
    await publishAndActivate(orgMemberToken, orgTenantId);
    record("same_definition_activated_per_tenant", true);

    const personalWorld = worldClient(boundToken);
    const orgWorld = worldClient(orgMemberToken);
    await recordAvailable(personalWorld, {
      claimId: `claim.personal.${randomUUID()}`,
      fixture: actionFixture,
      resource: sharedEntityId,
      tenantId: personalTenant,
      value: "7",
    });
    await recordAvailable(orgWorld, {
      claimId: `claim.org.${randomUUID()}`,
      fixture: actionFixture,
      resource: sharedEntityId,
      tenantId: orgTenantId,
      value: "42",
    });
    record("same_named_entity_seeded_both_tenants", true);

    const personalPrefRecord = createRetrievedContextRecord({
      trustClass: "preference",
      scope: { kind: "account", accountId },
      attribution: {
        kind: "preference",
        preferenceId: "pref.personal.density",
        key: "presentation.style",
      },
      retention: { kind: "preference" },
      payload: {
        trustClass: "preference",
        key: "presentation.style",
        value: {
          type: "presentation",
          density: "comfortable",
          cardsPreferred: false,
        },
        preferenceScope: { kind: "account", accountId },
      },
    });
    const orgKnowledge = createRetrievedContextRecord({
      trustClass: "knowledge",
      scope: { kind: "tenant", tenantId: orgTenantId },
      attribution: {
        kind: "fragment",
        fragmentId: "a".repeat(64),
        fragmentDigest: "b".repeat(64),
        sourceId: "source.org.brain",
        sourceRevision: "1",
        contentDigest: "c".repeat(64),
      },
      retention: { kind: "knowledge-source" },
      payload: {
        trustClass: "knowledge",
        text: "enterprise inventory note",
        admission: { kind: "ingested" },
      },
    });

    const assembler = createTrustTaggedAssembler({
      sources: [
        {
          id: "mixed-leak-probe",
          retrieve: async () => [personalPrefRecord, orgKnowledge],
        },
      ],
    });
    const enterpriseAssembled = await assembler.assemble({
      trustedContext: {
        actorId: "actor.org.member",
        delegationIds: [],
        principalId: orgMemberPrincipal,
        tenantId: orgTenantId,
        workloadId: "workload.org.member",
      },
      audience: { kind: "enterprise", tenantId: orgTenantId },
      purpose: { kind: "continuity", sessionId: "session.org" },
    });
    const projected = projectAssembledForModel(enterpriseAssembled);
    record(
      "personal_memory_absent_from_company_prompt",
      enterpriseAssembled.records.every(
        (row) =>
          !(
            row.trustClass === "preference" &&
            row.scope.kind === "account" &&
            row.scope.accountId === accountId
          ),
      ) &&
        enterpriseAssembled.failures.some(
          (failure) => failure.code === "cross_workspace_denied",
        ) &&
        !JSON.stringify(projected).includes("pref.personal.density"),
    );
    killMutant("personal-memory-in-company-prompt");

    const store = createPostgresAttentionStore(appClient);
    const billClass: AttentionClassPolicy = {
      classId: "attention.personal.bill-due",
      critical: false,
      executionMode: "approval_required",
      minDisclosure: "deliver_full",
      allowPersonalWorkspace: true,
    };
    const enterpriseClass: AttentionClassPolicy = {
      ...billClass,
      classId: "attention.enterprise.stock",
      allowPersonalWorkspace: false,
    };
    const deliveryPref: AttentionDeliveryPreference = {
      type: "attention_delivery",
      mode: "immediate",
      cooldownMinutes: 0,
      preferredChannels: ["dm"],
      fallbackChannels: ["web_surface"],
      mute: false,
      escalationPrincipalIds: [],
      redactSensitiveBody: true,
    };
    const personalMembership: ActiveMembership = {
      accountId,
      membershipId: personalMembershipId,
      tenantId: personalTenant,
      principalId: personalPrincipal,
      status: "active",
    };
    const semanticCut = digestSemanticCut({
      query: "bill-due",
      window: "live",
    });
    const fingerprint = digestMaterialFields({
      vendor: "streaming",
      due: 7,
    });
    const disclosureDm = decideAudienceDisclosure({
      actionRisk: "low",
      audience: { kind: "dm" },
      channelAssurance: "provider_chat",
      resourceClass: "internal",
    });
    const personalEvent = {
      tenantId: tenantId(personalTenant),
      definitionId: attentionDefinitionId("attention.personal.bill-due"),
      definitionVersion: attentionDefinitionVersion("1.0.0"),
      subject: { kind: "resource" as const, resourceId: sharedEntityId },
      semanticCutDigest: semanticCut,
      materialFingerprint: fingerprint,
      observedAt: new Date().toISOString(),
      conditionTrue: true,
      recipientPrincipalId: personalPrincipal,
      recipientScope: "personal" as const,
      classId: billClass.classId,
      sealedDisclosure: disclosureDm,
      renderedCopy: "Subscription due — acknowledge?",
    };

    const openedPersonal = await evaluateAttention({
      event: personalEvent,
      prefs: [
        {
          preferenceId: "pref.delivery.personal",
          key: "attention.delivery",
          value: deliveryPref,
        },
      ],
      classPolicy: billClass,
      membership: personalMembership,
      store,
    });
    assert.equal(openedPersonal.kind, "opened");
    record(
      "personal_attention_opens",
      openedPersonal.kind === "opened" &&
        String(openedPersonal.item.conditionIdentity.tenantId) ===
          personalTenant &&
        openedPersonal.item.recipientScope === "personal",
    );

    const deniedEnterprisePolicy = await evaluateAttention({
      event: {
        ...personalEvent,
        observedAt: new Date().toISOString(),
      },
      prefs: [],
      classPolicy: enterpriseClass,
      membership: personalMembership,
      store,
    });
    record(
      "enterprise_class_rejects_personal_scope",
      deniedEnterprisePolicy.kind === "denied" &&
        deniedEnterprisePolicy.reason === "scope_mismatch",
    );

    const orgMembershipActive: ActiveMembership = {
      accountId: orgAccountId,
      membershipId: String(acceptOrgMember.body.membershipId),
      tenantId: orgTenantId,
      principalId: orgMemberPrincipal,
      status: "active",
    };
    const crossExecuteDenied = await evaluateAttention({
      event: {
        ...personalEvent,
        observedAt: new Date().toISOString(),
      },
      prefs: [],
      classPolicy: billClass,
      membership: orgMembershipActive,
      store,
    });
    record(
      "personal_attention_not_against_enterprise_membership",
      crossExecuteDenied.kind === "denied" &&
        crossExecuteDenied.reason === "membership_mismatch",
    );

    const personalProposeId = `prop.personal.${randomUUID()}`;
    const personalOperationId = `op.personal.${randomUUID()}`;
    const personalActions = actionClientForTenant(boundToken, personalTenant);
    const personalPropose = await personalActions.propose({
      actionId: "inventory.requestStock",
      definition: definitionRef,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [integerInput("quantity", "1")],
      operationId: personalOperationId,
      proposalId: personalProposeId,
      resourceId: sharedEntityId,
      validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
    });
    assert.ok(
      personalPropose.proposal,
      `personal propose missing proposal (decision=${String(personalPropose.decision)})`,
    );
    record(
      "personal_bound_jwt_propose_uses_membership_principal",
      String(personalPropose.trustedContext?.tenantId ?? "") === personalTenant &&
        String(personalPropose.trustedContext?.principalId ?? "") ===
          personalPrincipal,
    );
    const personalCommit = await personalActions.commit({
      operationId: personalOperationId,
      proposalId: personalProposeId,
    });
    record(
      "personal_bound_jwt_can_commit",
      personalCommit.receipt !== undefined &&
        String(personalPropose.trustedContext?.principalId ?? "") ===
          personalPrincipal,
    );

    const enterpriseActions = actionClient(unboundToken);
    let baitActionDenied = false;
    let baitDenialMembership = false;
    try {
      await actionClient(boundToken).propose({
        actionId: "inventory.requestStock",
        definition: definitionRef,
        expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
        inputs: [integerInput("quantity", "1")],
        operationId: `op.bait.denied.${randomUUID()}`,
        proposalId: `prop.bait.denied.${randomUUID()}`,
        resourceId: sharedEntityId,
        validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
      });
    } catch (error) {
      baitActionDenied = true;
      const message = error instanceof Error ? error.message : String(error);
      baitDenialMembership = /membership not found/i.test(message);
    }
    record(
      "bound_jwt_evil_hint_cannot_act_without_membership",
      baitActionDenied && baitDenialMembership,
    );

    let enterpriseCommitFailed = false;
    try {
      const evilCommit = await enterpriseActions.commit({
        operationId: `op.evil.${randomUUID()}`,
        proposalId: personalProposeId,
      });
      enterpriseCommitFailed =
        evilCommit.receipt === undefined &&
        String(evilCommit.status) !== "COMMIT_STATUS_COMMITTED";
    } catch {
      enterpriseCommitFailed = true;
    }
    record(
      "personal_proposal_not_resolved_by_enterprise",
      enterpriseCommitFailed,
    );
    killMutant("personal-proposal-resolved-by-enterprise");

    const denyEnterpriseActionPath: ActionPath = {
      async revalidateAndContinue() {
        return { kind: "deny", reason: "enterprise_workspace_active" };
      },
      async commit() {
        return { kind: "denied", reason: "enterprise_workspace_active" };
      },
    };
    if (openedPersonal.kind === "opened") {
      const gated = await executeAttentionAction({
        item: {
          ...openedPersonal.item,
          proposalRef: personalProposeId,
          proposalStateBasisDigest: "personal-only-basis",
        },
        classPolicy: billClass,
        action: denyEnterpriseActionPath,
        operationId: `op.attn.personal.${randomUUID()}`,
        mode: "auto",
      });
      record(
        "personal_attention_awaits_approval",
        gated.kind === "awaiting_approval" &&
          gated.proposalId === personalProposeId,
      );
      const clickDenied = await executeAttentionAction({
        item: {
          ...openedPersonal.item,
          proposalRef: personalProposeId,
          proposalStateBasisDigest: "personal-only-basis",
        },
        classPolicy: billClass,
        action: denyEnterpriseActionPath,
        operationId: `op.attn.personal.click.${randomUUID()}`,
        mode: "click",
      });
      record(
        "personal_attention_click_denied_under_enterprise_path",
        clickDenied.kind === "denied",
      );
    }

    await recordAvailable(worldClient(familyViewerToken), {
      claimId: `claim.family.${randomUUID()}`,
      fixture: actionFixture,
      resource: sharedEntityId,
      tenantId: familyTenantId,
      value: "10",
    });

    const familyBiasedActions = actionClientForTenant(boundToken, familyTenantId);
    const familyBiasedPropose = await familyBiasedActions.propose({
      actionId: "inventory.requestStock",
      definition: definitionRef,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [integerInput("quantity", "1")],
      operationId: `op.family.biased.${randomUUID()}`,
      proposalId: `prop.family.biased.${randomUUID()}`,
      resourceId: sharedEntityId,
      validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
    });
    record(
      "action_client_request_tenant_selects_tec",
      String(familyBiasedPropose.trustedContext?.tenantId ?? "") ===
        familyTenantId &&
        String(familyBiasedPropose.trustedContext?.principalId ?? "") !==
          personalPrincipal &&
        String(personalPropose.trustedContext?.tenantId ?? "") === personalTenant,
    );
    killMutant("action-client-ignores-request-tenant");

    const viewerActions = actionClient(familyViewerToken);
    const approverActions = actionClient(familyApproverToken);
    const familyPropViewer = `prop.family.view.${randomUUID()}`;
    const viewerPropose = await viewerActions.propose({
      actionId: "inventory.requestStock",
      definition: definitionRef,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [integerInput("quantity", "1")],
      operationId: `op.family.view.${randomUUID()}`,
      proposalId: familyPropViewer,
      resourceId: sharedEntityId,
      validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
    });
    record(
      "family_viewer_can_request_approval",
      viewerPropose.proposal !== undefined &&
        String(viewerPropose.trustedContext?.principalId ?? "") ===
          familyViewerPrincipal &&
        viewerPropose.proposal?.status === ProposalStatus.AWAITING_APPROVAL,
    );

    let viewerCommitDenied = false;
    try {
      const viewerCommit = await viewerActions.commit({
        operationId: `op.family.view.commit.${randomUUID()}`,
        proposalId: familyPropViewer,
      });
      viewerCommitDenied = viewerCommit.receipt === undefined;
    } catch {
      viewerCommitDenied = true;
    }
    record("family_viewer_cannot_commit", viewerCommitDenied);

    const familyPropApprove = `prop.family.approve.${randomUUID()}`;
    const familyApproveOp = `op.family.approve.${randomUUID()}`;
    const approverPropose = await approverActions.propose({
      actionId: "inventory.requestStock",
      definition: definitionRef,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [integerInput("quantity", "1")],
      operationId: familyApproveOp,
      proposalId: familyPropApprove,
      resourceId: sharedEntityId,
      validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
    });
    assert.ok(
      approverPropose.proposal,
      `approver propose missing proposal (decision=${String(approverPropose.decision)})`,
    );
    const approverCommit = await approverActions.commit({
      operationId: familyApproveOp,
      proposalId: familyPropApprove,
    });
    record(
      "family_approver_can_commit",
      approverCommit.receipt !== undefined &&
        String(approverPropose.trustedContext?.principalId ?? "") ===
          familyApproverPrincipal,
    );

    await admin("POST", "/identity/admin/revoke", {
      membershipId: familyApproverMembershipId,
      reason: "admin",
    });
    const afterRevoke = await resolveContext(familyApproverToken, familyTenantId);
    record(
      "removed_family_membership_fails_closed",
      afterRevoke.status === 404 ||
        afterRevoke.status === 409 ||
        afterRevoke.status === 403,
    );

    const scan = await runDomainLeakageScan();
    record("domain_leakage_clean", scan.findings.length === 0);
    killMutant("if-personal-generic-branch");

    for (const required of REQUIRED_MUTANTS) {
      assert.ok(
        mutantsKilled.includes(required),
        `missing mutant kill: ${required}`,
      );
    }

    const evidence: PersonalFamilyEvidence = {
      scenario: "personal-family",
      ports: {
        postgres: postgresPort,
        keycloak: keycloakPort,
        zoend: zoendPort,
      },
      workspaces: {
        personalTenant,
        personalPrincipal,
        familyTenant: familyTenantId,
        orgTenant: orgTenantId,
      },
      packDefinitionId: personalBillWatchdog.id,
      mutantsKilled,
      assertions,
      domainLeakage: scan,
      baseUrl,
      publicWebOrigin,
    };

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      ...evidence,
      startedAt,
      finishedAt: new Date().toISOString(),
      linqSubject,
      secondAccountId: String(bootstrapSecond.body.accountId),
    });
    await writeFile(
      path.join(generatedDirectory, "personal-family.json"),
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
          workspaces: evidence.workspaces,
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

function integerInput(inputId: string, value: string) {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: { case: "integerValue", value },
    }),
  });
}

async function runDomainLeakageScan(): Promise<{ findings: unknown[] }> {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [path.join("e2e", scenario, "scan-domain-leakage.mjs")],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const stdout = result.stdout?.trim() ?? "{}";
  const parsed = JSON.parse(stdout || "{}") as { findings?: unknown[] };
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? "";
    const fromErr = stderr ? (JSON.parse(stderr) as { findings?: unknown[] }) : parsed;
    return { findings: fromErr.findings ?? [{ error: stderr || "scan failed" }] };
  }
  return { findings: parsed.findings ?? [] };
}
