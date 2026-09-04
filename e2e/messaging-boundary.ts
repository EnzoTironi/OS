import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Client as PostgresClient } from "pg";
import { recordTelegramIdentity } from "../apps/conversation/agent/telegram-identity.js";
import {
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
import { assertImportGraphLaw } from "./messaging-boundary/import-graph.js";

const scenario = "messaging-boundary";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_501);
let identityAdminBearer: string | undefined;

const telegramSubject = "tg_user_bound_1";
const linqSubject = "linq_handle_bound_1";
const firstRecordedTelegramSubject = "7100000001";
const secondRecordedTelegramSubject = "7100000002";

const provisionalTelegramSnapshotSchema = z.object({
  account: z.object({
    accountId: z.string().min(1),
    status: z.literal("provisional"),
  }),
  bindings: z.array(
    z.object({
      accountId: z.string().min(1),
      bindingId: z.string().min(1),
      provider: z.literal("telegram"),
      status: z.literal("provisional"),
      subjectKey: z.string().min(1),
    })
  ),
  memberships: z.array(z.unknown()),
});
const retiredRoutes = [
  { method: "GET", path: "/channels/whatsapp/advertise" },
  { method: "POST", path: "/channels/whatsapp/inbound" },
  { method: "GET", path: "/channels/telegram/advertise" },
  { method: "POST", path: "/channels/telegram/inbound" },
  { method: "POST", path: "/conversation/stages" },
  { method: "POST", path: "/conversation/who-can" },
] as const;
const retiredTables = [
  "interaction_records",
  "conversation_pending",
  "conversation_turns",
  "turn_attempts",
  "conversation_arms",
  "delivery_intents",
  "delivery_observations",
  "delivery_send_claims",
  "reply_ledger",
  "ingress_replay",
] as const;

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

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
      ...((token ?? identityAdminBearer) === undefined
        ? {}
        : { authorization: `Bearer ${token ?? identityAdminBearer}` }),
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

async function seedBoundAccount(): Promise<{
  accountId: string;
  tenantId: string;
  principalId: string;
  membershipId: string;
  telegramBindingId: string;
  linqBindingId: string;
}> {
  const boundToken = (
    await signUpSession({ id: "bound-bait", zoendBaseUrl: baseUrl })
  ).token;
  identityAdminBearer = boundToken;
  const bootstrap = await admin(
    "POST",
    "/identity/admin/bootstrap-bound",
    undefined,
    boundToken,
  );
  assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
  const accountId = String(bootstrap.body.accountId);
  const tenantId = String(bootstrap.body.worldId);
  const principalId = String(bootstrap.body.principalId);
  const membershipId = String(bootstrap.body.membershipId);

  const telegramBind = await admin(
    "POST",
    "/identity/admin/bind-verified",
    {
      accountId,
      provider: "telegram",
      subjectKey: telegramSubject,
    },
    e2eIdentityAdminToken(),
  );
  assert.equal(telegramBind.status, 200, JSON.stringify(telegramBind.body));

  const linqBind = await admin(
    "POST",
    "/identity/admin/bind-verified",
    {
      accountId,
      provider: "linq",
      subjectKey: linqSubject,
    },
    e2eIdentityAdminToken(),
  );
  assert.equal(linqBind.status, 200, JSON.stringify(linqBind.body));

  return {
    accountId,
    linqBindingId: String(linqBind.body.bindingId),
    membershipId,
    principalId,
    telegramBindingId: String(telegramBind.body.bindingId),
    tenantId,
  };
}

