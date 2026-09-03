import assert from "node:assert/strict";
import {
  constants as fsConstants,
} from "node:fs";
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

const errorBodySchema = z
  .object({
    error: z.string(),
  })
  .passthrough();

const oauthStateSchema = z
  .object({
    callbackURL: z.string(),
    errorURL: z.string(),
    oauthState: z.string().optional(),
  })
  .passthrough();

const browserTargetSchema = z.object({
  type: z.literal("page"),
  webSocketDebuggerUrl: z.url(),
});

const cdpEnvelopeSchema = z
  .object({
    error: z
      .object({
        message: z.string(),
      })
      .passthrough()
      .optional(),
    id: z.number().optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
  })
  .passthrough();

const cdpEvaluationSchema = z
  .object({
    exceptionDetails: z.unknown().optional(),
    result: z
      .object({
        value: z.unknown().optional(),
      })
      .passthrough(),
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
  processGroup: boolean;
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

type BrowserProcess = {
  child: ChildProcessWithoutNullStreams;
  page: CdpPage;
  processGroup: boolean;
};

type CdpPending = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
};

type CdpWaiter = {
  method: string;
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
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
  let browser: BrowserProcess | undefined;
  let activeCli: AsyncCli | undefined;
  let completed = false;
  try {
    door = await startAuthDoor(authDatabaseUrl, {
      google: {
        clientId: "device-login.e2e.apps.googleusercontent.com",
        clientSecret: "device-login-e2e-secret",
      },
    });
    authDatabase = new PostgresClient({ connectionString: authDatabaseUrl });
    await authDatabase.connect();
    server = await startServer(zoenPath);
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
    await setPollingInterval(authDatabase, approvedRecord.deviceCode, 1);
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

    evidence.record(
      "device_better_auth_default_expires_in_is_1800_seconds",
      approvedRecord.expiresAt.getTime() - Date.now() >= 1_790_000 &&
        approvedRecord.expiresAt.getTime() - Date.now() <= 1_801_000,
    );
    await delayUntil(activeCli.startedAt + 115_500);
    const beforeSlowDown = await deviceRecord(
      authDatabase,
      approvedLink.userCode,
    );
    const lastPoll = await waitForNextPoll(
      authDatabase,
      approvedRecord.deviceCode,
      beforeSlowDown.lastPolledAt,
      10_000,
    );
    await setPollingInterval(authDatabase, approvedRecord.deviceCode, 60_000);
    await delayUntil(lastPoll.getTime() + 8_000);
    evidence.record(
      "device_cli_honors_server_expires_in_beyond_120_seconds",
      Date.now() - activeCli.startedAt > 121_000 &&
        !processExited(activeCli.child),
    );
    evidence.record(
      "device_cli_survives_slow_down",
      !processExited(activeCli.child),
    );

    await setPollingInterval(authDatabase, approvedRecord.deviceCode, 1);
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
      approvalDelayMs >= 5_500,
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

async function signUpThroughZoend(): Promise<SignedUpAccount> {
  const email = `device-${randomUUID()}@e2e.invalid`;
  const response = await fetch(`${zoendBaseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: "Device login", password }),
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
      password.value = ${JSON.stringify(password)};
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
  const body = errorBodySchema.parse(await readJson(response));
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

class CdpPage {
  readonly #pending = new Map<number, CdpPending>();
  readonly #socket: WebSocket;
  readonly #waiters: CdpWaiter[] = [];
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      this.#receive(event.data);
    });
    socket.addEventListener("close", () => {
      this.#failAll(new Error("Chromium CDP connection closed"));
    });
  }

  static connect(url: string): Promise<CdpPage> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = globalThis.setTimeout(() => {
        socket.close();
        reject(new Error("Chromium CDP connection timed out"));
      }, 10_000);
      socket.addEventListener(
        "open",
        () => {
          globalThis.clearTimeout(timer);
          resolve(new CdpPage(socket));
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          globalThis.clearTimeout(timer);
          reject(new Error("Chromium CDP connection failed"));
        },
        { once: true },
      );
    });
  }

  close(): void {
    if (
      this.#socket.readyState === WebSocket.OPEN ||
      this.#socket.readyState === WebSocket.CONNECTING
    ) {
      this.#socket.close();
    }
  }

  async evaluate(expression: string): Promise<unknown> {
    const raw = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    const evaluation = cdpEvaluationSchema.parse(raw);
    assert.equal(
      evaluation.exceptionDetails,
      undefined,
      `browser expression failed: ${expression}`,
    );
    return evaluation.result.value;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await waitForCondition(
      this,
      `location.href === ${JSON.stringify(url)}`,
      10_000,
      `browser navigation to ${url}`,
    );
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Chromium CDP command timed out: ${method}`));
      }, 10_000);
      this.#pending.set(id, { reject, resolve, timer });
      try {
        this.#socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        globalThis.clearTimeout(timer);
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  waitForEvent(method: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        const index = this.#waiters.findIndex(
          (waiter) => waiter.resolve === resolve,
        );
        if (index >= 0) {
          this.#waiters.splice(index, 1);
        }
        reject(new Error(`Chromium CDP event timed out: ${method}`));
      }, timeoutMs);
      this.#waiters.push({ method, reject, resolve, timer });
    });
  }

  #failAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    for (const waiter of this.#waiters.splice(0)) {
      globalThis.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  #receive(raw: unknown): void {
    try {
      if (typeof raw !== "string") {
        throw new Error("Chromium CDP sent a non-text message");
      }
      const parsed: unknown = JSON.parse(raw);
      const message = cdpEnvelopeSchema.parse(parsed);
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) {
          return;
        }
        globalThis.clearTimeout(pending.timer);
        this.#pending.delete(message.id);
        if (message.error !== undefined) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
      if (message.method === undefined) {
        return;
      }
      const index = this.#waiters.findIndex(
        (waiter) => waiter.method === message.method,
      );
      if (index < 0) {
        return;
      }
      const waiter = this.#waiters[index];
      if (waiter === undefined) {
        return;
      }
      this.#waiters.splice(index, 1);
      globalThis.clearTimeout(waiter.timer);
      waiter.resolve(message.params);
    } catch (error) {
      this.#failAll(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

async function startBrowser(home: string): Promise<BrowserProcess> {
  const executable = await chromeExecutable();
  const output: string[] = [];
  const processGroup = process.platform !== "win32";
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${path.join(home, "chromium")}`,
      "about:blank",
    ],
    {
      detached: processGroup,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.on("error", (error) => output.push(`${error.message}\n`));
  try {
    const debuggerUrl = await waitForDevtoolsUrl(child, output);
    const debuggerEndpoint = new URL(debuggerUrl);
    const targetEndpoint = `http://${debuggerEndpoint.host}/json/list`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (processExited(child)) {
        throw new Error(`Chromium exited during startup:\n${output.join("")}`);
      }
      const response = await fetch(targetEndpoint).catch(() => undefined);
      if (response?.ok) {
        const targetsValue: unknown = await response.json();
        const targets = z.array(z.unknown()).parse(targetsValue);
        for (const value of targets) {
          const parsed = browserTargetSchema.safeParse(value);
          if (parsed.success) {
            return {
              child,
              page: await CdpPage.connect(parsed.data.webSocketDebuggerUrl),
              processGroup,
            };
          }
        }
      }
      await delay(50);
    }
    throw new Error(`Chromium did not expose a page target:\n${output.join("")}`);
  } catch (error) {
    await stopProcess(
      child,
      "SIGTERM",
      "Chromium startup",
      processGroup,
    ).catch(() => undefined);
    throw error;
  }
}

