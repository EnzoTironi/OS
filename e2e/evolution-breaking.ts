import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  DefinitionActivationKind,
  DefinitionElementKind,
  EvolutionClassification,
  MigrationDependencySchema,
  MigrationPlanSchema,
  MigrationPostconditionSchema,
  MigrationRuleKind,
  MigrationStatus,
  type EvolutionPlan,
  type MigrationPlan,
} from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  ExactValueSchema,
  QuantityValueSchema,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  assertAssessment,
  assertV1ToV2Assessment,
  assertV2ToV3Assessment,
  buildMigrationPlan,
} from "./evolution-breaking/plan.js";
import {
  actionClient,
  adminClient,
  command,
  commitAction,
  compileDefinition,
  composeOutput,
  definitionClient,
  definitionId,
  definitionReference,
  evidenceClaim,
  expectProjectionFailure,
  fixtureDirectory,
  generatedDirectory,
  historyClient,
  oidcToken,
  publish,
  queryValue,
  rebuildProjection,
  recordEvidence,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writePolicyManifest,
  type CompiledDefinition,
  type DefinitionClient,
  type ServerProcess,
} from "./evolution-breaking/support.js";

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
  const v1 = await compileDefinition(
    path.join(fixtureDirectory, "inventory.zoen.ts"),
  );
  const v2 = await compileDefinition(
    path.join(fixtureDirectory, "inventory-breaking-v2.zoen.ts"),
  );
  const v3 = await compileDefinition(
    path.join(fixtureDirectory, "inventory-breaking-v3.zoen.ts"),
  );
  assert.equal(v1.definition.revision, 1);
  assert.equal(v2.definition.revision, 2);
  assert.equal(v3.definition.revision, 3);
  assert.notEqual(v1.digest, v2.digest);
  assert.notEqual(v2.digest, v3.digest);

  const policyManifestPath = path.join(
    generatedDirectory,
    "policies.json",
  );
  await writePolicyManifest(policyManifestPath, [v1, v2, v3]);
  const adminAToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  const definitionA = definitionClient(adminAToken);
  const definitionB = definitionClient(adminBToken);
  const actionA = actionClient(adminAToken);
  const worldA = worldClient(adminAToken);
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
    await expectConnectCode(
      () => activate(definitionA, tenantA, v1.digest, v2.digest),
      Code.FailedPrecondition,
    );
    recordFailure("activation-before-migration");

    const stalePlan = buildMigrationPlan({
      assessment: v1ToV2Assessment,
      dependencies: [
        migrationDependency(originalDependency),
        migrationDependency(storedAtDependency),
      ],
      expectedBatches: 1,
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
    const realPlanTemplate = buildMigrationPlan({
      assessment: v1ToV2Assessment,
      dependencies: [
        migrationDependency(originalDependency),
        migrationDependency(storedAtDependency),
      ],
      expectedBatches: 2,
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
    await expectConnectCode(
      () =>
        definitionA.prepareMigration({
          plan: create(MigrationPlanSchema, {
            ...realPlanTemplate,
            artifactDependencies:
              realPlanTemplate.artifactDependencies.slice(1),
            operationId: "migration.inventory.incomplete",
          }),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("incomplete-impact-graph");
    await expectConnectCode(
      () =>
        definitionA.prepareMigration({
          plan: create(MigrationPlanSchema, {
            ...realPlanTemplate,
            operationId: "migration.inventory.wrong.target",
            to: {
              ...definitionReference(v2),
              digest: "f".repeat(64),
            },
          }),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("wrong-source-target-pair");

    const stalePrepared = await definitionA.prepareMigration({
      plan: stalePlan,
      tenantId: tenantA,
    });
    observe(
      "migrationPlanIsGovernedAndPrepared",
      stalePrepared.progress?.status === MigrationStatus.PREPARED &&
        stalePrepared.progress.intentDigest.length === 64,
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
          operationId: stalePlan.operationId,
          records: [
            {
              ruleId: targetRuleId(stalePlan, "inventory.level"),
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
    const realPlan = buildMigrationPlan({
      assessment: v1ToV2Assessment,
      dependencies: [
        migrationDependency(currentDependency),
        migrationDependency(storedAtDependency),
      ],
      expectedBatches: 2,
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
    await definitionA.prepareMigration({ plan: realPlan, tenantId: tenantA });
    await expectConnectCode(
      () =>
        definitionA.applyMigrationBatch({
          batchIndex: 0,
          operationId: realPlan.operationId,
          records: [
            {
              ruleId: targetRuleId(realPlan, "inventory.level"),
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
      operationId: realPlan.operationId,
      records: [
        {
          ruleId: targetRuleId(realPlan, "inventory.level"),
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
            realPlan,
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
      operationId: realPlan.operationId,
      tenantId: tenantA,
    });
    observe(
      "migrationProgressSurvivesRestart",
      recovered.progress?.status === MigrationStatus.IN_PROGRESS &&
        recovered.progress.completedBatches.length === 1,
    );
    const replayed = await definitionA.applyMigrationBatch(
      firstBatchRequest,
    );
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
      [tenantA, realPlan.operationId, "claim.inventory.level.v2"],
    );
    observe(
      "migrationReplayIsIdempotent",
      replayed.progress?.completedBatches.length === 1 &&
        replayCounts.rows[0]?.lineage_count === "2" &&
        replayCounts.rows[0]?.record_count === "2" &&
        replayCounts.rows[0]?.target_count === "1",
    );
    recordFailure("migration-batch-replay");
    await expectConnectCode(
      () =>
        definitionB.getMigration({
          operationId: realPlan.operationId,
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
      operationId: realPlan.operationId,
      records: [],
      tenantId: tenantA,
    });
    observe(
      "migrationCompletesAfterRestart",
      completedV2.progress?.status === MigrationStatus.COMPLETED &&
        completedV2.progress.completedBatches.join(",") === "0,1",
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
        v2Activation.activation.migrationOperationId === realPlan.operationId,
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
    const v2Level = await latestClaim(admin, v2.digest, "inventory.level");
    const v2ToV3Plan = buildMigrationPlan({
      assessment: v2ToV3Assessment,
      dependencies: [migrationDependency(v2Level)],
      expectedBatches: 1,
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
      plan: v2ToV3Plan,
      tenantId: tenantA,
    });
    const completedV3 = await definitionA.applyMigrationBatch({
      batchIndex: 0,
      operationId: v2ToV3Plan.operationId,
      records: [
        {
          ruleId: targetRuleId(
            v2ToV3Plan,
            "inventory.primaryWarehouse",
          ),
          sourceClaimIds: [v2Level.claim_id],
          targetEvidence: evidenceClaim(
            definitionReference(v3),
            "inventory.primaryWarehouse",
            entity("inventory.warehouse.primary"),
            "claim.inventory.primaryWarehouse.v3",
          ),
        },
      ],
      tenantId: tenantA,
    });
    observe(
      "meaningPreservingRenameCreatesNewEvidence",
      completedV3.progress?.status === MigrationStatus.COMPLETED &&
        completedV3.progress.lineage[0]?.kind ===
          MigrationRuleKind.PRESERVE_MEANING &&
        completedV3.progress.lineage[0]?.sourceClaimIds[0] ===
          "claim.inventory.level.v2" &&
        completedV3.progress.lineage[0]?.targetClaimId ===
          "claim.inventory.primaryWarehouse.v3",
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
    const v3Current = await queryValue(
      worldA,
      definitionReference(v3),
      "inventory.primaryWarehouse",
    );
    observe(
      "v3CurrentSemanticsUseEntityEvidence",
      v3Current.definition?.digest === v3.digest &&
        v3Current.value.value.case === "entityRefValue" &&
        v3Current.value.value.value === "inventory.warehouse.primary",
    );

    await expectProjectionFailure(tenantA);
    recordFailure("projection-regeneration-failure");
    const rebuilt = await rebuildProjection(tenantA);
    const projectedV3 = await queryValue(
      worldA,
      definitionReference(v3),
      "inventory.primaryWarehouse",
      "eventual",
    );
    observe(
      "projectionRebuildNamesAndServesV3",
      rebuilt.wroteManifest &&
        projectedV3.definition?.digest === v3.digest &&
        projectedV3.value.value.case === "entityRefValue",
    );

    const historicalV1 = await queryValue(
      worldA,
      definitionReference(v1),
      "inventory.level",
    );
    const v1Explanation = await historyClient(adminAToken).explain({
      target: {
        target: {
          case: "operationId",
          value: v1ReceiptOperationId,
        },
      },
    });
    observe(
      "historicalActionQueryAndExplainStayOnV1",
      historicalV1.definition?.digest === v1.digest &&
        historicalV1.value.value.case === "quantityValue" &&
        historicalV1.value.value.value.amount === "6" &&
        v1Explanation.explanation?.subject.case === "action" &&
        v1Explanation.explanation.subject.value.definition?.reference
          ?.digest === v1.digest,
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
        rollback.activation.previous?.digest === v3.digest,
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
          WHERE tenant_id = $1 AND definition_id = $2) AS definition_count,
         (SELECT count(*)::text FROM semantic_claims
          WHERE tenant_id = $1 AND definition_digest = $3) AS v3_claim_count`,
      [tenantA, definitionId, v3.digest],
    );
    observe(
      "rollbackPreservesV3HistoryAndV1V2V3Coexistence",
      postRollbackReceipt.definition?.digest === v2.digest &&
        durableV3.rows[0]?.count === "1" &&
        coexistence.rows[0]?.definition_count === "3" &&
        Number(coexistence.rows[0]?.v3_claim_count) > 0,
    );
    recordFailure("rollback-after-target-work");
    await assertImmutableHistory(admin, v1.digest);
    await assertSingleAuthorityLedger(admin);

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const keycloakVersion = await composeOutput(
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    );
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/);
    assert.ok(v1ToV2Assessment);
    assert.ok(v2ToV3Assessment);
    const protocol = await readFile(
      path.join(
        repositoryRoot,
        "proto",
        "zoen",
        "definition",
        "v1",
        "definition.proto",
      ),
    );
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      architecture: {
        authorityCommitLedger: "authority_commits",
        restate: "NotApplicable: operation and batch identities recover progress",
        wasm: "NotApplicable: canonical v1 has no Wasm artifact or reference",
      },
      assertions,
      classifications: {
        forbidden: reversePlan.plan?.classification,
        v1ToV2: v1ToV2Assessment.classification,
        v2ToV3: v2ToV3Assessment.classification,
      },
      componentVersions: {
        keycloak: keycloakVersion,
        postgres: postgresVersion,
      },
      definitionDigests: {
        v1: v1.digest,
        v2: v2.digest,
        v3: v3.digest,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      limitations: {
        actionOutput:
          "NotApplicable: canonical v1 Actions define inputs, preconditions, and effects but no output field",
      },
      mutants: {
        activationBeforeMigration:
          failureInjections.includes("activation-before-migration"),
        classifierIgnoresActionMeaning:
          assertions.physicalSchemaDoesNotOverrideSemanticClassification ===
          true,
        historicalResolutionUsesLatest:
          assertions.historicalActionQueryAndExplainStayOnV1 === true,
        impactGraphMissesDependencies:
          failureInjections.includes("incomplete-impact-graph"),
        migrationReplayDuplicates:
          assertions.migrationReplayIsIdempotent === true,
        oldRowUpdatedInPlace:
          assertions.firstMigrationBatchCreatesExplicitLineage === true,
        rollbackDeletesNewHistory:
          assertions.rollbackPreservesV3HistoryAndV1V2V3Coexistence === true,
      },
      observedOperations: {
        migrationV1ToV2: realPlan.operationId,
        migrationV2ToV3: v2ToV3Plan.operationId,
        v1Action: v1ReceiptOperationId,
        v2Action: v2ReceiptOperationId,
        v3Action: v3ReceiptOperationId,
      },
      protocolDigest: sha256(protocol),
      scenario: "evolution-breaking",
      sourceCommit,
      startedAt,
    };
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "evolution-breaking.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
  }
}

function targetRuleId(plan: MigrationPlan, relationId: string): string {
  const rule = plan.rules.find((item) =>
    item.targets.some(
      (target) =>
        target.element === DefinitionElementKind.RELATION &&
        target.id === relationId,
    ),
  );
  assert.ok(rule);
  return rule.ruleId;
}

function migrationDependency(claim: DurableClaim) {
  return create(MigrationDependencySchema, {
    claimId: claim.claim_id,
    commitSequence: BigInt(claim.commit_sequence),
    entityId: resourceId,
    relationId: claim.relation_id,
  });
}

function postcondition(relationId: string) {
  return create(MigrationPostconditionSchema, {
    minimumRecordCount: 1n,
    relationId,
  });
}

interface DurableClaim {
  readonly claim_id: string;
  readonly commit_sequence: string;
  readonly definition_revision: string;
  readonly relation_id: string;
}

async function latestClaim(
  admin: ReturnType<typeof adminClient>,
  digest: string,
  relationId: string,
): Promise<DurableClaim> {
  const result = await admin.query<DurableClaim>(
    `SELECT claim_id, commit_sequence::text, definition_revision::text,
            relation_id
     FROM semantic_claims
     WHERE tenant_id = $1
       AND definition_digest = $2
       AND entity_id = $3
       AND relation_id = $4
     ORDER BY commit_sequence DESC, claim_id DESC
     LIMIT 1`,
    [tenantA, digest, resourceId, relationId],
  );
  assert.equal(result.rows.length, 1);
  const claim = result.rows[0];
  assert.ok(claim);
  return claim;
}

async function activateInitial(
  client: DefinitionClient,
  tenantId: string,
  definition: CompiledDefinition,
) {
  return client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
    definitionId,
    digest: definition.digest,
    tenantId,
  });
}

function activate(
  client: DefinitionClient,
  tenantId: string,
  fromDigest: string,
  toDigest: string,
) {
  return client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectedActiveDigest",
      value: fromDigest,
    },
    definitionId,
    digest: toDigest,
    tenantId,
  });
}

async function expectConnectCode(
  operation: () => Promise<unknown>,
  expected: Code,
): Promise<void> {
  try {
    await operation();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
  }
}

async function assertImmutableHistory(
  admin: ReturnType<typeof adminClient>,
  v1Digest: string,
): Promise<void> {
  const rejected = await admin
    .query(
      `UPDATE semantic_claims
       SET value_text = 'rewritten'
       WHERE tenant_id = $1 AND definition_digest = $2`,
      [tenantA, v1Digest],
    )
    .then(
      () => false,
      (error: unknown) =>
        /semantic history and projection manifests are immutable/.test(
          String(error),
        ),
    );
  observe("oldAuthoritativeRecordsRejectInPlaceRewrite", rejected);
}

async function assertSingleAuthorityLedger(
  admin: ReturnType<typeof adminClient>,
): Promise<void> {
  const commits = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM authority_commits
     WHERE tenant_id = $1
       AND commit_kind IN (
         'definition_migration_plan',
         'definition_migration_batch'
       )`,
    [tenantA],
  );
  observe(
    "migrationUsesExistingAuthorityCommitLedger",
    Number(commits.rows[0]?.count) >= 6,
  );
}

function quantity(amount: string) {
  return create(ExactValueSchema, {
    value: {
      case: "quantityValue",
      value: create(QuantityValueSchema, { amount, unit: "kg" }),
    },
  });
}

function integer(value: string) {
  return create(ExactValueSchema, {
    value: { case: "integerValue", value },
  });
}

function entity(value: string) {
  return create(ExactValueSchema, {
    value: { case: "entityRefValue", value },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
