import assert from "node:assert/strict";
import path from "node:path";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { EffectKnowledgeState } from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  e2eGeneratedDirectory,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  activeDigest,
  actionClient,
  activateDefinition,
  adminClient,
  command,
  compilePackage,
  definitionClient,
  dispatchOnce,
  effectClient,
  expectConnectCode,
  explainOperation,
  explanationShape,
  historyClient,
  loadPolicy,
  oidcToken,
  packageSource,
  proposalRequest,
  providerOperation,
  publishDefinition,
  rebuildProjection,
  recordEvidence,
  registerWorker,
  repositoryRoot,
  runLeakageGate,
  runLeakageMutant,
  semanticQuery,
  semanticShape,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startServer,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
  writePolicyManifest,
  type ActionClient,
  type DomainFixture,
  type EvidenceTime,
  type ManagedProcess,
  type SemanticValue,
  type ServerProcess,
} from "./domain-inventory-procurement/support.js";
import {
  delay,
  evidenceCounts,
  evidenceInput,
  waitForConnectorStatus,
  waitForState,
} from "./effects/scenario.js";

const scenario = "domain-inventory-procurement";
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const lifecycleAt = new Date("2026-08-21T12:00:00.000Z");
const afterCorrectionAt = new Date("2026-08-21T12:00:01.000Z");
const yearStart = new Date("2026-01-01T00:00:00.000Z");
const yearEnd = new Date("2027-01-01T00:00:00.000Z");
const supplierPartyId = "party.organization.supplier";
const productId = "product.item.widget-pro";
const orderLineId = "commercial.order-line.2001";
const stockPositionId = "inventory.position.widget-pro.wh-1";
const purchaseLineId = "procurement.purchase-line.2001";

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

function instant(at: Date): EvidenceTime {
  return { at, kind: "instant" };
}

