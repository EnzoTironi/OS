import assert from "node:assert/strict";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomUUID } from "node:crypto";
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
  AUTH_DOOR_ORIGIN,
  e2eAuthDatabaseUrl,
  sessionDoorProcessEnv,
  startAuthDoor,
  stopAuthDoor,
} from "../ba-door.js";
import {
  startBrowser,
  stopBrowser,
  waitForCondition,
  waitForText,
  type BrowserProcess,
  type CdpPage,
} from "../chromium-cdp.js";
import {
  processExited,
  stopChild as stopProcess,
} from "../child-process.js";
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
const secondaryZoendPortFallback = 58_792;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const zoendBaseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const secondaryZoendPort = e2ePort(
  "ZOEN_E2E_SECOND_ZOEND_PORT",
  secondaryZoendPortFallback,
);
const secondaryZoendBaseUrl = e2eHttpUrl(
  "ZOEN_E2E_SECOND_ZOEND_PORT",
  secondaryZoendPortFallback,
);
const authDoorPort = Number(new URL(AUTH_DOOR_ORIGIN).port);
const authDatabaseUrl = e2eAuthDatabaseUrl(postgresPortFallback);
const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
const accountCredential = `E2e-${randomUUID()}-Aa1!`;

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

const errorBodySchema = z
  .object({
    error: z.string(),
    error_description: z.string(),
  })
  .passthrough();

const cliDiagnosticSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .strict();

const oauthStateSchema = z
  .object({
    callbackURL: z.string(),
    errorURL: z.string(),
    oauthState: z.string().optional(),
  })
  .passthrough();

const googleRequestSchema = z.object({
  request: z.object({
    url: z.url(),
  }),
  requestId: z.string().min(1),
});

const browserLocationSchema = z.object({
  inputCode: z.string().min(1),
  origin: z.url(),
  userCode: z.string().min(1),
});

const browserReviewSchema = z.object({
  account: z.string().min(1),
  approveVisible: z.boolean(),
  client: z.string().min(1),
  code: z.string().min(1),
  denyVisible: z.boolean(),
});

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
  signal: NodeJS.Signals | null;
  status: number | null;
  stderr: string;
  stdout: string;
};

