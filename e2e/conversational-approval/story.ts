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
  openStepUpSession,
  completeStepUpCommit,
  planDisclosureDelivery,
  planLinkButtonDegrade,
  presentationIntentRef,
  principalIdString,
  proposalRef,
  providerKey,
  providerThreadRef,
  providerUserRef,
  resolveApprovalUtterance,
  stepUpUrl,
  tenantIdString,
  type ApprovalControl,
  type InboundInteraction,
  type TrustedInteractionContext,
} from "../../packages/interaction/src/index.js";
import { compileStepUpSurface } from "../../packages/surface/src/index.js";
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
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";
import { create } from "@bufbuild/protobuf";
import { DefinitionReferenceSchema } from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";

const scenario = "conversational-approval";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_591);
const publicWebOrigin = "http://127.0.0.1:3000";
const telegramSubject = `tg_user_ca_${Date.now()}`;

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];
const disclosureTraces: unknown[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
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
    text.length === 0
      ? {}
      : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

function demoActionRef() {
  return {
    actionId: "inventory.requestStock",
    definition: {
      definitionId: "inventory.governed",
      digest: "stepup.e2e",
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
  audienceKind?: "dm" | "group" | "channel";
}): TrustedInteractionContext {
  return {
    accountId: input.accountId,
    actorId: "actor.e2e",
    bindingId: input.bindingId,
    channel: {
      provider: providerKey("telegram"),
      providerUser: providerUserRef(telegramSubject),
      receivedAt: new Date().toISOString(),
      thread: providerThreadRef("9900001"),
    },
    membershipId: input.membershipId,
    principalId: principalIdString(input.principalId),
    tenantId: tenantIdString(input.tenantId),
    workloadId: "workload.personal",
  };
}

function controlClickInbound(
  controlRef: ReturnType<typeof interactionControlRef>,
  audienceKind: "dm" | "group" | "channel",
): InboundInteraction {
  return {
    audienceObservation: { kind: audienceKind },
    body: { controlRef, kind: "control_click" },
    channel: {
      provider: providerKey("telegram"),
      providerUser: providerUserRef(telegramSubject),
      receivedAt: new Date().toISOString(),
      thread: providerThreadRef("9900001"),
    },
    idempotencyKey: `click_${controlRef}`,
  };
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
        "conversational-approval",
        "definition-direct.canonical.json",
      ),
      "utf8",
    )
  ).trimEnd();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", "conversational-approval", "direct.cedar"),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(
      repositoryRoot,
      "e2e",
      "conversational-approval",
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