function interval(start: Date, end: Date): EvidenceTime {
  return { end, kind: "interval", start };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const packageNames = [
    "party",
    "product",
    "commercial",
    "inventory",
    "procurement",
  ] as const;
  const fixtures = await Promise.all(
    packageNames.map((packageName) => compilePackage(packageName)),
  );
  const repeated = await Promise.all(
    packageNames.map((packageName) => compilePackage(packageName)),
  );
  const fixtureByName = Object.fromEntries(
    fixtures.map((fixture) => [fixture.packageName, fixture]),
  );
  const party = requireFixture(fixtureByName, "party");
  const product = requireFixture(fixtureByName, "product");
  const commercial = requireFixture(fixtureByName, "commercial");
  const inventory = requireFixture(fixtureByName, "inventory");
  const procurement = requireFixture(fixtureByName, "procurement");

  observe(
    "fiveVersionedPackagesCompileDeterministically",
    fixtures.every(
      (fixture, index) =>
        fixture.digest === repeated[index]?.digest &&
        fixture.canonicalJson === repeated[index]?.canonicalJson,
    ) &&
      new Set(fixtures.map((fixture) => fixture.digest)).size === fixtures.length,
  );
  observe(
    "inventoryAndProcurementRetainTypeRelationComputationAction",
    [inventory, procurement].every(
      (fixture) =>
        fixture.metadata.types.length > 0 &&
        fixture.metadata.relations.length > 0 &&
        fixture.metadata.computations.length > 0 &&
        fixture.metadata.actions.length > 0,
    ),
  );
  const [inventorySource, procurementSource] = await Promise.all([
    packageSource("inventory"),
    packageSource("procurement"),
  ]);
  observe(
    "definitionsRejectMutableStockAndKeepReservationSeparate",
    !/(?:stock_on_hand|stockOnHand)/u.test(inventorySource) &&
      !/relationId: "inventory\.physicalQuantityClaim"[\s\S]*id: "inventory\.reserveInventory"/u.test(
        inventorySource,
      ) &&
      /inventory\.reservedQuantity/u.test(inventorySource),
  );
  observe(
    "procurementDefinitionSeparatesRequirementCommitmentReceiptAndReturn",
    [
      "procurement.requiredQuantity",
      "procurement.requestedQuantity",
      "procurement.committedQuantity",
      "procurement.receivedQuantity",
      "procurement.cancelledQuantity",
      "procurement.returnedQuantity",
    ].every((relationId) => procurementSource.includes(relationId)),
  );

  const [
    activationPolicy,
    domainPolicy,
    inventoryPolicy,
    procurementPolicy,
    purchasePolicy,
  ] = await Promise.all([
    loadPolicy("activation.cedar"),
    loadPolicy("domain.cedar"),
    loadPolicy("inventory.cedar"),
    loadPolicy("procurement.cedar"),
    loadPolicy("purchase.cedar"),
  ]);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writePolicyManifest(policyManifestPath, fixtures, {
    activation: activationPolicy,
    domain: domainPolicy,
    inventory: inventoryPolicy,
    procurement: procurementPolicy,
    purchase: purchasePolicy,
  });

  const [
    adminAToken,
    commercialAToken,
    inventoryAToken,
    procurementAToken,
    supervisorAToken,
    workerAToken,
    reconcilerAToken,
    adminBToken,
    inventoryBToken,
    procurementBToken,
    supervisorBToken,
    workerBToken,
  ] = await Promise.all([
    oidcToken("domain-admin-a"),
    oidcToken("commercial-agent-a"),
    oidcToken("inventory-agent-a"),
    oidcToken("procurement-agent-a"),
    oidcToken("procurement-supervisor-a"),
    oidcToken("effect-worker-a"),
    oidcToken("effect-reconciler-a"),
    oidcToken("domain-admin-b"),
    oidcToken("inventory-agent-b"),
    oidcToken("procurement-agent-b"),
    oidcToken("procurement-supervisor-b"),
    oidcToken("effect-worker-b"),
  ]);
  const definitionA = definitionClient(adminAToken);
  const definitionB = definitionClient(adminBToken);
  const commercialAction = actionClient(commercialAToken);
  const inventoryAction = actionClient(inventoryAToken);
  const procurementAction = actionClient(procurementAToken);
  const supervisorAction = actionClient(supervisorAToken);
  const procurementActionB = actionClient(procurementBToken);
  const supervisorActionB = actionClient(supervisorBToken);
  const effectA = effectClient(procurementAToken);
  const reconcilerA = effectClient(reconcilerAToken);
  const worldA = worldClient(inventoryAToken);
  const worldB = worldClient(inventoryBToken);
  const historyA = historyClient(procurementAToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  let server: ServerProcess | undefined;
  await admin.connect();

  try {
    server = await startServer(policyManifestPath);
    processes.push(await startFaultProvider());
    processes.push(await startConnector());
    processes.push(
      await startWorker({
        [tenantA]: workerAToken,
        [tenantB]: workerBToken,
      }),
    );
    const registration = await registerWorker();
    observe(
      "realRestateWorkerRegistered",
      /ZoenEffect|deployment/iu.test(registration),
    );

    const inactiveBeforePublish = await Promise.all(
      fixtures.flatMap((fixture) => [
        activeDigest(definitionA, tenantA, fixture),
        activeDigest(definitionB, tenantB, fixture),
      ]),
    );
    assert.ok(inactiveBeforePublish.every((digest) => digest === undefined));
    const publicationCommits = await Promise.all(
      fixtures.flatMap((fixture) => [
        publishDefinition(definitionA, tenantA, fixture),
        publishDefinition(definitionB, tenantB, fixture),
      ]),
    );
    const inactiveAfterPublish = await Promise.all(
      fixtures.flatMap((fixture) => [
        activeDigest(definitionA, tenantA, fixture),
        activeDigest(definitionB, tenantB, fixture),
      ]),
    );
    observe(
      "publishDoesNotAutoActivateAnyDomainPackage",
      publicationCommits.every((commit) => commit > 0n) &&
        inactiveAfterPublish.every((digest) => digest === undefined),
    );
    const activationCommits = await Promise.all(
      fixtures.flatMap((fixture) => [
        activateDefinition(definitionA, tenantA, fixture),
        activateDefinition(definitionB, tenantB, fixture),
      ]),
    );
    const activeAfterActivation = await Promise.all(
      fixtures.flatMap((fixture) => [
        activeDigest(definitionA, tenantA, fixture),
        activeDigest(definitionB, tenantB, fixture),
      ]),
    );
    observe(
      "allFivePackagesActivateExplicitlyForBothTenants",
      activationCommits.every((commit) => commit > 0n) &&
        fixtures.every(
          (fixture, index) =>
            activeAfterActivation[index * 2] === fixture.digest &&
            activeAfterActivation[index * 2 + 1] === fixture.digest,
        ),
    );

    await recordSharedPartyAndProduct(worldA, party, product, tenantA);
    await recordSharedPartyAndProduct(worldB, party, product, tenantB);
    const commercialCommitment = await commitReadyAction(
      commercialAction,
      commercialCommitmentRequest(commercial),
    );
    observe(
      "commercialCommitmentFromV115FeedsInventoryLifecycle",
      commercialCommitment.receipt.definition?.digest === commercial.digest &&
        commercialCommitment.receipt.policy?.revision?.policyId ===
          "policy.commercial.createCommitment.r1" &&
        commercialCommitment.receipt.recordIds.length === 5,
    );

    await recordInventoryIdentity(worldA, inventory, tenantA);
    await Promise.all(
      [
        {
          claimId: "claim.inventory.wms-quantity",
          sourceId: "source.wms",
          value: "10",
        },
        {
          claimId: "claim.inventory.erp-quantity",
          sourceId: "source.erp",
          value: "8",
        },
        {
          claimId: "claim.inventory.manual-quantity",
          sourceId: "source.manual-count",
          value: "9",
        },
      ].map((claim) =>
        recordEvidence(worldA, {
          claimId: claim.claimId,
          entityId: stockPositionId,
          fixture: inventory,
          relationId: "inventory.physicalQuantityClaim",
          sourceId: claim.sourceId,
          tenantId: tenantA,
          time: interval(yearStart, yearEnd),
          value: { amount: claim.value, kind: "quantity", unit: "each" },
        }),
      ),
    );
    await recordEvidence(worldA, {
      claimId: "claim.inventory.accepted-initial",
      entityId: stockPositionId,
      fixture: inventory,
      relationId: "inventory.acceptedPhysicalQuantity",
      sourceId: "source.inventory-control",
      tenantId: tenantA,
      time: instant(lifecycleAt),
      value: { amount: "10", kind: "quantity", unit: "each" },
    });
    const rivals = await relationQuery(
      worldA,
      inventory,
      stockPositionId,
      "inventory.physicalQuantityClaim",
      lifecycleAt,
      tenantA,
    );
    observe(
      "wmsErpAndManualClaimsRemainRivalEvidence",
      sameStrings(quantityValues(rivals), ["10 each", "8 each", "9 each"]) &&
        ["source.wms", "source.erp", "source.manual-count"].every((sourceId) =>
          hasSource(rivals, sourceId),
        ),
    );

    const staleReservationRequest = reservationRequest(
      inventory,
      "stale",
      lifecycleAt,
    );
    const staleReservation = await inventoryAction.propose(
      staleReservationRequest,
    );
    assert.equal(staleReservation.decision, PolicyDecision.PERMIT);
    assert.equal(staleReservation.proposal?.status, ProposalStatus.READY);
    assert.ok(staleReservation.proposal);
    await recordEvidence(worldA, {
      claimId: "claim.inventory.accepted-correction",
      entityId: stockPositionId,
      fixture: inventory,
      relationId: "inventory.acceptedPhysicalQuantity",
      sourceId: "source.inventory-reconciliation.erp-wms-manual",
      tenantId: tenantA,
      time: interval(lifecycleAt, yearEnd),
      value: { amount: "8", kind: "quantity", unit: "each" },
    });
    const staleReservationCommit = await inventoryAction.commit({
      operationId: staleReservationRequest.operationId,
      proposalId: staleReservationRequest.proposalId,
    });
    inject("accepted-stock-change-after-reservation-proposal");
    observe(
      "relevantStockChangeMakesReservationBasisStale",
      staleReservationCommit.status === CommitStatus.STALE &&
        staleReservationCommit.receipt === undefined &&
        staleReservationCommit.currentStateBasis?.digest !==
          staleReservation.proposal.stateBasis?.digest,
    );

    const reservationRequestAfterCorrection = reservationRequest(
      inventory,
      "accepted",
      afterCorrectionAt,
    );
    const reservationProposal = await inventoryAction.propose(
      reservationRequestAfterCorrection,
    );
    assert.equal(reservationProposal.decision, PolicyDecision.PERMIT);
    assert.ok(reservationProposal.proposal);
    await recordEvidence(worldA, {
      claimId: "claim.inventory.unrelated-position",
      entityId: "inventory.position.unrelated",
      fixture: inventory,
      relationId: "inventory.physicalQuantityClaim",
      sourceId: "source.wms",
      tenantId: tenantA,
      time: instant(afterCorrectionAt),
      value: { amount: "500", kind: "quantity", unit: "each" },
    });
    const reserved = await inventoryAction.commit({
      operationId: reservationRequestAfterCorrection.operationId,
      proposalId: reservationRequestAfterCorrection.proposalId,
    });
    assert.equal(reserved.status, CommitStatus.COMMITTED);
    assert.ok(reserved.receipt);
    observe(
      "unrelatedCommitDoesNotFalseStaleReservation",
      reserved.receipt.commitStateBasis?.digest ===
        reservationProposal.proposal.stateBasis?.digest,
    );

    await Promise.all([
      recordEvidence(worldA, {
        claimId: "claim.inventory.commercial-commitment-reference",
        entityId: stockPositionId,
        fixture: inventory,
        relationId: "inventory.commercialCommitmentReference",
        sourceId: commercialCommitment.receipt.operationId,
        tenantId: tenantA,
        time: instant(afterCorrectionAt),
        value: { kind: "text", value: "commitment.order-2001" },
      }),
      recordEvidence(worldA, {
        claimId: "claim.inventory.commercial-committed-quantity",
        entityId: stockPositionId,
        fixture: inventory,
        relationId: "inventory.commercialCommittedQuantity",
        sourceId: commercialCommitment.receipt.operationId,
        tenantId: tenantA,
        time: instant(afterCorrectionAt),
        value: { amount: "10", kind: "quantity", unit: "each" },
      }),
    ]);
    const [availability, shortage] = await Promise.all([
      computationQuery(
        worldA,
        inventory,
        stockPositionId,
        "inventory.safeAvailability",
        afterCorrectionAt,
        tenantA,
      ),
      computationQuery(
        worldA,
        inventory,
        stockPositionId,
        "inventory.procurementShortage",
        afterCorrectionAt,
        tenantA,
      ),
    ]);
    const rawClaimCount = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM semantic_claims
       WHERE tenant_id = $1
         AND entity_id = $2
         AND relation_id = 'inventory.physicalQuantityClaim'`,
      [tenantA, stockPositionId],
    );
    observe(
      "reservationLeavesRawStockUntouchedAndAvailabilityHasLineage",
      rawClaimCount.rows[0]?.count === "3" &&
        sameStrings(quantityValues(availability), ["2 each"]) &&
        hasRelation(availability, "inventory.acceptedPhysicalQuantity") &&
        hasRelation(availability, "inventory.reservedQuantity"),
    );
    observe(
      "commercialDemandCreatesExactProcurementShortage",
      sameStrings(quantityValues(shortage), ["2 each"]) &&
        hasRelation(shortage, "inventory.commercialCommittedQuantity") &&
        hasRelation(shortage, "inventory.acceptedPhysicalQuantity"),
    );

    await recordProcurementBasis(worldA, procurement, tenantA);
    const supplierRequest = await commitReadyAction(
      procurementAction,
      supplierRequestAction(procurement),
    );
    observe(
      "procurementRequirementAndSupplierRequestRemainDistinct",
      supplierRequest.receipt.recordIds.length === 2 &&
        supplierRequest.receipt.definition?.digest === procurement.digest,
    );

    await setProviderMode("confirmed");
    await dispatchOnce();
    const clearedReservationEffect = reserved.receipt.effectRequestIds[0];
    assert.ok(clearedReservationEffect);
    await waitForState(
      effectA,
      clearedReservationEffect,
      EffectKnowledgeState.CONFIRMED,
    );

    const stalePurchaseRequest = purchaseRequest(procurement, "stale");
    const stalePurchase = await procurementAction.propose(stalePurchaseRequest);
    assert.equal(stalePurchase.decision, PolicyDecision.PERMIT);
    assert.equal(
      stalePurchase.proposal?.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(stalePurchase.proposal);
    const unauthorizedApproval = await procurementAction.approve({
      approvalId: "approval.purchase.unauthorized",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: stalePurchase.proposal.proposalId,
    });
    const stalePurchaseApproval = await supervisorAction.approve({
      approvalId: "approval.purchase.stale",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: stalePurchase.proposal.proposalId,
    });
    observe(
      "purchaseUsesOrdinaryDelegationAndSupervisorAuthority",
      unauthorizedApproval.decision === PolicyDecision.DENY &&
        unauthorizedApproval.approval === undefined &&
        stalePurchaseApproval.decision === PolicyDecision.PERMIT &&
        stalePurchaseApproval.approval?.approvedBy ===
          "actor.procurement-supervisor.a",
    );
    await recordEvidence(worldA, {
      claimId: "claim.procurement.supplier-terms-revision-2",
      entityId: purchaseLineId,
      fixture: procurement,
      relationId: "procurement.supplierTermsRevision",
      sourceId: "source.supplier-master",
      tenantId: tenantA,
      time: instant(afterCorrectionAt),
      value: { kind: "integer", value: "2" },
    });
    const stalePurchaseCommit = await procurementAction.commit({
      operationId: stalePurchaseRequest.operationId,
      proposalId: stalePurchaseRequest.proposalId,
    });
    inject("supplier-terms-change-after-purchase-proposal");
    observe(
      "supplierTermsChangeMakesPurchaseBasisStale",
      stalePurchaseCommit.status === CommitStatus.STALE &&
        stalePurchaseCommit.receipt === undefined &&
        stalePurchaseCommit.currentStateBasis?.digest !==
          stalePurchase.proposal.stateBasis?.digest,
    );

    const purchaseRequestAfterReplan = purchaseRequest(procurement, "accepted");
    const purchaseProposal = await procurementAction.propose(
      purchaseRequestAfterReplan,
    );
    assert.equal(purchaseProposal.decision, PolicyDecision.PERMIT);
    assert.equal(
      purchaseProposal.proposal?.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(purchaseProposal.proposal);
    const purchaseApproval = await supervisorAction.approve({
      approvalId: "approval.purchase.accepted",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: purchaseProposal.proposal.proposalId,
    });
    assert.equal(purchaseApproval.decision, PolicyDecision.PERMIT);
    const purchaseCommit = await procurementAction.commit({
      operationId: purchaseRequestAfterReplan.operationId,
      proposalId: purchaseRequestAfterReplan.proposalId,
    });
    assert.equal(purchaseCommit.status, CommitStatus.COMMITTED);
    assert.ok(purchaseCommit.receipt);
    const atomicPurchase = await admin.query<{
      effects: string;
      operation: string;
      records: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM action_operations WHERE tenant_id = $1 AND operation_id = $2) AS operation,
         (SELECT count(*)::text FROM effect_requests WHERE tenant_id = $1 AND operation_id = $2) AS effects,
         (SELECT count(*)::text FROM semantic_claims WHERE tenant_id = $1 AND claim_id = ANY($3::text[])) AS records`,
      [
        tenantA,
        purchaseCommit.receipt.operationId,
        purchaseCommit.receipt.recordIds,
      ],
    );
    observe(
      "purchaseCommitAtomicallyStoresOperationRecordsAndEffects",
      atomicPurchase.rows[0]?.operation === "1" &&
        atomicPurchase.rows[0]?.effects ===
          purchaseCommit.receipt.effectRequestIds.length.toString() &&
        atomicPurchase.rows[0]?.records ===
          purchaseCommit.receipt.recordIds.length.toString(),
    );

    const serverBeforePurchaseRestart = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const statusAfterCommitRestart =
      await procurementAction.getOperationStatus({
        operationId: purchaseCommit.receipt.operationId,
      });
    observe(
      "restartAfterPurchaseCommitRecoversOneDurableOperation",
      serverBeforePurchaseRestart !== server.child.pid &&
        statusAfterCommitRestart.status === CommitStatus.COMMITTED &&
        statusAfterCommitRestart.receipt?.commitSequence ===
          purchaseCommit.receipt.commitSequence,
    );

    await setProviderMode("timeout_after_delivery");
    await dispatchOnce();
    const firstPurchaseEffect = purchaseCommit.receipt.effectRequestIds[0];
    assert.ok(firstPurchaseEffect);
    const unknownPurchase = await waitForState(
      effectA,
      firstPurchaseEffect,
      EffectKnowledgeState.UNKNOWN,
    );
    const firstPurchaseIdempotencyKey =
      `idempotency.${tenantA}.${firstPurchaseEffect}`;
    const externalPurchase = await providerOperation(
      firstPurchaseIdempotencyKey,
    );
    assert.ok(externalPurchase);
    await delay(1_100);
    const unknownAfterDelay = await effectA.getEffect({
      effectRequestId: firstPurchaseEffect,
    });
    inject("purchase-effect-timeout-after-possible-creation");
    observe(
      "purchaseTimeoutStaysUnknownWithoutBlindRetry",
      unknownPurchase.request?.state === EffectKnowledgeState.UNKNOWN &&
        unknownAfterDelay.snapshot?.request?.state ===
          EffectKnowledgeState.UNKNOWN &&
        externalPurchase.requests === 1,
    );

    const serverBeforeEffectRestart = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const recoveredPurchaseStatus =
      await procurementAction.getOperationStatus({
        operationId: purchaseCommit.receipt.operationId,
      });
    observe(
      "restartBetweenEffectAndReceiptDoesNotDuplicatePurchase",
      serverBeforeEffectRestart !== server.child.pid &&
        recoveredPurchaseStatus.status === CommitStatus.COMMITTED &&
        (
          await providerOperation(firstPurchaseIdempotencyKey)
        )?.requests === 1,
    );

    const purchaseEvidence = await Promise.all(
      purchaseCommit.receipt.effectRequestIds.map(async (effectRequestId, index) => {
        const idempotencyKey = `idempotency.${tenantA}.${effectRequestId}`;
        const connectorStatus = await waitForConnectorStatus(idempotencyKey);
        const evidence = evidenceInput(
          connectorStatus,
          `purchase-confirmed-${index}`,
        );
        const reconciled = await reconcilerA.reconcile({
          effectRequestId,
          evidence,
        });
        assert.equal(
          reconciled.snapshot?.request?.state,
          EffectKnowledgeState.CONFIRMED,
        );
        return { effectRequestId, evidence, idempotencyKey };
      }),
    );
    const firstEvidence = purchaseEvidence[0];
    assert.ok(firstEvidence);
    await reconcilerA.reconcile({
      effectRequestId: firstEvidence.effectRequestId,
      evidence: firstEvidence.evidence,
    });
    const purchaseEvidenceCount = await evidenceCounts(
      admin,
      firstEvidence.effectRequestId,
    );
    const providerRequestCounts = await Promise.all(
      purchaseEvidence.map(async (entry) => {
        const operation = await providerOperation(entry.idempotencyKey);
        return operation?.requests;
      }),
    );
    observe(
      "externalPurchaseReconciliationIsIdempotent",
      purchaseEvidenceCount.evidence === 1 &&
        purchaseEvidenceCount.reconciliations === 1 &&
        providerRequestCounts.every((requests) => requests === 1),
    );

    const purchaseExplanation = await explainOperation(
      historyA,
      purchaseCommit.receipt.operationId,
    );
    observe(
      "purchaseExplanationPinsRequirementTermsPolicyAndEffects",
      purchaseExplanation.complete &&
        purchaseExplanation.gaps.length === 0 &&
        purchaseExplanation.subject.case === "action" &&
        purchaseExplanation.subject.value.proposalStateBasis?.basis?.dependencies.some(
          (dependency) =>
            dependency.relationId === "procurement.requirementRevision",
        ) === true &&
        purchaseExplanation.subject.value.proposalStateBasis?.basis?.dependencies.some(
          (dependency) =>
            dependency.relationId === "procurement.supplierTermsRevision",
        ) === true &&
        purchaseExplanation.subject.value.effects.every(
          (effect) =>
            effect.request?.structure?.state === EffectKnowledgeState.CONFIRMED,
        ),
    );
    const purchaseExplanationBeforeFinalRestart =
      explanationShape(purchaseExplanation);

    const partialReceipt = await commitReadyAction(
      procurementAction,
      partialReceiptRequest(procurement),
    );
    const remainingAfterPartial = await computationQuery(
      worldA,
      procurement,
      purchaseLineId,
      "procurement.remainingAfterReceipt",
      afterCorrectionAt,
      tenantA,
    );
    observe(
      "partialReceiptLeavesRemainingSupplierCommitment",
      partialReceipt.receipt.recordIds.length === 3 &&
        sameStrings(quantityValues(remainingAfterPartial), ["1 each"]) &&
        hasRelation(remainingAfterPartial, "procurement.committedQuantity") &&
        hasRelation(remainingAfterPartial, "procurement.receivedQuantity"),
    );

    await setProviderMode("accepted_pending");
    await dispatchOnce();
    const receiptSourceEffect = partialReceipt.receipt.effectRequestIds[0];
    assert.ok(receiptSourceEffect);
    await waitForState(
      effectA,
      receiptSourceEffect,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    const receiptStatus = await waitForConnectorStatus(
      `idempotency.${tenantA}.${receiptSourceEffect}`,
    );
    const receiptEvidence = evidenceInput(
      receiptStatus,
      "partial-receipt-source",
    );
    await reconcilerA.reconcile({
      effectRequestId: receiptSourceEffect,
      evidence: receiptEvidence,
    });
    await reconcilerA.reconcile({
      effectRequestId: receiptSourceEffect,
      evidence: receiptEvidence,
    });
    const duplicateReceiptCounts = await evidenceCounts(
      admin,
      receiptSourceEffect,
    );
    inject("duplicate-receipt-source-evidence");
    observe(
      "duplicateReceiptSourceEvidenceIsIdempotent",
      duplicateReceiptCounts.evidence === 1 &&
        duplicateReceiptCounts.reconciliations === 1,
    );

    const cancellation = await commitReadyAction(
      procurementAction,
      cancellationRequest(procurement),
    );
    const returned = await commitReadyAction(
      procurementAction,
      returnRequest(procurement),
    );
    const corrected = await commitReadyAction(
      procurementAction,
      correctionRequest(procurement),
    );
    const [remainingAfterCancellation, netReceived] = await Promise.all([
      computationQuery(
        worldA,
        procurement,
        purchaseLineId,
        "procurement.remainingCommitment",
        afterCorrectionAt,
        tenantA,
      ),
      computationQuery(
        worldA,
        procurement,
        purchaseLineId,
        "procurement.netReceivedQuantity",
        afterCorrectionAt,
        tenantA,
      ),
    ]);
    observe(
      "partialReceiptCancellationAndReturnAppendHistory",
      cancellation.receipt.commitSequence < returned.receipt.commitSequence &&
        returned.receipt.commitSequence < corrected.receipt.commitSequence &&
        sameStrings(quantityValues(remainingAfterCancellation), ["0 each"]) &&
        sameStrings(quantityValues(netReceived), ["0.75 each"]),
    );

    const inventoryReceipt = await commitReadyAction(
      inventoryAction,
      inventoryReceiptRequest(inventory),
    );
    const movement = await commitReadyAction(
      inventoryAction,
      movementRequest(inventory),
    );
    const inventoryCorrection = await commitReadyAction(
      inventoryAction,
      inventoryCorrectionRequest(inventory),
    );
    const inventoryHistory = await Promise.all([
      relationQuery(
        worldA,
        inventory,
        stockPositionId,
        "inventory.receiptReference",
        afterCorrectionAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        inventory,
        stockPositionId,
        "inventory.movementReference",
        afterCorrectionAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        inventory,
        stockPositionId,
        "inventory.correctionOf",
        afterCorrectionAt,
        tenantA,
      ),
    ]);
    observe(
      "inventoryReceiptMovementAndCorrectionAreHistoricalActions",
      inventoryReceipt.receipt.commitSequence < movement.receipt.commitSequence &&
        movement.receipt.commitSequence <
          inventoryCorrection.receipt.commitSequence &&
        sameStrings(textValues(inventoryHistory[0]), ["receipt.erp.2001"]) &&
        sameStrings(textValues(inventoryHistory[1]), ["movement.putaway.2001"]) &&
        sameStrings(textValues(inventoryHistory[2]), ["receipt.erp.2001"]),
    );

    await recordInventoryIdentity(worldB, inventory, tenantB);
    await recordEvidence(worldB, {
      claimId: "claim.inventory.tenant-b-same-code",
      entityId: stockPositionId,
      fixture: inventory,
      relationId: "inventory.physicalQuantityClaim",
      sourceId: "source.erp",
      tenantId: tenantB,
      time: instant(afterCorrectionAt),
      value: { amount: "77", kind: "quantity", unit: "each" },
    });
    await recordProcurementBasis(worldB, procurement, tenantB);
    const tenantBStock = await relationQuery(
      worldB,
      inventory,
      stockPositionId,
      "inventory.physicalQuantityClaim",
      afterCorrectionAt,
      tenantB,
    );
    const crossTenantQuery = await expectConnectCode(
      () =>
        relationQuery(
          worldB,
          inventory,
          stockPositionId,
          "inventory.physicalQuantityClaim",
          afterCorrectionAt,
          tenantA,
        ),
      Code.PermissionDenied,
    );
    const tenantBPurchaseRequest = purchaseRequest(procurement, "tenant-b");
    const tenantBPurchaseProposal = await procurementActionB.propose(
      tenantBPurchaseRequest,
    );
    assert.equal(
      tenantBPurchaseProposal.proposal?.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(tenantBPurchaseProposal.proposal);
    const tenantBApproval = await supervisorActionB.approve({
      approvalId: "approval.purchase.tenant-b",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: tenantBPurchaseProposal.proposal.proposalId,
    });
    assert.equal(tenantBApproval.decision, PolicyDecision.PERMIT);
    const tenantBPurchase = await procurementActionB.commit({
      operationId: tenantBPurchaseRequest.operationId,
      proposalId: tenantBPurchaseRequest.proposalId,
    });
    const [tenantASupplier, tenantBSupplier, tenantAProduct, tenantBProduct] =
      await Promise.all([
        relationQuery(
          worldA,
          procurement,
          purchaseLineId,
          "procurement.supplierPartyReference",
          afterCorrectionAt,
          tenantA,
        ),
        relationQuery(
          worldB,
          procurement,
          purchaseLineId,
          "procurement.supplierPartyReference",
          afterCorrectionAt,
          tenantB,
        ),
        relationQuery(
          worldA,
          procurement,
          purchaseLineId,
          "procurement.productReference",
          afterCorrectionAt,
          tenantA,
        ),
        relationQuery(
          worldB,
          procurement,
          purchaseLineId,
          "procurement.productReference",
          afterCorrectionAt,
          tenantB,
        ),
      ]);
    observe(
      "sameSupplierProductAndPositionCodesStayTenantIsolated",
      sameStrings(quantityValues(tenantBStock), ["77 each"]) &&
        crossTenantQuery === Code.PermissionDenied &&
        tenantBPurchase.status === CommitStatus.COMMITTED &&
        sameStrings([...new Set(textValues(tenantASupplier))], [
          supplierPartyId,
        ]) &&
        sameStrings([...new Set(textValues(tenantBSupplier))], [
          supplierPartyId,
        ]) &&
        sameStrings([...new Set(textValues(tenantAProduct))], [productId]) &&
        sameStrings([...new Set(textValues(tenantBProduct))], [productId]) &&
        !Object.hasOwn(tenantBPurchaseRequest, "tenantId"),
    );

    const strongAvailability = await computationQuery(
      worldA,
      inventory,
      stockPositionId,
      "inventory.safeAvailability",
      afterCorrectionAt,
      tenantA,
    );
    const projection = await rebuildProjection(tenantA);
    const projectedAvailability = await semanticQuery(worldA, {
      consistency: { kind: "eventual" },
      entityId: stockPositionId,
      fixture: inventory,
      selection: { id: "inventory.safeAvailability", kind: "computation" },
      tenantId: tenantA,
      validAt: afterCorrectionAt,
    });
    observe(
      "postgresAndDataFusionAvailabilityAreEquivalent",
      projection.wroteManifest &&
        projection.projectedRows > 0 &&
        semanticShape(strongAvailability) ===
          semanticShape(projectedAvailability),
    );

    const finalRestartPid = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const restartedWorld = worldClient(inventoryAToken);
    const restartedHistory = historyClient(procurementAToken);
    const availabilityAfterRestart = await computationQuery(
      restartedWorld,
      inventory,
      stockPositionId,
      "inventory.safeAvailability",
      afterCorrectionAt,
      tenantA,
    );
    const projectedAfterRestart = await semanticQuery(restartedWorld, {
      consistency: { kind: "eventual" },
      entityId: stockPositionId,
      fixture: inventory,
      selection: { id: "inventory.safeAvailability", kind: "computation" },
      tenantId: tenantA,
      validAt: afterCorrectionAt,
    });
    const purchaseAfterRestart = await explainOperation(
      restartedHistory,
      purchaseCommit.receipt.operationId,
    );
    observe(
      "restartPreservesAvailabilityProjectionLineageAndPurchaseExplanation",
      finalRestartPid !== server.child.pid &&
        semanticShape(availabilityAfterRestart) ===
          semanticShape(projectedAfterRestart) &&
        explanationShape(purchaseAfterRestart) ===
          purchaseExplanationBeforeFinalRestart,
    );

    const cleanLeakage = await runLeakageGate();
    const mutantLeakage = await runLeakageMutant();
    observe(
      "genericRustContainsNoInventoryOrProcurementDispatch",
      cleanLeakage.code === 0 &&
        JSON.parse(cleanLeakage.stdout).findings.length === 0,
    );
    observe(
      "knownInventoryActionBranchMutantIsKilled",
      mutantLeakage.code !== 0 &&
        /inventory\.reserveInventory/u.test(mutantLeakage.stderr),
    );

    const coreTree = await command("cargo", [
      "tree",
      "--package",
      "zoen-core",
      "--depth",
      "1",
    ]);
    observe(
      "zoenCoreStillHasNoIoOrWasmtimeDependencies",
      coreTree.split("\n").filter(Boolean).length === 1,
    );
    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./u);
    const keycloakVersion = await command("docker", [
      "compose",
      "--project-name",
      "zoen-domain-inventory-procurement",
      "--file",
      "e2e/domain-inventory-procurement/compose.yaml",
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    ]);
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/u);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      architectureDeviations: [],
      assertions,
      componentVersions: {
        datafusion: "embedded zoen-query",
        keycloak: keycloakVersion.split("\n")[0],
        minio: "S3-compatible projection store",
        postgres: postgresVersion,
        restate: "1.7.2",
      },
      definitions: Object.fromEntries(
        fixtures.map((fixture) => [
          fixture.packageName,
          definitionEvidence(fixture),
        ]),
      ),
      failureInjections,
      finishedAt: new Date().toISOString(),
      operations: {
        commercialCommitment: commercialCommitment.receipt.operationId,
        inventoryCorrection: inventoryCorrection.receipt.operationId,
        inventoryReceipt: inventoryReceipt.receipt.operationId,
        movement: movement.receipt.operationId,
        partialReceipt: partialReceipt.receipt.operationId,
        purchase: purchaseCommit.receipt.operationId,
        purchaseCancellation: cancellation.receipt.operationId,
        purchaseCorrection: corrected.receipt.operationId,
        purchaseReturn: returned.receipt.operationId,
        reservation: reserved.receipt.operationId,
        supplierRequest: supplierRequest.receipt.operationId,
      },
      projection: {
        manifestDigest: projection.manifestDigest,
        parquetDigest: projection.parquetDigest,
        projectedRows: projection.projectedRows,
        throughCommit: projection.throughCommit,
      },
      scenario,
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await writeScenarioArtifact(repositoryRoot, scenario, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    for (const managedProcess of processes.reverse()) {
      if (
        managedProcess.child.exitCode === null &&
        managedProcess.child.signalCode === null
      ) {
        await stopProcess(managedProcess);
      }
    }
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
  }
}

function requireFixture(
  fixtures: Record<string, DomainFixture>,
  packageName: DomainFixture["packageName"],
): DomainFixture {
  const fixture = fixtures[packageName];
  if (fixture === undefined) {
    throw new Error(`missing ${packageName} fixture`);
  }
  return fixture;
}

async function recordSharedPartyAndProduct(
  client: ReturnType<typeof worldClient>,
  party: DomainFixture,
  product: DomainFixture,
  tenantId: string,
): Promise<void> {
  await Promise.all([
    recordEvidence(client, {
      claimId: "claim.party.supplier-external-id",
      entityId: supplierPartyId,
      fixture: party,
      relationId: "party.externalIdentifier",
      sourceId: "source.party-master",
      tenantId,
      time: instant(lifecycleAt),
      value: { kind: "text", value: "supplier:ACME" },
    }),
    recordEvidence(client, {
      claimId: "claim.party.supplier-role",
      entityId: supplierPartyId,
      fixture: party,
      relationId: "party.role",
      sourceId: "source.party-governance",
      tenantId,
      time: instant(lifecycleAt),
      value: { kind: "text", value: "supplier" },
    }),
    recordEvidence(client, {
      claimId: "claim.product.external-id",
      entityId: productId,
      fixture: product,
      relationId: "product.externalIdentifier",
      sourceId: "source.product-catalog",
      tenantId,
      time: instant(lifecycleAt),
      value: { kind: "text", value: "sku:WIDGET-PRO" },
    }),
  ]);
}

async function recordInventoryIdentity(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  tenantId: string,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.inventory.product-reference",
      relationId: "inventory.productReference",
      value: { kind: "text", value: productId },
    },
    {
      claimId: "claim.inventory.owner-reference",
      relationId: "inventory.ownershipPartyReference",
      value: { kind: "text", value: "party.organization.tenant-owner" },
    },
    {
      claimId: "claim.inventory.custodian-reference",
      relationId: "inventory.custodyPartyReference",
      value: { kind: "text", value: "party.organization.warehouse-operator" },
    },
    {
      claimId: "claim.inventory.location",
      relationId: "inventory.location",
      value: { kind: "entity-ref", value: "inventory.location.wh-1" },
    },
    {
      claimId: "claim.inventory.lot",
      relationId: "inventory.lot",
      value: { kind: "entity-ref", value: "inventory.lot.L-2001" },
    },
    {
      claimId: "claim.inventory.serial",
      relationId: "inventory.serialUnit",
      value: { kind: "entity-ref", value: "inventory.serial.S-2001" },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      entityId: stockPositionId,
      fixture,
      sourceId: "source.inventory-master",
      tenantId,
      time: instant(afterCorrectionAt),
    });
  }
}