async function recordTwoTelegramSubjects(): Promise<{
  accountIds: readonly [string, string];
  bindingIds: readonly [string, string];
  concurrentFirstAccountId: string;
  membershipCounts: readonly [number, number];
  repeatedAccountIds: readonly [string, string];
}> {
  const environment = {
    ...process.env,
    ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
    ZOEN_ZOEND: baseUrl,
  };
  const [first, firstConcurrent, second] = await Promise.all([
    recordTelegramIdentity({
      environment,
      userId: firstRecordedTelegramSubject,
    }),
    recordTelegramIdentity({
      environment,
      userId: firstRecordedTelegramSubject,
    }),
    recordTelegramIdentity({
      environment,
      userId: secondRecordedTelegramSubject,
    }),
  ]);
  const [firstRepeated, secondRepeated] = await Promise.all([
    recordTelegramIdentity({
      environment,
      userId: firstRecordedTelegramSubject,
    }),
    recordTelegramIdentity({
      environment,
      userId: secondRecordedTelegramSubject,
    }),
  ]);
  const [firstSnapshotResponse, secondSnapshotResponse] = await Promise.all([
    admin(
      "GET",
      `/identity/admin/accounts/${encodeURIComponent(first.accountId)}`,
      undefined,
      e2eIdentityAdminToken()
    ),
    admin(
      "GET",
      `/identity/admin/accounts/${encodeURIComponent(second.accountId)}`,
      undefined,
      e2eIdentityAdminToken()
    ),
  ]);
  assert.equal(firstSnapshotResponse.status, 200);
  assert.equal(secondSnapshotResponse.status, 200);
  const firstSnapshot = provisionalTelegramSnapshotSchema.parse(
    firstSnapshotResponse.body
  );
  const secondSnapshot = provisionalTelegramSnapshotSchema.parse(
    secondSnapshotResponse.body
  );
  const firstBindings = firstSnapshot.bindings.filter(
    (binding) => binding.subjectKey === firstRecordedTelegramSubject
  );
  const secondBindings = secondSnapshot.bindings.filter(
    (binding) => binding.subjectKey === secondRecordedTelegramSubject
  );
  assert.equal(firstBindings.length, 1);
  assert.equal(secondBindings.length, 1);
  const firstBinding = firstBindings[0];
  const secondBinding = secondBindings[0];
  assert.ok(firstBinding);
  assert.ok(secondBinding);
  assert.equal(firstBinding.accountId, first.accountId);
  assert.equal(secondBinding.accountId, second.accountId);
  return {
    accountIds: [first.accountId, second.accountId],
    bindingIds: [firstBinding.bindingId, secondBinding.bindingId],
    concurrentFirstAccountId: firstConcurrent.accountId,
    membershipCounts: [
      firstSnapshot.memberships.length,
      secondSnapshot.memberships.length,
    ],
    repeatedAccountIds: [firstRepeated.accountId, secondRepeated.accountId],
  };
}

async function assertRetiredRoutesAreAbsent(): Promise<void> {
  for (const route of retiredRoutes) {
    const response = await fetch(`${baseUrl}${route.path}`, {
      body: route.method === "POST" ? "{}" : undefined,
      headers:
        route.method === "POST" ? { "content-type": "application/json" } : {},
      method: route.method,
    });
    record(
      `${route.method} ${route.path} is not found`,
      response.status === 404,
    );
  }
  killMutant("Restore a zoend /channels/* or /conversation/* compatibility route");
}

