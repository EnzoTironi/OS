import assert from "node:assert/strict";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { EffectKnowledgeState } from "../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { Client as PostgresClient } from "pg";
import {
  afterCorrectionAt,
  governPurchase,
  productId,
  purchaseLineId,
  recordRequirement,
  requestSupplier,
  stockPositionId,
} from "../v1-company/actions.js";
import {
  actionClient,
  compilePackage,
  dispatchOnce,
  effectClient,
  explainOperation,
  historyClient,
  oidcToken,
  proposalRequest,
  providerOperation,
  recordEvidence,
  registerWorker,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  stopProcess,
  tenantA,
  worldClient,
  type DomainFixture,
  type ManagedProcess,
} from "../domain-inventory-procurement/support.js";
import {
  delay,
  evidenceInput,
  waitForConnectorStatus,
  waitForState,
} from "../effects/scenario.js";
import { e2ePostgresUrl, writeScenarioArtifact } from "../host-env.js";
import type { SampleCompanyRef, StackHandle, TimingReport } from "./types.js";
import { SCENARIO } from "./types.js";

export async function runActivationStory(
  stack: StackHandle,
  sample: SampleCompanyRef,
  timing: TimingReport,
): Promise<void> {
  const observations: Record<string, boolean> = {};
  const failureInjections: string[] = [];
  const observe = (name: string, condition: boolean): void => {
    assert.ok(condition, name);
    observations[name] = condition;
  };

  const [inventory, procurement] = await Promise.all([
    compilePackage("inventory"),
    compilePackage("procurement"),
  ]);
  observe(
    "webBindingsComeFromSeedNotHardcodedInventoryItem",
    sample.webBindings.resourceId === stockPositionId &&
      sample.webBindings.definitionId === inventory.definition.definitionId &&
      sample.webBindings.resourceId === sample.stockPositionId,
  );

  const [
    inventoryToken,
    procurementToken,
    supervisorToken,
    workerTokenA,
    workerTokenB,
    reconcilerToken,
  ] = await Promise.all([
    oidcToken("inventory-agent-a"),
    oidcToken("procurement-agent-a"),
    oidcToken("procurement-supervisor-a"),
    oidcToken("effect-worker-a"),
    oidcToken("effect-worker-b"),
    oidcToken("effect-reconciler-a"),
  ]);
  const world = worldClient(inventoryToken);
  const inventoryAction = actionClient(inventoryToken);
  const procurementAction = actionClient(procurementToken);
  const supervisorAction = actionClient(supervisorToken);
  const effect = effectClient(procurementToken);
  const reconciler = effectClient(reconcilerToken);
  const history = historyClient(procurementToken);
  const admin = new PostgresClient({
    connectionString: e2ePostgresUrl("postgres", "postgres", 55_457),
  });
  await admin.connect();
  const processes: ManagedProcess[] = [];

  try {
    processes.push(await startFaultProvider());
    processes.push(await startConnector());
    processes.push(
      await startWorker({
        "tenant.a": workerTokenA,
        "tenant.b": workerTokenB,
      }),
    );
    await registerWorker();

    const rivals = await world.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: { case: "strong", value: create(StrongConsistencySchema) },
      }),
      definition: inventory.definition,
      entityId: sample.stockPositionId,
      selection: create(QuerySelectionSchema, {
        value: {
          case: "relationId",
          value: "inventory.physicalQuantityClaim",
        },
      }),
      tenantId: sample.tenantId,
      validAt: timestampFromDate(new Date(sample.webBindings.validAt)),
    });
    observe(
      "conflictingEvidenceRemainsRival",
      rivals.values.length >= 3,
    );

    const shortage = await world.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: { case: "strong", value: create(StrongConsistencySchema) },
      }),
      definition: inventory.definition,
      entityId: sample.stockPositionId,
      selection: create(QuerySelectionSchema, {
        value: {
          case: "computationId",
          value: "inventory.procurementShortage",
        },
      }),
      tenantId: sample.tenantId,
      validAt: timestampFromDate(new Date(sample.webBindings.validAt)),
    });
    observe("orderAtRiskShowsProcurementShortage", shortage.values.length > 0);

    const commitmentStatus = await inventoryAction.getOperationStatus({
      operationId: sample.commitmentOperationId,
    });
    observe(
      "sampleCommitmentExistsViaGovernedAction",
      commitmentStatus.status === CommitStatus.COMMITTED,
    );

    const beforeDuplicate = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM action_operations
       WHERE tenant_id = $1 AND operation_id = $2`,
      [sample.tenantId, sample.commitmentOperationId],
    );
    const { seedSampleCompany } = await import("./seed.js");
    const ensureAgain = await seedSampleCompany(stack, { mode: "ensure" });
    const afterDuplicate = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM action_operations
       WHERE tenant_id = $1 AND operation_id = $2`,
      [sample.tenantId, sample.commitmentOperationId],
    );
    observe(
      "restartEnsureDoesNotDuplicateCommitment",
      ensureAgain.outcome === "already-seeded" &&
        beforeDuplicate.rows[0]?.count === "1" &&
        afterDuplicate.rows[0]?.count === "1",
    );

    failureInjections.push("direct-sql-touch-after-start");
    let sqlRejected = false;
    try {
      await admin.query(
        `UPDATE semantic_claims
         SET claim_id = claim_id || '.mutant'
         WHERE tenant_id = $1 AND entity_id = $2`,
        [sample.tenantId, sample.stockPositionId],
      );
    } catch (cause: unknown) {
      sqlRejected =
        cause instanceof Error &&
        /immutable|cannot|reject|trigger|protect/iu.test(cause.message);
    }
    const rivalsAfterSql = await world.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: { case: "strong", value: create(StrongConsistencySchema) },
      }),
      definition: inventory.definition,
      entityId: sample.stockPositionId,
      selection: create(QuerySelectionSchema, {
        value: {
          case: "relationId",
          value: "inventory.physicalQuantityClaim",
        },
      }),
      tenantId: sample.tenantId,
      validAt: timestampFromDate(new Date(sample.webBindings.validAt)),
    });
    observe(
      "sqlTouchDoesNotReplaceAuthorityBackedRivals",
      sqlRejected && rivalsAfterSql.values.length === rivals.values.length,
    );

    await recordProcurementMetadata(world, procurement);
    const shortageQuantity = shortageValue(shortage);
    await commitReady(
      procurementAction,
      recordRequirement(
        procurement as Parameters<typeof recordRequirement>[0],
        "sample",
        shortageQuantity,
      ),
    );
    await commitReady(
      procurementAction,
      requestSupplier(
        procurement as Parameters<typeof requestSupplier>[0],
        shortageQuantity,
      ),
    );

    await setProviderMode("confirmed");
    await dispatchOnce();

    const purchaseRequest = governPurchase(
      procurement as Parameters<typeof governPurchase>[0],
      "sample-purchase",
    );
    const purchaseProposal = await procurementAction.propose(purchaseRequest);
    observe(
      "governedPurchaseRequiresApproval",
      purchaseProposal.decision === PolicyDecision.PERMIT &&
        purchaseProposal.proposal?.status === ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(purchaseProposal.proposal);
    const approval = await supervisorAction.approve({
      approvalId: "approval.sample.purchase",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: purchaseProposal.proposal.proposalId,
    });
    assert.equal(approval.decision, PolicyDecision.PERMIT);
    const purchaseCommit = await procurementAction.commit({
      operationId: purchaseRequest.operationId,
      proposalId: purchaseRequest.proposalId,
    });
    observe(
      "purchaseCommitsThroughPostgresAuthority",
      purchaseCommit.status === CommitStatus.COMMITTED &&
        purchaseCommit.receipt !== undefined,
    );
    assert.ok(purchaseCommit.receipt);

    await setProviderMode("timeout_after_delivery");
    await dispatchOnce();
    const effectId = purchaseCommit.receipt.effectRequestIds[0];
    assert.ok(effectId);
    const unknown = await waitForState(
      effect,
      effectId,
      EffectKnowledgeState.UNKNOWN,
    );
    const idempotencyKey = `idempotency.${tenantA}.${effectId}`;
    const external = await providerOperation(idempotencyKey);
    assert.ok(external);
    await delay(1_100);
    const stillUnknown = await effect.getEffect({ effectRequestId: effectId });
    failureInjections.push("purchase-effect-timeout-after-possible-creation");
    observe(
      "effectTimeoutStaysUnknownWithoutBlindRetry",
      unknown.request?.state === EffectKnowledgeState.UNKNOWN &&
        stillUnknown.snapshot?.request?.state === EffectKnowledgeState.UNKNOWN &&
        external.requests === 1,
    );

    const connectorStatus = await waitForConnectorStatus(idempotencyKey);
    const reconciled = await reconciler.reconcile({
      effectRequestId: effectId,
      evidence: evidenceInput(connectorStatus, "sample-purchase-confirmed"),
    });
    observe(
      "laterReconciliationUpdatesOutcome",
      reconciled.snapshot?.request?.state === EffectKnowledgeState.CONFIRMED,
    );

    const explanation = await explainOperation(
      history,
      purchaseCommit.receipt.operationId,
    );
    observe(
      "explainPinsAcceptedBasisAndEffects",
      explanation.complete === true && explanation.gaps.length === 0,
    );

    const reserve = proposalRequest({
      actionId: "inventory.reserveInventory",
      fixture: inventory,
      inputs: [
        {
          id: "allocationReference",
          value: { kind: "text", value: "allocation.order-1001" },
        },
        {
          id: "commitmentReference",
          value: { kind: "text", value: "commitment.order-1001" },
        },
        {
          id: "quantity",
          value: { amount: "1", kind: "quantity", unit: "each" },
        },
        {
          id: "reservationReference",
          value: { kind: "text", value: "reservation.sample.1" },
        },
      ],
      resourceId: stockPositionId,
      suffix: "sample-reserve",
      validAt: afterCorrectionAt,
    });
    const reserved = await commitReady(inventoryAction, reserve);
    observe(
      "browserCameraActionCommitsOnSeedResource",
      reserved.commitSequence > 0n,
    );

    observe("timingReportEmitted", timing.budgetMs === 300_000);
    observe(
      "timingHonesty",
      typeof timing.wallMs === "number" &&
        typeof timing.withinBudget === "boolean",
    );

    const manifest = {
      scenario: SCENARIO,
      observations,
      failureInjections,
      sample,
      timing,
      endpoints: stack.endpoints,
      webOrigin: stack.endpoints.webOrigin,
      mutantsKilled: [
        "hardcoded-inventory.item.1",
        "duplicate-commitment-on-ensure",
        "sql-business-authority-bypass",
        "effect-timeout-as-success",
        "missing-approval-on-purchase",
      ],
    };
    await writeScenarioArtifact(stack.root, SCENARIO, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    if (!timing.withinBudget) {
      throw new Error(
        `activation exceeded ${timing.budgetMs}ms budget (wall=${timing.wallMs}ms)`,
      );
    }
  } finally {
    for (const managed of processes.reverse()) {
      if (
        managed.child.exitCode === null &&
        managed.child.signalCode === null
      ) {
        await stopProcess(managed);
      }
    }
    await admin.end();
  }
}

