import { type AuthFn, withAuthChallenges } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import type { SessionAuthContext } from "eve/context";

import {
  hostCredentialFromRaw,
  putHostCredential,
} from "../sandbox/credentials";
import { type SessionOwner, withSessionOwnership } from "../session-ownership";

const TRAILING_SLASHES = /\/+$/u;
const SHA_256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function userId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id } = value;
  return nonEmptyString(id);
}

function userEmail(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { email } = value;
  return nonEmptyString(email);
}

function sessionUser(body: unknown): unknown {
  if (!isRecord(body)) {
    return undefined;
  }
  if (body.user !== undefined) {
    return body.user;
  }
  if (isRecord(body.session) && body.session.user !== undefined) {
    return body.session.user;
  }
  return undefined;
}

function trimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return nonEmptyString(value);
}

function normalizedEnvUrl(name: string): string | undefined {
  const value = trimmedEnv(name)?.replace(TRAILING_SLASHES, "");
  return value === undefined ? undefined : nonEmptyString(value);
}

interface DoorCredential {
  readonly sessionHeaders: Headers;
  readonly token: string;
}

interface ParsedDoorCookie {
  readonly header: string;
  readonly token: string;
}

function opaqueToken(value: string): string | undefined {
  const token = value.trim();
  return token.length > 0 && token.split(".").length !== 3 ? token : undefined;
}

function bearerDoorToken(authorization: string | null): string | undefined {
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  return opaqueToken(authorization.slice("bearer ".length));
}

function cookieDoorCredentials(
  cookie: string | null
): ParsedDoorCookie[] | undefined {
  if (cookie === null || cookie.length === 0) {
    return [];
  }
  const credentials = new Map<string, ParsedDoorCookie>();
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name?.endsWith("session_token")) {
      continue;
    }
    try {
      const encodedValue = rest.join("=");
      const token = opaqueToken(decodeURIComponent(encodedValue));
      if (token === undefined) {
        return undefined;
      }
      credentials.set(token, { header: `${name}=${encodedValue}`, token });
    } catch {
      return undefined;
    }
  }
  return [...credentials.values()];
}

function doorCredential(request: Request): DoorCredential | undefined {
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  const bearerToken = bearerDoorToken(authorization);
  if (authorization !== null && bearerToken === undefined) {
    return undefined;
  }
  const cookieCredentials = cookieDoorCredentials(cookie);
  if (cookieCredentials === undefined || cookieCredentials.length > 1) {
    return undefined;
  }
  const [cookieCredential] = cookieCredentials;
  if (
    bearerToken !== undefined &&
    cookieCredential !== undefined &&
    bearerToken !== cookieCredential.token
  ) {
    return undefined;
  }
  const sessionHeaders = new Headers();
  if (cookieCredential !== undefined) {
    sessionHeaders.set("cookie", cookieCredential.header);
    return { sessionHeaders, token: cookieCredential.token };
  }
  if (bearerToken !== undefined && authorization !== null) {
    sessionHeaders.set("authorization", authorization);
    return { sessionHeaders, token: bearerToken };
  }
  return undefined;
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<unknown | undefined> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return undefined;
  }
  if (!response.ok) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function workbenchCredentialInput(input: {
  readonly doorToken: string;
  readonly membershipId: string;
  readonly worldId: string;
}) {
  return hostCredentialFromRaw({
    definitionDigest:
      process.env.ZOEN_WORKBENCH_DEFINITION_DIGEST?.trim() ?? "",
    definitionId: process.env.ZOEN_WORKBENCH_DEFINITION_ID?.trim() ?? "",
    doorToken: input.doorToken,
    membershipId: input.membershipId,
    validAt: process.env.ZOEN_WORKBENCH_VALID_AT?.trim() ?? "",
    worldId: input.worldId,
  });
}

interface AuthenticatedMembership {
  readonly auth: SessionAuthContext;
  readonly owner: SessionOwner;
}

const AUTHENTICATED_MEMBERSHIPS = new WeakMap<
  Request,
  Promise<AuthenticatedMembership | undefined>
>();

