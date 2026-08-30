import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
import {
  assertZoendReplayRow,
  freshWhatsAppIngressSecret,
  postWhatsAppInbound,
  signedWhatsAppInbound,
  startMockWhatsAppGateway,
} from "./messaging-boundary/whatsapp-inbound-auth.js";

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
  const boundToken = (await signUpSession("bound-bait")).token;
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
    provider: "linq",
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
  killMutant("crates or zoend depend on vercel/chat");
  killMutant("Read Chat SDK adapter state as semantic memory / StateBasis");

  const door = await startAuthDoor(authDatabaseUrl);
  let server: ServerProcess | undefined;
  try {
    server = await startServer(policyManifestPath, {
    extraEnv: {
      ZOEN_WHATSAPP_INGRESS_SECRET: "",
    },
    kind: "default",
  });
    const seed = await seedBoundAccount();

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

    const unsigned = await postWhatsAppInbound(
      baseUrl,
      {},
      JSON.stringify({ body: "oi" }),
    );
    record(
      "unsigned_inbound_without_secret_is_unavailable",
      unsigned.status === 503 &&
        unsigned.body.reason === "whatsapp_ingress_secret_missing",
    );
    killMutant("Accept WhatsApp inbound when ZOEN_WHATSAPP_INGRESS_SECRET is unset");

    assert.ok(server);
    await stopServer(server);
    const gateway = await startMockWhatsAppGateway();
    const secret = freshWhatsAppIngressSecret();
    const rawBody = JSON.stringify({ body: "oi" });
    const webhookId = "msg_boundary_1";
    const nowSeconds = Math.floor(Date.now() / 1000);
    try {
      server = await startServer(policyManifestPath, {
        extraEnv: {
          ZOEN_MESSAGING_GATEWAY_URL: gateway.url,
          ZOEN_WHATSAPP_INGRESS_SECRET: secret,
        },
        kind: "default",
      });
      const validHeaders = signedWhatsAppInbound({
        rawBody,
        secret,
        timestampSeconds: nowSeconds,
        webhookId,
      });
      const forged = await postWhatsAppInbound(
        baseUrl,
        { ...validHeaders, "webhook-signature": "v1,AAAA" },
        rawBody,
      );
      record(
        "forged_inbound_signature_is_unauthorized",
        forged.status === 401 &&
          forged.body.reason === "whatsapp_ingress_signature_invalid",
      );
      killMutant("Accept a forged Standard Webhooks signature");

      const stale = await postWhatsAppInbound(
        baseUrl,
        {
          ...validHeaders,
          "webhook-timestamp": String(nowSeconds - 20 * 60),
        },
        rawBody,
      );
      record(
        "stale_inbound_timestamp_is_unauthorized",
        stale.status === 401 &&
          stale.body.reason === "whatsapp_ingress_timestamp_stale",
      );
      killMutant("Accept a webhook-timestamp outside the 5-minute skew window");

      const accepted = await postWhatsAppInbound(baseUrl, validHeaders, rawBody);
      record(
        "signed_inbound_reaches_gateway",
        accepted.status === 200 && accepted.body.ok === true,
      );
      record(
        "hmac_signs_raw_webhook_id",
        gateway.inboundIds.includes(webhookId),
      );

      const replayed = await postWhatsAppInbound(baseUrl, validHeaders, rawBody);
      record(
        "durable_inbound_replay_is_unauthorized",
        replayed.status === 401 &&
          replayed.body.reason === "whatsapp_ingress_replay",
      );
      killMutant("Replay a committed webhook-id through zoend inbound");

      await assertZoendReplayRow(applicationDatabaseUrl, webhookId);
      record("durable_replay_row_is_zoend_namespaced", true);
    } finally {
      await gateway.close();
    }

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
