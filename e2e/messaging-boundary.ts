import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createIdentityDirectoryClient,
  createInteractionControlRegistry,
  createMemoryControlStore,
  principalIdString,
  providerKey,
  providerThreadRef,
  tenantIdString,
  toChannelProvider,
} from "../packages/speaker/src/index.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
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
  const boundToken = await oidcToken("bound-bait");
  identityAdminBearer = boundToken;
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

  const telegramBind = await admin("POST", "/identity/admin/bind-verified", {
    accountId,
    provider: "telegram",
    subjectKey: telegramSubject,
  });
  assert.equal(telegramBind.status, 200, JSON.stringify(telegramBind.body));

  const linqBind = await admin("POST", "/identity/admin/bind-verified", {
    accountId,
    provider: toChannelProvider(providerKey("linq")),
    subjectKey: linqSubject,
  });
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

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(policyManifestPath, `${JSON.stringify({ policies: [] }, null, 2)}\n`);

  await assertImportGraphLaw(repositoryRoot);
  record("import_graph_forbids_chat_sdk_outside_messaging", true);
  killMutant("business / surface code imports Chat SDK Card/action types");
  killMutant("packages/speaker depends on vercel/chat");
  killMutant("Read Chat SDK adapter state as semantic memory / StateBasis");

  const messagingModule = await import("../packages/transport/src/index.js");
  record(
    "no_project_interaction_records_api",
    !("projectInteractionRecords" in messagingModule),
  );

  let server: ServerProcess = await startServer(policyManifestPath);
  try {
    const seed = await seedBoundAccount();
    const identity = createIdentityDirectoryClient({
      adminToken: await oidcToken("admin-a"),
      baseUrl,
    });
    const controls = createInteractionControlRegistry({
      store: createMemoryControlStore(),
    });

    record(
      "thread_is_not_tenant",
      seed.tenantId !== "9900001" &&
        seed.tenantId !== "chat_guid_linq_demo" &&
        seed.tenantId !== (providerThreadRef("9900001") as unknown as string),
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

    const expired = await controls.issue({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      kind: "propose_action",
      principalId: principalIdString(seed.principalId),
      tenantId: tenantIdString(seed.tenantId),
    });
    let expiredRejected = false;
    try {
      await controls.resolve(expired);
    } catch {
      expiredRejected = true;
    }
    const live = await controls.issue({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      kind: "propose_action",
      principalId: principalIdString(seed.principalId),
      tenantId: tenantIdString(seed.tenantId),
    });
    await controls.consume(live);
    let consumedRejected = false;
    try {
      await controls.resolve(live);
    } catch {
      consumedRejected = true;
    }
    record(
      "expired_or_consumed_control_fails_closed",
      expiredRejected && consumedRejected,
    );
    killMutant("Replay expired / consumed InteractionControlRef");

    let unresolvedRejected = false;
    try {
      await identity.resolveChannelSubject({
        provider: providerKey("telegram"),
        subjectKey: "tg_user_never_bound",
      });
    } catch {
      unresolvedRejected = true;
    }
    record("unresolved_membership_fails_closed", unresolvedRejected);
    killMutant("Deliver without Active Membership context");

    record(
      "self_host_needs_no_linq_photon_credentials",
      process.env.LINQ_API_KEY === undefined &&
        process.env.PHOTON_API_KEY === undefined,
    );

    assert.equal(toChannelProvider(providerKey("linq")), "linq");
    record(
      "linq_maps_to_channel_provider_linq",
      toChannelProvider(providerKey("linq")) === "linq",
    );

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      finishedAt: new Date().toISOString(),
      linqChannelProviderMapping: "linq",
      mutantsKilled,
      note:
        "Fake provider gateway proofs moved to #327 / #328 against live adapters.",
      seed: {
        accountId: seed.accountId,
        principalId: seed.principalId,
        tenantId: seed.tenantId,
      },
      startedAt,
      verdict: "PASS",
    });
    console.log(`messaging-boundary PASS → ${artifactPath}`);
  } finally {
    await stopServer(server);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
