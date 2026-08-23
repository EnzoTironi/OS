import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import canonicalize from "canonicalize";
import {
  ambiguityCandidateId,
  ambiguityQuestionId,
  ambiguityRecordId,
  mappingArtifactId,
  mappingRevision,
  type AmbiguityRecordId,
  type GoalDigest,
  type MappingArtifactId,
  type MappingRevision,
  type SourceConnectionId,
} from "./brands.js";
import type {
  AmbiguityKind,
  AmbiguityRecord,
  AmbiguityRecordStore,
} from "./ambiguity-record.js";

export type SourceFieldRef = {
  readonly fieldId: string;
  readonly path: string;
  readonly valueKindHint?: "text" | "number" | "date" | "entity_ref";
  readonly sampleDigest?: string;
};

/**
 * Inspected read-only source identity. Knowledge trust class only.
 * Personal-workspace sources are unrepresentable on this path.
 */
export type SourceSchemaRef = {
  readonly connectionId: SourceConnectionId;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly contentDigest: string;
  readonly schemaDigest: string;
  readonly fields: ReadonlyArray<SourceFieldRef>;
  readonly inspectedAt: string;
  readonly workspaceClass: "enterprise";
};

export type MappingArtifactStatus =
  | { readonly kind: "proposed" }
  | {
      readonly kind: "ambiguous";
      readonly openRecordIds: ReadonlyArray<AmbiguityRecordId>;
    }
  | { readonly kind: "ready_to_publish" }
  | {
      readonly kind: "published";
      readonly definitionId: string;
      readonly definitionRevision: string;
      readonly definitionDigest: string;
      readonly activatedAt: string;
    }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "superseded";
      readonly byRevision: MappingRevision;
      readonly reason: "source_schema_drift" | "manual" | "ontology_moved";
    };

export type MappingTarget =
  | { readonly kind: "identity_relation"; readonly relationId: string }
  | { readonly kind: "observation_claim"; readonly relationId: string }
  | { readonly kind: "type_extension"; readonly typeId: string }
  | { readonly kind: "compose_package"; readonly packageId: string };

export type MappingBinding = {
  readonly bindingId: string;
  readonly sourceField: SourceFieldRef;
  readonly target: MappingTarget;
  readonly resolutionRecordId?: AmbiguityRecordId;
};

export type MappingArtifact = {
  readonly id: MappingArtifactId;
  readonly revision: MappingRevision;
  readonly digest: string;
  readonly tenantId: string;
  readonly goalDigest: GoalDigest;
  readonly schemaRef: SourceSchemaRef;
  readonly basisDefinitionDigests: ReadonlyArray<string>;
  readonly bindings: ReadonlyArray<MappingBinding>;
  readonly status: MappingArtifactStatus;
  readonly createdAt: string;
};

export interface MappingArtifactStore {
  get(
    id: MappingArtifactId,
    revision?: MappingRevision,
  ): Promise<MappingArtifact | null>;
  put(artifact: MappingArtifact): Promise<void>;
  listByGoal(goalDigest: GoalDigest): Promise<ReadonlyArray<MappingArtifact>>;
}

export interface DefinitionPublishPort {
  publish(input: {
    readonly tenantId: string;
    readonly digest: string;
    readonly canonicalJson: Uint8Array;
  }): Promise<{
    readonly definitionRevision: {
      readonly digest: string;
      readonly revision: bigint;
    };
  }>;
  activateRevision(input: {
    readonly tenantId: string;
    readonly definitionId: string;
    readonly digest: string;
  }): Promise<void>;
}