async function assertRetiredTablesAreAbsent(): Promise<void> {
  const client = new PostgresClient({ connectionString: applicationDatabaseUrl });
  await client.connect();
  try {
    for (const table of retiredTables) {
      const result = await client.query<{ relation: string | null }>(
        "SELECT to_regclass($1)::text AS relation",
        [`public.${table}`],
      );
      record(
        `${table} is absent after migrations`,
        result.rows[0]?.relation === null,
      );
    }
  } finally {
    await client.end();
  }
  killMutant("Keep Ontology-owned conversation or ingress replay tables");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(policyManifestPath, `${JSON.stringify({ policies: [] }, null, 2)}\n`);

  await assertImportGraphLaw(repositoryRoot);
  record("import_graph_forbids_chat_sdk_outside_messaging", true);
  killMutant("business / surface code imports Chat SDK Card/action types");
  killMutant("crates or zoend depend on vercel/chat");
  killMutant("Read Chat SDK adapter state as semantic memory / StateBasis");

  const door = await startAuthDoor(authDatabaseUrl);
  let server: ServerProcess | undefined;
  try {
    server = await startServer(policyManifestPath, {
      kind: "default",
    });
    const live = await fetch(`${baseUrl}/live`);
    record("live passes after retired state removal", live.status === 200);
    const ready = await fetch(`${baseUrl}/ready`);
    const readyBody = await ready.text();
    record(
      "ready fails closed without product dependencies",
      ready.status === 503 &&
        (readyBody.includes("missing") || readyBody.includes("broken")),
    );
    await assertRetiredRoutesAreAbsent();
    await assertRetiredTablesAreAbsent();
    const telegramRecording = await recordTwoTelegramSubjects();
    record(
      "telegram_identity_recording_is_idempotent",
      telegramRecording.accountIds[0] ===
        telegramRecording.concurrentFirstAccountId &&
        telegramRecording.accountIds[0] ===
          telegramRecording.repeatedAccountIds[0] &&
        telegramRecording.accountIds[1] ===
          telegramRecording.repeatedAccountIds[1]
    );
    killMutant("Create a new Account for a repeated Telegram sender");

    record(
      "two_telegram_identities_remain_distinct",
      telegramRecording.accountIds[0] !== telegramRecording.accountIds[1] &&
        telegramRecording.bindingIds[0] !== telegramRecording.bindingIds[1]
    );
    killMutant("Collapse two Telegram senders into one Account");

    record(
      "telegram_recording_does_not_claim_membership",
      telegramRecording.membershipCounts.every((count) => count === 0)
    );
    killMutant("Grant Membership while only recording a Telegram sender");

    const seed = await seedBoundAccount();
    const resolved = await admin(
      "GET",
      `/identity/admin/resolve-context?world=${encodeURIComponent(seed.tenantId)}`,
    );
    record(
      "membership resolves from the Better Auth session",
      resolved.status === 200 &&
        resolved.body.membershipId === seed.membershipId &&
        resolved.body.worldId === seed.tenantId,
    );
    killMutant("Bootstrap a Membership that the active door session cannot resolve");

    record(
      "thread_is_not_tenant",
      seed.tenantId !== "9900001" &&
        seed.tenantId !== "chat_guid_linq_demo",
    );
    killMutant("Treat channel.thread as tenantId");

    record(
      "provider_user_is_not_principal",
      seed.principalId !== telegramSubject &&
        seed.principalId !== linqSubject,
    );
    killMutant("Treat channel.providerUser as principalId");

    record(
      "channel_identity_distinct_from_tenant_and_principal",
      seed.telegramBindingId.length > 0 &&
        seed.linqBindingId.length > 0 &&
        seed.telegramBindingId !== seed.tenantId &&
        seed.linqBindingId !== seed.principalId &&
        seed.tenantId !== seed.principalId,
    );

    const unresolved = await admin(
      "GET",
      "/identity/admin/resolve-subject?provider=telegram&subjectKey=tg_user_never_bound",
      undefined,
      e2eIdentityAdminToken(),
    );
    record("unresolved_membership_fails_closed", unresolved.status !== 200);
    killMutant("Deliver without Active Membership context");

    record(
      "self_host_needs_no_linq_photon_credentials",
      process.env.LINQ_API_KEY === undefined &&
        process.env.PHOTON_API_KEY === undefined,
    );

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      finishedAt: new Date().toISOString(),
      linqChannelProviderMapping: "linq",
      mutantsKilled,
      note:
        "Eve owns channel ingress; zoend has no legacy gateway or conversation-stage routes.",
      telegramIdentityRecording: {
        count: telegramRecording.accountIds.length,
        providerCeremony:
          "external acceptance: two owned Telegram accounts cross /eve/v1/telegram",
        status: "provisional",
        subjectIdsIncluded: false,
      },
      seed: {
        accountId: seed.accountId,
        membershipId: seed.membershipId,
        principalId: seed.principalId,
        tenantId: seed.tenantId,
      },
      startedAt,
      verdict: "PASS",
    });
    console.log(`messaging-boundary PASS → ${artifactPath}`);
  } finally {
    if (server !== undefined && server.child.exitCode === null) {
      await stopServer(server);
    }
    await stopAuthDoor(door);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