type SignedUpAccount = {
  email: string;
  userId: string;
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
  let door: Awaited<ReturnType<typeof startAuthDoor>> | undefined;
  let doorStopped = false;
  let authDatabase: PostgresClient | undefined;
  let server: ServerProcess | undefined;
  let secondaryServer: ServerProcess | undefined;
  let browser: BrowserProcess | undefined;
  let activeCli: AsyncCli | undefined;
  let completed = false;
  try {
    await assertFailedAuthDoorStartupCleansUp(authDatabaseUrl, evidence);
    door = await startAuthDoor(authDatabaseUrl, {
      device: {
        expiresInSeconds: 3,
        pollIntervalSeconds: 1,
      },
    });
    authDatabase = new PostgresClient({ connectionString: authDatabaseUrl });
    await authDatabase.connect();
    server = await startServer(zoenPath);

    activeCli = spawnDeviceLogin(zoenPath, home);
    const expiredLink = await waitForDeviceLink(activeCli);
    const expiredRecord = await deviceRecord(authDatabase, expiredLink.userCode);
    assertPublicDeviceOutput(activeCli, expiredLink, expiredRecord.deviceCode, evidence);
    evidence.record(
      "device_better_auth_non_default_expiry_and_interval",
      expiredRecord.expiresAt.getTime() - activeCli.startedAt >= 2_500 &&
        expiredRecord.expiresAt.getTime() - activeCli.startedAt <= 4_000 &&
        expiredRecord.pollingInterval === 1_000,
    );
    const expiredResult = await waitForCli(activeCli, 8_000);
    const expiredElapsedMs = Date.now() - activeCli.startedAt;
    activeCli = undefined;
    const expiredDiagnostic = cliDiagnostic(expiredResult);
    evidence.record(
      "device_expiry_reaches_waiting_cli",
      expiredResult.status === 1 &&
        expiredResult.signal === null &&
        expiredDiagnostic.code === "timed_out" &&
        (expiredDiagnostic.message === "Device code has expired" ||
          expiredDiagnostic.message ===
            "device authorization expired before approval"),
    );
    evidence.record(
      "device_cli_honors_non_default_expires_in",
      expiredElapsedMs >= 2_500 && expiredElapsedMs <= 6_000,
    );
    evidence.record(
      "device_expiry_hides_upstream_error_body",
      !expiredResult.stderr.includes("error_description") &&
        !expiredResult.stderr.includes('\\"error\\"'),
    );
    assertSecretAbsent(expiredResult, expiredRecord.deviceCode, evidence, "expiry");
    await assertExpiryAndReplayCleanup(
      authDatabase,
      expiredRecord,
      expiredDiagnostic.message === "Device code has expired",
      evidence,
    );
    evidence.record(
      "device_expiry_writes_no_credentials",
      !(await pathExists(credentialsPath)),
    );

    await stopAuthDoor(door);
    doorStopped = true;
    door = await startAuthDoor(authDatabaseUrl, {
      google: {
        clientId: "device-login.e2e.apps.googleusercontent.com",
        clientSecret: "device-login-e2e-secret",
      },
    });
    doorStopped = false;
    browser = await startBrowser(home);
    await assertInvalidClientRejected(evidence);
    const signedUp = await signUpThroughZoend();

    activeCli = spawnDeviceLogin(zoenPath, home);
    const deniedLink = await waitForDeviceLink(activeCli);
    const deniedRecord = await deviceRecord(authDatabase, deniedLink.userCode);
    assertPublicDeviceOutput(activeCli, deniedLink, deniedRecord.deviceCode, evidence);
    await openAndSignInDeviceReview(
      browser.page,
      deniedLink,
      signedUp.email,
      "denial",
      true,
      evidence,
    );
    const afterAuthentication = await deviceRecord(
      authDatabase,
      deniedLink.userCode,
    );
    evidence.record(
      "device_authentication_alone_stays_pending",
      afterAuthentication.status === "pending" &&
        afterAuthentication.userId === signedUp.userId,
    );
    await clickDeviceDecision(browser.page, "deny");
    await waitForText(browser.page, "#device-result", "negada", 10_000);
    const deniedResult = await waitForCli(activeCli, 15_000);
    activeCli = undefined;
    const deniedDiagnostic = cliDiagnostic(deniedResult);
    evidence.record(
      "device_denial_reaches_waiting_cli",
      deniedResult.status === 1 &&
        deniedResult.signal === null &&
        deniedDiagnostic.code === "permission_denied" &&
        deniedDiagnostic.message === "Access denied",
    );
    evidence.record(
      "device_denial_hides_upstream_error_body",
      !deniedResult.stderr.includes("error_description") &&
        !deniedResult.stderr.includes('\\"error\\"'),
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
    const approvedLink = await waitForDeviceLink(activeCli);
    const approvedRecord = await deviceRecord(authDatabase, approvedLink.userCode);
    assertPublicDeviceOutput(activeCli, approvedLink, approvedRecord.deviceCode, evidence);
    evidence.record(
      "device_better_auth_default_timing_is_1800_and_5_seconds",
      approvedRecord.expiresAt.getTime() - activeCli.startedAt >= 1_799_000 &&
        approvedRecord.expiresAt.getTime() - activeCli.startedAt <= 1_802_000 &&
        approvedRecord.pollingInterval === 5_000,
    );
    await delayUntil(activeCli.startedAt + 2_000);
    const independentPoll = await pollDeviceToken(approvedRecord.deviceCode);
    const independentlyPolledRecord = await deviceRecord(
      authDatabase,
      approvedLink.userCode,
    );
    evidence.record(
      "device_real_better_auth_pending",
      independentPoll.response.status === 400 &&
        errorBodySchema.parse(independentPoll.body).error ===
          "authorization_pending" &&
        independentlyPolledRecord.lastPolledAt !== null,
    );
    const pollAfterSlowDown = await waitForNextPoll(
      authDatabase,
      approvedRecord.deviceCode,
      independentlyPolledRecord.lastPolledAt,
      18_000,
    );
    evidence.record(
      "device_real_better_auth_slow_down",
      independentlyPolledRecord.lastPolledAt !== null &&
        pollAfterSlowDown.getTime() -
          independentlyPolledRecord.lastPolledAt.getTime() >=
          10_000,
    );
    evidence.record(
      "device_cli_survives_slow_down",
      !processExited(activeCli.child),
    );
    await openAndSignInDeviceReview(
      browser.page,
      approvedLink,
      signedUp.email,
      "approval_authenticated",
      false,
      evidence,
    );
    const authenticatedReview = await deviceRecord(
      authDatabase,
      approvedLink.userCode,
    );
    evidence.record(
      "device_authenticated_complete_link_stays_pending",
      authenticatedReview.status === "pending" &&
        authenticatedReview.userId === signedUp.userId,
    );
    await assertGoogleReturnState(
      authDatabase,
      browser.page,
      approvedLink,
      evidence,
    );
    await openAndSignInDeviceReview(
      browser.page,
      approvedLink,
      signedUp.email,
      "google_return",
      true,
      evidence,
    );
    const approvedReview = await deviceRecord(
      authDatabase,
      approvedLink.userCode,
    );
    evidence.record(
      "device_approval_still_requires_explicit_action",
      approvedReview.status === "pending" &&
        approvedReview.userId === signedUp.userId,
    );

    const legacyClientDeadline = new Date(activeCli.startedAt + 121_000);
    await delayUntil(legacyClientDeadline.getTime());
    const lastPoll = await waitForNextPoll(
      authDatabase,
      approvedRecord.deviceCode,
      legacyClientDeadline,
      15_000,
    );
    evidence.record(
      "device_cli_honors_server_expires_in_beyond_120_seconds",
      !processExited(activeCli.child) &&
        lastPoll.getTime() > activeCli.startedAt + 121_000,
    );

    const approvedAt = Date.now();
    await clickDeviceDecision(browser.page, "approve");
    await waitForText(browser.page, "#device-result", "aparelho entrou", 10_000);
    const approved = await deviceRecord(authDatabase, approvedLink.userCode);
    evidence.record("device_explicit_approve_succeeds", approved.status === "approved");

    const approvedResult = await waitForCli(activeCli, 45_000);
    const approvalDelayMs = Date.now() - approvedAt;
    activeCli = undefined;
    evidence.record(
      "device_login_waits_for_approval",
      approvedResult.status === 0 &&
        approvedResult.stdout.trim() === '{"loggedIn":true}',
    );
    evidence.record(
      "device_cli_backs_off_after_slow_down",
      approvalDelayMs >= 8_000,
    );
    evidence.record(
      "device_login_finishes_before_server_expiry",
      Date.now() < approvedRecord.expiresAt.getTime(),
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

    secondaryServer = await startServer(
      zoenPath,
      secondaryZoendPort,
      e2eListenAddr("ZOEN_E2E_SECOND_ZOEND_PORT", secondaryZoendPortFallback),
    );
    evidence.record(
      "device_second_real_zoend_is_live",
      secondaryServer.child.pid !== undefined &&
        secondaryServer.child.pid !== server.child.pid &&
        (await portOpen(secondaryZoendPort)),
    );
    const wrongOriginQuery = runPersistedSessionQuery(
      zoenPath,
      home,
      secondaryZoendBaseUrl,
    );
    evidence.record(
      "device_credentials_are_scoped_to_exact_zoend_origin",
      wrongOriginQuery.status === 2 &&
        wrongOriginQuery.signal === null &&
        wrongOriginQuery.stderr.includes(
          "authentication is required for ZOEN_ZOEND",
        ) &&
        !wrongOriginQuery.stderr.includes("subject has no verified binding") &&
        (await readFile(credentialsPath, "utf8")) === credentialsText,
    );
    await stopServer(secondaryServer);
    secondaryServer = undefined;

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

    activeCli = spawnDeviceLogin(zoenPath, home);
    const unavailableLink = await waitForDeviceLink(activeCli);
    const unavailableRecord = await deviceRecord(
      authDatabase,
      unavailableLink.userCode,
    );
    assertPublicDeviceOutput(
      activeCli,
      unavailableLink,
      unavailableRecord.deviceCode,
      evidence,
    );
    await stopAuthDoor(door);
    doorStopped = true;
    const unavailableResult = await waitForCli(activeCli, 30_000);
    activeCli = undefined;
    const unavailableOutput = `${unavailableResult.stdout}\n${unavailableResult.stderr}`;
    evidence.record(
      "device_cli_bounds_auth_door_unavailable_retries",
      unavailableResult.status === 1 &&
        (unavailableOutput.includes('"code":"not_connected"') ||
          unavailableOutput.includes("server unavailable")),
    );
    assertSecretAbsent(
      unavailableResult,
      unavailableRecord.deviceCode,
      evidence,
      "door_unavailable",
    );
    const unavailableCleanup = await authDatabase.query(
      'DELETE FROM "deviceCode" WHERE "deviceCode" = $1',
      [unavailableRecord.deviceCode],
    );
    const entriesAfterUnavailable = await readdir(path.dirname(credentialsPath));
    evidence.record(
      "device_door_unavailable_cleans_device_and_partial_credentials",
      unavailableCleanup.rowCount === 1 &&
        entriesAfterUnavailable.length === 1 &&
        entriesAfterUnavailable[0] === "credentials.json" &&
        (await readFile(credentialsPath, "utf8")) === credentialsText,
    );
    evidence.killMutant("device complete link approves before explicit consent");
    evidence.killMutant("device login prints or forgets its session secret");
    evidence.killMutant("device token survives denial expiry or replay");
    evidence.killMutant("normal CLI ignores persisted device session");
    evidence.killMutant("device login retries a failed auth door forever");
    completed = true;
  } finally {
    const cleanupErrors: unknown[] = [];
    if (activeCli !== undefined) {
      await stopProcess(activeCli.child, "SIGTERM", "device CLI").catch(
        (error: unknown) => {
          cleanupErrors.push(error);
        },
      );
    }
    if (browser !== undefined) {
      await stopBrowser(browser).catch((error: unknown) => {
        cleanupErrors.push(error);
      });
    }
    if (secondaryServer !== undefined) {
      await stopServer(secondaryServer).catch((error: unknown) => {
        cleanupErrors.push(error);
      });
    }
    if (server !== undefined) {
      await stopServer(server).catch((error: unknown) => {
        cleanupErrors.push(error);
      });
    }
    await authDatabase?.end().catch((error: unknown) => {
      cleanupErrors.push(error);
    });
    if (door !== undefined && !doorStopped) {
      await stopAuthDoor(door).catch((error: unknown) => {
        cleanupErrors.push(error);
      });
    }
    await rm(home, { force: true, recursive: true }).catch((error: unknown) => {
      cleanupErrors.push(error);
    });
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "device login journey cleanup failed");
    }
  }
  evidence.record(
    "device_login_cleanup_removes_home",
    completed && !(await pathExists(home)),
  );
}

