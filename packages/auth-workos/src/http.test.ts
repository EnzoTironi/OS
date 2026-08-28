import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";
import { createAuth, type AuthKitPort } from "./auth.js";
import { readAuthEnv } from "./env.js";
import { createAuthWorkosApp } from "./http.js";

const processEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  WORKOS_REDIRECT_URI: "http://127.0.0.1/auth/workos/callback",
};
const env = readAuthEnv(processEnv);

const kit: AuthKitPort = {
  authenticateWithCode() {
    return Promise.resolve({
      sealedSession: "sealed.session",
      user: {
        email: "enzo@example.com",
        emailVerified: true,
        firstName: "Enzo",
        id: "user_test",
        lastName: "Tironi",
      },
    });
  },
  getAuthorizationUrl(input) {
    const state = input.state === undefined ? "" : `&state=${input.state}`;
    return `https://api.workos.com/user_management/authorize?provider=${input.provider}${state}`;
  },
  loadSealedSession() {
    return {
      authenticate: () =>
        Promise.resolve({
          authenticated: true,
          user: { email: "enzo@example.com", id: "user_test" },
        }),
      getLogoutUrl: () => Promise.resolve("https://api.workos.com/logout"),
    };
  },
};

async function listen(
  run: (origin: string) => Promise<void>,
  onboardLookup?: import("./onboard.js").OnboardLookup,
): Promise<void> {
  const app = createAuthWorkosApp({
    auth: createAuth({ env: processEnv, kit }),
    env,
    onboardLookup: onboardLookup ?? (async () => ({ kind: "ready" })),
  });
  const server = app.listen(0, "127.0.0.1") as Server;
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("expected TCP address");
  }
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

test("login route redirects to the AuthKit authorization URL", async () => {
  await listen(async (origin) => {
    const response = await fetch(`${origin}/auth/workos/login`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://api.workos.com/user_management/authorize?provider=authkit",
    );
  });
});

test("callback route exchanges code and sets the sealed cookie", async () => {
  await listen(async (origin) => {
    const response = await fetch(
      `${origin}/auth/workos/callback?code=auth_code`,
      { redirect: "manual" },
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/auth/workos");
    assert.match(
      response.headers.get("set-cookie") ?? "",
      /wos-session=sealed\.session/u,
    );
  });
});

test("/onboard/:token returns HTML", async () => {
  await listen(async (origin) => {
    const response = await fetch(`${origin}/onboard/wa.token`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/u);
    assert.match(body, /Confirmar este WhatsApp/u);
    assert.match(body, /\/auth\/workos\/login\?onboard=wa\.token/u);
    assert.doesNotMatch(body, /user_code|RRGQ-BJVS|BCDF-GHJK/u);
  });
});

test("callback returns to onboard when that was the start", async () => {
  await listen(async (origin) => {
    const login = await fetch(`${origin}/auth/workos/login?onboard=wa.token`, {
      redirect: "manual",
    });
    assert.equal(login.status, 302);
    assert.match(
      login.headers.get("location") ?? "",
      /provider=authkit/u,
    );
    const callback = await fetch(
      `${origin}/auth/workos/callback?code=auth_code&state=onboard.wa.token`,
      { redirect: "manual" },
    );
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/onboard/wa.token");
    const done = await fetch(`${origin}/onboard/wa.token`, {
      headers: { cookie: "wos-session=sealed.session" },
    });
    const body = await done.text();
    assert.equal(done.status, 200);
    assert.match(body, /Volta pro Zap/u);
    assert.doesNotMatch(body, /user_code/u);
  });
});

test("CLI Auth completion redirects to the given verification_uri_complete", async () => {
  await listen(
    async (origin) => {
      const response = await fetch(`${origin}/onboard/RRGQ-BJVS`, {
        redirect: "manual",
      });
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get("location"),
        "https://authkit.app/device?user_code=RRGQ-BJVS",
      );
    },
    async () => ({
      kind: "cli_complete",
      verificationUriComplete: "https://authkit.app/device?user_code=RRGQ-BJVS",
    }),
  );
});

test("missing onboard token fails closed", async () => {
  await listen(async (origin) => {
    const response = await fetch(`${origin}/onboard/nope`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /não vale mais/u);
  }, async () => ({ kind: "missing" }));
});
