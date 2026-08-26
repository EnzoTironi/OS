import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationKeyFromKind,
  conversationKind,
  conversationKindFromChannel,
} from "./conversation-kind.js";
import {
  assembleTurnContext,
  createConversationContextAssembler,
  defaultConversationSources,
} from "./context-assembler.js";
import {
  conversationContextHash,
  createConversationContextRecord,
} from "./context-document.js";
import {
  conversationKeyFrom,
  interactionId,
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
} from "./brands.js";
import { createConversationTurnCoordinator } from "./turn-coordinator.js";
import { createMemoryTurnStore } from "./turn-store.js";
import type { InteractionRecord, TrustedInteractionContext } from "./types.js";

function membership(input: {
  readonly group?: boolean;
  readonly thread: string;
}): TrustedInteractionContext {
  const thread = providerThreadRef(input.thread);
  return {
    accountId: "account.wa.enzo",
    actorId: "actor.personal",
    bindingId: "binding.wa.enzo",
    channel: {
      provider: providerKey("whatsapp"),
      providerUser: providerUserRef("553199941160@s.whatsapp.net"),
      receivedAt: "2026-08-26T15:00:00.000Z",
      thread,
      ...(input.group === true ? { group: { thread } } : {}),
    },
    membershipId: "membership.wa.enzo",
    principalId: principalIdString("principal.wa.enzo"),
    tenantId: tenantIdString("tenant.wa.enzo"),
    workloadId: "workload.personal",
  };
}

function record(
  ctx: TrustedInteractionContext,
  text: string,
  nonce: string,
): InteractionRecord {
  return {
    acceptedAt: "2026-08-26T15:00:00.000Z",
    ctx,
    id: interactionId(`ixn_${nonce}`),
    inbound: {
      audienceObservation: { kind: ctx.channel.group === undefined ? "dm" : "group" },
      body: { kind: "text", text },
      channel: ctx.channel,
      idempotencyKey: `idem_${nonce}`,
    },
    semanticCorrelationKey: `corr_${nonce}`,
  };
}

function keyFor(ctx: TrustedInteractionContext) {
  return conversationKeyFromKind({
    accountId: ctx.accountId,
    kind: conversationKindFromChannel(ctx.channel),
    provider: String(ctx.channel.provider),
    tenantId: String(ctx.tenantId),
    workspaceId: ctx.workloadId,
  });
}

test("reboot recovery reassembles the same contextRef and contextDigest", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const assembler = createConversationContextAssembler({
    now,
    sources: defaultConversationSources({ store }),
  });
  const coordinator = createConversationTurnCoordinator({
    assembler,
    debounceMs: 0,
    now,
    store,
  });
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const conversationKey = keyFor(ctx);
  await coordinator.signalInbound({
    conversationKey,
    record: record(ctx, "oi", "reboot1"),
    workspaceId: ctx.workloadId,
  });
  const flushed = await coordinator.flush(conversationKey);
  assert.ok(flushed);
  assert.ok(flushed.attempt.contextRef);
  assert.match(flushed.attempt.contextDigest ?? "", /^[0-9a-f]{64}$/);
  assert.equal(flushed.attempt.contextHash, flushed.attempt.contextDigest);

  const restarted = createConversationTurnCoordinator({
    assembler,
    debounceMs: 0,
    now,
    store,
  });
  const persisted = await store.getAttempt(flushed.attempt.id);
  assert.ok(persisted);
  const envelope = await assembleTurnContext({
    assembler,
    attempt: persisted,
    store,
  });
  assert.equal(envelope.contextDigest, persisted.contextDigest);
  assert.equal(envelope.contextRef, persisted.contextRef);
  assert.equal(
    envelope.contextDigest,
    conversationContextHash(envelope.document),
  );
  assert.equal(restarted === coordinator, false);
});

test("one inbound burst produces one envelope and cancelDebounce keeps the pending rows", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const assembler = createConversationContextAssembler({
    now,
    sources: defaultConversationSources({ store }),
  });
  const coordinator = createConversationTurnCoordinator({
    assembler,
    debounceMs: 10_000,
    now,
    store,
  });
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const conversationKey = keyFor(ctx);
  await coordinator.signalInbound({
    conversationKey,
    record: record(ctx, "um", "burst1"),
    workspaceId: ctx.workloadId,
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record(ctx, "dois", "burst2"),
    workspaceId: ctx.workloadId,
  });
  await coordinator.cancelDebounce(conversationKey);
  const pending = await store.selectUnclaimed(conversationKey);
  assert.equal(pending.length, 2);
  const flushed = await coordinator.flush(conversationKey);
  assert.ok(flushed);
  assert.equal(flushed.attempt.claimedInteractionIds.length, 2);
  assert.ok(flushed.attempt.contextRef);
  assert.match(flushed.attempt.contextDigest ?? "", /^[0-9a-f]{64}$/);
  const attempts = await store.listAttempts(conversationKey);
  const assembled = attempts.filter((row) => row.contextDigest !== undefined);
  assert.equal(assembled.length, 1);
});

