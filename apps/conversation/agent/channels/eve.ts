import { eveChannel } from "eve/channels/eve";
import {
  localDev,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";

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

    return {
      authenticator: "better-auth",
      principalType: "user",
      principalId,
      attributes,
    };
  }, [{ scheme: "Bearer" }]);
}

export default eveChannel({
  auth: [localDev(), betterAuthSession()],
});