async function assertFailedAuthDoorStartupCleansUp(
  databaseUrl: string,
  evidence: Evidence,
): Promise<void> {
  const processesBefore = authDoorProcessIds();
  let startupError: unknown;
  let unexpectedDoor: Awaited<ReturnType<typeof startAuthDoor>> | undefined;
  try {
    unexpectedDoor = await startAuthDoor(databaseUrl, {
      readinessTimeoutMs: 0,
    });
  } catch (error) {
    startupError = error;
  } finally {
    if (unexpectedDoor !== undefined) {
      await stopAuthDoor(unexpectedDoor);
    }
  }
  evidence.record(
    "auth_door_failed_startup_is_reported",
    startupError instanceof Error &&
      startupError.message.includes("did not become ready"),
  );
  evidence.record(
    "auth_door_failed_startup_cleans_child_and_listener",
    await waitForAuthDoorCleanup(processesBefore, 5_000),
  );
}

async function waitForAuthDoorCleanup(
  expectedProcessIds: readonly number[],
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let quietSince: number | undefined;
  while (Date.now() < deadline) {
    const quiet =
      !(await portOpen(authDoorPort)) &&
      sameNumbers(authDoorProcessIds(), expectedProcessIds);
    if (quiet) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= 300) {
        return true;
      }
    } else {
      quietSince = undefined;
    }
    await delay(50);
  }
  return false;
}