async function authenticateMembership(
  request: Request
): Promise<AuthenticatedMembership | undefined> {
  const base = normalizedEnvUrl("ZOEN_AUTH_BASE_URL");
  if (base === undefined) {
    return undefined;
  }
  const credential = doorCredential(request);
  if (credential === undefined) {
    return undefined;
  }
  const body = await fetchJson(`${base}/api/auth/get-session`, {
    headers: credential.sessionHeaders,
    method: "GET",
  });
  const user = sessionUser(body);
  const doorUserId = userId(user);
  if (doorUserId === undefined) {
    return undefined;
  }
  const worldHint = nonEmptyString(
    request.headers.get("x-zoen-tenant")?.trim()
  );
  if (worldHint === undefined) {
    return undefined;
  }
  const zoend = normalizedEnvUrl("ZOEN_ZOEND");
  if (zoend === undefined) {
    return undefined;
  }
  const resolved = await resolveIngress(zoend, credential.token, worldHint);
  if (resolved === undefined) {
    return undefined;
  }
  const attributes: Record<string, string> = {};
  const email = userEmail(user);
  if (email !== undefined) {
    attributes.email = email;
  }
  attributes.doorUserId = doorUserId;
  attributes.accountId = resolved.accountId;
  attributes.activeReleaseDigest = resolved.activeReleaseDigest;
  attributes.membershipId = resolved.membershipId;
  attributes.worldId = resolved.worldId;
  putHostCredential(
    workbenchCredentialInput({
      doorToken: credential.token,
      membershipId: resolved.membershipId,
      worldId: resolved.worldId,
    })
  );
  return {
    auth: {
      attributes,
      authenticator: "better-auth",
      principalId: resolved.principalId,
      principalType: "user",
    },
    owner: {
      membershipId: resolved.membershipId,
      principalId: resolved.principalId,
      worldId: resolved.worldId,
    },
  };
}

function authenticatedMembership(
  request: Request
): Promise<AuthenticatedMembership | undefined> {
  const cached = AUTHENTICATED_MEMBERSHIPS.get(request);
  if (cached !== undefined) {
    return cached;
  }
  const authentication = authenticateMembership(request);
  AUTHENTICATED_MEMBERSHIPS.set(request, authentication);
  return authentication;
}

function betterAuthSession(): AuthFn<Request> {
  return withAuthChallenges(
    async (request) => {
      const membership = await authenticatedMembership(request);
      return membership?.auth;
    },
    [{ scheme: "Bearer" }]
  );
}

async function resolveIngress(
  zoendBaseUrl: string,
  doorToken: string,
  requestedWorldId: string
): Promise<
  | {
      accountId: string;
      activeReleaseDigest: string;
      membershipId: string;
      principalId: string;
      worldId: string;
    }
  | undefined
> {
  const url = `${zoendBaseUrl}/identity/admin/resolve-ingress?world=${encodeURIComponent(requestedWorldId)}`;
  const body = await fetchJson(url, {
    headers: { authorization: `Bearer ${doorToken}` },
  });
  if (!isRecord(body)) {
    return undefined;
  }
  const {
    accountId,
    accountStatus,
    activeReleaseDigest,
    bindingId,
    bindingProvider,
    membershipId,
    principalId,
    worldId,
  } = body;
  const resolvedWorldId = nonEmptyString(worldId);
  if (
    typeof accountId !== "string" ||
    accountId.length === 0 ||
    accountStatus !== "verified" ||
    typeof activeReleaseDigest !== "string" ||
    !SHA_256_HEX.test(activeReleaseDigest) ||
    typeof bindingId !== "string" ||
    bindingId.length === 0 ||
    bindingProvider !== "auth_door" ||
    typeof membershipId !== "string" ||
    membershipId.length === 0 ||
    typeof principalId !== "string" ||
    principalId.length === 0 ||
    resolvedWorldId !== requestedWorldId
  ) {
    return undefined;
  }
  return {
    accountId,
    activeReleaseDigest,
    membershipId,
    principalId,
    worldId: resolvedWorldId,
  };
}

const channel = eveChannel({ auth: betterAuthSession() });

export default withSessionOwnership(channel, async (request) => {
  const membership = await authenticatedMembership(request);
  return membership?.owner;
});
