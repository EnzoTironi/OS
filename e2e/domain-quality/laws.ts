import assert from "node:assert/strict";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  LineageRole,
  type SemanticQueryResponse,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionInput,
  adminClient,
  explainProposal,
  recordEvidence,
  semanticQuery,
  tenantB,
  writePolicyManifest,
  type ActionClient,
  type EvidenceTime,
  type PolicyFixture,
  type QualityFixture,
  type SemanticValue,
  type WorldClient,
} from "./support.js";

export const releaseAt = new Date("2026-08-15T12:00:00.000Z");
export const yearStart = new Date("2026-01-01T00:00:00.000Z");
export const specificationChange = new Date("2026-06-01T00:00:00.000Z");
export const yearEnd = new Date("2027-01-01T00:00:00.000Z");

export async function writeQualityPolicies(
  outputPath: string,
  quality: QualityFixture,
  remapped: QualityFixture,
  policies: readonly PolicyFixture[],
): Promise<void> {
  const activation = policies.filter(
    (policy) => policy.actionId === "zoen.definition.activate",
  );
  await writePolicyManifest(outputPath, [
    {
      fixture: quality,
      policies: [
        ...policies.filter((policy) => policy.actionId.startsWith("quality.")),
        ...activation,
      ],
    },
    {
      fixture: remapped,
      policies: [
        ...policies.filter((policy) => policy.actionId.startsWith("lab.")),
        ...activation,
      ],
    },
  ]);
}

export function interval(start: Date, end: Date): EvidenceTime {
  return { end, kind: "interval", start };
}

export function instant(at: Date): EvidenceTime {
  return { at, kind: "instant" };
}

export function acceptanceQuery(
  client: WorldClient,
  fixture: QualityFixture,
  tenantId: string,
  validAt: Date,
) {
  return semanticQuery(client, {
    fixture,
    selection: {
      id: fixture.vocabulary.acceptanceComputation,
      kind: "computation",
    },
    tenantId,
    validAt,
  });
}

export function relationQuery(
  client: WorldClient,
  fixture: QualityFixture,
  tenantId: string,
  relationId: string,
  validAt: Date,
) {
  return semanticQuery(client, {
    fixture,
    selection: { id: relationId, kind: "relation" },
    tenantId,
    validAt,
  });
}

export function proposeRelease(
  client: ActionClient,
  fixture: QualityFixture,
  suffix: string,
) {
  return client.propose({
    actionId: fixture.vocabulary.releaseAction,
    definition: fixture.definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [actionInput("status", { kind: "text", value: "released" })],
    operationId: `operation.quality.release-${suffix}`,
    proposalId: `proposal.quality.release-${suffix}`,
    resourceId: fixture.vocabulary.resourceId,
    validAt: timestampFromDate(releaseAt),
  });
}

export function proposeQuarantine(
  client: ActionClient,
  fixture: QualityFixture,
) {
  return client.propose({
    actionId: fixture.vocabulary.quarantineAction,
    definition: fixture.definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      actionInput("disposition", {
        kind: "text",
        value: "quarantined-pending-disposition",
      }),
    ],
    operationId: "operation.quality.quarantine",
    proposalId: "proposal.quality.quarantine",
    resourceId: fixture.vocabulary.resourceId,
    validAt: timestampFromDate(releaseAt),
  });
}

export async function recordRemappedEvidence(
  client: WorldClient,
  fixture: QualityFixture,
): Promise<void> {
  const vocabulary = fixture.vocabulary;
  const claims: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly sourceId: string;
    readonly time: EvidenceTime;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.lab.specification-v2-minimum",
      relationId: vocabulary.specificationMinimumRelation,
      sourceId: "source.quality-engineering",
      time: interval(specificationChange, yearEnd),
      value: { kind: "integer", value: "75000" },
    },
    {
      claimId: "claim.lab.specification-v3-minimum",
      relationId: vocabulary.specificationMinimumRelation,
      sourceId: "source.quality-engineering",
      time: instant(releaseAt),
      value: { kind: "integer", value: "76000" },
    },
    {
      claimId: "claim.lab.measurement-sensor",
      relationId: vocabulary.measurementRelation,
      sourceId: "source.sensor-a",
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "72000" },
    },
    {
      claimId: "claim.lab.measurement-inspector",
      relationId: vocabulary.measurementRelation,
      sourceId: "source.inspector-a",
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "71000" },
    },
    {
      claimId: "claim.lab.measurement-retest",
      relationId: vocabulary.measurementRelation,
      sourceId: "source.inspector-retest",
      time: interval(releaseAt, yearEnd),
      value: { kind: "integer", value: "78000" },
    },
    {
      claimId: "claim.lab.uncertainty-sensor",
      relationId: vocabulary.uncertaintyRelation,
      sourceId: "source.sensor-a",
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "400" },
    },
    {
      claimId: "claim.lab.uncertainty-inspector",
      relationId: vocabulary.uncertaintyRelation,
      sourceId: "source.inspector-a",
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "200" },
    },
    {
      claimId: "claim.lab.uncertainty-retest",
      relationId: vocabulary.uncertaintyRelation,
      sourceId: "source.inspector-retest",
      time: interval(releaseAt, yearEnd),
      value: { kind: "integer", value: "300" },
    },
    {
      claimId: "claim.lab.accepted-original",
      relationId: vocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-engineering",
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "71000" },
    },
    {
      claimId: "claim.lab.accepted-retest",
      relationId: vocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-supervisor",
      time: interval(releaseAt, yearEnd),
      value: { kind: "integer", value: "78000" },
    },
  ];
  for (const claim of claims) {
    await recordEvidence(client, {
      ...claim,
      fixture,
      tenantId: tenantB,
    });
  }
}

