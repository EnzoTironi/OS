import { eveChannel } from "eve/channels/eve";
import {
  localDev,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";

import { hostCredentialFromRaw, putHostCredential } from "../sandbox/credentials";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function userId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const id = value.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function userEmail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const email = value.email;
  return typeof email === "string" && email.length > 0 ? email : undefined;
}

function sessionUser(body: unknown): unknown {
  if (!isRecord(body)) return undefined;
  if (body.user !== undefined) return body.user;
  if (isRecord(body.session) && body.session.user !== undefined) {
    return body.session.user;
  }
  return undefined;
}

function betterAuthSession(): AuthFn<Request> {
  return withAuthChallenges(async (request) => {
    const base = process.env.ZOEN_AUTH_BASE_URL?.trim();
    if (base === undefined || base.length === 0) return null;

    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    if (cookie !== null && cookie.length > 0) headers.set("cookie", cookie);
    if (authorization !== null && authorization.length > 0) {
      headers.set("authorization", authorization);
    }
    if ((cookie === null || cookie.length === 0) && (authorization === null || authorization.length === 0)) {
      return null;
    }

    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/+$/u, "")}/api/auth/get-session`, {
        method: "GET",
        headers,
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }

    const user = sessionUser(body);
    const principalId = userId(user);
    if (principalId === undefined) return null;

    const attributes: Record<string, string> = {};
    const email = userEmail(user);
    if (email !== undefined) attributes.email = email;

    const doorToken = opaqueDoorToken(request);
    const tenantHint = request.headers.get("x-zoen-tenant")?.trim();
    const zoend = process.env.ZOEN_ZOEND_BASE_URL?.trim();
    if (doorToken !== undefined && tenantHint !== undefined && zoend !== undefined && zoend.length > 0) {
      const resolved = await resolveMembership(zoend, doorToken, tenantHint);
      if (resolved !== undefined) {
        attributes.membershipId = resolved.membershipId;
        attributes.tenantId = resolved.tenantId;
        putHostCredential(
          hostCredentialFromRaw({
            membershipId: resolved.membershipId,
            tenantId: resolved.tenantId,
            doorToken,
            definitionId: process.env.ZOEN_WORKBENCH_DEFINITION_ID?.trim() ?? "",
            definitionDigest: process.env.ZOEN_WORKBENCH_DEFINITION_DIGEST?.trim() ?? "",
            validAt: process.env.ZOEN_WORKBENCH_VALID_AT?.trim() ?? "",
          }),
        );
      }
    }

    return {
      authenticator: "better-auth",
      principalType: "user",
      principalId,
      attributes,
    };
  }, [{ scheme: "Bearer" }]);
}

function opaqueDoorToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization !== null && authorization.toLowerCase().startsWith("bearer ")) {
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
    if (name !== undefined && name.endsWith("session_token")) {
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
  tenantId: string,
): Promise<{ membershipId: string; tenantId: string } | undefined> {
  const url = `${zoendBaseUrl.replace(/\/+$/u, "")}/identity/admin/resolve-context?tenant=${encodeURIComponent(tenantId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${doorToken}` },
    });
  } catch {
    return undefined;
  }
  if (!response.ok) {
    return undefined;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  if (!isRecord(body)) {
    return undefined;
  }
  const membershipId = body.membershipId;
  const tenant = body.tenantId;
  if (typeof membershipId !== "string" || membershipId.length === 0) {
    return undefined;
  }
  return {
    membershipId,
    tenantId: typeof tenant === "string" && tenant.length > 0 ? tenant : tenantId,
  };
}

export default eveChannel({
  auth: [localDev(), betterAuthSession()],
});
