import {
  type AmbiguityCandidateId,
  type AmbiguityQuestionId,
  type AmbiguityRecordId,
  type GoalDigest,
  type MappingArtifactId,
  type MappingRevision,
} from "./brands.js";
import type {
  MappingArtifact,
  MappingArtifactStore,
  MappingTarget,
  SourceFieldRef,
} from "./mapping-artifact.js";
import type {
  MissingCapability,
  OnboardingSession,
} from "./types.js";

export type AmbiguityKind =
  | "same_entity_or_variant"
  | "quantity_meaning"
  | "date_meaning"
  | "row_temporality"
  | "source_precedence"
  | "conflicting_binding";

export type AmbiguityCandidate = {
  readonly id: AmbiguityCandidateId;
  readonly label: string;
  readonly interpretation:
    | MappingTarget
    | { readonly kind: "distinct_entities" }
    | {
        readonly kind: "quantity_class";
        readonly class: "physical" | "available" | "accounting";
      }
    | {
        readonly kind: "date_class";
        readonly class: "requested_delivery" | "promised_delivery" | "invoice";
      }
    | {
        readonly kind: "temporality";
        readonly class: "current_state" | "historical_occurrence";
      }
    | {
        readonly kind: "precedence";
        readonly winnerSourceId: string;
        readonly relation: "supersedes" | "supports" | "rivals";
      };
};

export type AmbiguityStatus =
  | { readonly kind: "open" }
  | {
      readonly kind: "answered";
      readonly choice: AmbiguityCandidateId;
      readonly answeredBy: string;
      readonly answeredAt: string;
    }
  | { readonly kind: "superseded"; readonly byRecordId: AmbiguityRecordId };

export type AmbiguityRecord = {
  readonly id: AmbiguityRecordId;
  readonly questionId: AmbiguityQuestionId;
  readonly tenantId: string;
  readonly goalDigest: GoalDigest;
  readonly artifactId: MappingArtifactId;
  readonly artifactRevision: MappingRevision;
  readonly kind: AmbiguityKind;
  readonly prompt: string;
  readonly why: string;
  readonly sourceFieldRefs: ReadonlyArray<SourceFieldRef>;
  readonly candidates: ReadonlyArray<AmbiguityCandidate>;
  readonly status: AmbiguityStatus;
  readonly createdAt: string;
};

export interface AmbiguityRecordStore {
  get(id: AmbiguityRecordId): Promise<AmbiguityRecord | null>;
  put(record: AmbiguityRecord): Promise<void>;
  listOpen(query: {
    readonly tenantId: string;
    readonly goalDigest: GoalDigest;
    readonly artifactId?: MappingArtifactId;
  }): Promise<ReadonlyArray<AmbiguityRecord>>;
}

export function questionFromRecord(
  record: AmbiguityRecord,
): Extract<MissingCapability, { kind: "ambiguity" }> {
  return {
    kind: "ambiguity",
    questionId: record.questionId,
    prompt: record.prompt,
    why: record.why,
  };
}

export async function listOpenAmbiguities(input: {
  readonly tenantId: string;
  readonly goalDigest: GoalDigest;
  readonly artifactId?: MappingArtifactId;
  readonly store: AmbiguityRecordStore;
}): Promise<ReadonlyArray<AmbiguityRecord>> {
  return input.store.listOpen({
    tenantId: input.tenantId,
    goalDigest: input.goalDigest,
    artifactId: input.artifactId,
  });
}

export async function answerAmbiguity(input: {
  readonly recordId: AmbiguityRecordId;
  readonly choice: AmbiguityCandidateId;
  readonly answeredBy: string;
  readonly store: AmbiguityRecordStore;
  readonly mappingStore: MappingArtifactStore;
  readonly now?: string;
}): Promise<AmbiguityRecord> {
  const existing = await input.store.get(input.recordId);
  if (existing === null) {
    throw new Error(`AmbiguityRecord not found: ${input.recordId}`);
  }

  if (existing.status.kind === "answered") {
    if (existing.status.choice === input.choice) {
      return existing;
    }
    throw new Error(
      `AmbiguityRecord ${input.recordId} already answered with a different choice`,
    );
  }
  if (existing.status.kind === "superseded") {
    throw new Error(`AmbiguityRecord ${input.recordId} is superseded`);
  }
  if (!existing.candidates.some((c) => c.id === input.choice)) {
    throw new Error(
      `Choice ${input.choice} is not a candidate on ${input.recordId}`,
    );
  }
  if (existing.candidates.length < 2 && existing.status.kind === "open") {
    throw new Error("Open AmbiguityRecord must have at least two candidates");
  }

  const now = input.now ?? new Date().toISOString();
  const answered: AmbiguityRecord = {
    ...existing,
    status: {
      kind: "answered",
      choice: input.choice,
      answeredBy: input.answeredBy,
      answeredAt: now,
    },
  };
  await input.store.put(answered);

  const artifact = await input.mappingStore.get(
    existing.artifactId,
    existing.artifactRevision,
  );
  if (artifact !== null && artifact.status.kind === "ambiguous") {
    const stillOpen = await input.store.listOpen({
      tenantId: existing.tenantId,
      goalDigest: existing.goalDigest,
      artifactId: existing.artifactId,
    });
    const nextStatus =
      stillOpen.length === 0
        ? ({ kind: "ready_to_publish" } as const)
        : ({
            kind: "ambiguous",
            openRecordIds: stillOpen.map((r) => r.id),
          } as const);
    const nextArtifact: MappingArtifact = {
      ...artifact,
      status: nextStatus,
    };
    await input.mappingStore.put(nextArtifact);
  }

  return answered;
}

export function syncUnresolvedQuestions(
  session: OnboardingSession,
  open: ReadonlyArray<AmbiguityRecord>,
): OnboardingSession {
  return {
    ...session,
    unresolvedQuestions: open.map((r) => r.questionId),
    updatedAt: new Date().toISOString(),
  };
}

export function createMemoryAmbiguityStore(): AmbiguityRecordStore & {
  readonly snapshot: () => Map<string, AmbiguityRecord>;
} {
  const byId = new Map<string, AmbiguityRecord>();
  return {
    async get(id) {
      return byId.get(id) ?? null;
    },
    async put(record) {
      byId.set(record.id, record);
    },
    async listOpen(query) {
      return [...byId.values()].filter(
        (r) =>
          r.status.kind === "open" &&
          r.tenantId === query.tenantId &&
          r.goalDigest === query.goalDigest &&
          (query.artifactId === undefined || r.artifactId === query.artifactId),
      );
    },
    snapshot() {
      return new Map(byId);
    },
  };
}
