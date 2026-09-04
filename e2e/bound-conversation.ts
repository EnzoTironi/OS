import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseZoenJson, runZoenCli, type ZoenCliResult } from "./zoen-cli.js";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { AUTH_DOOR_ORIGIN, E2E_DOOR_PASSWORD } from "./ba-door.js";
import {
  startBrowser,
  stopBrowser,
  waitForCondition,
  type BrowserProcess,
} from "./chromium-cdp.js";
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
  "channel_link_intents_binding_id_fkey",
  "channel_link_intents_lifecycle_check",
  "channel_link_intents_pkey",
  "channel_link_intents_token_hash_key",
  "channel_link_receipts_binding_id_fkey",
  "channel_link_receipts_intent_id_fkey",
  "channel_link_receipts_intent_id_key",
  "channel_link_receipts_pkey",
  "channel_link_receipts_source_account_id_fkey",
  "channel_link_receipts_target_account_id_fkey",
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

type HttpResult = { status: number; body: Record<string, unknown> };

async function issueLinkIntent(
  provider: "linq" | "telegram" | "whatsapp",
  subjectKey: string
): Promise<Record<string, unknown>> {
  const issued = await admin(
    "POST",
    "/identity/link-intents",
    { provider, subjectKey },
    machineToken
  );
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  return issued.body;
}

