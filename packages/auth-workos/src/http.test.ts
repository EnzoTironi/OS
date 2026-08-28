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
    return `https://api.workos.com/user_management/authorize?provider=${input.provider}`;
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
): Promise<void> {
  const app = createAuthWorkosApp({
    auth: createAuth({ env: processEnv, kit }),
    env,
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