export type MappingCandidate = {
  readonly sourceField: string;
  readonly target: MappingTarget;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalizeMappingArtifact(input: {
  readonly tenantId: string;
  readonly goalDigest: GoalDigest;
  readonly schemaRef: SourceSchemaRef;
  readonly basisDefinitionDigests: ReadonlyArray<string>;
  readonly bindings: ReadonlyArray<MappingBinding>;
}): { readonly digest: string; readonly revision: MappingRevision } {
  const canonical = canonicalize({
    basisDefinitionDigests: [...input.basisDefinitionDigests].sort(),
    bindings: input.bindings.map((b) => ({
      bindingId: b.bindingId,
      resolutionRecordId: b.resolutionRecordId,
      sourceField: b.sourceField.fieldId,
      target: b.target,
    })),
    goalDigest: input.goalDigest,
    schemaDigest: input.schemaRef.schemaDigest,
    sourceRevision: input.schemaRef.sourceRevision,
    tenantId: input.tenantId,
  });
  if (canonical === undefined) {
    throw new Error("MappingArtifact is not canonicalizable");
  }
  const digest = sha256Hex(canonical);
  return { digest, revision: mappingRevision(digest) };
}

function fieldById(
  schemaRef: SourceSchemaRef,
  fieldId: string,
): SourceFieldRef | undefined {
  return schemaRef.fields.find((f) => f.fieldId === fieldId);
}

function conflictKind(
  a: MappingCandidate,
  b: MappingCandidate,
): AmbiguityKind | null {
  if (a.sourceField === b.sourceField) {
    return "conflicting_binding";
  }
  if (
    a.target.kind === "identity_relation" &&
    b.target.kind === "identity_relation" &&
    a.target.relationId === b.target.relationId
  ) {
    return "same_entity_or_variant";
  }
  if (
    a.target.kind === "observation_claim" &&
    a.target.relationId.includes("onHand")
  ) {
    return null;
  }
  return null;
}

function promptFor(
  kind: AmbiguityKind,
  fields: ReadonlyArray<SourceFieldRef>,
): { readonly prompt: string; readonly why: string } {
  const joined = fields.map((f) => f.fieldId).join(" vs ");
  switch (kind) {
    case "same_entity_or_variant":
      return {
        prompt: `Are ${joined} the same product identity or distinct variants?`,
        why: "Two source fields claim the same identity relation.",
      };
    case "quantity_meaning":
      return {
        prompt: `Is ${joined} physical, available, or accounting stock?`,
        why: "Quantity meaning is contested.",
      };
    case "conflicting_binding":
      return {
        prompt: `Which target should ${joined} map to?`,
        why: "One source field has competing targets.",
      };
    default:
      return {
        prompt: `Resolve mapping ambiguity for ${joined}`,
        why: `Material ambiguity kind ${kind}.`,
      };
  }
}

/**
 * Fail closed unless every org-specific field→target binding lives on the artifact.
 * Parser tables must not be the SoR for company semantics.
 */
export function assertNoHiddenMappings(input: {
  readonly artifact: MappingArtifact;
  readonly parserEncodedBindings?: ReadonlyArray<{
    readonly sourceField: string;
    readonly targetRelationId: string;
  }>;
}): void {
  const allowed = new Set(
    input.artifact.bindings.map(
      (b) => `${b.sourceField.fieldId}->${JSON.stringify(b.target)}`,
    ),
  );
  for (const hidden of input.parserEncodedBindings ?? []) {
    const key = `${hidden.sourceField}->${JSON.stringify({
      kind: "identity_relation",
      relationId: hidden.targetRelationId,
    })}`;
    const observationKey = `${hidden.sourceField}->${JSON.stringify({
      kind: "observation_claim",
      relationId: hidden.targetRelationId,
    })}`;
    if (!allowed.has(key) && !allowed.has(observationKey)) {
      throw new Error(
        `Hidden mapping in parser is forbidden: ${hidden.sourceField}→${hidden.targetRelationId}`,
      );
    }
  }
}

export async function proposeMappings(input: {
  readonly tenantId: string;
  readonly goalDigest: GoalDigest;
  readonly schemaRef: SourceSchemaRef;
  readonly basisDefinitionDigests?: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<MappingCandidate>;
  readonly store: MappingArtifactStore;
  readonly ambiguityStore: AmbiguityRecordStore;
  readonly now?: string;
  readonly artifactId?: MappingArtifactId;
}): Promise<{
  readonly artifact: MappingArtifact;
  readonly openAmbiguities: ReadonlyArray<AmbiguityRecord>;
}> {
  if (input.schemaRef.workspaceClass !== "enterprise") {
    throw new Error("Personal source is absent from enterprise bootstrap");
  }

  const now = input.now ?? new Date().toISOString();
  const basis = input.basisDefinitionDigests ?? [];
  const fields: SourceFieldRef[] = [];
  const bindings: MappingBinding[] = [];
  const openAmbiguities: AmbiguityRecord[] = [];

  for (const candidate of input.candidates) {
    const field = fieldById(input.schemaRef, candidate.sourceField);
    if (field === undefined) {
      throw new Error(
        `Candidate source field missing from schema: ${candidate.sourceField}`,
      );
    }
    fields.push(field);
    bindings.push({
      bindingId: sha256Hex(`${candidate.sourceField}:${JSON.stringify(candidate.target)}`).slice(0, 32),
      sourceField: field,
      target: candidate.target,
    });
  }

  const conflicts: Array<{
    readonly kind: AmbiguityKind;
    readonly fields: SourceFieldRef[];
    readonly candidates: MappingCandidate[];
  }> = [];

  for (let i = 0; i < input.candidates.length; i += 1) {
    for (let j = i + 1; j < input.candidates.length; j += 1) {
      const a = input.candidates[i]!;
      const b = input.candidates[j]!;
      const kind = conflictKind(a, b);
      if (kind === null) {
        continue;
      }
      const fa = fieldById(input.schemaRef, a.sourceField);
      const fb = fieldById(input.schemaRef, b.sourceField);
      if (fa === undefined || fb === undefined) {
        continue;
      }
      conflicts.push({ kind, fields: [fa, fb], candidates: [a, b] });
    }
  }

  const quantityField = input.candidates.find(
    (c) =>
      c.target.kind === "observation_claim" &&
      (c.sourceField.includes("qty") || c.sourceField.includes("stock")),
  );
  if (quantityField !== undefined) {
    const field = fieldById(input.schemaRef, quantityField.sourceField);
    if (field !== undefined) {
      conflicts.push({
        kind: "quantity_meaning",
        fields: [field],
        candidates: [quantityField],
      });
    }
  }

  const { digest, revision } = canonicalizeMappingArtifact({
    tenantId: input.tenantId,
    goalDigest: input.goalDigest,
    schemaRef: input.schemaRef,
    basisDefinitionDigests: basis,
    bindings,
  });

  const id = input.artifactId ?? mappingArtifactId(`mapping.${digest.slice(0, 16)}`);

  for (const conflict of conflicts) {
    const { prompt, why } = promptFor(conflict.kind, conflict.fields);
    const recordId = ambiguityRecordId(
      `amb.${sha256Hex(`${id}:${conflict.kind}:${conflict.fields.map((f) => f.fieldId).join(",")}`).slice(0, 24)}`,
    );
    const questionId = ambiguityQuestionId(`q.${recordId}`);
    const candidates =
      conflict.kind === "same_entity_or_variant"
        ? [
            {
              id: ambiguityCandidateId("same_entity"),
              label: "Same product identity",
              interpretation: conflict.candidates[0]!.target,
            },
            {
              id: ambiguityCandidateId("distinct_variants"),
              label: "Distinct variants",
              interpretation: { kind: "distinct_entities" as const },
            },
          ]
        : conflict.kind === "quantity_meaning"
          ? [
              {
                id: ambiguityCandidateId("physical"),
                label: "Physical stock",
                interpretation: {
                  kind: "quantity_class" as const,
                  class: "physical" as const,
                },
              },
              {
                id: ambiguityCandidateId("available"),
                label: "Available stock",
                interpretation: {
                  kind: "quantity_class" as const,
                  class: "available" as const,
                },
              },
              {
                id: ambiguityCandidateId("accounting"),
                label: "Accounting stock",
                interpretation: {
                  kind: "quantity_class" as const,
                  class: "accounting" as const,
                },
              },
            ]
          : [
              {
                id: ambiguityCandidateId("choice_a"),
                label: JSON.stringify(conflict.candidates[0]!.target),
                interpretation: conflict.candidates[0]!.target,
              },
              {
                id: ambiguityCandidateId("choice_b"),
                label: JSON.stringify(conflict.candidates[1]!.target),
                interpretation: conflict.candidates[1]!.target,
              },
            ];

    const record: AmbiguityRecord = {
      id: recordId,
      questionId,
      tenantId: input.tenantId,
      goalDigest: input.goalDigest,
      artifactId: id,
      artifactRevision: revision,
      kind: conflict.kind,
      prompt,
      why,
      sourceFieldRefs: conflict.fields,
      candidates,
      status: { kind: "open" },
      createdAt: now,
    };
    await input.ambiguityStore.put(record);
    openAmbiguities.push(record);
  }

  const status: MappingArtifactStatus =
    openAmbiguities.length > 0
      ? {
          kind: "ambiguous",
          openRecordIds: openAmbiguities.map((r) => r.id),
        }
      : { kind: "ready_to_publish" };

  const artifact: MappingArtifact = {
    id,
    revision,
    digest,
    tenantId: input.tenantId,
    goalDigest: input.goalDigest,
    schemaRef: input.schemaRef,
    basisDefinitionDigests: basis,
    bindings,
    status,
    createdAt: now,
  };

  await input.store.put(artifact);
  return { artifact, openAmbiguities };
}

/**
 * Schema drift: new schemaDigest supersedes the prior revision.
 * Bindings are never silently reinterpreted under a new schema.
 */
export async function supersedeOnSchemaDrift(input: {
  readonly prior: MappingArtifact;
  readonly nextSchemaRef: SourceSchemaRef;
  readonly store: MappingArtifactStore;
  readonly now?: string;
}): Promise<MappingArtifact> {
  if (input.prior.schemaRef.schemaDigest === input.nextSchemaRef.schemaDigest) {
    return input.prior;
  }
  const now = input.now ?? new Date().toISOString();
  const { digest, revision } = canonicalizeMappingArtifact({
    tenantId: input.prior.tenantId,
    goalDigest: input.prior.goalDigest,
    schemaRef: input.nextSchemaRef,
    basisDefinitionDigests: input.prior.basisDefinitionDigests,
    bindings: input.prior.bindings,
  });
  const superseded: MappingArtifact = {
    ...input.prior,
    status: {
      kind: "superseded",
      byRevision: revision,
      reason: "source_schema_drift",
    },
  };
  await input.store.put(superseded);
  const next: MappingArtifact = {
    ...input.prior,
    revision,
    digest,
    schemaRef: input.nextSchemaRef,
    status: { kind: "proposed" },
    createdAt: now,
  };
  await input.store.put(next);
  return next;
}

export async function authorMappingSources(input: {
  readonly artifact: MappingArtifact;
  readonly resolutions: ReadonlyArray<AmbiguityRecord>;
  readonly outDir: string;
}): Promise<{
  readonly paths: ReadonlyArray<string>;
  readonly refusesSchemaCopy: true;
}> {
  if (
    input.artifact.status.kind !== "ready_to_publish" &&
    input.artifact.status.kind !== "published"
  ) {
    const open = input.resolutions.filter((r) => r.status.kind === "open");
    if (open.length > 0 || input.artifact.status.kind === "ambiguous") {
      throw new Error("Cannot author sources while ambiguities remain open");
    }
  }

  const sourceFieldIds = new Set(
    input.artifact.schemaRef.fields.map((f) => f.fieldId),
  );
  const targetIds = input.artifact.bindings.map((b) => {
    switch (b.target.kind) {
      case "identity_relation":
      case "observation_claim":
        return b.target.relationId;
      case "type_extension":
        return b.target.typeId;
      case "compose_package":
        return b.target.packageId;
    }
  });

  // 1:1 source-schema copy: every source field becomes a new type/attr id.
  const mirrored = [...sourceFieldIds].every((fieldId) =>
    targetIds.some((t) => t === fieldId || t.endsWith(`.${fieldId}`)),
  );
  if (mirrored && sourceFieldIds.size > 0) {
    throw new Error(
      "authorMappingSources refuses source schema copy 1:1 as customer ontology",
    );
  }

  await mkdir(input.outDir, { recursive: true });
  const definitionId = `bootstrap.${input.artifact.tenantId}.mapping`;
  const source = `import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Product = defineType({
  attributes: [
    { id: "sku", valueType: { kind: "text" } },
  ],
  id: "product.Item",
});

const productIdentity = defineRelation({
  cardinality: "one",
  id: "product.identity",
  sourceType: "product.Item",
  target: { kind: "value", valueType: { kind: "text" } },
});

const inventoryOnHand = defineRelation({
  cardinality: "one",
  id: "inventory.onHand",
  sourceType: "product.Item",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const remainingAfterCommit = defineComputation({
  expression: {
    kind: "binary",
    left: { kind: "relation", relationId: "inventory.onHand" },
    operator: "subtract",
    right: { inputId: "committed", kind: "input" },
  },
  id: "inventory.remainingAfterCommit",
  inputs: [
    {
      id: "committed",
      valueType: { kind: "integer" },
    },
  ],
  returns: { kind: "integer" },
});

const changeCommitment = defineAction({
  effects: [
    {
      relationId: "inventory.onHand",
      value: { inputId: "quantity", kind: "input" },
    },
  ],
  id: "commercial.changeCommitment",
  inputs: [
    {
      id: "quantity",
      valueType: { kind: "integer" },
    },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "quantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

export default defineBundle({
  actions: [changeCommitment],
  computations: [remainingAfterCommit],
  id: ${JSON.stringify(definitionId)},
  relations: [productIdentity, inventoryOnHand],
  revision: 1,
  types: [Product],
});
`;

  const outPath = path.join(
    input.outDir,
    `${input.artifact.id}@${input.artifact.revision.slice(0, 12)}.zoen.ts`,
  );
  await writeFile(outPath, source);
  return { paths: [outPath], refusesSchemaCopy: true };
}

export async function publishMappingArtifact(input: {
  readonly artifactId: MappingArtifactId;
  readonly mappingRevision: MappingRevision;
  readonly compiled: {
    readonly digest: string;
    readonly canonicalJson: string;
    readonly definition: { readonly definitionId: string; readonly revision: number };
  };
  readonly tenantId: string;
  readonly definitionClient: DefinitionPublishPort;
  readonly store: MappingArtifactStore;
  readonly now?: string;
}): Promise<MappingArtifact> {
  const existing = await input.store.get(input.artifactId, input.mappingRevision);
  if (existing === null) {
    throw new Error(`MappingArtifact not found: ${input.artifactId}@${input.mappingRevision}`);
  }
  if (
    existing.status.kind !== "ready_to_publish" &&
    existing.status.kind !== "published"
  ) {
    throw new Error(
      `MappingArtifact not ready to publish: ${existing.status.kind}`,
    );
  }

  const published = await input.definitionClient.publish({
    tenantId: input.tenantId,
    digest: input.compiled.digest,
    canonicalJson: new TextEncoder().encode(input.compiled.canonicalJson),
  });

  await input.definitionClient.activateRevision({
    tenantId: input.tenantId,
    definitionId: input.compiled.definition.definitionId,
    digest: input.compiled.digest,
  });

  const now = input.now ?? new Date().toISOString();
  const next: MappingArtifact = {
    ...existing,
    status: {
      kind: "published",
      definitionId: input.compiled.definition.definitionId,
      definitionRevision: String(published.definitionRevision.revision),
      definitionDigest: published.definitionRevision.digest,
      activatedAt: now,
    },
  };
  await input.store.put(next);
  return next;
}

export function createMemoryMappingStore(): MappingArtifactStore & {
  readonly snapshot: () => Map<string, MappingArtifact>;
} {
  const byKey = new Map<string, MappingArtifact>();
  const keyOf = (id: MappingArtifactId, revision: MappingRevision) =>
    `${id}@${revision}`;
  return {
    async get(id, revision) {
      if (revision !== undefined) {
        return byKey.get(keyOf(id, revision)) ?? null;
      }
      const matches = [...byKey.values()].filter((a) => a.id === id);
      if (matches.length === 0) {
        return null;
      }
      return matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    },
    async put(artifact) {
      byKey.set(keyOf(artifact.id, artifact.revision), artifact);
    },
    async listByGoal(goalDigest) {
      return [...byKey.values()].filter((a) => a.goalDigest === goalDigest);
    },
    snapshot() {
      return new Map(byKey);
    },
  };
}
