import { createHash } from "node:crypto";
import type { InteractionRecord } from "@zoen/interaction";
import {
  audienceAllowsScope,
  createRetrievedContextRecord,
  type ContextRetrieveRequest,
  type ContextSource,
  type RetrievedContextRecord,
  type SourceAdmissionState,
} from "./context-source.js";

export type StoredInteraction = {
  readonly record: InteractionRecord;
  readonly admission: SourceAdmissionState;
  readonly present: boolean;
  readonly summary: string;
};

export interface InteractionContextStore {
  accept(record: InteractionRecord, summary?: string): Promise<StoredInteraction>;
  get(interactionId: string): Promise<StoredInteraction | undefined>;
  listRecent(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly limit?: number;
  }): Promise<readonly StoredInteraction[]>;
  forgetInteraction(interactionId: string): Promise<void>;
  setAdmission(
    interactionId: string,
    admission: SourceAdmissionState,
  ): Promise<StoredInteraction>;
}

export function createMemoryInteractionContextStore(): InteractionContextStore {
  const rows = new Map<string, StoredInteraction>();
  return {
    async accept(record, summary) {
      const stored: StoredInteraction = {
        record,
        admission: { kind: "interaction-only" },
        present: true,
        summary: summary ?? summarize(record),
      };
      rows.set(record.id, stored);
      return stored;
    },
    async get(interactionId) {
      return rows.get(interactionId);
    },
    async listRecent(input) {
      return [...rows.values()]
        .filter(
          (row) =>
            row.present &&
            row.record.ctx.tenantId === input.tenantId &&
            row.record.ctx.principalId === input.principalId,
        )
        .sort((left, right) =>
          right.record.acceptedAt.localeCompare(left.record.acceptedAt),
        )
        .slice(0, input.limit ?? 8);
    },
    async forgetInteraction(interactionId) {
      const existing = rows.get(interactionId);
      if (existing === undefined) {
        return;
      }
      const admission =
        existing.admission.kind === "admitted"
          ? { ...existing.admission, sourceRefsPresent: false }
          : existing.admission;
      rows.set(interactionId, {
        ...existing,
        present: false,
        admission,
      });
    },
    async setAdmission(interactionId, admission) {
      const existing = rows.get(interactionId);
      if (existing === undefined) {
        throw new Error(`unknown interaction ${interactionId}`);
      }
      const next = { ...existing, admission };
      rows.set(interactionId, next);
      return next;
    },
  };
}

export class InteractionContextSource implements ContextSource {
  readonly id = "interaction";
  readonly #store: InteractionContextStore;

  constructor(store: InteractionContextStore) {
    this.#store = store;
  }

  async retrieve(
    request: ContextRetrieveRequest,
  ): Promise<readonly RetrievedContextRecord[]> {
    const recent = await this.#store.listRecent({
      tenantId: request.trustedContext.tenantId,
      principalId: request.trustedContext.principalId,
    });
    const records: RetrievedContextRecord[] = [];
    for (const row of recent) {
      const scope = {
        kind: "session" as const,
        tenantId: row.record.ctx.tenantId,
        sessionId:
          request.purpose.kind === "planning" ||
          request.purpose.kind === "continuity"
            ? request.purpose.sessionId
            : row.record.semanticCorrelationKey,
        principalId: row.record.ctx.principalId,
      };
      const allow = audienceAllowsScope(request.audience, scope);
      if (!allow.ok) {
        continue;
      }
      records.push(
        createRetrievedContextRecord({
          trustClass: "interaction",
          scope,
          attribution: {
            kind: "interaction",
            interactionId: row.record.id,
            semanticCorrelationKey: row.record.semanticCorrelationKey,
          },
          retention: { kind: "interaction" },
          payload: {
            trustClass: "interaction",
            recentRefs: [
              {
                interactionId: row.record.id,
                summary: row.summary,
              },
            ],
          },
        }),
      );
    }
    return records;
  }
}

function summarize(record: InteractionRecord): string {
  switch (record.inbound.body.kind) {
    case "text":
      return record.inbound.body.text.slice(0, 240);
    case "media":
      return `media:${record.inbound.body.mediaRef}`;
    case "control_click":
      return `control:${record.inbound.body.controlRef}`;
    case "reaction":
      return `reaction:${record.inbound.body.emoji}`;
    case "unsupported":
      return `unsupported:${record.inbound.body.reason}`;
    default: {
      const exhaustive: never = record.inbound.body;
      return exhaustive;
    }
  }
}

export function interactionContinuityKey(
  tenantId: string,
  principalId: string,
  seed: string,
): string {
  return createHash("sha256")
    .update(`${tenantId}:${principalId}:${seed}`)
    .digest("hex");
}
