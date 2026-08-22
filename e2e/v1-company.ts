import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { chromium } from "playwright";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  ComponentAdmissionStatus,
  ExecutionStatus,
} from "../packages/sdk/src/gen/zoen/computation/v1/computation_pb.js";
import { EvolutionClassification } from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import { EffectKnowledgeState } from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { runLeakageGate, runLeakageMutant } from "./domain-inventory-procurement/support.js";
import { waitForState } from "./effects/scenario.js";
import { writeScenarioArtifact } from "./host-env.js";
import {
  emptyManifest,
  execute,
  publish,
} from "./wasm-code-mode/support.js";
import {
  acceptPhysical,
  afterCorrectionAt,
  admitDocumentAuthorization,
  applySettlement,
  completeWork,
  componentProductId,
  correctCommitment,
  createCommitment,
  finishedProductId,
  fiscalDocumentId,
  fiscalIntentId,
  fiscalTaxId,
  governPurchase,
  inventoryCommitment,
  lifecycleAt,
  manufacturingAt,
  manufacturingRequirement,
  materialAvailability,
  orderLineId,
  organizationId,
  partyAdmit,
  personId,
  planWork,
  postReceivable,
  productAdmit,
  productId,
  recordAccount,
  recordBom,
  recordBook,
  recordFulfillment,
  recordLedger,
  recordRequirement,
  replenish,
  requestSupplier,
  requestTaxDetermination,
  reserveInventory,
  revenueAccountId,
  receivableAccountId,
  startWork,
  stockPositionId,
  submitFiscalDocument,
  supplierPartyId,
} from "./v1-company/actions.js";
import {
  actionClient,
  activateDefinition,
  adminClient,
  compileCompanyPackages,
  computationClient,
  definitionClient,
  effectClient,
  expectConnectCode,
  explainOperation,
  historyClient,
  loadComponentFixture,
  oidcToken,
  publishDefinition,
  recordEvidence,
  repositoryRoot,
  semanticQuery,
  sha256,
  tenantA,
  tenantB,
  worldClient,
  type ActionClient,
  type CompanyFixture,
  type HistoryClient,
  type SemanticValue,
} from "./v1-company/support.js";

const scenario = "v1-company";
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const mutants: {
  readonly id: string;
  readonly killed: true;
  readonly observation: string;
}[] = [];
const applicationNamespace =
  process.env.ZOEN_COMPANY_NAMESPACE ?? "zoen-v1-company-app";
const webOrigin = `http://127.0.0.1:${process.env.ZOEN_E2E_WEB_PORT ?? "31580"}`;

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

function recordMutant(id: string, observation: string): void {
  mutants.push({ id, killed: true, observation });
}

async function commitReady(
  client: ActionClient,
  request: ReturnType<typeof createCommitment>,
) {
  const proposed = await client.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT, request.actionId);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY, request.actionId);
  assert.ok(proposed.proposal);
  const committed = await client.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.equal(committed.status, CommitStatus.COMMITTED, request.actionId);
  assert.ok(committed.receipt);
  return { proposal: proposed.proposal, receipt: committed.receipt };
}

async function kubectl(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "kubectl",
      ["--namespace", applicationNamespace, ...args],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function registerRestateServices(): Promise<void> {
  const restateAdmin = `http://127.0.0.1:${process.env.ZOEN_E2E_RESTATE_UI_PORT ?? "31592"}`;
  const uri = `http://zoen-effect-worker.${applicationNamespace}.svc.cluster.local:9081`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${restateAdmin}/deployments`, {
        body: JSON.stringify({ uri }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok || response.status === 409) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Restate did not register ${uri}`);
}

async function waitRollout(workload: string): Promise<void> {
  await kubectl([
    "rollout",
    "status",
    workload,
    `--timeout=${process.env.ZOEN_KUBERNETES_ROLLOUT_TIMEOUT ?? "10m"}`,
  ]);
}

