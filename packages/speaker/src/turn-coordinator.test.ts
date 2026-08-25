import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationKeyFrom,
  deliveryGroupId,
  interactionId,
  principalIdString,
  providerKey,
  providerMessageRef,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
} from "./brands.js";
import { createConversationTurnCoordinator } from "./turn-coordinator.js";
import { createMemoryTurnStore } from "./turn-store.js";
import type { InteractionRecord, TrustedInteractionContext } from "./types.js";

function ctx(): TrustedInteractionContext {
  return {
    accountId: "account.wa.enzo",
    actorId: "actor.personal",
    bindingId: "binding.wa.enzo",
    channel: {
      provider: providerKey("whatsapp"),
      providerUser: providerUserRef("553199941160@s.whatsapp.net"),
      receivedAt: "2026-08-25T02:28:12.000Z",
      thread: providerThreadRef("553199941160@s.whatsapp.net"),
    },
    membershipId: "membership.wa.enzo",
    principalId: principalIdString("principal.wa.enzo"),
    tenantId: tenantIdString("tenant.wa.enzo"),
    workloadId: "workload.personal",
  };
}

function record(text: string, nonce: string): InteractionRecord {
  const trusted = ctx();
  return {
    acceptedAt: "2026-08-25T02:28:12.000Z",
    ctx: trusted,
    id: interactionId(`ixn_${nonce}`),
    inbound: {
      audienceObservation: { kind: "dm" },
      body: { kind: "text", text },
      channel: trusted.channel,
      idempotencyKey: `idem_${nonce}`,
    },
    semanticCorrelationKey: `corr_${nonce}`,
  };
}

test("coordinator debounce does not flush before the timer", async () => {
  const store = createMemoryTurnStore();
  let delivered = 0;
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 10_000,
    deliver: async () => {
      delivered += 1;
      return {
        kind: "accepted",
        providerMessage: providerMessageRef("pm_debounce"),
      };
    },
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:debounce",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("Oi", "debounce1"),
    workspaceId: "workload.personal",
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 25);
  });
  assert.equal(delivered, 0);
  const pending = await store.selectUnclaimed(conversationKey);
  assert.equal(pending.length, 1);
  await coordinator.cancelDebounce(conversationKey);
  const stillPending = await store.selectUnclaimed(conversationKey);
  assert.equal(stillPending.length, 1);
  assert.equal(delivered, 0);
});

test("coordinator merges a burst into one claimed turn", async () => {
  const store = createMemoryTurnStore();
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 10_000,
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:burst",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("um", "burst1"),
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("dois", "burst2"),
    workspaceId: "workload.personal",
  });
  const claimed = await coordinator.claimBurst(conversationKey);
  assert.ok(claimed);
  assert.equal(claimed.turn.interactionIds.length, 2);
  assert.equal(claimed.attempt.claimedInteractionIds.length, 2);
});

function createManualClock() {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];
  return {
    nowMs: () => now,
    schedule(fn: () => void, ms: number) {
      const timer = { at: now + ms, cancelled: false, fn };
      timers.push(timer);
      return {
        cancel() {
          timer.cancelled = true;
        },
      };
    },
    async advance(ms: number) {
      now += ms;
      const due = timers.filter((timer) => !timer.cancelled && timer.at <= now);
      for (const timer of due) {
        timer.cancelled = true;
        timer.fn();
      }
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("debounce claims at 1750ms and not at 1749ms", async () => {
  const store = createMemoryTurnStore();
  const clock = createManualClock();
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 1750,
    schedule: clock.schedule,
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:boundary",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("Oi", "bound1"),
    workspaceId: "workload.personal",
  });
  let resolved = false;
  const claimed = coordinator.awaitClaim(conversationKey).then((value) => {
    resolved = true;
    return value;
  });
  await clock.advance(1749);
  assert.equal(resolved, false);
  assert.equal((await store.selectUnclaimed(conversationKey)).length, 1);
  await clock.advance(1);
  const result = await claimed;
  assert.equal(resolved, true);
  assert.ok(result);
  assert.equal(result.attempt.claimedInteractionIds.length, 1);
  assert.equal((await store.selectUnclaimed(conversationKey)).length, 0);
});

test("inbound during delivering queues and does not supersede", async () => {
  const store = createMemoryTurnStore();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let enteredDeliver!: () => void;
  const entered = new Promise<void>((resolve) => {
    enteredDeliver = resolve;
  });
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 0,
    deliver: async () => {
      enteredDeliver();
      await gate;
      return {
        kind: "accepted",
        providerMessage: providerMessageRef("pm_deliver"),
      };
    },
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:delivering",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("um", "del1"),
    workspaceId: "workload.personal",
  });
  const first = await coordinator.awaitClaim(conversationKey);
  assert.ok(first);
  const delivering = coordinator.planAndDeliver({
    attemptId: first.attempt.id,
    presentation: "turn:deliver",
  });
  await entered;
  assert.equal((await store.getAttempt(first.attempt.id))?.phase.kind, "delivering");
  await coordinator.signalInbound({
    conversationKey,
    record: record("dois", "del2"),
    workspaceId: "workload.personal",
  });
  const open = await store.getAttempt(first.attempt.id);
  assert.equal(open?.phase.kind, "delivering");
  assert.equal((await store.selectUnclaimed(conversationKey)).length, 1);
  const laterClaim = coordinator.awaitClaim(conversationKey);
  release?.();
  await delivering;
  assert.equal((await store.getAttempt(first.attempt.id))?.phase.kind, "completed");
  const later = await laterClaim;
  assert.ok(later);
  assert.equal(later.attempt.claimedInteractionIds.length, 1);
  assert.notEqual(later.attempt.id, first.attempt.id);
});

