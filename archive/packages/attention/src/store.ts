import type {
  ConditionIdentityDigest,
  TenantId,
} from "./brands.js";
import type {
  AttentionDeliveryEvidenceRow,
  AttentionItem,
  AttentionUpsertResult,
  UpsertAttentionInput,
} from "./types.js";

export interface AttentionStore {
  upsertByCondition(input: UpsertAttentionInput): Promise<AttentionUpsertResult>;
  getByCondition(
    tenantId: TenantId,
    digest: ConditionIdentityDigest,
  ): Promise<AttentionItem | null>;
  getById(
    tenantId: TenantId,
    attentionItemId: string,
  ): Promise<AttentionItem | null>;
  recordDeliveryEvidence(row: AttentionDeliveryEvidenceRow): Promise<void>;
  listDeliveryEvidence(
    tenantId: TenantId,
    attentionItemId: string,
  ): Promise<readonly AttentionDeliveryEvidenceRow[]>;
}
