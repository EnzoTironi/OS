import assert from "node:assert/strict";
import test from "node:test";
import {
  ChannelSubjectResolveError,
  createIdentityDirectoryClient,
  providerKey,
} from "./index.js";

test("resolveChannelSubject GETs resolve-subject and never POSTs provisional", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    assert.equal(method, "GET");
    assert.equal(init?.headers && (init.headers as { authorization?: string }).authorization, "Bearer admin-token");
    assert.match(url, /\/identity\/admin\/resolve-subject\?/);
    assert.doesNotMatch(url, /\/provisional/);
    return new Response(
      JSON.stringify({
        account: { accountId: "account.1", status: "verified" },
        bindings: [
          {
            accountId: "account.1",
            bindingId: "binding.1",
            provider: "whatsapp",
            status: "verified",
            subjectKey: "+15551212",
          },
        ],
        memberships: [
          {
            accountId: "account.1",
            actorId: "actor.personal",
            membershipId: "membership.1",
            principalId: "principal.1",
            status: "active",
            tenantId: "tenant.1",
            workloadId: "workload.personal",
          },
        ],
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };

  const identity = createIdentityDirectoryClient({
    adminToken: "admin-token",
    baseUrl: "http://zoend.test",
    fetchImpl,
  });
  const resolved = await identity.resolveChannelSubject({
    provider: providerKey("whatsapp"),
    subjectKey: "+15551212",
  });

  assert.equal(resolved.accountId, "account.1");
  assert.equal(resolved.bindingId, "binding.1");
  assert.equal(resolved.membershipId, "membership.1");
  assert.equal(String(resolved.tenantId), "tenant.1");
  assert.equal(String(resolved.principalId), "principal.1");
  assert.deepEqual(calls, [
    {
      method: "GET",
      url: "http://zoend.test/identity/admin/resolve-subject?provider=whatsapp&subjectKey=%2B15551212",
    },
  ]);
});

test("resolveChannelSubject returns typed unbound error without minting", async () => {
  const methods: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    methods.push((init?.method ?? "GET").toUpperCase());
    assert.doesNotMatch(String(input), /\/provisional/);
    return new Response(
      JSON.stringify({ error: "OIDC subject has no verified binding" }),
      { headers: { "content-type": "application/json" }, status: 404 },
    );
  };

  const identity = createIdentityDirectoryClient({
    adminToken: "admin-token",
    baseUrl: "http://zoend.test",
    fetchImpl,
  });

  await assert.rejects(
    () =>
      identity.resolveChannelSubject({
        provider: providerKey("telegram"),
        subjectKey: "tg_never_bound",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChannelSubjectResolveError);
      assert.equal(error.kind, "unbound");
      return true;
    },
  );
  assert.deepEqual(methods, ["GET"]);
});

test("resolveChannelSubject fails closed without an admin token", async () => {
  const previous = process.env.ZOEN_IDENTITY_ADMIN_TOKEN;
  delete process.env.ZOEN_IDENTITY_ADMIN_TOKEN;
  try {
    const identity = createIdentityDirectoryClient({
      baseUrl: "http://zoend.test",
      fetchImpl: async () => {
        throw new Error("must not fetch without a token");
      },
    });
    await assert.rejects(
      () =>
        identity.resolveChannelSubject({
          provider: providerKey("whatsapp"),
          subjectKey: "+15551212",
        }),
      /ZOEN_IDENTITY_ADMIN_TOKEN/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.ZOEN_IDENTITY_ADMIN_TOKEN;
    } else {
      process.env.ZOEN_IDENTITY_ADMIN_TOKEN = previous;
    }
  }
});

test("resolveChannelSubject does not map auth 401 to unbound", async () => {
  const identity = createIdentityDirectoryClient({
    adminToken: "admin-token",
    baseUrl: "http://zoend.test",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "unauthenticated" }), {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
  });
  await assert.rejects(
    () =>
      identity.resolveChannelSubject({
        provider: providerKey("telegram"),
        subjectKey: "tg_never_bound",
      }),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof ChannelSubjectResolveError) &&
      error.message.includes("unauthenticated"),
  );
});

