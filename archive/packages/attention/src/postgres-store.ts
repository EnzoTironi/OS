import type { Client } from "pg";
import {
  attentionDefinitionId,
  attentionDefinitionVersion,
  attentionItemId,
  conditionIdentityDigest,
  materialFingerprint,
  semanticCutDigest,
  tenantId,
  type ConditionIdentityDigest,
  type TenantId,
} from "./brands.js";
import type { AttentionStore } from "./store.js";
import type {
  AttentionDeliveryEvidenceRow,
  AttentionItem,
  AttentionLifecycle,
  AttentionSubject,
  PreferenceDecisionEvidence,
} from "./types.js";
import type { AudienceDisclosure } from "../../../../packages/speaker/src/index.js";

export async function setTenant(
  client: Client,
  tenant: TenantId | string,
): Promise<void> {
  await client.query("SELECT set_config('zoen.tenant_id', $1, false)", [
    String(tenant),
  ]);
}

export function createPostgresAttentionStore(client: Client): AttentionStore {
  return {
    async upsertByCondition(input) {
      const item = input.item;
      const tid = item.conditionIdentity.tenantId;
      await setTenant(client, tid);
      const subject = subjectParts(item.conditionIdentity.subject);
      const result = await client.query(
        `INSERT INTO attention_items (
           tenant_id, attention_item_id, condition_identity_digest,
           definition_id, definition_version, subject_kind, subject_id,
           semantic_cut_digest, material_fingerprint, lifecycle_kind,
           lifecycle_json, recipient_principal_id, recipient_scope, class_id,
           proposal_ref, proposal_state_basis_digest, sealed_disclosure_json,
           delivery_generation, last_preference_decision_json,
           last_delivery_observation_id, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,
           $17::jsonb,$18,$19::jsonb,$20,$21::timestamptz,$22::timestamptz
         )
         ON CONFLICT (tenant_id, condition_identity_digest) DO UPDATE SET
           attention_item_id = EXCLUDED.attention_item_id,
           material_fingerprint = EXCLUDED.material_fingerprint,
           lifecycle_kind = EXCLUDED.lifecycle_kind,
           lifecycle_json = EXCLUDED.lifecycle_json,
           proposal_ref = EXCLUDED.proposal_ref,
           proposal_state_basis_digest = EXCLUDED.proposal_state_basis_digest,
           sealed_disclosure_json = EXCLUDED.sealed_disclosure_json,
           delivery_generation = EXCLUDED.delivery_generation,
           last_preference_decision_json = EXCLUDED.last_preference_decision_json,
           last_delivery_observation_id = EXCLUDED.last_delivery_observation_id,
           updated_at = EXCLUDED.updated_at
         RETURNING (xmax = 0) AS inserted, *`,
        [
          String(tid),
          String(item.id),
          String(item.conditionIdentity.digest),
          String(item.conditionIdentity.definitionId),
          String(item.conditionIdentity.definitionVersion),
          subject.kind,
          subject.id,
          String(item.conditionIdentity.semanticCutDigest),
          String(item.materialFingerprint),
          item.lifecycle.kind,
          JSON.stringify(item.lifecycle),
          item.recipientPrincipalId,
          item.recipientScope,
          item.classId,
          item.proposalRef ?? null,
          item.proposalStateBasisDigest ?? null,
          JSON.stringify(item.sealedDisclosure),
          item.deliveryGeneration,
          JSON.stringify(item.lastPreferenceDecision),
          item.lastDeliveryObservationId ?? null,
          item.createdAt,
          item.updatedAt,
        ],
      );
      const row = result.rows[0] as Record<string, unknown>;
      return {
        created: Boolean(row.inserted),
        item: rowToItem(row),
      };
    },

    async getByCondition(tenant, digest) {
      await setTenant(client, tenant);
      const result = await client.query(
        `SELECT * FROM attention_items
         WHERE tenant_id = $1 AND condition_identity_digest = $2`,
        [String(tenant), String(digest)],
      );
      const row = result.rows[0];
      return row === undefined
        ? null
        : rowToItem(row as Record<string, unknown>);
    },

    async getById(tenant, attentionItemIdValue) {
      await setTenant(client, tenant);
      const result = await client.query(
        `SELECT * FROM attention_items
         WHERE tenant_id = $1 AND attention_item_id = $2`,
        [String(tenant), attentionItemIdValue],
      );
      const row = result.rows[0];
      return row === undefined
        ? null
        : rowToItem(row as Record<string, unknown>);
    },

    async recordDeliveryEvidence(row) {
      await setTenant(client, row.tenantId);
      await client.query(
        `INSERT INTO attention_delivery_evidence (
           tenant_id, attention_item_id, delivery_generation,
           delivery_intent_id, delivery_observation_id, provider,
           outcome_kind, observed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)
         ON CONFLICT (tenant_id, attention_item_id, delivery_generation)
         DO UPDATE SET
           delivery_intent_id = EXCLUDED.delivery_intent_id,
           delivery_observation_id = EXCLUDED.delivery_observation_id,
           provider = EXCLUDED.provider,
           outcome_kind = EXCLUDED.outcome_kind,
           observed_at = EXCLUDED.observed_at`,
        [
          String(row.tenantId),
          String(row.attentionItemId),
          row.deliveryGeneration,
          row.deliveryIntentId,
          row.deliveryObservationId,
          row.provider,
          row.outcomeKind,
          row.observedAt,
        ],
      );
    },

    async listDeliveryEvidence(tenant, attentionItemIdValue) {
      await setTenant(client, tenant);
      const result = await client.query(
        `SELECT * FROM attention_delivery_evidence
         WHERE tenant_id = $1 AND attention_item_id = $2
         ORDER BY delivery_generation ASC`,
        [String(tenant), attentionItemIdValue],
      );
      return result.rows.map((row) =>
        rowToEvidence(row as Record<string, unknown>),
      );
    },
  };
}

