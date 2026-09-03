import assert from "node:assert/strict";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  e2eAuthDatabaseUrl,
  sessionDoorProcessEnv,
  startAuthDoor,
  stopAuthDoor,
} from "../ba-door.js";
import {
  e2eHttpUrl,
  e2eIdentityAdminToken,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

const clientId = "zoen";
const deviceGrantType = "urn:ietf:params:oauth:grant-type:device_code";
const postgresPortFallback = 55_536;
const zoendPortFallback = 58_791;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const zoendBaseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const authDatabaseUrl = e2eAuthDatabaseUrl(postgresPortFallback);
const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
const password = "E2e-device-login-1";

const deviceRecordSchema = z.object({
  clientId: z.string().nullable(),
  deviceCode: z.string().min(1),
  expiresAt: z.date(),
  lastPolledAt: z.date().nullable(),
  pollingInterval: z.number().nullable(),
  status: z.enum(["pending", "approved", "denied"]),
  userCode: z.string().min(1),
  userId: z.string().nullable(),
});

const deviceStatusSchema = z
  .object({
    client_id: z.string().optional(),
    status: z.enum(["pending", "approved", "denied"]),
    user_code: z.string(),
  })
  .passthrough();

const errorBodySchema = z
  .object({
    error: z.string(),
  })
  .passthrough();

const oauthStartSchema = z.object({
  redirect: z.boolean(),
  url: z.url(),
});

const oauthStateSchema = z
  .object({
    callbackURL: z.string(),
    errorURL: z.string(),
    oauthState: z.string().optional(),
  })
  .passthrough();

const sessionSchema = z
  .object({
    user: z.object({
      email: z.email(),
      id: z.string().min(1),
    }),
  })
  .passthrough();

const signupSchema = z
  .object({
    user: z.object({
      email: z.email(),
      id: z.string().min(1),
    }),
  })
  .passthrough();

const credentialsSchema = z
  .object({
    sessionToken: z.string().min(1),
    zoend: z.url(),
  })
  .strict();

type DeviceRecord = z.infer<typeof deviceRecordSchema>;

type Evidence = {
  killMutant: (name: string) => void;
  record: (name: string, observed: boolean) => void;
};

type ServerProcess = {
  child: ChildProcessWithoutNullStreams;
  output: string[];
};

type AsyncCli = {
  child: ChildProcessWithoutNullStreams;
  startedAt: number;
  stderr: string[];
  stdout: string[];
};

type CliResult = {
  status: number | null;
  stderr: string;
  stdout: string;
};

type BrowserSession = {
  cookie: string;
  email: string;
};

type DeviceLink = {
  completeUrl: URL;
  userCode: string;
};

export async function runDeviceLoginJourney(
  zoenPath: string,
  evidence: Evidence,
): Promise<void> {
  const home = await mkdtemp(path.join(tmpdir(), "zoen-device-login-"));
  const credentialsPath = path.join(home, ".zoen", "credentials.json");
  const door = await startAuthDoor(authDatabaseUrl, {
    google: {
      clientId: "device-login.e2e.apps.googleusercontent.com",
      clientSecret: "device-login-e2e-secret",
    },
  });
  const authDatabase = new PostgresClient({ connectionString: authDatabaseUrl });
  let server: ServerProcess | undefined;
  let activeCli: AsyncCli | undefined;
  let completed = false;
  try {
    await authDatabase.connect();
    server = await startServer(zoenPath);
    const signedUp = await signUpThroughZoend();

    activeCli = spawnDeviceLogin(zoenPath, home);
    const deniedLink = await waitForDeviceLink(activeCli);
    const deniedRecord = await deviceRecord(authDatabase, deniedLink.userCode);
    assertPublicDeviceOutput(activeCli, deniedLink, deniedRecord.deviceCode, evidence);
    const reviewHtml = await loadDevicePage(deniedLink.completeUrl);
    assertReviewPage(reviewHtml, evidence);
    const signedIn = await signInForDevice(signedUp.email, deniedLink.completeUrl);
    const afterAuthentication = await deviceRecord(
      authDatabase,
      deniedLink.userCode,
    );
    evidence.record(
      "device_authentication_alone_stays_pending",
      afterAuthentication.status === "pending" && afterAuthentication.userId === null,
    );
    const deniedReview = await reviewDevice(signedIn.cookie, deniedLink.userCode);
    evidence.record(
      "device_review_shows_code_and_client",
      deniedReview.status === "pending" &&
        deniedReview.user_code === deniedLink.userCode &&
        deniedReview.client_id === clientId,
    );
    const account = await currentAccount(signedIn.cookie);
    evidence.record(
      "device_review_shows_account",
      account.user.email === signedUp.email,
    );
    await decideDevice("deny", signedIn.cookie, deniedLink.userCode);
    const deniedResult = await waitForCli(activeCli, 15_000);
    activeCli = undefined;
    evidence.record(
      "device_denial_reaches_waiting_cli",
      deniedResult.status === 1 && deniedResult.stderr.includes("access_denied"),
    );
    assertSecretAbsent(deniedResult, deniedRecord.deviceCode, evidence, "denial");
    await assertReplayAndCleanup(
      authDatabase,
      deniedRecord,
      "device_denial",
      evidence,
    );
    evidence.record(
      "device_denial_writes_no_credentials",
      !(await pathExists(credentialsPath)),
    );

    activeCli = spawnDeviceLogin(zoenPath, home);
    const expiredLink = await waitForDeviceLink(activeCli);
    const expiredRecord = await deviceRecord(authDatabase, expiredLink.userCode);
    assertPublicDeviceOutput(activeCli, expiredLink, expiredRecord.deviceCode, evidence);
    await expireDevice(authDatabase, expiredRecord.deviceCode);
    const expiredResult = await waitForCli(activeCli, 15_000);
    activeCli = undefined;
    evidence.record(
      "device_expiry_reaches_waiting_cli",
      expiredResult.status === 1 && expiredResult.stderr.includes("expired_token"),
    );
    assertSecretAbsent(expiredResult, expiredRecord.deviceCode, evidence, "expiry");
    await assertReplayAndCleanup(
      authDatabase,
      expiredRecord,
      "device_expiry",
      evidence,
    );
    evidence.record(
      "device_expiry_writes_no_credentials",
      !(await pathExists(credentialsPath)),
    );

    activeCli = spawnDeviceLogin(zoenPath, home);
    const approvedLink = await waitForDeviceLink(activeCli);
    const approvedRecord = await deviceRecord(authDatabase, approvedLink.userCode);
    assertPublicDeviceOutput(activeCli, approvedLink, approvedRecord.deviceCode, evidence);
    const firstPoll = await pollDeviceToken(approvedRecord.deviceCode);
    evidence.record(
      "device_real_better_auth_pending",
      firstPoll.response.status === 400 &&
        errorBodySchema.parse(firstPoll.body).error === "authorization_pending",
    );
    await setPollingInterval(authDatabase, approvedRecord.deviceCode, 60_000);
    const earlyPoll = await pollDeviceToken(approvedRecord.deviceCode);
    evidence.record(
      "device_real_better_auth_slow_down",
      earlyPoll.response.status === 400 &&
        errorBodySchema.parse(earlyPoll.body).error === "slow_down",
    );
    await assertGoogleReturnState(
      authDatabase,
      signedIn.cookie,
      approvedLink.completeUrl,
      evidence,
    );
    const approvedReview = await reviewDevice(
      signedIn.cookie,
      approvedLink.userCode,
    );
    evidence.record(
      "device_approval_still_requires_explicit_action",
      approvedReview.status === "pending",
    );
    await decideDevice("approve", signedIn.cookie, approvedLink.userCode);
    const approved = await deviceRecord(authDatabase, approvedLink.userCode);
    evidence.record("device_explicit_approve_succeeds", approved.status === "approved");

    const firstCliPollAt =
      activeCli.startedAt + (approvedRecord.pollingInterval ?? 5_000) + 1_500;
    await delay(Math.max(0, firstCliPollAt - Date.now()));
    evidence.record(
      "device_cli_survives_slow_down",
      activeCli.child.exitCode === null,
    );
    await setPollingInterval(authDatabase, approvedRecord.deviceCode, 1);
    const approvedResult = await waitForCli(activeCli, 30_000);
    const approvedElapsedMs = Date.now() - activeCli.startedAt;
    activeCli = undefined;
    evidence.record(
      "device_login_waits_for_approval",
      approvedResult.status === 0 &&
        approvedResult.stdout.trim() === '{"loggedIn":true}',
    );
    evidence.record(
      "device_cli_backs_off_after_slow_down",
      approvedElapsedMs >= 13_000,
    );

    const credentialsText = await readFile(credentialsPath, "utf8");
    const credentialsValue: unknown = JSON.parse(credentialsText);
    const credentials = credentialsSchema.parse(credentialsValue);
    evidence.record(
      "device_credentials_store_has_origin_and_session",
      credentials.zoend === zoendBaseUrl && credentials.sessionToken.length > 0,
    );
    const credentialsStat = await stat(credentialsPath);
    evidence.record(
      "device_credentials_mode_0600",
      (credentialsStat.mode & 0o777) === 0o600,
    );
    const credentialsDirectoryStat = await stat(path.dirname(credentialsPath));
    evidence.record(
      "device_credentials_directory_mode_0700",
      (credentialsDirectoryStat.mode & 0o777) === 0o700,
    );
    const storeEntries = await readdir(path.dirname(credentialsPath));
    evidence.record(
      "device_credentials_atomic_no_temp_leftovers",
      storeEntries.length === 1 && storeEntries[0] === "credentials.json",
    );
    assertSecretAbsent(
      approvedResult,
      approvedRecord.deviceCode,
      evidence,
      "approval",
      credentials.sessionToken,
    );
    await assertReplayAndCleanup(
      authDatabase,
      approvedRecord,
      "device_approval",
      evidence,
    );
    evidence.record(
      "device_persisted_session_is_live",
      (await sessionCount(authDatabase, credentials.sessionToken)) === 1,
    );

    const firstServerPid = server.child.pid;
    await stopServer(server);
    server = await startServer(zoenPath);
    evidence.record(
      "device_zoend_restarted",
      firstServerPid !== undefined && server.child.pid !== firstServerPid,
    );
    const query = runPersistedSessionQuery(zoenPath, home);
    evidence.record(
      "device_normal_cli_uses_persisted_session_after_restart",
      query.status === 1 &&
        query.stderr.includes("subject has no verified binding") &&
        !query.stderr.includes("ZOEN_BEARER is required"),
    );
    evidence.killMutant("device complete link approves before explicit consent");
    evidence.killMutant("device login prints or forgets its session secret");
    evidence.killMutant("device token survives denial expiry or replay");
    evidence.killMutant("normal CLI ignores persisted device session");
    completed = true;
  } finally {
    if (activeCli?.child.exitCode === null) {
      activeCli.child.kill("SIGTERM");
      await once(activeCli.child, "exit");
    }
    if (server !== undefined) {
      await stopServer(server);
    }
    await authDatabase.end().catch(() => undefined);
    await stopAuthDoor(door);
    await rm(home, { force: true, recursive: true });
  }
  evidence.record(
    "device_login_cleanup_removes_home",
    completed && !(await pathExists(home)),
  );
}

function spawnDeviceLogin(zoenPath: string, home: string): AsyncCli {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(zoenPath, ["auth", "login", "--device"], {
    env: isolatedCliEnv(home),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  return { child, startedAt: Date.now(), stderr, stdout };
}

async function waitForDeviceLink(cli: AsyncCli): Promise<DeviceLink> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const output = cli.stderr.join("");
    const match = /Open (https?:\/\/\S+)/.exec(output);
    const rawUrl = match?.[1];
    if (rawUrl !== undefined) {
      const completeUrl = new URL(rawUrl);
      const userCode = completeUrl.searchParams.get("user_code");
      assert.ok(userCode, "device link must contain user_code");
      return { completeUrl, userCode };
    }
    if (cli.child.exitCode !== null) {
      throw new Error("device CLI exited before printing its public link");
    }
    await delay(50);
  }
  throw new Error("device CLI did not print its public link");
}

async function waitForCli(cli: AsyncCli, timeoutMs: number): Promise<CliResult> {
  const deadline = Date.now() + timeoutMs;
  while (cli.child.exitCode === null && Date.now() < deadline) {
    await delay(50);
  }
  if (cli.child.exitCode === null) {
    cli.child.kill("SIGTERM");
    await once(cli.child, "exit");
    throw new Error("device CLI did not exit before the journey deadline");
  }
  return {
    status: cli.child.exitCode,
    stderr: cli.stderr.join(""),
    stdout: cli.stdout.join(""),
  };
}

function assertPublicDeviceOutput(
  cli: AsyncCli,
  link: DeviceLink,
  deviceCode: string,
  evidence: Evidence,
): void {
  const stderr = cli.stderr.join("");
  evidence.record(
    "device_cli_prints_complete_public_link",
    link.completeUrl.origin === zoendBaseUrl &&
      link.completeUrl.searchParams.get("user_code") === link.userCode &&
      stderr.trim() === `Open ${link.completeUrl.toString()}`,
  );
  evidence.record("device_cli_stdout_empty_while_waiting", cli.stdout.join("") === "");
  evidence.record(
    "device_cli_never_prints_device_code",
    !stderr.includes(deviceCode) && !cli.stdout.join("").includes(deviceCode),
  );
}

function assertSecretAbsent(
  result: CliResult,
  deviceCode: string,
  evidence: Evidence,
  flow: string,
  sessionToken?: string,
): void {
  const output = `${result.stdout}\n${result.stderr}`;
  evidence.record(
    `device_${flow}_output_has_no_secrets`,
    !output.includes(deviceCode) &&
      !output.includes("deviceCode") &&
      !output.includes("sessionToken") &&
      (sessionToken === undefined || !output.includes(sessionToken)),
  );
}

function assertReviewPage(html: string, evidence: Evidence): void {
  evidence.record(
    "device_complete_page_has_review_fields",
    html.includes('id="device-code"') &&
      html.includes('id="device-client"') &&
      html.includes('id="device-account"'),
  );
  evidence.record(
    "device_complete_page_has_explicit_approve_and_deny",
    html.includes('id="device-approve"') &&
      html.includes('id="device-deny"') &&
      html.includes("/api/auth/device/approve") &&
      html.includes("/api/auth/device/deny"),
  );
  evidence.record(
    "device_complete_page_preserves_auth_return",
    html.includes("callbackURL") && html.includes("errorCallbackURL"),
  );
  evidence.record(
    "device_complete_page_does_not_autoapprove",
    !html.includes("deviceApprove(deviceQueryCode)"),
  );
}

async function loadDevicePage(completeUrl: URL): Promise<string> {
  const url = throughZoend(completeUrl);
  const response = await fetch(url, { redirect: "manual" });
  assert.equal(response.status, 200, "complete device page status");
  return response.text();
}

async function signUpThroughZoend(): Promise<BrowserSession> {
  const email = `device-${randomUUID()}@e2e.invalid`;
  const response = await fetch(`${zoendBaseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: "Device login", password }),
    headers: jsonHeaders(),
    method: "POST",
  });
  const body = signupSchema.parse(await readJson(response));
  assert.equal(response.status, 200, "device sign-up status");
  assert.equal(body.user.email, email, "device sign-up account");
  return { cookie: sessionCookie(response), email };
}

async function signInForDevice(
  email: string,
  completeUrl: URL,
): Promise<BrowserSession> {
  const callbackURL = pathAndQuery(completeUrl);
  const response = await fetch(`${zoendBaseUrl}/api/auth/sign-in/email`, {
    body: JSON.stringify({ callbackURL, email, password }),
    headers: jsonHeaders(),
    method: "POST",
  });
  await readJson(response);
  assert.equal(response.status, 200, "device email sign-in status");
  return { cookie: sessionCookie(response), email };
}

async function currentAccount(cookie: string): Promise<z.infer<typeof sessionSchema>> {
  const response = await fetch(`${zoendBaseUrl}/api/auth/get-session`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200, "device account session status");
  return sessionSchema.parse(await readJson(response));
}

async function reviewDevice(
  cookie: string,
  userCode: string,
): Promise<z.infer<typeof deviceStatusSchema>> {
  const response = await fetch(
    `${zoendBaseUrl}/api/auth/device?user_code=${encodeURIComponent(userCode)}`,
    { headers: { cookie } },
  );
  assert.equal(response.status, 200, "device review status");
  return deviceStatusSchema.parse(await readJson(response));
}

async function decideDevice(
  decision: "approve" | "deny",
  cookie: string,
  userCode: string,
): Promise<void> {
  const response = await fetch(`${zoendBaseUrl}/api/auth/device/${decision}`, {
    body: JSON.stringify({ userCode }),
    headers: { ...jsonHeaders(), cookie },
    method: "POST",
  });
  await readJson(response);
  assert.equal(response.status, 200, `device ${decision} status`);
}

async function pollDeviceToken(
  deviceCode: string,
): Promise<{ body: unknown; response: Response }> {
  const response = await fetch(`${zoendBaseUrl}/api/auth/device/token`, {
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: deviceGrantType,
    }),
    headers: jsonHeaders(),
    method: "POST",
  });
  return { body: await readJson(response), response };
}

async function assertGoogleReturnState(
  authDatabase: PostgresClient,
  cookie: string,
  completeUrl: URL,
  evidence: Evidence,
): Promise<void> {
  const callbackURL = pathAndQuery(completeUrl);
  const response = await fetch(`${zoendBaseUrl}/api/auth/sign-in/social`, {
    body: JSON.stringify({
      callbackURL,
      disableRedirect: true,
      errorCallbackURL: callbackURL,
      provider: "google",
    }),
    headers: { ...jsonHeaders(), cookie },
    method: "POST",
    redirect: "manual",
  });
  assert.equal(response.status, 200, "Google device sign-in start status");
  const started = oauthStartSchema.parse(await readJson(response));
  const providerUrl = new URL(started.url);
  const state = providerUrl.searchParams.get("state");
  assert.ok(state, "Google authorization URL must contain state");
  evidence.record(
    "device_google_uses_real_better_auth_redirect",
    started.redirect === false && providerUrl.hostname === "accounts.google.com",
  );
  const result = await authDatabase.query(
    'SELECT value FROM verification WHERE identifier = $1',
    [state],
  );
  const row: unknown = result.rows[0];
  const storedRow = z.object({ value: z.string() }).parse(row);
  const storedValue: unknown = JSON.parse(storedRow.value);
  const stored = oauthStateSchema.parse(storedValue);
  evidence.record(
    "device_google_preserves_exact_review_return",
    stored.callbackURL === callbackURL && stored.errorURL === callbackURL,
  );
  await authDatabase.query('DELETE FROM verification WHERE identifier = $1', [state]);
}

async function deviceRecord(
  authDatabase: PostgresClient,
  userCode: string,
): Promise<DeviceRecord> {
  const result = await authDatabase.query(
    `SELECT
       "clientId" AS "clientId",
       "deviceCode" AS "deviceCode",
       "expiresAt" AS "expiresAt",
       "lastPolledAt" AS "lastPolledAt",
       "pollingInterval" AS "pollingInterval",
       status,
       "userCode" AS "userCode",
       "userId" AS "userId"
     FROM "deviceCode"
     WHERE "userCode" = $1`,
    [userCode],
  );
  assert.equal(result.rows.length, 1, "device record count");
  const row: unknown = result.rows[0];
  return deviceRecordSchema.parse(row);
}

async function expireDevice(
  authDatabase: PostgresClient,
  deviceCode: string,
): Promise<void> {
  const result = await authDatabase.query(
    `UPDATE "deviceCode"
        SET "expiresAt" = NOW() - INTERVAL '1 second'
      WHERE "deviceCode" = $1`,
    [deviceCode],
  );
  assert.equal(result.rowCount, 1, "expire device row count");
}

async function setPollingInterval(
  authDatabase: PostgresClient,
  deviceCode: string,
  intervalMs: number,
): Promise<void> {
  const result = await authDatabase.query(
    `UPDATE "deviceCode"
        SET "pollingInterval" = $2
      WHERE "deviceCode" = $1`,
    [deviceCode, intervalMs],
  );
  assert.equal(result.rowCount, 1, "set device polling interval row count");
}

async function assertReplayAndCleanup(
  authDatabase: PostgresClient,
  record: DeviceRecord,
  name: string,
  evidence: Evidence,
): Promise<void> {
  const replay = await pollDeviceToken(record.deviceCode);
  evidence.record(
    `${name}_replay_is_invalid_grant`,
    replay.response.status === 400 &&
      errorBodySchema.parse(replay.body).error === "invalid_grant",
  );
  const result = await authDatabase.query(
    'SELECT count(*)::int AS count FROM "deviceCode" WHERE "deviceCode" = $1',
    [record.deviceCode],
  );
  const row: unknown = result.rows[0];
  evidence.record(
    `${name}_removes_device_row`,
    z.object({ count: z.number() }).parse(row).count === 0,
  );
}

async function sessionCount(
  authDatabase: PostgresClient,
  sessionToken: string,
): Promise<number> {
  const unsignedToken = unsignedSessionToken(sessionToken);
  const result = await authDatabase.query(
    'SELECT count(*)::int AS count FROM session WHERE token = $1 OR token = $2',
    [sessionToken, unsignedToken],
  );
  const row: unknown = result.rows[0];
  return z.object({ count: z.number() }).parse(row).count;
}

function unsignedSessionToken(token: string): string {
  const separator = token.lastIndexOf(".");
  return separator > 0 ? token.slice(0, separator) : token;
}

async function startServer(zoenPath: string): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(zoenPath, ["serve"], {
    cwd: process.cwd(),
    env: sessionDoorProcessEnv({
      applicationDatabaseUrl,
      authDatabaseUrl,
      extra: {
        ZOEN_CEDAR_POLICY_MANIFEST: path.join(
          process.cwd(),
          "deploy",
          "fly",
          "policies.json",
        ),
        ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
        ZOEN_LISTEN_ADDR: e2eListenAddr(
          "ZOEN_E2E_ZOEND_PORT",
          zoendPortFallback,
        ),
      },
    }),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during startup:\n${output.join("")}`);
    }
    if (await portOpen(zoendPort)) {
      return { child, output };
    }
    await delay(100);
  }
  throw new Error(`zoend did not listen on port ${zoendPort}`);
}

