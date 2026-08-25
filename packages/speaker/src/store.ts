import type { InteractionControlRef } from "./brands.js";
import type { InteractionControl, StepUpSession } from "./types.js";
import type { StepUpSessionId } from "./brands.js";

/** Durable backend behind InteractionControlRegistry / StepUpRegistry. */
export interface ControlStore {
  putControl(control: InteractionControl): Promise<void>;
  getControl(ref: InteractionControlRef): Promise<InteractionControl | undefined>;
  putStepUp(session: StepUpSession): Promise<void>;
  getStepUp(id: StepUpSessionId): Promise<StepUpSession | undefined>;
  findStepUpByControl(
    controlRef: InteractionControlRef,
  ): Promise<StepUpSession | undefined>;
}

export function createMemoryControlStore(): ControlStore {
  const controls = new Map<string, InteractionControl>();
  const stepUps = new Map<string, StepUpSession>();
  const byControl = new Map<string, string>();

  return {
    async putControl(control) {
      controls.set(control.ref, control);
    },
    async getControl(ref) {
      return controls.get(ref);
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
           consumed_at = EXCLUDED.consumed_at,
           step_up_session_id = EXCLUDED.step_up_session_id,
           payload = EXCLUDED.payload`,
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
      const result = await client.query(
        `SELECT payload FROM interaction_controls WHERE ref = $1`,
        [ref],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return undefined;
      }
      return parsePayload<InteractionControl>(row.payload);
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

function parsePayload<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}