async function recordProcurementBasis(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  tenantId: string,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly sourceId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.procurement.requirement-reference",
      relationId: "procurement.requirementReference",
      sourceId: "source.inventory-shortage",
      value: { kind: "text", value: "requirement.inventory.2001" },
    },
    {
      claimId: "claim.procurement.requirement-revision",
      relationId: "procurement.requirementRevision",
      sourceId: "source.inventory-shortage",
      value: { kind: "integer", value: "1" },
    },
    {
      claimId: "claim.procurement.required-quantity",
      relationId: "procurement.requiredQuantity",
      sourceId: "source.inventory-shortage",
      value: { amount: "2", kind: "quantity", unit: "each" },
    },
    {
      claimId: "claim.procurement.supplier-party",
      relationId: "procurement.supplierPartyReference",
      sourceId: "source.supplier-master",
      value: { kind: "text", value: supplierPartyId },
    },
    {
      claimId: "claim.procurement.supplier-terms",
      relationId: "procurement.supplierTermsReference",
      sourceId: "source.supplier-master",
      value: { kind: "text", value: "terms.net-30" },
    },
    {
      claimId: "claim.procurement.supplier-terms-revision",
      relationId: "procurement.supplierTermsRevision",
      sourceId: "source.supplier-master",
      value: { kind: "integer", value: "1" },
    },
    {
      claimId: "claim.procurement.product-reference",
      relationId: "procurement.productReference",
      sourceId: "source.product-catalog",
      value: { kind: "text", value: productId },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      entityId: purchaseLineId,
      fixture,
      tenantId,
      time: instant(afterCorrectionAt),
    });
  }
}

function commercialCommitmentRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "commercial.createCommitment",
    fixture,
    inputs: [
      {
        id: "commitmentReference",
        value: { kind: "text", value: "commitment.order-2001" },
      },
      {
        id: "quantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
      { id: "revision", value: { kind: "integer", value: "1" } },
      { id: "terms", value: { kind: "text", value: "net-30" } },
      { id: "unitPrice", value: { kind: "decimal", value: "19.99" } },
    ],
    resourceId: orderLineId,
    suffix: "customer-commitment",
    validAt: lifecycleAt,
  });
}

function reservationRequest(
  fixture: DomainFixture,
  suffix: string,
  validAt: Date,
) {
  return proposalRequest({
    actionId: "inventory.reserveInventory",
    fixture,
    inputs: [
      {
        id: "allocationReference",
        value: { kind: "text", value: "allocation.order-2001" },
      },
      {
        id: "commitmentReference",
        value: { kind: "text", value: "commitment.order-2001" },
      },
      {
        id: "quantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "reservationReference",
        value: { kind: "text", value: "reservation.order-2001" },
      },
    ],
    resourceId: stockPositionId,
    suffix,
    validAt,
  });
}

function supplierRequestAction(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "procurement.requestSupplier",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "2", kind: "quantity", unit: "each" },
      },
      {
        id: "supplierRequestReference",
        value: { kind: "text", value: "supplier-request.2001" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: "supplier-request",
    validAt: afterCorrectionAt,
  });
}

