import assert from "node:assert/strict";
import test from "node:test";
import {
  currentUser,
  handleCallback,
  loginUrl,
  logout,
} from "./index.js";
import { createAuth, type AuthKitPort } from "./auth.js";
import { callbackPath, readAuthEnv } from "./env.js";

const cookiePassword = "x".repeat(32);
const validEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: cookiePassword,
  WORKOS_REDIRECT_URI: "http://localhost:3000/auth/workos/callback",
};

const sampleUser = {
  email: "enzo@example.com",
  emailVerified: true,
  firstName: "Enzo",
  id: "user_test",
  lastName: "Tironi",
};

function recordingKit(): AuthKitPort & {
  authenticateCalls: unknown[];
} {
  const authenticateCalls: unknown[] = [];
  return {
    authenticateCalls,
    authenticateWithCode(input) {
      authenticateCalls.push(input);
      return Promise.resolve({
        sealedSession: "sealed.session",
        user: sampleUser,
      });
    },
    getAuthorizationUrl(input) {
      const state = input.state === undefined ? "" : `&state=${input.state}`;
      return `https://api.workos.com/user_management/authorize?provider=${input.provider}${state}`;
    },
    loadSealedSession() {
      return {
        authenticate: () =>
          Promise.resolve({ authenticated: true, user: sampleUser }),
        getLogoutUrl: () => Promise.resolve("https://api.workos.com/logout"),
      };
    },
  };
}

async function withEnv<T>(
  env: NodeJS.ProcessEnv,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WORKOS_")) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, env);
  try {
    return await run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("WORKOS_")) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, previous);
  }
}

test("authorization URL uses AuthKit provider via the SDK", async () => {
  const url = await withEnv(validEnv, () => loginUrl());
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "api.workos.com");
  assert.equal(parsed.searchParams.get("provider"), "authkit");
  assert.notEqual(parsed.searchParams.get("provider"), "GoogleOAuth");
  assert.notEqual(parsed.searchParams.get("provider"), "AppleOAuth");
  assert.equal(parsed.searchParams.get("client_id"), "client_test");
  assert.equal(
    parsed.searchParams.get("redirect_uri"),
    "http://localhost:3000/auth/workos/callback",
  );
});

test("loginUrl state is passed to the SDK and still uses AuthKit", async () => {
  const url = await withEnv(validEnv, () => loginUrl("onboard.wa.token"));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("provider"), "authkit");
  assert.equal(parsed.searchParams.get("state"), "onboard.wa.token");
});

test("Google and Apple stay on hosted AuthKit, not process env", async () => {
  const env = {
    ...validEnv,
    GOOGLE_CLIENT_ID: "should-be-ignored",
    APPLE_SERVICE_ID: "should-be-ignored",
  };
  const parsed = readAuthEnv(env);
  assert.equal("googleClientId" in parsed, false);
  assert.doesNotMatch(JSON.stringify(parsed), /should-be-ignored/u);
  const url = await withEnv(env, () => loginUrl());
  assert.equal(new URL(url).searchParams.get("provider"), "authkit");
});

test("callback exchanges code via authenticateWithCode and seals the session", async () => {
  const kit = recordingKit();
  const result = await createAuth({ env: validEnv, kit }).handleCallback(
    "auth_code",
  );
  assert.deepEqual(kit.authenticateCalls, [
    {
      clientId: "client_test",
      code: "auth_code",
      session: { cookiePassword, sealSession: true },
    },
  ]);
  assert.equal(result.sealedSession, "sealed.session");
  assert.equal(result.user.id, "user_test");
  assert.equal(result.user.email, "enzo@example.com");
});

test("missing env fails closed", async () => {
  await withEnv({}, () => {
    assert.throws(() => loginUrl(), /WorkOS auth env failed closed/u);
    assert.throws(() => readAuthEnv({}), /WORKOS_API_KEY/u);
    assert.throws(
      () =>
        readAuthEnv({
          WORKOS_API_KEY: "sk_test",
          WORKOS_CLIENT_ID: "client_test",
          WORKOS_REDIRECT_URI: "http://localhost:3000/auth/workos/callback",
          WORKOS_COOKIE_PASSWORD: "too-short",
        }),
      /WORKOS_COOKIE_PASSWORD/u,
    );
  });
});

test("logout and currentUser read the sealed session", async () => {
  const auth = createAuth({ env: validEnv, kit: recordingKit() });
  const user = await auth.currentUser("sealed.session");
  const loggedOut = await auth.logout("sealed.session");
  const empty = await auth.currentUser();
  const emptyLogout = await auth.logout();
  assert.equal(user?.email, "enzo@example.com");
  assert.equal(loggedOut.logoutUrl, "https://api.workos.com/logout");
  assert.equal(empty, null);
  assert.equal(emptyLogout.logoutUrl, null);
});

test("callback path is taken from WORKOS_REDIRECT_URI", () => {
  assert.equal(
    callbackPath("https://zoen.tironi.xyz/auth/workos/callback"),
    "/auth/workos/callback",
  );
});

test("public API is loginUrl, handleCallback, logout, currentUser", async () => {
  const api = await import("./index.js");
  assert.deepEqual(Object.keys(api).sort(), [
    "currentUser",
    "handleCallback",
    "loginUrl",
    "logout",
  ]);
  await assert.rejects(
    () => withEnv(validEnv, () => handleCallback("")),
    /authorization code is required/u,
  );
  await withEnv(validEnv, async () => {
    assert.equal(await currentUser(), null);
    assert.deepEqual(await logout(), { logoutUrl: null });
  });
});
