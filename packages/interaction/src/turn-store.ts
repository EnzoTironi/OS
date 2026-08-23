import type {
  ConversationKey,
  ConversationTurnId,
  DeliveryIntentId,
  InteractionId,
  TurnAttemptId,
} from "./brands.js";
import type {
  ConversationTurn,
  DeliveryIntent,
  DeliveryObservation,
  InteractionRecord,
  TurnAttempt,
} from "./types.js";

export interface PendingInteraction {
  readonly conversationKey: ConversationKey;
  readonly interactionId: InteractionId;
  readonly acceptedAt: string;
  readonly claimedByAttemptId: TurnAttemptId | null;
}

/**
 * Durable product SoR for turns. Spectrum/Chat SDK Store is not this.
 * Carry-forward columns are InteractionId[] only.
 */
export interface TurnStore {
  putRecord(record: InteractionRecord): Promise<void>;
  getRecord(id: InteractionId): Promise<InteractionRecord | undefined>;

  enqueuePending(input: {
    readonly conversationKey: ConversationKey;
    readonly interactionId: InteractionId;
    readonly acceptedAt: string;
  }): Promise<void>;
  selectUnclaimed(
    conversationKey: ConversationKey,
  ): Promise<readonly PendingInteraction[]>;
  claimPending(input: {
    readonly conversationKey: ConversationKey;
    readonly interactionIds: readonly InteractionId[];
    readonly attemptId: TurnAttemptId;
  }): Promise<void>;

  putTurn(turn: ConversationTurn): Promise<void>;
  getTurn(id: ConversationTurnId): Promise<ConversationTurn | undefined>;

  putAttempt(attempt: TurnAttempt): Promise<void>;
  getAttempt(id: TurnAttemptId): Promise<TurnAttempt | undefined>;
  listAttempts(
    conversationKey: ConversationKey,
  ): Promise<readonly TurnAttempt[]>;
  openAttemptForKey(
    conversationKey: ConversationKey,
  ): Promise<TurnAttempt | undefined>;

  putDeliveryIntent(intent: DeliveryIntent): Promise<void>;
  getDeliveryIntent(
    id: DeliveryIntentId,
  ): Promise<DeliveryIntent | undefined>;
  putDeliveryObservation(obs: DeliveryObservation): Promise<void>;
  getDeliveryObservation(
    intentId: DeliveryIntentId,
  ): Promise<DeliveryObservation | undefined>;
}

export interface PostgresTurnStoreClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createMemoryTurnStore(): TurnStore {
  const records = new Map<string, InteractionRecord>();
  const pending = new Map<string, PendingInteraction[]>();
  const turns = new Map<string, ConversationTurn>();
  const attempts = new Map<string, TurnAttempt>();
  const intents = new Map<string, DeliveryIntent>();
  const observations = new Map<string, DeliveryObservation>();