test("recoverPending fails a delivering attempt and claims queued inbound", async () => {
  const store = createMemoryTurnStore();
  const first = createConversationTurnCoordinator({ debounceMs: 0, store });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:recover",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await first.signalInbound({
    conversationKey,
    record: record("um", "rec1"),
    workspaceId: "workload.personal",
  });
  const claimed = await first.awaitClaim(conversationKey);
  assert.ok(claimed);
  await store.putAttempt({
    ...claimed.attempt,
    phase: {
      deliveryGroupId: deliveryGroupId("dg_recover"),
      kind: "delivering",
    },
  });
  await first.signalInbound({
    conversationKey,
    record: record("dois", "rec2"),
    workspaceId: "workload.personal",
  });
  assert.equal((await store.getAttempt(claimed.attempt.id))?.phase.kind, "delivering");
  const recovered = createConversationTurnCoordinator({ debounceMs: 0, store });
  await recovered.recoverPending();
  const attempt = await store.getAttempt(claimed.attempt.id);
  assert.equal(attempt?.phase.kind, "failed");
  const queued = await recovered.awaitClaim(conversationKey);
  assert.ok(queued);
  assert.notEqual(queued.attempt.id, claimed.attempt.id);
  assert.equal(queued.attempt.claimedInteractionIds.length, 1);
});

test("inbound during planning_delivery supersedes the open attempt", async () => {
  const store = createMemoryTurnStore();
  const coordinator = createConversationTurnCoordinator({ debounceMs: 0, store });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:supersede",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("um", "sup1"),
    workspaceId: "workload.personal",
  });
  const first = await coordinator.awaitClaim(conversationKey);
  assert.ok(first);
  await coordinator.advanceStage(first.attempt.id, "planning_delivery");
  await coordinator.signalInbound({
    conversationKey,
    record: record("dois", "sup2"),
    workspaceId: "workload.personal",
  });
  const superseded = await store.getAttempt(first.attempt.id);
  assert.equal(superseded?.phase.kind, "superseded");
  const second = await coordinator.awaitClaim(conversationKey);
  assert.ok(second);
  assert.notEqual(second.attempt.id, first.attempt.id);
  assert.equal(second.attempt.claimedInteractionIds.length, 1);
});

test("pre-send claim prevents a second deliver of the same stable id", async () => {
  const store = createMemoryTurnStore();
  let sends = 0;
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 0,
    deliver: async () => {
      sends += 1;
      return {
        kind: "accepted",
        providerMessage: providerMessageRef(`pm_${sends}`),
      };
    },
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:claim",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("Oi", "claim1"),
    workspaceId: "workload.personal",
  });
  const claimed = await coordinator.awaitClaim(conversationKey);
  assert.ok(claimed);
  await coordinator.planAndDeliver({
    attemptId: claimed.attempt.id,
    presentation: "turn:claim",
  });
  const again = await store.claimDelivery(`spd_${claimed.attempt.id}_0`);
  assert.equal(again, "duplicate");
  assert.equal(sends, 1);
});

test("deliver throw marks the attempt failed", async () => {
  const store = createMemoryTurnStore();
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 0,
    deliver: async () => {
      throw new Error("provider down");
    },
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:fail",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("Oi", "fail1"),
    workspaceId: "workload.personal",
  });
  const claimed = await coordinator.awaitClaim(conversationKey);
  assert.ok(claimed);
  await assert.rejects(
    () =>
      coordinator.planAndDeliver({
        attemptId: claimed.attempt.id,
        presentation: "turn:fail",
      }),
    /provider down/,
  );
  const attempt = await store.getAttempt(claimed.attempt.id);
  assert.equal(attempt?.phase.kind, "failed");
});

test("silent close is durable and does not send", async () => {
  const store = createMemoryTurnStore();
  let sends = 0;
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 0,
    deliver: async () => {
      sends += 1;
      return {
        kind: "accepted",
        providerMessage: providerMessageRef("pm_wait"),
      };
    },
    store,
  });
  const conversationKey = conversationKeyFrom({
    accountId: "account.wa.enzo",
    conversationId: "wa:wait",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  });
  await coordinator.signalInbound({
    conversationKey,
    record: record("valeu", "wait1"),
    workspaceId: "workload.personal",
  });
  const claimed = await coordinator.awaitClaim(conversationKey);
  assert.ok(claimed);
  await coordinator.acknowledgeSilentClose(claimed.attempt.id);
  await coordinator.acknowledgeSilentClose(claimed.attempt.id);
  assert.equal(sends, 0);
  const attempt = await store.getAttempt(claimed.attempt.id);
  assert.equal(attempt?.phase.kind, "completed");
});
