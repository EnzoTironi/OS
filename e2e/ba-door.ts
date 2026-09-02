import assert from "node:assert/strict";
import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { e2ePort, requiredE2ePort } from "./host-env.js";
import { reachJourneyBarrier } from "./journey-run-context.js";

const DOOR_PASSWORD = "E2e-session-door-1";
const INVITE_EXPIRES_AT_MICROS = 4_102_444_800_000_000;

export type InvitePersona = {
  kind: "invite";
  id: string;
  tenantId: string;
  principalId: string;
  actorId: string;
  workloadId: string;
  actionIds: readonly string[];
  resourceIds: readonly string[];
};

export type SignupOnlyPersona = {
  kind: "signup-only";
  id: string;
};

export type ExpiredPersona = {
  kind: "expired";
  id: string;
  tenantId: string;
  principalId: string;
  actorId: string;
  workloadId: string;
  actionIds: readonly string[];
  resourceIds: readonly string[];
};

export type JwtGarbagePersona = {
  kind: "jwt-garbage";
  id: string;
};

export type DoorPersona =
  | InvitePersona
  | SignupOnlyPersona
  | ExpiredPersona
  | JwtGarbagePersona;

export type BoundSession = {
  accountId: string;
  actorId: string;
  principalId: string;
  tenantId: string;
  token: string;
  workloadId: string;
};

export type AuthDoor = {
  authDatabaseUrl: string;
  child: ChildProcessWithoutNullStreams;
  origin: string;
  output: string[];
};

const jsonObject = z.record(z.string(), z.unknown());
const signupBodySchema = z
  .object({
    session: z.object({ token: z.string().min(1) }).optional(),
    token: z.string().min(1).optional(),
  })
  .passthrough();

export function e2eAuthDatabaseUrl(): string {
  return `postgres://postgres:postgres@127.0.0.1:${e2ePort(
    "ZOEN_E2E_POSTGRES_PORT",
  )}/zoen_auth`;
}

export function sessionDoorProcessEnv(input: {
  applicationDatabaseUrl: string;
  authDatabaseUrl: string;
  extra?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: input.applicationDatabaseUrl,
    ZOEN_AUTH_DATABASE_URL: input.authDatabaseUrl,
    ...input.extra,
  };
  delete env.ZOEN_OIDC_AUDIENCE;
  delete env.ZOEN_OIDC_DISCOVERY_URL;
  delete env.ZOEN_OIDC_ISSUER;
  return env;
}

export function adminPairPersonas(
  resourceIds: readonly string[],
  actionIds: readonly string[] = ["zoen.definition.activate"],
): DoorPersona[] {
  return [
    invitePersona({
      actionIds,
      actorId: "actor.admin.a",
      id: "admin-a",
      principalId: "principal.admin.a",
      resourceIds,
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
    }),
    invitePersona({
      actionIds,
      actorId: "actor.admin.b",
      id: "admin-b",
      principalId: "principal.admin.b",
      resourceIds,
      tenantId: "tenant.b",
      workloadId: "workload.admin.b",
    }),
  ];
}

export function invitePersona(
  input: Omit<InvitePersona, "kind">,
): InvitePersona {
  return { kind: "invite", ...input };
}

export function signupOnlyPersona(id: string): SignupOnlyPersona {
  return { kind: "signup-only", id };
}

export function expiredPersona(
  input: Omit<ExpiredPersona, "kind">,
): ExpiredPersona {
  return { kind: "expired", ...input };
}

export function jwtGarbagePersona(id: string): JwtGarbagePersona {
  return { kind: "jwt-garbage", id };
}

export function jwtShapedGarbage(): string {
  return "e2e.invalid.jwt";
}

export function corruptSessionToken(token: string): string {
  return `x${token}`;
}

