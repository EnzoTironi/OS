import assert from "node:assert/strict";
import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  e2eHttpUrl,
  e2ePort,
  e2eRunnerIsolatedProcessGroup,
} from "./host-env.js";

const authDoorPort = e2ePort("ZOEN_E2E_AUTH_PORT", 58_704);
export const AUTH_DOOR_ORIGIN = e2eHttpUrl(
  "ZOEN_E2E_AUTH_PORT",
  58_704,
);
const AUTH_READY_TIMEOUT_MS = 20_000;
const AUTH_STOP_TIMEOUT_MS = 10_000;
const AUTH_KILL_TIMEOUT_MS = 3_000;
const FIXED_CHILD_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const DETACH_CHILDREN =
  process.platform !== "win32" && !e2eRunnerIsolatedProcessGroup;
export const E2E_DOOR_PASSWORD = "E2e-session-door-1";
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
  output: string[];
};

type StartAuthDoorOptions = {
  device?: {
    expiresInSeconds: number;
    pollIntervalSeconds: number;
  };
  google?: {
    clientId: string;
    clientSecret: string;
  };
  readinessTimeoutMs?: number;
};

const jsonObject = z.record(z.string(), z.unknown());
const signupBodySchema = z
  .object({
    session: z.object({ token: z.string().min(1) }).optional(),
    token: z.string().min(1).optional(),
  })
  .passthrough();

export function e2eAuthDatabaseUrl(postgresPortFallback: number): string {
  return `postgres://postgres:postgres@127.0.0.1:${e2ePort(
    "ZOEN_E2E_POSTGRES_PORT",
    postgresPortFallback,
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
    PATH: FIXED_CHILD_PATH,
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

export async function startAuthDoor(
  authDatabaseUrl: string,
  options: StartAuthDoorOptions = {},
): Promise<AuthDoor> {
  const authRoot = path.join(process.cwd(), "apps", "auth");
  if (!existsSync(path.join(authRoot, "node_modules", "better-auth"))) {
    throw new Error(
      "missing apps/auth dependencies; run `npm ci --prefix apps/auth`",
    );
  }
  if (await portOpen(authDoorPort)) {
    throw new Error(`auth door port ${authDoorPort} is already in use`);
  }
  await ensureAuthDatabase(authDatabaseUrl);
  const secret = randomBytes(32).toString("base64");
  const env = doorEnv(authDatabaseUrl, secret, options);
  execFileSync(
    process.execPath,
    [
      path.join(authRoot, "node_modules", "auth", "dist", "index.mjs"),
      "migrate",
      "--config",
      "src/auth.ts",
      "--yes",
    ],
    { cwd: authRoot, env, stdio: "inherit" },
  );
  const output: string[] = [];
  const child = spawn(
    process.execPath,
    ["--import", "tsx", path.join(authRoot, "src", "server.ts")],
    {
      cwd: authRoot,
      detached: DETACH_CHILDREN,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.on("error", (error) => output.push(`${error.message}\n`));
  try {
    await waitForAuth(
      child,
      output,
      options.readinessTimeoutMs ?? AUTH_READY_TIMEOUT_MS,
    );
    return { authDatabaseUrl, child, output };
  } catch (error) {
    try {
      await stopAuthChild(child);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "auth door startup and cleanup failed",
      );
    }
    throw error;
  }
}

export async function stopAuthDoor(door: AuthDoor): Promise<void> {
  await stopAuthChild(door.child);
}

export async function signUpSession(
  input: { id: string; zoendBaseUrl: string },
): Promise<{ email: string; token: string }> {
  const email = `${input.id}@e2e.invalid`;
  const response = await fetch(
    `${input.zoendBaseUrl}/api/auth/sign-up/email`,
    {
      body: JSON.stringify({
        email,
        name: input.id,
        password: E2E_DOOR_PASSWORD,
      }),
      headers: {
        "content-type": "application/json",
        origin: input.zoendBaseUrl,
      },
      method: "POST",
    },
  );
  const text = await response.text();
  assert.equal(
    response.ok,
    true,
    `sign-up ${input.id} ${response.status} ${text}`,
  );
  const cookie = sessionTokenFromSetCookie(response.headers.getSetCookie());
  if (cookie !== undefined) {
    return { email, token: cookie };
  }
  const parsed = signupBodySchema.parse(JSON.parse(text) as unknown);
  const token = parsed.token ?? parsed.session?.token;
  assert.ok(token, `sign-up ${input.id} missing session token: ${text}`);
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
      const signed = await signUpSession({
        id: persona.id,
        zoendBaseUrl: input.zoendBaseUrl,
      });
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
      const signed = await signUpSession({
        id: persona.id,
        zoendBaseUrl: input.zoendBaseUrl,
      });
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
      worldId: input.persona.tenantId,
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
    `/identity/admin/resolve-context?world=${encodeURIComponent(input.persona.tenantId)}`,
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
        WHERE account_id = $2 AND world_id = $3 AND status = 'active'`,
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
  options: StartAuthDoorOptions,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: AUTH_DOOR_ORIGIN,
    DATABASE_URL: authDatabaseUrl,
    GOOGLE_CLIENT_ID: options.google?.clientId ?? "",
    GOOGLE_CLIENT_SECRET: options.google?.clientSecret ?? "",
    ZOEN_AUTH_BASE_URL: AUTH_DOOR_ORIGIN,
    ...(options.device === undefined
      ? {}
      : {
          ZOEN_DEVICE_EXPIRES_IN_SECONDS: String(
            options.device.expiresInSeconds,
          ),
          ZOEN_DEVICE_POLL_INTERVAL_SECONDS: String(
            options.device.pollIntervalSeconds,
          ),
        }),
    PATH: FIXED_CHILD_PATH,
  };
}

async function waitForAuth(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processExited(child)) {
      throw new Error(`auth door exited:\n${output.join("")}`);
    }
    if (
      output.join("").includes(`${AUTH_DOOR_ORIGIN}\n`) &&
      (await portOpen(authDoorPort))
    ) {
      return;
    }
    await delay(50);
  }
  throw new Error(`auth door did not become ready:\n${output.join("")}`);
}

async function stopAuthChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (processExited(child)) {
    return;
  }
  signalAuthChild(child, "SIGINT");
  try {
    await waitForChildExit(child, AUTH_STOP_TIMEOUT_MS);
  } catch (error) {
    if (!processExited(child)) {
      signalAuthChild(child, "SIGKILL");
    }
    await waitForChildExit(child, AUTH_KILL_TIMEOUT_MS);
    throw error;
  }
}

function signalAuthChild(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): void {
  if (DETACH_CHILDREN && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {}
  }
  child.kill(signal);
}

function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (processExited(child)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      child.off("close", onClose);
      child.off("error", onError);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const onClose = () => finish();
    const onError = () => finish();
    const timer = globalThis.setTimeout(
      () => finish(new Error(`auth door did not exit within ${timeoutMs}ms`)),
      timeoutMs,
    );
    child.once("close", onClose);
    child.once("error", onError);
    if (processExited(child)) {
      finish();
    }
  });
}

function processExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
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
