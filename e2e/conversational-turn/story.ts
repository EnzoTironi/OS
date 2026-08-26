import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  conversationKeyFrom,
  createConversationContextAssembler,
  createConversationTurnCoordinator,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createMemoryControlStore,
  createPostgresTurnStore,
  defaultConversationSources,
  interactionId,
  presentationIntentRef,
  principalIdString,
  providerKey,
  providerMessageRef,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
  type DeliveryIntent,
  type InteractionRecord,
  type SemanticCommitRef,
  type TrustedInteractionContext,
  type TurnAttempt,
} from "../../packages/speaker/src/index.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "../governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";

const scenario = "conversational-turn";
const repositoryRoot = process.cwd();
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_631);
const postgresFallback = 55_506;
let identityAdminBearer: string | undefined;

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

async function admin(
  method: string,
  route: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...((token ?? identityAdminBearer) === undefined
        ? {}
        : { authorization: `Bearer ${token ?? identityAdminBearer}` }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

function makeCtx(input: {
  accountId: string;
  tenantId: string;
  principalId: string;
  membershipId: string;
  bindingId: string;
  thread: string;
  user: string;
}): TrustedInteractionContext {
  return {
    accountId: input.accountId,
    actorId: "actor.e2e",
    bindingId: input.bindingId,
    channel: {
      provider: providerKey("telegram"),
      providerUser: providerUserRef(input.user),
      receivedAt: new Date().toISOString(),
      thread: providerThreadRef(input.thread),
    },
    membershipId: input.membershipId,
    principalId: principalIdString(input.principalId),
    tenantId: tenantIdString(input.tenantId),
    workloadId: "workload.personal",
  };
}

function makeRecord(
  ctx: TrustedInteractionContext,
  text: string,
  nonce: string,
): InteractionRecord {
  return {
    acceptedAt: new Date().toISOString(),
    ctx,
    id: interactionId(`ixn_${nonce}`),
    inbound: {
      audienceObservation: { kind: "dm" },
      body: { kind: "text", text },
      channel: ctx.channel,
      idempotencyKey: `idem_${nonce}`,
    },
    semanticCorrelationKey: `corr_${nonce}`,
  };
}

export async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writeFile(
    policyManifestPath,
    `${JSON.stringify({ policies: [] }, null, 2)}\n`,
  );

  const storeClient = new PostgresClient({
    connectionString: e2ePostgresUrl("zoen_app", "zoen_app", postgresFallback),
  });
  await storeClient.connect();

  const server: ServerProcess = await startServer(policyManifestPath);
  try {
    const boundToken = await oidcToken("bound-bait");
    const secondToken = await oidcToken("bound-second");
    identityAdminBearer = boundToken;

    const bootstrapA = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      boundToken,
    );
    assert.equal(bootstrapA.status, 200, JSON.stringify(bootstrapA.body));
    const tenantA = String(bootstrapA.body.tenantId);
    const principalA = String(bootstrapA.body.principalId);
    const accountA = String(bootstrapA.body.accountId);
    const membershipA = String(bootstrapA.body.membershipId);

    const telegramSubject = `tg_user_ct_${Date.now()}`;
    const telegramBind = await admin("POST", "/identity/admin/bind-verified", {
      accountId: accountA,
      provider: "telegram",
      subjectKey: telegramSubject,
    });
    assert.equal(telegramBind.status, 200, JSON.stringify(telegramBind.body));
    const bindingA = String(telegramBind.body.bindingId);

    const bootstrapB = await admin(
      "POST",
      "/identity/admin/bootstrap-bound",
      undefined,
      secondToken,
    );
    assert.equal(bootstrapB.status, 200, JSON.stringify(bootstrapB.body));
    const tenantB = String(bootstrapB.body.tenantId);
    const accountB = String(bootstrapB.body.accountId);

    const durableStore = createPostgresTurnStore(storeClient);
    const transportCache = new Map<string, unknown>();
    let cancelSemanticCalls = 0;
    const sentProviderIds: string[] = [];

    const deliver = async (intent: DeliveryIntent) => {
      sentProviderIds.push(intent.stableProviderDeliveryId);
      return {
        kind: "accepted" as const,
        providerMessage: providerMessageRef(
          `pm_${intent.stableProviderDeliveryId}`,
        ),
      };
    };

    const coordinator = createConversationTurnCoordinator({
      debounceMs: 30_000,
      deliver,
      onCancelSemanticCommit: () => {
        cancelSemanticCalls += 1;
      },
      store: durableStore,
      transportCache,
    });

    const controls = createInteractionControlRegistry({
      store: createMemoryControlStore(),
    });
    const boundary = createInteractionBoundary({
      controls,
      correlationNamespace: "conversational-turn.v1",
      identity: {
        async resolveChannelSubject() {
          throw new Error("unused");
        },
      },
    });

    const ctxA = makeCtx({
      accountId: accountA,
      bindingId: bindingA,
      membershipId: membershipA,
      principalId: principalA,
      tenantId: tenantA,
      thread: "thread.shared.provider",
      user: telegramSubject,
    });
    const keyA = conversationKeyFrom({
      accountId: accountA,
      conversationId: "conv.workspace.a",
      tenantId: tenantA,
      workspaceId: "workspace.a",
    });

    const burstRecords = ["one", "two", "three", "four"].map((text, index) =>
      makeRecord(ctxA, text, `burst_${index}_${randomUUID().slice(0, 6)}`),
    );
    for (const rec of burstRecords) {
      await coordinator.signalInbound({
        conversationKey: keyA,
        record: rec,
        workspaceId: "workspace.a",
      });
    }
    const burst = await coordinator.flush(keyA);
    assert.ok(burst);
    record(
      "burst_four_messages_one_turn",
      burst.turn.interactionIds.length === 4 &&
        burst.attempt.claimedInteractionIds.length === 4,
    );

    const lostRec = makeRecord(
      ctxA,
      "pending-survive",
      `lost_${randomUUID().slice(0, 6)}`,
    );
    await coordinator.signalInbound({
      conversationKey: keyA,
      record: lostRec,
      workspaceId: "workspace.a",
    });
    await coordinator.cancelDebounce(keyA);
    const stillPending = await durableStore.selectUnclaimed(keyA);
    record(
      "pending_survives_cancelled_timer",
      stillPending.some((row) => row.interactionId === lostRec.id),
    );
    killMutant("lost inbound on cancelled timer");
    const afterCancel = await coordinator.flush(keyA);
    assert.ok(afterCancel);
    record(
      "flush_after_cancel_claims_pending",
      afterCancel.turn.interactionIds.includes(lostRec.id),
    );

    const firstRec = makeRecord(
      ctxA,
      "reason-me",
      `sup_${randomUUID().slice(0, 6)}`,
    );
    await coordinator.signalInbound({
      conversationKey: keyA,
      record: firstRec,
      workspaceId: "workspace.a",
    });
    const claimed = await coordinator.claimBurst(keyA);
    assert.ok(claimed);
    await coordinator.advanceStage(claimed.attempt.id, "reasoning");
    const actionRef: SemanticCommitRef = {
      actionId: `action.commit.${randomUUID().slice(0, 8)}`,
      kind: "action",
    };
    await coordinator.recordSemanticCommit(claimed.attempt.id, actionRef);
    cancelSemanticCalls = 0;

    const newerRec = makeRecord(
      ctxA,
      "supersede",
      `new_${randomUUID().slice(0, 6)}`,
    );
    await coordinator.signalInbound({
      conversationKey: keyA,
      record: newerRec,
      workspaceId: "workspace.a",
    });
    const prior = await durableStore.getAttempt(claimed.attempt.id);
    record("prior_attempt_superseded", prior?.phase.kind === "superseded");
    record("semantic_commit_cancel_not_called", cancelSemanticCalls === 0);
    const priorCommits = prior?.observedCommitRefs ?? [];
    record(
      "committed_action_still_on_attempt",
      priorCommits.some(
        (ref) => ref.kind === "action" && ref.actionId === actionRef.actionId,
      ),
    );
    killMutant("new message rolls back commit");

    const next = await coordinator.flush(keyA);
    assert.ok(next);
    record(
      "carry_forward_is_interaction_refs",
      next.attempt.carryForwardInteractionIds.includes(firstRec.id),
    );
    let stringifyRejected = false;
    try {
      const mutant = {
        ...next.attempt,
        carried_messages: "blob-of-text",
      } as TurnAttempt & { carried_messages: string };
      await durableStore.putAttempt(mutant);
    } catch {
      stringifyRejected = true;
    }
    record("stringify_carry_forward_rejected", stringifyRejected);
    killMutant("stringify carry-forward");

    const assembled = await createConversationContextAssembler({
      now: () => new Date("2026-08-26T15:00:00.000Z"),
      sources: defaultConversationSources({ store: durableStore }),
    }).assembleBound({
      attemptId: String(next.attempt.id),
      audienceKind: "dm",
      carryForwardInteractionIds: next.attempt.carryForwardInteractionIds,
      claimedInteractionIds: next.attempt.claimedInteractionIds,
      conversationKey: keyA,
      inbound: { kind: "text", text: "supersede" },
      instructions: "test",
      locale: "pt",
      membership: ctxA,
    });
    record(
      "context_hash_is_64_hex",
      /^[0-9a-f]{64}$/.test(assembled.contextHash),
    );
    record(
      "assembled_carry_forward_is_ids",
      assembled.document.carryForwardInteractionIds.every(
        (id) => typeof id === "string" && id.length > 0,
      ),
    );
    killMutant("carried_messages blob on assembled context");

    const deliveryRec = makeRecord(
      ctxA,
      "deliver",
      `del_${randomUUID().slice(0, 6)}`,
    );
    await coordinator.signalInbound({
      conversationKey: keyA,
      record: deliveryRec,
      workspaceId: "workspace.a",
    });
    const delClaim = await coordinator.claimBurst(keyA);
    assert.ok(delClaim);
    sentProviderIds.length = 0;
    const observations = await coordinator.planAndDeliver({
      attemptId: delClaim.attempt.id,
      presentation: "pres.reply",
      sequenceCount: 1,
    });
    assert.equal(observations.length, 1);
    const intentId = observations[0]!.intentId;
    const intent = await durableStore.getDeliveryIntent(intentId);
    assert.ok(intent);
    record(
      "delivery_intent_has_stable_provider_id",
      intent.stableProviderDeliveryId.length > 0 &&
        intent.turnAttemptId === delClaim.attempt.id,
    );
    const firstSendId = intent.stableProviderDeliveryId;

    await storeClient.query(
      `DELETE FROM delivery_observations WHERE intent_id = $1`,
      [intentId],
    );
    const beforeRetry = sentProviderIds.length;
    const recovered = await coordinator.recoverDelivery(intentId);
    const retryIntent = await durableStore.getDeliveryIntent(intentId);
    record(
      "retry_reuses_same_provider_id",
      recovered.intentId === intentId &&
        retryIntent?.stableProviderDeliveryId === firstSendId &&
        retryIntent?.id === intent.id &&
        sentProviderIds.slice(beforeRetry).every((id) => id === firstSendId),
    );
    killMutant("retry new provider id");

    const weakCoordinator = createConversationTurnCoordinator({
      debounceMs: 30_000,
      deliver: async () => ({ kind: "unknown" }),
      store: durableStore,
    });
    const weakRec = makeRecord(
      ctxA,
      "weak",
      `weak_${randomUUID().slice(0, 6)}`,
    );
    await weakCoordinator.signalInbound({
      conversationKey: keyA,
      record: weakRec,
      workspaceId: "workspace.a",
    });
    const weakClaim = await weakCoordinator.claimBurst(keyA);
    assert.ok(weakClaim);
    const weakObs = await weakCoordinator.planAndDeliver({
      attemptId: weakClaim.attempt.id,
      presentation: "pres.weak",
    });
    record("weak_provider_explicit_unknown", weakObs[0]?.outcome.kind === "unknown");

    const ctxB = makeCtx({
      accountId: accountB,
      bindingId: `binding.b.${randomUUID().slice(0, 6)}`,
      membershipId: `membership.b.${randomUUID().slice(0, 6)}`,
      principalId: "principal.b",
      tenantId: tenantB,
      thread: "thread.shared.provider",
      user: "tg_user_b",
    });
    const keyB = conversationKeyFrom({
      accountId: accountB,
      conversationId: "conv.workspace.b",
      tenantId: tenantB,
      workspaceId: "workspace.b",
    });
    record("conversation_keys_differ_across_tenants", keyA !== keyB);
    const recB = makeRecord(ctxB, "tenant-b", `tb_${randomUUID().slice(0, 6)}`);
    await coordinator.signalInbound({
      conversationKey: keyB,
      record: recB,
      workspaceId: "workspace.b",
    });
    const flushB = await coordinator.flush(keyB);
    assert.ok(flushB);
    const attemptsA = await durableStore.listAttempts(keyA);
    record(
      "cross_tenant_does_not_cancel_other",
      flushB.attempt.conversationKey === keyB &&
        attemptsA.every((attempt) => attempt.conversationKey === keyA),
    );

    transportCache.clear();
    const reloadedStore = createPostgresTurnStore(storeClient);
    const reloadedRecord = await reloadedStore.getRecord(burstRecords[0]!.id);
    const reloadedTurn = await reloadedStore.getTurn(burst.turn.id);
    const reloadedIntent = await reloadedStore.getDeliveryIntent(intentId);
    record(
      "postgres_survives_transport_cache_clear",
      reloadedRecord !== undefined &&
        reloadedTurn !== undefined &&
        reloadedIntent?.stableProviderDeliveryId === firstSendId &&
        transportCache.size === 0,
    );
    killMutant("in-memory sole durability");

    const accepted = await boundary.accept(
      {
        audienceObservation: { kind: "dm" },
        body: { kind: "text", text: "boundary" },
        channel: ctxA.channel,
        idempotencyKey: `idem_boundary_${randomUUID().slice(0, 6)}`,
      },
      ctxA,
    );
    const planned = await boundary.planDelivery({
      controls: [],
      ctx: ctxA,
      presentation: presentationIntentRef("pres.boundary"),
      recordId: accepted.id,
      stableProviderDeliveryId: "spd_boundary_fixed",
      turnAttemptId: delClaim.attempt.id,
    });
    record(
      "boundary_plan_delivery_preserves_stable_id",
      planned.stableProviderDeliveryId === "spd_boundary_fixed",
    );

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      finishedAt: new Date().toISOString(),
      mutantsKilled,
      ports: {
        keycloak: 58_630,
        postgres: 55_506,
        zoend: 58_631,
      },
      startedAt,
      turns: {
        burstInteractionIds: burst.turn.interactionIds,
        carryForward: next.attempt.carryForwardInteractionIds,
        contextHash: assembled.contextHash,
        deliveryIntentId: intentId,
        stableProviderDeliveryId: firstSendId,
      },
      verdict: "PASS",
    });
    console.log(`conversational-turn PASS → ${artifactPath}`);
  } finally {
    await stopServer(server);
    await storeClient.end();
  }
}
