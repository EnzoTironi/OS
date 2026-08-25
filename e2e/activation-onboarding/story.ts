import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  attemptFirstSuccess,
  beginCapabilityGrant,
  captureGoal,
  createFileStore,
  observeCapabilities,
  planNext,
  replaceGoal,
  resumeCapabilityGrant,
  resumeOnboarding,
  sourceConnectionId,
  withReadSourceOverlay,
  zoenAccountId,
  type MissingCapability,
  type ObservedCapabilities,
  type OnboardingSession,
} from "../../archive/packages/onboarding/src/index.js";
import { e2ePort, writeScenarioArtifact } from "../host-env.js";
import {
  admin,
  enterpriseTenant,
  generatedDirectory,
  knowledgeFragmentDigests,
  liveObserved,
  oidcToken,
  queryReceiptDigest,
  repositoryRoot,
  runEnterpriseSemanticQuery,
  scenario,
  seedEnterpriseQuerySurface,
  startServer,
  stopServer,
  storePath,
  writePolicyManifest,
  type ServerProcess,
} from "./support.js";

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];
const beginGrantTrace: MissingCapability["kind"][] = [];

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

async function runStory(): Promise<void> {
  const startedAt = new Date().toISOString();
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await mkdir(generatedDirectory, { recursive: true });
  const fixture = await writePolicyManifest(policyManifestPath);

  const ports = {
    postgres: e2ePort("ZOEN_E2E_POSTGRES_PORT", 55_490),
    keycloak: e2ePort("ZOEN_E2E_KEYCLOAK_PORT", 58_550),
    zoend: e2ePort("ZOEN_E2E_ZOEND_PORT", 58_551),
  };
  record(
    "portsPinned",
    ports.postgres === 55_490 &&
      ports.keycloak === 58_550 &&
      ports.zoend === 58_551,
  );

  let server: ServerProcess | undefined;
  const store = createFileStore(storePath);
  const wording =
    "Show me which purchase lines are at risk this week for Sample Company";
  let accountId = zoenAccountId("account.provisional.onboarding");
  let observed: ObservedCapabilities = observeCapabilities({ snapshot: null });
  let session: OnboardingSession;
  let digest: string;

  try {
    server = await startServer(policyManifestPath);
    await seedEnterpriseQuerySurface(fixture);

    session = await captureGoal({
      store,
      accountId,
      wording,
      slots: { outcomeKind: "query_result", workspaceClass: "enterprise" },
    });
    digest = session.digest;
    record("outcomeFirstGoalCaptured", session.contract.wording === wording);
    record("goalDigestStable", /^[0-9a-f]{64}$/.test(session.digest));

    observed = await liveObserved(String(accountId));
    record(
      "missingAccountObservesProvisional",
      observed.accountStatus === "provisional" &&
        observed.memberships.length === 0,
    );
    let next = planNext(session, observed);
    record(
      "firstAskIsIdentity",
      next.kind === "ask" && next.missing.kind === "identity",
    );
    record(
      "askIncludesWhy",
      next.kind === "ask" && next.missing.why.includes(wording.slice(0, 20)),
    );

    assert.equal(next.kind, "ask");
    assert.equal(next.missing.kind, "identity");
    beginGrantTrace.push(next.missing.kind);
    const begunIdentity = await beginCapabilityGrant({
      store,
      digest: session.digest,
      accountId,
      missing: next.missing,
      observed,
      redirectUrlFor: (_missing, op) =>
        `http://127.0.0.1:${ports.zoend}/onboarding/auth/callback?digest=${session.digest}&operationId=${op}`,
    });
    const pendingOperationId = begunIdentity.operationId;
    const pendingResumeToken = begunIdentity.resumeToken;
    const preRestartDigest = session.digest;
    const preRestartWording = session.contract.wording;

    await stopServer(server);
    server = await startServer(policyManifestPath);

    const storeAfterRestart = createFileStore(storePath);
    const resumedAfterRestart = await resumeOnboarding({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed,
    });
    record(
      "goalSurvivesZoendRestart",
      resumedAfterRestart.session.contract.wording === preRestartWording &&
        resumedAfterRestart.session.digest === preRestartDigest &&
        resumedAfterRestart.session.pendingGrant?.operationId ===
          pendingOperationId,
    );
    killMutant("auth_callback_mints_blank_session");

    const boundToken = await oidcToken("bound-bait");
    const bootstrap = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      boundToken,
    );
    assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
    const verifiedAccountId = zoenAccountId(String(bootstrap.body.accountId));
    const personalTenant = String(bootstrap.body.tenantId);
    const personalPrincipal = String(bootstrap.body.principalId);
    const personalMembershipId = String(bootstrap.body.membershipId);

    accountId = verifiedAccountId;
    session = await captureGoal({
      store: storeAfterRestart,
      accountId,
      wording,
      slots: { outcomeKind: "query_result", workspaceClass: "enterprise" },
    });
    digest = session.digest;
    record(
      "sameWordingSameDigestAcrossAccounts",
      digest === preRestartDigest,
    );

    observed = await liveObserved(String(accountId));
    record(
      "observedFromLiveIdentity",
      observed.accountStatus === "verified" &&
        observed.verifiedBindings.some((b) => b.provider === "web_oidc") &&
        observed.memberships.some(
          (m) =>
            m.status === "active" &&
            m.workspaceClass === "personal" &&
            m.membershipId === personalMembershipId,
        ),
    );
    next = planNext(session, observed);
    record(
      "personalCannotSatisfyEnterprise",
      next.kind === "blocked" &&
        next.reason === "personal_cannot_satisfy_enterprise",
    );
    killMutant("personal_grants_enterprise_capability");

    const leftPersonal = await admin("POST", "/identity/admin/leave", {
      membershipId: personalMembershipId,
    });
    assert.equal(
      leftPersonal.status,
      204,
      JSON.stringify(leftPersonal.body),
    );
    observed = await liveObserved(String(accountId));
    next = planNext(session, observed);
    record(
      "afterLeavePersonalAsksWorkspace",
      next.kind === "ask" && next.missing.kind === "workspace",
    );

    assert.equal(next.kind, "ask");
    assert.equal(next.missing.kind, "workspace");
    beginGrantTrace.push(next.missing.kind);
    const begunWorkspace = await beginCapabilityGrant({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      missing: next.missing,
      observed,
      redirectUrlFor: () => "http://127.0.0.1/invite",
    });
    const rejectedTenant = await resumeCapabilityGrant({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      operationId: begunWorkspace.operationId,
      resumeToken: begunWorkspace.resumeToken,
      providerResult: {
        kind: "granted",
        attribution: {
          accountId,
          membershipId: personalMembershipId,
          tenantId: personalTenant,
        },
        tenantHint: "tenant.bait.foreign",
      },
      observed,
    });
    record(
      "promptTenantRejected",
      rejectedTenant.kind === "rejected" &&
        rejectedTenant.reason === "prompt_tenant_rejected",
    );
    killMutant("user_tenant_text_becomes_tec");

    const afterReject = await resumeOnboarding({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed,
    });
    if (afterReject.session.pendingGrant !== null) {
      const canceled = await resumeCapabilityGrant({
        store: storeAfterRestart,
        digest: session.digest,
        accountId,
        operationId: afterReject.session.pendingGrant.operationId,
        resumeToken: afterReject.session.pendingGrant.resumeToken,
        providerResult: { kind: "canceled" },
        observed,
      });
      assert.equal(canceled.kind, "canceled");
      if (canceled.kind !== "canceled") {
        throw new Error("expected canceled");
      }
      record(
        "oauthCancelKeepsGoal",
        canceled.session.contract.wording === wording &&
          canceled.session.digest === digest &&
          canceled.session.pendingGrant === null,
      );
      killMutant("oauth_cancel_loses_goal");
      session = canceled.session;
    }

    const expiresAt = (Date.now() + 60 * 60_000) * 1000;
    const inviteToken = `invite-onboarding-${Date.now()}`;
    const invite = await admin("POST", "/identity/admin/invites", {
      actionIds: ["inventory.requestStock"],
      actorId: "actor.sample.enterprise",
      expiresAtMicros: expiresAt,
      principalId: "principal.sample.enterprise",
      resourceIds: ["inventory.item.1"],
      tenantId: enterpriseTenant,
      token: inviteToken,
      workloadId: "workload.sample.enterprise",
    });
    assert.equal(invite.status, 200, JSON.stringify(invite.body));
    const accepted = await admin("POST", "/identity/admin/accept-invite", {
      accountId: String(accountId),
      token: inviteToken,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const acceptedTenant = String(accepted.body.tenantId);
    const enterpriseMembershipId = String(accepted.body.membershipId);
    const enterprisePrincipal = String(accepted.body.principalId);
    record(
      "enterpriseMembershipFromInvite",
      acceptedTenant === enterpriseTenant &&
        enterprisePrincipal === "principal.sample.enterprise",
    );

    observed = await liveObserved(String(accountId));
    record(
      "enterpriseObservedFromLiveMembership",
      observed.memberships.some(
        (m) =>
          m.status === "active" &&
          m.workspaceClass === "enterprise" &&
          m.tenantId === enterpriseTenant &&
          m.membershipId === enterpriseMembershipId,
      ),
    );
    next = planNext(session, observed);
    record(
      "afterEnterpriseAsksReadSource",
      next.kind === "ask" &&
        next.missing.kind === "read_source" &&
        next.missing.scope === "readonly",
    );

    assert.equal(next.kind, "ask");
    assert.equal(next.missing.kind, "read_source");
    beginGrantTrace.push(next.missing.kind);
    const begunSource = await beginCapabilityGrant({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      missing: next.missing,
      observed,
      redirectUrlFor: () => "http://127.0.0.1/oauth/source",
    });

    const sourceObserved = withReadSourceOverlay(
      observed,
      "source.sample.readonly",
    );
    const resumedSource = await resumeCapabilityGrant({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      operationId: begunSource.operationId,
      resumeToken: begunSource.resumeToken,
      providerResult: {
        kind: "granted",
        attribution: {
          accountId,
          sourceConnectionId: sourceConnectionId("source.sample.readonly"),
          tenantId: enterpriseTenant,
        },
      },
      observed: sourceObserved,
    });
    record(
      "sourceGrantResumed",
      resumedSource.kind === "resumed" ||
        resumedSource.kind === "idempotent_replay",
    );
    session =
      resumedSource.kind === "resumed" ||
      resumedSource.kind === "idempotent_replay"
        ? resumedSource.session
        : session;
    const grantCount = session.grants.length;

    const replay = await resumeCapabilityGrant({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      operationId: begunSource.operationId,
      resumeToken: begunSource.resumeToken,
      providerResult: {
        kind: "granted",
        attribution: {
          accountId,
          sourceConnectionId: sourceConnectionId("source.sample.readonly"),
        },
      },
      observed: sourceObserved,
    });
    record(
      "callbackReplayIdempotent",
      replay.kind === "idempotent_replay" &&
        replay.session.grants.length === grantCount,
    );

    const connectOnly = await attemptFirstSuccess({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed: sourceObserved,
      evidence: null,
    });
    record(
      "connectSourceNotFirstSuccess",
      connectOnly.kind === "not_matched" || connectOnly.kind === "not_ready"
        ? true
        : connectOnly.session.firstSuccess === null,
    );
    const afterConnect = await resumeOnboarding({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed: sourceObserved,
    });
    record(
      "firstSuccessStillNullAfterConnect",
      afterConnect.session.firstSuccess === null,
    );
    killMutant("connect_source_marks_first_success");
    killMutant("first_success_on_integration_connected");

    const sampleEnterpriseToken = await oidcToken("sample-enterprise");
    const queryResponse = await runEnterpriseSemanticQuery(
      sampleEnterpriseToken,
      fixture,
    );
    const queryDigest = queryReceiptDigest(queryResponse);
    const fragmentDigests = knowledgeFragmentDigests(queryResponse);
    record(
      "liveSemanticQueryReceipt",
      /^[0-9a-f]{64}$/.test(queryDigest) &&
        queryResponse.values.length > 0 &&
        queryDigest !== sha256(`query:${digest}:${enterpriseTenant}`),
    );

    const matched = await attemptFirstSuccess({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed: sourceObserved,
      evidence: {
        tenantId: enterpriseTenant,
        principalId: enterprisePrincipal,
        queryDigest,
        knowledgeFragmentDigests: fragmentDigests,
      },
    });
    record(
      "firstSuccessIsAttributableQuery",
      matched.kind === "matched" &&
        matched.session.firstSuccess?.attribution.queryDigest === queryDigest &&
        matched.session.firstSuccess.goalDigest === digest &&
        matched.session.firstSuccess.attribution.tenantId === enterpriseTenant,
    );

    session = await captureGoal({
      store: storeAfterRestart,
      accountId,
      wording: `${wording} (tenant bait)`,
      slots: { outcomeKind: "query_result", workspaceClass: "enterprise" },
    });
    let baitObserved = await liveObserved(String(accountId), {
      readSources: sourceObserved.readSources,
      queryReady: true,
    });
    let baitNext = planNext(session, baitObserved);
    while (baitNext.kind === "ask") {
      beginGrantTrace.push(baitNext.missing.kind);
      const begun = await beginCapabilityGrant({
        store: storeAfterRestart,
        digest: session.digest,
        accountId,
        missing: baitNext.missing,
        observed: baitObserved,
        redirectUrlFor: () => "http://127.0.0.1/x",
      });
      const attr =
        baitNext.missing.kind === "read_source"
          ? {
              accountId,
              sourceConnectionId: sourceConnectionId("source.sample.readonly"),
            }
          : {
              accountId,
              membershipId: enterpriseMembershipId,
              tenantId: enterpriseTenant,
            };
      if (baitNext.missing.kind === "read_source") {
        baitObserved = withReadSourceOverlay(
          baitObserved,
          "source.sample.readonly",
        );
      }
      const r = await resumeCapabilityGrant({
        store: storeAfterRestart,
        digest: session.digest,
        accountId,
        operationId: begun.operationId,
        resumeToken: begun.resumeToken,
        providerResult: { kind: "granted", attribution: attr },
        observed: baitObserved,
      });
      assert.ok(r.kind === "resumed" || r.kind === "idempotent_replay");
      session = r.session;
      baitNext = planNext(session, baitObserved);
    }
    const foreignEvidence = await attemptFirstSuccess({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed: baitObserved,
      evidence: {
        tenantId: "tenant.bait.foreign",
        principalId: enterprisePrincipal,
        queryDigest: sha256("foreign"),
      },
    });
    record(
      "foreignTenantEvidenceRejected",
      foreignEvidence.kind === "not_matched",
    );

    record(
      "noWriteScopeRequested",
      beginGrantTrace.every((kind) => kind !== "write_scope"),
    );
    killMutant("blanket_write_scope_to_finish");

    const originalGrants = afterConnect.session.grants;
    const replaced = await replaceGoal({
      store: storeAfterRestart,
      digest: afterConnect.session.digest,
      accountId,
      newWording: "Explain at-risk stock for a different Sample SKU",
      observed: sourceObserved,
    });
    record(
      "replaceGoalKeepsGrantsClearsFirstSuccess",
      replaced.session.grants.length === originalGrants.length &&
        replaced.session.grants.every(
          (g, i) => g.forGoalDigest === originalGrants[i]!.forGoalDigest,
        ) &&
        replaced.session.firstSuccess === null &&
        replaced.session.digest !== afterConnect.session.digest,
    );

    record(
      "pendingIdentityOperationTracked",
      typeof pendingOperationId === "string" &&
        typeof pendingResumeToken === "string",
    );
    record(
      "personalPrincipalFromMembership",
      personalPrincipal.length > 0 && personalTenant.length > 0,
    );

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      scenario,
      startedAt,
      finishedAt: new Date().toISOString(),
      ports,
      digests: {
        goal: digest,
        query: queryDigest,
        definition: fixture.digest,
      },
      accountId,
      enterpriseTenant,
      assertions,
      mutantsKilled,
      beginGrantTrace,
      storePath,
      liveIdentity: true,
      liveSemanticQuery: true,
    });
    await writeFile(
      path.join(generatedDirectory, "activation-onboarding.json"),
      `${JSON.stringify(
        {
          assertions,
          mutantsKilled,
          ports,
          artifactPath,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactPath,
          mutantsKilled,
          assertionCount: Object.keys(assertions).length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
  }
}

export async function main(): Promise<void> {
  await runStory();
}
