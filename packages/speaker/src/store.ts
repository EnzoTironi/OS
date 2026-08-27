import type { InteractionControlRef } from "./brands.js";
import type { InteractionControl, StepUpSession } from "./types.js";
import type { StepUpSessionId } from "./brands.js";

/** Durable backend behind InteractionControlRegistry / StepUpRegistry. */
export interface ControlStore {
  putControl(control: InteractionControl): Promise<void>;
  getControl(ref: InteractionControlRef): Promise<InteractionControl | undefined>;
  /**
   * Consume a live control in one store-level compare-and-set.
   * Same-operation replay returns the already-consumed row.
   */
  consumeControl(
    ref: InteractionControlRef,
    consumedAt: string,
    operationId?: string,
  ): Promise<InteractionControl>;
  /** Live tenant+principal rows. Liveness is payload consumedAt/expiresAt. */
  listControls(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly at: Date;
  }): Promise<readonly InteractionControl[]>;
  putStepUp(session: StepUpSession): Promise<void>;
  getStepUp(id: StepUpSessionId): Promise<StepUpSession | undefined>;
  findStepUpByControl(
    controlRef: InteractionControlRef,
  ): Promise<StepUpSession | undefined>;
}

export function requireUnconsumedControl(
  entry: InteractionControl | undefined,
  at: Date,
): InteractionControl {
  if (entry === undefined) {
    throw new Error("unknown InteractionControlRef");
  }
  if (entry.consumedAt !== undefined) {
    throw new Error("InteractionControlRef already consumed");
  }
  if (Date.parse(entry.expiresAt) <= at.getTime()) {
    throw new Error("InteractionControlRef expired");
  }
  return entry;
}

export function isSameOperationReplay(
  entry: InteractionControl | undefined,
  operationId: string | undefined,
): entry is InteractionControl {
  return (
    entry !== undefined &&
    entry.consumedAt !== undefined &&
    operationId !== undefined &&
    operationId.length > 0 &&
    entry.operationId === operationId
  );
}

export function isLiveControl(entry: InteractionControl, at: Date): boolean {
  return (
    entry.consumedAt === undefined && Date.parse(entry.expiresAt) > at.getTime()
  );
}

export interface MemoryControlStoreOptions {
  /** Test hook. Yields after the live check and before the CAS write. */
  readonly beforeConsumeCommit?: () => Promise<void>;
}

export function createMemoryControlStore(
  options?: MemoryControlStoreOptions,
): ControlStore {
  const controls = new Map<string, InteractionControl>();
  const stepUps = new Map<string, StepUpSession>();
  const byControl = new Map<string, string>();

  return {
    async putControl(control) {
      const existing = controls.get(control.ref);
      if (existing?.consumedAt !== undefined) {
        return;
      }
      controls.set(control.ref, control);
    },
    async getControl(ref) {
      return controls.get(ref);
    },
    async consumeControl(ref, consumedAt, operationId) {
      const existing = controls.get(ref);
      if (isSameOperationReplay(existing, operationId)) {
        return existing;
      }
      requireUnconsumedControl(existing, new Date(consumedAt));
      if (options?.beforeConsumeCommit !== undefined) {
        await options.beforeConsumeCommit();
      }
      const latest = controls.get(ref);
      if (isSameOperationReplay(latest, operationId)) {
        return latest;
      }
      const consumed: InteractionControl = {
        ...requireUnconsumedControl(latest, new Date(consumedAt)),
        consumedAt,
      };
      controls.set(ref, consumed);
      return consumed;
    },
    async listControls(input) {
      return [...controls.values()].filter(
        (control) =>
          control.tenantId === input.tenantId &&
          control.principalId === input.principalId &&
          isLiveControl(control, input.at),
      );
    },
    async putStepUp(session) {
      stepUps.set(session.id, session);
      byControl.set(session.controlRef, session.id);
    },
    async getStepUp(id) {
      return stepUps.get(id);
    },
    async findStepUpByControl(controlRef) {
      const id = byControl.get(controlRef);
      return id === undefined ? undefined : stepUps.get(id);
    },
  };
}

