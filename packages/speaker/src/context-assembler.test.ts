import assert from "node:assert/strict";
import test from "node:test";
import {
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
} from "./brands.js";
import {
  allowConversationScope,
  createConversationContextAssembler,
  type ConversationContextSource,
} from "./context-assembler.js";
import {
  CONVERSATION_TRUST_CLASSES,
  createConversationContextRecord,
  type ConversationContextRecord,
} from "./context-document.js";
import type { TrustedInteractionContext } from "./types.js";
import type { WorldQueryClient } from "./world-query.js";

function membership(suffix: string): TrustedInteractionContext {
  return {
    accountId: "account.wa.enzo",
    actorId: "actor.personal",
    bindingId: "binding.wa.enzo",
    channel: {
      provider: providerKey("whatsapp"),
      providerUser: providerUserRef("553199941160@s.whatsapp.net"),
      receivedAt: "2026-08-26T15:00:00.000Z",
      thread: providerThreadRef(`553199941160@s.whatsapp.net:${suffix}`),
    },
    membershipId: "membership.wa.enzo",
    principalId: principalIdString("principal.wa.enzo"),
    tenantId: tenantIdString("tenant.wa.enzo"),
    workloadId: "workload.personal",
  };
}

function recordOf(
  trustClass: ConversationContextRecord["trustClass"],
  extra: Partial<ConversationContextRecord> = {},
): ConversationContextRecord {
  switch (trustClass) {
    case "instruction":
      return createConversationContextRecord({
        attribution: {
          kind: "onboard",
          tokenHash: "3".repeat(64),
        },
        payload: { kind: "interaction", locale: "pt", type: "instruction" },
        retention: "interaction",
        scope: { conversationKey: "ck_src", kind: "conversation" },
        trustClass,
        ...extra,
      });
    case "interaction":
      return createConversationContextRecord({
        attribution: { interactionId: "ixn_src", kind: "interaction" },
        payload: { kind: "text", text: "oi", type: "interaction" },
        retention: "interaction",
        scope: { conversationKey: "ck_src", kind: "conversation" },
        trustClass,
        ...extra,
      });
    case "preference":
      return createConversationContextRecord({
        attribution: { kind: "onboard", tokenHash: "4".repeat(64) },
        payload: { key: "locale", text: "pt", type: "preference" },
        retention: "preference",
        scope: { conversationKey: "ck_src", kind: "conversation" },
        trustClass,
        ...extra,
      });
    case "knowledge":
      return createConversationContextRecord({
        attribution: {
          actualCommitSequence: "1",
          definitionDigest: "5".repeat(64),
          kind: "query",
          resultDigest: "6".repeat(64),
        },
        payload: { admitted: false, text: "snippet", type: "knowledge" },
        retention: "preference",
        scope: { kind: "tenant", tenantId: "tenant.wa.enzo" },
        trustClass,
        ...extra,
      });
    case "world":
      return createConversationContextRecord({
        attribution: {
          actualCommitSequence: "0",
          definitionDigest: "7".repeat(64),
          kind: "query",
          resultDigest: "8".repeat(64),
        },
        payload: {
          notes: ["10 each"],
          rivals: [{ label: "source.sheet" }],
          type: "world",
        },
        retention: "authority",
        scope: { kind: "tenant", tenantId: "tenant.wa.enzo" },
        trustClass,
        ...extra,
      });
    case "history":
      return createConversationContextRecord({
        attribution: {
          explanationDigest: "9".repeat(64),
          kind: "explain",
          operationId: "op.1",
        },
        payload: { complete: true, labels: ["complete"], type: "history" },
        retention: "authority",
        scope: { kind: "tenant", tenantId: "tenant.wa.enzo" },
        trustClass,
        ...extra,
      });
    case "personal_memory":
      return createConversationContextRecord({
        attribution: {
          actualCommitSequence: "2",
          definitionDigest: "a".repeat(64),
          kind: "query",
          resultDigest: "b".repeat(64),
        },
        payload: { body: "leite", type: "personal_memory" },
        retention: "preference",
        scope: {
          kind: "principal",
          principalId: "principal.wa.enzo",
          tenantId: "tenant.wa.enzo",
        },
        trustClass,
        ...extra,
      });
    default: {
      const exhaustive: never = trustClass;
      return exhaustive;
    }
  }
}

function staticSource(
  id: string,
  records: readonly ConversationContextRecord[],
): ConversationContextSource {
  return {
    id,
    async retrieve() {
      return records;
    },
  };
}

test("bound assemble keeps distinct trust classes and a stable hash for the same clock", async () => {
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const sources = CONVERSATION_TRUST_CLASSES.filter(
    (trustClass) => trustClass !== "instruction",
  ).map((trustClass) => staticSource(trustClass, [recordOf(trustClass)]));
  const assembler = createConversationContextAssembler({ now, sources });
  const input = {
    attemptId: "att_1",
    audienceKind: "dm" as const,
    claimedInteractionIds: ["ixn_src"],
    conversationKey: "ck_src",
    inbound: { kind: "text" as const, text: "oi" },
    instructions: "you are zoen",
    locale: "pt" as const,
    membership: membership("hash"),
  };
  const first = await assembler.assembleBound(input);
  const second = await assembler.assembleBound(input);
  assert.equal(first.contextHash, second.contextHash);
  assert.match(first.contextHash, /^[0-9a-f]{64}$/);
  const classes = new Set(
    first.document.records.map((record) => record.trustClass),
  );
  for (const trustClass of CONVERSATION_TRUST_CLASSES) {
    assert.equal(classes.has(trustClass), true, trustClass);
  }
  assert.equal("memory_text" in first.document, false);
  assert.doesNotMatch(first.projection.data, /you are zoen/);
  assert.doesNotMatch(first.projection.data, /tenant\.wa\.enzo/);
});