  return {
    async putRecord(record) {
      records.set(record.id, record);
    },
    async getRecord(id) {
      return records.get(id);
    },
    async enqueuePending(input) {
      const list = pending.get(input.conversationKey) ?? [];
      if (list.some((row) => row.interactionId === input.interactionId)) {
        return;
      }
      pending.set(input.conversationKey, [
        ...list,
        {
          acceptedAt: input.acceptedAt,
          claimedByAttemptId: null,
          conversationKey: input.conversationKey,
          interactionId: input.interactionId,
        },
      ]);
    },
    async selectUnclaimed(conversationKey) {
      return (pending.get(conversationKey) ?? []).filter(
        (row) => row.claimedByAttemptId === null,
      );
    },
    async claimPending(input) {
      const list = pending.get(input.conversationKey) ?? [];
      const claimed = new Set(input.interactionIds);
      pending.set(
        input.conversationKey,
        list.map((row) =>
          claimed.has(row.interactionId) && row.claimedByAttemptId === null
            ? { ...row, claimedByAttemptId: input.attemptId }
            : row,
        ),
      );
    },
    async putTurn(turn) {
      turns.set(turn.id, turn);
    },
    async getTurn(id) {
      return turns.get(id);
    },
    async putAttempt(attempt) {
      assertNoCarriedMessagesBlob(attempt);
      attempts.set(attempt.id, attempt);
    },
    async getAttempt(id) {
      return attempts.get(id);
    },
    async listAttempts(conversationKey) {
      return [...attempts.values()].filter(
        (attempt) => attempt.conversationKey === conversationKey,
      );
    },
    async openAttemptForKey(conversationKey) {
      const open = [...attempts.values()].filter(
        (attempt) =>
          attempt.conversationKey === conversationKey &&
          attempt.phase.kind !== "completed" &&
          attempt.phase.kind !== "superseded" &&
          attempt.phase.kind !== "failed",
      );
      return open.sort((a, b) => a.openedAt.localeCompare(b.openedAt)).at(-1);
    },
    async putDeliveryIntent(intent) {
      intents.set(intent.id, intent);
    },
    async getDeliveryIntent(id) {
      return intents.get(id);
    },
    async putDeliveryObservation(obs) {
      observations.set(obs.intentId, obs);
    },
    async getDeliveryObservation(intentId) {
      return observations.get(intentId);
    },
  };
}