function subjectParts(subject: AttentionSubject): {
  kind: string;
  id: string;
} {
  if (subject.kind === "resource") {
    return { kind: "resource", id: subject.resourceId };
  }
  if (subject.kind === "entity") {
    return { kind: "entity", id: subject.entityId };
  }
  return { kind: "operation", id: subject.operationId };
}

function subjectFromParts(kind: string, id: string): AttentionSubject {
  if (kind === "resource") {
    return { kind: "resource", resourceId: id };
  }
  if (kind === "entity") {
    return { kind: "entity", entityId: id };
  }
  return { kind: "operation", operationId: id };
}

function rowToItem(row: Record<string, unknown>): AttentionItem {
  const tid = tenantId(String(row.tenant_id));
  return {
    id: attentionItemId(String(row.attention_item_id)),
    conditionIdentity: {
      tenantId: tid,
      definitionId: attentionDefinitionId(String(row.definition_id)),
      definitionVersion: attentionDefinitionVersion(
        String(row.definition_version),
      ),
      subject: subjectFromParts(
        String(row.subject_kind),
        String(row.subject_id),
      ),
      semanticCutDigest: semanticCutDigest(String(row.semantic_cut_digest)),
      digest: conditionIdentityDigest(String(row.condition_identity_digest)),
    },
    lifecycle: row.lifecycle_json as AttentionLifecycle,
    materialFingerprint: materialFingerprint(String(row.material_fingerprint)),
    recipientPrincipalId: String(row.recipient_principal_id),
    recipientScope: String(row.recipient_scope) as "enterprise" | "personal",
    classId: String(row.class_id),
    proposalRef:
      row.proposal_ref == null ? undefined : String(row.proposal_ref),
    proposalStateBasisDigest:
      row.proposal_state_basis_digest == null
        ? undefined
        : String(row.proposal_state_basis_digest),
    sealedDisclosure: row.sealed_disclosure_json as AudienceDisclosure,
    deliveryGeneration: Number(row.delivery_generation),
    lastPreferenceDecision:
      row.last_preference_decision_json as PreferenceDecisionEvidence,
    lastDeliveryObservationId:
      row.last_delivery_observation_id == null
        ? undefined
        : String(row.last_delivery_observation_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToEvidence(
  row: Record<string, unknown>,
): AttentionDeliveryEvidenceRow {
  return {
    tenantId: tenantId(String(row.tenant_id)),
    attentionItemId: attentionItemId(String(row.attention_item_id)),
    deliveryGeneration: Number(row.delivery_generation),
    deliveryIntentId: String(row.delivery_intent_id),
    deliveryObservationId: String(row.delivery_observation_id),
    provider: String(row.provider),
    outcomeKind: String(
      row.outcome_kind,
    ) as AttentionDeliveryEvidenceRow["outcomeKind"],
    observedAt: toIso(row.observed_at),
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export type { ConditionIdentityDigest, TenantId };
