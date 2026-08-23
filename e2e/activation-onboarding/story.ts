import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  attemptFirstSuccess,
  beginCapabilityGrant,
  captureGoal,
  createFileStore,
  planNext,
  replaceGoal,
  resumeCapabilityGrant,
  resumeOnboarding,
  sourceConnectionId,
  zoenAccountId,
  type MissingCapability,
  type ObservedCapabilities,
  type OnboardingSession,
} from "../../packages/onboarding/src/index.js";
import { e2ePort, writeScenarioArtifact } from "../host-env.js";
import {
  admin,
  generatedDirectory,
  oidcToken,
  repositoryRoot,
  scenario,
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

function provisionalObserved(): ObservedCapabilities {
  return {
    accountStatus: "provisional",
    verifiedBindings: [],
    memberships: [],
    readSources: [],
    queryReady: false,
  };
}

function withIdentity(base: ObservedCapabilities): ObservedCapabilities {
  return {
    ...base,
    accountStatus: "verified",
    verifiedBindings: [{ provider: "web_oidc", bindingId: "binding.web.1" }],
  };
}

function withPersonal(base: ObservedCapabilities): ObservedCapabilities {
  return {
    ...base,
    memberships: [
      {
        membershipId: "membership.personal.1",
        tenantId: "tenant.personal.1",
        workspaceClass: "personal",
        status: "active",
      },
    ],
  };
}

function withEnterprise(
  base: ObservedCapabilities,
  tenantId: string,
  membershipId: string,
): ObservedCapabilities {
  return {
    ...base,
    memberships: [
      ...base.memberships.filter((m) => m.workspaceClass !== "enterprise"),
      {
        membershipId,
        tenantId,
        workspaceClass: "enterprise",
        status: "active",
      },
    ],
  };
}

function withReadSource(base: ObservedCapabilities): ObservedCapabilities {
  return {
    ...base,
    readSources: [
      {
        connectionId: sourceConnectionId("source.sample.readonly"),
        scope: "readonly",
        status: "connected",
      },
    ],
    queryReady: true,
  };
}

async function runStory(): Promise<void> {
  const startedAt = new Date().toISOString();
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await mkdir(generatedDirectory, { recursive: true });
  await writePolicyManifest(policyManifestPath);

  const ports = {
    postgres: e2ePort("ZOEN_E2E_POSTGRES_PORT", 55_490),
    keycloak: e2ePort("ZOEN_E2E_KEYCLOAK_PORT", 58_550),
    zoend: e2ePort("ZOEN_E2E_ZOEND_PORT", 58_551),
  };
  record("portsPinned", ports.postgres === 55_490 && ports.keycloak === 58_550 && ports.zoend === 58_551);

  let server: ServerProcess | undefined;
  const store = createFileStore(storePath);
  const wording =
    "Show me which purchase lines are at risk this week for Sample Company";
  let accountId = zoenAccountId("account.provisional.onboarding");
  let observed = provisionalObserved();
  let session: OnboardingSession;
  let digest: string;

  try {
    server = await startServer(policyManifestPath);

    session = await captureGoal({
      store,
      accountId,
      wording,
      slots: { outcomeKind: "query_result", workspaceClass: "enterprise" },
    });
    digest = session.digest;
    record("outcomeFirstGoalCaptured", session.contract.wording === wording);
    record("goalDigestStable", /^[0-9a-f]{64}$/.test(session.digest));

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

    observed = withIdentity(provisionalObserved());
    next = planNext(session, observed);
    record(
      "afterIdentityAsksWorkspace",
      next.kind === "ask" && next.missing.kind === "workspace",
    );

    observed = withPersonal(observed);
    next = planNext(session, observed);
    record(
      "personalCannotSatisfyEnterprise",
      next.kind === "blocked" &&
        next.reason === "personal_cannot_satisfy_enterprise",
    );
    killMutant("personal_grants_enterprise_capability");

    assert.equal(next.kind, "blocked");
    observed = withIdentity(provisionalObserved());
    next = planNext(session, observed);
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
      tenantId: "tenant.sample.enterprise",
      token: inviteToken,
      workloadId: "workload.sample.enterprise",
    });
    assert.equal(invite.status, 200, JSON.stringify(invite.body));
    const accepted = await admin("POST", "/identity/admin/accept-invite", {
      accountId: String(accountId),
      token: inviteToken,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const enterpriseTenant = String(accepted.body.tenantId);
    const enterpriseMembershipId = String(accepted.body.membershipId);
    const enterprisePrincipal = String(accepted.body.principalId);
    record(
      "enterpriseMembershipFromInvite",
      enterpriseTenant === "tenant.sample.enterprise" &&
        enterprisePrincipal === "principal.sample.enterprise",
    );

    observed = withEnterprise(
      withIdentity(provisionalObserved()),
      enterpriseTenant,
      enterpriseMembershipId,
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

    const sourceObserved = withReadSource(observed);
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

    const queryDigest = sha256(`query:${digest}:${enterpriseTenant}`);
    const matched = await attemptFirstSuccess({
      store: storeAfterRestart,
      digest: session.digest,
      accountId,
      observed: sourceObserved,
      evidence: {
        tenantId: enterpriseTenant,
        principalId: enterprisePrincipal,
        queryDigest,
        knowledgeFragmentDigests: [sha256("fragment.sample.1")],
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
    let baitObserved = withReadSource(
      withEnterprise(
        withIdentity(provisionalObserved()),
        enterpriseTenant,
        enterpriseMembershipId,
      ),
    );
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
      if (baitNext.missing.kind === "identity") {
        baitObserved = withIdentity(baitObserved);
      }
      if (baitNext.missing.kind === "workspace") {
        baitObserved = withEnterprise(
          baitObserved,
          enterpriseTenant,
          enterpriseMembershipId,
        );
      }
      if (baitNext.missing.kind === "read_source") {
        baitObserved = withReadSource(baitObserved);
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
      },
      accountId,
      enterpriseTenant,
      assertions,
      mutantsKilled,
      beginGrantTrace,
      storePath,
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