export function createPostgresTurnStore(
  client: PostgresTurnStoreClient,
): TurnStore {
  return {
    async putRecord(record) {
      await client.query(
        `INSERT INTO interaction_records (id, accepted_at, payload)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [record.id, record.acceptedAt, JSON.stringify(record)],
      );
    },
    async getRecord(id) {
      const result = await client.query(
        `SELECT payload FROM interaction_records WHERE id = $1`,
        [id],
      );
      return parseRow<InteractionRecord>(result.rows[0]);
    },
    async enqueuePending(input) {
      await client.query(
        `INSERT INTO conversation_pending (
           conversation_key, interaction_id, accepted_at, claimed_by_attempt_id
         ) VALUES ($1, $2, $3, NULL)
         ON CONFLICT (conversation_key, interaction_id) DO NOTHING`,
        [input.conversationKey, input.interactionId, input.acceptedAt],
      );
    },
    async selectUnclaimed(conversationKey) {
      const result = await client.query(
        `SELECT conversation_key, interaction_id, accepted_at, claimed_by_attempt_id
         FROM conversation_pending
         WHERE conversation_key = $1 AND claimed_by_attempt_id IS NULL
         ORDER BY accepted_at ASC`,
        [conversationKey],
      );
      return result.rows.map((row) => ({
        acceptedAt: String(row.accepted_at),
        claimedByAttemptId: null,
        conversationKey: row.conversation_key as ConversationKey,
        interactionId: row.interaction_id as InteractionId,
      }));
    },
    async claimPending(input) {
      if (input.interactionIds.length === 0) {
        return;
      }
      await client.query(
        `UPDATE conversation_pending
         SET claimed_by_attempt_id = $1
         WHERE conversation_key = $2
           AND interaction_id = ANY($3::text[])
           AND claimed_by_attempt_id IS NULL`,
        [input.attemptId, input.conversationKey, [...input.interactionIds]],
      );
    },
    async putTurn(turn) {
      await client.query(
        `INSERT INTO conversation_turns (
           id, conversation_key, tenant_id, account_id, workspace_id,
           interaction_ids, opened_at, closed_at, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           closed_at = EXCLUDED.closed_at,
           payload = EXCLUDED.payload`,
        [
          turn.id,
          turn.conversationKey,
          turn.tenantId,
          turn.accountId,
          turn.workspaceId,
          JSON.stringify(turn.interactionIds),
          turn.openedAt,
          turn.closedAt ?? null,
          JSON.stringify(turn),
        ],
      );
    },
    async getTurn(id) {
      const result = await client.query(
        `SELECT payload FROM conversation_turns WHERE id = $1`,
        [id],
      );
      return parseRow<ConversationTurn>(result.rows[0]);
    },
    async putAttempt(attempt) {
      assertNoCarriedMessagesBlob(attempt);
      await client.query(
        `INSERT INTO turn_attempts (
           id, turn_id, conversation_key, claimed_interaction_ids,
           carry_forward_interaction_ids, phase_kind, opened_at,
           observed_commit_refs, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           claimed_interaction_ids = EXCLUDED.claimed_interaction_ids,
           carry_forward_interaction_ids = EXCLUDED.carry_forward_interaction_ids,
           phase_kind = EXCLUDED.phase_kind,
           observed_commit_refs = EXCLUDED.observed_commit_refs,
           payload = EXCLUDED.payload`,
        [
          attempt.id,
          attempt.turnId,
          attempt.conversationKey,
          JSON.stringify(attempt.claimedInteractionIds),
          JSON.stringify(attempt.carryForwardInteractionIds),
          attempt.phase.kind,
          attempt.openedAt,
          JSON.stringify(attempt.observedCommitRefs),
          JSON.stringify(attempt),
        ],
      );
    },
    async getAttempt(id) {
      const result = await client.query(
        `SELECT payload FROM turn_attempts WHERE id = $1`,
        [id],
      );
      return parseRow<TurnAttempt>(result.rows[0]);
    },
    async listAttempts(conversationKey) {
      const result = await client.query(
        `SELECT payload FROM turn_attempts
         WHERE conversation_key = $1
         ORDER BY opened_at ASC`,
        [conversationKey],
      );
      return result.rows
        .map((row) => parseRow<TurnAttempt>(row))
        .filter((row): row is TurnAttempt => row !== undefined);
    },
    async openAttemptForKey(conversationKey) {
      const result = await client.query(
        `SELECT payload FROM turn_attempts
         WHERE conversation_key = $1
           AND phase_kind NOT IN ('completed', 'superseded', 'failed')
         ORDER BY opened_at DESC
         LIMIT 1`,
        [conversationKey],
      );
      return parseRow<TurnAttempt>(result.rows[0]);
    },
    async putDeliveryIntent(intent) {
      await client.query(
        `INSERT INTO delivery_intents (
           id, turn_attempt_id, record_id, stable_provider_delivery_id,
           delivery_group_id, sequence_index, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
        [
          intent.id,
          intent.turnAttemptId ?? null,
          intent.recordId,
          intent.stableProviderDeliveryId,
          intent.deliveryGroupId ?? null,
          intent.sequenceIndex ?? null,
          JSON.stringify(intent),
        ],
      );
    },
    async getDeliveryIntent(id) {
      const result = await client.query(
        `SELECT payload FROM delivery_intents WHERE id = $1`,
        [id],
      );
      return parseRow<DeliveryIntent>(result.rows[0]);
    },
    async putDeliveryObservation(obs) {
      await client.query(
        `INSERT INTO delivery_observations (id, intent_id, observed_at, payload)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
        [obs.id, obs.intentId, obs.observedAt, JSON.stringify(obs)],
      );
    },
    async getDeliveryObservation(intentId) {
      const result = await client.query(
        `SELECT payload FROM delivery_observations
         WHERE intent_id = $1
         ORDER BY observed_at DESC
         LIMIT 1`,
        [intentId],
      );
      return parseRow<DeliveryObservation>(result.rows[0]);
    },
  };
}

function parseRow<T>(row: Record<string, unknown> | undefined): T | undefined {
  if (row === undefined) {
    return undefined;
  }
  const value = row.payload;
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

function assertNoCarriedMessagesBlob(attempt: TurnAttempt): void {
  const raw = attempt as TurnAttempt & {
    carried_messages?: unknown;
    carriedMessages?: unknown;
  };
  if (raw.carried_messages !== undefined || raw.carriedMessages !== undefined) {
    throw new Error(
      "carry-forward must be InteractionId refs; carried_messages blob forbidden",
    );
  }
  for (const id of attempt.carryForwardInteractionIds) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("carryForwardInteractionIds must be InteractionId strings");
    }
  }
}
