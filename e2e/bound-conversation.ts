import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseZoenJson, runZoenCli, type ZoenCliResult } from "./zoen-cli.js";
import { Client as PostgresClient } from "pg";
import { AUTH_DOOR_ORIGIN } from "./ba-door.js";
import { startEve } from "./eve-support.js";
import { stopProcess, type ManagedProcess } from "./effect-support.js";
import { releaseAuthorityPolicies } from "./kernel-world-support.js";
import {
  adminDatabaseUrl,
  applicationDatabaseUrl,
  authDatabaseUrl,
  signUpSession,
  startAuthDoor,
  startServer,
  stopAuthDoor,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eIdentityAdminToken,
  writeScenarioArtifact,
} from "./host-env.js";

const scenario = "bound-conversation";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_595);
const eveOrigin = e2eHttpUrl("ZOEN_E2E_EVE_PORT", 59_221);
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
const zoenPath = path.join(targetDir, "debug", "zoen");
const machineToken = e2eIdentityAdminToken();
const databaseUrl = applicationDatabaseUrl;

const telegramA = "8100000001";
const telegramB = "8100000002";

const canonicalIdentityConstraints = [
  "channel_bindings_account_id_fkey",
  "channel_bindings_account_id_not_null",
  "channel_bindings_binding_id_not_null",
  "channel_bindings_lifecycle_check",
  "channel_bindings_pkey",
  "channel_bindings_provider_check",
  "channel_bindings_provider_not_null",
  "channel_bindings_status_check",
  "channel_bindings_status_not_null",
  "channel_bindings_subject_key_check",
  "channel_bindings_subject_key_not_null",
  "channel_bindings_unbind_reason_check",
  "invites_world_id_fkey",
  "invites_world_id_not_null",
  "memberships_account_id_world_id_key",
  "memberships_kind_check",
  "memberships_kind_source_check",
  "memberships_lifecycle_check",
  "memberships_world_id_fkey",
  "memberships_world_id_not_null",
  "personal_worlds_account_id_fkey",
  "personal_worlds_account_id_not_null",
  "personal_worlds_pkey",
  "personal_worlds_world_id_fkey",
  "personal_worlds_world_id_key",
  "personal_worlds_world_id_not_null",
  "worlds_pkey",
] as const;

const assertions: Record<string, boolean> = {};

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
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

type ZoenResult = ZoenCliResult;

function runZoen(args: readonly string[]): ZoenResult {
  return runZoenCli(zoenPath, databaseUrl, args);
}

function parseJson(text: string): Record<string, unknown> {
  return parseZoenJson(text);
}

async function proveInviteOnlyWorldMigration(): Promise<void> {
  const pg = new PostgresClient({ connectionString: adminDatabaseUrl });
  const identityMigration = await readFile(
    path.join(
      repositoryRoot,
      "crates",
      "zoen-adapters",
      "migrations",
      "0010_identity_accounts.sql",
    ),
    "utf8",
  );
  const worldMigration = await readFile(
    path.join(
      repositoryRoot,
      "crates",
      "zoen-adapters",
      "migrations",
      "0038_identity_world_channel_binding.sql",
    ),
    "utf8",
  );
  const onboardMigration = await readFile(
    path.join(
      repositoryRoot,
      "crates",
      "zoen-adapters",
      "migrations",
      "0022_onboard_tokens.sql",
    ),
    "utf8",
  );
  await pg.connect();
  await pg.query("BEGIN");
  try {
    await pg.query("SET LOCAL search_path TO pg_temp");
    await pg.query(identityMigration);
    await pg.query(onboardMigration);
    await pg.query(
      `INSERT INTO invites (
         invite_id, tenant_id, principal_id, token_hash, expires_at,
         workload_id, actor_id, delegation_json
       ) VALUES (
         'invite.pre-migration', 'world.invite-only', 'principal.invitee',
         decode(repeat('ab', 32), 'hex'), '2100-01-01T00:00:00Z',
         'workload.invitee', 'actor.invitee',
         '{"grants":[{"actionIds":["zoen.world.read"],"delegationId":"delegation.invite","expiresAt":4102444800000000,"notBefore":0,"resourceIds":["world.invite-only"],"workloadIds":["workload.invitee"]}]}'::jsonb
       )`,
    );
    await pg.query(worldMigration);
    const migrated = await pg.query<{
      consumed_at: Date | null;
      kind: string;
      world_id: string;
    }>(
      `SELECT invite.consumed_at, world.kind, invite.world_id
         FROM invites AS invite
         JOIN worlds AS world USING (world_id)
        WHERE invite.invite_id = 'invite.pre-migration'`,
    );
    record(
      "migration_preserves_unconsumed_invite_only_world",
      migrated.rows[0]?.world_id === "world.invite-only" &&
        migrated.rows[0]?.kind === "shared" &&
        migrated.rows[0]?.consumed_at === null,
    );
  } finally {
    await pg.query("ROLLBACK");
    await pg.end();
  }
}

