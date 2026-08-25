import { readFile } from "node:fs/promises";
import { createIdentityDirectoryClient } from "../../interaction/src/index.js";
import {
  companionSessionIsReady,
  createHttpCompanionSession,
} from "./companion-session.js";
import {
  createFileReplyLedger,
  createMemoryReplyLedger,
  createWhatsAppContactLoop,
} from "./whatsapp-contact-loop.js";
import {
  formatWhatsAppMinuteText,
  parseWhatsAppMinuteSpec,
} from "./whatsapp-minute.js";
import { createWhatsAppMessagingIngress } from "./whatsapp-ingress.js";
import { parseWhatsAppDoorE164 } from "./adapters/whatsapp-live.js";

async function main(): Promise<void> {
  const doorE164 = parseWhatsAppDoorE164(process.env.ZOEN_WHATSAPP_DOOR_E164);
  const companionUrl = requiredEnv("ZOEN_WHATSAPP_COMPANION_URL");
  const identityBaseUrl = requiredEnv("ZOEN_IDENTITY_BASE_URL");
  const host = process.env.ZOEN_MESSAGING_INGRESS_HOST ?? "127.0.0.1";
  const port = Number(process.env.ZOEN_MESSAGING_INGRESS_PORT ?? "18082");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("ZOEN_MESSAGING_INGRESS_PORT must be a TCP port");
  }
  const ledgerPath = process.env.ZOEN_WHATSAPP_REPLY_LEDGER;
  const session = createHttpCompanionSession(companionUrl);
  await session.open();
  const ready = await session.ready();
  const minutePath = process.env.ZOEN_WHATSAPP_MINUTE_PATH?.trim();
  const loop = createWhatsAppContactLoop({
    boundReply:
      minutePath === undefined || minutePath.length === 0
        ? undefined
        : async () => ({
            text: formatWhatsAppMinuteText(
              parseWhatsAppMinuteSpec(await readFile(minutePath, "utf8")),
            ),
          }),
    doorE164,
    identity: createIdentityDirectoryClient({ baseUrl: identityBaseUrl }),
    ledger:
      ledgerPath === undefined || ledgerPath.trim().length === 0
        ? createMemoryReplyLedger()
        : createFileReplyLedger(ledgerPath.trim()),
    session,
  });

  const ingress = await createWhatsAppMessagingIngress({
    gateway: loop.gateway,
    host,
    port,
    processInbound: async (raw) => {
      const result = await loop.handleRaw(raw);
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
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
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