export async function startAuthDoor(authDatabaseUrl: string): Promise<AuthDoor> {
  const authRoot = path.join(process.cwd(), "apps", "auth");
  if (!existsSync(path.join(authRoot, "node_modules", "better-auth"))) {
    throw new Error("missing apps/auth dependencies; run just prepare before journeys");
  }
  const authModule = path.join(authRoot, "dist", "auth.mjs");
  const serverModule = path.join(authRoot, "dist", "server.mjs");
  if (!existsSync(authModule) || !existsSync(serverModule)) {
    throw new Error("missing prepared Auth JavaScript; run just prepare before journeys");
  }
  await ensureAuthDatabase(authDatabaseUrl);
  const port = requiredE2ePort("ZOEN_E2E_AUTH_PORT");
  const origin = `http://127.0.0.1:${port}`;
  if (await portOpen(port)) {
    throw new Error(
      `leased Auth port ${port} is already occupied; refusing to adopt its process`,
    );
  }
  const secret = randomBytes(32).toString("base64");
  const env = doorEnv(authDatabaseUrl, secret, origin, port);
  execFileSync(
    path.join(authRoot, "node_modules", ".bin", "auth"),
    ["migrate", "--config", authModule, "--yes"],
    { cwd: authRoot, env, stdio: "inherit" },
  );
  const output: string[] = [];
  const child = spawn(
    process.execPath,
    [serverModule],
    {
      cwd: authRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForAuth(child, output, port);
  const door = { authDatabaseUrl, child, origin, output };
  await reachJourneyBarrier("auth-ready");
  return door;
}

export async function stopAuthDoor(door: AuthDoor): Promise<void> {
  if (door.child.exitCode !== null) {
    return;
  }
  door.child.kill("SIGINT");
  await once(door.child, "exit");
}

export async function signUpSession(
  door: AuthDoor,
  id: string,
): Promise<{ email: string; token: string }> {
  const email = `${id}@e2e.invalid`;
  const response = await fetch(`${door.origin}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email,
      name: id,
      password: DOOR_PASSWORD,
    }),
    headers: {
      "content-type": "application/json",
      origin: door.origin,
    },
    method: "POST",
  });
  const text = await response.text();
  assert.equal(response.ok, true, `sign-up ${id} ${response.status} ${text}`);
  const cookie = sessionTokenFromSetCookie(response.headers.getSetCookie());
  if (cookie !== undefined) {
    return { email, token: cookie };
  }
  const parsed = signupBodySchema.parse(JSON.parse(text) as unknown);
  const token = parsed.token ?? parsed.session?.token;
  assert.ok(token, `sign-up ${id} missing session token: ${text}`);
  return { email, token };
}

export async function plantPersonas(
  door: AuthDoor,
  input: {
    adminToken: string;
    applicationDatabaseUrl: string;
    personas: readonly DoorPersona[];
    zoendBaseUrl: string;
  },
): Promise<Map<string, BoundSession>> {
  const planted = new Map<string, BoundSession>();
  for (const persona of input.personas) {
    planted.set(
      persona.id,
      await plantOne(door, input, persona),
    );
  }
  return planted;
}

export function sessionOf(
  planted: Map<string, BoundSession>,
  id: string,
): BoundSession {
  const session = planted.get(id);
  assert.ok(session, `missing planted session ${id}`);
  return session;
}

async function plantOne(
  door: AuthDoor,
  input: {
    adminToken: string;
    applicationDatabaseUrl: string;
    zoendBaseUrl: string;
  },
  persona: DoorPersona,
): Promise<BoundSession> {
  switch (persona.kind) {
    case "jwt-garbage":
      return {
        accountId: "",
        actorId: "",
        principalId: "",
        tenantId: "",
        token: jwtShapedGarbage(),
        workloadId: "",
      };
    case "signup-only": {
      const signed = await signUpSession(door, persona.id);
      return {
        accountId: "",
        actorId: "",
        principalId: "",
        tenantId: "",
        token: signed.token,
        workloadId: "",
      };
    }
    case "invite":
    case "expired": {
      const signed = await signUpSession(door, persona.id);
      const bound = await bindInvite({
        adminToken: input.adminToken,
        applicationDatabaseUrl: input.applicationDatabaseUrl,
        persona,
        token: signed.token,
        zoendBaseUrl: input.zoendBaseUrl,
      });
      if (persona.kind === "expired") {
        await expireSession(door.authDatabaseUrl, bound.token);
      }
      return bound;
    }
    default: {
      const _exhaustive: never = persona;
      return _exhaustive;
    }
  }
}

async function bindInvite(input: {
  adminToken: string;
  applicationDatabaseUrl: string;
  persona: InvitePersona | ExpiredPersona;
  token: string;
  zoendBaseUrl: string;
}): Promise<BoundSession> {
  const bootstrap = await jsonRequest(
    input.zoendBaseUrl,
    "POST",
    "/identity/admin/bootstrap-bound",
    input.token,
  );
  assert.equal(
    bootstrap.status,
    200,
    `bootstrap-bound ${input.persona.id} ${JSON.stringify(bootstrap.body)}`,
  );
  const accountId = requiredString(bootstrap.body, "accountId");
  const inviteToken = `invite.${input.persona.id}`;
  const invite = await jsonRequest(
    input.zoendBaseUrl,
    "POST",
    "/identity/admin/invites",
    input.adminToken,
    {
      actionIds: [...input.persona.actionIds],
      actorId: input.persona.actorId,
      expiresAtMicros: INVITE_EXPIRES_AT_MICROS,
      principalId: input.persona.principalId,
      resourceIds: [...input.persona.resourceIds],
      tenantId: input.persona.tenantId,
      token: inviteToken,
      workloadId: input.persona.workloadId,
    },
  );
  assert.equal(
    invite.status,
    200,
    `invite ${input.persona.id} ${JSON.stringify(invite.body)}`,
  );
  const accept = await jsonRequest(
    input.zoendBaseUrl,
    "POST",
    "/identity/admin/accept-invite",
    input.adminToken,
    { accountId, token: inviteToken },
  );
  assert.equal(
    accept.status,
    200,
    `accept-invite ${input.persona.id} ${JSON.stringify(accept.body)}`,
  );
  assert.equal(
    accept.body.principalId,
    input.persona.principalId,
    `accept principal ${input.persona.id} ${JSON.stringify(accept.body)}`,
  );
  const resolved = await jsonRequest(
    input.zoendBaseUrl,
    "GET",
    `/identity/admin/resolve-context?tenant=${encodeURIComponent(input.persona.tenantId)}`,
    input.token,
  );
  assert.equal(
    resolved.status,
    200,
    `resolve-context ${input.persona.id} ${JSON.stringify(resolved.body)}`,
  );
  assert.equal(
    resolved.body.principalId,
    input.persona.principalId,
    `resolved principal ${input.persona.id} ${JSON.stringify(resolved.body)}`,
  );
  await grantOwnerClearance(input.applicationDatabaseUrl, accountId, input.persona.tenantId);
  return {
    accountId,
    actorId: input.persona.actorId,
    principalId: input.persona.principalId,
    tenantId: input.persona.tenantId,
    token: input.token,
    workloadId: input.persona.workloadId,
  };
}

async function grantOwnerClearance(
  applicationDatabaseUrl: string,
  accountId: string,
  tenantId: string,
): Promise<void> {
  const client = new PostgresClient({ connectionString: applicationDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE memberships
          SET clearance_json = $1::jsonb
        WHERE account_id = $2 AND tenant_id = $3 AND status = 'active'`,
      [JSON.stringify(["zoen.world.floor", "zoen.world.top"]), accountId, tenantId],
    );
    assert.ok(
      result.rowCount !== null && result.rowCount > 0,
      `grant owner clearance ${accountId} ${tenantId}`,
    );
  } finally {
    await client.end();
  }
}

async function expireSession(
  authDatabaseUrl: string,
  token: string,
): Promise<void> {
  const unsigned = unsignedSessionToken(token);
  const client = new PostgresClient({ connectionString: authDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE session
          SET "expiresAt" = NOW() - INTERVAL '1 hour'
        WHERE token = $1 OR token = $2`,
      [unsigned, token],
    );
    assert.ok(result.rowCount !== null && result.rowCount > 0, "expire session");
  } finally {
    await client.end();
  }
}

async function jsonRequest(
  zoendBaseUrl: string,
  method: string,
  route: string,
  bearer: string,
  body?: unknown,
): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await fetch(`${zoendBaseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : jsonObject.parse(JSON.parse(text) as unknown);
  return { body: parsed, status: response.status };
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key];
  assert.equal(typeof value, "string", `${key} ${JSON.stringify(body)}`);
  return value as string;
}

function sessionTokenFromSetCookie(headers: readonly string[]): string | undefined {
  for (const header of headers) {
    const pair = header.split(";")[0];
    if (pair === undefined) {
      continue;
    }
    const eq = pair.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const name = pair.slice(0, eq).trim();
    if (!name.endsWith("session_token")) {
      continue;
    }
    return decodeURIComponent(pair.slice(eq + 1));
  }
  return undefined;
}

function unsignedSessionToken(token: string): string {
  const split = token.lastIndexOf(".");
  if (split <= 0) {
    return token;
  }
  return token.slice(0, split);
}

async function ensureAuthDatabase(authDatabaseUrl: string): Promise<void> {
  const applicationUrl = authDatabaseUrl.replace(/\/zoen_auth$/, "/zoen");
  const client = await connectPostgres(applicationUrl);
  try {
    await client.query(`
      DO $$ BEGIN
        CREATE ROLE zoen_app
          LOGIN
          PASSWORD 'zoen_app'
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE ROLE zoen_projection
          LOGIN
          PASSWORD 'zoen_projection'
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
    `);
    const existing = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname = 'zoen_auth'",
    );
    if (existing.rows.length === 0) {
      await client.query("CREATE DATABASE zoen_auth");
    }
    await client.query(`
      DO $$
      DECLARE
        database_name text;
      BEGIN
        FOR database_name IN
          SELECT datname FROM pg_catalog.pg_database WHERE datallowconn
        LOOP
          EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC',
            database_name
          );
        END LOOP;
      END $$;
    `);
    await client.query(
      "GRANT CONNECT ON DATABASE zoen TO zoen_app, zoen_projection",
    );
    await client.query("GRANT CONNECT ON DATABASE zoen_auth TO zoen_app");
    await client.query("REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC");
    await client.query("GRANT ALL ON SCHEMA public TO zoen_app");
    await client.query("GRANT USAGE ON SCHEMA public TO zoen_projection");
  } finally {
    await client.end();
  }
}

async function connectPostgres(connectionString: string): Promise<PostgresClient> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new PostgresClient({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await delay(250);
    }
  }
  throw new Error(`postgres was not ready: ${String(lastError)}`);
}

function doorEnv(
  authDatabaseUrl: string,
  secret: string,
  origin: string,
  port: number,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_LISTEN_PORT: String(port),
    BETTER_AUTH_URL: origin,
    DATABASE_URL: authDatabaseUrl,
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  };
}

async function waitForAuth(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
  port: number,
): Promise<void> {
  const expectedOrigin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`auth door exited:\n${output.join("")}`);
    }
    if (
      output
        .join("")
        .split(/\r?\n/)
        .some((line) => line.trim() === expectedOrigin)
    ) {
      return;
    }
    await delay(250);
  }
  throw new Error(`auth door did not become ready:\n${output.join("")}`);
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}