async function proveCanonicalConstraintNames(pg: PostgresClient): Promise<void> {
  const result = await pg.query<{ conname: string }>(
    `SELECT constraint_row.conname
       FROM pg_constraint AS constraint_row
       JOIN pg_namespace AS namespace_row
         ON namespace_row.oid = constraint_row.connamespace
      WHERE namespace_row.nspname = 'public'`,
  );
  const names = new Set(result.rows.map(({ conname }) => conname));
  record(
    "identity_constraints_use_canonical_names",
    canonicalIdentityConstraints.every((name) => names.has(name)),
  );
  record(
    "legacy_identity_constraint_names_removed",
    [...names].every(
      (name) =>
        !name.startsWith("external_bindings_") &&
        !name.startsWith("personal_tenants_") &&
        name !== "invites_tenant_id_not_null" &&
        name !== "memberships_account_id_tenant_id_key" &&
        name !== "memberships_tenant_id_not_null",
    ),
  );
}

async function openEveSession(input: {
  readonly authorizationToken?: string;
  readonly message: string;
  readonly token: string;
  readonly worldId: string;
}): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await fetch(`${baseUrl}/eve/v1/session`, {
    body: JSON.stringify({ message: input.message }),
    headers: {
      ...(input.authorizationToken === undefined
        ? {}
        : { authorization: `Bearer ${input.authorizationToken}` }),
      "content-type": "application/json",
      cookie: `better-auth.session_token=${encodeURIComponent(input.token)}`,
      "x-zoen-tenant": input.worldId,
    },
    method: "POST",
  });
  const text = await response.text();
  return {
    body:
      text.length === 0
        ? {}
        : (JSON.parse(text) as Record<string, unknown>),
    status: response.status,
  };
}

