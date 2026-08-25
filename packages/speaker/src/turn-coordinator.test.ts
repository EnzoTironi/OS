import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationKeyFrom,
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
