import type { ConditionIdentityDigest, TenantId } from "./brands.js";
import type { AttentionWakeJob } from "./types.js";

/**
 * Restate/wake adapter. Schedules evaluate/digest only.
 * Must never call effect adapters or Action commit shortcuts.
 */
export interface AttentionWakeScheduler {
  scheduleEvaluate(input: {
    readonly conditionDigest: ConditionIdentityDigest;
    readonly notBefore: string;
  }): Promise<void>;
  scheduleDigestFlush(input: {
    readonly tenantId: TenantId;
    readonly principalId: string;
    readonly notBefore: string;
  }): Promise<void>;
  drain(): Promise<readonly AttentionWakeJob[]>;
}

export function createMemoryAttentionWakeScheduler(): AttentionWakeScheduler {
  const jobs: AttentionWakeJob[] = [];
  return {
    async scheduleEvaluate(input) {
      jobs.push({
        kind: "evaluate",
        conditionDigest: input.conditionDigest,
        notBefore: input.notBefore,
      });
    },
    async scheduleDigestFlush(input) {
      jobs.push({
        kind: "digest_flush",
        tenantId: input.tenantId,
        principalId: input.principalId,
        notBefore: input.notBefore,
      });
    },
    async drain() {
      return jobs.splice(0, jobs.length);
    },
  };
}


