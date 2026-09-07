import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { Code } from "@connectrpc/connect";
import { z } from "zod";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import { DefinitionReferenceSchema } from "../gen/connect/zoen/world/v1/world_pb.js";
import { historyClient } from "./activation-identity/support.js";
import {
  actionClient,
  adminDatabaseUrl,
  definitionClient,
  expectConnectCode,
  authDatabaseUrl,
  minutesFromNow,
  plantPersonas,
  propose,
  recordAvailable,
  sessionOf,
  startAuthDoor,
  startServer,
  stopAuthDoor,
  stopServer,
  worldClient,
  type DefinitionFixture,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  invitePersona,
  signupOnlyPersona,
} from "./ba-door.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eIdentityAdminToken,
  e2eWhatsAppDoorE164,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  definitionPublishActionId,
  definitionPublishPolicy,
} from "./definition-publish-policy.js";

const scenario = "activation-identity";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_401);
let identityAdminBearer: string | undefined;
const phoneSubject = "+5511999999999";
const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

const jsonObject = z.record(z.string(), z.unknown());

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
      ...((token ?? identityAdminBearer) === undefined
        ? {}
        : { authorization: `Bearer ${token ?? identityAdminBearer}` }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : jsonObject.parse(JSON.parse(text) as unknown);
  return { body: parsed, status: response.status };
}

async function issueLinkIntent(
  provider: "linq" | "telegram" | "whatsapp",
  subjectKey: string
): Promise<Record<string, unknown>> {
  const issued = await admin(
    "POST",
    "/identity/link-intents",
    { provider, subjectKey },
    e2eIdentityAdminToken()
  );
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  return issued.body;
}

