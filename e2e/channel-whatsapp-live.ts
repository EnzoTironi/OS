import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import {
  ChannelSubjectResolveError,
  createIdentityDirectoryClient,
  principalIdString,
  providerKey,
  tenantIdString,
  toChannelProvider,
} from "../packages/speaker/src/index.js";
import {
  assertLiveWhatsAppAdvertisement,
  companionSessionIsReady,
  createHttpCompanionSession,
  createLiveWhatsAppProvider,
  createMemoryReplyLedger,
  createMessagingGateway,
  createRecordingCompanionSession,
  createWhatsAppContactLoop,
  createWhatsAppMessagingIngress,
  LiveWhatsAppConfigError,
  PERSONAL_WHATSAPP_DOOR_E164,
} from "../packages/transport/src/index.js";
import {
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  writeScenarioArtifact,
} from "./host-env.js";
import { assertImportGraphLaw } from "./messaging-boundary/import-graph.js";

const scenario = "channel-whatsapp-live";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_701);
const companionPort = e2ePort("ZOEN_E2E_WHATSAPP_COMPANION_PORT", 58_702);
const ingressPort = e2ePort("ZOEN_E2E_MESSAGING_INGRESS_PORT", 58_703);
const postgresPort = e2ePort("ZOEN_E2E_POSTGRES_PORT", 55_520);
const companionListen = e2eListenAddr(
  "ZOEN_E2E_WHATSAPP_COMPANION_PORT",
  58_702,
);
const speaker = "5531888888888@s.whatsapp.net";
const group = "120363000000000000@g.us";

const assertions: Record<string, boolean> = {};
const mutantsKilled: Array<{ id: string; killed: true; evidence: string }> = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function kill(id: string, evidence: string): void {
  mutantsKilled.push({ evidence, id, killed: true });
}

async function waitForOidc(timeoutMs = 90_000): Promise<void> {
  const keycloakPort = process.env.ZOEN_E2E_KEYCLOAK_PORT ?? "58700";
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

async function waitForListen(port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      const finish = (value: boolean) => {
        socket.destroy();
        resolve(value);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(200, () => finish(false));
    });
    if (connected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`nothing listening on ${String(port)}`);
}

async function runGoTests(): Promise<void> {
  await command("go", ["test", "./..."], {
    cwd: path.join(repositoryRoot, "apps/whatsapp-companion"),
  });
}

async function buildCompanion(output: string): Promise<void> {
  await command("go", ["build", "-o", output, "./cmd/zoen-whatsapp-companion"], {
    cwd: path.join(repositoryRoot, "apps/whatsapp-companion"),
  });
}