function authDoorProcessIds(): number[] {
  const result = spawnSync(
    "/bin/ps",
    ["-ax", "-o", "pid=", "-o", "command="],
    { encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    `could not inspect auth door processes: ${result.stderr}`,
  );
  const marker = path.join(
    process.cwd(),
    "apps",
    "auth",
    "src",
    "server.ts",
  );
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .filter((line) => line.includes(marker) && line.includes("--import tsx"))
    .map((line) => Number.parseInt(line.trimStart(), 10))
    .filter(Number.isSafeInteger)
    .sort((left, right) => left - right);
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
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
    if (processExited(cli.child)) {
      throw new Error("device CLI exited before printing its public link");
    }
    await delay(50);
  }
  throw new Error("device CLI did not print its public link");
}

async function waitForCli(cli: AsyncCli, timeoutMs: number): Promise<CliResult> {
  const deadline = Date.now() + timeoutMs;
  while (!processExited(cli.child) && Date.now() < deadline) {
    await delay(50);
  }
  if (!processExited(cli.child)) {
    await stopProcess(cli.child, "SIGTERM", "device CLI");
    throw new Error("device CLI did not exit before the journey deadline");
  }
  return {
    signal: cli.child.signalCode,
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

function cliDiagnostic(result: CliResult): z.infer<typeof cliDiagnosticSchema> {
  const lines = result.stderr.trim().split(/\r?\n/);
  const lastLine = lines.at(-1);
  assert.ok(lastLine, "device CLI must print a final diagnostic");
  const value: unknown = JSON.parse(lastLine);
  return cliDiagnosticSchema.parse(value);
}

async function signUpThroughZoend(): Promise<SignedUpAccount> {
  const email = `device-${randomUUID()}@e2e.invalid`;
  const response = await fetch(`${zoendBaseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email,
      name: "Device login",
      password: accountCredential,
    }),
    headers: jsonHeaders(),
    method: "POST",
  });
  const body = signupSchema.parse(await readJson(response));
  assert.equal(response.status, 200, "device sign-up status");
  assert.equal(body.user.email, email, "device sign-up account");
  return { email, userId: body.user.id };
}

async function openAndSignInDeviceReview(
  page: CdpPage,
  link: DeviceLink,
  email: string,
  flow: "approval_authenticated" | "denial" | "google_return",
  expectedSignIn: boolean,
  evidence: Evidence,
): Promise<void> {
  await page.navigate(throughZoend(link.completeUrl).toString());
  await waitForCondition(
    page,
    `(() => {
      const signIn = document.querySelector("#device-signin");
      const review = document.querySelector("#device-review");
      return (signIn instanceof HTMLElement && !signIn.hidden) ||
        (review instanceof HTMLElement && !review.hidden);
    })()`,
    10_000,
    "device sign-in or review panel",
  );
  const location = browserLocationSchema.parse(
    await page.evaluate(`({
      inputCode: document.querySelector("#user_code") instanceof HTMLInputElement
        ? document.querySelector("#user_code").value
        : "",
      origin: location.origin,
      userCode: new URLSearchParams(location.search).get("user_code")
    })`),
  );
  evidence.record(
    `device_${flow}_browser_opens_complete_link`,
    location.origin === zoendBaseUrl &&
      location.userCode === link.userCode &&
      location.inputCode === link.userCode,
  );

  const needsSignIn = z.boolean().parse(
    await page.evaluate(`(() => {
      const panel = document.querySelector("#device-signin");
      return panel instanceof HTMLElement && !panel.hidden;
    })()`),
  );
  evidence.record(
    `device_${flow}_has_expected_signin_state`,
    needsSignIn === expectedSignIn,
  );
  assert.equal(
    needsSignIn,
    expectedSignIn,
    `device ${flow} sign-in state`,
  );
  const submitted = !needsSignIn || z.boolean().parse(
    await page.evaluate(`(() => {
      const panel = document.querySelector("#device-signin");
      const email = panel?.querySelector('input[name="email"]');
      const password = panel?.querySelector('input[name="password"]');
      const submit = panel?.querySelector('button[type="submit"]');
      if (
        !(email instanceof HTMLInputElement) ||
        !(password instanceof HTMLInputElement) ||
        !(submit instanceof HTMLButtonElement)
      ) {
        return false;
      }
      email.value = ${JSON.stringify(email)};
      email.dispatchEvent(new Event("input", { bubbles: true }));
      password.value = ${JSON.stringify(accountCredential)};
      password.dispatchEvent(new Event("input", { bubbles: true }));
      submit.click();
      return true;
    })()`),
  );
  assert.ok(submitted, "device email form must be present");

  await waitForCondition(
    page,
    `(() => {
      const review = document.querySelector("#device-review");
      return review instanceof HTMLElement && !review.hidden;
    })()`,
    10_000,
    "device review panel",
  );
  const review = browserReviewSchema.parse(
    await page.evaluate(`(() => {
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? "";
      const visible = (selector) => {
        const element = document.querySelector(selector);
        return element instanceof HTMLElement && !element.hidden;
      };
      return {
        account: text("#device-account"),
        approveVisible: visible("#device-approve"),
        client: text("#device-client"),
        code: text("#device-code"),
        denyVisible: visible("#device-deny"),
      };
    })()`),
  );
  evidence.record(
    `device_${flow}_browser_shows_code_client_account`,
    review.code === link.userCode &&
      review.client === clientId &&
      review.account === email,
  );
  evidence.record(
    `device_${flow}_browser_requires_explicit_choice`,
    review.approveVisible && review.denyVisible,
  );
}

async function clickDeviceDecision(
  page: CdpPage,
  decision: "approve" | "deny",
): Promise<void> {
  const clicked = z.boolean().parse(
    await page.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(`#device-${decision}`)});
      if (!(button instanceof HTMLButtonElement) || button.disabled || button.hidden) {
        return false;
      }
      button.click();
      return true;
    })()`),
  );
  assert.ok(clicked, `device ${decision} button must be clickable`);
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

async function assertInvalidClientRejected(evidence: Evidence): Promise<void> {
  const response = await fetch(`${zoendBaseUrl}/api/auth/device/code`, {
    body: JSON.stringify({ client_id: "not-zoen" }),
    headers: jsonHeaders(),
    method: "POST",
  });
  const bodyValue = await readJson(response);
  const parsedBody = errorBodySchema.safeParse(bodyValue);
  assert.ok(
    parsedBody.success,
    `invalid client response: ${JSON.stringify(bodyValue)}`,
  );
  const body = parsedBody.data;
  evidence.record(
    "device_invalid_client_is_rejected",
    response.status === 400 && body.error === "invalid_client",
  );
}

async function assertGoogleReturnState(
  authDatabase: PostgresClient,
  page: CdpPage,
  link: DeviceLink,
  evidence: Evidence,
): Promise<void> {
  await page.send("Network.clearBrowserCookies");
  await page.navigate(throughZoend(link.completeUrl).toString());
  await waitForCondition(
    page,
    `(() => {
      const panel = document.querySelector("#device-signin");
      return panel instanceof HTMLElement && !panel.hidden;
    })()`,
    10_000,
    "device Google sign-in panel",
  );
  const callbackURL = z.string().parse(
    await page.evaluate("deviceCallbackURL()"),
  );
  evidence.record(
    "device_google_browser_callback_preserves_user_code",
    callbackURL === pathAndQuery(link.completeUrl),
  );

  await page.send("Fetch.enable", {
    patterns: [{ requestStage: "Request", urlPattern: "https://accounts.google.com/*" }],
  });
  const googleRequest = await (async () => {
    try {
      const paused = page.waitForEvent("Fetch.requestPaused", 10_000);
      const clicked = z.boolean().parse(
        await page.evaluate(`(() => {
          const button = document.querySelector("#device-google");
          if (!(button instanceof HTMLButtonElement) || button.disabled || button.hidden) {
            return false;
          }
          button.click();
          return true;
        })()`),
      );
      assert.ok(clicked, "device Google button must be clickable");
      const request = googleRequestSchema.parse(await paused);
      await page.send("Fetch.failRequest", {
        errorReason: "Aborted",
        requestId: request.requestId,
      });
      return request;
    } finally {
      await page.send("Fetch.disable").catch(() => undefined);
    }
  })();

  const providerUrl = new URL(googleRequest.request.url);
  const state = providerUrl.searchParams.get("state");
  assert.ok(state, "Google authorization URL must contain state");
  evidence.record(
    "device_google_starts_from_real_browser_button",
    providerUrl.hostname === "accounts.google.com",
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
  await page.navigate(new URL(stored.callbackURL, zoendBaseUrl).toString());
  await waitForCondition(
    page,
    `new URLSearchParams(location.search).get("user_code") === ${JSON.stringify(link.userCode)}`,
    10_000,
    "device Google return URL",
  );
  evidence.record(
    "device_google_returns_to_same_device_review",
    z.string().parse(
      await page.evaluate(
        'new URLSearchParams(location.search).get("user_code")',
      ),
    ) === link.userCode,
  );
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

async function assertExpiryAndReplayCleanup(
  authDatabase: PostgresClient,
  record: DeviceRecord,
  cliObservedServerExpiry: boolean,
  evidence: Evidence,
): Promise<void> {
  let serverExpiryObserved = cliObservedServerExpiry;
  if (!serverExpiryObserved) {
    await delayUntil(
      record.expiresAt.getTime() + (record.pollingInterval ?? 0) + 100,
    );
    const expired = await pollDeviceToken(record.deviceCode);
    const expiredBody = errorBodySchema.parse(expired.body);
    serverExpiryObserved =
      expired.response.status === 400 &&
      expiredBody.error === "expired_token" &&
      expiredBody.error_description === "Device code has expired";
  }
  evidence.record(
    "device_expiry_is_real_better_auth_expired_token",
    serverExpiryObserved,
  );
  await assertReplayAndCleanup(
    authDatabase,
    record,
    "device_expiry",
    evidence,
  );
}

async function waitForNextPoll(
  authDatabase: PostgresClient,
  deviceCode: string,
  previousPoll: Date | null,
  timeoutMs: number,
): Promise<Date> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await authDatabase.query(
      'SELECT "lastPolledAt" AS "lastPolledAt" FROM "deviceCode" WHERE "deviceCode" = $1',
      [deviceCode],
    );
    const row: unknown = result.rows[0];
    const current = z
      .object({ lastPolledAt: z.date().nullable() })
      .parse(row).lastPolledAt;
    if (
      current !== null &&
      (previousPoll === null || current.getTime() > previousPoll.getTime())
    ) {
      return current;
    }
    await delay(100);
  }
  throw new Error("device CLI did not complete its expected poll");
}

async function delayUntil(timestamp: number): Promise<void> {
  const remaining = timestamp - Date.now();
  if (remaining > 0) {
    await delay(remaining);
  }
}

async function assertReplayAndCleanup(
  authDatabase: PostgresClient,
  record: DeviceRecord,
  name: string,
  evidence: Evidence,
): Promise<void> {
  const replay = await pollDeviceToken(record.deviceCode);
  const replayBody = errorBodySchema.parse(replay.body);
  evidence.record(
    `${name}_replay_is_invalid_grant`,
    replay.response.status === 400 &&
      replayBody.error === "invalid_grant" &&
      replayBody.error_description === "Invalid device code",
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

async function startServer(
  zoenPath: string,
  port = zoendPort,
  listenAddress = e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
): Promise<ServerProcess> {
  assert.equal(
    await portOpen(port),
    false,
    `zoend port ${port} is already occupied`,
  );
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
        ZOEN_LISTEN_ADDR: listenAddress,
      },
    }),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.on("error", (error) => output.push(`${error.message}\n`));
  try {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (processExited(child)) {
        throw new Error(`zoend exited during startup:\n${output.join("")}`);
      }
      if (await portOpen(port)) {
        return { child, output };
      }
      await delay(100);
    }
    throw new Error(`zoend did not listen on port ${port}`);
  } catch (error) {
    await stopProcess(child, "SIGTERM", "zoend startup").catch(
      () => undefined,
    );
    throw error;
  }
}

async function stopServer(server: ServerProcess): Promise<void> {
  await stopProcess(server.child, "SIGINT", "zoend");
  assert.ok(
    server.child.exitCode === 0 || server.child.signalCode === "SIGINT",
    `zoend failed during shutdown:\n${server.output.join("")}`,
  );
}

function runPersistedSessionQuery(
  zoenPath: string,
  home: string,
  zoend = zoendBaseUrl,
): CliResult {
  const result = spawnSync(
    zoenPath,
    ["world", "query", "--type", "inventory.Item"],
    {
      encoding: "utf8",
      env: isolatedCliEnv(
        home,
        {
          ZOEN_DEFINITION_DIGEST: "dead",
          ZOEN_DEFINITION_ID: "inventory.definition",
          ZOEN_DEFINITION_REVISION: "1",
          ZOEN_TENANT: "tenant.a",
          ZOEN_VALID_AT: "2026-01-15T00:00:00Z",
        },
        zoend,
      ),
      timeout: 10_000,
    },
  );
  return {
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function isolatedCliEnv(
  home: string,
  extra: NodeJS.ProcessEnv = {},
  zoend = zoendBaseUrl,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    ZOEN_ZOEND: zoend,
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
