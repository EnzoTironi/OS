import assert from "node:assert/strict";
import { create } from "@bufbuild/protobuf";
import {
  DefinitionChangeKind,
  DefinitionElementKind,
  DefinitionImpactApplicability,
  DefinitionImpactArea,
  EvolutionClassification,
  MigrationPlanSchema,
  MigrationRuleKind,
  type DefinitionChange,
  type EvolutionPlan,
  type MigrationDependency,
  type MigrationPlan,
  type MigrationPostcondition,
} from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";

interface RenamePair {
  readonly fromId: string;
  readonly toId: string;
}

interface BuildMigrationPlan {
  readonly assessment: EvolutionPlan;
  readonly dependencies: readonly MigrationDependency[];
  readonly expectedBatches: number;
  readonly operationId: string;
  readonly postconditions: readonly MigrationPostcondition[];
  readonly renamePairs: readonly RenamePair[];
}

type Observe = (name: string, condition: boolean) => void;

const artifactAreas = new Set([
  DefinitionImpactArea.QUERY_AND_MATERIALIZATION_ARTIFACTS,
  DefinitionImpactArea.GENERATED_SDK_AND_SURFACE_ARTIFACTS,
  DefinitionImpactArea.POLICY_AND_AUTHORITY_CONTRACTS,
]);

export function buildMigrationPlan({
  assessment,
  dependencies,
  expectedBatches,
  operationId,
  postconditions,
  renamePairs,
}: BuildMigrationPlan): MigrationPlan {
  assert.ok(assessment.from);
  assert.ok(assessment.to);
  const renamedIds = new Set(
    renamePairs.flatMap((pair) => [pair.fromId, pair.toId]),
  );
  const rules = assessment.changes
    .filter((change) => !renamedIds.has(change.id))
    .map((change) => ({
      kind: ruleKind(change),
      ruleId: `migration.${operationId}.${safeId(change.id)}`,
      sources:
        change.change === DefinitionChangeKind.ADDED
          ? []
          : [{ element: change.element, id: change.id }],
      targets:
        change.change === DefinitionChangeKind.REMOVED
          ? []
          : [{ element: change.element, id: change.id }],
    }));
  for (const pair of renamePairs) {
    const source = assessment.changes.find(
      (change) =>
        change.id === pair.fromId &&
        change.change === DefinitionChangeKind.REMOVED,
    );
    const target = assessment.changes.find(
      (change) =>
        change.id === pair.toId &&
        change.change === DefinitionChangeKind.ADDED,
    );
    assert.ok(source);
    assert.ok(target);
    assert.equal(source.element, target.element);
    rules.push({
      kind: MigrationRuleKind.PRESERVE_MEANING,
      ruleId: `migration.${operationId}.${safeId(pair.toId)}`,
      sources: [{ element: source.element, id: source.id }],
      targets: [{ element: target.element, id: target.id }],
    });
  }
  return create(MigrationPlanSchema, {
    affectedElements: assessment.changes.map((change) => ({
      element: change.element,
      id: change.id,
    })),
    artifactDependencies: assessment.impacts
      .filter(
        (impact) =>
          impact.applicability ===
            DefinitionImpactApplicability.APPLICABLE &&
          artifactAreas.has(impact.area),
      )
      .flatMap((impact) =>
        impact.affected.map((id) => ({ area: impact.area, id })),
      ),
    classification: assessment.classification,
    dependencies: [...dependencies],
    expectedBatches,
    formatVersion: 1,
    from: assessment.from,
    operationId,
    postconditions: [...postconditions],
    rules,
    to: assessment.to,
  });
}

export function assertAssessment(
  assessment: EvolutionPlan,
  classification: EvolutionClassification,
): void {
  assert.equal(assessment.classification, classification);
  assert.equal(assessment.migrationRequired, true);
  assert.ok(assessment.from);
  assert.ok(assessment.to);
  assert.ok(assessment.changes.length > 0);
  for (const change of assessment.changes) {
    assert.notEqual(
      change.classification,
      EvolutionClassification.UNSPECIFIED,
    );
    assert.ok(change.rationale.length > 20);
  }
  for (const impact of assessment.impacts) {
    assert.notEqual(
      impact.applicability,
      DefinitionImpactApplicability.UNSPECIFIED,
    );
    assert.ok(impact.rationale.length > 20);
  }
}

