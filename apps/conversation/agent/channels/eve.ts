import { type AuthFn, localDev, withAuthChallenges } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import {
  hostCredentialFromRaw,
  putHostCredential,
} from "../sandbox/credentials";

const TRAILING_SLASHES = /\/+$/u;

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

function stripTrailingSlashes(url: string): string {
  return url.replace(TRAILING_SLASHES, "");
}

function sessionHeaders(request: Request): Headers | null {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (cookie !== null && cookie.length > 0) {
    headers.set("cookie", cookie);
  }
  if (authorization !== null && authorization.length > 0) {
    headers.set("authorization", authorization);
  }
  if (headers.get("cookie") === null && headers.get("authorization") === null) {
    return null;
  }
  return headers;
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
  readonly tenantId: string;
}) {
  return hostCredentialFromRaw({
    definitionDigest:
      process.env.ZOEN_WORKBENCH_DEFINITION_DIGEST?.trim() ?? "",
    definitionId: process.env.ZOEN_WORKBENCH_DEFINITION_ID?.trim() ?? "",
    doorToken: input.doorToken,
    membershipId: input.membershipId,
    tenantId: input.tenantId,
    validAt: process.env.ZOEN_WORKBENCH_VALID_AT?.trim() ?? "",
  });
}

async function attachMembership(
  request: Request,
  attributes: Record<string, string>
): Promise<void> {
  const doorToken = opaqueDoorToken(request);
  const tenantHint = request.headers.get("x-zoen-tenant")?.trim();
  const zoend = trimmedEnv("ZOEN_ZOEND_BASE_URL");
  if (
    doorToken === undefined ||
    tenantHint === undefined ||
    zoend === undefined
  ) {
    return;
  }
  const resolved = await resolveMembership(zoend, doorToken, tenantHint);
  if (resolved === undefined) {
    return;
  }
  attributes.membershipId = resolved.membershipId;
  attributes.tenantId = resolved.tenantId;
  putHostCredential(
    workbenchCredentialInput({
      doorToken,
      membershipId: resolved.membershipId,
      tenantId: resolved.tenantId,
    })
  );
}

function betterAuthSession(): AuthFn<Request> {
  return withAuthChallenges(
    async (request) => {
      const base = trimmedEnv("ZOEN_AUTH_BASE_URL");
      if (base === undefined) {
        return null;
      }
      const headers = sessionHeaders(request);
      if (headers === null) {
        return null;
      }
      const body = await fetchJson(
        `${stripTrailingSlashes(base)}/api/auth/get-session`,
        {
          headers,
          method: "GET",
        }
      );
      const user = sessionUser(body);
      const principalId = userId(user);
      if (principalId === undefined) {
        return null;
      }
      const attributes: Record<string, string> = {};
      const email = userEmail(user);
      if (email !== undefined) {
        attributes.email = email;
      }
      await attachMembership(request, attributes);
      return {
        attributes,
        authenticator: "better-auth",
        principalId,
        principalType: "user",
      };
    },
    [{ scheme: "Bearer" }]
  );
}

function opaqueDoorToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token.length > 0 && token.split(".").length !== 3) {
      return token;
    }
  }
  const cookie = request.headers.get("cookie");
  if (cookie === null || cookie.length === 0) {
    return undefined;
  }
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name?.endsWith("session_token")) {
      const value = rest.join("=");
      if (value.length > 0 && value.split(".").length !== 3) {
        return decodeURIComponent(value);
      }
    }
  }
  return undefined;
}

async function resolveMembership(
  zoendBaseUrl: string,
  doorToken: string,
  tenantId: string
): Promise<{ membershipId: string; tenantId: string } | undefined> {
  const url = `${stripTrailingSlashes(zoendBaseUrl)}/identity/admin/resolve-context?tenant=${encodeURIComponent(tenantId)}`;
  const body = await fetchJson(url, {
    headers: { authorization: `Bearer ${doorToken}` },
  });
  if (!isRecord(body)) {
    return undefined;
  }
  const { membershipId, tenantId: tenant } = body;
  if (typeof membershipId !== "string" || membershipId.length === 0) {
    return undefined;
  }
  return {
    membershipId,
    tenantId: nonEmptyString(tenant) ?? tenantId,
  };
}

export default eveChannel({
  auth: [localDev(), betterAuthSession()],
});