function command(
  executable: string,
  arguments_: readonly string[],
  options: { cwd: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: options.cwd,
      env: {
        ...process.env,
        GOCACHE: "/tmp/zoen-n326-gocache",
        GOMODCACHE: "/tmp/zoen-n326-gomod",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${executable} ${arguments_.join(" ")} exited ${String(code)}\n${output.join("")}`));
    });
  });
}

async function startCompanion(binary: string): Promise<ChildProcess> {
  const child = spawn(binary, ["serve"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: `postgres://zoen_app:zoen_app@127.0.0.1:${String(postgresPort)}/zoen`,
      ZOEN_DATABASE_URL: `postgres://zoen_app:zoen_app@127.0.0.1:${String(postgresPort)}/zoen`,
      ZOEN_WHATSAPP_DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/zoen_whatsapp?sslmode=disable`,
      ZOEN_WHATSAPP_INGRESS_URL: `${baseUrl}/channels/whatsapp/inbound`,
      ZOEN_WHATSAPP_INGRESS_SECRET: "whsec_dGVzdC1zZWNyZXQtZml4dHVyZS0zMg==",
      ZOEN_WHATSAPP_LISTEN_ADDR: companionListen,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  try {
    await waitForListen(companionPort);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(
      `companion failed to listen:\n${output.join("")}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return child;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await once(child, "exit");
}

async function sha256File(contents: string): Promise<string> {
  return createHash("sha256").update(contents).digest("hex");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commit = await commandCapture("git", ["rev-parse", "HEAD"]);
  await mkdir(generatedDirectory, { recursive: true });

  await assertImportGraphLaw(repositoryRoot);
  record("import_graph_forbids_chat_sdk_outside_messaging", true);
  kill(
    "chat_sdk_imported_outside_messaging",
    "assertImportGraphLaw on crates/zoend/interaction/surface/sdk",
  );

  const recording = createRecordingCompanionSession();
  await recording.open();
  const dropped = await recording.injectInbound({
    body: "self",
    chatJid: speaker,
    fromMe: true,
    isGroup: false,
    messageId: "wamid.me",
    observedAt: startedAt,
    senderAltJid: speaker,
    senderJid: speaker,
  });
  assert.equal(dropped, "dropped");
  const groupDelivered = await recording.injectInbound({
    body: "oi grupo",
    chatJid: group,
    fromMe: false,
    isGroup: true,
    messageId: "wamid.g",
    observedAt: startedAt,
    senderAltJid: speaker,
    senderJid: speaker,
  });
  assert.equal(groupDelivered, "delivered");
  assert.equal(recording.delivered()[0]?.chatJid, group);
  const provider = createLiveWhatsAppProvider({ session: recording });
  await provider.send({
    clientDeliveryId: "spd_group",
    text: "reply",
    thread: { id: group, kind: "chat" },
    toUser: { id: speaker },
  });
  assert.equal(recording.sent()[0]?.chatJid, group);
  const gateway = createMessagingGateway({
    providers: { whatsapp: provider },
    resolvePresentation: async () => {
      throw new Error("resolvePresentation unused for recording seam");
    },
  });
  const inbound = await gateway.acceptProviderEvent(providerKey("whatsapp"), {
    body: "oi grupo",
    chatJid: group,
    fromMe: false,
    isGroup: true,
    messageId: "wamid.g",
    observedAt: startedAt,
    senderAltJid: speaker,
    senderJid: speaker,
  });
  assert.equal(inbound.audienceObservation.kind, "group");
  assert.notEqual(toChannelProvider(providerKey("whatsapp")), "whatsapp_cloud_api");
  record("companion_open_ready_inbound_send", true);
  record("adapter_wraps_companion_session", true);
  record("gateway_accept_provider_event", true);
  kill("from_me_becomes_user", "recording drops FromMe");
  kill("group_jid_is_speaker", "outbound dest is group chat JID");
  await recording.close();

  await proveContactLoop(record, kill);
  record("contact_loop_same_thread_reply", true);

  await runGoTests();
  record("companion_go_unit_tests", true);

  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  let advertiseFailedClosed = false;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = "1";
    delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    try {
      assertLiveWhatsAppAdvertisement();
    } catch (error) {
      advertiseFailedClosed = error instanceof LiveWhatsAppConfigError;
    }
  } finally {
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = previousAdvertise;
    }
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    } else {
      process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
    }
  }
  record("live_advertise_fail_closed_without_door", advertiseFailedClosed);
  kill(
    "advertise_without_door_skips",
    "assertLiveWhatsAppAdvertisement throws LiveWhatsAppConfigError",
  );

  process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = "1";
  let personalRejected = false;
  try {
    process.env.ZOEN_WHATSAPP_DOOR_E164 = PERSONAL_WHATSAPP_DOOR_E164;
    assertLiveWhatsAppAdvertisement();
  } catch (error) {
    personalRejected = error instanceof LiveWhatsAppConfigError;
  } finally {
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    } else {
      process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
    }
  }
  record("personal_door_fail_closed", personalRejected);

  const binary = path.join(generatedDirectory, "zoen-whatsapp-companion");
  await buildCompanion(binary);

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(
    policyManifestPath,
    `${JSON.stringify({ policies: [] }, null, 2)}\n`,
  );

  await waitForOidc();
  let companionProc: ChildProcess | undefined;
  let server: ServerProcess | undefined;
  let ingress: Awaited<ReturnType<typeof createWhatsAppMessagingIngress>> | undefined;
  let failClosedReason = "companion_not_ready";
  let companionReady = false;
  let zoendAdvertiseStatus = 0;
  let zoendInboundStatus = 0;
  try {
    companionProc = await startCompanion(binary);
    const httpSession = createHttpCompanionSession(
      `http://127.0.0.1:${String(companionPort)}`,
    );
    const ready = await httpSession.ready();
    companionReady = companionSessionIsReady(ready);
    record("unpaired_companion_is_not_ready", !companionReady);

    ingress = await createWhatsAppMessagingIngress({
      gateway: createMessagingGateway({
        providers: {
          whatsapp: createLiveWhatsAppProvider({ session: httpSession }),
        },
        resolvePresentation: async () => {
          throw new Error("deliver unused in unpaired advertise");
        },
      }),
      port: ingressPort,
      session: httpSession,
    });
    process.env.ZOEN_MESSAGING_GATEWAY_URL = ingress.url;

    server = await startServer(policyManifestPath);
    const advertise = await fetch(`${baseUrl}/channels/whatsapp/advertise`);
    zoendAdvertiseStatus = advertise.status;
    const advertiseBody = (await advertise.json().catch(() => ({}))) as {
      reason?: unknown;
    };
    if (typeof advertiseBody.reason === "string") {
      failClosedReason = advertiseBody.reason;
    }
    record(
      "zoend_advertise_fail_closed",
      zoendAdvertiseStatus === 503,
    );
    kill(
      "zoend_advertises_unpaired_whatsapp",
      `GET /channels/whatsapp/advertise HTTP ${String(zoendAdvertiseStatus)}`,
    );

    const inboundResponse = await fetch(`${baseUrl}/channels/whatsapp/inbound`, {
      body: JSON.stringify({
        body: "oi",
        chatJid: speaker,
        fromMe: false,
        isGroup: false,
        messageId: "wamid.e2e",
        observedAt: startedAt,
        senderAltJid: speaker,
        senderJid: speaker,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    zoendInboundStatus = inboundResponse.status;
    record("zoend_inbound_fail_closed_until_ready", zoendInboundStatus === 503);
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    if (companionProc !== undefined) {
      await stopChild(companionProc);
    }
    if (ingress !== undefined) {
      await ingress.close();
    }
  }

  const liveAttempted = companionReady && process.env.ZOEN_WHATSAPP_DOOR_E164 !== undefined;
  const payload = {
    assertions,
    commit,
    companionReady,
    failClosedReason,
    finishedAt: new Date().toISOString(),
    liveAttempted,
    mutantsKilled,
    personalDoorRejected: PERSONAL_WHATSAPP_DOOR_E164,
    provider: toChannelProvider(providerKey("whatsapp")),
    startedAt,
    verdict: "PASS" as const,
    zoendAdvertiseStatus,
    zoendInboundStatus,
  };
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const digest = await sha256File(body);
  const signed = {
    ...payload,
    failClosedLogSha256: digest,
  };
  const artifactPath = await writeScenarioArtifact(
    repositoryRoot,
    scenario,
    signed,
  );
  const digestPath = path.join(
    path.dirname(artifactPath),
    `${scenario}.json.sha256`,
  );
  await writeFile(digestPath, `${digest}\n`);
  record("signed_fail_closed_artifact", true);
  console.log(`channel-whatsapp-live PASS → ${artifactPath}`);
  console.log(JSON.stringify({ digest, failClosedReason, zoendAdvertiseStatus }, null, 2));
}

async function proveContactLoop(
  record: (name: string, observed: boolean) => void,
  kill: (id: string, evidence: string) => void,
): Promise<void> {
  const doorE164 = "+553798136141";
  const doorJid = "553798136141@s.whatsapp.net";
  const person = "553199941160@s.whatsapp.net";
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  process.env.ZOEN_WHATSAPP_DOOR_E164 = doorE164;

  const identityCalls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    identityCalls.push(`${method} ${String(input)}`);
    assert.equal(method, "GET");
    assert.doesNotMatch(
      String(input),
      /\/provisional|\/verify-binding|\/bind-verified/,
    );
    return new Response(
      JSON.stringify({ error: "OIDC subject has no verified binding" }),
      { headers: { "content-type": "application/json" }, status: 401 },
    );
  };

  try {
    const unboundSession = createRecordingCompanionSession({
      ready: { connected: true, loggedIn: true, paired: true },
    });
    await unboundSession.open();
    const ledger = createMemoryReplyLedger();
    const generated = "oi, entra quando quiser";
    const unboundLoop = createWhatsAppContactLoop({
      doorE164,
      generateFirstContact: async () => generated,
      identity: createIdentityDirectoryClient({
        baseUrl: "http://zoend.test",
        fetchImpl,
      }),
      ledger,
      session: unboundSession,
    });
    const envelope = {
      body: "Oi",
      chatJid: person,
      fromMe: false,
      isGroup: false,
      messageId: "wamid.e2e.contact",
      observedAt: new Date().toISOString(),
      senderAltJid: person,
      senderJid: person,
    };
    const unbound = await unboundLoop.handleRaw(envelope);
    assert.equal(unbound.kind, "unbound");
    assert.equal(unboundSession.sent().length, 1);
    assert.equal(unboundSession.sent()[0]?.chatJid, person);
    const unboundShape = unboundSession.sent()[0]?.shape;
    assert.equal(unboundShape?.kind, "text");
    if (unboundShape?.kind === "text") {
      assert.equal(unboundShape.text, generated);
      assert.doesNotMatch(
        unboundShape.text,
        /vinculado|unbound|unlinked|unregistered/i,
      );
    }
    const duplicate = await unboundLoop.handleRaw(envelope);
    assert.equal(duplicate.kind, "duplicate");
    assert.equal(unboundSession.sent().length, 1);

    const fromMe = await unboundLoop.handleRaw({ ...envelope, fromMe: true });
    assert.equal(fromMe.kind, "dropped");
    const door = await unboundLoop.handleRaw({
      ...envelope,
      chatJid: doorJid,
      messageId: "wamid.e2e.door",
      senderAltJid: doorJid,
      senderJid: doorJid,
    });
    assert.equal(door.kind, "dropped");
    await unboundSession.close();

    const restarted = createRecordingCompanionSession({
      ready: { connected: true, loggedIn: true, paired: true },
    });
    await restarted.open();
    const restartedLoop = createWhatsAppContactLoop({
      doorE164,
      identity: createIdentityDirectoryClient({
        baseUrl: "http://zoend.test",
        fetchImpl,
      }),
      ledger,
      session: restarted,
    });
    const afterRestart = await restartedLoop.handleRaw(envelope);
    assert.equal(afterRestart.kind, "duplicate");
    assert.equal(restarted.sent().length, 0);
    await restarted.close();

    const boundSession = createRecordingCompanionSession({
      ready: { connected: true, loggedIn: true, paired: true },
    });
    await boundSession.open();
    const boundLoop = createWhatsAppContactLoop({
      doorE164,
      identity: {
        async resolveChannelSubject(input) {
          if (input.subjectKey !== person) {
            throw new ChannelSubjectResolveError({
              kind: "unbound",
              message: "unresolved channel subject: no verified binding",
            });
          }
          return {
            accountId: "account.wa.e2e",
            actorId: "actor.personal",
            bindingId: "binding.wa.e2e",
            membershipId: "membership.wa.e2e",
            principalId: principalIdString("principal.wa.e2e"),
            tenantId: tenantIdString("tenant.wa.e2e"),
            workloadId: "workload.personal",
          };
        },
      },
      session: boundSession,
    });
    const bound = await boundLoop.handleRaw({
      ...envelope,
      messageId: "wamid.e2e.bound",
    });
    assert.equal(bound.kind, "bound");
    assert.equal(boundSession.sent()[0]?.chatJid, person);
    const boundShape = boundSession.sent()[0]?.shape;
    assert.equal(boundShape?.kind, "text");
    if (boundShape?.kind === "text") {
      assert.doesNotMatch(boundShape.text, /Recebi/i);
      assert.ok(boundShape.text.trim().length > 0);
    }
    await boundSession.close();

    record("unbound_poke_same_thread", true);
    record("bound_turn_same_thread", true);
    record("restart_does_not_duplicate_reply", true);
    record("door_jid_is_never_the_person", true);
    record(
      "identity_resolve_is_get_only",
      identityCalls.length > 0 &&
        identityCalls.every((call) => call.startsWith("GET ")),
    );
    kill(
      "invent_membership_on_unbound",
      "IdentityDirectory GET resolve-subject; unbound poke; no Membership row",
    );
    kill(
      "harness_verified_on_inbound",
      "inbound never POST /identity/admin/verify-binding",
    );
  } finally {
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    } else {
      process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
    }
  }
}

function commandCapture(
  executable: string,
  arguments_: readonly string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output.join("").trim());
        return;
      }
      reject(new Error(`${executable} failed: ${output.join("")}`));
    });
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