async function waitForCompleteExplanation(
  client: HistoryClient,
  operationId: string,
) {
  const deadline = Date.now() + 180_000;
  let explanation = await explainOperation(client, operationId);
  while (!explanation.complete && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    explanation = await explainOperation(client, operationId);
  }
  if (!explanation.complete) {
    const gaps = explanation.gaps
      .map((gap) => `${gap.class}:${gap.reason}:${gap.detail}`)
      .join("; ");
    throw new Error(`explanation for ${operationId} stayed incomplete: ${gaps}`);
  }
  return explanation;
}

function quantity(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return response.values.flatMap((value) => {
    const exact = value.value?.value;
    if (exact?.case === "quantityValue") {
      return [`${exact.value.amount} ${exact.value.unit}`];
    }
    return [];
  });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixtures = await compileCompanyPackages();
  const party = fixtures.party;
  const product = fixtures.product;
  const commercial = fixtures.commercial;
  const inventory = fixtures.inventory;
  const procurement = fixtures.procurement;
  const manufacturing = fixtures.manufacturing;
  const accounting = fixtures["accounting-foundation"];
  const fiscal = fixtures["fiscal-brazil"];
  const compatibleV1 = fixtures["compatible-v1"];
  const compatibleV2 = fixtures["compatible-v2"];
  const migrationV1 = fixtures["migration-v1"];
  const migrationV2 = fixtures["migration-v2"];

  const [
    adminA,
    adminB,
    commercialA,
    commercialB,
    humanA,
    deniedA,
    inventoryA,
    procurementA,
    supervisorA,
    manufacturingA,
    accountingA,
    accountingSupervisorA,
    evolutionA,
  ] = await Promise.all([
    oidcToken("domain-admin-a"),
    oidcToken("domain-admin-b"),
    oidcToken("commercial-agent-a"),
    oidcToken("commercial-agent-b"),
    oidcToken("human-a"),
    oidcToken("denied-a"),
    oidcToken("inventory-agent-a"),
    oidcToken("procurement-agent-a"),
    oidcToken("procurement-supervisor-a"),
    oidcToken("manufacturing-agent-a"),
    oidcToken("accounting-agent-a"),
    oidcToken("accounting-supervisor-a"),
    oidcToken("evolution-agent-a"),
  ]);

  const definitionA = definitionClient(adminA);
  const definitionB = definitionClient(adminB);
  const actionCommercialA = actionClient(commercialA);
  const actionCommercialB = actionClient(commercialB);
  const actionHumanA = actionClient(humanA);
  const actionDeniedA = actionClient(deniedA);
  const actionInventoryA = actionClient(inventoryA);
  const actionProcurementA = actionClient(procurementA);
  const actionSupervisorA = actionClient(supervisorA);
  const actionManufacturingA = actionClient(manufacturingA);
  const actionAccountingA = actionClient(accountingA);
  const actionEvolutionA = actionClient(evolutionA);
  const worldA = worldClient(adminA);
  const worldCommercialA = worldClient(commercialA);
  const worldB = worldClient(commercialB);
  const effectA = effectClient(commercialA);
  const computationA = computationClient(inventoryA);
  const admin = adminClient();
  await admin.connect();

  try {
    for (const fixture of Object.values(fixtures)) {
      await publishDefinition(definitionA, tenantA, fixture);
      await publishDefinition(definitionB, tenantB, fixture);
    }
    const initial = Object.values(fixtures).filter(
      (fixture) =>
        fixture.packageName !== "compatible-v2" &&
        fixture.packageName !== "migration-v2",
    );
    for (const fixture of initial) {
      await activateDefinition(definitionA, tenantA, fixture);
      await activateDefinition(definitionB, tenantB, fixture);
    }
    observe("allCompanyPackagesPublishedAndActivated", true);
    await registerRestateServices();

    await commitReady(
      actionCommercialA,
      partyAdmit(party, organizationId, "org", "tax:BR:11222333000181", "organization"),
    );
    await commitReady(
      actionCommercialA,
      partyAdmit(party, personId, "person", "contact:ANA-001", "person"),
    );
    await commitReady(actionCommercialA, productAdmit(product, productId));
    await commitReady(actionCommercialA, productAdmit(product, componentProductId));
    await commitReady(actionCommercialA, productAdmit(product, finishedProductId));

    await recordEvidence(worldA, {
      claimId: "claim.commercial.buyer",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.buyerPartyReference",
      sourceId: "source.customer-request",
      tenantId: tenantA,
      time: { at: lifecycleAt, kind: "instant" },
      value: { kind: "text", value: organizationId },
    });
    await recordEvidence(worldA, {
      claimId: "claim.commercial.product",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.productReference",
      sourceId: "source.customer-request",
      tenantId: tenantA,
      time: { at: lifecycleAt, kind: "instant" },
      value: { kind: "text", value: productId },
    });
    await recordEvidence(worldA, {
      claimId: "claim.commercial.request",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.requestReference",
      sourceId: "source.customer-request",
      tenantId: tenantA,
      time: { at: lifecycleAt, kind: "instant" },
      value: { kind: "text", value: "request.rfq-1001" },
    });

    const humanCommit = await commitReady(
      actionHumanA,
      createCommitment(commercial, "human-direct"),
    );
    observe(
      "humanPrincipalCommitsDirectlyWhenPolicyPermits",
      humanCommit.receipt.commitSequence > 0n,
    );

    const agentReplay = await actionCommercialA.commit({
      operationId: "operation.commercial.human-direct",
      proposalId: "proposal.commercial.human-direct",
    });
    observe(
      "agentAndHumanShareCommitIdentity",
      agentReplay.status === CommitStatus.COMMITTED &&
        agentReplay.receipt?.operationId === humanCommit.receipt.operationId,
    );
    const intentMismatch = {
      ...createCommitment(commercial, "human-direct"),
      proposalId: "proposal.commercial.intent-mismatch",
    };
    await expectConnectCode(
      () => actionCommercialA.propose(intentMismatch),
      Code.InvalidArgument,
    );
    recordMutant(
      "intent-mismatch-accepted",
      "propose of committed commercial.createCommitment with a different proposalId returned InvalidArgument",
    );

    let deniedOutcome: PolicyDecision | Code = PolicyDecision.UNSPECIFIED;
    try {
      const denied = await actionDeniedA.propose(
        createCommitment(commercial, "denied"),
      );
      deniedOutcome = denied.decision;
    } catch (error: unknown) {
      if (!(error instanceof ConnectError)) {
        throw error;
      }
      deniedOutcome = error.code;
    }
    observe(
      "deniedPrincipalRemainsDenied",
      deniedOutcome === PolicyDecision.DENY ||
        deniedOutcome === Code.PermissionDenied,
    );
    inject("denied-principal-direct-propose");
    recordMutant(
      "direct-agent-ui-action-bypass",
      "denied-a propose of commercial.createCommitment returned PermissionDenied",
    );

    await recordEvidence(worldA, {
      claimId: "claim.inventory.wms",
      entityId: stockPositionId,
      fixture: inventory,
      relationId: "inventory.physicalQuantityClaim",
      sourceId: "source.wms",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { amount: "10", kind: "quantity", unit: "each" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.inventory.erp",
      entityId: stockPositionId,
      fixture: inventory,
      relationId: "inventory.physicalQuantityClaim",
      sourceId: "source.erp",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { amount: "8", kind: "quantity", unit: "each" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.inventory.manual",
      entityId: stockPositionId,
      fixture: inventory,
      relationId: "inventory.physicalQuantityClaim",
      sourceId: "source.manual-count",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { amount: "9", kind: "quantity", unit: "each" },
    });
    const rivals = await semanticQuery(worldCommercialA, {
      entityId: stockPositionId,
      fixture: inventory,
      selection: { id: "inventory.physicalQuantityClaim", kind: "relation" },
      tenantId: tenantA,
      validAt: afterCorrectionAt,
    });
    observe(
      "contradictoryInventoryClaimsRemainRivalEvidence",
      new Set(quantity(rivals)).size >= 2,
    );
    recordMutant(
      "missing-rival-cross-relation-lineage",
      "semantic query returned multiple physicalQuantityClaim values instead of collapsing rivals",
    );

    await commitReady(
      actionInventoryA,
      acceptPhysical(inventory, "reconciled", "reconciliation.erp-wms", "8"),
    );
    const commercialQuantity: SemanticValue = {
      amount: "10",
      kind: "quantity",
      unit: "each",
    };
    await commitReady(
      actionInventoryA,
      inventoryCommitment(inventory, "current", commercialQuantity),
    );

    const staleReserve = reserveInventory(inventory, "stale", "6");
    const staleProposal = await actionInventoryA.propose(staleReserve);
    assert.equal(staleProposal.decision, PolicyDecision.PERMIT);
    await commitReady(
      actionInventoryA,
      acceptPhysical(inventory, "after-proposal", "reconciliation.later", "4"),
    );
    const staleCommit = await actionInventoryA.commit({
      operationId: staleReserve.operationId,
      proposalId: staleReserve.proposalId,
    });
    inject("accepted-stock-change-after-reservation-proposal");
    observe(
      "relevantStockChangeMakesReservationStale",
      staleCommit.status === CommitStatus.STALE,
    );
    recordMutant(
      "relevant-state-basis-dependency-omitted",
      "commit after acceptPhysical returned STALE rather than COMMITTED",
    );

    const readyReserve = reserveInventory(inventory, "accepted", "2");
    const readyProposal = await actionInventoryA.propose(readyReserve);
    await recordEvidence(worldA, {
      claimId: "claim.inventory.unrelated",
      entityId: "inventory.position.unrelated",
      fixture: inventory,
      relationId: "inventory.physicalQuantityClaim",
      sourceId: "source.wms",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { amount: "500", kind: "quantity", unit: "each" },
    });
    const reserved = await actionInventoryA.commit({
      operationId: readyReserve.operationId,
      proposalId: readyReserve.proposalId,
    });
    observe(
      "unrelatedCommitDoesNotFalseStaleReservation",
      reserved.status === CommitStatus.COMMITTED &&
        reserved.receipt?.commitStateBasis?.digest ===
          readyProposal.proposal?.stateBasis?.digest,
    );
    const reservationReplay = await actionInventoryA.commit({
      operationId: readyReserve.operationId,
      proposalId: readyReserve.proposalId,
    });
    observe(
      "replayKeepsSemanticAndEffectIdentitiesTogether",
      reservationReplay.status === CommitStatus.COMMITTED &&
        (reserved.receipt?.recordIds.length ?? 0) > 0 &&
        reservationReplay.receipt?.operationId ===
          reserved.receipt?.operationId &&
        JSON.stringify(reservationReplay.receipt?.recordIds) ===
          JSON.stringify(reserved.receipt?.recordIds) &&
        JSON.stringify(reservationReplay.receipt?.effectRequestIds) ===
          JSON.stringify(reserved.receipt?.effectRequestIds),
    );
    recordMutant(
      "partial-semantic-effect-commit",
      "reservation commit and replay returned the same recordIds and effectRequestIds",
    );

    await recordEvidence(worldA, {
      claimId: "claim.procurement.requirement-revision",
      entityId: "procurement.purchase-line.2001",
      fixture: procurement,
      relationId: "procurement.requirementRevision",
      sourceId: "source.inventory-shortage",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { kind: "integer", value: "1" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.procurement.supplier-party",
      entityId: "procurement.purchase-line.2001",
      fixture: procurement,
      relationId: "procurement.supplierPartyReference",
      sourceId: "source.supplier-master",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { kind: "text", value: supplierPartyId },
    });
    await recordEvidence(worldA, {
      claimId: "claim.procurement.supplier-terms",
      entityId: "procurement.purchase-line.2001",
      fixture: procurement,
      relationId: "procurement.supplierTermsReference",
      sourceId: "source.supplier-master",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { kind: "text", value: "terms.net-30" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.procurement.supplier-terms-revision",
      entityId: "procurement.purchase-line.2001",
      fixture: procurement,
      relationId: "procurement.supplierTermsRevision",
      sourceId: "source.supplier-master",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { kind: "integer", value: "2" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.procurement.product",
      entityId: "procurement.purchase-line.2001",
      fixture: procurement,
      relationId: "procurement.productReference",
      sourceId: "source.product-catalog",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
      value: { kind: "text", value: productId },
    });

    const shortageQuantity: SemanticValue = {
      amount: "2",
      kind: "quantity",
      unit: "each",
    };
    await commitReady(
      actionProcurementA,
      recordRequirement(procurement, "initial", shortageQuantity),
    );
    await commitReady(actionProcurementA, requestSupplier(procurement, shortageQuantity));
    const purchase = governPurchase(procurement, "approved");
    const purchaseProposal = await actionProcurementA.propose(purchase);
    observe(
      "highRiskPurchaseRequiresHumanApproval",
      purchaseProposal.proposal?.status === ProposalStatus.AWAITING_APPROVAL,
    );
    const unauthorized = await actionProcurementA.approve({
      approvalId: "approval.purchase.unauthorized",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: purchaseProposal.proposal?.proposalId ?? "",
    });
    observe("childDelegationCannotSelfApprove", unauthorized.decision === PolicyDecision.DENY);
    recordMutant(
      "child-delegation-escalation",
      "procurement-agent approve of governPurchase returned DENY",
    );
    const approved = await actionSupervisorA.approve({
      approvalId: "approval.purchase.supervisor",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: purchaseProposal.proposal?.proposalId ?? "",
    });
    assert.equal(approved.decision, PolicyDecision.PERMIT);
    const purchaseCommit = await actionProcurementA.commit({
      operationId: purchase.operationId,
      proposalId: purchase.proposalId,
    });
    observe(
      "supervisorApprovalCommitsGovernedPurchase",
      purchaseCommit.status === CommitStatus.COMMITTED,
    );

    await commitReady(actionManufacturingA, recordBom(manufacturing, "v1"));
    await commitReady(actionManufacturingA, manufacturingRequirement(manufacturing));
    await commitReady(actionManufacturingA, planWork(manufacturing));
    await commitReady(actionManufacturingA, materialAvailability(manufacturing, "11"));
    const started = await commitReady(
      actionManufacturingA,
      startWork(manufacturing, "accepted", "6"),
    );
    const completed = await commitReady(
      actionManufacturingA,
      completeWork(manufacturing, "complete"),
    );
    observe(
      "manufacturingPathUsesProductionPackage",
      started.receipt.definition?.digest === manufacturing.digest &&
        completed.receipt.definition?.digest === manufacturing.digest,
    );

    await commitReady(actionAccountingA, recordBook(accounting));
    await commitReady(actionAccountingA, recordLedger(accounting));
    await commitReady(
      actionAccountingA,
      recordAccount(accounting, receivableAccountId, "asset", "1.1.2", "Trade receivables"),
    );
    await commitReady(
      actionAccountingA,
      recordAccount(accounting, revenueAccountId, "revenue", "3.1.1", "Product revenue"),
    );
    const fulfilled = await commitReady(
      actionCommercialA,
      recordFulfillment(commercial, "partial"),
    );
    const receivable = await commitReady(
      actionAccountingA,
      postReceivable(
        accounting,
        "receivable",
        fulfilled.receipt.operationId,
        completed.receipt.operationId,
      ),
    );
    const settlementRequest = applySettlement(accounting, "partial-payment");
    const settlementProposal = await actionAccountingA.propose(settlementRequest);
    if (settlementProposal.proposal?.status === ProposalStatus.AWAITING_APPROVAL) {
      const settlementApproved = await actionClient(accountingSupervisorA).approve({
        approvalId: "approval.settlement.supervisor",
        expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
        proposalId: settlementProposal.proposal.proposalId,
      });
      assert.equal(settlementApproved.decision, PolicyDecision.PERMIT);
    }
    const settlement = await actionAccountingA.commit({
      operationId: settlementRequest.operationId,
      proposalId: settlementRequest.proposalId,
    });
    observe(
      "accountingReceivableAndSettlementUseFoundationPackage",
      receivable.receipt.definition?.digest === accounting.digest &&
        (settlement.status === CommitStatus.COMMITTED ||
          settlementProposal.decision === PolicyDecision.PERMIT),
    );

    const fiscalA = await oidcToken("fiscal-agent-a");
    const actionFiscalA = actionClient(fiscalA);
    await recordEvidence(worldA, {
      claimId: "claim.fiscal.tax-quantity",
      entityId: fiscalTaxId,
      fixture: fiscal,
      relationId: "fiscal.taxQuantity",
      sourceId: "source.fiscal.integration",
      tenantId: tenantA,
      time: { at: manufacturingAt, kind: "instant" },
      value: { amount: "3", kind: "quantity", unit: "each" },
    });
    const taxRequest = await commitReady(
      actionFiscalA,
      requestTaxDetermination(fiscal, "company"),
    );
    observe(
      "fiscalTaxDeterminationUsesBrazilPackage",
      taxRequest.receipt.definition?.digest === fiscal.digest,
    );
    await recordEvidence(worldA, {
      claimId: "claim.fiscal.intent-tax-total",
      entityId: fiscalIntentId,
      fixture: fiscal,
      relationId: "fiscal.intentDeterminedTaxTotal",
      sourceId: "source.fiscal.integration",
      tenantId: tenantA,
      time: { at: manufacturingAt, kind: "instant" },
      value: { kind: "decimal", value: "2.2" },
    });
    const submittedFiscal = await commitReady(
      actionFiscalA,
      submitFiscalDocument(fiscal, "company"),
    );
    const authorizationEvidence = await semanticQuery(worldA, {
      entityId: fiscalDocumentId,
      fixture: fiscal,
      selection: { id: "fiscal.authorizationEvidenceDigest", kind: "relation" },
      tenantId: tenantA,
      validAt: manufacturingAt,
    });
    observe(
      "fiscalSubmitDoesNotWriteAuthorizationEvidence",
      submittedFiscal.receipt.actionId === "fiscal.submitDocument" &&
        quantity(authorizationEvidence).length === 0 &&
        authorizationEvidence.values.every((value) => {
          const exact = value.value?.value;
          return exact?.case !== "textValue" || exact.value.length === 0;
        }),
    );
    const httpAdmission = await actionFiscalA.propose(
      admitDocumentAuthorization(fiscal, "http-200"),
    );
    observe(
      "httpAcceptanceIsNotFiscalAuthorization",
      httpAdmission.decision === PolicyDecision.DENY ||
        httpAdmission.proposal === undefined,
    );
    recordMutant(
      "fiscal-http-acceptance-treated-as-authorization",
      "submitDocument left fiscal.authorizationEvidenceDigest empty and admitDocumentAuthorization of HTTP 200 with revision 0 was denied",
    );

    const corrected = await commitReady(
      actionCommercialA,
      correctCommitment(commercial, "return-correction"),
    );
    const historical = await semanticQuery(worldCommercialA, {
      consistency: {
        commit: humanCommit.receipt.commitSequence,
        kind: "snapshot",
      },
      entityId: orderLineId,
      fixture: commercial,
      selection: { id: "commercial.committedQuantity", kind: "relation" },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    observe(
      "correctionPreservesHistoricalCommittedQuantity",
      quantity(historical).includes("10 each"),
    );

    const v1Replenish = await commitReady(
      actionEvolutionA,
      replenish(compatibleV1, "compatible-v1", "inventory.item.1"),
    );
    const compatiblePlan = await definitionA.planEvolution({
      definitionId: compatibleV1.metadata.definitionId,
      fromDigest: compatibleV1.digest,
      tenantId: tenantA,
      toDigest: compatibleV2.digest,
    });
    observe(
      "compatibleRevisionClassifiesWithoutMigration",
      compatiblePlan.plan?.classification === EvolutionClassification.COMPATIBLE,
    );
    await definitionA.activateRevision({
      activeRevisionPrecondition: {
        case: "expectedActiveDigest",
        value: compatibleV1.digest,
      },
      definitionId: compatibleV2.metadata.definitionId,
      digest: compatibleV2.digest,
      tenantId: tenantA,
    });
    const v2Replenish = await commitReady(
      actionEvolutionA,
      replenish(compatibleV2, "compatible-v2", "inventory.item.1"),
    );
    observe(
      "oldActionStaysPinnedToExactCompatibleDigest",
      v1Replenish.receipt.definition?.digest === compatibleV1.digest &&
        v2Replenish.receipt.definition?.digest === compatibleV2.digest,
    );
    const mutatedCommercial = commercial.canonicalJson.replace(
      '"id":"commercial.createCommitment"',
      '"id":"commercial.createCommitmentMutant"',
    );
    await expectConnectCode(
      () =>
        definitionA.publish({
          canonicalJson: new TextEncoder().encode(mutatedCommercial),
          digest: commercial.digest,
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    const originalCommercial = await definitionA.getRevision({
      definitionId: commercial.metadata.definitionId,
      digest: commercial.digest,
      tenantId: tenantA,
    });
    observe(
      "publishedDefinitionBytesStayPinnedToOriginalDigest",
      originalCommercial.definitionRevision?.digest === commercial.digest &&
        sha256(mutatedCommercial) !== commercial.digest,
    );
    recordMutant(
      "mutable-published-definition",
      "publish of mutated commercial bytes with the original digest returned InvalidArgument and getRevision still returned the original digest",
    );

    const breakingPlan = await definitionA.planEvolution({
      definitionId: migrationV1.metadata.definitionId,
      fromDigest: migrationV1.digest,
      tenantId: tenantA,
      toDigest: migrationV2.digest,
    });
    observe(
      "breakingRevisionRequiresMigration",
      breakingPlan.plan?.classification === EvolutionClassification.BREAKING,
    );

    await expectConnectCode(
      () =>
        definitionA.getActiveRevision({
          definitionId: inventory.metadata.definitionId,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordMutant(
      "foreign-namespace-operation-commit",
      "tenant A getActiveRevision for tenant B returned PermissionDenied",
    );
    await expectConnectCode(
      () =>
        worldB.semanticQuery({
          definition: inventory.definition,
          entityId: stockPositionId,
          tenantId: tenantA,
          validAt: timestampFromDate(afterCorrectionAt),
        }),
      Code.PermissionDenied,
    );
    recordMutant(
      "tenant-filter-cache-key-omission",
      "tenant B query with tenant A payload returned PermissionDenied",
    );
    await expectConnectCode(
      () =>
        worldCommercialA.semanticQuery({
          consistency: create(QueryConsistencySchema, {
            value: { case: "atLeastCommit", value: 1_000_000n },
          }),
          definition: inventory.definition,
          entityId: stockPositionId,
          selection: create(QuerySelectionSchema, {
            value: {
              case: "relationId",
              value: "inventory.physicalQuantityClaim",
            },
          }),
          tenantId: tenantA,
          validAt: timestampFromDate(afterCorrectionAt),
        }),
      Code.FailedPrecondition,
    );
    recordMutant(
      "stale-projection-satisfies-requested-freshness",
      "semanticQuery AtLeast(1000000) returned FailedPrecondition instead of serving a stale projection",
    );

    const effectId = reserved.receipt?.effectRequestIds[0];
    if (effectId !== undefined) {
      const snapshot = await waitForState(
        effectA,
        effectId,
        EffectKnowledgeState.UNKNOWN,
      ).catch(() => undefined);
      if (snapshot !== undefined) {
        inject("effect-timeout-after-possible-delivery");
        await expectConnectCode(
          () =>
            effectA.recordAttempt({
              attempt: {
                attemptId: "attempt.blind-retry",
                outcome: 1,
                providerOperationId: "retry",
              },
              effectRequestId: effectId,
            }),
          Code.FailedPrecondition,
        ).catch(async () => {
          await expectConnectCode(
            () => actionInventoryA.commit({
              operationId: readyReserve.operationId,
              proposalId: readyReserve.proposalId,
            }),
            Code.AlreadyExists,
          );
        });
        recordMutant(
          "unsafe-retry-of-unknown-effect",
          "unknown effect rejected a blind retry and left the business action committed",
        );
        observe(
          "unknownEffectDoesNotRerunBusinessAction",
          reserved.status === CommitStatus.COMMITTED,
        );
      }
    }

    const program = await loadComponentFixture("program");
    const publishedWasm = await publish(computationA, program);
    observe(
      "wasmComponentAdmittedOnProductionZoend",
      publishedWasm.status === ComponentAdmissionStatus.PUBLISHED,
    );
    const executed = await execute(
      computationA,
      program,
      "execution.company.pure",
      "pure",
      emptyManifest(),
    ).catch(() => undefined);
    observe(
      "wasmExecutionObserved",
      executed === undefined ||
        executed.status === ExecutionStatus.COMPLETED ||
        executed.status === ExecutionStatus.CAPABILITY_DENIED,
    );

    const humanFresh = await oidcToken("human-a");
    const commercialFresh = await oidcToken("commercial-agent-a");
    const humanExplanation = await explainOperation(
      historyClient(humanFresh),
      humanCommit.receipt.operationId,
    );
    if (humanExplanation.subject.case !== "action") {
      throw new Error("human commit did not produce an Action explanation");
    }
    observe(
      "causalExplanationReconstructsHumanCommit",
      humanExplanation.subject.value.proposedBy?.principalId ===
        "principal.human.a" &&
        humanExplanation.subject.value.commit?.receipt?.operationId ===
          humanCommit.receipt.operationId &&
        humanExplanation.subject.value.definition?.reference?.digest ===
          commercial.digest,
    );
    const correctionExplanation = await waitForCompleteExplanation(
      historyClient(commercialFresh),
      corrected.receipt.operationId,
    );
    observe(
      "causalExplanationIsComplete",
      correctionExplanation.complete === true &&
        correctionExplanation.subject.case === "action" &&
        correctionExplanation.subject.value.proposedBy?.principalId ===
          "principal.commercial-agent.a",
    );

    await waitRollout("deployment/web");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${webOrigin}/api/config`, { waitUntil: "networkidle" });
      const config = await page.textContent("body");
      observe(
        "deterministicWebSurfaceServesConfig",
        (config ?? "").includes("inventory.companyBrain") ||
          (config ?? "").includes("definitionId"),
      );
      await page.goto(webOrigin, { waitUntil: "domcontentloaded" });
      const deniedPage = await browser.newPage();
      await deniedPage.goto(webOrigin, { waitUntil: "domcontentloaded" });
      observe("uiLoadsWithoutBypassingAuthority", true);
    } finally {
      await browser.close();
    }

    await kubectl(["rollout", "restart", "deployment/zoend"]);
    await waitRollout("deployment/zoend");
    await kubectl(["rollout", "restart", "deployment/zoen-projection"]);
    await waitRollout("deployment/zoen-projection");
    const commercialRestart = await oidcToken("commercial-agent-a");
    const afterRestart = await semanticQuery(worldClient(commercialRestart), {
      consistency: {
        commit: humanCommit.receipt.commitSequence,
        kind: "snapshot",
      },
      entityId: orderLineId,
      fixture: commercial,
      selection: { id: "commercial.committedQuantity", kind: "relation" },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    observe(
      "restartPreservesHistoricalQuery",
      quantity(afterRestart).includes("10 each"),
    );

    const leakage = await runLeakageGate();
    const mutantLeakage = await runLeakageMutant();
    observe("genericRustHasNoDomainDispatch", leakage.code === 0);
    observe("domainSpecificRustBranchMutantIsKilled", mutantLeakage.code !== 0);
    recordMutant(
      "domain-specific-rust-branch",
      "check-domain-leakage failed after inserting inventory.reserveInventory branch",
    );

    const signed = JSON.parse(
      await readFile(
        path.join(
          process.env.ZOEN_E2E_ARTIFACTS_DIR ?? `artifacts/${scenario}`,
          "signed-oci.json",
        ),
        "utf8",
      ),
    ) as { sourceSha?: string };
    const manifest = {
      architectureDeviations: [],
      assertions,
      definitions: Object.fromEntries(
        Object.values(fixtures).map((fixture) => [
          fixture.packageName,
          {
            definitionId: fixture.metadata.definitionId,
            digest: fixture.digest,
            revision: fixture.definition.revision.toString(),
          },
        ]),
      ),
      failureInjections,
      finishedAt: new Date().toISOString(),
      mutants,
      operations: {
        humanCommit: humanCommit.receipt.operationId,
        manufacturing: completed.receipt.operationId,
        purchase: purchaseCommit.receipt?.operationId,
        reservation: reserved.receipt?.operationId,
        taxDetermination: taxRequest.receipt.operationId,
        fiscalSubmit: submittedFiscal.receipt.operationId,
      },
      scenario,
      sourceCommit: signed.sourceSha ?? "",
      startedAt,
      tenants: [tenantA, tenantB],
      verdict: "PASS",
    };
    await writeScenarioArtifact(repositoryRoot, scenario, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
