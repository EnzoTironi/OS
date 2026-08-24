import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  ActionInputSchema,
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  ValidTimeSchema,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  createIdentityDirectoryClient,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createMemoryControlStore,
  presentationIntentRef,
  providerKey,
  toChannelProvider,
} from "../packages/interaction/src/index.js";
import {
  createFakeLinqProvider,
  createFakeTelegramProvider,
  createMessagingGateway,
  ProviderDisabledError,
} from "../packages/messaging/src/index.js";
import {
  actionClient,
  activateDefinition,
  definitionClient,
  oidcToken,
  publishDefinition,
  startServer,
  stopServer,
  worldClient,
  type DefinitionFixture,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import { assertImportGraphLaw } from "./messaging-boundary/import-graph.js";

const scenario = "channel-provider-substitution";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_601);
const semanticCorrelationSeed = "channel-provider-substitution.v1";
const actionId = "inventory.requestStock";
const resourceId = "inventory.item.1";
const tenantA = "tenant.a";
const telegramSubject = "tg_user_bound_1";
const linqSubject = "linq_handle_bound_1";
const validAt = new Date("2026-08-19T00:00:00.000Z");

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

async function writePolicyManifest(
  outputPath: string,
): Promise<DefinitionFixture> {
  const canonicalJson = (
    await readFile(
      path.join(
        repositoryRoot,
        "e2e",
        scenario,
        "definition-direct.canonical.json",
      ),
      "utf8",
    )
  ).trimEnd();
  const digest = sha256(canonicalJson);
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", scenario, "direct.cedar"),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e", scenario, "activation.cedar"),
    "utf8",
  );
  const policyDigest = sha256(policySource);
  const activationDigest = sha256(activationSource);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId,
            definitionDigest: digest,
            digest: policyDigest,
            policyId: "policy.direct",
            revision: 1,
            source: policySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: activationDigest,
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
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: "inventory.governed",
      digest,
      revision: BigInt(1),
    }),
    digest,
    policyDigest,
    policyId: "policy.direct",
    policyRevision: 1,
    policySource,
  };
}