async function confirmLinkIntent(input: {
  readonly authorizationToken?: string;
  readonly body?: unknown;
  readonly origin?: string;
  readonly sessionToken?: string;
  readonly token: unknown;
}): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}/identity/link-intents/confirm`, {
    body: JSON.stringify(input.body ?? { token: input.token }),
    headers: {
      "content-type": "application/json",
      ...(input.authorizationToken === undefined
        ? {}
        : { authorization: `Bearer ${input.authorizationToken}` }),
      ...(input.sessionToken === undefined
        ? {}
        : {
            cookie: `better-auth.session_token=${encodeURIComponent(input.sessionToken)}`,
          }),
      ...(input.origin === undefined ? {} : { origin: input.origin }),
    },
    method: "POST",
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  if (text.startsWith("{")) {
    body = JSON.parse(text) as Record<string, unknown>;
  } else if (text.length > 0) {
    body = { raw: text };
  }
  return { body, status: response.status };
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

async function waitForBlockedDoorAccountResolution(
  observer: PostgresClient,
  lockerPid: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const blocked = await observer.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_stat_activity AS activity
          WHERE activity.pid <> $1
            AND activity.datname = current_database()
            AND activity.wait_event_type = 'Lock'
            AND position('FROM channel_bindings' IN activity.query) > 0
            AND position('WHERE provider = $1' IN activity.query) > 0
       ) AS blocked`,
      [lockerPid],
    );
    if (blocked.rows[0]?.blocked === true) {
      return;
    }
    await delay(25);
  }
  throw new Error("stale unbind did not pause on Door-account resolution");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  let auth: Awaited<ReturnType<typeof startAuthDoor>> | undefined;
  let browser: BrowserProcess | undefined;
  let browserHome: string | undefined;
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
    const linkTables = await pg.query(
      `SELECT to_regclass('public.channel_link_intents') IS NOT NULL AS intents,
              to_regclass('public.channel_link_receipts') IS NOT NULL AS receipts,
              to_regclass('public.onboard_tokens') IS NULL AS onboard_removed,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'channel_link_intents'
                   AND column_name = 'token_hash'
              ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'channel_link_intents'
                   AND column_name = 'token'
              ) AS token_hash_only`,
    );
    record(
      "link_tables_replace_onboard_tokens",
      linkTables.rows[0]?.intents === true &&
        linkTables.rows[0]?.receipts === true &&
        linkTables.rows[0]?.onboard_removed === true &&
        linkTables.rows[0]?.token_hash_only === true,
    );
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
      "/identity/link-intents",
      { provider: "telegram", subjectKey: telegramA },
      webA.token,
    );
    record(
      "door_cannot_issue_channel_possession_intent",
      unprovenDoorBind.status === 403,
    );

    const intentA = await issueLinkIntent("telegram", telegramA);
    const duplicatePending = await admin(
      "POST",
      "/identity/link-intents",
      { provider: "telegram", subjectKey: telegramA },
      machineToken,
    );
    record(
      "binding_has_only_one_pending_link_intent",
      duplicatePending.status === 409,
    );
    const bindingA = String(intentA.bindingId);
    const sourceA = await pg.query<{ account_id: string }>(
      "SELECT account_id FROM channel_bindings WHERE binding_id = $1",
      [bindingA],
    );
    const sourceAccountA = sourceA.rows[0]?.account_id;
    assert.ok(sourceAccountA);
    const linkPage = await fetch(`${baseUrl}/link`);
    const linkHtml = await linkPage.text();
    record(
      "link_page_keeps_token_in_fragment",
      String(intentA.href) === `${baseUrl}/link#token=${String(intentA.token)}` &&
        linkPage.status === 200 &&
        !linkHtml.includes(String(intentA.token)),
    );
    browserHome = await mkdtemp(path.join(tmpdir(), "zoen-link-browser-"));
    browser = await startBrowser(browserHome);
    await browser.page.navigate(String(intentA.href), `${baseUrl}/link`);
    await waitForCondition(
      browser.page,
      `(() => {
        const form = document.querySelector("#signin");
        return location.hash === "" &&
          sessionStorage.getItem("zoen.link-token") !== null &&
          form instanceof HTMLElement && !form.hidden;
      })()`,
      10_000,
      "link token fragment clearing and unauthenticated sign-in form",
    );
    const pendingBrowser = z
      .object({
        hash: z.literal(""),
        signInVisible: z.boolean(),
        storedToken: z.string(),
      })
      .strict()
      .parse(
        await browser.page.evaluate(`(() => {
          const form = document.querySelector("#signin");
          return {
            hash: location.hash,
            signInVisible: form instanceof HTMLElement && !form.hidden,
            storedToken: sessionStorage.getItem("zoen.link-token"),
          };
        })()`),
      );
    record(
      "link_browser_clears_fragment_into_session_storage",
      pendingBrowser.signInVisible &&
        pendingBrowser.storedToken === String(intentA.token),
    );
    const submitted = z.boolean().parse(
      await browser.page.evaluate(`(() => {
        const form = document.querySelector("#signin");
        const email = form?.querySelector('input[name="email"]');
        const password = form?.querySelector('input[name="password"]');
        if (!(form instanceof HTMLFormElement) ||
            !(email instanceof HTMLInputElement) ||
            !(password instanceof HTMLInputElement)) {
          return false;
        }
        email.value = ${JSON.stringify(webA.email)};
        password.value = ${JSON.stringify(E2E_DOOR_PASSWORD)};
        form.requestSubmit();
        return true;
      })()`),
    );
    assert.equal(submitted, true, "link Better Auth form must submit");
    await waitForCondition(
      browser.page,
      `document.querySelector("#status")?.textContent ===
        "Pronto. Esta conversa agora reconhece você." &&
        sessionStorage.getItem("zoen.link-token") === null`,
      10_000,
      "link confirmation and sessionStorage cleanup",
    );
    const browserLink = await pg.query<{
      account_id: string;
      binding_status: string;
      consumed: boolean;
      receipt_id: string;
      source_account_id: string;
      target_account_id: string;
    }>(
      `SELECT binding.account_id, binding.status AS binding_status,
              intent.consumed_at IS NOT NULL AS consumed,
              receipt.receipt_id, receipt.source_account_id,
              receipt.target_account_id
         FROM channel_bindings AS binding
         JOIN channel_link_intents AS intent USING (binding_id)
         JOIN channel_link_receipts AS receipt USING (intent_id, binding_id)
        WHERE binding.binding_id = $1 AND intent.intent_id = $2`,
      [bindingA, String(intentA.intentId)],
    );
    const browserLinkRow = browserLink.rows[0];
    assert.ok(browserLinkRow);
    record(
      "link_browser_confirms_binding_receipt_and_consumption",
      browserLinkRow.account_id === accountA &&
        browserLinkRow.binding_status === "verified" &&
        browserLinkRow.consumed &&
        browserLinkRow.receipt_id.length > 0 &&
        browserLinkRow.source_account_id === sourceAccountA &&
        browserLinkRow.target_account_id === accountA,
    );
    await stopBrowser(browser);
    browser = undefined;
    await rm(browserHome, { force: true, recursive: true });
    browserHome = undefined;
    const mergedSourceA = await pg.query<{
      merged_into_account_id: string | null;
      status: string;
    }>(
      "SELECT status, merged_into_account_id FROM zoen_accounts WHERE account_id = $1",
      [sourceAccountA],
    );
    record(
      "empty_channel_source_becomes_merged_shell",
      mergedSourceA.rows[0]?.status === "merged_into" &&
        mergedSourceA.rows[0]?.merged_into_account_id === accountA,
    );

    const wrongOriginIntent = await issueLinkIntent("telegram", "8100000010");
    const wrongOrigin = await confirmLinkIntent({
      origin: "https://evil.example",
      sessionToken: webA.token,
      token: wrongOriginIntent.token,
    });
    record("link_rejects_wrong_origin", wrongOrigin.status === 403);
    const afterWrongOrigin = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: wrongOriginIntent.token,
    });
    record("wrong_origin_does_not_consume_intent", afterWrongOrigin.status === 200);

    const wrongCookieIntent = await issueLinkIntent("telegram", "8100000011");
    const wrongCookie = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: "not-a-live-door-session",
      token: wrongCookieIntent.token,
    });
    record("link_rejects_wrong_session_cookie", wrongCookie.status === 401);
    const afterWrongCookie = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: wrongCookieIntent.token,
    });
    record("wrong_cookie_does_not_consume_intent", afterWrongCookie.status === 200);

    const bearerIntent = await issueLinkIntent("telegram", "8100000018");
    const bearerConfirmation = await confirmLinkIntent({
      authorizationToken: webA.token,
      origin: baseUrl,
      sessionToken: webA.token,
      token: bearerIntent.token,
    });
    record(
      "link_confirmation_rejects_authorization_header",
      bearerConfirmation.status === 400,
    );
    const afterBearer = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: bearerIntent.token,
    });
    record("authorization_header_does_not_consume_intent", afterBearer.status === 200);

    const wrongFieldsIntent = await issueLinkIntent("telegram", "8100000012");
    const wrongFields = await confirmLinkIntent({
      body: { accountId: accountA, token: wrongFieldsIntent.token },
      origin: baseUrl,
      sessionToken: webA.token,
      token: wrongFieldsIntent.token,
    });
    record("link_rejects_caller_account_field", wrongFields.status === 422);
    const afterWrongFields = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: wrongFieldsIntent.token,
    });
    record("wrong_fields_do_not_consume_intent", afterWrongFields.status === 200);

    const concurrentIntent = await issueLinkIntent("telegram", "8100000013");
    const concurrent = await Promise.all([
      confirmLinkIntent({
        origin: baseUrl,
        sessionToken: webA.token,
        token: concurrentIntent.token,
      }),
      confirmLinkIntent({
        origin: baseUrl,
        sessionToken: webA.token,
        token: concurrentIntent.token,
      }),
    ]);
    record(
      "concurrent_link_has_exactly_one_success",
      concurrent.filter(({ status }) => status === 200).length === 1 &&
        concurrent.filter(({ status }) => status === 409).length === 1,
    );

    const atomicIntent = await issueLinkIntent("telegram", "8100000014");
    const atomicBinding = String(atomicIntent.bindingId);
    const atomicBefore = await pg.query<{ account_id: string }>(
      "SELECT account_id FROM channel_bindings WHERE binding_id = $1",
      [atomicBinding],
    );
    const atomicSource = atomicBefore.rows[0]?.account_id;
    assert.ok(atomicSource);
    await pg.query(
      `ALTER TABLE channel_link_receipts
       ADD CONSTRAINT channel_link_receipts_journey_failure
       CHECK (binding_id NOT LIKE 'binding.%') NOT VALID`,
    );
    const atomicFailure = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: atomicIntent.token,
    });
    const atomicAfter = await pg.query<{
      account_id: string;
      consumed: boolean;
      receipts: string;
    }>(
      `SELECT binding.account_id,
              intent.consumed_at IS NOT NULL AS consumed,
              (SELECT count(*)::text FROM channel_link_receipts WHERE binding_id = $1) AS receipts
         FROM channel_bindings AS binding
         JOIN channel_link_intents AS intent USING (binding_id)
        WHERE binding.binding_id = $1`,
      [atomicBinding],
    );
    record(
      "receipt_failure_rolls_back_binding_and_intent",
      atomicFailure.status >= 400 &&
        atomicAfter.rows[0]?.account_id === atomicSource &&
        atomicAfter.rows[0]?.consumed === false &&
        atomicAfter.rows[0]?.receipts === "0",
    );
    await pg.query(
      "ALTER TABLE channel_link_receipts DROP CONSTRAINT channel_link_receipts_journey_failure",
    );
    const atomicRetry = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: atomicIntent.token,
    });
    record("atomic_failure_can_retry", atomicRetry.status === 200);

    const receiptId = browserLinkRow.receipt_id;
    await assert.rejects(
      pg.query(
        "UPDATE channel_link_receipts SET confirmed_at = clock_timestamp() WHERE receipt_id = $1",
        [receiptId],
      ),
    );
    await assert.rejects(
      pg.query("DELETE FROM channel_link_receipts WHERE receipt_id = $1", [
        receiptId,
      ]),
    );
    await assert.rejects(
      pg.query(
        "UPDATE channel_link_intents SET expires_at = expires_at + interval '1 hour' WHERE intent_id = $1",
        [String(intentA.intentId)],
      ),
    );
    record("link_intent_and_receipt_are_immutable", true);

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
    const authDoorBindingAId = authDoorBindingA.rows[0]?.binding_id;
    assert.ok(authDoorBindingAId);
    record(
      "web_ingress_uses_authenticated_door_binding",
      webIngress.body.bindingProvider === "auth_door" &&
        webIngress.body.bindingId === authDoorBindingAId,
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
    const unbindIntent = await issueLinkIntent("telegram", unboundSubject);
    const boundForUnbind = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: unbindIntent.token,
    });
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
    const intentB = await issueLinkIntent("telegram", telegramB);
    const bindB = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webB.token,
      token: intentB.token,
    });
    assert.equal(bindB.status, 200, JSON.stringify(bindB.body));
    record("telegram_b_separate_account", accountB !== accountA);
    record("telegram_b_separate_world", worldB !== worldA && worldB.length > 0);

    const ownershipIntent = await issueLinkIntent("telegram", "8100000019");
    const ownedByA = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: ownershipIntent.token,
    });
    assert.equal(ownedByA.status, 200, JSON.stringify(ownedByA.body));
    const ownershipBindingId = String(ownedByA.body.bindingId);
    const transferDuringUnbind = await issueLinkIntent(
      "telegram",
      "8100000019",
    );
    const locker = new PostgresClient({ connectionString: adminDatabaseUrl });
    let lockerTransaction = false;
    let staleUnbindPromise: Promise<HttpResult> | undefined;
    await locker.connect();
    try {
      await locker.query("BEGIN");
      lockerTransaction = true;
      const lockerIdentity = await locker.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      const lockerPid = lockerIdentity.rows[0]?.pid;
      assert.ok(lockerPid);
      await locker.query(
        "SELECT binding_id FROM channel_bindings WHERE binding_id = $1 FOR UPDATE",
        [authDoorBindingAId],
      );
      staleUnbindPromise = admin(
        "POST",
        "/identity/admin/unbind",
        { bindingId: ownershipBindingId, reason: "user_request" },
        webA.token,
      );
      await waitForBlockedDoorAccountResolution(locker, lockerPid);
      const transferredWhileStale = await confirmLinkIntent({
        origin: baseUrl,
        sessionToken: webB.token,
        token: transferDuringUnbind.token,
      });
      await locker.query("COMMIT");
      lockerTransaction = false;
      const staleUnbind = await staleUnbindPromise;
      staleUnbindPromise = undefined;
      const bindingAfterRace = await pg.query<{
        account_id: string;
        status: string;
      }>(
        "SELECT account_id, status FROM channel_bindings WHERE binding_id = $1",
        [ownershipBindingId],
      );
      record(
        "stale_owner_cannot_unbind_after_transfer_interleaving",
        transferredWhileStale.status === 200 &&
          transferredWhileStale.body.targetAccountId === accountB &&
          staleUnbind.status === 409 &&
          staleUnbind.body.error ===
            "identity conflict: binding owner changed before unbind" &&
          bindingAfterRace.rows[0]?.account_id === accountB &&
          bindingAfterRace.rows[0]?.status === "verified",
      );
    } finally {
      if (lockerTransaction) {
        await locker.query("ROLLBACK");
      }
      if (staleUnbindPromise !== undefined) {
        await staleUnbindPromise.catch(() => undefined);
      }
      await locker.end();
    }

    const transferableIntent = await issueLinkIntent("telegram", "8100000015");
    const linkedToB = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webB.token,
      token: transferableIntent.token,
    });
    assert.equal(linkedToB.status, 200, JSON.stringify(linkedToB.body));
    const relinkIntent = await issueLinkIntent("telegram", "8100000015");
    const linkedToA = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: relinkIntent.token,
    });
    assert.equal(linkedToA.status, 200, JSON.stringify(linkedToA.body));
    const preservedB = await pg.query<{
      membership_count: string;
      status: string;
      world_id: string;
    }>(
      `SELECT account.status, personal.world_id,
              count(membership.membership_id)::text AS membership_count
         FROM zoen_accounts AS account
         JOIN personal_worlds AS personal USING (account_id)
         JOIN memberships AS membership USING (account_id)
        WHERE account.account_id = $1
        GROUP BY account.status, personal.world_id`,
      [accountB],
    );
    record(
      "nonempty_source_keeps_membership_and_world",
      linkedToA.body.sourceAccountId === accountB &&
        linkedToA.body.sourceAccountPreserved === true &&
        preservedB.rows[0]?.status === "verified" &&
        preservedB.rows[0]?.world_id === worldB &&
        Number(preservedB.rows[0]?.membership_count) >= 1,
    );

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
    const bindReplay = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: intentA.token,
    });
    record(
      "telegram_a_link_replay_has_link_intent_error",
      bindReplay.status === 409 &&
        bindReplay.body.error === "link intent already consumed" &&
        !String(bindReplay.body.error).includes("invite"),
    );

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

    const restartIntent = await issueLinkIntent("telegram", "8100000016");
    await stopServer(server);
    server = await startServer(policyManifestPath, {
      extraEnv: {
        ZOEN_EVE_BASE_URL: eveOrigin,
        ZOEN_LINK_INTENT_TTL_SECONDS: "1",
      },
      kind: "default",
    });
    const confirmedAfterRestart = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: restartIntent.token,
    });
    record(
      "restart_preserves_pending_link_intent",
      confirmedAfterRestart.status === 200,
    );
    const expiringIntent = await issueLinkIntent("telegram", "8100000017");
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const expired = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: expiringIntent.token,
    });
    record("expired_link_intent_fails_closed", expired.status === 409);
    const renewedIntent = await issueLinkIntent("telegram", "8100000017");
    record(
      "expired_intent_can_be_replaced_without_reusing_secret",
      renewedIntent.intentId !== expiringIntent.intentId &&
        renewedIntent.token !== expiringIntent.token,
    );
    const invalidated = await confirmLinkIntent({
      origin: baseUrl,
      sessionToken: webA.token,
      token: expiringIntent.token,
    });
    record(
      "replaced_link_intent_has_invalidated_error",
      invalidated.status === 409 &&
        invalidated.body.error === "link intent invalidated" &&
        !String(invalidated.body.error).includes("invite"),
    );
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
        deferredTo: ["W3-03", "W5-03", "W5-04", "W5-05"],
        proven:
          "W3-02 one-time channel-possession LinkIntent confirmed through the real /link Chromium and Better Auth path, with exact-binding continuity, atomic receipts, and owner-checked unbind after transfer",
        notClaimed:
          "signed Telegram/Kapso ingress, provider webhook replay, origin-bound reply delivery, and cross-channel workbench recovery",
      },
      scopedDimensions: {
        actors:
          "trusted channel edge, Web A / Telegram A, and separate Web B / Telegram B identities",
        isolation:
          "Telegram B remains on Web B Account and World; moving another exact binding preserves Web B Membership and World",
        negative:
          "wrong Origin, invalid cookie, Authorization header, caller-supplied account fields, expired/replayed/invalidated tokens, stale-owner unbind, provisional bindings, wrong World, and divergent Cookie/Bearer credentials fail closed",
        path:
          "trusted edge issues a token-hash-only LinkIntent; Chromium clears its fragment into sessionStorage, submits the Better Auth form, confirms with only token, exact Origin, and cookie, then clears storage; Web A and Telegram A resolve one Account, Membership, World, and active release",
        recovery:
          "zoend restart preserves a pending LinkIntent plus Account, verified ChannelBinding, Membership, World, and active release; a receipt failure rolls back atomically",
        replay:
          "concurrent confirmation has exactly one success, LinkIntent replay and invalidation return domain-specific conflicts, and repeated Telegram resolution returns the same authority",
      },
      finishedAt,
      passed,
      startedAt,
      unit: "W3-02",
      verdict: passed ? "PASS" : "FAIL",
    });
    const total = Object.keys(assertions).length;
    const ok = Object.values(assertions).filter(Boolean).length;
    console.log(`bound-conversation ${passed ? "PASS" : "FAIL"} assertions ${ok}/${total} → ${artifactPath}`);
    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    if (browser !== undefined) {
      await stopBrowser(browser);
    }
    if (browserHome !== undefined) {
      await rm(browserHome, { force: true, recursive: true });
    }
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
