import {
  assembledContextDigest,
  audienceAllowsScope,
  projectAssembledForModel,
  type AssembledContext,
  type ContextRetrieveRequest,
  type ContextSource,
  type ContextSourceFailure,
} from "./context-source.js";
import type { QueryCapability } from "./types.js";

export {
  assembledContextDigest,
  createRetrievedContextRecord,
  projectAssembledForModel,
  trustClassSchema,
  type AssembledContext,
  type AttributionRef,
  type ContextAudience,
  type ContextPayload,
  type ContextPurpose,
  type ContextRetrieveRequest,
  type ContextScope,
  type ContextSource,
  type ContextSourceFailure,
  type EvidenceAdmitCommand,
  type PreferencePayload,
  type PreferenceScope,
  type RetrievedContextRecord,
  type SourceAdmissionState,
  type SourceAdmissionView,
  type TranscriptionDerivation,
  type TrustClass,
} from "./context-source.js";
export {
  InteractionContextSource,
  createMemoryInteractionContextStore,
  type InteractionContextStore,
  type StoredInteraction,
} from "./context-interaction.js";
export {
  PreferenceContextSource,
  createMemoryPreferenceStore,
  type PreferenceRecord,
  type PreferenceStore,
} from "./context-preference.js";
export {
  KnowledgeContextSource,
  createMemoryKnowledgeAdmissionIndex,
  type KnowledgeAdmissionIndex,
} from "./context-knowledge.js";
export {
  HistoryContextSource,
  WorldContextSource,
} from "./context-world.js";
export {
  createEvidenceAdmission,
  type EvidenceAdmission,
  type WorldEvidenceRecorder,
} from "./evidence-admission.js";

export interface TrustTaggedContextAssembler {
  assemble(request: ContextRetrieveRequest): Promise<AssembledContext>;
}

export function createTrustTaggedAssembler(input: {
  readonly sources: readonly ContextSource[];
}): TrustTaggedContextAssembler {
  const sources = [...input.sources];
  return {
    async assemble(request) {
      const settled = await Promise.allSettled(
        sources.map(async (source) => ({
          sourceId: source.id,
          records: await source.retrieve(request),
        })),
      );
      const records = [];
      const failures: ContextSourceFailure[] = [];
      for (const [index, outcome] of settled.entries()) {
        const source = sources[index];
        if (source === undefined) {
          continue;
        }
        if (outcome.status === "rejected") {
          failures.push({
            sourceId: source.id,
            code: "unavailable",
            observation:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
          });
          continue;
        }
        for (const record of outcome.value.records) {
          const allow = audienceAllowsScope(request.audience, record.scope);
          if (!allow.ok) {
            failures.push({
              sourceId: source.id,
              code: allow.code,
              observation: `dropped ${record.recordId} for audience ${request.audience.kind}`,
            });
            continue;
          }
          if (
            "tenantId" in record.scope &&
            record.scope.tenantId !== undefined &&
            record.scope.tenantId !== request.trustedContext.tenantId &&
            request.audience.kind !== "cross-workspace"
          ) {
            failures.push({
              sourceId: source.id,
              code: "wrong_tenant",
              observation: `dropped ${record.recordId}`,
            });
            continue;
          }
          records.push(record);
        }
      }
      const preferenceScopes = new Set(
        records
          .filter((record) => record.trustClass === "preference")
          .map((record) => JSON.stringify(record.scope)),
      );
      if (preferenceScopes.size > 1) {
        failures.push({
          sourceId: "preference",
          code: "preference_conflict",
          observation: "multiple preference scopes present; both kept labelled",
        });
      }
      return {
        assembledAt: new Date().toISOString(),
        tenantId: request.trustedContext.tenantId,
        purpose: request.purpose,
        records,
        failures,
        digest: assembledContextDigest(records),
      };
    },
  };
}

export class TrustTaggedAgentContextAssembler {
  readonly #assembler: TrustTaggedContextAssembler;

  constructor(assembler: TrustTaggedContextAssembler) {
    this.#assembler = assembler;
  }

  assemble(input: {
    readonly knowledgeQuery: string;
    readonly trustedContext: ContextRetrieveRequest["trustedContext"];
    readonly sessionId: string;
    readonly taskId: string;
    readonly explainOperationId?: string;
    readonly queryCapabilities?: readonly QueryCapability[];
    readonly audience?: ContextRetrieveRequest["audience"];
  }): Promise<AssembledContext> {
    return this.#assembler.assemble({
      trustedContext: input.trustedContext,
      audience: input.audience ?? {
        kind: "enterprise",
        tenantId: input.trustedContext.tenantId,
      },
      purpose: {
        kind: "planning",
        sessionId: input.sessionId,
        taskId: input.taskId,
        knowledgeQuery: input.knowledgeQuery,
        explainOperationId: input.explainOperationId,
        queryCapabilities: input.queryCapabilities,
      },
    });
  }
}

export { projectAssembledForModel as projectAssembledContextForModel };
