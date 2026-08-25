import type { Client } from "pg";
import {
  isActivationContractId,
  opaqueId,
  parseActivationContractId,
  type OpaqueId,
} from "./brands.js";
import { assertNoContentPayload } from "./privacy.js";
import type {
  FrictionCategory,
  FrictionEntry,
  FrictionStore,
  ObservationRecord,
  ObservationStatus,
  ObservationStore,
} from "./types.js";

export async function setTenant(
  client: Client,
  tenantId: OpaqueId,
): Promise<void> {
  // Session-scoped: Client uses autocommit, so is_local=true would not
  // survive into the next statement that must pass FORCE RLS.
  await client.query("SELECT set_config('zoen.tenant_id', $1, false)", [
    tenantId,
  ]);
}

function rowToObservation(row: Record<string, unknown>): ObservationRecord {
  const contractId = String(row.contract_id);
  if (!isActivationContractId(contractId)) {
    throw new Error(`invalid contract_id in store: ${contractId}`);
  }
  const status = String(row.status) as ObservationStatus;
  return {
    eventId: String(row.event_id),
    contractId,
    declaredContractId:
      row.declared_contract_id == null
        ? undefined
        : String(row.declared_contract_id),
    status,
    observedAtMicros: Number(row.observed_at_micros),
    tenantId: opaqueId(String(row.tenant_id)),
    accountId:
      row.account_id == null ? undefined : opaqueId(String(row.account_id)),
    sessionId: opaqueId(String(row.session_id)),
    productId:
      row.product_id == null ? undefined : opaqueId(String(row.product_id)),
    buildId: String(row.build_id),
    outcomeRef: row.outcome_ref == null ? undefined : String(row.outcome_ref),
    reasonCategory:
      row.reason_category == null
        ? undefined
        : (String(row.reason_category) as FrictionCategory),
  };
}

export function createPostgresObservationStore(client: Client): ObservationStore {
  return {
    async insert(record) {
      assertNoContentPayload(record);
      await setTenant(client, record.tenantId);
      const result = await client.query(
        `INSERT INTO activation_observations (
           event_id, contract_id, declared_contract_id, status, observed_at_micros,
           tenant_id, account_id, session_id, product_id, build_id, outcome_ref,
           reason_category, exported
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
         ON CONFLICT (tenant_id, event_id) DO NOTHING
         RETURNING *`,
        [
          record.eventId,
          record.contractId,
          record.declaredContractId ?? null,
          record.status,
          record.observedAtMicros,
          record.tenantId,
          record.accountId ?? null,
          record.sessionId,
          record.productId ?? null,
          record.buildId,
          record.outcomeRef ?? null,
          record.reasonCategory ?? null,
        ],
      );
      if (result.rows[0] !== undefined) {
        return rowToObservation(result.rows[0] as Record<string, unknown>);
      }
      const existing = await client.query(
        `SELECT * FROM activation_observations
         WHERE tenant_id = $1 AND event_id = $2`,
        [record.tenantId, record.eventId],
      );
      const row = existing.rows[0];
      if (row === undefined) {
        throw new Error("insert conflict without existing row");
      }
      return rowToObservation(row as Record<string, unknown>);
    },

    async getByEventId(tenantId, eventId) {
      await setTenant(client, tenantId);
      const result = await client.query(
        `SELECT * FROM activation_observations
         WHERE tenant_id = $1 AND event_id = $2`,
        [tenantId, eventId],
      );
      const row = result.rows[0];
      return row === undefined
        ? undefined
        : rowToObservation(row as Record<string, unknown>);
    },

    async listBySession(tenantId, sessionId) {
      await setTenant(client, tenantId);
      const result = await client.query(
        `SELECT * FROM activation_observations
         WHERE tenant_id = $1 AND session_id = $2
         ORDER BY observed_at_micros ASC`,
        [tenantId, sessionId],
      );
      return result.rows.map((row) =>
        rowToObservation(row as Record<string, unknown>),
      );
    },

    async listPendingExport(tenantId, limit) {
      await setTenant(client, tenantId);
      const result = await client.query(
        `SELECT * FROM activation_observations
         WHERE tenant_id = $1 AND exported = false
         ORDER BY observed_at_micros ASC
         LIMIT $2`,
        [tenantId, limit],
      );
      return result.rows.map((row) =>
        rowToObservation(row as Record<string, unknown>),
      );
    },

    async markExported(tenantId, eventIds) {
      if (eventIds.length === 0) {
        return;
      }
      await setTenant(client, tenantId);
      await client.query(
        `UPDATE activation_observations
         SET exported = true
         WHERE tenant_id = $1 AND event_id = ANY($2::text[])`,
        [tenantId, [...eventIds]],
      );
    },
  };
}

export function createPostgresFrictionStore(
  client: Client,
  tenantId: OpaqueId,
): FrictionStore {
  return {
    async append(entry) {
      await setTenant(client, tenantId);
      await client.query(
        `INSERT INTO activation_friction (
           friction_id, contract_id, session_id, elapsed_micros, category,
           user_visible_message_code, recovery_path, manual_help_needed,
           build_id, recorded_at_micros, tenant_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (friction_id) DO NOTHING`,
        [
          entry.frictionId,
          entry.contractId,
          entry.sessionId,
          entry.elapsedMicros,
          entry.category,
          entry.userVisibleMessageCode,
          entry.recoveryPath,
          entry.manualHelpNeeded,
          entry.buildId,
          entry.recordedAtMicros,
          tenantId,
        ],
      );
      return entry;
    },

    async listBySession(sessionId) {
      await setTenant(client, tenantId);
      const result = await client.query(
        `SELECT * FROM activation_friction
         WHERE tenant_id = $1 AND session_id = $2
         ORDER BY recorded_at_micros ASC`,
        [tenantId, sessionId],
      );
      return result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          frictionId: String(r.friction_id),
          contractId: parseActivationContractId(String(r.contract_id)),
          sessionId: opaqueId(String(r.session_id)),
          elapsedMicros: Number(r.elapsed_micros),
          category: String(r.category) as FrictionCategory,
          userVisibleMessageCode: String(r.user_visible_message_code),
          recoveryPath: String(r.recovery_path),
          manualHelpNeeded: Boolean(r.manual_help_needed),
          buildId: String(r.build_id),
          recordedAtMicros: Number(r.recorded_at_micros),
        };
      });
    },
  };
}