test("1:1 and group kinds isolate keys and group assemble drops personal_memory", async () => {
  const dmKind = conversationKind({
    kind: "one_to_one",
    subject: "553199941160@s.whatsapp.net",
  });
  const groupKind = conversationKind({
    groupJid: "120363-group@g.us",
    kind: "group",
  });
  const base = {
    accountId: "account.wa.enzo",
    provider: "whatsapp",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  };
  assert.notEqual(
    conversationKeyFromKind({ ...base, kind: dmKind }),
    conversationKeyFromKind({ ...base, kind: groupKind }),
  );
  assert.equal(
    conversationKeyFromKind({ ...base, kind: dmKind }),
    conversationKeyFrom({
      accountId: base.accountId,
      conversationId: "whatsapp:553199941160@s.whatsapp.net",
      tenantId: base.tenantId,
      workspaceId: base.workspaceId,
    }),
  );

  const memory = createConversationContextRecord({
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
    trustClass: "personal_memory",
  });
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const assembler = createConversationContextAssembler({
    now,
    sources: [
      {
        id: "personal_memory",
        async retrieve() {
          return [memory];
        },
      },
    ],
  });
  const groupCtx = membership({
    group: true,
    thread: "120363-group@g.us",
  });
  const assembled = await assembler.assembleBound({
    attemptId: "att_iso",
    audienceKind: "group",
    claimedInteractionIds: ["ixn_iso"],
    conversationKey: conversationKeyFromKind({
      ...base,
      kind: conversationKindFromChannel(groupCtx.channel),
    }),
    conversationKind: conversationKindFromChannel(groupCtx.channel),
    inbound: { kind: "text", text: "oi" },
    instructions: "x",
    locale: "pt",
    membership: groupCtx,
  });
  assert.equal(
    assembled.document.records.some(
      (row) => row.trustClass === "personal_memory",
    ),
    false,
  );
  assert.ok(assembled.document.dropped.some((drop) => drop.reason === "audience"));
});

test("token budget changes the digest and instruction copy does not", async () => {
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const knowledge = createConversationContextRecord({
    attribution: {
      actualCommitSequence: "1",
      definitionDigest: "5".repeat(64),
      kind: "query",
      resultDigest: "6".repeat(64),
    },
    payload: { admitted: false, text: "k".repeat(80), type: "knowledge" },
    retention: "preference",
    scope: { kind: "tenant", tenantId: "tenant.wa.enzo" },
    trustClass: "knowledge",
  });
  const source = {
    id: "knowledge",
    async retrieve() {
      return [knowledge];
    },
  };
  const wide = createConversationContextAssembler({
    budget: 6000,
    now,
    sources: [source],
  });
  const tight = createConversationContextAssembler({
    budget: 0,
    now,
    sources: [source],
  });
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const input = {
    attemptId: "att_d",
    audienceKind: "dm" as const,
    claimedInteractionIds: ["ixn_d"],
    conversationKey: "ck_src",
    inbound: { kind: "text" as const, text: "oi" },
    locale: "pt" as const,
    membership: ctx,
  };
  const left = await wide.assembleBound({
    ...input,
    instructions: "you are zoen",
  });
  const sameCopy = await wide.assembleBound({
    ...input,
    instructions: "copy changed without data change",
  });
  const right = await tight.assembleBound({
    ...input,
    instructions: "you are zoen",
  });
  assert.equal(left.contextDigest, sameCopy.contextDigest);
  assert.notEqual(left.contextDigest, right.contextDigest);
  assert.ok(right.document.dropped.some((drop) => drop.reason === "budget"));
});

test("conversationContext metric is structured JSON without inbound text", async () => {
  const lines: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const assembler = createConversationContextAssembler({
      now: () => new Date("2026-08-26T15:00:00.000Z"),
    });
    await assembler.assembleBound({
      attemptId: "att_metric",
      audienceKind: "dm",
      claimedInteractionIds: ["ixn_metric"],
      conversationKey: "ck_metric",
      inbound: { kind: "text", text: "secret inbound text" },
      instructions: "x",
      locale: "pt",
      membership: membership({
        thread: "553199941160@s.whatsapp.net",
      }),
    });
  } finally {
    process.stderr.write = original;
  }
  const parsed = lines
    .map((line) => {
      try {
        return JSON.parse(line) as { event?: string };
      } catch {
        return undefined;
      }
    })
    .find((row) => row?.event === "conversationContext") as
    | {
        readonly audienceKind: string;
        readonly contextDigest: string;
        readonly contextRef: string;
        readonly conversationKind: string;
        readonly droppedCount: number;
        readonly event: string;
        readonly failureCount: number;
        readonly recordCount: number;
        readonly tokenBudget: number;
      }
    | undefined;
  assert.ok(parsed);
  assert.equal(parsed.event, "conversationContext");
  assert.equal(parsed.conversationKind, "one_to_one");
  assert.equal(parsed.contextRef, "ck_metric:att_metric");
  assert.match(parsed.contextDigest, /^[0-9a-f]{64}$/);
  assert.equal(parsed.tokenBudget, 6000);
  assert.equal(JSON.stringify(parsed).includes("secret inbound text"), false);
});
