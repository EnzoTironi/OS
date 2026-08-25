import type { ConditionIdentityDigest, TenantId } from "./brands.js";
import type { AttentionStore } from "./store.js";
import type {
  AttentionDeliveryEvidenceRow,
  AttentionItem,
} from "./types.js";

export function createMemoryAttentionStore(): AttentionStore {
  const items = new Map<string, AttentionItem>();
  const evidence = new Map<string, AttentionDeliveryEvidenceRow[]>();

  return {
    async upsertByCondition(input) {
      const key = itemKey(
        input.item.conditionIdentity.tenantId,
        input.item.conditionIdentity.digest,
      );
      const existing = items.get(key);
      items.set(key, input.item);
      return { created: existing === undefined, item: input.item };
    },

    async getByCondition(tenantId, digest) {
      return items.get(itemKey(tenantId, digest)) ?? null;
    },

    async getById(tenantId, attentionItemId) {
      for (const item of items.values()) {
        if (
          String(item.conditionIdentity.tenantId) === String(tenantId) &&
          String(item.id) === attentionItemId
        ) {
          return item;
        }
      }
      return null;
    },

    async recordDeliveryEvidence(row) {
      const key = `${String(row.tenantId)}:${String(row.attentionItemId)}`;
      const list = evidence.get(key) ?? [];
      const filtered = list.filter(
        (entry) => entry.deliveryGeneration !== row.deliveryGeneration,
      );
      filtered.push(row);
      evidence.set(key, filtered);
    },

    async listDeliveryEvidence(tenantId, attentionItemId) {
      return (
        evidence.get(`${String(tenantId)}:${attentionItemId}`) ?? []
      ).slice();
    },
  };
}

function itemKey(
  tenantId: TenantId,
  digest: ConditionIdentityDigest,
): string {
  return `${String(tenantId)}:${String(digest)}`;
}