async function stopServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode === null) {
    server.child.kill("SIGINT");
    await once(server.child, "exit");
  }
  assert.equal(
    server.child.exitCode,
    0,
    `zoend failed during shutdown:\n${server.output.join("")}`,
  );
}

function runPersistedSessionQuery(zoenPath: string, home: string): CliResult {
  const result = spawnSync(
    zoenPath,
    ["world", "query", "--type", "inventory.Item"],
    {
      encoding: "utf8",
      env: isolatedCliEnv(home, {
        ZOEN_DEFINITION_DIGEST: "dead",
        ZOEN_DEFINITION_ID: "inventory.definition",
        ZOEN_DEFINITION_REVISION: "1",
        ZOEN_TENANT: "tenant.a",
        ZOEN_VALID_AT: "2026-01-15T00:00:00Z",
      }),
      timeout: 10_000,
    },
  );
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function isolatedCliEnv(
  home: string,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    ZOEN_ZOEND: zoendBaseUrl,
    ...extra,
  };
  delete env.ZOEN_BEARER;
  delete env.ZOEN_PASSWORD;
  return env;
}

function jsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    origin: zoendBaseUrl,
  };
}

function sessionCookie(response: Response): string {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0];
    if (pair?.split("=")[0]?.trim().endsWith("session_token")) {
      return pair;
    }
  }
  throw new Error("Better Auth response is missing its session cookie");
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const value: unknown = JSON.parse(text);
  return value;
}

function throughZoend(url: URL): URL {
  return new URL(`${url.pathname}${url.search}`, zoendBaseUrl);
}

function pathAndQuery(url: URL): string {
  return `${url.pathname}${url.search}`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