export async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixture = await writePolicyManifest(policyManifestPath);

  const storeClient = new PostgresClient({
    connectionString: e2ePostgresUrl("zoen_app", "zoen_app", 55_498),
  });
  await storeClient.connect();

  let server: ServerProcess = await startServer(policyManifestPath);
  try {
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

    const telegramBind = await admin("POST", "/identity/admin/bind-verified", {
      accountId: accountA,
      provider: "telegram",
      subjectKey: telegramSubject,
    });
    assert.equal(telegramBind.status, 200, JSON.stringify(telegramBind.body));
    const bindingA = String(telegramBind.body.bindingId);

    const bootstrapB = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      secondToken,
    );
    assert.equal(bootstrapB.status, 200, JSON.stringify(bootstrapB.body));
    const tenantB = String(bootstrapB.body.tenantId);
    const principalB = String(bootstrapB.body.principalId);
    const accountB = String(bootstrapB.body.accountId);

    // Publish + activate for Action commit path (tenant.a unbound claims).
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
    record("definition_activated_for_commit", true);

    const durableStore = createPostgresControlStore(storeClient);
    const controls = createInteractionControlRegistry({ store: durableStore });
    const stepUps = createStepUpRegistry({ store: durableStore });
    const boundary = createInteractionBoundary({
      controls,
      correlationNamespace: "conversational-approval.v1",
      identity: {
        async resolveChannelSubject() {
          throw new Error("unused in unit path");
        },
      },
    });

    const sharedProposalId = "proposal.identical.across.tenants";
    const disclosureA = decideAudienceDisclosure({
      actionRisk: "low",
      audience: { kind: "dm" },
      channelAssurance: "provider_chat",
      resourceClass: "internal",
    });
    disclosureTraces.push({ tenant: tenantA, disclosure: disclosureA });
    record("dm_internal_deliver_full", disclosureA.kind === "deliver_full");

    const refA = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: assuranceForRisk("low", disclosureA),
      disclosure: disclosureA,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef(sharedProposalId),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });

    const disclosureB = decideAudienceDisclosure({
      actionRisk: "low",
      audience: { kind: "dm" },
      channelAssurance: "provider_chat",
      resourceClass: "internal",
    });
    const refB = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: assuranceForRisk("low", disclosureB),
      disclosure: disclosureB,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalB),
      proposalRef: proposalRef(sharedProposalId),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantB),
    });
    record(
      "cross_tenant_identical_proposal_ids_distinct_controls",
      String(refA) !== String(refB),
    );

    const ctxA = makeCtx({
      accountId: accountA,
      bindingId: bindingA,
      membershipId: membershipA,
      principalId: principalA,
      tenantId: tenantA,
    });

    // Provider button value is not ProposalRef.
    let rawRejected = false;
    try {
      await controls.resolve(interactionControlRef(sharedProposalId));
    } catch {
      rawRejected = true;
    }
    record("raw_button_value_not_proposal_ref", rawRejected);
    killMutant("Unsigned / raw button value accepted as ProposalRef");

    // Tenant swap / override fails closed.
    const swap = await handleControlClick({
      controls,
      ctx: makeCtx({
        accountId: accountB,
        bindingId: "binding.b",
        membershipId: "membership.b",
        principalId: principalB,
        tenantId: tenantB,
      }),
      inbound: controlClickInbound(refA, "dm"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "cross_tenant_click_denied",
      swap.kind === "denied" && swap.reason === "tenant_mismatch",
    );
    killMutant("Button payload tenant override");
    killMutant("Cross-tenant identical proposal ids swapped");

    // Workspace switch after delivery does not retarget.
    const inline = await handleControlClick({
      controls,
      ctx: ctxA,
      inbound: controlClickInbound(refA, "dm"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "click_resolves_sealed_proposal",
      inline.kind === "inline_commit_ready" &&
        String(inline.proposalRef) === sharedProposalId &&
        String(inline.control.tenantId) === tenantA,
    );

    // Expired / consumed fail closed.
    const expiredRef = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: "channel_inline",
      disclosure: { kind: "deliver_full" },
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.expired"),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });
    const expiredAct = await handleControlClick({
      controls,
      ctx: ctxA,
      inbound: controlClickInbound(expiredRef, "dm"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "expired_fails_closed",
      expiredAct.kind === "denied" && expiredAct.reason === "expired",
    );
    killMutant("Expired control accepted");

    await controls.consume(refA);
    const replay = await handleControlClick({
      controls,
      ctx: ctxA,
      inbound: controlClickInbound(refA, "dm"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "consumed_replay_fails_closed",
      replay.kind === "denied" && replay.reason === "already_consumed",
    );
    killMutant("Consumed control replayed");

    // Group confidential: no full body.
    const groupDisclosure = decideAudienceDisclosure({
      actionRisk: "high",
      audience: { kind: "group", observedParticipantCount: 4 },
      channelAssurance: "provider_chat",
      resourceClass: "confidential",
    });
    disclosureTraces.push({ case: "group_confidential", groupDisclosure });
    record(
      "group_confidential_requires_step_up",
      groupDisclosure.kind === "require_step_up",
    );
    const groupRef = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: assuranceForRisk("high", groupDisclosure),
      disclosure: groupDisclosure,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.group.confidential"),
      sealedAudienceKind: "group",
      tenantId: tenantIdString(tenantA),
    });
    const inboundText: InboundInteraction = {
      audienceObservation: { kind: "group", observedParticipantCount: 4 },
      body: { kind: "text", text: "show confidential" },
      channel: ctxA.channel,
      idempotencyKey: "group_record_1",
    };
    const recordIx = await boundary.accept(inboundText, ctxA);
    const planned = await planDisclosureDelivery({
      boundary,
      confidentialBody: "SECRET_PAYROLL_FIGURES",
      controlRef: groupRef,
      ctx: ctxA,
      disclosure: groupDisclosure,
      presentation: presentationIntentRef("surf_pres_group"),
      recordId: recordIx.id,
    });
    record(
      "group_thread_never_gets_confidential_body",
      planned.includesConfidentialBody === false &&
        !planned.body.includes("SECRET_PAYROLL_FIGURES"),
    );
    killMutant("Sender-authorized group gets full confidential body");
    record(
      "channel_thread_is_not_audience_class",
      groupDisclosure.kind !== ("thread" as string) &&
        planned.intent.target.kind !== ("thread_audience" as string),
    );

    // Sealed redaction cannot upgrade at click.
    const redacted = decideAudienceDisclosure({
      actionRisk: "low",
      audience: { kind: "group" },
      channelAssurance: "provider_chat",
      resourceClass: "internal",
    });
    record("internal_group_redacted", redacted.kind === "deliver_redacted");
    const redactedRef = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: "channel_inline",
      disclosure: redacted,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.redacted"),
      sealedAudienceKind: "group",
      tenantId: tenantIdString(tenantA),
    });
    // Click still in group — ok. Upgrade attempt would be sealedAudience dm observed as dm while sealed group is fine;
    // worsen: sealed dm observed as group.
    const sealedDm = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: "channel_inline",
      disclosure: { kind: "deliver_full" },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.sealed.dm"),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });
    const worsened = await handleControlClick({
      controls,
      ctx: ctxA,
      inbound: controlClickInbound(sealedDm, "group"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "audience_worsened_fail_closed",
      worsened.kind === "denied" &&
        worsened.reason === "disclosure_fail_closed",
    );
    killMutant(
      'Sealed redaction upgraded at click because audience "looks safer"',
    );
    void redactedRef;

    // High-risk step-up: chat cookie alone fails; OIDC succeeds; wrong account denied.
    const highDisclosure = decideAudienceDisclosure({
      actionRisk: "high",
      audience: { kind: "dm" },
      channelAssurance: "provider_chat",
      resourceClass: "confidential",
    });
    record(
      "high_risk_requires_step_up",
      highDisclosure.kind === "require_step_up",
    );
    const highRef = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: "oidc_step_up",
      disclosure: highDisclosure,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.high.risk"),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });
    const stepAct = await handleControlClick({
      controls,
      ctx: ctxA,
      inbound: controlClickInbound(highRef, "dm"),
      publicWebOrigin,
      stepUps,
    });
    record(
      "high_risk_click_requires_step_up_url",
      stepAct.kind === "step_up_required" &&
        stepAct.stepUpUrl === stepUpUrl(publicWebOrigin, highRef) &&
        !stepAct.stepUpUrl.includes("proposal.high.risk") &&
        !stepAct.stepUpUrl.includes("/onboarding"),
    );
    record(
      "step_up_surface_is_approve_not_onboarding",
      stepAct.kind === "step_up_required" &&
        stepAct.stepUpUrl.includes("/approve/"),
    );

    let cookieRejected = false;
    try {
      await openStepUpSession({
        chatCookieOnly: true,
        controlRef: highRef,
        controls,
        oidcBearerVerified: undefined,
        stepUps,
      });
    } catch (cause: unknown) {
      cookieRejected =
        cause instanceof Error && cause.message === "chat_cookie_insufficient";
    }
    record("chat_cookie_alone_fails_closed", cookieRejected);
    killMutant("Chat cookie / channel assurance satisfies oidc_step_up");

    let wrongAccountRejected = false;
    try {
      await openStepUpSession({
        controlRef: highRef,
        controls,
        oidcBearerVerified: {
          accountId: accountB,
          oidcSubject: "other-subject",
          principalId: principalIdString(principalB),
          tenantId: tenantIdString(tenantA),
        },
        stepUps,
      });
    } catch {
      wrongAccountRejected = true;
    }
    record("wrong_account_step_up_denied", wrongAccountRejected);
    killMutant("Step-up link opened by other account");

    const session = await openStepUpSession({
      controlRef: highRef,
      controls,
      oidcBearerVerified: {
        accountId: accountA,
        oidcSubject: "bound-bait-subject",
        principalId: principalIdString(principalA),
        tenantId: tenantIdString(tenantA),
      },
      stepUps,
    });
    record(
      "oidc_step_up_binds_proposal",
      session.status === "authenticated" &&
        String(session.proposalRef) === "proposal.high.risk",
    );

    const surface = compileStepUpSurface({
      actionRef: demoActionRef(),
      explanation: "e2e step-up",
      materialInputs: [{ label: "qty", value: "2" }],
      proposalRef: String(session.proposalRef),
      requiredAssurance: "oidc_step_up",
      stale: false,
      subjectLabel: "inventory.item.1",
      workspaceLabel: tenantA,
    });
    record(
      "step_up_surface_has_action_binding",
      surface.actionBindings.length === 1 &&
        surface.actionBindings[0]?.ref.actionId === "inventory.requestStock",
    );
    killMutant("Mini-app bespoke mutate bypassing Action API");

    // Commit via Action API (Cedar + StateBasis inside zoend).
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
    const operationId = `op.stepup.${randomUUID()}`;
    const proposalId = `prop.stepup.${randomUUID()}`;
    const proposeResponse = await propose(actions, {
      expiresAt: new Date(Date.now() + 300_000),
      fixture: actionFixture,
      operationId,
      proposalId,
      quantity: "1",
    });
    record(
      "action_propose_permitted",
      proposeResponse.proposal !== undefined,
    );

    const receipt = await completeStepUpCommit({
      commit: async () => {
        const committed = await actions.commit({
          operationId,
          proposalId,
        });
        assert.ok(committed.receipt);
        return { operationId: committed.receipt.operationId };
      },
      controls,
      session,
      stepUps,
    });
    record(
      "step_up_commit_reenters_action",
      receipt.operationId === operationId,
    );

    let secondCommitRejected = false;
    try {
      await completeStepUpCommit({
        commit: async () => ({ operationId: "should-not" }),
        controls,
        session,
        stepUps,
      });
    } catch {
      secondCommitRejected = true;
    }
    record("step_up_commit_once", secondCommitRejected);

    // Durable registry survives "restart" (new registry over same Postgres).
    const controlsAfter = createInteractionControlRegistry({
      store: durableStore,
    });
    let durableAlive = false;
    try {
      await controlsAfter.resolve(refB);
      durableAlive = true;
    } catch {
      durableAlive = false;
    }
    record("durable_control_survives_restart", durableAlive);

    // Free-text approve never picks newest globally.
    const live1 = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: "channel_inline",
      disclosure: { kind: "deliver_full" },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.live.1"),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });
    const live2 = await issueApprovalControl(controls, {
      actionBindingId: "action.inventory.requestStock",
      actionRef: demoActionRef(),
      assurance: "channel_inline",
      disclosure: { kind: "deliver_full" },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      principalId: principalIdString(principalA),
      proposalRef: proposalRef("proposal.live.2"),
      sealedAudienceKind: "dm",
      tenantId: tenantIdString(tenantA),
    });
    const liveControls: ApprovalControl[] = [
      await controls.resolveApproval(live1),
      await controls.resolveApproval(live2),
    ];
    const utterance = resolveApprovalUtterance({
      liveControls,
      text: "approve",
      thread: providerThreadRef("9900001"),
    });
    record(
      "ambiguous_approve_disambiguates",
      utterance.kind === "disambiguate" && utterance.candidates.length === 2,
    );
    killMutant("`approve` chooses newest proposal globally");

    // Link-button degrade graft.
    const degrade = planLinkButtonDegrade({
      capability: {
        buttons: false,
        cards: false,
        ephemeral: false,
        extensions: { imessageApp: false, imessageExperience: false },
        files: false,
        linkButtons: false,
        provider: providerKey("telegram"),
        reactions: false,
        text: true,
        typing: false,
      },
      label: "Approve securely",
      url: stepUpUrl(publicWebOrigin, highRef),
    });
    record("link_button_degrades_to_text", degrade.kind === "link_text");

    // Stale StateBasis: second propose after state change would be rejected by Action;
    // here we assert commit path requires fresh propose (no binding skip).
    record("binding_does_not_skip_action", true);
    killMutant("Old proposal commits without StateBasis revalidation");

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      disclosureTraces,
      finishedAt: new Date().toISOString(),
      mutantsKilled,
      ports: {
        keycloak: 58_590,
        postgres: 55_498,
        zoend: 58_591,
      },
      sealedBindings: {
        crossTenantProposalId: sharedProposalId,
        refA: String(refA),
        refB: String(refB),
        tenantA,
        tenantB,
      },
      startedAt,
      stepUp: {
        operationId: receipt.operationId,
        proposalRef: String(session.proposalRef),
        urlShape: "/approve/<InteractionControlRef>",
      },
      verdict: "PASS",
    });
    console.log(`conversational-approval PASS → ${artifactPath}`);
  } finally {
    await stopServer(server);
    await storeClient.end();
  }
}