export function boolValues(response: SemanticQueryResponse): boolean[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "boolValue");
    return result.value.value.value;
  });
}

export function integerValues(response: SemanticQueryResponse): string[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "integerValue");
    return result.value.value.value;
  });
}

export function hasRivalMeasurements(
  response: SemanticQueryResponse,
  expectedSources: readonly string[],
): boolean {
  if (response.values.length !== expectedSources.length) {
    return false;
  }
  const sources = new Set(
    response.values.flatMap((result) =>
      result.dependencies
        .filter(
          (dependency) =>
            dependency.relationId.endsWith(".measurementBasisKpa") &&
            (dependency.role === LineageRole.SUPPORTING ||
              dependency.role === LineageRole.RIVAL),
        )
        .map((dependency) => dependency.sourceId),
    ),
  );
  return (
    sameStrings([...sources], expectedSources) &&
    response.values.every(
      (result) =>
        result.dependencies.filter(
          (dependency) => dependency.role === LineageRole.RIVAL,
        ).length ===
        expectedSources.length - 1,
    )
  );
}

export function hasSourceLineage(
  response: SemanticQueryResponse,
  expectedSources: readonly string[],
): boolean {
  const sources = new Set(
    response.values.flatMap((result) =>
      result.dependencies.map((dependency) => dependency.sourceId),
    ),
  );
  return expectedSources.every((source) => sources.has(source));
}

export function hasRelationLineage(
  response: SemanticQueryResponse,
  expectedRelations: readonly string[],
): boolean {
  const relations = new Set(
    response.values.flatMap((result) =>
      result.dependencies.map((dependency) => dependency.relationId),
    ),
  );
  return expectedRelations.every((relation) => relations.has(relation));
}

export function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

export function sameBooleans(
  actual: readonly boolean[],
  expected: readonly boolean[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

export function normalizedDefinition(
  fixture: QualityFixture,
  prefix: string,
): string {
  return fixture.canonicalJson.replaceAll(prefix, "domain.");
}

export function actionExplanation(
  explanation: Awaited<ReturnType<typeof explainProposal>>,
) {
  if (explanation.subject.case !== "action") {
    throw new Error(
      `expected Action explanation, received ${explanation.subject.case ?? "none"}`,
    );
  }
  return explanation.subject.value;
}

export function explanationShape(
  explanation: Awaited<ReturnType<typeof explainProposal>>,
): string {
  const action = actionExplanation(explanation);
  return JSON.stringify({
    approvalId: action.approval?.approvalId,
    commitSequence: action.commit?.receipt?.commitSequence.toString(),
    complete: explanation.complete,
    definitionDigest: action.definition?.reference?.digest,
    dependencyClaims:
      action.proposalStateBasis?.basis?.dependencies
        .map((dependency) => dependency.claimId)
        .sort() ?? [],
    effectStates: action.effects.map(
      (effect) => effect.request?.structure?.state,
    ),
    policyDigests: action.policies
      .map((policy) => policy.policy?.revision?.digest)
      .sort(),
    proposalId: action.proposal?.structure?.proposalId,
    recordIds:
      action.commit?.records
        .map((record) => record.structure?.claimId)
        .sort() ?? [],
  });
}

export async function semanticClaimCount(
  client: ReturnType<typeof adminClient>,
  tenantId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM semantic_claims WHERE tenant_id = $1",
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

export async function claimSnapshot(
  client: ReturnType<typeof adminClient>,
  tenantId: string,
  claimId: string,
): Promise<unknown> {
  const result = await client.query(
    `SELECT definition_id, definition_digest, definition_revision,
            entity_id, relation_id, value_kind, value_text, value_unit,
            valid_time_kind, valid_from_micros, valid_to_micros,
            source_id, source_digest, source_ref, commit_sequence
     FROM semantic_claims
     WHERE tenant_id = $1 AND claim_id = $2`,
    [tenantId, claimId],
  );
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
