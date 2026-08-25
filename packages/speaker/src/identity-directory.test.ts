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
      { headers: { "content-type": "application/json" }, status: 401 },
    );
  };

  const identity = createIdentityDirectoryClient({
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
