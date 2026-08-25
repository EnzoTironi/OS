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
import { LineageRole } from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { e2eGeneratedDirectory, writeScenarioArtifact } from "./host-env.js";
import {
  activeDigest,
  actionClient,
  activateDefinition,
  adminClient,
  command,
  compilePackage,
  compileSurface,
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
} from "./domain-manufacturing-accounting/support.js";
import {
  delay,
  evidenceCounts,
  evidenceInput,
  waitForConnectorStatus,
  waitForState,
} from "./effects/scenario.js";

const scenario = "domain-manufacturing-accounting";
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const lifecycleAt = new Date("2026-08-21T14:00:00.000Z");
const changedAt = new Date("2026-08-21T14:00:01.000Z");
const customerPartyId = "party.organization.customer";
const componentProductId = "product.item.component";
const finishedProductId = "product.item.finished-widget";
const orderLineId = "commercial.order-line.3001";
const inputPositionId = "inventory.position.component.wh-1";
const outputPositionId = "inventory.position.finished.wh-1";
const bomId = "manufacturing.bom.widget";
const workId = "manufacturing.work.3001";
const claimId = "accounting.claim.receivable.3001";
const roundingClaimId = "accounting.claim.rounding-proof.3001";
const bookId = "accounting.book.primary";
const ledgerId = "accounting.ledger.sales";
const receivableAccountId = "accounting.account.receivable";
const revenueAccountId = "accounting.account.revenue";

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

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const packageNames = [
    "party",
    "product",
    "commercial",
    "inventory",
    "manufacturing",
    "accounting-foundation",
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
  const manufacturing = requireFixture(fixtureByName, "manufacturing");
  const accounting = requireFixture(fixtureByName, "accounting-foundation");

  observe(
    "sixVersionedPackagesCompileDeterministically",
    fixtures.every(
      (fixture, index) =>
        fixture.digest === repeated[index]?.digest &&
        fixture.canonicalJson === repeated[index]?.canonicalJson,
    ) &&
      new Set(fixtures.map((fixture) => fixture.digest)).size ===
        fixtures.length,
  );
  observe(
    "manufacturingAndAccountingRetainFourCanonicalFamilies",
    [manufacturing, accounting].every(
      (fixture) =>
        fixture.metadata.types.length > 0 &&
        fixture.metadata.relations.length > 0 &&
        fixture.metadata.computations.length > 0 &&
        fixture.metadata.actions.length > 0,
    ),
  );

  const [manufacturingSource, accountingSource, accountingPolicySource] =
    await Promise.all([
      packageSource("manufacturing"),
      packageSource("accounting-foundation"),
      loadPolicy("accounting.cedar"),
    ]);
  observe(
    "definitionsPreserveBomPlanWorkOccurrenceAndAccountingHistory",
    [
      "manufacturing.BillOfMaterial",
      "manufacturing.Work",
      "manufacturing.bomVersion",
      "manufacturing.bomEffectiveFrom",
      "manufacturing.requirementReference",
      "manufacturing.workPlanReference",
      "manufacturing.completionOccurrenceReference",
    ].every((id) => manufacturingSource.includes(id)) &&
      [
        "accounting.Book",
        "accounting.Ledger",
        "accounting.Account",
        "accounting.EconomicClaim",
        "accounting.Posting",
        "accounting.Settlement",
        "accounting.reversalOf",
        "accounting.correctionOf",
      ].every((id) => accountingSource.includes(id)),
  );
  observe(
    "definitionsUseRelationAccumulatorsAndExactDecimalAmounts",
    !/current(?:Applied|Consumed|Credit|Debit|Produced|Rework|Scrap)Amount|current(?:Consumed|Produced|Rework|Scrap)Quantity/u.test(
      `${manufacturingSource}\n${accountingSource}`,
    ) &&
      /const applySettlement[\s\S]*relationId: "accounting\.appliedAmount"[\s\S]*operator: "add"/u.test(
        accountingSource,
      ) &&
      /const recordPartialCompletion[\s\S]*relationId: "manufacturing\.producedOutputQuantity"[\s\S]*operator: "add"[\s\S]*const recordCompletion/u.test(
        manufacturingSource,
      ) &&
      /const recordCompletion[\s\S]*relationId: "manufacturing\.producedOutputQuantity"[\s\S]*operator: "add"[\s\S]*const recordScrap/u.test(
        manufacturingSource,
      ) &&
      /const postReceivable[\s\S]*relationId: "accounting\.debitAmount"[\s\S]*relationId: "accounting\.creditAmount"/u.test(
        accountingSource,
      ) &&
      !/(?:parseFloat|parseInt|Number)\s*\(/u.test(accountingSource),
  );
  observe(
    "manufacturingDefinitionsContainNoQuantityEncodedRevisionBasis",
    !manufacturingSource.includes("RevisionBasis") &&
      !manufacturingSource.includes("bomRevisionBasis"),
  );

  const [
    accountingGovernancePolicy,
    activationPolicy,
    domainPolicy,
    executionPolicy,
    manufacturingPolicy,
    settlementPolicy,
  ] = await Promise.all([
    loadPolicy("accounting-governance.cedar"),
    loadPolicy("activation.cedar"),
    loadPolicy("domain.cedar"),
    loadPolicy("execution.cedar"),
    loadPolicy("manufacturing.cedar"),
    loadPolicy("settlement.cedar"),
  ]);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writePolicyManifest(policyManifestPath, fixtures, {
    accounting: accountingPolicySource,
    accountingGovernance: accountingGovernancePolicy,
    activation: activationPolicy,
    domain: domainPolicy,
    execution: executionPolicy,
    manufacturing: manufacturingPolicy,
    settlement: settlementPolicy,
  });

  const [
    adminAToken,
    commercialAToken,
    inventoryAToken,
    manufacturingAToken,
    accountingAToken,
    accountingSupervisorAToken,
    workerAToken,
    reconcilerAToken,
    adminBToken,
    inventoryBToken,
    manufacturingBToken,
    accountingBToken,
    accountingSupervisorBToken,
    workerBToken,
  ] = await Promise.all([
    oidcToken("domain-admin-a"),
    oidcToken("commercial-agent-a"),
    oidcToken("inventory-agent-a"),
    oidcToken("manufacturing-agent-a"),
    oidcToken("accounting-agent-a"),
    oidcToken("accounting-supervisor-a"),
    oidcToken("effect-worker-a"),
    oidcToken("effect-reconciler-a"),
    oidcToken("domain-admin-b"),
    oidcToken("inventory-agent-b"),
    oidcToken("manufacturing-agent-b"),
    oidcToken("accounting-agent-b"),
    oidcToken("accounting-supervisor-b"),
    oidcToken("effect-worker-b"),
  ]);
  const definitionA = definitionClient(adminAToken);
  const definitionB = definitionClient(adminBToken);
  const commercialAction = actionClient(commercialAToken);
  const inventoryAction = actionClient(inventoryAToken);
  const manufacturingAction = actionClient(manufacturingAToken);
  const accountingAction = actionClient(accountingAToken);
  const accountingSupervisorAction = actionClient(
    accountingSupervisorAToken,
  );
  const inventoryActionB = actionClient(inventoryBToken);
  const manufacturingActionB = actionClient(manufacturingBToken);
  const accountingActionB = actionClient(accountingBToken);
  const accountingSupervisorActionB = actionClient(
    accountingSupervisorBToken,
  );
  const effectA = effectClient(manufacturingAToken);
  const reconcilerA = effectClient(reconcilerAToken);
  const worldA = worldClient(inventoryAToken);
  const worldB = worldClient(inventoryBToken);
  const historyA = historyClient(accountingAToken);
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
      "allSixPackagesActivateExplicitlyForBothTenants",
      activationCommits.every((commit) => commit > 0n) &&
        fixtures.every(
          (fixture, index) =>
            activeAfterActivation[index * 2] === fixture.digest &&
            activeAfterActivation[index * 2 + 1] === fixture.digest,
        ),
    );

    await recordProductIdentity(worldA, product, tenantA);
    await recordInventoryIdentity(worldA, inventory, tenantA);
    const inputAcceptance = await commitReadyAction(
      inventoryAction,
      inventoryAcceptedRequest(inventory, inputPositionId, "input", "11"),
    );
    await commitReadyAction(
      inventoryAction,
      inventoryAcceptedRequest(inventory, outputPositionId, "output-seed", "1"),
    );
    const acceptedInputQuantity = await relationQuery(
      worldA,
      inventory,
      inputPositionId,
      "inventory.acceptedPhysicalQuantity",
      changedAt,
      tenantA,
    );
    const initialAvailableAmount = quantityAmount(
      currentQuantity(acceptedInputQuantity, [
        "inventory.acceptedPhysicalQuantity",
      ]),
    );
    const commercialCommitment = await commitReadyAction(
      commercialAction,
      commercialCommitmentRequest(commercial),
    );

    const bom = await commitReadyAction(
      manufacturingAction,
      manufacturingBomRequest(manufacturing, "tenant-a", "1", lifecycleAt),
    );
    const requirement = await commitReadyAction(
      manufacturingAction,
      manufacturingRequirementRequest(manufacturing, "tenant-a"),
    );
    const exactPlan = await manufacturingAction.propose(
      manufacturingPlanRequest(manufacturing, "exact", "11"),
    );
    const plan = await commitReadyAction(
      manufacturingAction,
      manufacturingPlanRequest(manufacturing, "tenant-a"),
    );
    const materialAvailability = await commitReadyAction(
      manufacturingAction,
      manufacturingMaterialAvailabilityRequest(
        manufacturing,
        "initial",
        initialAvailableAmount,
      ),
    );
    const [
      requirementReferences,
      planReferences,
      occurrencesBeforeStart,
      bomVersions,
      bomEffectiveDates,
    ] = await Promise.all([
        relationQuery(
          worldA,
          manufacturing,
          workId,
          "manufacturing.requirementReference",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          manufacturing,
          workId,
          "manufacturing.workPlanReference",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          manufacturing,
          workId,
          "manufacturing.completionOccurrenceReference",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          manufacturing,
          bomId,
          "manufacturing.bomVersion",
          lifecycleAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          manufacturing,
          bomId,
          "manufacturing.bomEffectiveFrom",
          lifecycleAt,
          tenantA,
        ),
      ]);
    observe(
      "requirementPlanAndOccurrenceRemainDistinct",
      requirement.receipt.commitSequence < plan.receipt.commitSequence &&
        sameStrings(textValues(requirementReferences), [
          "manufacturing.requirement.customer-3001",
        ]) &&
        sameStrings(textValues(planReferences), ["manufacturing.plan.3001"]) &&
        occurrencesBeforeStart.values.length === 0,
    );
    observe(
      "bomAndMaterialAvailabilityUseGovernedActions",
      inputAcceptance.receipt.commitSequence < bom.receipt.commitSequence &&
        bom.receipt.commitSequence < materialAvailability.receipt.commitSequence &&
        bom.receipt.recordIds.length === 8 &&
        materialAvailability.receipt.recordIds.length === 1 &&
        initialAvailableAmount === "11" &&
        sameStrings(integerValues(bomVersions), ["1"]) &&
        sameStrings(textValues(bomEffectiveDates), ["2026-01-01"]),
    );
    observe(
      "exactPlanAtRequiredQuantityRemainsDeniedByStrictBound",
      exactPlan.decision === PolicyDecision.DENY &&
        exactPlan.proposal === undefined,
    );

    const staleMaterialRequest = manufacturingStartRequest(
      manufacturing,
      "stale-material",
      "6",
    );
    const staleMaterial = await manufacturingAction.propose(
      staleMaterialRequest,
    );
    assert.equal(staleMaterial.decision, PolicyDecision.PERMIT);
    assert.equal(staleMaterial.proposal?.status, ProposalStatus.READY);
    assert.ok(staleMaterial.proposal);
    const inventoryShortage = await commitReadyAction(
      inventoryAction,
      inventoryCorrectionRequest(inventory, "shortage", "5"),
    );
    const reducedInputQuantity = await relationQuery(
      worldA,
      inventory,
      inputPositionId,
      "inventory.acceptedPhysicalQuantity",
      changedAt,
      tenantA,
    );
    const reducedAvailableAmount = quantityAmount(
      currentQuantity(reducedInputQuantity, [
        "inventory.acceptedPhysicalQuantity",
      ]),
    );
    await commitReadyAction(
      manufacturingAction,
      manufacturingMaterialAvailabilityRequest(
        manufacturing,
        "insufficient",
        reducedAvailableAmount,
      ),
    );
    const staleMaterialCommit = await manufacturingAction.commit({
      operationId: staleMaterialRequest.operationId,
      proposalId: staleMaterialRequest.proposalId,
    });
    inject("material-availability-change-after-start-proposal");
    observe(
      "materialChangeMakesManufacturingBasisStale",
      staleMaterialCommit.status === CommitStatus.STALE &&
        staleMaterialCommit.receipt === undefined &&
        inventoryShortage.receipt.definition?.digest === inventory.digest &&
        reducedAvailableAmount === "5" &&
        staleMaterial.proposal.stateBasis?.dependencies.some(
          (dependency) =>
            dependency.relationId ===
            "manufacturing.materialAvailableQuantity",
        ) === true,
    );
    await commitReadyAction(
      inventoryAction,
      inventoryCorrectionRequest(inventory, "restored", "11"),
    );
    const restoredInputQuantity = await relationQuery(
      worldA,
      inventory,
      inputPositionId,
      "inventory.acceptedPhysicalQuantity",
      changedAt,
      tenantA,
    );
    const restoredAvailableAmount = quantityAmount(
      currentQuantity(restoredInputQuantity, [
        "inventory.acceptedPhysicalQuantity",
      ]),
    );
    await commitReadyAction(
      manufacturingAction,
      manufacturingMaterialAvailabilityRequest(
        manufacturing,
        "restored",
        restoredAvailableAmount,
      ),
    );

    const wrongBomRevision = await manufacturingAction.propose(
      manufacturingStartRequest(manufacturing, "wrong-bom", "6", "2"),
    );
    const exactRemainingStart = await manufacturingAction.propose(
      manufacturingStartRequest(manufacturing, "exact-remaining", "11"),
    );
    inject("bom-revision-2-denied-by-cedar");
    observe(
      "bomRevisionPinIsEnforcedOnlyByCedar",
      wrongBomRevision.decision === PolicyDecision.DENY &&
        wrongBomRevision.proposal === undefined,
    );
    observe(
      "exactRemainingStartStaysDeniedByStrictMaterialBound",
      exactRemainingStart.decision === PolicyDecision.DENY &&
        exactRemainingStart.proposal === undefined,
    );

    const excessiveStart = await manufacturingAction.propose(
      manufacturingStartRequest(manufacturing, "insufficient", "100"),
    );
    observe(
      "insufficientMaterialIsDeniedByActionStateBasis",
      excessiveStart.decision === PolicyDecision.DENY &&
        excessiveStart.proposal === undefined &&
        excessiveStart.stateBasis?.dependencies.some(
          (dependency) =>
            dependency.relationId ===
            "manufacturing.materialAvailableQuantity",
        ) === true,
    );
    const started = await commitReadyAction(
      manufacturingAction,
      manufacturingStartRequest(manufacturing, "accepted", "6"),
    );
    observe(
      "startUsesOrdinaryCedarAuthorityAndPinsBomRevision",
      started.receipt.policy?.revision?.policyId ===
        "policy.manufacturing.startWork.r1" &&
        started.proposal.stateBasis?.dependencies.some(
          (dependency) =>
            dependency.relationId ===
            "manufacturing.materialAvailableQuantity",
        ) === true &&
        started.proposal.stateBasis?.dependencies.every(
          (dependency) =>
            dependency.relationId !==
              "manufacturing.consumedInputQuantity" &&
            dependency.relationId !== "manufacturing.currentBomRevision" &&
            dependency.relationId !== "manufacturing.plannedOutputQuantity" &&
            dependency.relationId !== "manufacturing.producedOutputQuantity",
        ) === true,
    );

    const exactRemainingPartial = await manufacturingAction.propose(
      manufacturingCompletionRequest(
        manufacturing,
        "exact-partial",
        "manufacturing.recordPartialCompletion",
        "11",
        "1",
        "inventory.lot.COMP-3001",
        "inventory.serial.COMP-S-EXACT-PARTIAL",
        "inventory.lot.FIN-EXACT-PARTIAL",
        "inventory.serial.FIN-S-EXACT-PARTIAL",
      ),
    );
    const partialRequest = manufacturingCompletionRequest(
      manufacturing,
      "partial",
      "manufacturing.recordPartialCompletion",
      "4",
      "3",
      "inventory.lot.COMP-3001",
      "inventory.serial.COMP-S-3001",
      "inventory.lot.FIN-3001",
      "inventory.serial.FIN-S-3001",
    );
    const competingCompletionRequest = manufacturingCompletionRequest(
      manufacturing,
      "competing",
      "manufacturing.recordPartialCompletion",
      "2",
      "1",
      "inventory.lot.COMP-3001",
      "inventory.serial.COMP-S-COMPETING",
      "inventory.lot.FIN-COMPETING",
      "inventory.serial.FIN-S-COMPETING",
    );
    const competingCompletion = await manufacturingAction.propose(
      competingCompletionRequest,
    );
    assert.equal(
      competingCompletion.proposal?.status,
      ProposalStatus.READY,
    );
    const partial = await commitReadyAction(
      manufacturingAction,
      partialRequest,
    );
    const staleCompetingCompletion = await manufacturingAction.commit({
      operationId: competingCompletionRequest.operationId,
      proposalId: competingCompletionRequest.proposalId,
    });
    const partialReplay = await manufacturingAction.commit({
      operationId: partialRequest.operationId,
      proposalId: partialRequest.proposalId,
    });
    observe(
      "duplicateCompletionOperationIdRecoversOneDurableCompletion",
      partialReplay.status === CommitStatus.COMMITTED &&
        partialReplay.receipt?.commitSequence ===
          partial.receipt.commitSequence &&
        partialReplay.receipt.recordIds.length ===
          partial.receipt.recordIds.length,
    );
    observe(
      "completionAddsProducedAtomicallyAndCompetingBasisBecomesStale",
      staleCompetingCompletion.status === CommitStatus.STALE &&
        partial.proposal.stateBasis?.dependencies.every(
          (dependency) =>
            dependency.relationId !==
            "manufacturing.producedOutputQuantity",
        ) === true,
    );
    const exactRemainingCompletion = await manufacturingAction.propose(
      manufacturingCompletionRequest(
        manufacturing,
        "exact-completion",
        "manufacturing.recordCompletion",
        "7",
        "1",
        "inventory.lot.COMP-3001",
        "inventory.serial.COMP-S-EXACT-COMPLETION",
        "inventory.lot.FIN-EXACT-COMPLETION",
        "inventory.serial.FIN-S-EXACT-COMPLETION",
      ),
    );
    observe(
      "strictMaterialBoundDeniesExactPartialAndCompletionAmounts",
      exactRemainingPartial.decision === PolicyDecision.DENY &&
        exactRemainingPartial.proposal === undefined &&
        exactRemainingCompletion.decision === PolicyDecision.DENY &&
        exactRemainingCompletion.proposal === undefined,
    );
    const bomRevisionTwo = await commitReadyAction(
      manufacturingAction,
      manufacturingBomRequest(manufacturing, "tenant-a-v2", "2", changedAt),
    );
    const [
      partialRemaining,
      partialOutput,
      inputLots,
      outputLots,
      genealogyInputs,
      completionRevisions,
      currentBomVersions,
    ] = await Promise.all([
      computationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.remainingPlannedOutput",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.completionOutputQuantity",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.inputLotReference",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.outputLotReference",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.outputDerivedFromInputLot",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.completionBomRevision",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        bomId,
        "manufacturing.bomVersion",
        changedAt,
        tenantA,
      ),
    ]);
    observe(
      "partialCompletionDoesNotImplyFullConsumptionOrOutput",
      sameStrings(quantityValues(partialOutput), ["3 each"]) &&
        currentQuantity(partialRemaining, [
          "manufacturing.plannedOutputQuantity",
          "manufacturing.producedOutputQuantity",
        ]) === "7 each",
    );
    observe(
      "inputOutputGenealogyTraversesExactHistoricalBomRevision",
      sameStrings(textValues(inputLots), ["inventory.lot.COMP-3001"]) &&
        sameStrings(textValues(outputLots), ["inventory.lot.FIN-3001"]) &&
        sameStrings(textValues(genealogyInputs), [
          "inventory.lot.COMP-3001",
        ]) &&
        sameStrings(integerValues(completionRevisions), ["1"]) &&
        sameStrings(integerValues(currentBomVersions), ["2"]) &&
        bomRevisionTwo.receipt.commitSequence > partial.receipt.commitSequence,
    );

    const serverBeforeManufacturingEffect = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const partialAfterRestart = await manufacturingAction.getOperationStatus({
      operationId: partial.receipt.operationId,
    });
    observe(
      "restartBetweenManufacturingCommitAndEffectRecoversCompletion",
      serverBeforeManufacturingEffect !== server.child.pid &&
        partialAfterRestart.status === CommitStatus.COMMITTED &&
        partialAfterRestart.receipt?.commitSequence ===
          partial.receipt.commitSequence,
    );

    await setProviderMode("timeout_after_delivery");
    await dispatchOnce();
    const productionEffectId = partial.receipt.effectRequestIds[0];
    assert.ok(productionEffectId);
    const unknownProduction = await waitForState(
      effectA,
      productionEffectId,
      EffectKnowledgeState.UNKNOWN,
    );
    const productionIdempotencyKey = `idempotency.${tenantA}.${productionEffectId}`;
    const externalProduction = await providerOperation(
      productionIdempotencyKey,
    );
    await delay(1_100);
    const unknownAfterDelay = await effectA.getEffect({
      effectRequestId: productionEffectId,
    });
    inject("production-writeback-timeout-after-possible-delivery");
    observe(
      "externalProductionTimeoutStaysUnknownWithoutBusinessActionReplay",
      unknownProduction.request?.state === EffectKnowledgeState.UNKNOWN &&
        unknownAfterDelay.snapshot?.request?.state ===
          EffectKnowledgeState.UNKNOWN &&
        externalProduction?.requests === 1,
    );
    const productionStatus = await waitForConnectorStatus(
      productionIdempotencyKey,
    );
    const productionEvidence = evidenceInput(
      productionStatus,
      "manufacturing-production-writeback",
    );
    await reconcilerA.reconcile({
      effectRequestId: productionEffectId,
      evidence: productionEvidence,
    });
    await reconcilerA.reconcile({
      effectRequestId: productionEffectId,
      evidence: productionEvidence,
    });
    const productionEvidenceCount = await evidenceCounts(
      admin,
      productionEffectId,
    );
    observe(
      "productionWritebackReconciliationUsesIndependentIdempotentEvidence",
      productionEvidenceCount.evidence === 1 &&
        productionEvidenceCount.reconciliations === 1 &&
        (await providerOperation(productionIdempotencyKey))?.requests === 1,
    );

    const finalCompletion = await commitReadyAction(
      manufacturingAction,
      manufacturingCompletionRequest(
        manufacturing,
        "final",
        "manufacturing.recordCompletion",
        "2",
        "2",
        "inventory.lot.COMP-3001",
        "inventory.serial.COMP-S-3002",
        "inventory.lot.FIN-3002",
        "inventory.serial.FIN-S-3002",
      ),
    );
    const inputConsumption = await commitReadyAction(
      inventoryAction,
      inventoryMovementRequest(inventory, inputPositionId, "consumption", "6"),
    );
    const outputProduction = await commitReadyAction(
      inventoryAction,
      inventoryReceiptRequest(inventory, outputPositionId, "5"),
    );
    observe(
      "inventoryConsumptionAndProductionUseGovernedAppendActions",
      inputConsumption.receipt.recordIds.length === 3 &&
        outputProduction.receipt.recordIds.length === 3 &&
        inputConsumption.receipt.definition?.digest === inventory.digest &&
        outputProduction.receipt.definition?.digest === inventory.digest,
    );

    const excessiveScrap = await manufacturingAction.propose(
      manufacturingScrapRequest(manufacturing, "excessive", "1000000"),
    );
    const excessiveRework = await manufacturingAction.propose(
      manufacturingReworkRequest(manufacturing, "excessive", "1000000"),
    );
    observe(
      "scrapAndReworkCannotExceedNetProducedQuantity",
      excessiveScrap.decision === PolicyDecision.DENY &&
        excessiveScrap.proposal === undefined &&
        excessiveRework.decision === PolicyDecision.DENY &&
        excessiveRework.proposal === undefined,
    );
    const scrap = await commitReadyAction(
      manufacturingAction,
      manufacturingScrapRequest(manufacturing, "accepted", "0.5"),
    );
    const rework = await commitReadyAction(
      manufacturingAction,
      manufacturingReworkRequest(manufacturing, "accepted", "0.25"),
    );
    const correction = await commitReadyAction(
      manufacturingAction,
      manufacturingCorrectionRequest(manufacturing),
    );
    const [
      completionHistory,
      scrapHistory,
      reworkHistory,
      correctionHistory,
      consumedAfterCorrection,
      producedAfterCorrection,
      consumedAdjustments,
      producedAdjustments,
      netProducedAfterCorrection,
    ] = await Promise.all([
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.completionOccurrenceReference",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.scrapOccurrenceReference",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.reworkOf",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.correctionOf",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.consumedInputQuantity",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.producedOutputQuantity",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.consumedQuantityAdjustment",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.producedQuantityAdjustment",
        changedAt,
        tenantA,
      ),
      computationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.netProducedOutput",
        changedAt,
        tenantA,
      ),
    ]);
    observe(
      "partialCompletionReworkScrapAndCorrectionAppendHistory",
      partial.receipt.commitSequence < finalCompletion.receipt.commitSequence &&
        finalCompletion.receipt.commitSequence < scrap.receipt.commitSequence &&
        scrap.receipt.commitSequence < rework.receipt.commitSequence &&
        rework.receipt.commitSequence < correction.receipt.commitSequence &&
        sameStrings(textValues(completionHistory), [
          "manufacturing.occurrence.partial-3001",
          "manufacturing.occurrence.final-3001",
        ]) &&
        sameStrings(textValues(scrapHistory), [
          "manufacturing.occurrence.scrap-accepted-3001",
        ]) &&
        sameStrings(textValues(reworkHistory), [
          "manufacturing.occurrence.partial-3001",
        ]) &&
        sameStrings(textValues(correctionHistory), [
          "manufacturing.occurrence.partial-3001",
        ]) &&
        currentQuantity(consumedAfterCorrection, [
          "manufacturing.consumedInputQuantity",
        ]) === "5.75 each" &&
        currentQuantity(producedAfterCorrection, [
          "manufacturing.producedOutputQuantity",
        ]) === "4.5 each" &&
        sameStrings(quantityValues(consumedAdjustments), ["-0.25 each"]) &&
        sameStrings(quantityValues(producedAdjustments), ["-0.5 each"]) &&
        currentQuantity(netProducedAfterCorrection, [
          "manufacturing.producedOutputQuantity",
          "manufacturing.scrapQuantity",
          "manufacturing.reworkQuantity",
        ]) === "3.75 each",
    );
    const repeatedRequirement = await commitReadyAction(
      manufacturingAction,
      manufacturingRequirementRequest(manufacturing, "repeat-after-production"),
    );
    const [
      consumedAfterRepeatedRequirement,
      producedAfterRepeatedRequirement,
      scrapAfterRepeatedRequirement,
      reworkAfterRepeatedRequirement,
    ] = await Promise.all([
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.consumedInputQuantity",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.producedOutputQuantity",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.scrapQuantity",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.reworkQuantity",
        changedAt,
        tenantA,
      ),
    ]);
    observe(
      "repeatedRequirementCannotResetProductionAccumulators",
      currentQuantity(consumedAfterRepeatedRequirement, [
        "manufacturing.consumedInputQuantity",
      ]) === "5.75 each" &&
        currentQuantity(producedAfterRepeatedRequirement, [
          "manufacturing.producedOutputQuantity",
        ]) === "4.5 each" &&
        currentQuantity(scrapAfterRepeatedRequirement, [
          "manufacturing.scrapQuantity",
        ]) === "0.5 each" &&
        currentQuantity(reworkAfterRepeatedRequirement, [
          "manufacturing.reworkQuantity",
        ]) === "0.25 each",
    );

    const fulfillment = await commitReadyAction(
      commercialAction,
      commercialFulfillmentRequest(commercial),
    );
    const accountingIdentity = await commitAccountingIdentity(
      accountingAction,
      accounting,
      "tenant-a",
      "PRIMARY",
    );
    const bookIdentityOperation = accountingIdentity[0];
    assert.ok(bookIdentityOperation);
    observe(
      "bookLedgerAndAccountIdentityUseGovernedActions",
      accountingIdentity.every(
        (entry) =>
          entry.receipt.definition?.digest === accounting.digest &&
          entry.receipt.policy?.revision?.policyId.startsWith(
            "policy.accounting.record",
          ) === true,
      ),
    );
    const exactDecimalPosting = await commitReadyAction(
      accountingAction,
      receivableRequest(
        accounting,
        "exact-decimal-proof",
        partial.receipt.operationId,
        fulfillment.receipt.operationId,
        "199.899999999",
        "199.899999999",
        "BRL",
        roundingClaimId,
        "accounting.posting.rounding-proof.3001",
      ),
    );
    const [exactDecimalDebits, exactDecimalCredits] = await Promise.all([
      relationQuery(
        worldA,
        accounting,
        roundingClaimId,
        "accounting.debitAmount",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        accounting,
        roundingClaimId,
        "accounting.creditAmount",
        changedAt,
        tenantA,
      ),
    ]);
    observe(
      "exactDecimalPostingPreservesSemanticAmountWithoutRounding",
      exactDecimalPosting.receipt.operationId ===
        "operation.accounting-foundation.exact-decimal-proof" &&
        sameStrings(decimalValues(exactDecimalDebits), ["199.899999999"]) &&
        sameStrings(decimalValues(exactDecimalCredits), ["199.899999999"]),
    );

    const unbalancedRequest = receivableRequest(
      accounting,
      "unbalanced",
      partial.receipt.operationId,
      fulfillment.receipt.operationId,
      "199.9",
      "199.8",
      "BRL",
    );
    const unbalanced = await accountingAction.propose(unbalancedRequest);
    const wrongCurrency = await accountingAction.propose(
      receivableRequest(
        accounting,
        "wrong-currency",
        partial.receipt.operationId,
        fulfillment.receipt.operationId,
        "199.9",
        "199.9",
        "USD",
      ),
    );
    const malformedDecimal = await expectConnectCode(
      () =>
        accountingAction.propose(
          receivableRequest(
            accounting,
            "non-canonical-decimal",
            partial.receipt.operationId,
            fulfillment.receipt.operationId,
            "199.90",
            "199.90",
            "BRL",
          ),
        ),
      Code.InvalidArgument,
    );
    const invalidAccountingWrites = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM action_operations
       WHERE tenant_id = $1
         AND operation_id = ANY($2::text[])`,
      [
        tenantA,
        [
          unbalancedRequest.operationId,
          "operation.accounting-foundation.wrong-currency",
          "operation.accounting-foundation.non-canonical-decimal",
        ],
      ],
    );
    observe(
      "cedarRejectsUnbalancedCurrencyAndDecimalMismatchesAtomically",
      unbalanced.decision === PolicyDecision.DENY &&
        unbalanced.proposal === undefined &&
        wrongCurrency.decision === PolicyDecision.DENY &&
        wrongCurrency.proposal === undefined &&
        malformedDecimal === Code.InvalidArgument &&
        invalidAccountingWrites.rows[0]?.count === "0",
    );

    const receivable = await commitReadyAction(
      accountingAction,
      receivableRequest(
        accounting,
        "receivable",
        partial.receipt.operationId,
        fulfillment.receipt.operationId,
        "199.9",
        "199.9",
        "BRL",
      ),
    );
    const [
      debits,
      credits,
      originOperations,
      fulfillmentOperations,
      postingDifferenceAfterReceivable,
    ] = await Promise.all([
      relationQuery(
        worldA,
        accounting,
        claimId,
        "accounting.debitAmount",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        accounting,
        claimId,
        "accounting.creditAmount",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        accounting,
        claimId,
        "accounting.originatingOperationReference",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldA,
        accounting,
        claimId,
        "accounting.fulfillmentOperationReference",
        changedAt,
        tenantA,
      ),
      computationQuery(
        worldA,
        accounting,
        claimId,
        "accounting.postingDifference",
        changedAt,
        tenantA,
      ),
    ]);
    const receivableAtomicity = await admin.query<{
      operation: string;
      records: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM action_operations WHERE tenant_id = $1 AND operation_id = $2) AS operation,
         (SELECT count(*)::text FROM semantic_claims WHERE tenant_id = $1 AND claim_id = ANY($3::text[])) AS records`,
      [
        tenantA,
        receivable.receipt.operationId,
        receivable.receipt.recordIds,
      ],
    );
    observe(
      "receivablePostingIsExactBalancedAndCausallyLinked",
      sameStrings(decimalValues(debits), ["199.9"]) &&
        sameStrings(decimalValues(credits), ["199.9"]) &&
        currentDecimal(postingDifferenceAfterReceivable, [
          "accounting.postedDebitTotal",
          "accounting.postedCreditTotal",
        ]) === "0" &&
        textValues(originOperations).includes(partial.receipt.operationId) &&
        textValues(fulfillmentOperations).includes(
          fulfillment.receipt.operationId,
        ) &&
        receivableAtomicity.rows[0]?.operation === "1" &&
        receivableAtomicity.rows[0]?.records ===
          receivable.receipt.recordIds.length.toString(),
    );

    const serverBeforeSettlement = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const receivableAfterRestart = await accountingAction.getOperationStatus({
      operationId: receivable.receipt.operationId,
    });
    observe(
      "restartBetweenReceivableAndSettlementRecoversClaimOperation",
      serverBeforeSettlement !== server.child.pid &&
        receivableAfterRestart.status === CommitStatus.COMMITTED &&
        receivableAfterRestart.receipt?.commitSequence ===
          receivable.receipt.commitSequence,
    );

    const excessiveSettlement = await accountingAction.propose(
      settlementRequest(accounting, "excessive", "300", "BRL"),
    );
    const zeroSettlement = await accountingAction.propose(
      settlementRequest(accounting, "zero", "0", "BRL"),
    );
    const negativeSettlement = await accountingAction.propose(
      settlementRequest(accounting, "negative", "-1", "BRL"),
    );
    const exactSettlement = await accountingAction.propose(
      settlementRequest(accounting, "exact-open-claim", "199.9", "BRL"),
    );
    const settlementRequestAccepted = settlementRequest(
      accounting,
      "accepted",
      "100",
      "BRL",
    );
    observe(
      "exactOpenClaimSettlementRemainsDeniedByStrictBound",
      exactSettlement.decision === PolicyDecision.DENY &&
        exactSettlement.proposal === undefined,
    );
    observe(
      "settlementCedarRejectsZeroAndNegativeAmounts",
      zeroSettlement.decision === PolicyDecision.DENY &&
        zeroSettlement.proposal === undefined &&
        negativeSettlement.decision === PolicyDecision.DENY &&
        negativeSettlement.proposal === undefined,
    );
    const settlementProposal = await accountingAction.propose(
      settlementRequestAccepted,
    );
    assert.equal(
      settlementProposal.proposal?.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(settlementProposal.proposal);
    const unauthorizedSettlementApproval = await accountingAction.approve({
      approvalId: "approval.accounting.settlement.unauthorized",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: settlementProposal.proposal.proposalId,
    });
    const settlementApproval = await accountingSupervisorAction.approve({
      approvalId: "approval.accounting.settlement.accepted",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: settlementProposal.proposal.proposalId,
    });
    const settlementCommit = await accountingAction.commit({
      operationId: settlementRequestAccepted.operationId,
      proposalId: settlementRequestAccepted.proposalId,
    });
    assert.equal(settlementCommit.status, CommitStatus.COMMITTED);
    assert.ok(settlementCommit.receipt);
    const settlementReplay = await accountingAction.commit({
      operationId: settlementRequestAccepted.operationId,
      proposalId: settlementRequestAccepted.proposalId,
    });
    const settlementRows = await admin.query<{
      operation: string;
      settlements: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM action_operations WHERE tenant_id = $1 AND operation_id = $2) AS operation,
         (SELECT count(*)::text FROM semantic_claims WHERE tenant_id = $1 AND relation_id = 'accounting.settlementReference' AND entity_id = $3) AS settlements`,
      [tenantA, settlementRequestAccepted.operationId, claimId],
    );
    const remainingAfterSettlement = await computationQuery(
      worldA,
      accounting,
      claimId,
      "accounting.remainingClaim",
      changedAt,
      tenantA,
    );
    observe(
      "settlementBoundsAuthorityIdempotencyAndRecoveryHold",
      excessiveSettlement.decision === PolicyDecision.DENY &&
        excessiveSettlement.proposal === undefined &&
        unauthorizedSettlementApproval.decision === PolicyDecision.DENY &&
        settlementApproval.decision === PolicyDecision.PERMIT &&
        settlementApproval.approval?.approvedBy ===
          "actor.accounting-supervisor.a" &&
        settlementReplay.status === CommitStatus.COMMITTED &&
        settlementReplay.receipt?.commitSequence ===
          settlementCommit.receipt.commitSequence &&
        settlementRows.rows[0]?.operation === "1" &&
        settlementRows.rows[0]?.settlements === "1" &&
        currentDecimal(remainingAfterSettlement, [
          "accounting.originalAmount",
          "accounting.appliedAmount",
        ]) === "99.9",
    );
    const repeatedPayable = await commitReadyAction(
      accountingAction,
      payableRequest(
        accounting,
        "payable-after-settlement",
        receivable.receipt.operationId,
        "199.9",
        "199.9",
      ),
    );
    const repeatedReceivable = await commitReadyAction(
      accountingAction,
      receivableRequest(
        accounting,
        "receivable-after-settlement",
        partial.receipt.operationId,
        fulfillment.receipt.operationId,
        "199.9",
        "199.9",
        "BRL",
        claimId,
        "accounting.posting.receivable.repost.3001",
      ),
    );
    const [appliedAfterRepeatedPosting, remainingAfterRepeatedPosting] =
      await Promise.all([
        relationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.appliedAmount",
          changedAt,
          tenantA,
        ),
        computationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.remainingClaim",
          changedAt,
          tenantA,
        ),
      ]);
    observe(
      "repeatedReceivableAndPayableCannotResetAppliedSettlement",
      settlementCommit.receipt.commitSequence <
        repeatedPayable.receipt.commitSequence &&
        repeatedPayable.receipt.commitSequence <
          repeatedReceivable.receipt.commitSequence &&
        currentDecimal(appliedAfterRepeatedPosting, [
          "accounting.appliedAmount",
        ]) === "100" &&
        currentDecimal(remainingAfterRepeatedPosting, [
          "accounting.originalAmount",
          "accounting.appliedAmount",
        ]) === "99.9",
    );

    const reversal = await commitReadyAction(
      accountingAction,
      reversalRequest(
        accounting,
        "accounting.posting.receivable.3001",
        receivable.receipt.operationId,
      ),
    );
    const postingCorrection = await commitReadyAction(
      accountingAction,
      accountingCorrectionRequest(
        accounting,
        "accounting.posting.reversal.3001",
        reversal.receipt.operationId,
      ),
    );
    const [
      postingHistory,
      reversals,
      postingCorrections,
      debitHistory,
      creditHistory,
      balancedAfterHistory,
    ] = await Promise.all([
        relationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.postingReference",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.reversalOf",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.correctionOf",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.debitAmount",
          changedAt,
          tenantA,
        ),
        relationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.creditAmount",
          changedAt,
          tenantA,
        ),
        computationQuery(
          worldA,
          accounting,
          claimId,
          "accounting.postingDifference",
          changedAt,
          tenantA,
        ),
      ]);
    observe(
      "reversalAndCorrectionUseOriginalAmountAndPreserveHistory",
      sameStrings(textValues(postingHistory), [
        "accounting.posting.payable.repost.3001",
        "accounting.posting.receivable.3001",
        "accounting.posting.receivable.repost.3001",
      ]) &&
        sameStrings(textValues(reversals), [
          "accounting.posting.receivable.3001",
        ]) &&
        sameStrings(textValues(postingCorrections), [
          "accounting.posting.reversal.3001",
        ]) &&
        reversal.receipt.commitSequence <
          postingCorrection.receipt.commitSequence &&
        sameStrings(decimalValues(debitHistory), [
          "199.9",
          "199.9",
          "199.9",
          "199.9",
          "199.9",
        ]) &&
        sameStrings(decimalValues(creditHistory), [
          "199.9",
          "199.9",
          "199.9",
          "199.9",
          "199.9",
        ]) &&
        [reversal, postingCorrection].every((entry) =>
          [
            "accounting.originalAmount",
            "accounting.postedDebitTotal",
            "accounting.postedCreditTotal",
          ].every((relationId) =>
            entry.proposal.stateBasis?.dependencies.some(
              (dependency) => dependency.relationId === relationId,
            ),
          ),
        ) &&
        currentDecimal(balancedAfterHistory, [
          "accounting.postedDebitTotal",
          "accounting.postedCreditTotal",
        ]) === "0",
    );

    const receivableExplanation = await explainOperation(
      historyA,
      receivable.receipt.operationId,
    );
    const settlementExplanation = await explainOperation(
      historyA,
      settlementCommit.receipt.operationId,
    );
    const receivableExplanationBeforeRestart = explanationShape(
      receivableExplanation,
    );
    const settlementExplanationBeforeRestart = explanationShape(
      settlementExplanation,
    );
    observe(
      "explainAttributesManufacturingReceivableAndSettlementOperations",
      receivableExplanation.subject.case === "action" &&
        settlementExplanation.subject.case === "action" &&
        receivableExplanation.subject.value.definition?.reference?.digest ===
          accounting.digest &&
        settlementExplanation.subject.value.definition?.reference?.digest ===
          accounting.digest &&
        receivableExplanation.subject.value.commit?.records.length ===
          receivable.receipt.recordIds.length &&
        settlementExplanation.subject.value.commit?.records.length ===
          settlementCommit.receipt.recordIds.length,
    );

    await recordProductIdentity(worldB, product, tenantB);
    await recordInventoryIdentity(worldB, inventory, tenantB);
    await commitReadyAction(
      inventoryActionB,
      inventoryAcceptedRequest(inventory, inputPositionId, "tenant-b", "77"),
    );
    const tenantBAcceptedInput = await relationQuery(
      worldB,
      inventory,
      inputPositionId,
      "inventory.acceptedPhysicalQuantity",
      changedAt,
      tenantB,
    );
    const tenantBAvailableAmount = quantityAmount(
      currentQuantity(tenantBAcceptedInput, [
        "inventory.acceptedPhysicalQuantity",
      ]),
    );
    await commitReadyAction(
      manufacturingActionB,
      manufacturingBomRequest(manufacturing, "tenant-b", "1", lifecycleAt),
    );
    await commitReadyAction(
      manufacturingActionB,
      manufacturingRequirementRequest(manufacturing, "tenant-b"),
    );
    await commitReadyAction(
      manufacturingActionB,
      manufacturingPlanRequest(manufacturing, "tenant-b"),
    );
    await commitReadyAction(
      manufacturingActionB,
      manufacturingMaterialAvailabilityRequest(
        manufacturing,
        "tenant-b",
        tenantBAvailableAmount,
      ),
    );
    const tenantBStart = await commitReadyAction(
      manufacturingActionB,
      manufacturingStartRequest(manufacturing, "tenant-b", "6"),
    );
    await commitAccountingIdentity(
      accountingActionB,
      accounting,
      "tenant-b",
      "SECONDARY",
    );
    const tenantBReceivable = await commitReadyAction(
      accountingActionB,
      receivableRequest(
        accounting,
        "tenant-b",
        tenantBStart.receipt.operationId,
        "operation.commercial.tenant-b",
        "77.7",
        "77.7",
        "BRL",
      ),
    );
    const tenantBSettlementRequest = settlementRequest(
      accounting,
      "tenant-b",
      "7.7",
      "BRL",
    );
    const tenantBSettlementProposal = await accountingActionB.propose(
      tenantBSettlementRequest,
    );
    assert.equal(
      tenantBSettlementProposal.proposal?.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(tenantBSettlementProposal.proposal);
    const tenantBSettlementApproval =
      await accountingSupervisorActionB.approve({
        approvalId: "approval.accounting.settlement.tenant-b",
        expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
        proposalId: tenantBSettlementProposal.proposal.proposalId,
      });
    assert.equal(tenantBSettlementApproval.decision, PolicyDecision.PERMIT);
    const tenantBSettlement = await accountingActionB.commit({
      operationId: tenantBSettlementRequest.operationId,
      proposalId: tenantBSettlementRequest.proposalId,
    });
    const [
      tenantABook,
      tenantBBook,
      tenantBRemaining,
      tenantAStarts,
      tenantBStarts,
    ] = await Promise.all([
      relationQuery(
        worldA,
        accounting,
        bookId,
        "accounting.bookCode",
        lifecycleAt,
        tenantA,
      ),
      relationQuery(
        worldB,
        accounting,
        bookId,
        "accounting.bookCode",
        lifecycleAt,
        tenantB,
      ),
      computationQuery(
        worldB,
        accounting,
        claimId,
        "accounting.remainingClaim",
        changedAt,
        tenantB,
      ),
      relationQuery(
        worldA,
        manufacturing,
        workId,
        "manufacturing.startOccurrenceReference",
        changedAt,
        tenantA,
      ),
      relationQuery(
        worldB,
        manufacturing,
        workId,
        "manufacturing.startOccurrenceReference",
        changedAt,
        tenantB,
      ),
    ]);
    const crossTenantClaim = await expectConnectCode(
      () =>
        computationQuery(
          worldB,
          accounting,
          claimId,
          "accounting.remainingClaim",
          changedAt,
          tenantA,
        ),
      Code.PermissionDenied,
    );
    observe(
      "sameBookIdRetainsTenantScopedMeaning",
      sameStrings(textValues(tenantABook), ["PRIMARY"]) &&
        sameStrings(textValues(tenantBBook), ["SECONDARY"]),
    );
    observe(
      "sameProductionIdRetainsTenantScopedOccurrences",
      sameStrings(textValues(tenantAStarts), [
        "manufacturing.start.accepted",
      ]) &&
        sameStrings(textValues(tenantBStarts), [
          "manufacturing.start.tenant-b",
        ]),
    );
    observe(
      "crossTenantClaimQueryIsDenied",
      crossTenantClaim === Code.PermissionDenied,
    );
    observe(
      "tenantBClaimHasIndependentExactRemainingAmount",
      currentDecimal(tenantBRemaining, [
        "accounting.originalAmount",
        "accounting.appliedAmount",
      ]) === "70" &&
        tenantBReceivable.receipt.operationId !==
          receivable.receipt.operationId,
    );
    observe(
      "tenantBSettlementCommitsUnderTenantAuthority",
      tenantBSettlement.status === CommitStatus.COMMITTED,
    );
    observe(
      "tenantIdentityIsAbsentFromSettlementPayload",
      !Object.hasOwn(tenantBSettlementRequest, "tenantId"),
    );

    const strongGenealogy = await relationQuery(
      worldA,
      manufacturing,
      workId,
      "manufacturing.outputDerivedFromInputLot",
      changedAt,
      tenantA,
    );
    const strongRemainingClaim = await computationQuery(
      worldA,
      accounting,
      claimId,
      "accounting.remainingClaim",
      changedAt,
      tenantA,
    );
    const projection = await rebuildProjection(tenantA);
    const [projectedGenealogy, projectedRemainingClaim] = await Promise.all([
      semanticQuery(worldA, {
        consistency: { kind: "eventual" },
        entityId: workId,
        fixture: manufacturing,
        selection: {
          id: "manufacturing.outputDerivedFromInputLot",
          kind: "relation",
        },
        tenantId: tenantA,
        validAt: changedAt,
      }),
      semanticQuery(worldA, {
        consistency: { kind: "eventual" },
        entityId: claimId,
        fixture: accounting,
        selection: { id: "accounting.remainingClaim", kind: "computation" },
        tenantId: tenantA,
        validAt: changedAt,
      }),
    ]);
    observe(
      "authoritativeAndProjectedProvidersReturnSameGenealogyAndClaim",
      projection.wroteManifest &&
        projection.projectedRows > 0 &&
        semanticShape(strongGenealogy) ===
          semanticShape(projectedGenealogy) &&
        semanticShape(strongRemainingClaim) ===
          semanticShape(projectedRemainingClaim),
    );

    const manufacturingSurface = compileSurface(manufacturing, workId);
    const accountingSurface = compileSurface(accounting, claimId);
    observe(
      "deterministicGeneratedUiUsesDefinitionsWithoutLiveLlm",
      [manufacturingSurface, accountingSurface].every(
        (surface) =>
          surface.attribution.compiler === "deterministic" &&
          surface.attribution.generatedWithoutLlm,
      ) &&
        manufacturingSurface.actionBindings.some(
          (binding) =>
            binding.ref.actionId ===
            "manufacturing.recordPartialCompletion",
        ) &&
        accountingSurface.actionBindings.some(
          (binding) =>
            binding.ref.actionId === "accounting.applySettlement",
        ),
    );

    const finalRestartPid = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const restartedWorld = worldClient(inventoryAToken);
    const restartedHistory = historyClient(accountingAToken);
    const [
      genealogyAfterRestart,
      claimAfterRestart,
      projectedClaimAfterRestart,
      receivableAfterFinalRestart,
      settlementAfterFinalRestart,
      settlementStatusAfterRestart,
    ] = await Promise.all([
      relationQuery(
        restartedWorld,
        manufacturing,
        workId,
        "manufacturing.outputDerivedFromInputLot",
        changedAt,
        tenantA,
      ),
      computationQuery(
        restartedWorld,
        accounting,
        claimId,
        "accounting.remainingClaim",
        changedAt,
        tenantA,
      ),
      semanticQuery(restartedWorld, {
        consistency: { kind: "eventual" },
        entityId: claimId,
        fixture: accounting,
        selection: { id: "accounting.remainingClaim", kind: "computation" },
        tenantId: tenantA,
        validAt: changedAt,
      }),
      explainOperation(
        restartedHistory,
        receivable.receipt.operationId,
      ),
      explainOperation(
        restartedHistory,
        settlementCommit.receipt.operationId,
      ),
      accountingAction.getOperationStatus({
        operationId: settlementCommit.receipt.operationId,
      }),
    ]);
    observe(
      "restartAndProjectionRebuildPreserveGenealogyLedgerAndSettlement",
      finalRestartPid !== server.child.pid &&
        semanticShape(genealogyAfterRestart) ===
          semanticShape(strongGenealogy) &&
        semanticShape(claimAfterRestart) ===
          semanticShape(projectedClaimAfterRestart) &&
        explanationShape(receivableAfterFinalRestart) ===
          receivableExplanationBeforeRestart &&
        explanationShape(settlementAfterFinalRestart) ===
          settlementExplanationBeforeRestart &&
        settlementStatusAfterRestart.status === CommitStatus.COMMITTED &&
        settlementStatusAfterRestart.receipt?.commitSequence ===
          settlementCommit.receipt.commitSequence,
    );

    const cleanLeakage = await runLeakageGate();
    const mutantLeakage = await runLeakageMutant();
    observe(
      "genericRustContainsNoManufacturingOrAccountingDispatch",
      cleanLeakage.code === 0 &&
        JSON.parse(cleanLeakage.stdout).findings.length === 0,
    );
    observe(
      "knownAccountingActionBranchMutantIsKilled",
      mutantLeakage.code !== 0 &&
        /accounting\.applySettlement/u.test(mutantLeakage.stderr),
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
      "zoen-domain-manufacturing-accounting",
      "--file",
      "e2e/domain-manufacturing-accounting/compose.yaml",
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    ]);
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/u);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      architectureDeviations: [
        "The v1 expression algebra has strict greater_than but no greater_than_or_equal, so exact remaining material, exact plan-to-required output, and exact open-claim settlement remain parked.",
        "Cross-package entity references use named Relation values because canonical definition validation currently resolves Type targets only inside one immutable definition bundle.",
        "The Action algebra cannot combine the material bound with BOM equality. Execution StateBasis covers material availability and consumed quantity, Cedar pins revision 1, and stale-on-BOM-change remains a parked kernel follow-up.",
        "Absent additive relations use the present operand as the identity value. Commit reads effect-only accumulators at the locked authority cut without adding them to the proposal StateBasis.",
        "Debit and credit equality for receivable and payable posting is enforced only by Cedar. Reversal and correction Actions read the original posting amount and emit the same bounded amount to both sides.",
      ],
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
        accountingCorrection: postingCorrection.receipt.operationId,
        accountingIdentity: bookIdentityOperation.receipt.operationId,
        bomRevisionOne: bom.receipt.operationId,
        bomRevisionTwo: bomRevisionTwo.receipt.operationId,
        commercialCommitment: commercialCommitment.receipt.operationId,
        exactDecimalPosting: exactDecimalPosting.receipt.operationId,
        finalCompletion: finalCompletion.receipt.operationId,
        fulfillment: fulfillment.receipt.operationId,
        manufacturingCorrection: correction.receipt.operationId,
        materialAvailability: materialAvailability.receipt.operationId,
        partialCompletion: partial.receipt.operationId,
        receivable: receivable.receipt.operationId,
        repeatedPayable: repeatedPayable.receipt.operationId,
        repeatedReceivable: repeatedReceivable.receipt.operationId,
        repeatedRequirement: repeatedRequirement.receipt.operationId,
        reversal: reversal.receipt.operationId,
        rework: rework.receipt.operationId,
        scrap: scrap.receipt.operationId,
        settlement: settlementCommit.receipt.operationId,
        workRequirement: requirement.receipt.operationId,
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

async function recordProductIdentity(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  tenantId: string,
): Promise<void> {
  await Promise.all(
    [
      {
        claimId: "claim.product.component-external-id",
        entityId: componentProductId,
        value: "sku:COMPONENT",
      },
      {
        claimId: "claim.product.finished-external-id",
        entityId: finishedProductId,
        value: "sku:FINISHED-WIDGET",
      },
    ].map((record) =>
      recordEvidence(client, {
        claimId: `${record.claimId}.${tenantId}`,
        entityId: record.entityId,
        fixture,
        relationId: "product.externalIdentifier",
        sourceId: "source.product-catalog",
        tenantId,
        time: instant(lifecycleAt),
        value: { kind: "text", value: record.value },
      }),
    ),
  );
}

async function recordInventoryIdentity(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  tenantId: string,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly entityId: string;
    readonly relationId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.inventory.input-product",
      entityId: inputPositionId,
      relationId: "inventory.productReference",
      value: { kind: "text", value: componentProductId },
    },
    {
      claimId: "claim.inventory.input-lot",
      entityId: inputPositionId,
      relationId: "inventory.lot",
      value: { kind: "entity-ref", value: "inventory.lot.COMP-3001" },
    },
    {
      claimId: "claim.inventory.input-serial",
      entityId: inputPositionId,
      relationId: "inventory.serialUnit",
      value: { kind: "entity-ref", value: "inventory.serial.COMP-S-3001" },
    },
    {
      claimId: "claim.inventory.output-product",
      entityId: outputPositionId,
      relationId: "inventory.productReference",
      value: { kind: "text", value: finishedProductId },
    },
    {
      claimId: "claim.inventory.output-lot",
      entityId: outputPositionId,
      relationId: "inventory.lot",
      value: { kind: "entity-ref", value: "inventory.lot.FIN-3001" },
    },
    {
      claimId: "claim.inventory.output-serial",
      entityId: outputPositionId,
      relationId: "inventory.serialUnit",
      value: { kind: "entity-ref", value: "inventory.serial.FIN-S-3001" },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      claimId: `${record.claimId}.${tenantId}`,
      fixture,
      sourceId: "source.inventory-master",
      tenantId,
      time: instant(lifecycleAt),
    });
  }
}

function manufacturingBomRequest(
  fixture: DomainFixture,
  suffix: string,
  version: string,
  validAt: Date,
) {
  return proposalRequest({
    actionId: "manufacturing.recordBillOfMaterial",
    fixture,
    inputs: [
      {
        id: "effectiveFrom",
        value: {
          kind: "text",
          value: version === "1" ? "2026-01-01" : "2026-09-01",
        },
      },
      {
        id: "effectiveTo",
        value: { kind: "text", value: "2027-01-01" },
      },
      {
        id: "inputProductReference",
        value: { kind: "text", value: componentProductId },
      },
      {
        id: "inputQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "operationReference",
        value: {
          kind: "text",
          value: `operation.press-and-assemble.r${version}`,
        },
      },
      {
        id: "outputProductReference",
        value: { kind: "text", value: finishedProductId },
      },
      {
        id: "outputQuantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
      { id: "version", value: { kind: "integer", value: version } },
    ],
    resourceId: bomId,
    suffix: `bom-${suffix}`,
    validAt,
  });
}

function manufacturingMaterialAvailabilityRequest(
  fixture: DomainFixture,
  suffix: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "manufacturing.recordMaterialAvailability",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
    ],
    resourceId: workId,
    suffix: `material-availability-${suffix}`,
    validAt: changedAt,
  });
}

function commitAccountingIdentity(
  client: ActionClient,
  fixture: DomainFixture,
  suffix: string,
  bookCode: string,
) {
  return Promise.all([
    commitReadyAction(
      client,
      proposalRequest({
        actionId: "accounting.recordBookIdentity",
        fixture,
        inputs: [
          { id: "code", value: { kind: "text", value: bookCode } },
          { id: "currency", value: { kind: "text", value: "BRL" } },
          {
            id: "meaning",
            value: { kind: "text", value: "Brazil commercial book 2026" },
          },
          { id: "revision", value: { kind: "integer", value: "1" } },
        ],
        resourceId: bookId,
        suffix: `book-${suffix}`,
        validAt: lifecycleAt,
      }),
    ),
    commitReadyAction(
      client,
      proposalRequest({
        actionId: "accounting.recordLedgerIdentity",
        fixture,
        inputs: [
          { id: "bookReference", value: { kind: "text", value: bookId } },
          { id: "code", value: { kind: "text", value: "SALES" } },
          { id: "revision", value: { kind: "integer", value: "1" } },
        ],
        resourceId: ledgerId,
        suffix: `ledger-${suffix}`,
        validAt: lifecycleAt,
      }),
    ),
    commitReadyAction(
      client,
      accountingAccountIdentityRequest({
        classification: "asset",
        code: "1.1.2",
        fixture,
        name: "Trade receivables",
        resourceId: receivableAccountId,
        suffix,
      }),
    ),
    commitReadyAction(
      client,
      accountingAccountIdentityRequest({
        classification: "revenue",
        code: "3.1.1",
        fixture,
        name: "Product revenue",
        resourceId: revenueAccountId,
        suffix,
      }),
    ),
  ]);
}

function accountingAccountIdentityRequest(input: {
  readonly classification: string;
  readonly code: string;
  readonly fixture: DomainFixture;
  readonly name: string;
  readonly resourceId: string;
  readonly suffix: string;
}) {
  const { classification, code, fixture, name, resourceId, suffix } = input;
  return proposalRequest({
    actionId: "accounting.recordAccountIdentity",
    fixture,
    inputs: [
      {
        id: "classification",
        value: { kind: "text", value: classification },
      },
      { id: "code", value: { kind: "text", value: code } },
      { id: "name", value: { kind: "text", value: name } },
      { id: "revision", value: { kind: "integer", value: "1" } },
    ],
    resourceId,
    suffix: `account-${suffix}-${code}`,
    validAt: lifecycleAt,
  });
}

function commercialCommitmentRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "commercial.createCommitment",
    fixture,
    inputs: [
      {
        id: "commitmentReference",
        value: { kind: "entity-ref", value: "commitment.order-3001" },
      },
      {
        id: "quantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
      { id: "revision", value: { kind: "integer", value: "1" } },
      { id: "terms", value: { kind: "text", value: "net-30" } },
      { id: "unitPrice", value: { kind: "decimal", value: "39.98" } },
    ],
    resourceId: orderLineId,
    suffix: "customer-commitment-3001",
    validAt: changedAt,
  });
}

function commercialFulfillmentRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "commercial.recordFulfillment",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "5", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: orderLineId,
    suffix: "manufacturing-fulfillment-3001",
    validAt: changedAt,
  });
}

function inventoryAcceptedRequest(
  fixture: DomainFixture,
  resourceId: string,
  suffix: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "inventory.acceptPhysicalQuantity",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      {
        id: "sourceReference",
        value: { kind: "text", value: `inventory-source.${suffix}` },
      },
    ],
    resourceId,
    suffix: `accept-${suffix}`,
    validAt: changedAt,
  });
}

function inventoryCorrectionRequest(
  fixture: DomainFixture,
  suffix: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "inventory.correctInventory",
    fixture,
    inputs: [
      {
        id: "acceptedQuantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      {
        id: "correctionOf",
        value: { kind: "text", value: "inventory-source.input" },
      },
      {
        id: "reason",
        value: { kind: "text", value: `manufacturing-${suffix}` },
      },
    ],
    resourceId: inputPositionId,
    suffix: `inventory-${suffix}`,
    validAt: changedAt,
  });
}

function inventoryMovementRequest(
  fixture: DomainFixture,
  resourceId: string,
  direction: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "inventory.recordMovement",
    fixture,
    inputs: [
      { id: "direction", value: { kind: "text", value: direction } },
      {
        id: "movementReference",
        value: { kind: "text", value: "movement.production-consumption.3001" },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
    ],
    resourceId,
    suffix: "production-consumption-3001",
    validAt: changedAt,
  });
}

function inventoryReceiptRequest(
  fixture: DomainFixture,
  resourceId: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "inventory.recordReceipt",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      {
        id: "receiptReference",
        value: { kind: "text", value: "receipt.production.3001" },
      },
    ],
    resourceId,
    suffix: "production-output-3001",
    validAt: changedAt,
  });
}

function manufacturingRequirementRequest(
  fixture: DomainFixture,
  suffix: string,
) {
  return proposalRequest({
    actionId: "manufacturing.recordRequirement",
    fixture,
    inputs: [
      { id: "bomReference", value: { kind: "text", value: bomId } },
      { id: "bomRevision", value: { kind: "integer", value: "1" } },
      {
        id: "inputProductReference",
        value: { kind: "text", value: componentProductId },
      },
      {
        id: "inputQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "outputProductReference",
        value: { kind: "text", value: finishedProductId },
      },
      {
        id: "outputQuantity",
        value: { amount: "11", kind: "quantity", unit: "each" },
      },
      {
        id: "requirementReference",
        value: {
          kind: "text",
          value: "manufacturing.requirement.customer-3001",
        },
      },
    ],
    resourceId: workId,
    suffix: `requirement-${suffix}`,
    validAt: changedAt,
  });
}

function manufacturingPlanRequest(
  fixture: DomainFixture,
  suffix: string,
  outputQuantity = "10",
) {
  return proposalRequest({
    actionId: "manufacturing.planWork",
    fixture,
    inputs: [
      {
        id: "inputQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "outputQuantity",
        value: { amount: outputQuantity, kind: "quantity", unit: "each" },
      },
      {
        id: "planReference",
        value: { kind: "text", value: "manufacturing.plan.3001" },
      },
    ],
    resourceId: workId,
    suffix: `plan-${suffix}`,
    validAt: changedAt,
  });
}

function manufacturingStartRequest(
  fixture: DomainFixture,
  suffix: string,
  inputQuantity: string,
  bomRevision = "1",
) {
  return proposalRequest({
    actionId: "manufacturing.startWork",
    fixture,
    inputs: [
      { id: "bomRevision", value: { kind: "integer", value: bomRevision } },
      {
        id: "capabilityReference",
        value: { kind: "text", value: "manufacturing.capability.press-01" },
      },
      {
        id: "inputQuantity",
        value: { amount: inputQuantity, kind: "quantity", unit: "each" },
      },
      {
        id: "occurrenceReference",
        value: { kind: "text", value: `manufacturing.start.${suffix}` },
      },
      {
        id: "startedAt",
        value: { kind: "text", value: "2026-08-21T14:00:01Z" },
      },
    ],
    resourceId: workId,
    suffix: `start-${suffix}`,
    validAt: changedAt,
  });
}

function manufacturingCompletionRequest(
  fixture: DomainFixture,
  suffix: string,
  actionId: string,
  consumedQuantity: string,
  producedQuantity: string,
  inputLot: string,
  inputSerial: string,
  outputLot: string,
  outputSerial: string,
) {
  return proposalRequest({
    actionId,
    fixture,
    inputs: [
      { id: "bomRevision", value: { kind: "integer", value: "1" } },
      {
        id: "consumedQuantity",
        value: { amount: consumedQuantity, kind: "quantity", unit: "each" },
      },
      {
        id: "inputLotReference",
        value: { kind: "text", value: inputLot },
      },
      {
        id: "inputSerialReference",
        value: { kind: "text", value: inputSerial },
      },
      {
        id: "occurrenceReference",
        value: {
          kind: "text",
          value: `manufacturing.occurrence.${suffix}-3001`,
        },
      },
      {
        id: "outputLotReference",
        value: { kind: "text", value: outputLot },
      },
      {
        id: "outputSerialReference",
        value: { kind: "text", value: outputSerial },
      },
      {
        id: "producedQuantity",
        value: { amount: producedQuantity, kind: "quantity", unit: "each" },
      },
    ],
    resourceId: workId,
    suffix: `completion-${suffix}`,
    validAt: changedAt,
  });
}

function manufacturingScrapRequest(
  fixture: DomainFixture,
  suffix: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "manufacturing.recordScrap",
    fixture,
    inputs: [
      {
        id: "occurrenceReference",
        value: {
          kind: "text",
          value: `manufacturing.occurrence.scrap-${suffix}-3001`,
        },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
    ],
    resourceId: workId,
    suffix: `scrap-${suffix}-3001`,
    validAt: changedAt,
  });
}

function manufacturingReworkRequest(
  fixture: DomainFixture,
  suffix: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "manufacturing.recordRework",
    fixture,
    inputs: [
      {
        id: "occurrenceReference",
        value: {
          kind: "text",
          value: `manufacturing.occurrence.rework-${suffix}-3001`,
        },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      {
        id: "reworkOf",
        value: {
          kind: "text",
          value: "manufacturing.occurrence.partial-3001",
        },
      },
    ],
    resourceId: workId,
    suffix: `rework-${suffix}-3001`,
    validAt: changedAt,
  });
}

function manufacturingCorrectionRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "manufacturing.correctCompletion",
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: {
          kind: "text",
          value: "manufacturing.occurrence.partial-3001",
        },
      },
      {
        id: "consumedQuantityAdjustment",
        value: { amount: "-0.25", kind: "quantity", unit: "each" },
      },
      {
        id: "producedQuantityAdjustment",
        value: { amount: "-0.5", kind: "quantity", unit: "each" },
      },
      {
        id: "reason",
        value: {
          kind: "text",
          value: "inspection found scrap after completion",
        },
      },
    ],
    resourceId: workId,
    suffix: "correction-3001",
    validAt: changedAt,
  });
}

function receivableRequest(
  fixture: DomainFixture,
  suffix: string,
  manufacturingOperationId: string,
  fulfillmentOperationId: string,
  debitAmount: string,
  creditAmount: string,
  currency: string,
  resourceId = claimId,
  postingReference = "accounting.posting.receivable.3001",
) {
  return proposalRequest({
    actionId: "accounting.postReceivable",
    fixture,
    inputs: [
      { id: "bookReference", value: { kind: "text", value: bookId } },
      {
        id: "claimReference",
        value: { kind: "text", value: "receivable.customer-3001" },
      },
      {
        id: "counterpartyReference",
        value: { kind: "text", value: customerPartyId },
      },
      {
        id: "creditAccountReference",
        value: { kind: "text", value: revenueAccountId },
      },
      {
        id: "creditAmount",
        value: { kind: "decimal", value: creditAmount },
      },
      { id: "currency", value: { kind: "text", value: currency } },
      {
        id: "debitAccountReference",
        value: { kind: "text", value: receivableAccountId },
      },
      {
        id: "debitAmount",
        value: { kind: "decimal", value: debitAmount },
      },
      { id: "eventDate", value: { kind: "text", value: "2026-08-21" } },
      {
        id: "fulfillmentOperationReference",
        value: { kind: "text", value: fulfillmentOperationId },
      },
      { id: "ledgerReference", value: { kind: "text", value: ledgerId } },
      {
        id: "manufacturingOccurrenceReference",
        value: {
          kind: "text",
          value: "manufacturing.occurrence.partial-3001",
        },
      },
      {
        id: "originatingOperationReference",
        value: { kind: "text", value: manufacturingOperationId },
      },
      { id: "postingDate", value: { kind: "text", value: "2026-08-21" } },
      {
        id: "postingReference",
        value: { kind: "text", value: postingReference },
      },
    ],
    resourceId,
    suffix,
    validAt: changedAt,
  });
}

function payableRequest(
  fixture: DomainFixture,
  suffix: string,
  originatingOperationReference: string,
  debitAmount: string,
  creditAmount: string,
) {
  return proposalRequest({
    actionId: "accounting.postPayable",
    fixture,
    inputs: [
      { id: "bookReference", value: { kind: "text", value: bookId } },
      {
        id: "claimReference",
        value: { kind: "text", value: "payable.repost.customer-3001" },
      },
      {
        id: "counterpartyReference",
        value: { kind: "text", value: customerPartyId },
      },
      {
        id: "creditAccountReference",
        value: { kind: "text", value: receivableAccountId },
      },
      {
        id: "creditAmount",
        value: { kind: "decimal", value: creditAmount },
      },
      { id: "currency", value: { kind: "text", value: "BRL" } },
      {
        id: "debitAccountReference",
        value: { kind: "text", value: revenueAccountId },
      },
      {
        id: "debitAmount",
        value: { kind: "decimal", value: debitAmount },
      },
      { id: "eventDate", value: { kind: "text", value: "2026-08-22" } },
      { id: "ledgerReference", value: { kind: "text", value: ledgerId } },
      {
        id: "originatingOperationReference",
        value: { kind: "text", value: originatingOperationReference },
      },
      { id: "postingDate", value: { kind: "text", value: "2026-08-22" } },
      {
        id: "postingReference",
        value: {
          kind: "text",
          value: "accounting.posting.payable.repost.3001",
        },
      },
    ],
    resourceId: claimId,
    suffix,
    validAt: changedAt,
  });
}

function settlementRequest(
  fixture: DomainFixture,
  suffix: string,
  amount: string,
  currency: string,
) {
  return proposalRequest({
    actionId: "accounting.applySettlement",
    fixture,
    inputs: [
      { id: "amount", value: { kind: "decimal", value: amount } },
      { id: "currency", value: { kind: "text", value: currency } },
      {
        id: "operationReference",
        value: {
          kind: "text",
          value: `operation.accounting-foundation.settlement-${suffix}`,
        },
      },
      {
        id: "paymentDate",
        value: { kind: "text", value: "2026-08-22" },
      },
      {
        id: "settlementReference",
        value: { kind: "text", value: `payment.${suffix}` },
      },
    ],
    resourceId: claimId,
    suffix: `settlement-${suffix}`,
    validAt: changedAt,
  });
}

function reversalRequest(
  fixture: DomainFixture,
  reversalOf: string,
  origin: string,
) {
  return proposalRequest({
    actionId: "accounting.reversePosting",
    fixture,
    inputs: [
      {
        id: "creditAccountReference",
        value: { kind: "text", value: receivableAccountId },
      },
      {
        id: "debitAccountReference",
        value: { kind: "text", value: revenueAccountId },
      },
      { id: "eventDate", value: { kind: "text", value: "2026-08-23" } },
      {
        id: "originatingOperationReference",
        value: { kind: "text", value: origin },
      },
      { id: "postingDate", value: { kind: "text", value: "2026-08-23" } },
      {
        id: "postingReference",
        value: {
          kind: "text",
          value: "accounting.posting.reversal.3001",
        },
      },
      { id: "reversalOf", value: { kind: "text", value: reversalOf } },
    ],
    resourceId: claimId,
    suffix: "reversal-3001",
    validAt: changedAt,
  });
}

function accountingCorrectionRequest(
  fixture: DomainFixture,
  correctionOf: string,
  origin: string,
) {
  return proposalRequest({
    actionId: "accounting.correctPosting",
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: { kind: "text", value: correctionOf },
      },
      {
        id: "creditAccountReference",
        value: { kind: "text", value: revenueAccountId },
      },
      {
        id: "debitAccountReference",
        value: { kind: "text", value: receivableAccountId },
      },
      {
        id: "originatingOperationReference",
        value: { kind: "text", value: origin },
      },
      { id: "postingDate", value: { kind: "text", value: "2026-08-24" } },
      {
        id: "postingReference",
        value: {
          kind: "text",
          value: "accounting.posting.correction.3001",
        },
      },
      {
        id: "reason",
        value: { kind: "text", value: "classification correction" },
      },
    ],
    resourceId: claimId,
    suffix: "posting-correction-3001",
    validAt: changedAt,
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

function integerValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "integer" ? [value.value] : [],
  );
}

function decimalValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "decimal" ? [value.value] : [],
  );
}

function quantityValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "quantity" ? [`${value.amount} ${value.unit}`] : [],
  );
}

function currentQuantity(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  relationIds: readonly string[],
): string | undefined {
  return currentValue(response, relationIds, "quantity");
}

function quantityAmount(value: string | undefined): string {
  const match = /^(-?(?:0|[1-9]\d*)(?:\.\d+)?) each$/u.exec(value ?? "");
  assert.ok(match);
  const amount = match[1];
  assert.ok(amount);
  return amount;
}

function currentDecimal(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  relationIds: readonly string[],
): string | undefined {
  return currentValue(response, relationIds, "decimal");
}

function currentValue(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  relationIds: readonly string[],
  kind: "decimal" | "quantity",
): string | undefined {
  const latestByRelation = new Map<string, bigint>();
  for (const result of response.values) {
    for (const dependency of result.dependencies) {
      if (
        !isSelectedDependency(dependency.role) ||
        !relationIds.includes(dependency.relationId)
      ) {
        continue;
      }
      const latest = latestByRelation.get(dependency.relationId);
      if (latest === undefined || dependency.commitSequence > latest) {
        latestByRelation.set(dependency.relationId, dependency.commitSequence);
      }
    }
  }
  if (latestByRelation.size !== relationIds.length) {
    return undefined;
  }
  const shapes = valueShapes(response);
  const current = response.values.flatMap((result, index) => {
    const hasEveryLatestDependency = relationIds.every((relationId) => {
      const latest = latestByRelation.get(relationId);
      return result.dependencies.some(
        (dependency) =>
          isSelectedDependency(dependency.role) &&
          dependency.relationId === relationId &&
          dependency.commitSequence === latest,
      );
    });
    if (!hasEveryLatestDependency) {
      return [];
    }
    const shape = shapes[index];
    if (kind === "decimal") {
      return shape?.kind === "decimal" ? [shape.value] : [];
    }
    return shape?.kind === "quantity"
      ? [`${shape.amount} ${shape.unit}`]
      : [];
  });
  return current.length === 1 ? current[0] : undefined;
}

function isSelectedDependency(role: LineageRole): boolean {
  return (
    role === LineageRole.SUPPORTING ||
    role === LineageRole.COMPUTATION_DEPENDENCY
  );
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
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
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
