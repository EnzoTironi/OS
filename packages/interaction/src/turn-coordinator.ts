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
import type { TurnStore } from "./turn-store.js";
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

export interface TurnCoordinatorOptions {
  readonly store: TurnStore;
  readonly debounceMs?: number;
  readonly now?: () => Date;
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
  /** Claim pending interactions into a turn/attempt without running stages. */
  claimBurst(conversationKey: ConversationKey): Promise<ClaimResult | undefined>;
  flush(conversationKey: ConversationKey): Promise<FlushResult | undefined>;
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
  const debounceMs = options.debounceMs ?? 50;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const meta = new Map<string, ConversationMeta>();

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

      const existingTimer = timers.get(conversationKey);
      if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
      }
      timers.set(
        conversationKey,
        setTimeout(() => {
          timers.delete(conversationKey);
          void coordinator.flush(conversationKey);
        }, debounceMs),
      );
    },

    async cancelDebounce(conversationKey) {
      const timer = timers.get(conversationKey);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(conversationKey);
      }
    },

    async claimBurst(conversationKey) {
      await coordinator.cancelDebounce(conversationKey);
      const unclaimed = await store.selectUnclaimed(conversationKey);
      if (unclaimed.length === 0) {
        return undefined;
      }

      const info = meta.get(conversationKey);
      if (info === undefined) {
        throw new Error("missing conversation metadata for flush");
      }

      const carryFrom = await collectCarryForward(store, conversationKey);
      const attemptId =
        info.reservedAttemptId ??
        turnAttemptId(`attempt_${randomBytes(10).toString("hex")}`);
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
      await store.claimPending({
        attemptId,
        conversationKey,
        interactionIds,
      });
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
        const stableProviderDeliveryId = `spd_${input.attemptId}_${sequenceIndex}`;
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
        await store.putDeliveryIntent(intent);
        options.transportCache?.set(`intent:${intent.id}`, intent);

        current = {
          ...current,
          phase: { deliveryGroupId: groupId, kind: "delivering" },
        };
        await store.putAttempt(current);

        const outcome =
          (await options.deliver?.(intent)) ?? defaultDeliver(intent);
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
      return observations;
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
  };

  return coordinator;
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