export function assertV1ToV2Assessment(
  plan: EvolutionPlan,
  observe: Observe,
): void {
  const level = change(plan, DefinitionElementKind.RELATION, "inventory.level");
  const action = change(
    plan,
    DefinitionElementKind.ACTION,
    "inventory.replenish",
  );
  const computation = change(
    plan,
    DefinitionElementKind.COMPUTATION,
    "inventory.requiredPurchase",
  );
  const item = change(plan, DefinitionElementKind.TYPE, "inventory.Item");
  observe(
    "gauntletClassifiesCardinalityValueEntityAndActionChanges",
    level.change === DefinitionChangeKind.MODIFIED &&
      level.classification ===
        EvolutionClassification.REQUIRES_MIGRATION &&
      /cardinality/.test(level.rationale) &&
      /target value or entity representation/.test(level.rationale) &&
      action.classification === EvolutionClassification.BREAKING &&
      /output/.test(action.rationale) &&
      computation.classification ===
        EvolutionClassification.REQUIRES_MIGRATION &&
      item.classification ===
        EvolutionClassification.REQUIRES_MIGRATION,
  );
  const authority = impact(
    plan,
    DefinitionImpactArea.POLICY_AND_AUTHORITY_CONTRACTS,
  );
  const query = impact(
    plan,
    DefinitionImpactArea.QUERY_AND_MATERIALIZATION_ARTIFACTS,
  );
  observe(
    "impactIncludesAuthorityQueryAndGeneratedDependencies",
    authority.affected.includes("inventory.replenish") &&
      query.affected.includes("inventory.level") &&
      query.affected.includes("inventory.requiredPurchase"),
  );
  const wasm = impact(plan, DefinitionImpactArea.WASM_COMPONENTS);
  observe(
    "wasmCellIsInspectablyNotApplicable",
    wasm.applicability ===
      DefinitionImpactApplicability.NOT_APPLICABLE &&
      /no Wasm component/.test(wasm.rationale),
  );
}

export function assertV2ToV3Assessment(
  plan: EvolutionPlan,
  observe: Observe,
): void {
  const removed = change(
    plan,
    DefinitionElementKind.RELATION,
    "inventory.level",
  );
  const added = change(
    plan,
    DefinitionElementKind.RELATION,
    "inventory.primaryWarehouse",
  );
  observe(
    "renameAndComputationChangesRequireExplicitMigration",
    removed.change === DefinitionChangeKind.REMOVED &&
      removed.classification ===
        EvolutionClassification.REQUIRES_MIGRATION &&
      added.change === DefinitionChangeKind.ADDED &&
      added.classification === EvolutionClassification.COMPATIBLE &&
      change(
        plan,
        DefinitionElementKind.COMPUTATION,
        "inventory.requiredPurchase",
      ).classification === EvolutionClassification.REQUIRES_MIGRATION,
  );
}

function change(
  plan: EvolutionPlan,
  element: DefinitionElementKind,
  id: string,
) {
  const result = plan.changes.find(
    (item) => item.element === element && item.id === id,
  );
  assert.ok(result);
  return result;
}

function impact(plan: EvolutionPlan, area: DefinitionImpactArea) {
  const result = plan.impacts.find((item) => item.area === area);
  assert.ok(result);
  return result;
}

function ruleKind(change: DefinitionChange): MigrationRuleKind {
  if (change.element === DefinitionElementKind.TYPE) {
    return MigrationRuleKind.PRESERVE_MEANING;
  }
  if (change.element === DefinitionElementKind.COMPUTATION) {
    return MigrationRuleKind.RECOMPUTE;
  }
  if (change.element === DefinitionElementKind.ACTION) {
    return MigrationRuleKind.SUPERSEDE;
  }
  switch (change.change) {
    case DefinitionChangeKind.ADDED:
      return MigrationRuleKind.RECOMPUTE;
    case DefinitionChangeKind.REMOVED:
      return MigrationRuleKind.SUPERSEDE;
    case DefinitionChangeKind.MODIFIED:
      return MigrationRuleKind.TRANSFORM;
    case DefinitionChangeKind.UNSPECIFIED:
      throw new Error(`unspecified change for ${change.id}`);
    default: {
      const exhaustive: never = change.change;
      return exhaustive;
    }
  }
}

function safeId(value: string): string {
  return value.replaceAll(".", "_");
}