function purchaseRequest(fixture: DomainFixture, suffix: string) {
  return proposalRequest({
    actionId: "procurement.governPurchase",
    fixture,
    inputs: [
      {
        id: "expectedDate",
        value: { kind: "text", value: "2026-09-01" },
      },
      {
        id: "productReference",
        value: { kind: "text", value: productId },
      },
      {
        id: "purchaseCommitmentReference",
        value: { kind: "text", value: "purchase.2001" },
      },
      {
        id: "quantity",
        value: { amount: "2", kind: "quantity", unit: "each" },
      },
      {
        id: "requirementReference",
        value: { kind: "text", value: "requirement.inventory.2001" },
      },
      {
        id: "supplierPartyReference",
        value: { kind: "text", value: supplierPartyId },
      },
      {
        id: "supplierTermsReference",
        value: { kind: "text", value: "terms.net-30" },
      },
      {
        id: "unitPrice",
        value: { kind: "decimal", value: "18.5" },
      },
    ],
    resourceId: purchaseLineId,
    suffix,
    validAt: afterCorrectionAt,
  });
}

function partialReceiptRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "procurement.recordPartialReceipt",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "1", kind: "quantity", unit: "each" },
      },
      {
        id: "receiptReference",
        value: { kind: "text", value: "receipt.erp.2001" },
      },
      {
        id: "sourceReference",
        value: { kind: "text", value: "erp-receipt:GRN-2001" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: "partial-receipt",
    validAt: afterCorrectionAt,
  });
}

function cancellationRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "procurement.cancelRemaining",
    fixture,
    inputs: [
      {
        id: "cancellationReference",
        value: { kind: "text", value: "cancellation.purchase.2001" },
      },
      {
        id: "quantity",
        value: { amount: "1", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: "cancel-remaining",
    validAt: afterCorrectionAt,
  });
}

function returnRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "procurement.recordReturn",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "0.25", kind: "quantity", unit: "each" },
      },
      {
        id: "returnReference",
        value: { kind: "text", value: "return.purchase.2001" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: "return-partial",
    validAt: afterCorrectionAt,
  });
}

function correctionRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "procurement.correctReceipt",
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: { kind: "text", value: "receipt.erp.2001" },
      },
      {
        id: "quantity",
        value: { amount: "0.75", kind: "quantity", unit: "each" },
      },
      {
        id: "reason",
        value: { kind: "text", value: "return-adjusted accepted receipt" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: "correct-receipt",
    validAt: afterCorrectionAt,
  });
}

function inventoryReceiptRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "inventory.recordReceipt",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "0.75", kind: "quantity", unit: "each" },
      },
      {
        id: "receiptReference",
        value: { kind: "text", value: "receipt.erp.2001" },
      },
    ],
    resourceId: stockPositionId,
    suffix: "receipt",
    validAt: afterCorrectionAt,
  });
}

function movementRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "inventory.recordMovement",
    fixture,
    inputs: [
      { id: "direction", value: { kind: "text", value: "putaway" } },
      {
        id: "movementReference",
        value: { kind: "text", value: "movement.putaway.2001" },
      },
      {
        id: "quantity",
        value: { amount: "0.75", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: stockPositionId,
    suffix: "movement",
    validAt: afterCorrectionAt,
  });
}

function inventoryCorrectionRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "inventory.correctInventory",
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: { kind: "text", value: "receipt.erp.2001" },
      },
      {
        id: "quantity",
        value: { amount: "0.75", kind: "quantity", unit: "each" },
      },
      {
        id: "reason",
        value: { kind: "text", value: "return-adjusted putaway quantity" },
      },
    ],
    resourceId: stockPositionId,
    suffix: "correction",
    validAt: afterCorrectionAt,
  });
}

async function commitReadyAction(
  client: ActionClient,
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
  return { proposal: proposed.proposal, receipt: committed.receipt };
}

function relationQuery(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  entityId: string,
  relationId: string,
  validAt: Date,
  tenantId: string,
) {
  return semanticQuery(client, {
    entityId,
    fixture,
    selection: { id: relationId, kind: "relation" },
    tenantId,
    validAt,
  });
}

function computationQuery(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  entityId: string,
  computationId: string,
  validAt: Date,
  tenantId: string,
) {
  return semanticQuery(client, {
    entityId,
    fixture,
    selection: { id: computationId, kind: "computation" },
    tenantId,
    validAt,
  });
}

function textValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "text" ? [value.value] : [],
  );
}

function quantityValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "quantity" ? [`${value.amount} ${value.unit}`] : [],
  );
}

function hasSource(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  sourceId: string,
): boolean {
  return response.values.some((value) =>
    value.dependencies.some((dependency) => dependency.sourceId === sourceId),
  );
}

function hasRelation(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  relationId: string,
): boolean {
  return response.values.some((value) =>
    value.dependencies.some(
      (dependency) => dependency.relationId === relationId,
    ),
  );
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

function definitionEvidence(fixture: DomainFixture) {
  return {
    definitionId: fixture.definition.definitionId,
    digest: fixture.digest,
    revision: fixture.definition.revision.toString(),
  };
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
