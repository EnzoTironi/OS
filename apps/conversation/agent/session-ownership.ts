import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  HttpRouteDefinition,
  RouteDefinition,
  RouteHandlerArgs,
} from "eve/channels";
import type { EveChannel } from "eve/channels/eve";

const EVE_SESSION_CREATE_ROUTE = "/eve/v1/session";
const SESSION_ID_PARAMETER = ":sessionId";
const PARENT_SESSION_ID_PARAMETER = ":parentSessionId";
const SESSION_OWNERS_DIRECTORY = resolve(
  process.cwd(),
  ".eve",
  "session-owners"
);

export interface SessionOwner {
  readonly membershipId: string;
  readonly principalId: string;
  readonly worldId: string;
}

type ResolveSessionOwner = (
  request: Request
) => Promise<SessionOwner | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  return nonEmptyString(error.code);
}

function ownerFile(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return resolve(SESSION_OWNERS_DIRECTORY, `${digest}.json`);
}

function sessionOwner(value: unknown): SessionOwner | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const membershipId = nonEmptyString(value.membershipId);
  const principalId = nonEmptyString(value.principalId);
  const worldId = nonEmptyString(value.worldId);
  if (
    membershipId === undefined ||
    principalId === undefined ||
    worldId === undefined
  ) {
    return undefined;
  }
  return { membershipId, principalId, worldId };
}

function sameOwner(left: SessionOwner, right: SessionOwner): boolean {
  return (
    left.membershipId === right.membershipId &&
    left.principalId === right.principalId &&
    left.worldId === right.worldId
  );
}

async function readSessionOwner(
  sessionId: string
): Promise<SessionOwner | undefined> {
  let serialized: string;
  try {
    serialized = await readFile(ownerFile(sessionId), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    return sessionOwner(JSON.parse(serialized));
  } catch {
    return undefined;
  }
}

async function removeTemporaryOwner(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }
}

async function persistSessionOwner(
  sessionId: string,
  owner: SessionOwner
): Promise<void> {
  await mkdir(SESSION_OWNERS_DIRECTORY, { mode: 0o700, recursive: true });
  const destination = ownerFile(sessionId);
  const existing = await readSessionOwner(sessionId);
  if (existing !== undefined) {
    if (sameOwner(existing, owner)) {
      return;
    }
    throw new Error("Eve session already belongs to another Membership.");
  }

  const temporary = resolve(SESSION_OWNERS_DIRECTORY, `.${randomUUID()}.json`);
  await writeFile(temporary, `${JSON.stringify(owner)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporary, destination);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") {
      throw error;
    }
    const raced = await readSessionOwner(sessionId);
    if (raced === undefined || !sameOwner(raced, owner)) {
      throw new Error("Eve session already belongs to another Membership.", {
        cause: error,
      });
    }
  } finally {
    await removeTemporaryOwner(temporary);
  }
}

function rejectedSession(): Response {
  return Response.json(
    {
      code: "session_forbidden",
      error: "This session does not belong to the active Membership.",
      ok: false,
    },
    { headers: { "cache-control": "no-store" }, status: 403 }
  );
}

function unavailableOwnership(): Response {
  return Response.json(
    {
      code: "session_ownership_unavailable",
      error: "Session ownership is unavailable.",
      ok: false,
    },
    { headers: { "cache-control": "no-store" }, status: 503 }
  );
}

async function acceptedSessionId(
  response: Response
): Promise<string | undefined> {
  if (response.status !== 202) {
    return undefined;
  }
  try {
    const body: unknown = await response.clone().json();
    return isRecord(body) ? nonEmptyString(body.sessionId) : undefined;
  } catch {
    return undefined;
  }
}

function protectSessionCreation(
  route: HttpRouteDefinition,
  resolveOwner: ResolveSessionOwner
): HttpRouteDefinition {
  return {
    ...route,
    handler: async (request, args) => {
      const owner = await resolveOwner(request);
      const response = await route.handler(request, args);
      if (owner === undefined || response.status !== 202) {
        return response;
      }
      const sessionId = await acceptedSessionId(response);
      if (sessionId === undefined) {
        return unavailableOwnership();
      }
      try {
        await persistSessionOwner(sessionId, owner);
      } catch {
        return unavailableOwnership();
      }
      return response;
    },
  };
}

function protectExistingSession(
  route: HttpRouteDefinition,
  parameter: "parentSessionId" | "sessionId",
  resolveOwner: ResolveSessionOwner
): HttpRouteDefinition {
  return {
    ...route,
    handler: async (request, args: RouteHandlerArgs) => {
      const owner = await resolveOwner(request);
      if (owner === undefined) {
        return route.handler(request, args);
      }
      const sessionId = nonEmptyString(args.params[parameter]);
      if (sessionId === undefined) {
        return route.handler(request, args);
      }
      let expected: SessionOwner | undefined;
      try {
        expected = await readSessionOwner(sessionId);
      } catch {
        return unavailableOwnership();
      }
      if (expected === undefined || !sameOwner(expected, owner)) {
        return rejectedSession();
      }
      return route.handler(request, args);
    },
  };
}

function protectRoute(
  route: RouteDefinition,
  resolveOwner: ResolveSessionOwner
): RouteDefinition {
  if (route.transport === "websocket") {
    return route;
  }
  if (route.path === EVE_SESSION_CREATE_ROUTE) {
    return protectSessionCreation(route, resolveOwner);
  }
  if (route.path.includes(SESSION_ID_PARAMETER)) {
    return protectExistingSession(route, "sessionId", resolveOwner);
  }
  if (route.path.includes(PARENT_SESSION_ID_PARAMETER)) {
    return protectExistingSession(route, "parentSessionId", resolveOwner);
  }
  return route;
}

export function withSessionOwnership(
  channel: EveChannel,
  resolveOwner: ResolveSessionOwner
): EveChannel {
  return {
    ...channel,
    routes: channel.routes.map((route) => protectRoute(route, resolveOwner)),
  };
}
