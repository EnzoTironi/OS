import { z } from "zod";

const telegramUserIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/u, "Telegram user ID must be a positive decimal");

const identityRecordSchema = z.object({
  accountId: z.string().min(1),
  status: z.enum(["provisional", "verified", "merged_into"]),
});

export type TelegramIdentityRecord = z.infer<typeof identityRecordSchema>;

interface RecordTelegramIdentityInput {
  readonly environment?: NodeJS.ProcessEnv;
  readonly userId: string;
}

function requiredEnvironment(
  environment: NodeJS.ProcessEnv,
  name: "ZOEN_IDENTITY_ADMIN_TOKEN" | "ZOEN_ZOEND"
): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to record a Telegram identity`);
  }
  return value;
}

function provisionalEndpoint(environment: NodeJS.ProcessEnv): URL {
  const configured = requiredEnvironment(environment, "ZOEN_ZOEND").trim();
  if (!URL.canParse(configured)) {
    throw new Error("ZOEN_ZOEND must be a valid loopback URL");
  }
  const base = new URL(configured);
  const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);
  if (
    base.protocol !== "http:" ||
    !loopbackHosts.has(base.hostname) ||
    base.username.length > 0 ||
    base.password.length > 0
  ) {
    throw new Error("ZOEN_ZOEND must be an unauthenticated loopback HTTP URL");
  }
  return new URL("/identity/admin/provisional", base);
}

async function postProvisional(
  endpoint: URL,
  token: string,
  userId: string,
  retryConflict: boolean
): Promise<TelegramIdentityRecord> {
  const response = await fetch(endpoint, {
    body: JSON.stringify({ provider: "telegram", subjectKey: userId }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 409 && retryConflict) {
    await response.body?.cancel();
    return postProvisional(endpoint, token, userId, false);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Telegram identity recording failed (${String(response.status)})`
    );
  }
  const result = identityRecordSchema.safeParse(await response.json());
  if (!result.success) {
    throw new Error("Telegram identity recording returned an invalid response");
  }
  return result.data;
}

export function recordTelegramIdentity({
  environment = process.env,
  userId,
}: RecordTelegramIdentityInput): Promise<TelegramIdentityRecord> {
  const parsedUserId = telegramUserIdSchema.parse(userId);
  const endpoint = provisionalEndpoint(environment);
  const token = requiredEnvironment(environment, "ZOEN_IDENTITY_ADMIN_TOKEN");
  return postProvisional(endpoint, token, parsedUserId, true);
}