test("same world and different inbound produce a different contextHash", async () => {
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const world: WorldQueryClient = {
    async semanticQuery() {
      return {
        entityIds: [],
        notes: ["10 each"],
        rivals: [{ label: "source.sheet" }],
      };
    },
  };
  const assembler = createConversationContextAssembler({
    now,
    sources: [
      {
        id: "world",
        async retrieve() {
          return [recordOf("world")];
        },
      },
    ],
  });
  const base = {
    attemptId: "att_1",
    audienceKind: "dm" as const,
    claimedInteractionIds: ["ixn_a"],
    conversationKey: "ck_src",
    instructions: "x",
    locale: "pt" as const,
    membership: membership("inbound"),
  };
  const left = await assembler.assembleBound({
    ...base,
    inbound: { kind: "text", text: "oi" },
  });
  const right = await assembler.assembleBound({
    ...base,
    inbound: { kind: "text", text: "quanto ficou" },
  });
  assert.notEqual(left.contextHash, right.contextHash);
  void world;
});

test("unbound assemble keeps inbound and href and never pulls world or memory", async () => {
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const assembler = createConversationContextAssembler({
    now,
    sources: [staticSource("world", [recordOf("world"), recordOf("personal_memory")])],
  });
  const assembled = await assembler.assembleUnbound({
    href: "https://zoen.example/onboard/tok",
    inbound: { kind: "text", text: "oi" },
    instructions: "first contact",
    locale: "pt",
  });
  assert.equal(
    assembled.document.records.some((record) => record.trustClass === "world"),
    false,
  );
  assert.equal(
    assembled.document.records.some(
      (record) => record.trustClass === "personal_memory",
    ),
    false,
  );
  assert.match(assembled.projection.data, /oi/);
  assert.match(assembled.projection.data, /https:\/\/zoen\.example\/onboard\/tok/);
});

test("group assemble drops personal_memory", async () => {
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const assembler = createConversationContextAssembler({
    now,
    sources: [staticSource("memory", [recordOf("personal_memory")])],
  });
  const assembled = await assembler.assembleBound({
    attemptId: "att_g",
    audienceKind: "group",
    claimedInteractionIds: ["ixn_g"],
    conversationKey: "ck_src",
    inbound: { kind: "text", text: "oi" },
    instructions: "x",
    locale: "pt",
    membership: membership("group"),
  });
  assert.equal(
    assembled.document.records.some(
      (record) => record.trustClass === "personal_memory",
    ),
    false,
  );
  assert.ok(
    assembled.document.dropped.some((drop) => drop.reason === "audience"),
  );
});

test("wrong tenant records are dropped and a dead source becomes a failure", async () => {
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const foreign = createConversationContextRecord({
    attribution: {
      actualCommitSequence: "9",
      definitionDigest: "c".repeat(64),
      kind: "query",
      resultDigest: "d".repeat(64),
    },
    payload: { notes: ["secret"], rivals: [], type: "world" },
    retention: "authority",
    scope: { kind: "tenant", tenantId: "tenant.other" },
    trustClass: "world",
  });
  const assembler = createConversationContextAssembler({
    now,
    sources: [
      staticSource("foreign", [foreign]),
      {
        id: "dead",
        async retrieve() {
          throw new Error("source down");
        },
      },
    ],
  });
  const assembled = await assembler.assembleBound({
    attemptId: "att_t",
    audienceKind: "dm",
    claimedInteractionIds: ["ixn_t"],
    conversationKey: "ck_src",
    inbound: { kind: "text", text: "oi" },
    instructions: "x",
    locale: "pt",
    membership: membership("tenant"),
  });
  assert.ok(
    assembled.document.dropped.some((drop) => drop.reason === "wrong_tenant"),
  );
  assert.deepEqual(assembled.document.failures, [
    { code: "unavailable", sourceId: "dead" },
  ]);
});

test("account scope without tenant disappears on enterprise assemble", () => {
  const ctx = membership("scope");
  const denied = allowConversationScope({
    conversationKey: "ck_src",
    membership: ctx,
    scope: { accountId: ctx.accountId, kind: "account" },
    workspaceKind: "enterprise",
  });
  assert.deepEqual(denied, { ok: false, reason: "audience" });
  const allowed = allowConversationScope({
    conversationKey: "ck_src",
    membership: ctx,
    scope: {
      accountId: ctx.accountId,
      kind: "account",
      tenantId: String(ctx.tenantId),
    },
    workspaceKind: "enterprise",
  });
  assert.deepEqual(allowed, { ok: true });
});

test("tenantId equal to the provider thread is refused before assemble", async () => {
  const ctx = membership("thread");
  const bad: TrustedInteractionContext = {
    ...ctx,
    tenantId: tenantIdString(String(ctx.channel.thread)),
  };
  const assembler = createConversationContextAssembler();
  await assert.rejects(
    () =>
      assembler.assembleBound({
        attemptId: "att_bad",
        audienceKind: "dm",
        claimedInteractionIds: ["ixn_bad"],
        conversationKey: "ck_src",
        inbound: { kind: "text", text: "oi" },
        instructions: "x",
        locale: "pt",
        membership: bad,
      }),
    /tenantId must not equal provider thread/,
  );
});
