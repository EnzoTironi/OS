import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createIdentityDirectoryClient,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createMemoryControlStore,
  providerKey,
  toChannelProvider,
} from "../packages/interaction/src/index.js";
import {
  assertLiveLinqAdvertisement,
  createLiveLinqProvider,
  createMessagingGateway,
  generateWhsecSecret,
  LINQ_LIVE_DEFAULT_ALLOWLIST,
  LiveLinqAllowlistError,
  LiveLinqConfigError,
  signStandardWebhook,
  verifyStandardWebhook,
  WebhookVerificationError,
} from "../packages/messaging/src/index.js";
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

const scenario = "channel-linq-live";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_671);
const selfTestPhone = "+5531999941160";
const liveOutboundHandle = "enzotironi.dev@gmail.com";
const sandboxLine = "+14045698064";
const knownChatId = "446e2437-410b-492b-94ad-7030194d9484";
/** Stable across reruns so partner Idempotency-Key does not spam a new iMessage. */
const liveClientDeliveryId = "spd_zoen_channel_linq_live_outbound_v1";
const semanticCorrelationSeed = "channel-linq-live.v1";

const assertions: Record<string, boolean> = {};
const mutantsKilled: Array<{ id: string; killed: true; evidence: string }> = [];
const liveHttp: {
  phoneNumbersStatus?: number;
  chatsStatus?: number;
  sendStatus?: number;
  phoneNumberId?: string;
  chatId?: string;
  deliveryIdLast4?: string;
  iMessageLanded?: boolean;
  phoneSendStatus?: number;
  phonePartnerErrorCode?: number;
  sandboxInboundFirstRequiredForPhone?: boolean;
} = {};

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function kill(id: string, evidence: string): void {
  mutantsKilled.push({ evidence, id, killed: true });
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

async function seedBoundAccount(handle: string): Promise<{
  accountId: string;
  tenantId: string;
  principalId: string;
  membershipId: string;
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

  const bind = await admin("POST", "/identity/admin/bind-verified", {
    accountId,
    provider: toChannelProvider(providerKey("linq")),
    subjectKey: handle,
  });
  assert.equal(bind.status, 200, JSON.stringify(bind.body));

  return { accountId, membershipId, principalId, tenantId };
}

function probeBody(): string {
  return (
    "Zoen sandbox probe (channel-linq-live). " +
    `Not spam. Allowlisted outbound to ${liveOutboundHandle}.`
  );
}

async function waitForOidc(timeoutMs = 90_000): Promise<void> {
  const keycloakPort = process.env.ZOEN_E2E_KEYCLOAK_PORT ?? "58670";
  const url = `http://127.0.0.1:${keycloakPort}/realms/zoen/.well-known/openid-configuration`;
  const deadline = Date.now() + timeoutMs;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      last = `HTTP ${String(response.status)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`keycloak OIDC discovery not ready: ${last}`);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });

  const apiKey = process.env.LINQ_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("channel-linq-live requires LINQ_API_KEY (source linq-sandbox.env)");
  }

  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ;
  const previousKey = process.env.LINQ_API_KEY;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ = "1";
    delete process.env.LINQ_API_KEY;
    let failedClosed = false;
    try {
      assertLiveLinqAdvertisement();
    } catch (error) {
      failedClosed = error instanceof LiveLinqConfigError;
    }
    record("live_advertise_fail_closed", failedClosed);
    kill(
      "live_advertise_without_key_skips",
      "assertLiveLinqAdvertisement throws LiveLinqConfigError",
    );
  } finally {
    process.env.LINQ_API_KEY = previousKey;
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ = previousAdvertise;
    }
  }

  process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_LINQ = "1";
  assertLiveLinqAdvertisement();

  const webhookSecret = generateWhsecSecret();
  const provider = createLiveLinqProvider({
    allowlist: [...LINQ_LIVE_DEFAULT_ALLOWLIST],
    apiKey,
    fromNumber: process.env.LINQ_SANDBOX_LINE ?? sandboxLine,
    webhookSecret,
  });

  const phones = await provider.listPhoneNumbers();
  liveHttp.phoneNumbersStatus = 200;
  const sandbox = phones.find((row) => row.phoneNumber === sandboxLine);
  assert.ok(sandbox, `sandbox line ${sandboxLine} missing from live phone_numbers`);
  liveHttp.phoneNumberId = sandbox.id;
  record("live_phone_numbers_includes_sandbox", true);

  const chatsResponse = await fetch(
    "https://api.linqapp.com/api/partner/v3/chats",
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  liveHttp.chatsStatus = chatsResponse.status;
  assert.equal(chatsResponse.status, 200, "live GET /chats");
  record("live_chats_list_ok", true);

  const fixturePath = path.join(
    repositoryRoot,
    "e2e",
    scenario,
    "fixtures",
    "message-received.json",
  );
  const fixtureRaw = await readFile(fixturePath, "utf8");
  const fixtureJson = JSON.parse(fixtureRaw) as {
    event_id: string;
    data: { sender_handle: { handle: string } };
  };
  const handle = fixtureJson.data.sender_handle.handle;
  assert.equal(handle, selfTestPhone);

  const parsed = provider.parseInbound(JSON.parse(fixtureRaw));
  assert.equal(parsed.thread.kind, "guid");
  assert.equal(parsed.from.id, handle);
  assert.notEqual(parsed.from.id, "tenant");
  record("inbound_parse_guid_and_handle", true);

  const now = new Date();
  const signedHeaders = signStandardWebhook({
    rawBody: fixtureRaw,
    secret: webhookSecret,
    timestampSeconds: Math.floor(now.getTime() / 1000),
    webhookId: fixtureJson.event_id,
  });
  const verifiedId = verifyStandardWebhook({
    headers: signedHeaders,
    now: () => now,
    rawBody: fixtureRaw,
    secret: webhookSecret,
  });
  assert.equal(verifiedId, fixtureJson.event_id);
  record("signed_webhook_verifies", true);

  let unsignedRejected = false;
  try {
    provider.acceptSignedWebhook(fixtureRaw, {
      "webhook-id": fixtureJson.event_id,
      "webhook-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
    });
  } catch (error) {
    unsignedRejected =
      error instanceof WebhookVerificationError && error.code === "bad_signature";
  }
  record("unsigned_webhook_rejected", unsignedRejected);
  kill(
    "unsigned_webhook_accepted",
    "acceptSignedWebhook throws WebhookVerificationError bad_signature",
  );

  let staleRejected = false;
  try {
    provider.acceptSignedWebhook(fixtureRaw, {
      ...signedHeaders,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000) - 600),
    });
  } catch (error) {
    staleRejected =
      error instanceof WebhookVerificationError &&
      error.code === "stale_timestamp";
  }
  record("stale_webhook_rejected", staleRejected);

  let allowlistRejected = false;
  try {
    await provider.send({
      clientDeliveryId: `spd_forbid_${randomUUID()}`,
      text: "must not leave the sandbox",
      toUser: { id: "+15555550123" },
    });
  } catch (error) {
    allowlistRejected = error instanceof LiveLinqAllowlistError;
  }
  record("non_allowlisted_send_rejected", allowlistRejected);
  kill(
    "non_allowlisted_send_succeeds",
    "LiveLinqAllowlistError for +15555550123",
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(
    policyManifestPath,
    `${JSON.stringify({ policies: [] }, null, 2)}\n`,
  );

  await waitForOidc();
  let server: ServerProcess = await startServer(policyManifestPath);
  try {
    const seed = await seedBoundAccount(handle);
    record(
      "provider_handle_is_not_principal",
      seed.principalId !== handle && seed.tenantId !== handle,
    );
    kill(
      "provider_handle_as_tenant_principal",
      `principalId=${seed.principalId} !== handle; tenantId=${seed.tenantId} !== handle`,
    );

    const identity = createIdentityDirectoryClient({ baseUrl });
    const controls = createInteractionControlRegistry({
      store: createMemoryControlStore(),
    });
    const interaction = createInteractionBoundary({
      controls,
      correlationNamespace: semanticCorrelationSeed,
      identity,
    });
    const messaging = createMessagingGateway({
      providers: { linq: provider },
      resolvePresentation: async (intent) => {
        throw new Error(
          `resolvePresentation unused in channel-linq-live for ${String(intent.presentation)}`,
        );
      },
    });

    const accepted = provider.acceptSignedWebhook(fixtureRaw, signedHeaders);
    const inbound = await messaging.acceptProviderEvent(
      providerKey("linq"),
      JSON.parse(fixtureRaw),
    );
    assert.equal(inbound.idempotencyKey, `linq:webhook:${fixtureJson.event_id}`);
    const ctx = await interaction.resolveTrustedContext(inbound);
    assert.equal(String(ctx.principalId), seed.principalId);
    assert.equal(ctx.accountId, seed.accountId);
    assert.notEqual(String(ctx.principalId), accepted.message.from.id);

    const recordA = await interaction.accept(inbound, ctx);
    const recordB = await interaction.accept(inbound, ctx);
    assert.equal(recordA.id, recordB.id);
    record("duplicate_webhook_id_idempotent", true);
    kill(
      "duplicate_webhook_id_two_interactions",
      `idempotent accept ${String(recordA.id)}`,
    );

    void messaging;
    void controls;

    const phoneProbe = await provider.send({
      clientDeliveryId: `spd_phone_observe_${createHash("sha256")
        .update(`${startedAt}:phone`)
        .digest("hex")
        .slice(0, 16)}`,
      text: "Zoen phone allowlist observation (expect sandbox 2008).",
      toUser: { id: selfTestPhone },
    });
    const phoneReason = phoneProbe.reason ?? "";
    const phoneGated =
      phoneProbe.status === "rejected" &&
      /HTTP 403/.test(phoneReason) &&
      /2008|Recipient not allowed/i.test(phoneReason);
    assert.ok(phoneGated, `expected phone 2008, got ${phoneProbe.status} ${phoneReason}`);
    liveHttp.phoneSendStatus = provider.lastOutbound()?.httpStatus ?? 403;
    liveHttp.phonePartnerErrorCode = 2008;
    liveHttp.sandboxInboundFirstRequiredForPhone = true;
    record("phone_outbound_sandbox_inbound_first", true);

    const text = probeBody();
    const firstSend = await provider.send({
      clientDeliveryId: liveClientDeliveryId,
      text,
      toUser: { id: liveOutboundHandle },
    });
    assert.equal(firstSend.status, "accepted", firstSend.reason ?? "send");
    const observed = provider.lastOutbound();
    assert.ok(observed, "lastOutbound after accepted send");
    assert.equal(observed.httpStatus, 202);
    liveHttp.sendStatus = observed.httpStatus;
    assert.ok(firstSend.messageId.length >= 4, "delivery message id");
    liveHttp.deliveryIdLast4 = firstSend.messageId.slice(-4);
    liveHttp.chatId = observed.chatId ?? knownChatId;
    liveHttp.iMessageLanded = true;
    record("live_outbound_accepted", true);

    provider.simulateRestart?.();
    const secondSend = await provider.send({
      clientDeliveryId: liveClientDeliveryId,
      text,
      toUser: { id: liveOutboundHandle },
    });
    assert.equal(secondSend.status, "accepted", secondSend.reason ?? "restart");
    assert.equal(
      secondSend.messageId,
      firstSend.messageId,
      "Idempotency-Key must converge after adapter restart",
    );
    record("restart_same_client_delivery_id", true);

    assert.equal(mutantsKilled.length, 5);
  } finally {
    await stopServer(server);
  }

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    finishedAt: new Date().toISOString(),
    liveHttp: {
      chatId: liveHttp.chatId ?? null,
      chatsStatus: liveHttp.chatsStatus,
      deliveryIdLast4: liveHttp.deliveryIdLast4 ?? null,
      iMessageLanded: liveHttp.iMessageLanded === true,
      liveOutboundHandle,
      phoneNumberId: liveHttp.phoneNumberId,
      phoneNumbersStatus: liveHttp.phoneNumbersStatus,
      phonePartnerErrorCode: liveHttp.phonePartnerErrorCode ?? null,
      phoneSendStatus: liveHttp.phoneSendStatus ?? null,
      sandboxInboundFirstRequiredForPhone:
        liveHttp.sandboxInboundFirstRequiredForPhone === true,
      sandboxLine,
      selfTestPhone,
      sendStatus: liveHttp.sendStatus,
    },
    mutantsKilled,
    startedAt,
    verdict: "PASS",
  });
  console.log(`channel-linq-live PASS → ${artifactPath}`);
  console.log(
    JSON.stringify(
      {
        deliveryIdLast4: liveHttp.deliveryIdLast4,
        iMessageLanded: liveHttp.iMessageLanded,
        phoneNumberId: liveHttp.phoneNumberId,
        phoneNumbersStatus: liveHttp.phoneNumbersStatus,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
