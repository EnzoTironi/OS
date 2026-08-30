import assert from "node:assert/strict";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { Code } from "@connectrpc/connect";
import {
  DefinitionActivationKind,
  DefinitionImpactArea,
  EvolutionClassification,
  MigrationRecipeSchema,
  MigrationRuleKind,
  MigrationStatus,
  type EvolutionPlan,
} from "../gen/connect/zoen/definition/v1/definition_pb.js";
import {
  assertMutantsKilled,
  createMutantKills,
  expectConnectCode,
  migrationAuthorityCommitCount,
  rejectImmutableHistoryUpdate,
  rejectLaterOperationDelete,
  sourceLineCountsUnderLimit,
  usesSingleAuthorityLedger,
} from "./evolution-breaking/acceptance.js";
import { writeEvolutionBreakingArtifact } from "./evolution-breaking/artifact.js";
import {
  actionContractOnlyRevision,
  parseActionContracts,
} from "./evolution-breaking/contracts.js";
import {
  assertAssessment,
  assertV1ToV2Assessment,
  assertV2ToV3Assessment,
  buildMigrationRecipe,
} from "./evolution-breaking/plan.js";
import {
  activate,
  activateInitial,
  claims,
  entity,
  integer,
  latestClaim,
  migrationDependency,
  postcondition,
  quantity,
  targetRuleId,
} from "./evolution-breaking/scenario.js";
import {
  actionClient,
  actionProposal,
  adminClient,
  adminDatabaseUrl,
  authDatabaseUrl,
  commitAction,
  compileDefinition,
  definitionClient,
  definitionId,
  definitionReference,
  evidenceClaim,
  expectProjectionFailure,
  fixtureDirectory,
  generatedDirectory,
  historyClient,
  publish,
  queryValue,
  queryValues,
  rebuildProjection,
  recordEvidence,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writePolicyManifest,
  zoendBaseUrl,
  type ServerProcess,
} from "./evolution-breaking/support.js";
import {
  adminPairPersonas,
  plantPersonas,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
} from "./ba-door.js";
import { e2eIdentityAdminToken } from "./host-env.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function recordFailure(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceLineCounts = await sourceLineCountsUnderLimit();
  const mutants = createMutantKills();
  const v1 = await compileDefinition(
    path.join(fixtureDirectory, "inventory.zoen.ts"),
  );
  const v2 = await compileDefinition(
    path.join(fixtureDirectory, "inventory-breaking-v2.zoen.ts"),
  );
  const v3 = await compileDefinition(
    path.join(fixtureDirectory, "inventory-breaking-v3.zoen.ts"),
  );
  const actionContractOnly = actionContractOnlyRevision(v1);
  assert.equal(v1.definition.revision, 1);
  assert.equal(v2.definition.revision, 2);
  assert.equal(v3.definition.revision, 3);
  assert.equal(actionContractOnly.definition.revision, 4);
  assert.notEqual(v1.digest, v2.digest);
  assert.notEqual(v2.digest, v3.digest);
  const v1Actions = parseActionContracts(v1.canonicalJson);
  const v2Actions = parseActionContracts(v2.canonicalJson);
  const v1Action = v1Actions.find(
    (action) => action.id === "inventory.replenish",
  );
  const v2Action = v2Actions.find(
    (action) => action.id === "inventory.replenish",
  );
  assert.ok(v1Action);
  assert.ok(v2Action);
  observe(
    "actionContractCoversInputOutputAndEffectChanges",
    v1Action.outputs === undefined &&
      v1Action.inputs.some((input) => input.id === "quantity") &&
      v1Action.effects.some(
        (effect) => effect.relationId === "inventory.level",
      ) &&
      v2Action.outputs?.some(
        (output) =>
          output.id === "acceptedUnits" &&
          output.valueType.kind === "integer",
      ) === true &&
      v2Action.inputs.some((input) => input.id === "units") &&
      v2Action.effects.some(
        (effect) => effect.relationId === "inventory.receivedUnits",
      ),
  );

  const policyManifestPath = path.join(
    generatedDirectory,
    "policies.json",
  );
  await writePolicyManifest(policyManifestPath, [
    v1,
    v2,
    v3,
    actionContractOnly,
  ]);
  const door = await startAuthDoor(authDatabaseUrl);
  const admin = adminClient();
  await admin.connect();
  let server: ServerProcess | undefined;
  let v1ToV2Assessment: EvolutionPlan | undefined;
  let v2ToV3Assessment: EvolutionPlan | undefined;
  let v1ReceiptOperationId = "";
  let v2ReceiptOperationId = "";
  let v3ReceiptOperationId = "";

  try {
    server = await startServer(policyManifestPath);
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: adminPairPersonas(
        [definitionId, "inventory.item.1"],
        [
          "zoen.definition.activate",
          "zoen.definition.migrate",
          "zoen.definition.rollback",
          "inventory.replenish",
        ],
      ),
      zoendBaseUrl,
    });
    const adminAToken = sessionOf(planted, "admin-a").token;
    const adminBToken = sessionOf(planted, "admin-b").token;
    const definitionA = definitionClient(adminAToken, tenantA);
    const definitionB = definitionClient(adminBToken, tenantB);
    const actionA = actionClient(adminAToken, tenantA);
    const worldA = worldClient(adminAToken, tenantA);
    await publish(definitionA, tenantA, v1);
    await publish(definitionB, tenantB, v1);
    await activateInitial(definitionA, tenantA, v1);
    await activateInitial(definitionB, tenantB, v1);

    const v1Receipt = await commitAction(
      actionA,
      definitionReference(v1),
      "evolution.breaking.v1",
      "quantity",
      quantity("5"),
    );
    v1ReceiptOperationId = v1Receipt.operationId;
    await recordEvidence(
      worldA,
      definitionReference(v1),
      "inventory.storedAt",
      entity("inventory.warehouse.legacy"),
      "claim.inventory.storedAt.v1",
    );
    const originalDependency = await latestClaim(
      admin,
      v1.digest,
      "inventory.level",
    );
    const storedAtDependency = await latestClaim(
      admin,
      v1.digest,
      "inventory.storedAt",
    );
    observe(
      "v1DataAndActionUsePublishedRevision",
      v1Receipt.definition?.digest === v1.digest &&
        originalDependency.definition_revision === "1",
    );

    await publish(definitionA, tenantA, v2);
    await publish(definitionA, tenantA, v3);
    await publish(definitionA, tenantA, actionContractOnly);
    await publish(definitionB, tenantB, v2);
    const firstPlan = await definitionA.planEvolution({
      definitionId,
      fromDigest: v1.digest,
      tenantId: tenantA,
      toDigest: v2.digest,
    });
    assert.ok(firstPlan.plan);
    v1ToV2Assessment = firstPlan.plan;
    assertAssessment(
      v1ToV2Assessment,
      EvolutionClassification.BREAKING,
    );
    assertV1ToV2Assessment(v1ToV2Assessment, observe);
    observe(
      "physicalSchemaDoesNotOverrideSemanticClassification",
      v1ToV2Assessment.classification ===
        EvolutionClassification.BREAKING,
    );
    const actionContractPlan = await definitionA.planEvolution({
      definitionId,
      fromDigest: v1.digest,
      tenantId: tenantA,
      toDigest: actionContractOnly.digest,
    });
    const authorityImpact = actionContractPlan.plan?.impacts.find(
      (impact) =>
        impact.area === DefinitionImpactArea.POLICY_AND_AUTHORITY_CONTRACTS,
    );
    mutants.classifierIgnoresActionMeaning =
      actionContractPlan.plan?.classification ===
        EvolutionClassification.BREAKING &&
      actionContractPlan.plan.changes.length === 1 &&
      actionContractPlan.plan.changes[0]?.id === "inventory.replenish" &&
      authorityImpact?.affected.join(",") === "inventory.replenish";
    assert.equal(mutants.classifierIgnoresActionMeaning, true);
    recordFailure("classifier-action-contract-authority-lifecycle");
    const reversePlan = await definitionA.planEvolution({
      definitionId,
      fromDigest: v2.digest,
      tenantId: tenantA,
      toDigest: v1.digest,
    });
    observe(
      "reverseEvolutionIsForbidden",
      reversePlan.plan?.classification ===
        EvolutionClassification.FORBIDDEN &&
        reversePlan.plan.changes.every(
          (change) =>
            change.classification === EvolutionClassification.FORBIDDEN,
        ),
    );
    mutants.activationBeforeMigration = await expectConnectCode(
      () => activate(definitionA, tenantA, v1.digest, v2.digest),
      Code.FailedPrecondition,
    );
    recordFailure("activation-before-migration");

    const staleRecipe = buildMigrationRecipe({
      assessment: v1ToV2Assessment,
      dependencies: [
        migrationDependency(originalDependency),
        migrationDependency(storedAtDependency),
      ],
      operationId: "migration.inventory.stale",
      postconditions: [
        postcondition("inventory.level"),
        postcondition("inventory.warehouseLocation"),
      ],
      renamePairs: [
        {
          fromId: "inventory.storedAt",
          toId: "inventory.warehouseLocation",
        },
      ],
    });
    const realRecipeTemplate = buildMigrationRecipe({
      assessment: v1ToV2Assessment,
      dependencies: [
        migrationDependency(originalDependency),
        migrationDependency(storedAtDependency),
      ],
      operationId: "migration.inventory.v1.v2",
      postconditions: [
        postcondition("inventory.level"),
        postcondition("inventory.warehouseLocation"),
      ],
      renamePairs: [
        {
          fromId: "inventory.storedAt",
          toId: "inventory.warehouseLocation",
        },
      ],
    });
    const emptyCoverageRecipe = buildMigrationRecipe({
      assessment: v1ToV2Assessment,
      dependencies: [],
      operationId: "migration.inventory.empty.coverage",
      postconditions: [],
      renamePairs: [
        {
          fromId: "inventory.storedAt",
          toId: "inventory.warehouseLocation",
        },
      ],
    });
    await definitionA.prepareMigration({
      recipe: emptyCoverageRecipe,
      tenantId: tenantA,
    });
    const emptyCoverage = await definitionA.applyMigrationBatch({
      batchIndex: 0,
      operationId: emptyCoverageRecipe.operationId,
      records: [],
      tenantId: tenantA,
    });
    assert.ok(
      emptyCoverage.progress &&
        emptyCoverage.progress.remainingObligations.length > 0,
    );
    await expectConnectCode(
      () => activate(definitionA, tenantA, v1.digest, v2.digest),
      Code.FailedPrecondition,
    );
    recordFailure("empty-batch-does-not-cover-source-claims");
    mutants.impactGraphMissesDependencies = await expectConnectCode(
      () =>
        definitionA.prepareMigration({
          recipe: create(MigrationRecipeSchema, {
            ...realRecipeTemplate,
            operationId: "migration.inventory.incomplete",
            rules: realRecipeTemplate.rules.slice(1),
          }),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("incomplete-impact-graph");
    await expectConnectCode(
      () =>
        definitionA.prepareMigration({
          recipe: create(MigrationRecipeSchema, {
            ...realRecipeTemplate,
            operationId: "migration.inventory.wrong.target",
            toDigest: "f".repeat(64),
          }),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("wrong-source-target-pair");

    const stalePrepared = await definitionA.prepareMigration({
      recipe: staleRecipe,
      tenantId: tenantA,
    });
    observe(
      "migrationPlanIsGovernedAndPrepared",
      stalePrepared.progress?.status === MigrationStatus.PREPARED &&
        stalePrepared.progress.intentDigest.length === 64 &&
        stalePrepared.progress.plan?.assessmentDigest.length === 64 &&
        stalePrepared.progress.remainingObligations.length === 2 &&
        stalePrepared.progress.totalObligations === 2n,
    );
    await commitAction(
      actionA,
      definitionReference(v1),
      "evolution.breaking.concurrent",
      "quantity",
      quantity("6"),
    );
    await expectConnectCode(
      () =>
        definitionA.applyMigrationBatch({
          batchIndex: 0,
          operationId: staleRecipe.operationId,
          records: [
            {
              ruleId: targetRuleId(staleRecipe, "inventory.level"),
              sourceClaimIds: [originalDependency.claim_id],
              targetEvidence: evidenceClaim(
                definitionReference(v2),
                "inventory.level",
                entity("inventory.warehouse.stale"),
                "claim.inventory.level.v2.stale",
              ),
            },
          ],
          tenantId: tenantA,
        }),
      Code.FailedPrecondition,
    );
    recordFailure("concurrent-action-changed-migration-dependency");

    const currentDependency = await latestClaim(
      admin,
      v1.digest,
      "inventory.level",
    );
    const realRecipe = buildMigrationRecipe({
      assessment: v1ToV2Assessment,
      dependencies: [
        migrationDependency(currentDependency),
        migrationDependency(storedAtDependency),
      ],
      operationId: "migration.inventory.v1.v2",
      postconditions: [
        postcondition("inventory.level"),
        postcondition("inventory.warehouseLocation"),
      ],
      renamePairs: [
        {
          fromId: "inventory.storedAt",
          toId: "inventory.warehouseLocation",
        },
      ],
    });
    const foreignPrepareDenied = await expectConnectCode(
      () =>
        definitionB.prepareMigration({
          recipe: realRecipe,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );
    await definitionA.prepareMigration({
      recipe: realRecipe,
      tenantId: tenantA,
    });
    await expectConnectCode(
      () =>
        definitionA.applyMigrationBatch({
          batchIndex: 0,
          operationId: realRecipe.operationId,
          records: [
            {
              ruleId: targetRuleId(realRecipe, "inventory.level"),
              sourceClaimIds: [currentDependency.claim_id],
              targetEvidence: evidenceClaim(
                definitionReference(v2),
                "inventory.level",
                quantity("6"),
                "claim.inventory.level.v2.invalid",
              ),
            },
          ],
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("target-invariant-rejection");

    const firstBatchRequest = {
      batchIndex: 0,
      operationId: realRecipe.operationId,
      records: [
        {
          ruleId: targetRuleId(realRecipe, "inventory.level"),
          sourceClaimIds: [currentDependency.claim_id],
          targetEvidence: evidenceClaim(
            definitionReference(v2),
            "inventory.level",
            entity("inventory.warehouse.primary"),
            "claim.inventory.level.v2",
          ),
        },
        {
          ruleId: targetRuleId(
            realRecipe,
            "inventory.warehouseLocation",
          ),
          sourceClaimIds: [storedAtDependency.claim_id],
          targetEvidence: evidenceClaim(
            definitionReference(v2),
            "inventory.warehouseLocation",
            entity("inventory.warehouse.legacy"),
            "claim.inventory.warehouseLocation.v2",
          ),
        },
      ],
      tenantId: tenantA,
    };
    const foreignApplyDenied = await expectConnectCode(
      () =>
        definitionB.applyMigrationBatch({
          ...firstBatchRequest,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );
    const firstBatch = await definitionA.applyMigrationBatch(
      firstBatchRequest,
    );
    observe(
      "firstMigrationBatchCreatesExplicitLineage",
      firstBatch.progress?.status === MigrationStatus.IN_PROGRESS &&
        firstBatch.progress.lineage.length === 2 &&
        firstBatch.progress.lineage.some(
          (lineage) =>
            lineage.sourceClaimIds.includes(currentDependency.claim_id) &&
            lineage.targetClaimId === "claim.inventory.level.v2",
        ) &&
        firstBatch.progress.lineage.some(
          (lineage) =>
            lineage.kind === MigrationRuleKind.PRESERVE_MEANING &&
            lineage.sourceClaimIds.includes(storedAtDependency.claim_id) &&
            lineage.targetClaimId ===
              "claim.inventory.warehouseLocation.v2",
        ),
    );
    await expectConnectCode(
      () => activate(definitionA, tenantA, v1.digest, v2.digest),
      Code.FailedPrecondition,
    );
    recordFailure("activation-during-incomplete-migration");
    await stopServer(server);
    server = undefined;

    server = await startServer(policyManifestPath);
    const recovered = await definitionA.getMigration({
      operationId: realRecipe.operationId,
      tenantId: tenantA,
    });
    observe(
      "migrationProgressSurvivesRestart",
      recovered.progress?.status === MigrationStatus.IN_PROGRESS &&
        recovered.progress.completedBatches.length === 1,
    );
    const commitsBeforeReplay = await migrationAuthorityCommitCount(admin);
    const replayed = await definitionA.applyMigrationBatch(
      firstBatchRequest,
    );
    const commitsAfterReplay = await migrationAuthorityCommitCount(admin);
    const replayCounts = await admin.query<{
      lineage_count: string;
      record_count: string;
      target_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM definition_migration_lineage
          WHERE tenant_id = $1 AND operation_id = $2) AS lineage_count,
         (SELECT count(*)::text FROM definition_migration_records
          WHERE tenant_id = $1 AND operation_id = $2) AS record_count,
         (SELECT count(*)::text FROM semantic_claims
          WHERE tenant_id = $1 AND claim_id = $3) AS target_count`,
      [tenantA, realRecipe.operationId, "claim.inventory.level.v2"],
    );
    mutants.migrationReplayDuplicates =
      replayed.progress?.completedBatches.length === 1 &&
        replayCounts.rows[0]?.lineage_count === "2" &&
        replayCounts.rows[0]?.record_count === "2" &&
        replayCounts.rows[0]?.target_count === "1" &&
        commitsAfterReplay === commitsBeforeReplay;
    observe(
      "migrationReplayIsIdempotent",
      mutants.migrationReplayDuplicates,
    );
    recordFailure("migration-batch-replay");
    await expectConnectCode(
      () =>
        definitionB.getMigration({
          operationId: realRecipe.operationId,
          tenantId: tenantB,
        }),
      Code.NotFound,
    );
    await expectConnectCode(
      () =>
        definitionA.activateRevision({
          activeRevisionPrecondition: {
            case: "expectedActiveDigest",
            value: v1.digest,
          },
          definitionId,
          digest: v2.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordFailure("cross-tenant-migration-and-activation");
    const completedV2 = await definitionA.applyMigrationBatch({
      batchIndex: 1,
      operationId: realRecipe.operationId,
      records: [
        {
          ruleId: targetRuleId(realRecipe, "inventory.level"),
          sourceClaimIds: [originalDependency.claim_id],
          targetEvidence: evidenceClaim(
            definitionReference(v2),
            "inventory.level",
            entity("inventory.warehouse.primary"),
            "claim.inventory.level.v2.original",
          ),
        },
      ],
      tenantId: tenantA,
    });
    observe(
      "migrationCompletesAfterRestart",
      completedV2.progress?.status === MigrationStatus.COMPLETED &&
        completedV2.progress.completedBatches.join(",") === "0,1" &&
        completedV2.progress.remainingObligations.length === 0 &&
        completedV2.progress.totalObligations === 3n,
    );
    const v2Activation = await activate(
      definitionA,
      tenantA,
      v1.digest,
      v2.digest,
    );
    observe(
      "breakingActivationNamesCompletedMigration",
      v2Activation.activation?.kind ===
        DefinitionActivationKind.ACTIVATION &&
        v2Activation.activation.classification ===
          EvolutionClassification.BREAKING &&
        v2Activation.activation.migrationOperationId === realRecipe.operationId,
    );

    const v2Receipt = await commitAction(
      actionA,
      definitionReference(v2),
      "evolution.breaking.v2",
      "units",
      integer("7"),
    );
    v2ReceiptOperationId = v2Receipt.operationId;
    const v2Value = await queryValue(
      worldA,
      definitionReference(v2),
      "inventory.receivedUnits",
    );
    observe(
      "newWorkUsesActiveV2Contract",
      v2Receipt.definition?.digest === v2.digest &&
        v2Value.value.value.case === "integerValue" &&
        v2Value.value.value.value === "7",
    );

    const secondPlan = await definitionA.planEvolution({
      definitionId,
      fromDigest: v2.digest,
      tenantId: tenantA,
      toDigest: v3.digest,
    });
    assert.ok(secondPlan.plan);
    v2ToV3Assessment = secondPlan.plan;
    assertAssessment(
      v2ToV3Assessment,
      EvolutionClassification.REQUIRES_MIGRATION,
    );
    assertV2ToV3Assessment(v2ToV3Assessment, observe);
    const v2Levels = await claims(admin, v2.digest, "inventory.level");
    assert.deepEqual(
      v2Levels.map((claim) => claim.claim_id),
      ["claim.inventory.level.v2", "claim.inventory.level.v2.original"],
    );
    const v2Level = v2Levels.at(-1);
    assert.ok(v2Level);
    const v2ToV3Recipe = buildMigrationRecipe({
      assessment: v2ToV3Assessment,
      dependencies: [migrationDependency(v2Level)],
      operationId: "migration.inventory.v2.v3",
      postconditions: [postcondition("inventory.primaryWarehouse")],
      renamePairs: [
        {
          fromId: "inventory.level",
          toId: "inventory.primaryWarehouse",
        },
      ],
    });
    await definitionA.prepareMigration({
      recipe: v2ToV3Recipe,
      tenantId: tenantA,
    });
    const completedV3 = await definitionA.applyMigrationBatch({
      batchIndex: 0,
      operationId: v2ToV3Recipe.operationId,
      records: v2Levels.map((source) => ({
        ruleId: targetRuleId(v2ToV3Recipe, "inventory.primaryWarehouse"),
        sourceClaimIds: [source.claim_id],
        targetEvidence: evidenceClaim(
          definitionReference(v3),
          "inventory.primaryWarehouse",
          entity("inventory.warehouse.primary"),
          source.claim_id === "claim.inventory.level.v2"
            ? "claim.inventory.primaryWarehouse.v3"
            : "claim.inventory.primaryWarehouse.v3.original",
        ),
      })),
      tenantId: tenantA,
    });
    const primaryWarehouseLineage = completedV3.progress?.lineage.find(
      (lineage) =>
        lineage.targetClaimId === "claim.inventory.primaryWarehouse.v3",
    );
    const migratedClaimExplanation = await historyClient(adminAToken, tenantA).explain({
      target: {
        target: {
          case: "claimId",
          value: "claim.inventory.primaryWarehouse.v3",
        },
      },
    });
    observe(
      "meaningPreservingRenameCreatesNewEvidence",
      completedV3.progress?.status === MigrationStatus.COMPLETED &&
        completedV3.progress.remainingObligations.length === 0 &&
        completedV3.progress.totalObligations === 2n &&
        primaryWarehouseLineage?.kind === MigrationRuleKind.PRESERVE_MEANING &&
        primaryWarehouseLineage.sourceClaimIds[0] ===
          "claim.inventory.level.v2" &&
        migratedClaimExplanation.explanation?.subject.case === "claim" &&
        migratedClaimExplanation.explanation.subject.value.migration?.origin
          ?.operationId === v2ToV3Recipe.operationId &&
        migratedClaimExplanation.explanation.subject.value.migration.origin
          .sourceClaimIds[0] === "claim.inventory.level.v2",
    );
    await activate(definitionA, tenantA, v2.digest, v3.digest);
    const v3Receipt = await commitAction(
      actionA,
      definitionReference(v3),
      "evolution.breaking.v3",
      "units",
      integer("8"),
    );
    v3ReceiptOperationId = v3Receipt.operationId;
    const v3Current = await queryValues(
      worldA,
      definitionReference(v3),
      "inventory.primaryWarehouse",
    );
    observe(
      "v3CurrentSemanticsUseEntityEvidence",
      v3Current.definition?.digest === v3.digest &&
        v3Current.values.length === v2Levels.length &&
        v3Current.values.every(
          (value) =>
            value.value?.value.case === "entityRefValue" &&
            value.value.value.value === "inventory.warehouse.primary" &&
            value.dependencies.some(
              (dependency) =>
                dependency.migration?.operationId ===
                  v2ToV3Recipe.operationId &&
                dependency.migration.sourceClaimIds.some((sourceClaimId) =>
                  v2Levels.some((source) => source.claim_id === sourceClaimId),
                ),
            ),
        ),
    );

    await expectProjectionFailure(tenantA);
    recordFailure("projection-regeneration-failure");
    const rebuilt = await rebuildProjection(tenantA);
    const projectedV3 = await queryValues(
      worldA,
      definitionReference(v3),
      "inventory.primaryWarehouse",
      "eventual",
    );
    observe(
      "projectionRebuildNamesAndServesV3",
      rebuilt.wroteManifest &&
        projectedV3.definition?.digest === v3.digest &&
        projectedV3.values.length === v2Levels.length &&
        projectedV3.values.every(
          (value) => value.value?.value.case === "entityRefValue",
        ),
    );

    const historicalV1 = await queryValues(
      worldA,
      definitionReference(v1),
      "inventory.level",
    );
    const historicalV1Amounts = historicalV1.values.flatMap((value) =>
      value.value?.value.case === "quantityValue"
        ? [value.value.value.value.amount]
        : [],
    );
    const v1Explanation = await historyClient(adminAToken, tenantA).explain({
      target: {
        target: {
          case: "operationId",
          value: v1ReceiptOperationId,
        },
      },
    });
    const historicalV1Action = await actionA.getOperationStatus({
      operationId: v1ReceiptOperationId,
    });
    const historicalActionRejected = await expectConnectCode(
      () =>
        actionA.propose(
          actionProposal(
            definitionReference(v1),
            "evolution.breaking.historical.v1",
            "quantity",
            quantity("1"),
          ),
        ),
      Code.FailedPrecondition,
    );
    mutants.historicalResolutionUsesLatest =
      historicalActionRejected &&
      historicalV1Action.receipt?.definition?.digest === v1.digest &&
      historicalV1.definition?.digest === v1.digest &&
      historicalV1Amounts.length === historicalV1.values.length &&
      historicalV1Amounts.sort().join(",") === "5,6" &&
      v1Explanation.explanation?.subject.case === "action" &&
      v1Explanation.explanation.subject.value.definition?.reference
        ?.digest === v1.digest;
    observe(
      "historicalActionQueryAndExplainStayOnV1",
      mutants.historicalResolutionUsesLatest,
    );

    const foreignRollbackDenied = await expectConnectCode(
      () =>
        definitionB.rollbackRevision({
          definitionId,
          digest: v2.digest,
          expectedActiveDigest: v3.digest,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );
    const rollback = await definitionA.rollbackRevision({
      definitionId,
      digest: v2.digest,
      expectedActiveDigest: v3.digest,
      tenantId: tenantA,
    });
    observe(
      "rollbackMovesOnlyTheFutureActivePointer",
      rollback.activation?.kind === DefinitionActivationKind.ROLLBACK &&
        rollback.activation.active?.digest === v2.digest &&
        rollback.activation.previous?.digest === v3.digest &&
        rollback.activation.policy?.revision?.policyId === "policy.rollback.v3",
    );
    const postRollbackReceipt = await commitAction(
      actionA,
      definitionReference(v2),
      "evolution.breaking.after.rollback",
      "units",
      integer("9"),
    );
    const durableV3 = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM action_proposals
       WHERE tenant_id = $1 AND operation_id = $2`,
      [tenantA, v3ReceiptOperationId],
    );
    const coexistence = await admin.query<{
      definition_count: string;
      v3_claim_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM definition_revisions
          WHERE tenant_id = $1
            AND definition_id = $2
            AND digest IN ($3, $4, $5)) AS definition_count,
         (SELECT count(*)::text FROM semantic_claims
          WHERE tenant_id = $1 AND definition_digest = $5) AS v3_claim_count`,
      [tenantA, definitionId, v1.digest, v2.digest, v3.digest],
    );
    observe(
      "rollbackPreservesV3HistoryAndV1V2V3Coexistence",
      postRollbackReceipt.definition?.digest === v2.digest &&
        durableV3.rows[0]?.count === "1" &&
        coexistence.rows[0]?.definition_count === "3" &&
        Number(coexistence.rows[0]?.v3_claim_count) > 0,
    );
    recordFailure("rollback-after-target-work");
    mutants.rollbackDeletesNewHistory = await rejectLaterOperationDelete(
      admin,
      v3ReceiptOperationId,
    );
    assert.equal(mutants.rollbackDeletesNewHistory, true);
    recordFailure("rollback-destructive-delete");
    mutants.oldRowUpdatedInPlace = await rejectImmutableHistoryUpdate(
      admin,
      v1.digest,
    );
    observe(
      "oldAuthoritativeRecordsRejectInPlaceRewrite",
      mutants.oldRowUpdatedInPlace,
    );
    observe(
      "migrationUsesExistingAuthorityCommitLedger",
      await usesSingleAuthorityLedger(admin),
    );
    const foreignTenantRejections = {
      apply: foreignApplyDenied,
      prepare: foreignPrepareDenied,
      rollback: foreignRollbackDenied,
    };
    assert.equal(
      foreignTenantRejections.prepare &&
        foreignTenantRejections.apply &&
        foreignTenantRejections.rollback,
      true,
    );
    recordFailure("cross-tenant-prepare-apply-rollback");
    assertMutantsKilled(mutants);

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    assert.ok(v1ToV2Assessment);
    assert.ok(v2ToV3Assessment);
    await writeEvolutionBreakingArtifact({
      actionContractOnly,
      assertions,
      failureInjections,
      foreignTenantRejections,
      mutants,
      postgresVersion,
      reverseClassification: reversePlan.plan?.classification,
      sourceLineCounts,
      startedAt,
      v1,
      v1ReceiptOperationId,
      v1ToV2Assessment,
      v1ToV2RecipeOperationId: realRecipe.operationId,
      v2,
      v2ReceiptOperationId,
      v2ToV3Assessment,
      v2ToV3RecipeOperationId: v2ToV3Recipe.operationId,
      v3,
      v3ReceiptOperationId,
    });
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
    await stopAuthDoor(door);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