function buildPolicyCatalog(): { bytes: string; evidenceDigest: string } {
  const source = `permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "zoen.world.discover"
};
`;
  const policyDigest = createHash("sha256").update(source).digest("hex");
  const releasePolicies = releaseAuthorityPolicies();
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: {
      policies: [
        {
          actionId: "zoen.world.discover",
          definitionDigest: "a".repeat(64),
          digest: policyDigest,
          policyId: "policy.world.discover.r1",
          revision: 1,
          source,
        },
        ...releasePolicies,
      ],
    },
    membershipDelegation: [],
    sourceAdmission: [],
  })}\n`;
  return {
    bytes,
    evidenceDigest: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function activateReleaseForWorld(
  worldId: string,
  principalId: string,
  membershipId: string,
): Promise<string> {
  await mkdir(generatedDirectory, { recursive: true });
  const policy = buildPolicyCatalog();
  const bytes = {
    ontology: `{"label":"bound-conversation.${worldId}","publicVerbs":["Discover","Query","Propose","Decide","Commit","Explain","Execute"],"schema":"zoen.ontology-catalog.v1"}\n`,
    policy: policy.bytes,
    executors: `executor catalog for ${worldId}\n`,
    components: `component catalog for ${worldId}\n`,
  };
  const content = {
    world: worldId,
    parent: null,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  };
  const filePath = path.join(generatedDirectory, "release.json");
  await writeFile(filePath, `${JSON.stringify(content)}\n`);

  const published = runZoen([
    "world",
    "release",
    "publish",
    "--file",
    filePath,
    "--principal",
    principalId,
    "--membership",
    membershipId,
  ]);
  assert.equal(published.status, 0, published.stderr || published.stdout);
  const body = parseJson(published.stdout);
  const digest = String(body.digest);
  const previewed = runZoen([
    "world",
    "release",
    "preview",
    "--world",
    worldId,
    "--digest",
    digest,
    "--principal",
    principalId,
    "--membership",
    membershipId,
  ]);
  assert.equal(previewed.status, 0, previewed.stderr || previewed.stdout);
  const previewDigest = String(parseJson(previewed.stdout).previewDigest);
  const decided = runZoen([
    "world",
    "release",
    "decide",
    "--preview-digest",
    previewDigest,
    "--principal",
    principalId,
    "--membership",
    membershipId,
    "--decision",
    "approve",
  ]);
  assert.equal(decided.status, 0, decided.stderr || decided.stdout);
  const activated = runZoen([
    "world",
    "release",
    "activate",
    "--world",
    worldId,
    "--digest",
    digest,
    "--preview-digest",
    previewDigest,
    "--principal",
    principalId,
    "--membership",
    membershipId,
  ]);
  assert.equal(activated.status, 0, activated.stderr || activated.stdout);
  return digest;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  let auth: Awaited<ReturnType<typeof startAuthDoor>> | undefined;
  let eve: ManagedProcess | undefined;
  let server: ServerProcess | undefined;
  const pg = new PostgresClient({ connectionString: databaseUrl });
  try {
    await mkdir(generatedDirectory, { recursive: true });
    const policyManifestPath = path.join(generatedDirectory, "policies.json");
    await writeFile(policyManifestPath, `${JSON.stringify({ policies: [] }, null, 2)}\n`);
    auth = await startAuthDoor(authDatabaseUrl);
    server = await startServer(policyManifestPath, {
      extraEnv: { ZOEN_EVE_BASE_URL: eveOrigin },
      kind: "default",
    });
    await pg.connect();
    await proveInviteOnlyWorldMigration();
    await proveCanonicalConstraintNames(pg);

    const webA = await signUpSession({ id: "web-a", zoendBaseUrl: baseUrl });
    const bootstrapA = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      webA.token,
    );
    assert.equal(bootstrapA.status, 200, JSON.stringify(bootstrapA.body));
    const accountA = String(bootstrapA.body.accountId);
    const worldA = String(bootstrapA.body.worldId);
    const membershipA = String(bootstrapA.body.membershipId);
    record("web_a_has_account", accountA.length > 0);
    record("web_a_has_world", worldA.length > 0);
    record("web_a_has_membership", membershipA.length > 0);

    const worldRow = await pg.query(
      "SELECT world_id, kind FROM worlds WHERE world_id = $1",
      [worldA],
    );
    record("world_row_personal", worldRow.rows[0]?.kind === "personal");
    const bindingTable = await pg.query(
      "SELECT to_regclass('public.channel_bindings') IS NOT NULL AS present",
    );
    record("channel_bindings_table", bindingTable.rows[0]?.present === true);
    const legacy = await pg.query(
      "SELECT to_regclass('public.external_bindings') IS NULL AS gone",
    );
    record("external_bindings_renamed", legacy.rows[0]?.gone === true);
    const membershipCol = await pg.query(
      `SELECT 1 AS ok
         FROM information_schema.columns
        WHERE table_name = 'memberships' AND column_name = 'world_id'`,
    );
    record("memberships_world_id_column", (membershipCol.rowCount ?? 0) > 0);

    const unprovenDoorBind = await admin(
      "POST",
      "/identity/admin/bind-verified",
      { accountId: accountA, provider: "telegram", subjectKey: telegramA },
      webA.token,
    );
    record("door_cannot_bind_unproven_channel", unprovenDoorBind.status === 403);

    const bindA = await admin(
      "POST",
      "/identity/admin/bind-verified",
      { accountId: accountA, provider: "telegram", subjectKey: telegramA },
      machineToken,
    );
    assert.equal(bindA.status, 200, JSON.stringify(bindA.body));
    const bindingA = String(bindA.body.bindingId);
    record("telegram_a_bound", bindingA.length > 0);

    const principalA = String(bootstrapA.body.principalId);
    const releaseDigest = await activateReleaseForWorld(
      worldA,
      principalA,
      membershipA,
    );
    record("world_release_activated", /^[0-9a-f]{64}$/.test(releaseDigest));

    const webIngress = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}`,
      undefined,
      webA.token,
    );
    assert.equal(webIngress.status, 200, JSON.stringify(webIngress.body));
    record(
      "web_ingress_account_world_membership",
      webIngress.body.accountId === accountA &&
        webIngress.body.worldId === worldA &&
        webIngress.body.membershipId === membershipA,
    );
    record(
      "web_ingress_active_release",
      webIngress.body.activeReleaseDigest === releaseDigest,
    );
    const authDoorBindingA = await pg.query<{ binding_id: string }>(
      `SELECT binding_id
         FROM channel_bindings
        WHERE account_id = $1 AND provider = 'auth_door' AND status = 'verified'`,
      [accountA],
    );
    record(
      "web_ingress_uses_authenticated_door_binding",
      webIngress.body.bindingProvider === "auth_door" &&
        webIngress.body.bindingId === authDoorBindingA.rows[0]?.binding_id,
    );

    const tgIngress = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}&provider=telegram&subjectKey=${encodeURIComponent(telegramA)}`,
      undefined,
      machineToken,
    );
    assert.equal(tgIngress.status, 200, JSON.stringify(tgIngress.body));
    record(
      "telegram_a_shares_account_world",
      tgIngress.body.accountId === accountA &&
        tgIngress.body.worldId === worldA &&
        tgIngress.body.membershipId === membershipA &&
        tgIngress.body.activeReleaseDigest === releaseDigest,
    );
    record(
      "telegram_a_binding_id",
      tgIngress.body.bindingId === bindingA &&
        tgIngress.body.bindingProvider === "telegram",
    );

    const provisionalSubject = "8100000003";
    const provisional = await admin(
      "POST",
      "/identity/admin/provisional",
      { provider: "telegram", subjectKey: provisionalSubject },
      machineToken,
    );
    assert.equal(provisional.status, 200, JSON.stringify(provisional.body));
    const provisionalIngress = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}&provider=telegram&subjectKey=${encodeURIComponent(provisionalSubject)}`,
      undefined,
      machineToken,
    );
    record(
      "provisional_channel_binding_fails_closed",
      provisionalIngress.status >= 400,
    );

    const unboundSubject = "8100000004";
    const boundForUnbind = await admin(
      "POST",
      "/identity/admin/bind-verified",
      { accountId: accountA, provider: "telegram", subjectKey: unboundSubject },
      machineToken,
    );
    assert.equal(boundForUnbind.status, 200, JSON.stringify(boundForUnbind.body));
    const unbound = await admin(
      "POST",
      "/identity/admin/unbind",
      { bindingId: String(boundForUnbind.body.bindingId), reason: "user_request" },
      webA.token,
    );
    record("account_owner_can_unbind_channel", unbound.status === 204);
    const unboundIngress = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}&provider=telegram&subjectKey=${encodeURIComponent(unboundSubject)}`,
      undefined,
      machineToken,
    );
    record(
      "unbound_channel_binding_fails_closed",
      unboundIngress.status >= 400,
    );

    const webB = await signUpSession({ id: "web-b", zoendBaseUrl: baseUrl });
    const bootstrapB = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      webB.token,
    );
    assert.equal(bootstrapB.status, 200, JSON.stringify(bootstrapB.body));
    const accountB = String(bootstrapB.body.accountId);
    const worldB = String(bootstrapB.body.worldId);
    const bindB = await admin(
      "POST",
      "/identity/admin/bind-verified",
      { accountId: accountB, provider: "telegram", subjectKey: telegramB },
      machineToken,
    );
    assert.equal(bindB.status, 200, JSON.stringify(bindB.body));
    record("telegram_b_separate_account", accountB !== accountA);
    record("telegram_b_separate_world", worldB !== worldA && worldB.length > 0);

    const bIntoA = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}&provider=telegram&subjectKey=${encodeURIComponent(telegramB)}`,
      undefined,
      machineToken,
    );
    record("telegram_b_denied_world_a", bIntoA.status >= 400);

    const tgReplay = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}&provider=telegram&subjectKey=${encodeURIComponent(telegramA)}`,
      undefined,
      machineToken,
    );
    record(
      "telegram_a_replay_same_ingress",
      tgReplay.status === 200 &&
        tgReplay.body.accountId === accountA &&
        tgReplay.body.membershipId === membershipA &&
        tgReplay.body.activeReleaseDigest === releaseDigest,
    );
    const bindReplay = await admin(
      "POST",
      "/identity/admin/bind-verified",
      { accountId: accountA, provider: "telegram", subjectKey: telegramA },
      machineToken,
    );
    record("telegram_a_bind_replay_fail_closed", bindReplay.status >= 400);

    const bOwn = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldB)}&provider=telegram&subjectKey=${encodeURIComponent(telegramB)}`,
      undefined,
      machineToken,
    );
    record(
      "telegram_b_own_world_isolated",
      bOwn.status === 200 &&
        bOwn.body.accountId === accountB &&
        bOwn.body.worldId === worldB &&
        bOwn.body.accountId !== accountA,
    );
    record(
      "world_b_has_no_active_release",
      bOwn.body.activeReleaseDigest === null,
    );

    eve = await startEve({
      authBaseUrl: AUTH_DOOR_ORIGIN,
      eveOrigin,
      zoendBaseUrl: baseUrl,
    });
    const eveSessionA = await openEveSession({
      message: "Open my bound membership.",
      token: webA.token,
      worldId: worldA,
    });
    assert.equal(
      eveSessionA.status,
      202,
      `Eve session failed: ${JSON.stringify(eveSessionA.body)}\n${eve.output.join("")}`,
    );
    record(
      "web_a_enters_through_authenticated_eve",
      eveSessionA.status === 202 &&
        typeof eveSessionA.body.sessionId === "string" &&
        eveSessionA.body.sessionId.length > 0,
    );
    const eveWithoutRelease = await openEveSession({
      message: "Open my World before it has an active release.",
      token: webB.token,
      worldId: worldB,
    });
    record(
      "authenticated_eve_requires_active_release",
      eveWithoutRelease.status === 401,
    );
    const eveWrongWorld = await openEveSession({
      message: "Open another person's World.",
      token: webA.token,
      worldId: worldB,
    });
    record(
      "authenticated_eve_rejects_wrong_world",
      eveWrongWorld.status === 401,
    );
    const eveMixedCredentials = await openEveSession({
      authorizationToken: webB.token,
      message: "Mix another person's bearer with my browser cookie.",
      token: webA.token,
      worldId: worldB,
    });
    record(
      "authenticated_eve_rejects_divergent_cookie_and_bearer",
      eveMixedCredentials.status === 401,
    );

    await stopServer(server);
    server = await startServer(policyManifestPath, {
      extraEnv: { ZOEN_EVE_BASE_URL: eveOrigin },
      kind: "default",
    });
    const afterRestart = await admin(
      "GET",
      `/identity/admin/resolve-ingress?world=${encodeURIComponent(worldA)}&provider=telegram&subjectKey=${encodeURIComponent(telegramA)}`,
      undefined,
      machineToken,
    );
    record(
      "restart_preserves_binding_world_release",
      afterRestart.status === 200 &&
        afterRestart.body.accountId === accountA &&
        afterRestart.body.worldId === worldA &&
        afterRestart.body.bindingId === bindingA &&
        afterRestart.body.activeReleaseDigest === releaseDigest,
    );
    const worldStill = await pg.query(
      "SELECT kind FROM worlds WHERE world_id = $1",
      [worldA],
    );
    record("restart_preserves_world_row", worldStill.rows[0]?.kind === "personal");
    const eveAfterRestart = await openEveSession({
      message: "Open my bound membership after recovery.",
      token: webA.token,
      worldId: worldA,
    });
    record(
      "authenticated_eve_recovers_after_zoend_restart",
      eveAfterRestart.status === 202 &&
        typeof eveAfterRestart.body.sessionId === "string" &&
        eveAfterRestart.body.sessionId.length > 0,
    );

    const finishedAt = new Date().toISOString();
    const passed = Object.values(assertions).every(Boolean);
    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      canonicalJourneyVerdict: "NOT_EVALUATED",
      journeySlice: {
        canonicalJourney: "J5",
        deferredTo: ["W3-02", "W3-03", "W5-03", "W5-04", "W5-05"],
        proven:
          "W3-01 identity storage and authenticated Web/Eve membership resolution",
        notClaimed:
          "channel-possession linking, signed Telegram/Kapso webhook replay, origin-bound reply delivery, cross-channel workbench recovery",
      },
      scopedDimensions: {
        actors: "Web A, Telegram A, and separate Web B / Telegram B identities",
        isolation: "Telegram B remains a separate Account and World and cannot resolve World A",
        negative:
          "provisional ChannelBinding, missing active release, wrong World, and divergent Cookie/Bearer credentials fail closed",
        path:
          "Web A traverses zoend proxy, production Eve, Better Auth, and one resolve-ingress authority for verified Account, ChannelBinding, Membership, World, and active release",
        recovery:
          "zoend restart preserves Account, verified ChannelBinding, Membership, World, and active release",
        replay:
          "repeated verified Telegram resolution returns the same Account, Membership, World, and release",
      },
      finishedAt,
      passed,
      startedAt,
      unit: "W3-01",
      verdict: passed ? "PASS" : "FAIL",
    });
    const total = Object.keys(assertions).length;
    const ok = Object.values(assertions).filter(Boolean).length;
    console.log(`bound-conversation ${passed ? "PASS" : "FAIL"} assertions ${ok}/${total} → ${artifactPath}`);
    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    if (eve !== undefined) {
      await stopProcess(eve);
    }
    if (server !== undefined) {
      await stopServer(server);
    }
    await pg.end().catch(() => undefined);
    if (auth !== undefined) {
      await stopAuthDoor(auth);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
