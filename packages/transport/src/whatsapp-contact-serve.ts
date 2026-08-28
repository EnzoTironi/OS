import { Client } from "pg";
import { createInteractionExecuteWork } from "../../harness/src/interaction-execute-work.js";
import {
  createIdentityDirectoryClient,
  createPostgresTurnStore,
  type IdentityDirectory,
} from "../../speaker/src/index.js";
import {
  companionSessionIsReady,
  createHttpCompanionSession,
} from "./companion-session.js";
import {
  createPostgresReplyLedger,
  createWhatsAppContactLoop,
} from "./whatsapp-contact-loop.js";
import { createWhatsAppMessagingIngress } from "./whatsapp-ingress.js";
import { parseWhatsAppDoorE164 } from "./adapters/whatsapp-live.js";
import {
  createPostgresIngressReplayStore,
  readWhatsAppIngressSecret,
} from "./whatsapp-ingress-auth.js";

async function main(): Promise<void> {
  const doorE164 = parseWhatsAppDoorE164(process.env.ZOEN_WHATSAPP_DOOR_E164);
  const companionUrl = requiredEnv("ZOEN_WHATSAPP_COMPANION_URL");
  const identityBaseUrl = requiredEnv("ZOEN_IDENTITY_BASE_URL");
  const adminToken = requiredEnv("ZOEN_IDENTITY_ADMIN_TOKEN");
  const databaseUrl = requiredEnv("DATABASE_URL");
  const ingressSecret = readWhatsAppIngressSecret();
  if (ingressSecret === undefined) {
    throw new Error("ZOEN_WHATSAPP_INGRESS_SECRET required");
  }
  const host = process.env.ZOEN_MESSAGING_INGRESS_HOST ?? "127.0.0.1";
  const port = Number(process.env.ZOEN_MESSAGING_INGRESS_PORT ?? "18082");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("ZOEN_MESSAGING_INGRESS_PORT must be a TCP port");
  }
  const session = createHttpCompanionSession(companionUrl);
  await session.open();
  const ready = await session.ready();
  const tenantHint = process.env.ZOEN_WHATSAPP_TENANT_HINT?.trim();
  const liveWork = await createInteractionExecuteWork();
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  const store = createPostgresTurnStore({
    query: (text, values) => pg.query(text, values as unknown[] | undefined),
  });
  const loop = createWhatsAppContactLoop({
    doorE164,
    executeWork: liveWork?.executeWork,
    world: liveWork?.world,
    identity: withTenantHint(
      createIdentityDirectoryClient({
        adminToken,
        baseUrl: identityBaseUrl,
      }),
      tenantHint,
    ),
    publicWebOrigin: process.env.ZOEN_PUBLIC_ORIGIN,
    ledger: createPostgresReplyLedger({
      query: (text, values) => pg.query(text, values as unknown[] | undefined),
    }),
    session,
    store,
  });

  const ingress = await createWhatsAppMessagingIngress({
    gateway: loop.gateway,
    host,
    ingressSecret,
    port,
    replay: createPostgresIngressReplayStore({
      query: (text, values) => pg.query(text, values as unknown[] | undefined),
    }),
    processInbound: async (raw) => {
      const result = await loop.acknowledgeRaw(raw);
      process.stdout.write(`${JSON.stringify({ event: "inbound", result })}\n`);
      return result;
    },
    session,
  });
  process.stdout.write(
    `${JSON.stringify({
      companionReady: companionSessionIsReady(ready),
      doorE164,
      event: "listening",
      identityBaseUrl,
      url: ingress.url,
    })}\n`,
  );

  const shutdown = async () => {
    await ingress.close();
    await session.close();
    await pg.end();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

function withTenantHint(
  identity: IdentityDirectory,
  tenantHint: string | undefined,
): IdentityDirectory {
  if (tenantHint === undefined || tenantHint.length === 0) {
    return identity;
  }
  return {
    admitWhatsAppSubject: identity.admitWhatsAppSubject?.bind(identity),
    mintOnboardToken: identity.mintOnboardToken?.bind(identity),
    resolveChannelSubject(input) {
      return identity.resolveChannelSubject({ ...input, tenantHint });
    },
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} required`);
  }
  return value.trim();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
