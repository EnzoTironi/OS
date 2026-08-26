import { randomBytes } from "node:crypto";
import {
  conversationTurnId,
  deliveryGroupId,
  deliveryIntentId,
  deliveryObservationId,
  presentationIntentRef,
  providerMessageRef,
  turnAttemptId,
  type ConversationKey,
  type DeliveryIntentId,
  type InteractionId,
  type TenantIdString,
  type TurnAttemptId,
} from "./brands.js";
import type { ConversationArm, TurnStore } from "./turn-store.js";
import {
  isCancellableTurnPhase,
  type ConversationTurn,
  type DeliveryIntent,
  type DeliveryObservation,
  type DeliveryOutcome,
  type InteractionRecord,
  type SemanticCommitRef,
  type TurnAttempt,
  type TurnAttemptPhase,
} from "./types.js";

export type ConversationalStage =
  | "assembling_context"
  | "reasoning"
  | "rendering"
  | "planning_delivery";

export const TURN_DEBOUNCE_MS = 1750;
export const TURN_STATUS_AFTER_MS = 2000;

/** Idempotency key for the one interim status send on an attempt. */
export function statusDeliveryId(primaryId: InteractionId): string {
  return `spd_${primaryId}_status`;
}

/** Idempotency key for final bubble `sequenceIndex` on an attempt. */
export function finalDeliveryId(
  primaryId: InteractionId,
  sequenceIndex: number,
): string {
  return `spd_${primaryId}_${sequenceIndex}`;
}

export type ScheduleHandle = {
  cancel(): void;
};

export type ScheduleFn = (
  callback: () => void,
  delayMs: number,
) => ScheduleHandle;

export interface TurnCoordinatorOptions {
  readonly store: TurnStore;
  readonly debounceMs?: number;
  readonly now?: () => Date;
  readonly schedule?: ScheduleFn;
  /** Spectrum/Chat SDK stand-in. Cleared on restart proofs; never product SoR. */
  readonly transportCache?: Map<string, unknown>;
  /** Probe hook: must stay uncalled when conversational work is superseded. */
  readonly onCancelSemanticCommit?: (ref: SemanticCommitRef) => void;
  readonly deliver?: (intent: DeliveryIntent) => Promise<DeliveryOutcome>;
}

export interface SignalInboundInput {
  readonly conversationKey: ConversationKey;
  readonly record: InteractionRecord;
  readonly workspaceId: string;
}

export interface FlushResult {
  readonly turn: ConversationTurn;
  readonly attempt: TurnAttempt;
  readonly delivered: readonly DeliveryObservation[];
  readonly supersededPriorAttemptId?: TurnAttemptId;
}

export interface ClaimResult {
  readonly turn: ConversationTurn;
  readonly attempt: TurnAttempt;
  readonly supersededPriorAttemptId?: TurnAttemptId;
}

export interface ConversationTurnCoordinator {
  signalInbound(input: SignalInboundInput): Promise<void>;
  /** Cancel armed debounce without claiming. Pending rows must survive. */
  cancelDebounce(conversationKey: ConversationKey): Promise<void>;
  /** Wait for the rearmed debounce, then claim one burst. Does not deliver. */
  awaitClaim(conversationKey: ConversationKey): Promise<ClaimResult | undefined>;
  /** Claim pending interactions into a turn/attempt without running stages. */
  claimBurst(conversationKey: ConversationKey): Promise<ClaimResult | undefined>;
  flush(conversationKey: ConversationKey): Promise<FlushResult | undefined>;
  acknowledgeSilentClose(
    attemptId: TurnAttemptId,
  ): Promise<readonly DeliveryObservation[]>;
  recoverPending(): Promise<void>;
  assertNotSuperseded(attemptId: TurnAttemptId): Promise<void>;
  advanceStage(
    attemptId: TurnAttemptId,
    stage: ConversationalStage,
  ): Promise<TurnAttempt>;
  recordSemanticCommit(
    attemptId: TurnAttemptId,
    ref: SemanticCommitRef,
  ): Promise<TurnAttempt>;
  planAndDeliver(input: {
    readonly attemptId: TurnAttemptId;
    readonly presentation: string;
    readonly sequenceCount?: number;
  }): Promise<readonly DeliveryObservation[]>;
  /**
   * Send exactly one interim status bubble while the attempt is still open.
   * Unlike `planAndDeliver`, this never advances the attempt phase to
   * `delivering`/`completed` and never closes the turn: Tier 2 is still
   * running and a later `planAndDeliver` call still owns the terminal
   * phase transition. A superseded attempt is skipped, not thrown.
   */
  deliverStatusLine(input: {
    readonly attemptId: TurnAttemptId;
    readonly presentation: string;
  }): Promise<DeliveryObservation | undefined>;
  recoverDelivery(intentId: DeliveryIntentId): Promise<DeliveryObservation>;
  getAttempt(attemptId: TurnAttemptId): Promise<TurnAttempt | undefined>;
}