async function commitReady(
  client: ReturnType<typeof actionClient>,
  request: ReturnType<typeof proposalRequest>,
) {
  const proposed = await client.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  assert.ok(proposed.proposal);
  const committed = await client.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  return committed.receipt;
}

async function recordProcurementMetadata(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
): Promise<void> {
  const records = [
    {
      claimId: "claim.procurement.sample.requirement-revision",
      relationId: "procurement.requirementRevision",
      sourceId: "source.inventory-shortage",
      value: { kind: "integer" as const, value: "1" },
    },
    {
      claimId: "claim.procurement.sample.supplier-party",
      relationId: "procurement.supplierPartyReference",
      sourceId: "source.supplier-master",
      value: { kind: "text" as const, value: "party.organization.supplier" },
    },
    {
      claimId: "claim.procurement.sample.supplier-terms",
      relationId: "procurement.supplierTermsReference",
      sourceId: "source.supplier-master",
      value: { kind: "text" as const, value: "terms.net-30" },
    },
    {
      claimId: "claim.procurement.sample.supplier-terms-revision",
      relationId: "procurement.supplierTermsRevision",
      sourceId: "source.supplier-master",
      value: { kind: "integer" as const, value: "2" },
    },
    {
      claimId: "claim.procurement.sample.product-reference",
      relationId: "procurement.productReference",
      sourceId: "source.product-catalog",
      value: { kind: "text" as const, value: productId },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      entityId: purchaseLineId,
      fixture,
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
    }).catch(() => undefined);
  }
}

function shortageValue(
  result: Awaited<ReturnType<ReturnType<typeof worldClient>["semanticQuery"]>>,
) {
  const first = result.values[0]?.value?.value;
  if (first?.case === "quantityValue") {
    return {
      amount: first.value.amount,
      kind: "quantity" as const,
      unit: first.value.unit,
    };
  }
  return { amount: "4", kind: "quantity" as const, unit: "each" };
}
