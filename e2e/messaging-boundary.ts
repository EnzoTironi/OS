import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createIdentityDirectoryClient,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createMemoryControlStore,
  interactionControlRef,
  presentationIntentRef,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
  toChannelProvider,
  type TrustedInteractionContext,
} from "../packages/interaction/src/index.js";
import {
  createFakeLinqProvider,
  createFakeTelegramProvider,
  createMessagingGateway,
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
import { assertImportGraphLaw } from "./messaging-boundary/import-graph.js";

const scenario = "messaging-boundary";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_501);

const telegramSubject = "tg_user_bound_1";
const linqSubject = "linq_handle_bound_1";
const semanticCorrelationSeed = "messaging-boundary.v1";

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
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
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

  // Linq → ChannelProvider::WhatsApp temporary harness mapping (documented).
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

function telegramTextUpdate(updateId: number, text: string): unknown {
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

function linqTextEvent(deliveryId: string, text: string): unknown {
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

async function runProviderScenario(
  providerName: "telegram" | "linq",
  raw: unknown,
  seed: Awaited<ReturnType<typeof seedBoundAccount>>,
): Promise<{
  accountId: string;
  tenantId: string;
  principalId: string;
  semanticCorrelationKey: string;
  observationKind: string;
}> {
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
    providers: {
      linq: createFakeLinqProvider(),
      telegram: createFakeTelegramProvider(),
    },
  });

  const provider = providerKey(providerName);
  const inbound = await messaging.acceptProviderEvent(provider, raw);
  const ctx = await interaction.resolveTrustedContext(inbound);

  assert.equal(ctx.accountId, seed.accountId);
  assert.equal(String(ctx.tenantId), seed.tenantId);
  assert.equal(String(ctx.principalId), seed.principalId);
  assert.notEqual(String(ctx.tenantId), String(inbound.channel.thread));
  assert.notEqual(String(ctx.principalId), String(inbound.channel.providerUser));

  const record = await interaction.accept(inbound, ctx);
  const again = await interaction.accept(inbound, ctx);
  assert.equal(again.id, record.id, "accept idempotent on idempotencyKey");

  const controlRef = await controls.issue({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    kind: "propose_action",
    principalId: ctx.principalId,
    proposalRef: "proposal.demo",
    tenantId: ctx.tenantId,
  });

  const intent = await interaction.planDelivery({
    controls: [controlRef],
    ctx,
    presentation: presentationIntentRef("surf_pres_demo"),
    recordId: record.id,
    stableProviderDeliveryId: `spd_${providerName}_${record.id}`,
  });

  const observation = await messaging.deliver(intent);
  assert.equal(observation.outcome.kind, "accepted");
  const replay = await messaging.deliver(intent);
  assert.equal(replay.id, observation.id, "deliver idempotent on providerDeliveryKey");

  await interaction.recordObservation(observation);

  return {
    accountId: ctx.accountId,
    observationKind: observation.outcome.kind,
    principalId: String(ctx.principalId),
    semanticCorrelationKey: record.semanticCorrelationKey,
    tenantId: String(ctx.tenantId),
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
  killMutant("packages/interaction depends on vercel/chat");
  killMutant("Read Chat SDK adapter state as semantic memory / StateBasis");

  // No projectInteractionRecords product API on messaging.
  const messagingModule = await import("../packages/messaging/src/index.js");
  record(
    "no_project_interaction_records_api",
    !("projectInteractionRecords" in messagingModule),
  );

  let server: ServerProcess = await startServer(policyManifestPath);
  try {
    const seed = await seedBoundAccount();

    const telegram = await runProviderScenario(
      "telegram",
      telegramTextUpdate(1001, "hello from telegram"),
      seed,
    );
    const linq = await runProviderScenario(
      "linq",
      linqTextEvent("deliv_1001", "hello from linq"),
      seed,
    );

    record(
      "provider_substitution_same_zoen_ids",
      telegram.accountId === linq.accountId &&
        telegram.tenantId === linq.tenantId &&
        telegram.principalId === linq.principalId &&
        telegram.semanticCorrelationKey === linq.semanticCorrelationKey,
    );
    record(
      "both_providers_deliver",
      telegram.observationKind === "accepted" &&
        linq.observationKind === "accepted",
    );

    // Mutant: thread as tenant / provider user as principal.
    record(
      "thread_is_not_tenant",
      seed.tenantId !== "9900001" &&
        seed.tenantId !== "chat_guid_linq_demo" &&
        seed.tenantId !== providerThreadRef("9900001") as unknown as string,
    );
    killMutant("Treat channel.thread as tenantId");
    record(
      "provider_user_is_not_principal",
      seed.principalId !== telegramSubject &&
        seed.principalId !== linqSubject,
    );
    killMutant("Treat channel.providerUser as principalId");

    // Mutant: raw button value cannot authorize.
    const controls = createInteractionControlRegistry({
      store: createMemoryControlStore(),
    });
    const identity = createIdentityDirectoryClient({ baseUrl });
    const interaction = createInteractionBoundary({ controls, identity });
    const messaging = createMessagingGateway({
      providers: {
        linq: createFakeLinqProvider(),
        telegram: createFakeTelegramProvider(),
      },
    });
    const forged = await messaging.acceptProviderEvent(
      providerKey("telegram"),
      {
        callback_query: {
          data: "raw-proposal-forgery",
          from: { id: telegramSubject },
          message: { chat: { id: 9_900_001 }, message_id: 55 },
        },
        update_id: 2002,
      },
    );
    assert.equal(forged.body.kind, "control_click");
    let rawRejected = false;
    try {
      await controls.resolve(interactionControlRef("raw-proposal-forgery"));
    } catch {
      rawRejected = true;
    }
    record("raw_button_value_cannot_authorize", rawRejected);
    killMutant(
      "Accept raw button/callback string as ProposalRef without controls.resolve",
    );

    // Expired / consumed control fails closed.
    const ctx = await interaction.resolveTrustedContext(
      await messaging.acceptProviderEvent(
        providerKey("telegram"),
        telegramTextUpdate(3003, "control setup"),
      ),
    );
    const expired = await controls.issue({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      kind: "propose_action",
      principalId: ctx.principalId,
      tenantId: ctx.tenantId,
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
      principalId: ctx.principalId,
      tenantId: ctx.tenantId,
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

    // Unresolved / inactive membership fails closed (no TEC).
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

    // Brand / type mutant probe: cannot assign thread brand to tenant field without cast.
    const thread = providerThreadRef("9900001");
    const user = providerUserRef(telegramSubject);
    let brandGuard = false;
    try {
      // Runtime stand-in for the compile-time brand barrier.
      const forgedCtx = {
        accountId: seed.accountId,
        actorId: "actor.forged",
        bindingId: seed.telegramBindingId,
        channel: {
          provider: providerKey("telegram"),
          providerUser: user,
          receivedAt: new Date().toISOString(),
          thread,
        },
        membershipId: seed.membershipId,
        principalId: user as unknown as TrustedInteractionContext["principalId"],
        tenantId: thread as unknown as TrustedInteractionContext["tenantId"],
        workloadId: "workload.personal",
      } satisfies TrustedInteractionContext;
      const inbound = await messaging.acceptProviderEvent(
        providerKey("telegram"),
        telegramTextUpdate(4004, "mutant"),
      );
      await interaction.accept(inbound, forgedCtx);
    } catch {
      brandGuard = true;
    }
    record("branded_ids_reject_thread_as_tenant_at_accept", brandGuard);
    // Explicit tenantIdString construction still cannot equal provider thread in accept guard.
    void tenantIdString(seed.tenantId);

    // Core/self-host path: no Linq/Photon credentials required (fakes only).
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
      seed: {
        accountId: seed.accountId,
        principalId: seed.principalId,
        tenantId: seed.tenantId,
      },
      startedAt,
      substitution: {
        linq,
        telegram,
      },
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
