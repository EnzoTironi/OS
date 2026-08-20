import { z } from "zod";
import type { RuntimeConfig } from "./config.js";

const accessTokenKey = "zoen.web.access-token.v1";
const oidcStateKey = "zoen.web.oidc-state.v1";
const pkceVerifierKey = "zoen.web.pkce-verifier.v1";
const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
  })
  .passthrough();

export function currentAccessToken(): string | undefined {
  return sessionStorage.getItem(accessTokenKey) ?? undefined;
}

export async function beginOidcLogin(config: RuntimeConfig): Promise<void> {
  const state = randomUrlSafeValue(32);
  const verifier = randomUrlSafeValue(64);
  sessionStorage.setItem(oidcStateKey, state);
  sessionStorage.setItem(pkceVerifierKey, verifier);
  const challenge = await sha256UrlSafe(verifier);
  const authorizationUrl = new URL(
    `${config.oidcIssuer}/protocol/openid-connect/auth`,
  );
  authorizationUrl.search = new URLSearchParams({
    client_id: config.oidcClientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid",
    state,
  }).toString();
  window.location.assign(authorizationUrl);
}

export async function completeOidcLogin(
  config: RuntimeConfig,
): Promise<void> {
  const parameters = new URLSearchParams(window.location.search);
  const code = parameters.get("code");
  const returnedState = parameters.get("state");
  const expectedState = sessionStorage.getItem(oidcStateKey);
  const verifier = sessionStorage.getItem(pkceVerifierKey);
  if (
    code === null ||
    returnedState === null ||
    expectedState === null ||
    verifier === null ||
    returnedState !== expectedState
  ) {
    throw new Error("OIDC callback state is invalid");
  }
  const response = await fetch(
    `${config.oidcIssuer}/protocol/openid-connect/token`,
    {
      body: new URLSearchParams({
        client_id: config.oidcClientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(),
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
  );
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error("OIDC token exchange failed");
  }
  const token = tokenResponseSchema.parse(body).access_token;
  sessionStorage.setItem(accessTokenKey, token);
  sessionStorage.removeItem(oidcStateKey);
  sessionStorage.removeItem(pkceVerifierKey);
}

export function clearSession(): void {
  sessionStorage.removeItem(accessTokenKey);
}

function callbackUrl(): string {
  return new URL("/auth/callback", window.location.origin).toString();
}

function randomUrlSafeValue(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64Url(bytes);
}

async function sha256UrlSafe(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