async function chromeExecutable(): Promise<string> {
  const configured = process.env.CHROME_PATH;
  const candidates = [
    configured,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate.length === 0) {
      continue;
    }
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    "cli-dest device journey needs Chrome or Chromium; set CHROME_PATH",
  );
}

async function waitForDevtoolsUrl(
  child: ChildProcessWithoutNullStreams,
  output: string[],
): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(output.join(""));
    if (match?.[1] !== undefined) {
      return match[1];
    }
    if (processExited(child)) {
      throw new Error(`Chromium exited before CDP was ready:\n${output.join("")}`);
    }
    await delay(50);
  }
  throw new Error(`Chromium did not publish its CDP URL:\n${output.join("")}`);
}

async function stopBrowser(browser: BrowserProcess): Promise<void> {
  browser.page.close();
  await stopProcess(
    browser.child,
    "SIGTERM",
    "Chromium",
    browser.processGroup,
  );
}

async function waitForCondition(
  page: CdpPage,
  expression: string,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (z.boolean().parse(await page.evaluate(expression))) {
      return;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function waitForText(
  page: CdpPage,
  selector: string,
  text: string,
  timeoutMs: number,
): Promise<void> {
  await waitForCondition(
    page,
    `document.querySelector(${JSON.stringify(selector)})?.textContent?.includes(${JSON.stringify(text)}) === true`,
    timeoutMs,
    `${selector} to contain ${text}`,
  );
}

async function startServer(zoenPath: string): Promise<ServerProcess> {
  const output: string[] = [];
  const processGroup = process.platform !== "win32";
  const child = spawn(zoenPath, ["serve"], {
    cwd: process.cwd(),
    detached: processGroup,
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
  child.on("error", (error) => output.push(`${error.message}\n`));
  try {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (processExited(child)) {
        throw new Error(`zoend exited during startup:\n${output.join("")}`);
      }
      if (await portOpen(zoendPort)) {
        return { child, output, processGroup };
      }
      await delay(100);
    }
    throw new Error(`zoend did not listen on port ${zoendPort}`);
  } catch (error) {
    await stopProcess(
      child,
      "SIGTERM",
      "zoend startup",
      processGroup,
    ).catch(() => undefined);
    throw error;
  }
}

async function stopServer(server: ServerProcess): Promise<void> {
  await stopProcess(
    server.child,
    "SIGINT",
    "zoend",
    server.processGroup,
  );
  assert.ok(
    server.child.exitCode === 0 || server.child.signalCode === "SIGINT",
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
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function processExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function stopProcess(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
  name: string,
  processGroup = false,
): Promise<void> {
  signalOwnedProcess(child, signal, processGroup);
  try {
    await waitForProcessExit(child, 10_000, name);
  } catch (error) {
    signalOwnedProcess(child, "SIGKILL", processGroup);
    await waitForProcessExit(child, 3_000, name);
    throw error;
  }
}

function signalOwnedProcess(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
  processGroup: boolean,
): void {
  if (processGroup && child.pid !== undefined && child.pid > 0) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      const noSuchProcess = z
        .object({ code: z.literal("ESRCH") })
        .safeParse(error).success;
      if (!noSuchProcess) {
        throw error;
      }
    }
  }
  if (!processExited(child)) {
    child.kill(signal);
  }
}

function waitForProcessExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  name: string,
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
      child.off("exit", onExit);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const onExit = () => finish();
    const timer = globalThis.setTimeout(
      () => finish(new Error(`${name} did not exit within ${timeoutMs}ms`)),
      timeoutMs,
    );
    child.once("exit", onExit);
    if (processExited(child)) {
      finish();
    }
  });
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
