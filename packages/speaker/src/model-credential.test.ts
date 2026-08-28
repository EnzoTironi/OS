import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConfiguredModelCredential,
  inspectModelCredential,
  redactCredentialText,
} from "./model-credential.js";

const NOW_MS = 1_700_000_000_000;

function mintJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = Buffer.from("sig").toString("base64url");
  return `${header}.${body}.${sig}`;
}

test("inspectModelCredential treats empty as missing and random keys as opaque", () => {
  assert.deepEqual(inspectModelCredential("", NOW_MS), { kind: "missing" });
  assert.deepEqual(inspectModelCredential("   ", NOW_MS), { kind: "missing" });
  assert.deepEqual(inspectModelCredential("sk-live-not-a-jwt", NOW_MS), {
    kind: "opaque",
  });
  assert.deepEqual(inspectModelCredential("random-api-key", NOW_MS), {
    kind: "opaque",
  });
});

test("inspectModelCredential reads exp from a three-segment JWT with alg", () => {
  const expiredExp = Math.floor(NOW_MS / 1000) - 3600;
  const liveExp = Math.floor(NOW_MS / 1000) + 3600;
  assert.deepEqual(
    inspectModelCredential(
      mintJwt({ exp: expiredExp, iss: "https://auth.x.ai", sub: "secret-sub" }),
      NOW_MS,
    ),
    { kind: "oauthJwt", exp: expiredExp, expired: true },
  );
  assert.deepEqual(
    inspectModelCredential(mintJwt({ exp: liveExp }), NOW_MS),
    { kind: "oauthJwt", exp: liveExp, expired: false },
  );
  assert.deepEqual(inspectModelCredential(mintJwt({ sub: "no-exp" }), NOW_MS), {
    kind: "oauthJwt",
    exp: null,
    expired: false,
  });
});

test("inspectModelCredential rejects non-JWT three-segment strings", () => {
  assert.deepEqual(inspectModelCredential("a.b.c", NOW_MS), { kind: "opaque" });
  const noAlg = [
    Buffer.from(JSON.stringify({ typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url"),
    Buffer.from("sig").toString("base64url"),
  ].join(".");
  assert.deepEqual(inspectModelCredential(noAlg, NOW_MS), { kind: "opaque" });
});

test("assertConfiguredModelCredential ignores missing model, missing key, opaque, live JWT, and JWT without exp", () => {
  const live = mintJwt({ exp: Math.floor(NOW_MS / 1000) + 3600 });
  const noExp = mintJwt({ sub: "no-exp" });
  assert.doesNotThrow(() =>
    assertConfiguredModelCredential({}, NOW_MS),
  );
  assert.doesNotThrow(() =>
    assertConfiguredModelCredential(
      { ZOEN_MODEL: "openai-compatible/grok-4.20-non-reasoning" },
      NOW_MS,
    ),
  );
  assert.doesNotThrow(() =>
    assertConfiguredModelCredential(
      {
        OPENAI_API_KEY: "sk-opaque",
        ZOEN_MODEL: "openai-compatible/grok-4.20-non-reasoning",
      },
      NOW_MS,
    ),
  );
  assert.doesNotThrow(() =>
    assertConfiguredModelCredential(
      { OPENAI_API_KEY: live, ZOEN_MODEL: "openai/gpt-4" },
      NOW_MS,
    ),
  );
  assert.doesNotThrow(() =>
    assertConfiguredModelCredential(
      { ANTHROPIC_API_KEY: noExp, ZOEN_MODEL: "anthropic/claude" },
      NOW_MS,
    ),
  );
});

test("assertConfiguredModelCredential throws on an expired OAuth JWT without leaking the token", () => {
  const exp = Math.floor(NOW_MS / 1000) - 3600;
  const jwt = mintJwt({
    exp,
    iss: "https://auth.x.ai",
    sub: "secret-sub",
  });
  const expiredAt = new Date(exp * 1000).toISOString();
  assert.throws(
    () =>
      assertConfiguredModelCredential(
        {
          OPENAI_API_KEY: jwt,
          ZOEN_MODEL: "openai-compatible/grok-4.20-non-reasoning",
        },
        NOW_MS,
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /OPENAI_API_KEY/);
      assert.match(error.message, /expired OAuth JWT/);
      assert.match(error.message, new RegExp(expiredAt.replaceAll(".", "\\.")));
      assert.equal(error.message.includes(jwt), false);
      assert.equal(error.message.includes("secret-sub"), false);
      assert.equal(error.message.includes("https://auth.x.ai"), false);
      assert.equal(error.message.includes("c2ln"), false);
      return true;
    },
  );
  assert.throws(
    () =>
      assertConfiguredModelCredential(
        { ANTHROPIC_API_KEY: jwt, ZOEN_MODEL: "anthropic/claude" },
        NOW_MS,
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /ANTHROPIC_API_KEY/);
      assert.match(error.message, /expired OAuth JWT/);
      assert.equal(error.message.includes(jwt), false);
      return true;
    },
  );
});

test("redactCredentialText strips JWT-shaped strings, Bearer tokens, and sk- keys", () => {
  const jwt = mintJwt({ exp: 1, sub: "secret-sub" });
  const redacted = redactCredentialText(
    `401 Bearer ${jwt} sk-live-secret123 leftover timeout 1.2.3`,
  );
  assert.equal(redacted.includes(jwt), false);
  assert.equal(redacted.includes("secret-sub"), false);
  assert.equal(redacted.includes("sk-live-secret123"), false);
  assert.match(redacted, /401/);
  assert.match(redacted, /timeout 1\.2\.3/);
  assert.doesNotMatch(redacted, /Bearer eyJ/i);
});
