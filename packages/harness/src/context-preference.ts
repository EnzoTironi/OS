import { createHash, randomUUID } from "node:crypto";
import {
  audienceAllowsScope,
  createRetrievedContextRecord,
  preferencePayloadSchema,
  preferenceScopeSchema,
  type ContextRetrieveRequest,
  type ContextScope,
  type ContextSource,
  type PreferencePayload,
  type PreferenceScope,
  type RetrievedContextRecord,
} from "./context-source.js";

export type PreferenceRecord = {
  readonly preferenceId: string;
  readonly scope: PreferenceScope;
  readonly key: string;
  readonly value: PreferencePayload;
  readonly updatedAt: string;
  readonly updatedByPrincipalId: string;
};

export interface PreferenceStore {
  put(
    input: Omit<PreferenceRecord, "preferenceId" | "updatedAt"> & {
      readonly preferenceId?: string;
    },
  ): Promise<PreferenceRecord>;
  list(scope: PreferenceScope): Promise<readonly PreferenceRecord[]>;
}

export function createMemoryPreferenceStore(): PreferenceStore {
  const rows = new Map<string, PreferenceRecord>();
  return {
    async put(input) {
      const scope = preferenceScopeSchema.parse(input.scope);
      const value = preferencePayloadSchema.parse(input.value);
      if (value.type === "remember_this" && value.scope.kind !== scope.kind) {
        throw new Error("remember_this scope must match preference row scope");
      }
      const preferenceId =
        input.preferenceId ??
        createHash("sha256")
          .update(
            JSON.stringify({
              key: input.key,
              scope,
              salt: randomUUID(),
            }),
          )
          .digest("hex")
          .slice(0, 32);
      const record: PreferenceRecord = {
        preferenceId: `pref.${preferenceId}`,
        scope,
        key: input.key,
        value,
        updatedAt: new Date().toISOString(),
        updatedByPrincipalId: input.updatedByPrincipalId,
      };
      rows.set(rowKey(record.scope, record.key), record);
      return record;
    },
    async list(scope) {
      const parsed = preferenceScopeSchema.parse(scope);
      return [...rows.values()].filter((row) => scopeEquals(row.scope, parsed));
    },
  };
}

export class PreferenceContextSource implements ContextSource {
  readonly id = "preference";
  readonly #store: PreferenceStore;

  constructor(store: PreferenceStore) {
    this.#store = store;
  }

  async retrieve(
    request: ContextRetrieveRequest,
  ): Promise<readonly RetrievedContextRecord[]> {
    const scopes = scopesForRequest(request);
    const records: RetrievedContextRecord[] = [];
    for (const scope of scopes) {
      const rows = await this.#store.list(scope);
      for (const row of rows) {
        const scope = contextScopeForPreference(row.scope);
        const allow = audienceAllowsScope(request.audience, scope);
        if (!allow.ok) {
          continue;
        }
        records.push(
          createRetrievedContextRecord({
            trustClass: "preference",
            scope,
            attribution: {
              kind: "preference",
              preferenceId: row.preferenceId,
              key: row.key,
            },
            retention: { kind: "preference" },
            payload: {
              trustClass: "preference",
              key: row.key,
              value: row.value,
              preferenceScope: row.scope,
            },
          }),
        );
      }
    }
    return records;
  }
}

function scopesForRequest(
  request: ContextRetrieveRequest,
): readonly PreferenceScope[] {
  const { trustedContext, audience } = request;
  switch (audience.kind) {
    case "enterprise":
      return [
        {
          kind: "principal",
          tenantId: trustedContext.tenantId,
          principalId: trustedContext.principalId,
        },
        {
          kind: "tenant_presentation",
          tenantId: trustedContext.tenantId,
        },
      ];
    case "personal":
      return [{ kind: "account", accountId: audience.accountId }];
    case "cross-workspace":
      return [
        {
          kind: "principal",
          tenantId: audience.tenantId,
          principalId: trustedContext.principalId,
        },
        { kind: "account", accountId: audience.accountId, tenantId: audience.tenantId },
        { kind: "tenant_presentation", tenantId: audience.tenantId },
      ];
    default: {
      const exhaustive: never = audience;
      return exhaustive;
    }
  }
}

function rowKey(scope: PreferenceScope, key: string): string {
  return `${JSON.stringify(scope)}::${key}`;
}

function scopeEquals(left: PreferenceScope, right: PreferenceScope): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function contextScopeForPreference(scope: PreferenceScope): ContextScope {
  switch (scope.kind) {
    case "principal":
      return scope;
    case "account":
      return scope;
    case "tenant_presentation":
      return { kind: "tenant", tenantId: scope.tenantId };
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}