export interface PostgresControlStoreClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createPostgresControlStore(
  client: PostgresControlStoreClient,
): ControlStore {
  return {
    async putControl(control) {
      await client.query(
        `INSERT INTO interaction_controls (
           ref, tenant_id, principal_id, proposal_ref, action_binding_id,
           action_ref, disclosure, assurance, nonce, expires_at, consumed_at,
           step_up_session_id, sealed_audience_kind, payload
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         )
         ON CONFLICT (ref) DO UPDATE SET
           step_up_session_id = EXCLUDED.step_up_session_id,
           payload = EXCLUDED.payload
         WHERE interaction_controls.payload->>'consumedAt' IS NULL`,
        [
          control.ref,
          control.tenantId,
          control.principalId,
          control.proposalRef ?? null,
          control.actionBindingId ?? null,
          control.actionRef === undefined
            ? null
            : JSON.stringify(control.actionRef),
          control.disclosure === undefined
            ? null
            : JSON.stringify(control.disclosure),
          control.assurance ?? null,
          control.nonce,
          control.expiresAt,
          control.consumedAt ?? null,
          control.stepUpSessionId ?? null,
          control.sealedAudienceKind ?? null,
          JSON.stringify(control),
        ],
      );
    },

    async getControl(ref) {
      return getStoredControl(client, ref);
    },

    async consumeControl(ref, consumedAt, operationId) {
      const result = await client.query(
        `UPDATE interaction_controls
         SET consumed_at = COALESCE(consumed_at, $2::timestamptz),
             payload = CASE
               WHEN payload->>'consumedAt' IS NULL THEN
                 jsonb_set(payload, '{consumedAt}', to_jsonb($2::text), true)
               ELSE payload
             END
         WHERE ref = $1
           AND (
             (payload->>'consumedAt' IS NULL
              AND (payload->>'expiresAt')::timestamptz > $2::timestamptz)
             OR ($3::text IS NOT NULL AND payload->>'operationId' = $3)
           )
         RETURNING payload`,
        [ref, consumedAt, operationId ?? null],
      );
      const row = result.rows[0];
      if (row !== undefined) {
        return parsePayload<InteractionControl>(row.payload);
      }
      const current = await getStoredControl(client, ref);
      if (isSameOperationReplay(current, operationId)) {
        return current;
      }
      requireUnconsumedControl(current, new Date(consumedAt));
      throw new Error("InteractionControlRef consume conflict");
    },

    async listControls(input) {
      const result = await client.query(
        `SELECT payload FROM interaction_controls
         WHERE tenant_id = $1 AND principal_id = $2
           AND payload->>'consumedAt' IS NULL
           AND (payload->>'expiresAt')::timestamptz > $3::timestamptz`,
        [input.tenantId, input.principalId, input.at.toISOString()],
      );
      return result.rows.map((row) =>
        parsePayload<InteractionControl>(row.payload),
      );
    },

    async putStepUp(session) {
      await client.query(
        `INSERT INTO interaction_step_ups (
           id, control_ref, proposal_ref, tenant_id, required_principal_id,
           oidc_subject, account_id, expires_at, status, payload
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
         )
         ON CONFLICT (id) DO UPDATE SET
           oidc_subject = EXCLUDED.oidc_subject,
           account_id = EXCLUDED.account_id,
           status = EXCLUDED.status,
           payload = EXCLUDED.payload`,
        [
          session.id,
          session.controlRef,
          session.proposalRef,
          session.tenantId,
          session.requiredPrincipalId,
          session.oidcSubject ?? null,
          session.accountId ?? null,
          session.expiresAt,
          session.status,
          JSON.stringify(session),
        ],
      );
    },

    async getStepUp(id) {
      const result = await client.query(
        `SELECT payload FROM interaction_step_ups WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return undefined;
      }
      return parsePayload<StepUpSession>(row.payload);
    },

    async findStepUpByControl(controlRef) {
      const result = await client.query(
        `SELECT payload FROM interaction_step_ups
         WHERE control_ref = $1
         ORDER BY expires_at DESC
         LIMIT 1`,
        [controlRef],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return undefined;
      }
      return parsePayload<StepUpSession>(row.payload);
    },
  };
}

async function getStoredControl(
  client: PostgresControlStoreClient,
  ref: InteractionControlRef,
): Promise<InteractionControl | undefined> {
  const result = await client.query(
    `SELECT payload FROM interaction_controls WHERE ref = $1`,
    [ref],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }
  return parsePayload<InteractionControl>(row.payload);
}

function parsePayload<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}
