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
 * Private zoend origin for invite lookup and confirm.
 * Never the public door (`zoen.tironi.xyz`) — that would recurse into HTML.
 */
export function identityBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  redirectUri?: string,
): string | undefined {
  return privateIdentityBase(env.ZOEN_IDENTITY_BASE_URL, redirectUri);
}

/** Local door only when the redirect host is localhost or 127.0.0.1. */
export function isLocalRedirect(redirectUri: string): boolean {
  try {
    const host = new URL(redirectUri).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Accept only a private http(s) origin. Reject empty, public host, or the
 * same origin as `WORKOS_REDIRECT_URI`.
 */
export function privateIdentityBase(
  raw: string | undefined,
  redirectUri?: string,
): string | undefined {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }
  try {
    const identity = new URL(trimmed);
    if (identity.protocol !== "http:" && identity.protocol !== "https:") {
      return undefined;
    }
    if (identity.hostname === "zoen.tironi.xyz") {
      return undefined;
    }
    if (redirectUri !== undefined) {
      const door = new URL(redirectUri);
      if (identity.origin === door.origin) {
        return undefined;
      }
    }
    return identity.origin;
  } catch {
    return undefined;
  }
}