type ConversationMeta = {
  workspaceId: string;
  tenantId: TenantIdString;
  accountId: string;
  reservedAttemptId?: TurnAttemptId;
};

export function createConversationTurnCoordinator(
  options: TurnCoordinatorOptions,
): ConversationTurnCoordinator {
  const store = options.store;
  const now = options.now ?? (() => new Date());
  const debounceMs = options.debounceMs ?? TURN_DEBOUNCE_MS;
  const schedule = options.schedule ?? defaultSchedule;
  const timers = new Map<string, ScheduleHandle>();
  const claims = new Map<string, ArmedClaim>();
  const meta = new Map<string, ConversationMeta>();
  const statusInFlight = new Set<string>();

  const coordinator: ConversationTurnCoordinator = {
    async signalInbound(input) {
      const { conversationKey, record, workspaceId } = input;
      await store.putRecord(record);
      await store.enqueuePending({
        acceptedAt: record.acceptedAt,
        conversationKey,
        interactionId: record.id,
      });
      const existingMeta = meta.get(conversationKey);
      meta.set(conversationKey, {
        accountId: record.ctx.accountId,
        reservedAttemptId: existingMeta?.reservedAttemptId,
        tenantId: record.ctx.tenantId,
        workspaceId,
      });
      options.transportCache?.set(`pending:${record.id}`, {
        text:
          record.inbound.body.kind === "text"
            ? record.inbound.body.text
            : record.inbound.body.kind,
      });

      const open = await store.openAttemptForKey(conversationKey);
      if (open !== undefined && isCancellableTurnPhase(open.phase)) {
        const reserved =
          meta.get(conversationKey)?.reservedAttemptId ??
          turnAttemptId(`attempt_${randomBytes(10).toString("hex")}`);
        meta.set(conversationKey, {
          ...meta.get(conversationKey)!,
          reservedAttemptId: reserved,
        });
        await store.putAttempt({
          ...open,
          phase: {
            at: now().toISOString(),
            byAttemptId: reserved,
            kind: "superseded",
          },
        });
      }

      await persistArm(store, conversationKey, meta.get(conversationKey)!, now, debounceMs);
      if (open !== undefined && isDeliveringPhase(open.phase)) {
        return;
      }
      armClaim(conversationKey);
    },

    async cancelDebounce(conversationKey) {
      const timer = timers.get(conversationKey);
      if (timer !== undefined) {
        timer.cancel();
        timers.delete(conversationKey);
      }
      const pending = claims.get(conversationKey);
      if (pending !== undefined) {
        claims.delete(conversationKey);
        pending.resolve(undefined);
      }
    },

    async awaitClaim(conversationKey) {
      const pending = claims.get(conversationKey);
      if (pending !== undefined) {
        return pending.promise;
      }
      const open = await store.openAttemptForKey(conversationKey);
      if (open !== undefined && isDeliveringPhase(open.phase)) {
        return ensureWaiter(claims, conversationKey).promise;
      }
      return coordinator.claimBurst(conversationKey);
    },

    async claimBurst(conversationKey) {
      const open = await store.openAttemptForKey(conversationKey);
      if (open !== undefined && isDeliveringPhase(open.phase)) {
        return undefined;
      }
      await coordinator.cancelDebounce(conversationKey);
      const info = await resolveMeta(store, meta, conversationKey);
      if (info === undefined) {
        throw new Error("missing conversation metadata for flush");
      }

      const carryFrom = await collectCarryForward(store, conversationKey);
      const attemptId =
        info.reservedAttemptId ??
        turnAttemptId(`attempt_${randomBytes(10).toString("hex")}`);
      const unclaimed = await store.claimUnclaimed({
        attemptId,
        conversationKey,
      });
      if (unclaimed.length === 0) {
        return undefined;
      }
      meta.set(conversationKey, {
        ...info,
        reservedAttemptId: undefined,
      });

      const prior = await store.openAttemptForKey(conversationKey);
      let supersededPriorAttemptId: TurnAttemptId | undefined;
      if (prior !== undefined && isCancellableTurnPhase(prior.phase)) {
        await store.putAttempt({
          ...prior,
          phase: {
            at: now().toISOString(),
            byAttemptId: attemptId,
            kind: "superseded",
          },
        });
        supersededPriorAttemptId = prior.id;
      } else if (prior?.phase.kind === "superseded") {
        supersededPriorAttemptId = prior.id;
      } else {
        const attempts = await store.listAttempts(conversationKey);
        const lastSuperseded = [...attempts]
          .reverse()
          .find((row) => row.phase.kind === "superseded");
        supersededPriorAttemptId = lastSuperseded?.id;
      }

      const interactionIds = unclaimed.map((row) => row.interactionId);
      const turn: ConversationTurn = {
        accountId: info.accountId,
        conversationKey,
        id: conversationTurnId(`turn_${randomBytes(10).toString("hex")}`),
        interactionIds,
        openedAt: now().toISOString(),
        tenantId: info.tenantId,
        workspaceId: info.workspaceId,
      };
      await store.putTurn(turn);

      const attempt: TurnAttempt = {
        carryForwardInteractionIds: carryFrom,
        claimedInteractionIds: interactionIds,
        conversationKey,
        id: attemptId,
        observedCommitRefs: [],
        openedAt: now().toISOString(),
        phase: { kind: "claiming" },
        supersedesAttemptId: supersededPriorAttemptId,
        turnId: turn.id,
      };
      await store.putAttempt(attempt);
      await store.clearArm(conversationKey);
      return { attempt, supersededPriorAttemptId, turn };
    },

    async flush(conversationKey) {
      const claimed = await coordinator.claimBurst(conversationKey);
      if (claimed === undefined) {
        return undefined;
      }
      let attempt = await runPipeline(
        store,
        claimed.attempt,
        coordinator.assertNotSuperseded,
      );
      const delivered = await coordinator.planAndDeliver({
        attemptId: attempt.id,
        presentation: `turn:${claimed.turn.id}`,
      });
      const completed = await store.getAttempt(attempt.id);
      if (completed === undefined) {
        throw new Error("attempt missing after deliver");
      }
      return {
        attempt: completed,
        delivered,
        supersededPriorAttemptId: claimed.supersededPriorAttemptId,
        turn: claimed.turn,
      };
    },

    async assertNotSuperseded(attemptId) {
      const attempt = await store.getAttempt(attemptId);
      if (attempt === undefined) {
        throw new Error(`unknown TurnAttempt ${attemptId}`);
      }
      if (attempt.phase.kind === "superseded") {
        throw new Error(`TurnAttempt ${attemptId} superseded`);
      }
    },

    async advanceStage(attemptId, stage) {
      await coordinator.assertNotSuperseded(attemptId);
      const attempt = await store.getAttempt(attemptId);
      if (attempt === undefined) {
        throw new Error(`unknown TurnAttempt ${attemptId}`);
      }
      const next: TurnAttempt = { ...attempt, phase: { kind: stage } };
      await store.putAttempt(next);
      return next;
    },

    async recordSemanticCommit(attemptId, ref) {
      const attempt = await store.getAttempt(attemptId);
      if (attempt === undefined) {
        throw new Error(`unknown TurnAttempt ${attemptId}`);
      }
      const next: TurnAttempt = {
        ...attempt,
        observedCommitRefs: [...attempt.observedCommitRefs, ref],
      };
      await store.putAttempt(next);
      return next;
    },

    async planAndDeliver(input) {
      await coordinator.assertNotSuperseded(input.attemptId);
      const attempt = await store.getAttempt(input.attemptId);
      if (attempt === undefined) {
        throw new Error(`unknown TurnAttempt ${input.attemptId}`);
      }
      const primaryId =
        attempt.claimedInteractionIds[0] ??
        attempt.carryForwardInteractionIds[0];
      if (primaryId === undefined) {
        throw new Error("attempt has no interaction refs");
      }
      const record = await store.getRecord(primaryId);
      if (record === undefined) {
        throw new Error("missing InteractionRecord for delivery");
      }

      const groupId = deliveryGroupId(`dg_${randomBytes(8).toString("hex")}`);
      const sequenceCount = input.sequenceCount ?? 1;
      const observations: DeliveryObservation[] = [];

      let current: TurnAttempt = {
        ...attempt,
        phase: { kind: "planning_delivery" },
      };
      await store.putAttempt(current);

      for (
        let sequenceIndex = 0;
        sequenceIndex < sequenceCount;
        sequenceIndex++
      ) {
        await coordinator.assertNotSuperseded(input.attemptId);
        const stableProviderDeliveryId = finalDeliveryId(
          primaryId,
          sequenceIndex,
        );
        const intent: DeliveryIntent = {
          controlRefs: [],
          deliveryGroupId: groupId,
          id: deliveryIntentId(`di_${randomBytes(10).toString("hex")}`),
          presentation: presentationIntentRef(input.presentation),
          provider: record.ctx.channel.provider,
          recordId: primaryId,
          sequenceIndex,
          stableProviderDeliveryId,
          target: {
            kind: "same_thread",
            thread: record.ctx.channel.thread,
          },
          turnAttemptId: input.attemptId,
        };
        const claim = await store.claimDelivery(stableProviderDeliveryId);
        if (claim === "duplicate") {
          continue;
        }
        await store.putDeliveryIntent(intent);
        options.transportCache?.set(`intent:${intent.id}`, intent);

        current = {
          ...current,
          phase: { deliveryGroupId: groupId, kind: "delivering" },
        };
        await store.putAttempt(current);

        let outcome: DeliveryOutcome;
        try {
          outcome = (await options.deliver?.(intent)) ?? defaultDeliver(intent);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          await store.putAttempt({
            ...current,
            phase: { kind: "failed", reason },
          });
          await resumeQueuedAfterTerminal(attempt.conversationKey);
          throw error;
        }
        const observation: DeliveryObservation = {
          id: deliveryObservationId(`do_${randomBytes(10).toString("hex")}`),
          intentId: intent.id,
          observedAt: now().toISOString(),
          outcome,
        };
        await store.putDeliveryObservation(observation);
        observations.push(observation);
      }

      current = { ...current, phase: { kind: "completed" } };
      await store.putAttempt(current);
      const turn = await store.getTurn(attempt.turnId);
      if (turn !== undefined) {
        await store.putTurn({
          ...turn,
          closedAt: now().toISOString(),
        });
      }
      await resumeQueuedAfterTerminal(attempt.conversationKey);
      return observations;
    },

    async deliverStatusLine(input) {
      const attempt = await store.getAttempt(input.attemptId);
      if (!canSendInterimStatus(attempt)) {
        return undefined;
      }
      const primaryId =
        attempt.claimedInteractionIds[0] ??
        attempt.carryForwardInteractionIds[0];
      if (primaryId === undefined) {
        return undefined;
      }
      const stableProviderDeliveryId = statusDeliveryId(primaryId);
      if (statusInFlight.has(stableProviderDeliveryId)) {
        return undefined;
      }
      const claim = await store.claimDelivery(stableProviderDeliveryId);
      if (claim === "duplicate") {
        return undefined;
      }
      statusInFlight.add(stableProviderDeliveryId);
      try {
        const record = await store.getRecord(primaryId);
        if (record === undefined) {
          await store.releaseDelivery(stableProviderDeliveryId);
          return undefined;
        }
        const latest = await store.getAttempt(input.attemptId);
        if (!canSendInterimStatus(latest)) {
          await store.releaseDelivery(stableProviderDeliveryId);
          return undefined;
        }
        const intent: DeliveryIntent = {
          controlRefs: [],
          deliveryGroupId: deliveryGroupId(`dg_${randomBytes(8).toString("hex")}`),
          id: deliveryIntentId(`di_${randomBytes(10).toString("hex")}`),
          presentation: presentationIntentRef(input.presentation),
          provider: record.ctx.channel.provider,
          recordId: primaryId,
          stableProviderDeliveryId,
          target: {
            kind: "same_thread",
            thread: record.ctx.channel.thread,
          },
          turnAttemptId: input.attemptId,
        };
        await store.putDeliveryIntent(intent);
        options.transportCache?.set(`intent:${intent.id}`, intent);
        const beforeSend = await store.getAttempt(input.attemptId);
        if (!canSendInterimStatus(beforeSend)) {
          await store.releaseDelivery(stableProviderDeliveryId);
          return undefined;
        }
        const outcome =
          (await options.deliver?.(intent)) ?? defaultDeliver(intent);
        const observation: DeliveryObservation = {
          id: deliveryObservationId(`do_${randomBytes(10).toString("hex")}`),
          intentId: intent.id,
          observedAt: now().toISOString(),
          outcome,
        };
        await store.putDeliveryObservation(observation);
        return observation;
      } catch (error) {
        await store.releaseDelivery(stableProviderDeliveryId);
        throw error;
      } finally {
        statusInFlight.delete(stableProviderDeliveryId);
      }
    },

    async recoverDelivery(intentId) {
      const existing = await store.getDeliveryObservation(intentId);
      if (existing !== undefined) {
        return existing;
      }
      const intent = await store.getDeliveryIntent(intentId);
      if (intent === undefined) {
        throw new Error(`unknown DeliveryIntent ${intentId}`);
      }
      const claim = await store.claimDelivery(intent.stableProviderDeliveryId);
      if (claim === "duplicate") {
        const observation: DeliveryObservation = {
          id: deliveryObservationId(`do_${randomBytes(10).toString("hex")}`),
          intentId: intent.id,
          observedAt: now().toISOString(),
          outcome: { kind: "unknown" },
        };
        await store.putDeliveryObservation(observation);
        return observation;
      }
      const outcome =
        (await options.deliver?.(intent)) ?? defaultDeliver(intent);
      const observation: DeliveryObservation = {
        id: deliveryObservationId(`do_${randomBytes(10).toString("hex")}`),
        intentId: intent.id,
        observedAt: now().toISOString(),
        outcome:
          outcome.kind === "accepted"
            ? outcome
            : ({ kind: "unknown" } satisfies DeliveryOutcome),
      };
      await store.putDeliveryObservation(observation);
      return observation;
    },

    async getAttempt(attemptId) {
      return store.getAttempt(attemptId);
    },

    async acknowledgeSilentClose(attemptId) {
      const attempt = await store.getAttempt(attemptId);
      if (attempt === undefined) {
        throw new Error(`unknown TurnAttempt ${attemptId}`);
      }
      const stableProviderDeliveryId = `wait_${attemptId}`;
      const claim = await store.claimDelivery(stableProviderDeliveryId);
      const existing = await store.getDeliveryObservation(
        deliveryIntentId(`di_wait_${attemptId}`.slice(0, 200)),
      );
      if (claim === "duplicate" && existing !== undefined) {
        return [existing];
      }
      const intentId = deliveryIntentId(`di_wait_${attemptId}`.slice(0, 200));
      const observation: DeliveryObservation = {
        id: deliveryObservationId(`do_wait_${attemptId}`.slice(0, 200)),
        intentId,
        observedAt: now().toISOString(),
        outcome: { kind: "unknown" },
      };
      if (claim === "claimed") {
        await store.putDeliveryObservation(observation);
      }
      await store.putAttempt({ ...attempt, phase: { kind: "completed" } });
      const turn = await store.getTurn(attempt.turnId);
      if (turn !== undefined) {
        await store.putTurn({ ...turn, closedAt: now().toISOString() });
      }
      await resumeQueuedAfterTerminal(attempt.conversationKey);
      return [observation];
    },

    async recoverPending() {
      for (const attempt of await store.listOpenAttempts()) {
        if (!isDeliveringPhase(attempt.phase)) {
          continue;
        }
        await store.putAttempt({
          ...attempt,
          phase: {
            kind: "failed",
            reason: "recovered after restart; pre-send claim held",
          },
        });
      }
      const keys = await store.listUnclaimedConversationKeys();
      for (const conversationKey of keys) {
        const arm = await store.getArm(conversationKey);
        if (arm !== undefined) {
          meta.set(conversationKey, {
            accountId: arm.accountId,
            reservedAttemptId: arm.reservedAttemptId,
            tenantId: arm.tenantId,
            workspaceId: arm.workspaceId,
          });
        }
        armClaim(conversationKey);
      }
    },
  };

  function armClaim(conversationKey: ConversationKey): void {
    const existingTimer = timers.get(conversationKey);
    existingTimer?.cancel();
    const waiter = ensureWaiter(claims, conversationKey);
    const handle = schedule(() => {
      timers.delete(conversationKey);
      claims.delete(conversationKey);
      void coordinator.claimBurst(conversationKey).then(waiter.resolve, () => {
        waiter.resolve(undefined);
      });
    }, debounceMs);
    timers.set(conversationKey, handle);
  }

  async function resumeQueuedAfterTerminal(
    conversationKey: ConversationKey,
  ): Promise<void> {
    const unclaimed = await store.selectUnclaimed(conversationKey);
    if (unclaimed.length === 0) {
      return;
    }
    armClaim(conversationKey);
  }

  return coordinator;
}

