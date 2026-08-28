import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createAuth, type AuthKitPort } from "./auth.js";
import { isLocalRedirect, privateIdentityBase, readAuthEnv } from "./env.js";
import { createAuthWorkosApp } from "./http.js";
import {
  interpretConfirmResponse,
  resolveOnboardConfirm,
  resolveOnboardLookup,
  zoendOnboardLookup,
} from "./onboard.js";

const processEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  WORKOS_REDIRECT_URI: "http://127.0.0.1/auth/workos/callback",
};
const env = readAuthEnv(processEnv);
const prodEnv = readAuthEnv({
  ...processEnv,
  WORKOS_REDIRECT_URI: "https://zoen.tironi.xyz/auth/workos/callback",
});

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
  extras: {
    env?: ReturnType<typeof readAuthEnv>;
    identityBaseUrl?: string;
    onboardConfirm?: import("./onboard.js").OnboardConfirm;
    onboardLookup?: import("./onboard.js").OnboardLookup;
  } = {},
): Promise<void> {
  const previousIdentity = process.env.ZOEN_IDENTITY_BASE_URL;
  delete process.env.ZOEN_IDENTITY_BASE_URL;
  const app = createAuthWorkosApp({
    auth: createAuth({ env: processEnv, kit }),
    env: extras.env ?? env,
    identityBaseUrl: extras.identityBaseUrl,
    onboardConfirm: extras.onboardConfirm,
    onboardLookup: extras.onboardLookup,
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
    if (previousIdentity === undefined) {
      delete process.env.ZOEN_IDENTITY_BASE_URL;
    } else {
      process.env.ZOEN_IDENTITY_BASE_URL = previousIdentity;
    }
  }
}

async function withFakeZoend(
  run: (identityBaseUrl: string, posts: string[]) => Promise<void>,
): Promise<void> {
  const posts: string[] = [];
  const zoend = createServer((req, res) => {
    const url = req.url ?? "";
    if (req.method === "GET" && url.startsWith("/onboard/")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("ok");
      return;
    }
    if (req.method === "POST" && url.endsWith("/confirm")) {
      posts.push(url);
      res.writeHead(200, { "content-type": "text/html" });
      res.end("Pronto");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  zoend.listen(0, "127.0.0.1");
  await once(zoend, "listening");
  const address = zoend.address();
  if (address === null || typeof address === "string") {
    zoend.close();
    throw new Error("expected TCP address");
  }
  try {
    await run(`http://127.0.0.1:${address.port}`, posts);
  } finally {
    zoend.close();
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

test("onboard login still uses provider=authkit", async () => {
  await listen(async (origin) => {
    const response = await fetch(
      `${origin}/auth/workos/login?onboard=wa.token`,
      { redirect: "manual" },
    );
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.searchParams.get("provider"), "authkit");
    assert.equal(location.searchParams.get("state"), "onboard.wa.token");
    assert.match(response.headers.get("set-cookie") ?? "", /wos-onboard=wa\.token/u);
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
  }, { onboardLookup: async () => ({ kind: "ready" }) });
});

test("callback then onboard session POSTs zoend confirm", async () => {
  await withFakeZoend(async (identityBaseUrl, posts) => {
    await listen(async (origin) => {
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
      assert.deepEqual(posts, ["/onboard/wa.token/confirm"]);
    }, { identityBaseUrl });
  });
});

test("missing identity URL fails closed when not local", async () => {
  assert.equal(isLocalRedirect("https://zoen.tironi.xyz/auth/workos/callback"), false);
  await listen(async (origin) => {
    const response = await fetch(`${origin}/onboard/wa.token`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /não vale mais/u);
  }, { env: prodEnv });
});

test("session without identity URL does not stub-bind", async () => {
  await listen(
    async (origin) => {
      const response = await fetch(`${origin}/onboard/wa.token`, {
        headers: { cookie: "wos-session=sealed.session" },
      });
      assert.equal(response.status, 503);
      assert.match(await response.text(), /Não deu para confirmar/u);
    },
    { onboardLookup: async () => ({ kind: "ready" }) },
  );
});

test("confirm POST is not fired before AuthKit session", async () => {
  const posts: string[] = [];
  await listen(
    async (origin) => {
      const response = await fetch(`${origin}/onboard/wa.token`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Confirmar este WhatsApp/u);
      assert.deepEqual(posts, []);
    },
    {
      onboardConfirm: async (token) => {
        posts.push(token);
        return "bound";
      },
      onboardLookup: async () => ({ kind: "ready" }),
    },
  );
});

test("public identity URL is rejected so lookup cannot recurse", () => {
  assert.equal(
    privateIdentityBase("https://zoen.tironi.xyz", "https://zoen.tironi.xyz/auth/workos/callback"),
    undefined,
  );
  assert.equal(
    privateIdentityBase("http://127.0.0.1:58701", "https://zoen.tironi.xyz/auth/workos/callback"),
    "http://127.0.0.1:58701",
  );
});

test("zoend lookup is ready or missing only", async () => {
  const status = await zoendOnboardLookup("http://127.0.0.1:9")("wa.token");
  assert.equal(status.kind === "cli_complete", false);
  assert.equal(status.kind, "missing");
  assert.equal(interpretConfirmResponse(200, "Pronto"), "bound");
  assert.equal(
    interpretConfirmResponse(409, '{"error":"invite already consumed"}'),
    "bound",
  );
  assert.equal(
    interpretConfirmResponse(409, '{"error":"invite expired"}'),
    "failed",
  );
  const closed = resolveOnboardLookup(undefined, undefined, false);
  assert.equal((await closed("wa.token")).kind, "missing");
  assert.equal(await resolveOnboardConfirm(undefined, undefined)("wa.token"), "failed");
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
    {
      onboardLookup: async () => ({
        kind: "cli_complete",
        verificationUriComplete: "https://authkit.app/device?user_code=RRGQ-BJVS",
      }),
    },
  );
});

test("missing onboard token fails closed", async () => {
  await listen(async (origin) => {
    const response = await fetch(`${origin}/onboard/nope`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /não vale mais/u);
  }, { onboardLookup: async () => ({ kind: "missing" }) });
});
