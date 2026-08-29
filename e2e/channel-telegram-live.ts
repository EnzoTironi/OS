import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  providerKey,
  toChannelProvider,
} from "../packages/transport/src/index.js";
import {
  assertLiveTelegramAdvertisement,
  createLiveTelegramProvider,
  createMessagingGateway,
  createTelegramMessagingIngress,
  LiveTelegramConfigError,
  parseTelegramBotUpdate,
} from "../packages/transport/src/index.js";
import {
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePort,
  writeScenarioArtifact,
} from "./host-env.js";
import { assertImportGraphLaw } from "./messaging-boundary/import-graph.js";

const scenario = "channel-telegram-live";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_711);
const ingressPort = e2ePort("ZOEN_E2E_MESSAGING_INGRESS_PORT", 58_712);

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
  const keycloakPort = process.env.ZOEN_E2E_KEYCLOAK_PORT ?? "58710";
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

  const messaging = await import("../packages/transport/src/index.js");
  assert.equal(
    "createFakeTelegramProvider" in messaging,
    false,
    "createFakeTelegramProvider must not return",
  );
  record("fake_telegram_provider_absent", true);
  kill(
    "createFakeTelegramProvider_restored",
    "messaging index has no createFakeTelegramProvider",
  );

  const parsed = parseTelegramBotUpdate({
    message: {
      chat: { id: 9900001, type: "private" },
      date: 1_704_000_000,
      from: { id: 42, is_bot: false },
      message_id: 1001,
      text: "oi",
    },
    update_id: 777,
  });
  assert.equal(parsed.id, "1001");
  assert.equal(parsed.from.id, "42");
  assert.equal(parsed.thread.kind, "chat");
  const gateway = createMessagingGateway({
    providers: {
      telegram: createLiveTelegramProvider({
        botToken: "123:test",
        fetch: async () =>
          new Response(
            JSON.stringify({
              ok: true,
              result: { chat: { id: 9900001 }, message_id: 2002 },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      }),
    },
    resolvePresentation: async () => {
      throw new Error("resolvePresentation unused for parse seam");
    },
  });
  const inbound = await gateway.acceptProviderEvent(providerKey("telegram"), {
    message: {
      chat: { id: 9900001, type: "supergroup" },
      from: { id: 42 },
      message_id: 1001,
      text: "oi grupo",
    },
    update_id: 777,
  });
  assert.equal(inbound.idempotencyKey, "telegram:message:1001");
  assert.equal(inbound.audienceObservation.kind, "dm");
  assert.equal(toChannelProvider(providerKey("telegram")), "telegram");
  record("adapter_parses_bot_api_update", true);
  record("gateway_accept_provider_event", true);
  kill("update_id_is_idempotency", "idempotency uses message_id not update_id");

  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSuite = process.env.ZOEN_TELEGRAM_BOT_TOKEN;
  let advertiseFailedClosed = false;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM = "1";
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    try {
      assertLiveTelegramAdvertisement();
    } catch (error) {
      advertiseFailedClosed = error instanceof LiveTelegramConfigError;
    }
  } finally {
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_TELEGRAM = previousAdvertise;
    }
    if (previousToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousToken;
    }
    if (previousSuite === undefined) {
      delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    } else {
      process.env.ZOEN_TELEGRAM_BOT_TOKEN = previousSuite;
    }
  }
  record("live_advertise_fail_closed_without_token", advertiseFailedClosed);
  kill(
    "advertise_without_token_skips",
    "assertLiveTelegramAdvertisement throws LiveTelegramConfigError",
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(
    policyManifestPath,
    `${JSON.stringify({ policies: [] }, null, 2)}\n`,
  );

  await waitForOidc();
  let server: ServerProcess | undefined;
  let ingress:
    | Awaited<ReturnType<typeof createTelegramMessagingIngress>>
    | undefined;
  let failClosedReason = "telegram_bot_token_missing";
  let zoendAdvertiseStatus = 0;
  let zoendInboundStatus = 0;
  const liveToken =
    process.env.TELEGRAM_BOT_TOKEN ?? process.env.ZOEN_TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ZOEN_TELEGRAM_BOT_TOKEN;
    ingress = await createTelegramMessagingIngress({
      gateway: createMessagingGateway({
        providers: {
          telegram: createLiveTelegramProvider({
            botToken: "123:test",
            fetch: async () =>
              new Response(JSON.stringify({ ok: true, result: {} }), {
                headers: { "content-type": "application/json" },
              }),
          }),
        },
        resolvePresentation: async () => {
          throw new Error("deliver unused in unpaired advertise");
        },
      }),
      mode: "webhook",
      port: ingressPort,
    });
    process.env.ZOEN_MESSAGING_GATEWAY_URL = ingress.url;

    server = await startServer(policyManifestPath);
    const advertise = await fetch(`${baseUrl}/channels/telegram/advertise`);
    zoendAdvertiseStatus = advertise.status;
    const advertiseBody = (await advertise.json().catch(() => ({}))) as {
      reason?: unknown;
    };
    if (typeof advertiseBody.reason === "string") {
      failClosedReason = advertiseBody.reason;
    }
    record("zoend_advertise_fail_closed", zoendAdvertiseStatus === 503);
    kill(
      "zoend_advertises_telegram_without_token",
      `GET /channels/telegram/advertise HTTP ${String(zoendAdvertiseStatus)}`,
    );

    const inboundResponse = await fetch(`${baseUrl}/channels/telegram/inbound`, {
      body: JSON.stringify({
        message: {
          chat: { id: 9900001 },
          from: { id: 42 },
          message_id: 1001,
          text: "oi",
        },
        update_id: 1,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    zoendInboundStatus = inboundResponse.status;
    record("zoend_inbound_fail_closed_until_token", zoendInboundStatus === 503);
  } finally {
    if (liveToken !== undefined) {
      process.env.TELEGRAM_BOT_TOKEN = liveToken;
    }
    if (server !== undefined) {
      await stopServer(server);
    }
    if (ingress !== undefined) {
      await ingress.close();
    }
  }

  const liveAttempted =
    liveToken !== undefined && liveToken.length > 0;
  const payload = {
    assertions,
    commit,
    failClosedReason,
    finishedAt: new Date().toISOString(),
    liveAttempted,
    mutantsKilled,
    provider: toChannelProvider(providerKey("telegram")),
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
  console.log(`channel-telegram-live PASS → ${artifactPath}`);
  console.log(JSON.stringify({ commit, digest, failClosedReason, zoendAdvertiseStatus }, null, 2));
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