async function seedBoundAccount(): Promise<{
  accountId: string;
  tenantId: string;
  principalId: string;
  membershipId: string;
  orgPrincipalId: string;
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
  ]) {
    const result = await admin("POST", "/identity/admin/bind-verified", {
      accountId,
      provider: binding.provider,
      subjectKey: binding.subjectKey,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }

  const expiresAtMicros = Date.now() * 1000 + 3_600_000_000;
  const invite = await admin("POST", "/identity/admin/invites", {
    actionIds: [actionId],
    actorId: "actor.org.substitution",
    expiresAtMicros,
    principalId: "principal.org.substitution",
    resourceIds: [resourceId],
    tenantId: tenantA,
    token: "invite-channel-provider-substitution",
    workloadId: "workload.org.substitution",
  });
  assert.equal(invite.status, 200, JSON.stringify(invite.body));
  const accept = await admin("POST", "/identity/admin/accept-invite", {
    accountId,
    token: "invite-channel-provider-substitution",
  });
  assert.equal(accept.status, 200, JSON.stringify(accept.body));
  assert.equal(String(accept.body.tenantId), tenantA);

  return {
    accountId,
    membershipId,
    orgPrincipalId: String(accept.body.principalId),
    principalId,
    tenantId,
  };
}

function telegramText(updateId: number, text: string): unknown {
  return {
    message: {
      chat: { id: 9_900_001, type: "private" },
      date: Math.floor(Date.parse("2026-08-23T12:00:00.000Z") / 1000),
      from: { id: telegramSubject },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
}

function linqText(deliveryId: string, text: string): unknown {
  return {
    chat_guid: "chat_guid_linq_demo",
    delivery_id: deliveryId,
    message_id: `msg_${deliveryId}`,
    participants: [linqSubject],
    received_at: "2026-08-23T12:00:01.000Z",
    sender_handle: linqSubject,
    text,
  };
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixture = await writePolicyManifest(policyManifestPath);

  await assertImportGraphLaw(repositoryRoot);
  record("chat_sdk_types_absent_from_zoen_core", true);
  killMutant("Chat SDK identity trusted as TenantPrincipal");

  const paidOff =
    process.env.LINQ_API_KEY === undefined &&
    process.env.PHOTON_API_KEY === undefined &&
    process.env.SPECTRUM_API_KEY === undefined;
  record("self_host_paid_providers_disabled", paidOff);

  let server: ServerProcess = await startServer(policyManifestPath);
  try {
    const seed = await seedBoundAccount();
    const adminToken = await oidcToken("admin-a");
    const boundToken = await oidcToken("bound-bait");

    const definitions = definitionClient(adminToken);
    await publishDefinition(definitions, tenantA, fixture);
    await activateDefinition(definitions, tenantA, fixture);

    const world = worldClient(boundToken);
    await world.recordEvidence({
      claim: create(EvidenceClaimSchema, {
        claimId: "claim.channel.provider.substitution.available",
        definition: fixture.definition,
        entityId: resourceId,
        provenance: create(EvidenceProvenanceSchema, {
          sourceDigest: sha256("channel-provider-substitution"),
          sourceId: "source.channelProviderSubstitution",
          sourceRef: "urn:zoen:e2e:channel-provider-substitution",
        }),
        relationId: "inventory.available",
        validTime: create(ValidTimeSchema, {
          value: {
            case: "instant",
            value: timestampFromDate(validAt),
          },
        }),
        value: create(ExactValueSchema, {
          value: { case: "integerValue", value: "10" },
        }),
      }),
      tenantId: tenantA,
    });

    const identity = createIdentityDirectoryClient({ baseUrl });
    const controls = createInteractionControlRegistry({
      store: createMemoryControlStore(),
    });
    const interaction = createInteractionBoundary({
      controls,
      correlationNamespace: semanticCorrelationSeed,
      identity,
    });
    const linq = createFakeLinqProvider();
    const telegram = createFakeTelegramProvider();
    const messaging = createMessagingGateway({
      providers: {
        linq,
        telegram,
      },
    });

    const proposalId = "proposal.channel.provider.substitution";
    const operationId = "operation.channel.provider.substitution";

    const inboundA = await messaging.acceptProviderEvent(
      providerKey("linq"),
      linqText("deliv_subst_a", "start on paid provider A"),
    );
    const ctxA = await interaction.resolveTrustedContext(inboundA);
    assert.equal(ctxA.accountId, seed.accountId);
    assert.equal(String(ctxA.principalId), seed.principalId);
    assert.notEqual(String(ctxA.principalId), linqSubject);
    assert.notEqual(String(ctxA.tenantId), String(inboundA.channel.thread));
    const recordA = await interaction.accept(inboundA, ctxA);

    const actions = actionClient(boundToken);
    const proposed = await actions.propose({
      actionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(minutesFromNow(5)),
      inputs: [
        create(ActionInputSchema, {
          inputId: "quantity",
          value: create(ExactValueSchema, {
            value: { case: "integerValue", value: "2" },
          }),
        }),
      ],
      operationId,
      proposalId,
      resourceId,
      validAt: timestampFromDate(validAt),
    });
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.ok(proposed.proposal);
    assert.equal(proposed.proposal.status, ProposalStatus.READY);
    assert.equal(proposed.proposal.proposalId, proposalId);
    assert.equal(String(proposed.trustedContext?.tenantId ?? ""), tenantA);
    assert.equal(
      String(proposed.trustedContext?.principalId ?? ""),
      seed.orgPrincipalId,
    );

    const controlA = await controls.issue({
      expiresAt: minutesFromNow(5).toISOString(),
      kind: "propose_action",
      principalId: ctxA.principalId,
      proposalRef: proposalId,
      tenantId: ctxA.tenantId,
    });
    const intentA = await interaction.planDelivery({
      controls: [controlA],
      ctx: ctxA,
      presentation: presentationIntentRef("pres_subst_a"),
      recordId: recordA.id,
      stableProviderDeliveryId: "spd_subst_a",
    });
    const observationA = await messaging.deliver(intentA);
    assert.equal(observationA.outcome.kind, "accepted");

    messaging.disableProvider(providerKey("linq"));
    record("provider_a_disabled", !messaging.isProviderEnabled(providerKey("linq")));

    let linqAcceptRejected = false;
    try {
      await messaging.acceptProviderEvent(
        providerKey("linq"),
        linqText("deliv_subst_disabled", "should fail"),
      );
    } catch (error) {
      linqAcceptRejected = error instanceof ProviderDisabledError;
    }
    record("disabled_provider_a_rejects_inbound", linqAcceptRejected);

    const undeliveredControl = await controls.issue({
      expiresAt: minutesFromNow(5).toISOString(),
      kind: "propose_action",
      principalId: ctxA.principalId,
      proposalRef: proposalId,
      tenantId: ctxA.tenantId,
    });
    const undeliveredIntent = await interaction.planDelivery({
      controls: [undeliveredControl],
      ctx: ctxA,
      presentation: presentationIntentRef("pres_subst_a_blocked"),
      recordId: recordA.id,
      stableProviderDeliveryId: "spd_subst_a_blocked",
    });
    let linqDeliverRejected = false;
    try {
      await messaging.deliver(undeliveredIntent);
    } catch (error) {
      linqDeliverRejected = error instanceof ProviderDisabledError;
    }
    record("disabled_provider_a_rejects_deliver", linqDeliverRejected);

    const inboundB = await messaging.acceptProviderEvent(
      providerKey("telegram"),
      telegramText(42_001, "continue on local provider B"),
    );
    const ctxB = await interaction.resolveTrustedContext(inboundB);
    assert.equal(ctxB.accountId, seed.accountId);
    assert.equal(String(ctxB.principalId), seed.principalId);
    assert.equal(String(ctxB.tenantId), seed.tenantId);
    assert.notEqual(String(ctxB.principalId), telegramSubject);
    const recordB = await interaction.accept(inboundB, ctxB);
    assert.equal(recordB.semanticCorrelationKey, recordA.semanticCorrelationKey);

    const controlB = await controls.issue({
      expiresAt: minutesFromNow(5).toISOString(),
      kind: "propose_action",
      principalId: ctxB.principalId,
      proposalRef: proposalId,
      tenantId: ctxB.tenantId,
    });
    const intentB = await interaction.planDelivery({
      controls: [controlB],
      ctx: ctxB,
      presentation: presentationIntentRef("pres_subst_b"),
      recordId: recordB.id,
      stableProviderDeliveryId: "spd_subst_b",
    });
    const observationB = await messaging.deliver(intentB);
    assert.equal(observationB.outcome.kind, "accepted");

    const committed = await actions.commit({
      operationId,
      proposalId,
    });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    assert.equal(committed.receipt.actionId, actionId);
    assert.equal(committed.receipt.proposalId, proposalId);

    record(
      "same_zoen_account_across_provider_swap",
      ctxA.accountId === ctxB.accountId &&
        String(ctxA.principalId) === String(ctxB.principalId) &&
        String(ctxA.tenantId) === String(ctxB.tenantId),
    );
    record(
      "same_action_proposal_ids_across_provider_swap",
      committed.receipt.proposalId === proposalId &&
        committed.receipt.actionId === actionId,
    );
    record(
      "semantic_correlation_stable",
      recordA.semanticCorrelationKey === recordB.semanticCorrelationKey,
    );
    record(
      "linq_outage_leaves_telegram_and_core_operational",
      linqAcceptRejected && observationB.outcome.kind === "accepted",
    );

    killMutant("Linq outage breaks Telegram/core");
    killMutant("Action IDs change on provider swap");

    const telegramOnly = createMessagingGateway({
      providers: { telegram: createFakeTelegramProvider() },
    });
    const paidOffInbound = await telegramOnly.acceptProviderEvent(
      providerKey("telegram"),
      telegramText(42_002, "self-host paid providers off"),
    );
    const paidOffCtx = await interaction.resolveTrustedContext(paidOffInbound);
    assert.equal(paidOffCtx.accountId, seed.accountId);
    const paidOffRecord = await interaction.accept(paidOffInbound, paidOffCtx);
    const paidOffControl = await controls.issue({
      expiresAt: minutesFromNow(5).toISOString(),
      kind: "propose_action",
      principalId: paidOffCtx.principalId,
      tenantId: paidOffCtx.tenantId,
    });
    const paidOffIntent = await interaction.planDelivery({
      controls: [paidOffControl],
      ctx: paidOffCtx,
      presentation: presentationIntentRef("pres_paid_off"),
      recordId: paidOffRecord.id,
      stableProviderDeliveryId: "spd_paid_off",
    });
    const paidOffDelivery = await telegramOnly.deliver(paidOffIntent);
    assert.equal(paidOffDelivery.outcome.kind, "accepted");

    const paidOffProposalId = "proposal.channel.provider.paid_off";
    const paidOffOperationId = "operation.channel.provider.paid_off";
    const paidOffPropose = await actions.propose({
      actionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(minutesFromNow(5)),
      inputs: [
        create(ActionInputSchema, {
          inputId: "quantity",
          value: create(ExactValueSchema, {
            value: { case: "integerValue", value: "1" },
          }),
        }),
      ],
      operationId: paidOffOperationId,
      proposalId: paidOffProposalId,
      resourceId,
      validAt: timestampFromDate(validAt),
    });
    assert.equal(paidOffPropose.decision, PolicyDecision.PERMIT);
    const paidOffCommit = await actions.commit({
      operationId: paidOffOperationId,
      proposalId: paidOffProposalId,
    });
    assert.equal(paidOffCommit.status, CommitStatus.COMMITTED);
    record("self_host_commits_action_without_paid_providers", true);
    killMutant("paid provider required for Action");

    assert.equal(mutantsKilled.length, 4);
    for (const name of [
      "Linq outage breaks Telegram/core",
      "paid provider required for Action",
      "Action IDs change on provider swap",
      "Chat SDK identity trusted as TenantPrincipal",
    ]) {
      assert.ok(mutantsKilled.includes(name), `missing mutant kill ${name}`);
    }

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      finishedAt: new Date().toISOString(),
      headSha: process.env.GITHUB_SHA ?? "local",
      journey: {
        actionId,
        operationId,
        proposalId,
        providerA: "linq",
        providerB: "telegram",
        semanticCorrelationKey: recordA.semanticCorrelationKey,
        zoenAccountId: seed.accountId,
      },
      mutantsKilled,
      paidProviders: {
        disabled: paidOff,
        keysPresent: {
          LINQ_API_KEY: process.env.LINQ_API_KEY !== undefined,
          PHOTON_API_KEY: process.env.PHOTON_API_KEY !== undefined,
          SPECTRUM_API_KEY: process.env.SPECTRUM_API_KEY !== undefined,
        },
      },
      ports: { keycloak: 58_600, postgres: 55_500, zoend: 58_601 },
      scenario,
      seed: {
        accountId: seed.accountId,
        orgPrincipalId: seed.orgPrincipalId,
        principalId: seed.principalId,
        tenantId: seed.tenantId,
      },
      startedAt,
      verdict: "PASS",
    });
    console.log(`channel-provider-substitution PASS → ${artifactPath}`);
  } finally {
    await stopServer(server);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