async function confirmLinkIntent(
  token: unknown,
  sessionToken: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/identity/link-intents/confirm`, {
    body: JSON.stringify({ token }),
    headers: {
      "content-type": "application/json",
      cookie: `better-auth.session_token=${encodeURIComponent(sessionToken)}`,
      origin: baseUrl,
    },
    method: "POST",
  });
  const text = await response.text();
  return {
    body: text.length === 0 ? {} : jsonObject.parse(JSON.parse(text) as unknown),
    status: response.status,
  };
}

async function resolveContext(
  token: string,
  tenant: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return admin(
    "GET",
    `/identity/admin/resolve-context?world=${encodeURIComponent(tenant)}`,
    undefined,
    token,
  );
}

async function writePolicyManifest(outputPath: string): Promise<{
  canonicalJson: string;
  digest: string;
  definitionId: string;
  revision: number;
}> {
  const canonicalJson = (
    await readFile(
      path.join(
        repositoryRoot,
        "e2e",
        "activation-identity",
        "definition-direct.canonical.json",
      ),
      "utf8",
    )
  ).trimEnd();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", "activation-identity", "direct.cedar"),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e", "activation-identity", "activation.cedar"),
    "utf8",
  );
  const policyDigest = createHash("sha256").update(policySource).digest("hex");
  const activationDigest = createHash("sha256")
    .update(activationSource)
    .digest("hex");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: "inventory.requestStock",
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
          definitionPublishPolicy({
            definitionDigest: digest,
            revision: 1,
          }),
        ],
      },
      null,
      2,
    )}\n`,
  );
  return {
    canonicalJson,
    definitionId: "inventory.governed",
    digest,
    revision: 1,
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixture = await writePolicyManifest(policyManifestPath);

  identityAdminBearer = e2eIdentityAdminToken();
  const door = await startAuthDoor(authDatabaseUrl);
  let server: ServerProcess | undefined;

  try {
    server = await startServer(policyManifestPath);
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: [
        signupOnlyPersona("unbound-a"),
        invitePersona({
          actionIds: [
            definitionPublishActionId,
            "zoen.definition.activate",
            "inventory.requestStock",
          ],
          actorId: "actor.admin.a",
          id: "admin-a",
          principalId: "principal.admin.a",
          resourceIds: [fixture.definitionId, "inventory.item.1"],
          tenantId: "tenant.a",
          workloadId: "workload.admin.a",
        }),
        signupOnlyPersona("bound-bait"),
        signupOnlyPersona("bound-second"),
        invitePersona({
          actionIds: [
            definitionPublishActionId,
            "zoen.definition.activate",
            "inventory.requestStock",
          ],
          actorId: "actor.org.a.admin",
          id: "org-a-admin",
          principalId: "principal.admin.a",
          resourceIds: [fixture.definitionId, "inventory.item.1"],
          tenantId: "tenant.org.a",
          workloadId: "workload.org.a.admin",
        }),
      ],
      zoendBaseUrl: baseUrl,
    });
    const unboundToken = sessionOf(planted, "unbound-a").token;
    const adminToken = sessionOf(planted, "admin-a").token;
    const boundToken = sessionOf(planted, "bound-bait").token;
    const secondToken = sessionOf(planted, "bound-second").token;
    const orgAdminToken = sessionOf(planted, "org-a-admin").token;

    const unboundDefinition = definitionClient(unboundToken, "tenant.a");
    await expectConnectCode(
      () =>
        unboundDefinition.publish({
          canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
          digest: fixture.digest,
          tenantId: "tenant.a",
        }),
      Code.PermissionDenied,
    );
    record("unbound_session_cannot_publish", true);

    const adminDefinition = definitionClient(adminToken, "tenant.a");
    await adminDefinition.publish({
      canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
      digest: fixture.digest,
      tenantId: "tenant.a",
    });
    await adminDefinition.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId: fixture.definitionId,
      digest: fixture.digest,
      tenantId: "tenant.a",
    });

    const oidcProvisional = await admin(
      "POST",
      "/identity/admin/provisional",
      {
        provider: "whatsapp",
        subjectKey: "+5511988887777",
      },
      adminToken,
    );
    record(
      "oidc_cannot_mint_provisional",
      oidcProvisional.status === 403 &&
        oidcProvisional.body.error === "identity_admin_forbidden",
    );

    const doorProvisional = await admin("POST", "/identity/admin/provisional", {
      provider: "whatsapp",
      subjectKey: e2eWhatsAppDoorE164(),
    });
    record(
      "whatsapp_door_rejected",
      doorProvisional.status === 400 &&
        doorProvisional.body.error === "invalid external subject",
    );

    const provisional = await admin("POST", "/identity/admin/provisional", {
      provider: "whatsapp",
      subjectKey: phoneSubject,
    });
    assert.equal(provisional.status, 200, JSON.stringify(provisional.body));
    const provisionalAccountId = String(provisional.body.accountId);
    assert.ok(server);
    await stopServer(server);
    server = await startServer(policyManifestPath);
    const verifiedWhatsapp = await admin("POST", "/identity/admin/verify-binding", {
      accountId: provisionalAccountId,
    });
    assert.equal(verifiedWhatsapp.status, 200, JSON.stringify(verifiedWhatsapp.body));
    record("restart_preserves_provisional_account", true);

    const bootstrap = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      boundToken,
    );
    assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
    const boundAccountId = String(bootstrap.body.accountId);
    const personalTenant = String(bootstrap.body.worldId);
    const personalPrincipal = String(bootstrap.body.principalId);
    record(
      "external_subject_is_not_principal",
      personalPrincipal !== phoneSubject &&
        !personalPrincipal.includes(phoneSubject) &&
        personalPrincipal !== "principal.phone.plus5511999999999",
    );
    killMutant("principal=phone");

    const wrongHint = await resolveContext(boundToken, "tenant.evil.fallback");
    record(
      "bound_subject_ignores_jwt_tenant_hint_without_membership",
      wrongHint.status === 404 || wrongHint.status === 409 || wrongHint.status === 403,
    );
    killMutant("Personal tenant used as fallback enterprise tenant");

    const personalContext = await resolveContext(boundToken, personalTenant);
    assert.equal(personalContext.status, 200, JSON.stringify(personalContext.body));
    record(
      "bound_tec_uses_membership_principal",
      personalContext.body.principalId === personalPrincipal &&
        personalContext.body.worldId === personalTenant &&
        personalContext.body.principalId !== "principal.phone.plus5511999999999",
    );

    const phoneIntent = await issueLinkIntent("whatsapp", phoneSubject);
    const linkPhone = await confirmLinkIntent(phoneIntent.token, boundToken);
    record(
      "verified_channel_links_only_through_browser_session",
      linkPhone.status === 200 &&
        linkPhone.body.targetAccountId === boundAccountId &&
        linkPhone.body.sourceAccountId === provisionalAccountId &&
        linkPhone.body.sourceAccountPreserved === false,
    );

    const linkedSourceSnapshot = await admin(
      "GET",
      `/identity/admin/accounts/${provisionalAccountId}`,
    );
    record(
      "empty_channel_source_becomes_merged_shell",
      (linkedSourceSnapshot.body.account as Record<string, unknown>).status ===
        "merged_into",
    );
    await admin("POST", "/identity/admin/unbind", {
      bindingId: String(linkPhone.body.bindingId),
      reason: "recycle",
    });
    const recycledAccount = await admin("POST", "/identity/admin/provisional", {
      provider: "whatsapp",
      subjectKey: phoneSubject,
    });
    assert.equal(recycledAccount.status, 200);
    await admin("POST", "/identity/admin/verify-binding", {
      accountId: String(recycledAccount.body.accountId),
    });
    const recycledSnapshot = await admin(
      "GET",
      `/identity/admin/accounts/${String(recycledAccount.body.accountId)}`,
    );
    const recycledMemberships = recycledSnapshot.body.memberships as unknown[];
    record(
      "recycled_subject_inherits_no_membership",
      Array.isArray(recycledMemberships) && recycledMemberships.length === 0,
    );
    killMutant("recycled subject inherits account");

    const inviteTokenA = "invite-token-org-a-one-time";
    const inviteTokenB = "invite-token-org-b-one-time";
    const expiresAt = Date.now() * 1000 + 3_600_000_000;
    const inviteA = await admin("POST", "/identity/admin/invites", {
      actionIds: ["inventory.requestStock"],
      actorId: "actor.org.a",
      expiresAtMicros: expiresAt,
      principalId: "principal.colliding",
      resourceIds: ["inventory.item.1"],
      worldId: "tenant.org.a",
      token: inviteTokenA,
      workloadId: "workload.org.a",
    });
    assert.equal(inviteA.status, 200, JSON.stringify(inviteA.body));
    const inviteB = await admin("POST", "/identity/admin/invites", {
      actionIds: ["inventory.requestStock"],
      actorId: "actor.org.b",
      expiresAtMicros: expiresAt,
      principalId: "principal.colliding",
      resourceIds: ["inventory.item.1"],
      worldId: "tenant.org.b",
      token: inviteTokenB,
      workloadId: "workload.org.b",
    });
    assert.equal(inviteB.status, 200, JSON.stringify(inviteB.body));

    const phoneAsPrincipal = await admin("POST", "/identity/admin/invites", {
      actionIds: ["inventory.requestStock"],
      actorId: "actor.org.bad",
      expiresAtMicros: expiresAt,
      principalId: phoneSubject,
      resourceIds: ["inventory.item.1"],
      worldId: "tenant.org.a",
      token: "invite-phone-principal",
      workloadId: "workload.org.bad",
    });
    record("phone_rejected_as_principal_id", phoneAsPrincipal.status === 400);

    const acceptA = await admin("POST", "/identity/admin/accept-invite", {
      accountId: boundAccountId,
      token: inviteTokenA,
    });
    assert.equal(acceptA.status, 200, JSON.stringify(acceptA.body));
    const orgMembershipId = String(acceptA.body.membershipId);
    record(
      "invite_is_tenant_bound",
      acceptA.body.worldId === "tenant.org.a" &&
        acceptA.body.principalId === "principal.colliding",
    );

    const replay = await admin("POST", "/identity/admin/accept-invite", {
      accountId: boundAccountId,
      token: inviteTokenA,
    });
    record("invite_is_one_time", replay.status === 409);

    const orgContext = await resolveContext(boundToken, "tenant.org.a");
    assert.equal(orgContext.status, 200);
    record(
      "same_account_distinct_org_principal",
      orgContext.body.principalId === "principal.colliding" &&
        orgContext.body.worldId === "tenant.org.a",
    );

    const crossTenant = await resolveContext(boundToken, "tenant.org.b");
    record(
      "no_cross_tenant_membership_fallback",
      crossTenant.status === 404 || crossTenant.status === 409 || crossTenant.status === 403,
    );
    killMutant("tenant=invite payload override");

    const orgAdminDefinition = definitionClient(orgAdminToken, "tenant.org.a");
    await orgAdminDefinition.publish({
      canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
      digest: fixture.digest,
      tenantId: "tenant.org.a",
    });
    await orgAdminDefinition.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId: fixture.definitionId,
      digest: fixture.digest,
      tenantId: "tenant.org.a",
    });
    const orgFixture = {
      canonicalJson: fixture.canonicalJson,
      definition: create(DefinitionReferenceSchema, {
        definitionId: fixture.definitionId,
        digest: fixture.digest,
        revision: BigInt(fixture.revision),
      }),
      digest: fixture.digest,
      policyDigest: createHash("sha256")
        .update(
          await readFile(
            path.join(repositoryRoot, "e2e", "activation-identity", "direct.cedar"),
            "utf8",
          ),
        )
        .digest("hex"),
      policyId: "policy.direct",
      policyRevision: fixture.revision,
      policySource: "",
    } satisfies DefinitionFixture;
    await recordAvailable(worldClient(orgAdminToken, "tenant.org.a"), {
      claimId: "claim.available.activation-identity.org-a",
      fixture: orgFixture,
      resource: "inventory.item.1",
      tenantId: "tenant.org.a",
      value: "10",
    });
    const historicalOperationId = "operation.activation-identity.historical";
    const historicalProposalId = "proposal.activation-identity.historical";
    const boundAction = actionClient(boundToken, "tenant.org.a");
    const historicalPropose = await propose(boundAction, {
      expiresAt: minutesFromNow(5),
      fixture: orgFixture,
      operationId: historicalOperationId,
      proposalId: historicalProposalId,
      quantity: "2",
    });
    assert.equal(
      historicalPropose.decision,
      PolicyDecision.PERMIT,
      `propose decision=${historicalPropose.decision} principal=${historicalPropose.trustedContext?.principalId} tenant=${historicalPropose.trustedContext?.tenantId} policy=${historicalPropose.policy?.revision?.policyId ?? "none"}`,
    );
    assert.equal(historicalPropose.proposal?.status, ProposalStatus.READY);
    assert.equal(
      historicalPropose.trustedContext?.principalId,
      "principal.colliding",
    );
    assert.equal(historicalPropose.trustedContext?.tenantId, "tenant.org.a");
    const historicalCommit = await boundAction.commit({
      operationId: historicalOperationId,
      proposalId: historicalProposalId,
    });
    assert.equal(
      historicalCommit.status,
      CommitStatus.COMMITTED,
      `commit status=${historicalCommit.status}`,
    );
    assert.ok(historicalCommit.receipt);

    await admin("POST", "/identity/admin/revoke", {
      membershipId: orgMembershipId,
      reason: "admin",
    });
    const afterRevoke = await resolveContext(boundToken, "tenant.org.a");
    record(
      "revoke_fails_closed_on_next_resolve",
      afterRevoke.status === 404 || afterRevoke.status === 409 || afterRevoke.status === 403,
    );
    killMutant("stale membership cache");

    const linkSubject = "5531888888888@s.whatsapp.net";
    const issuedLink = await issueLinkIntent("whatsapp", linkSubject);
    const linkToken = String(issuedLink.token);
    record(
      "link_intent_uses_fragment_token",
      String(issuedLink.href) === `${baseUrl}/link#token=${linkToken}`,
    );
    const linkPage = await fetch(`${baseUrl}/link`);
    const linkHtml = await linkPage.text();
    record(
      "link_get_is_token_free_html",
      linkPage.status === 200 &&
        (linkPage.headers.get("content-type") ?? "").includes("text/html") &&
        linkHtml.includes("ligar esta conversa") &&
        !linkHtml.includes(linkToken),
    );
    const missingSession = await fetch(
      `${baseUrl}/identity/link-intents/confirm`,
      {
        body: JSON.stringify({ token: linkToken }),
        headers: { "content-type": "application/json", origin: baseUrl },
        method: "POST",
      },
    );
    record("link_confirmation_requires_door_cookie", missingSession.status === 401);
    const linked = await confirmLinkIntent(linkToken, boundToken);
    record(
      "link_confirmation_binds_exact_channel",
      linked.status === 200 && linked.body.targetAccountId === boundAccountId,
    );
    const linkReplay = await confirmLinkIntent(linkToken, boundToken);
    record("link_confirmation_replay_fails_closed", linkReplay.status === 409);
    const linkedSnapshot = await admin(
      "GET",
      `/identity/admin/resolve-subject?provider=whatsapp&subjectKey=${encodeURIComponent(linkSubject)}`,
    );
    record(
      "linked_channel_resolves_browser_membership",
      linkedSnapshot.status === 200 &&
        (linkedSnapshot.body.account as Record<string, unknown>).accountId ===
          boundAccountId,
    );

    const doorIntent = await admin("POST", "/identity/link-intents", {
      provider: "whatsapp",
      subjectKey: e2eWhatsAppDoorE164(),
    });
    record(
      "whatsapp_door_cannot_receive_link_intent",
      doorIntent.status === 400 &&
        doorIntent.body.error === "invalid external subject",
    );
    const retiredBind = await admin("POST", "/identity/admin/bind-verified", {
      accountId: boundAccountId,
      provider: "whatsapp",
      subjectKey: "+5511966665555",
    });
    const retiredOnboard = await admin(
      "POST",
      "/identity/admin/onboard-tokens",
      { provider: "whatsapp", subjectKey: "+5511966665555" },
    );
    record(
      "direct_bind_and_onboard_routes_are_retired",
      retiredBind.status === 404 && retiredOnboard.status === 404,
    );

    const boundExplainCode = await expectConnectCode(
      () =>
        historyClient(boundToken, "tenant.org.a").explain({
          target: { target: { case: "operationId", value: historicalOperationId } },
        }),
      Code.PermissionDenied,
    );
    const explanation = await historyClient(orgAdminToken, "tenant.org.a").explain({
      target: { target: { case: "operationId", value: historicalOperationId } },
    });
    const causal = explanation.explanation;
    assert.ok(causal, `explain missing explanation; keys=${Object.keys(explanation).join(",")}`);
    assert.equal(
      causal.subject.case,
      "action",
      `explain subject=${causal.subject.case ?? "none"} complete=${causal.complete} gaps=${causal.gaps.length}`,
    );
    const historicalAction =
      causal.subject.case === "action" ? causal.subject.value : undefined;
    assert.ok(historicalAction);
    const proposedBy = historicalAction.proposedBy;
    record(
      "historical_principal_still_named_after_revoke",
      boundExplainCode === Code.PermissionDenied &&
        proposedBy?.principalId === "principal.colliding" &&
        proposedBy.principalId.length > 0 &&
        proposedBy.tenantId === "tenant.org.a" &&
        historicalAction.commit?.receipt?.operationId === historicalOperationId,
    );
    killMutant("explain after revoke uses current membership");
    killMutant("empty principal");
    killMutant("404-as-history");

    const secondBootstrap = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      secondToken,
    );
    assert.equal(secondBootstrap.status, 200, JSON.stringify(secondBootstrap.body));
    const secondAccountId = String(secondBootstrap.body.accountId);
    const movableSubject = "8100000099";
    const linkToSecond = await issueLinkIntent("telegram", movableSubject);
    const linkedToSecond = await confirmLinkIntent(linkToSecond.token, secondToken);
    assert.equal(linkedToSecond.status, 200, JSON.stringify(linkedToSecond.body));
    const moveToFirst = await issueLinkIntent("telegram", movableSubject);
    const movedToFirst = await confirmLinkIntent(moveToFirst.token, boundToken);
    assert.equal(movedToFirst.status, 200, JSON.stringify(movedToFirst.body));
    const survivorSnapshot = await admin(
      "GET",
      `/identity/admin/accounts/${boundAccountId}`,
    );
    const absorbedSnapshot = await admin(
      "GET",
      `/identity/admin/accounts/${secondAccountId}`,
    );
    const survivorMembershipTenants = (
      survivorSnapshot.body.memberships as Array<Record<string, unknown>>
    ).map((membership) => membership.worldId);
    const absorbedMemberships = absorbedSnapshot.body.memberships as unknown[];
    record(
      "link_moves_one_binding_not_memberships_or_world",
      movedToFirst.body.sourceAccountId === secondAccountId &&
        movedToFirst.body.targetAccountId === boundAccountId &&
        movedToFirst.body.sourceAccountPreserved === true &&
        Array.isArray(absorbedMemberships) &&
        absorbedMemberships.length >= 1 &&
        !survivorMembershipTenants.includes(String(secondBootstrap.body.worldId)),
    );
    killMutant("merge copies memberships");

    await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      finishedAt: new Date().toISOString(),
      mutantsKilled,
      personalPrincipal,
      personalTenant,
      startedAt,
    });
  } finally {
    if (server !== undefined && server.child.exitCode === null) {
      await stopServer(server);
    }
    await stopAuthDoor(door);
  }
}

await main();