test("resolveChannelSubject rejects inactive membership with typed error", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        account: { accountId: "account.1", status: "verified" },
        bindings: [
          {
            accountId: "account.1",
            bindingId: "binding.1",
            provider: "linq",
            status: "verified",
            subjectKey: "chat_guid_1",
          },
        ],
        memberships: [
          {
            accountId: "account.1",
            membershipId: "membership.1",
            principalId: "principal.1",
            status: "revoked",
            tenantId: "tenant.1",
          },
        ],
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );

  const identity = createIdentityDirectoryClient({
    adminToken: "admin-token",
    baseUrl: "http://zoend.test",
    fetchImpl,
  });

  await assert.rejects(
    () =>
      identity.resolveChannelSubject({
        provider: providerKey("linq"),
        subjectKey: "chat_guid_1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChannelSubjectResolveError);
      assert.equal(error.kind, "inactive_membership");
      return true;
    },
  );
});

test("resolveChannelSubject fails closed on ambiguous membership without tenant hint", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        account: { accountId: "account.1", status: "verified" },
        bindings: [
          {
            accountId: "account.1",
            bindingId: "binding.1",
            provider: "whatsapp",
            status: "verified",
            subjectKey: "+15551212",
          },
        ],
        memberships: [
          {
            accountId: "account.1",
            membershipId: "membership.a",
            principalId: "principal.a",
            status: "active",
            tenantId: "tenant.a",
          },
          {
            accountId: "account.1",
            membershipId: "membership.b",
            principalId: "principal.b",
            status: "active",
            tenantId: "tenant.b",
          },
        ],
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );

  const identity = createIdentityDirectoryClient({
    adminToken: "admin-token",
    baseUrl: "http://zoend.test",
    fetchImpl,
  });

  await assert.rejects(
    () =>
      identity.resolveChannelSubject({
        provider: providerKey("whatsapp"),
        subjectKey: "+15551212",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChannelSubjectResolveError);
      assert.equal(error.kind, "ambiguous_membership");
      return true;
    },
  );

  const resolved = await identity.resolveChannelSubject({
    provider: providerKey("whatsapp"),
    subjectKey: "+15551212",
    tenantHint: "tenant.b",
  });
  assert.equal(resolved.membershipId, "membership.b");
  assert.equal(String(resolved.tenantId), "tenant.b");
});

test("resolveChannelSubject prefers the single personal membership over invite", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        account: { accountId: "account.1", status: "verified" },
        bindings: [
          {
            accountId: "account.1",
            bindingId: "binding.1",
            provider: "whatsapp",
            status: "verified",
            subjectKey: "+15551212",
          },
        ],
        memberships: [
          {
            accountId: "account.1",
            kind: "invite",
            membershipId: "membership.invite",
            principalId: "principal.invite",
            status: "active",
            tenantId: "tenant.a",
          },
          {
            accountId: "account.1",
            kind: "personal",
            membershipId: "membership.personal",
            principalId: "principal.personal",
            status: "active",
            tenantId: "tenant.personal",
          },
        ],
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );

  const identity = createIdentityDirectoryClient({
    adminToken: "admin-token",
    baseUrl: "http://zoend.test",
    fetchImpl,
  });

  const personal = await identity.resolveChannelSubject({
    provider: providerKey("whatsapp"),
    subjectKey: "+15551212",
  });
  assert.equal(personal.membershipId, "membership.personal");
  assert.equal(String(personal.tenantId), "tenant.personal");

  const hinted = await identity.resolveChannelSubject({
    provider: providerKey("whatsapp"),
    subjectKey: "+15551212",
    tenantHint: "tenant.a",
  });
  assert.equal(hinted.membershipId, "membership.invite");
  assert.equal(String(hinted.tenantId), "tenant.a");
});
