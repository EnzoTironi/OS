import { opaqueId, type OpaqueId } from "./brands.js";
import { assertNoContentPayload } from "./privacy.js";
import type {
  FrictionEntry,
  FrictionStore,
  ObservationRecord,
  ObservationStore,
} from "./types.js";

type StoredObservation = ObservationRecord & { exported: boolean };

export function createMemoryObservationStore(): ObservationStore {
  const byTenant = new Map<string, Map<string, StoredObservation>>();

  function tenantMap(tenantId: OpaqueId): Map<string, StoredObservation> {
    let map = byTenant.get(tenantId);
    if (map === undefined) {
      map = new Map();
      byTenant.set(tenantId, map);
    }
    return map;
  }

  return {
    async insert(record) {
      assertNoContentPayload(record);
      const map = tenantMap(record.tenantId);
      const existing = map.get(record.eventId);
      if (existing !== undefined) {
        const { exported: _exported, ...rest } = existing;
        return rest;
      }
      map.set(record.eventId, { ...record, exported: false });
      return record;
    },

    async getByEventId(tenantId, eventId) {
      const stored = tenantMap(tenantId).get(eventId);
      if (stored === undefined) {
        return undefined;
      }
      const { exported: _exported, ...rest } = stored;
      return rest;
    },

    async listBySession(tenantId, sessionId) {
      const out: ObservationRecord[] = [];
      for (const stored of tenantMap(tenantId).values()) {
        if (stored.sessionId === sessionId) {
          const { exported: _exported, ...rest } = stored;
          out.push(rest);
        }
      }
      return out.sort((a, b) => a.observedAtMicros - b.observedAtMicros);
    },

    async listPendingExport(tenantId, limit) {
      const out: ObservationRecord[] = [];
      for (const stored of tenantMap(tenantId).values()) {
        if (!stored.exported) {
          const { exported: _exported, ...rest } = stored;
          out.push(rest);
          if (out.length >= limit) {
            break;
          }
        }
      }
      return out;
    },

    async markExported(tenantId, eventIds) {
      const map = tenantMap(tenantId);
      for (const eventId of eventIds) {
        const stored = map.get(eventId);
        if (stored !== undefined) {
          stored.exported = true;
        }
      }
    },
  };
}

export function createMemoryFrictionStore(): FrictionStore {
  const entries: FrictionEntry[] = [];
  return {
    async append(entry) {
      entries.push(entry);
      return entry;
    },
    async listBySession(sessionId) {
      return entries.filter((entry) => entry.sessionId === sessionId);
    },
  };
}

/** Cross-tenant inspect helper for tests: returns undefined when tenant differs. */
export async function inspectSession(
  store: ObservationStore,
  tenantId: string,
  sessionId: string,
): Promise<readonly ObservationRecord[]> {
  return store.listBySession(opaqueId(tenantId), opaqueId(sessionId));
}
