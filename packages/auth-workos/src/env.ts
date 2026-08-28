import { z } from "zod";

const envSchema = z.object({
  WORKOS_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().min(1),
  WORKOS_REDIRECT_URI: z.url(),
  WORKOS_COOKIE_PASSWORD: z.string().min(32),
});

export type AuthEnv = {
  readonly apiKey: string;
  readonly clientId: string;
  readonly cookiePassword: string;
  readonly redirectUri: string;
};

/**
 * Fail closed when any WorkOS AuthKit secret is missing or too short.
 */
export function readAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => String(issue.path[0] ?? "WORKOS"))
      .join(", ");
    throw new Error(`WorkOS auth env failed closed: ${fields}`);
  }
  return {
    apiKey: parsed.data.WORKOS_API_KEY,
    clientId: parsed.data.WORKOS_CLIENT_ID,
    cookiePassword: parsed.data.WORKOS_COOKIE_PASSWORD,
    redirectUri: parsed.data.WORKOS_REDIRECT_URI,
  };
}

/**
 * Callback route is the path of WORKOS_REDIRECT_URI. Do not hardcode it.
 */
export function callbackPath(redirectUri: string): string {
  return new URL(redirectUri).pathname;
}

/**
 * Private zoend origin for invite lookup. Never the public AuthKit door.
 */
export function identityBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.ZOEN_IDENTITY_BASE_URL?.trim();
  return raw === undefined || raw.length === 0
    ? undefined
    : raw.replace(/\/+$/, "");
}
