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
  createLiveConversationAssembler,
  defaultConversationSources,
  RECENT_CONVERSATION_INTERACTION_LIMIT,
} from "./context-assembler.js";
import {
  conversationContextHash,
  createConversationContextRecord,
} from "./context-document.js";
import {
  conversationKeyFrom,
  conversationTurnId,
  interactionId,
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
  turnAttemptId,
} from "./brands.js";
import { createConversationTurnCoordinator } from "./turn-coordinator.js";
import { createMemoryTurnStore, type TurnStore } from "./turn-store.js";
import type { InteractionRecord, TrustedInteractionContext } from "./types.js";
import type { WorldQueryClient } from "./world-query.js";

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

async function putClaimed(
  store: TurnStore,
  ctx: TrustedInteractionContext,
  stored: InteractionRecord,
  nonce: string,
): Promise<void> {
  await store.putRecord(stored);
  await store.putAttempt({
    carryForwardInteractionIds: [],
    claimedInteractionIds: [stored.id],
    conversationKey: keyFor(ctx),
    id: turnAttemptId(`att_${nonce}`),
    observedCommitRefs: [],
    openedAt: stored.acceptedAt,
    phase: { kind: "completed" },
    turnId: conversationTurnId(`turn_${nonce}`),
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

test("wa conversationId still includes durable claimed and carry-forward text", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const claimed = record(ctx, "agora", "now");
  const carry = record(ctx, "antes", "old");
  await store.putRecord(claimed);
  await store.putRecord(carry);
  const conversationKey = conversationKeyFrom({
    accountId: ctx.accountId,
    conversationId: `wa:${String(ctx.channel.thread)}`,
    tenantId: String(ctx.tenantId),
    workspaceId: ctx.workloadId,
  });
  assert.notEqual(conversationKey, keyFor(ctx));
  const envelope = await assembleTurnContext({
    assembler: createConversationContextAssembler({
      now,
      sources: defaultConversationSources({ store }),
    }),
    attempt: {
      carryForwardInteractionIds: [carry.id],
      claimedInteractionIds: [claimed.id],
      conversationKey,
      id: turnAttemptId("att_wa"),
      observedCommitRefs: [],
      openedAt: "2026-08-26T15:00:00.000Z",
      phase: { kind: "assembling_context" },
      turnId: conversationTurnId("turn_wa"),
    },
    membership: ctx,
    store,
  });
  const texts = envelope.document.records.flatMap((row) => {
    if (row.payload.type !== "interaction" || row.payload.text === undefined) {
      return [];
    }
    return [row.payload.text];
  });
  assert.equal(texts.includes("agora"), true);
  assert.equal(texts.includes("antes"), true);
});

test("interaction source drops a group thread from a 1:1 assemble", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const dm = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const group = membership({
    group: true,
    thread: "120363-group@g.us",
  });
  const dmRec = record(dm, "privado", "dm1");
  const groupRec = record(group, "grupo", "g1");
  await store.putRecord(dmRec);
  await store.putRecord(groupRec);
  const assembled = await createConversationContextAssembler({
    now,
    sources: defaultConversationSources({ store }),
  }).assembleBound({
    attemptId: "att_iso_src",
    audienceKind: "dm",
    claimedInteractionIds: [String(dmRec.id), String(groupRec.id)],
    conversationKey: keyFor(dm),
    conversationKind: conversationKindFromChannel(dm.channel),
    inbound: { kind: "text", text: "privado" },
    instructions: "x",
    locale: "pt",
    membership: dm,
  });
  const texts = assembled.document.records.flatMap((row) => {
    if (row.payload.type !== "interaction" || row.payload.text === undefined) {
      return [];
    }
    return [row.payload.text];
  });
  assert.equal(texts.includes("privado"), true);
  assert.equal(texts.includes("grupo"), false);
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

test("assembler without world yields only inbound", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const inbound = record(ctx, "oi", "only-inbound");
  await store.putRecord(inbound);
  const envelope = await assembleTurnContext({
    assembler: createLiveConversationAssembler({
      now,
      store,
    }),
    attempt: {
      carryForwardInteractionIds: [],
      claimedInteractionIds: [inbound.id],
      conversationKey: keyFor(ctx),
      id: turnAttemptId("att_no_world"),
      observedCommitRefs: [],
      openedAt: "2026-08-26T15:00:00.000Z",
      phase: { kind: "assembling_context" },
      turnId: conversationTurnId("turn_no_world"),
    },
    inbound: { kind: "text", text: "oi" },
    membership: ctx,
    store,
  });
  const classes = new Set(
    envelope.document.records.map((row) => row.trustClass),
  );
  assert.deepEqual([...classes].sort(), ["instruction", "interaction"]);
  assert.equal(envelope.document.records.length, 2);
  assert.doesNotMatch(envelope.projection.data, /trustClass: world/);
  assert.doesNotMatch(envelope.projection.data, /trustClass: personal_memory/);
  assert.match(envelope.projection.data, /text: oi/);
});

test("assembler with world client projects a world block", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const inbound = record(ctx, "quanto ficou", "world-block");
  await store.putRecord(inbound);
  const world: WorldQueryClient = {
    async semanticQuery() {
      return {
        entityIds: ["commercial.order-line.dirty-quote"],
        notes: ["10 each"],
        rivals: [{ label: "source.sheet" }],
      };
    },
  };
  const envelope = await assembleTurnContext({
    assembler: createConversationContextAssembler({
      now,
      sources: defaultConversationSources({ store, world }),
    }),
    attempt: {
      carryForwardInteractionIds: [],
      claimedInteractionIds: [inbound.id],
      conversationKey: keyFor(ctx),
      id: turnAttemptId("att_world"),
      observedCommitRefs: [],
      openedAt: "2026-08-26T15:00:00.000Z",
      phase: { kind: "assembling_context" },
      turnId: conversationTurnId("turn_world"),
    },
    inbound: { kind: "text", text: "quanto ficou" },
    membership: ctx,
    store,
  });
  assert.match(envelope.projection.data, /trustClass: world/);
  assert.match(envelope.projection.data, /source\.sheet/);
  assert.match(envelope.projection.data, /10 each/);
  assert.doesNotMatch(envelope.projection.data, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(envelope.projection.data, /trustClass: personal_memory/);
});

test("prior conversation messages appear when the store has older records for the same key", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const other = membership({
    thread: "553188888888@s.whatsapp.net",
  });
  const older = {
    ...record(ctx, "quanto ficou", "prior-old"),
    acceptedAt: "2026-08-26T14:00:00.000Z",
  };
  const current = {
    ...record(ctx, "oi", "prior-now"),
    acceptedAt: "2026-08-26T15:00:00.000Z",
  };
  const decoy = record(other, "segredo de outra conversa", "prior-decoy");
  await store.putRecord(current);
  await store.putRecord(decoy);
  await putClaimed(store, ctx, older, "prior-old");
  for (let index = 0; index < RECENT_CONVERSATION_INTERACTION_LIMIT + 2; index += 1) {
    await putClaimed(
      store,
      ctx,
      {
        ...record(ctx, `antigo ${String(index)}`, `prior-extra-${String(index)}`),
        acceptedAt: `2026-08-26T13:${String(index).padStart(2, "0")}:00.000Z`,
      },
      `prior-extra-${String(index)}`,
    );
  }
  const envelope = await assembleTurnContext({
    assembler: createLiveConversationAssembler({
      now,
      store,
    }),
    attempt: {
      carryForwardInteractionIds: [],
      claimedInteractionIds: [current.id],
      conversationKey: keyFor(ctx),
      id: turnAttemptId("att_prior"),
      observedCommitRefs: [],
      openedAt: "2026-08-26T15:00:00.000Z",
      phase: { kind: "assembling_context" },
      turnId: conversationTurnId("turn_prior"),
    },
    inbound: { kind: "text", text: "oi" },
    membership: ctx,
    store,
  });
  const texts = envelope.document.records.flatMap((row) => {
    if (row.payload.type !== "interaction" || row.payload.text === undefined) {
      return [];
    }
    return [row.payload.text];
  });
  assert.equal(texts.includes("oi"), true);
  assert.equal(texts.includes("quanto ficou"), true);
  assert.equal(texts.includes("segredo de outra conversa"), false);
  assert.equal(texts.includes("antigo 0"), false);
  assert.ok(
    texts.filter((text) => text.startsWith("antigo ")).length <=
      RECENT_CONVERSATION_INTERACTION_LIMIT,
  );
});

test("prior speaker bubbles ride the next assemble so a parse cannot be invented", async () => {
  const store = createMemoryTurnStore();
  const now = () => new Date("2026-08-26T15:00:00.000Z");
  const ctx = membership({
    thread: "553199941160@s.whatsapp.net",
  });
  const quote = {
    ...record(ctx, "quanto tá a cotação?", "spoken-in"),
    acceptedAt: "2026-08-26T14:50:00.000Z",
  };
  const recall = {
    ...record(ctx, "O que acabamos de tentar fazer?", "spoken-now"),
    acceptedAt: "2026-08-26T14:51:00.000Z",
  };
  await store.putRecord(quote);
  await store.putRecord(recall);
  await store.putAttempt({
    carryForwardInteractionIds: [],
    claimedInteractionIds: [quote.id],
    conversationKey: keyFor(ctx),
    id: turnAttemptId("att_spoken_old"),
    observedCommitRefs: [],
    openedAt: "2026-08-26T14:50:00.000Z",
    phase: { kind: "completed" },
    spokenBubbles: ["tem 10 each e 12 each", "https://example.com/approve"],
    turnId: conversationTurnId("turn_spoken_old"),
  });
  const envelope = await assembleTurnContext({
    assembler: createLiveConversationAssembler({
      now,
      store,
    }),
    attempt: {
      carryForwardInteractionIds: [],
      claimedInteractionIds: [recall.id],
      conversationKey: keyFor(ctx),
      id: turnAttemptId("att_spoken_now"),
      observedCommitRefs: [],
      openedAt: "2026-08-26T14:51:00.000Z",
      phase: { kind: "assembling_context" },
      turnId: conversationTurnId("turn_spoken_now"),
    },
    inbound: { kind: "text", text: "O que acabamos de tentar fazer?" },
    membership: ctx,
    store,
  });
  assert.match(envelope.projection.data, /speaker: yes/);
  assert.match(envelope.projection.data, /tem 10 each e 12 each/);
  assert.match(envelope.projection.data, /quanto tá a cotação\?/);
  assert.doesNotMatch(envelope.projection.data, /anotar|agendar|parse/i);
  assert.doesNotMatch(envelope.projection.data, /primeira mensagem/i);
});