type ArmedClaim = {
  promise: Promise<ClaimResult | undefined>;
  resolve: (result: ClaimResult | undefined) => void;
};

function ensureWaiter(
  claims: Map<string, ArmedClaim>,
  conversationKey: ConversationKey,
): ArmedClaim {
  const existing = claims.get(conversationKey);
  if (existing !== undefined) {
    return existing;
  }
  let resolve: ((result: ClaimResult | undefined) => void) | undefined;
  const promise = new Promise<ClaimResult | undefined>((res) => {
    resolve = res;
  });
  if (resolve === undefined) {
    throw new Error("debounce waiter missing resolver");
  }
  const waiter = { promise, resolve };
  claims.set(conversationKey, waiter);
  return waiter;
}

function canSendInterimStatus(
  attempt: TurnAttempt | undefined,
): attempt is TurnAttempt {
  if (attempt === undefined) {
    return false;
  }
  switch (attempt.phase.kind) {
    case "debouncing":
    case "claiming":
    case "assembling_context":
    case "reasoning":
    case "rendering":
    case "planning_delivery":
      return true;
    case "delivering":
    case "completed":
    case "superseded":
    case "failed":
      return false;
    default: {
      const exhaustive: never = attempt.phase;
      return exhaustive;
    }
  }
}

function isDeliveringPhase(phase: TurnAttemptPhase): boolean {
  switch (phase.kind) {
    case "delivering":
      return true;
    case "debouncing":
    case "claiming":
    case "assembling_context":
    case "reasoning":
    case "rendering":
    case "planning_delivery":
    case "completed":
    case "superseded":
    case "failed":
      return false;
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

function defaultSchedule(callback: () => void, delayMs: number): ScheduleHandle {
  const timer = setTimeout(callback, delayMs);
  return {
    cancel() {
      clearTimeout(timer);
    },
  };
}

async function persistArm(
  store: TurnStore,
  conversationKey: ConversationKey,
  info: ConversationMeta,
  now: () => Date,
  debounceMs: number,
): Promise<void> {
  const arm: ConversationArm = {
    accountId: info.accountId,
    armedAt: now().toISOString(),
    conversationKey,
    debounceMs,
    reservedAttemptId: info.reservedAttemptId,
    tenantId: info.tenantId,
    workspaceId: info.workspaceId,
  };
  await store.upsertArm(arm);
}

async function resolveMeta(
  store: TurnStore,
  meta: Map<string, ConversationMeta>,
  conversationKey: ConversationKey,
): Promise<ConversationMeta | undefined> {
  const cached = meta.get(conversationKey);
  if (cached !== undefined) {
    return cached;
  }
  const arm = await store.getArm(conversationKey);
  if (arm === undefined) {
    return undefined;
  }
  const restored: ConversationMeta = {
    accountId: arm.accountId,
    reservedAttemptId: arm.reservedAttemptId,
    tenantId: arm.tenantId,
    workspaceId: arm.workspaceId,
  };
  meta.set(conversationKey, restored);
  return restored;
}

async function runPipeline(
  store: TurnStore,
  attempt: TurnAttempt,
  assertNotSuperseded: (id: TurnAttemptId) => Promise<void>,
): Promise<TurnAttempt> {
  let current = attempt;
  for (const stage of [
    "assembling_context",
    "reasoning",
    "rendering",
    "planning_delivery",
  ] as const) {
    await assertNotSuperseded(current.id);
    current = {
      ...current,
      phase: { kind: stage },
    };
    await store.putAttempt(current);
  }
  return current;
}

async function collectCarryForward(
  store: TurnStore,
  conversationKey: ConversationKey,
): Promise<readonly InteractionId[]> {
  const attempts = await store.listAttempts(conversationKey);
  const superseded = attempts.filter(
    (attempt) => attempt.phase.kind === "superseded",
  );
  const ids: InteractionId[] = [];
  const seen = new Set<string>();
  for (const attempt of superseded) {
    for (const id of [
      ...attempt.carryForwardInteractionIds,
      ...attempt.claimedInteractionIds,
    ]) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

function defaultDeliver(intent: DeliveryIntent): DeliveryOutcome {
  return {
    kind: "accepted",
    providerMessage: providerMessageRef(`pm_${intent.stableProviderDeliveryId}`),
  };
}

/** Pure phase helper: supersession never emits cancel-action. */
export function phaseAfterSupersession(
  phase: TurnAttemptPhase,
  byAttemptId: TurnAttemptId,
  at: string,
): TurnAttemptPhase {
  if (!isCancellableTurnPhase(phase)) {
    return phase;
  }
  return { at, byAttemptId, kind: "superseded" };
}
