import {
  audienceAllowsScope,
  createRetrievedContextRecord,
  type ContextRetrieveRequest,
  type ContextSource,
  type RetrievedContextRecord,
  type SourceAdmissionState,
  type SourceAdmissionView,
  type TranscriptionDerivation,
} from "./context-source.js";
import type { CompanyBrain } from "./knowledge.js";
import type { KnowledgeContextResult } from "./types.js";

export interface KnowledgeAdmissionIndex {
  get(input: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly sourceRevision: string;
    readonly contentDigest: string;
  }): Promise<SourceAdmissionState | undefined>;
  put(input: {
    readonly tenantId: string;
    readonly state: SourceAdmissionState;
  }): Promise<void>;
}

export function createMemoryKnowledgeAdmissionIndex(): KnowledgeAdmissionIndex {
  const rows = new Map<string, SourceAdmissionState>();
  return {
    async get(input) {
      return rows.get(
        key(
          input.tenantId,
          input.sourceId,
          input.sourceRevision,
          input.contentDigest,
        ),
      );
    },
    async put(input) {
      if (input.state.kind === "interaction-only") {
        return;
      }
      rows.set(
        key(
          input.tenantId,
          input.state.sourceId,
          input.state.sourceRevision,
          input.state.contentDigest,
        ),
        input.state,
      );
    },
  };
}

export type KnowledgeDerivationLookup = (result: KnowledgeContextResult) =>
  | TranscriptionDerivation
  | undefined;

export class KnowledgeContextSource implements ContextSource {
  readonly id = "knowledge";
  readonly #brain: CompanyBrain;
  readonly #admissions: KnowledgeAdmissionIndex;
  readonly #derivationFor: KnowledgeDerivationLookup;

  constructor(
    brain: CompanyBrain,
    admissions: KnowledgeAdmissionIndex = createMemoryKnowledgeAdmissionIndex(),
    derivationFor: KnowledgeDerivationLookup = () => undefined,
  ) {
    this.#brain = brain;
    this.#admissions = admissions;
    this.#derivationFor = derivationFor;
  }

  get admissions(): KnowledgeAdmissionIndex {
    return this.#admissions;
  }

  async retrieve(
    request: ContextRetrieveRequest,
  ): Promise<readonly RetrievedContextRecord[]> {
    if (request.purpose.kind !== "planning") {
      return [];
    }
    const query = request.purpose.knowledgeQuery;
    if (query === undefined || query.length === 0) {
      return [];
    }
    const knowledge = await this.#brain.retrieve(
      request.trustedContext.tenantId,
      query,
    );
    const records: RetrievedContextRecord[] = [];
    for (const result of knowledge.results) {
      const scope = {
        kind: "tenant" as const,
        tenantId: request.trustedContext.tenantId,
      };
      const allow = audienceAllowsScope(request.audience, scope);
      if (!allow.ok) {
        continue;
      }
      const admissionState = await this.#admissions.get({
        tenantId: request.trustedContext.tenantId,
        sourceId: result.sourceId,
        sourceRevision: result.sourceRevision,
        contentDigest: result.sourceDigest,
      });
      const admission = toAdmissionView(admissionState);
      const derivation = this.#derivationFor(result);
      records.push(
        createRetrievedContextRecord({
          trustClass: "knowledge",
          scope,
          attribution: {
            kind: "fragment",
            fragmentId: result.fragmentId,
            fragmentDigest: result.fragmentDigest,
            sourceId: result.sourceId,
            sourceRevision: result.sourceRevision,
            contentDigest: result.sourceDigest,
          },
          retention: { kind: "knowledge-source" },
          ranking: {
            lexicalRank: result.lexicalRank,
            vectorRank: result.vectorRank,
            score:
              (result.lexicalScore ?? 0) * 0.5 + (result.vectorScore ?? 0) * 0.5,
          },
          payload: {
            trustClass: "knowledge",
            text: result.text,
            admission,
            indexVersion: result.indexVersion,
            parserName: result.parserName,
            parserVersionDigest: result.parserVersionDigest,
            ...(derivation === undefined ? {} : { derivation }),
          },
        }),
      );
    }
    return records;
  }
}

function toAdmissionView(
  state: SourceAdmissionState | undefined,
): SourceAdmissionView {
  if (state === undefined) {
    return { kind: "candidate" };
  }
  switch (state.kind) {
    case "interaction-only":
      return { kind: "candidate" };
    case "ingested":
      return { kind: "ingested" };
    case "admitted":
      return {
        kind: "admitted",
        claimId: state.claimId,
        admittedAt: state.admittedAt,
      };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function key(
  tenantId: string,
  sourceId: string,
  sourceRevision: string,
  contentDigest: string,
): string {
  return `${tenantId}:${sourceId}:${sourceRevision}:${contentDigest}`;
}
