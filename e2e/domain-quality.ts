import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
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
  actionClient,
  adminClient,
  command,
  compileQuality,
  definitionClient,
  dispatchOnce,
  effectClient,
  evidenceInput,
  expectConnectCode,
  explainOperation,
  historyClient,
  loadPolicy,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  providerOperation,
  publishDefinition,
  qualityVocabulary,
  recordEvidence,
  registerWorker,
  remappedVocabulary,
  repositoryRoot,
  restartRestate,
  runLeakageGate,
  runLeakageMutant,
  semanticQuery,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  waitForConnectorStatus,
  waitForState,
  worldClient,
  type ManagedProcess,
} from "./domain-quality/support.js";
import {
  acceptanceQuery,
  actionExplanation,
  boolValues,
  claimSnapshot,
  explanationShape,
  hasRelationLineage,
  hasRivalMeasurements,
  hasSourceLineage,
  instant,
  integerValues,
  interval,
  normalizedDefinition,
  proposeQuarantine,
  proposeRelease,
  recordRemappedEvidence,
  relationQuery,
  releaseAt,
  sameBooleans,
  sameStrings,
  semanticClaimCount,
  specificationChange,
  writeQualityPolicies,
  yearEnd,
  yearStart,
} from "./domain-quality/laws.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const observedAt = new Date("2026-03-15T12:00:00.000Z");

function observe(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function inject(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const quality = await compileQuality("quality.zoen.ts", qualityVocabulary);
  const remapped = await compileQuality(
    "quality-remapped.zoen.ts",
    remappedVocabulary,
  );
  const releasePolicy = await loadPolicy(
    "release.cedar",
    qualityVocabulary.releaseAction,
    "policy.quality.release",
    1,
  );
  const revokedReleasePolicy = await loadPolicy(
    "release-revoked.cedar",
    qualityVocabulary.releaseAction,
    "policy.quality.release",
    2,
  );
  const quarantinePolicy = await loadPolicy(
    "quarantine.cedar",
    qualityVocabulary.quarantineAction,
    "policy.quality.quarantine",
    1,
  );
  const remappedReleasePolicy = await loadPolicy(
    "remapped-release.cedar",
    remappedVocabulary.releaseAction,
    "policy.lab.release",
    7,
  );
  const remappedQuarantinePolicy = await loadPolicy(
    "remapped-quarantine.cedar",
    remappedVocabulary.quarantineAction,
    "policy.lab.quarantine",
    8,
  );
  const initialPolicies = [
    releasePolicy,
    quarantinePolicy,
    remappedReleasePolicy,
    remappedQuarantinePolicy,
  ];
  const policyManifestPath = path.join(
    repositoryRoot,
    "e2e",
    "domain-quality",
    ".generated",
    "policies.json",
  );
  await writeQualityPolicies(
    policyManifestPath,
    quality,
    remapped,
    initialPolicies,
  );

  const agentAToken = await oidcToken("quality-agent-a");
  const agentBToken = await oidcToken("quality-agent-b");
  const inspectorToken = await oidcToken("quality-inspector-a");
  const supervisorToken = await oidcToken("quality-supervisor-a");
  const workerAToken = await oidcToken("effect-worker-a");
  const workerBToken = await oidcToken("effect-worker-b");
  const reconcilerToken = await oidcToken("effect-reconciler-a");
  const actionA = actionClient(agentAToken);
  const actionB = actionClient(agentBToken);
  const inspector = actionClient(inspectorToken);
  const supervisor = actionClient(supervisorToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const effectA = effectClient(agentAToken);
  const reconciler = effectClient(reconcilerToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const historyA = historyClient(agentAToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  let zoend = await startZoend(policyManifestPath);
  processes.push(zoend);
  processes.push(await startFaultProvider());
  processes.push(await startConnector());
  processes.push(
    await startWorker({
      [tenantA]: workerAToken,
      [tenantB]: workerBToken,
    }),
  );
  await admin.connect();

  try {
    const registration = await registerWorker();
    observe(
      "realRestateWorkerRegistered",
      /ZoenEffect|deployment/i.test(registration),
    );
    const definitionACommit = await publishDefinition(
      definitionA,
      tenantA,
      quality,
    );
    const definitionBCommit = await publishDefinition(
      definitionB,
      tenantB,
      remapped,
    );
    observe(
      "qualityPackagesPublishedThroughDefinitionService",
      definitionACommit > 0n &&
        definitionBCommit > 0n &&
        quality.digest !== remapped.digest,
    );
    observe(
      "definitionIdRemapPreservesOntologyShape",
      normalizedDefinition(quality, "quality.") ===
        normalizedDefinition(remapped, "lab."),
    );

    const claimCountBeforeMalformed = await semanticClaimCount(admin, tenantA);
    const malformedType = await expectConnectCode(
      () =>
        recordEvidence(worldA, {
          claimId: "claim.quality.malformed-type",
          fixture: quality,
          relationId: qualityVocabulary.measurementRelation,
          sourceId: "source.sensor-a",
          tenantId: tenantA,
          time: interval(yearStart, yearEnd),
          value: { kind: "text", value: "72 MPa" },
        }),
      Code.InvalidArgument,
    );
    const malformedUnit = await expectConnectCode(
      () =>
        recordEvidence(worldA, {
          claimId: "claim.quality.malformed-unit",
          fixture: quality,
          relationId: qualityVocabulary.measurementRelation,
          sourceId: "source.sensor-a",
          tenantId: tenantA,
          time: interval(yearStart, yearEnd),
          value: { amount: "72", kind: "quantity", unit: "psi" },
        }),
      Code.InvalidArgument,
    );
    const malformedNumber = await expectConnectCode(
      () =>
        recordEvidence(worldA, {
          claimId: "claim.quality.malformed-number",
          fixture: quality,
          relationId: qualityVocabulary.measurementRelation,
          sourceId: "source.sensor-a",
          tenantId: tenantA,
          time: interval(yearStart, yearEnd),
          value: { kind: "integer", value: "072000" },
        }),
      Code.InvalidArgument,
    );
    const claimCountAfterMalformed = await semanticClaimCount(admin, tenantA);
    inject("malformed-measurement-type");
    inject("malformed-measurement-unit");
    inject("noncanonical-measurement-number");
    observe(
      "malformedMeasurementsRejectedWithoutWrites",
      [malformedType, malformedUnit, malformedNumber].every(
        (code) => code === Code.InvalidArgument,
      ) && claimCountAfterMalformed === claimCountBeforeMalformed,
    );

    const specificationV1Commit = await recordEvidence(worldA, {
      claimId: "claim.quality.specification-v1-minimum",
      fixture: quality,
      relationId: qualityVocabulary.specificationMinimumRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: interval(yearStart, specificationChange),
      value: { kind: "integer", value: "70000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.specification-v1-version",
      fixture: quality,
      relationId: qualityVocabulary.specificationVersionRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: interval(yearStart, specificationChange),
      value: { kind: "integer", value: "1" },
    });
    const sensorCommit = await recordEvidence(worldA, {
      claimId: "claim.quality.sensor-original",
      fixture: quality,
      relationId: qualityVocabulary.measurementRelation,
      sourceId: "source.sensor-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "72000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.sensor-uncertainty",
      fixture: quality,
      relationId: qualityVocabulary.uncertaintyRelation,
      sourceId: "source.sensor-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "400" },
    });
    const inspectorCommit = await recordEvidence(worldA, {
      claimId: "claim.quality.inspector-original",
      fixture: quality,
      relationId: qualityVocabulary.measurementRelation,
      sourceId: "source.inspector-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "71000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.inspector-uncertainty",
      fixture: quality,
      relationId: qualityVocabulary.uncertaintyRelation,
      sourceId: "source.inspector-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "200" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.accepted-original",
      fixture: quality,
      relationId: qualityVocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "integer", value: "71000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.lot-product",
      fixture: quality,
      relationId: "quality.lotProduct",
      sourceId: "source.manufacturing",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "text", value: "product.widget-42/lot.2026-0042" },
    });
    const initialAcceptance = await acceptanceQuery(
      worldA,
      quality,
      tenantA,
      observedAt,
    );
    observe(
      "initialSpecificationAcceptsBothRivalMeasurements",
      boolValues(initialAcceptance).length > 0 &&
        boolValues(initialAcceptance).every(Boolean),
    );
    observe(
      "rivalSensorAndInspectorClaimsRemainVisible",
      hasRivalMeasurements(
        await relationQuery(
          worldA,
          quality,
          tenantA,
          qualityVocabulary.measurementRelation,
          observedAt,
        ),
        ["source.inspector-a", "source.sensor-a"],
      ),
    );

    const beforeClaimRestartPid = zoend.child.pid;
    await stopProcess(zoend);
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    observe(
      "runtimeRestartedAfterClaimIngest",
      beforeClaimRestartPid !== zoend.child.pid,
    );

    const specificationV2Commit = await recordEvidence(worldA, {
      claimId: "claim.quality.specification-v2-minimum",
      fixture: quality,
      relationId: qualityVocabulary.specificationMinimumRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: interval(specificationChange, yearEnd),
      value: { kind: "integer", value: "75000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.specification-v2-version",
      fixture: quality,
      relationId: qualityVocabulary.specificationVersionRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: interval(specificationChange, yearEnd),
      value: { kind: "integer", value: "2" },
    });
    const failingAcceptance = await acceptanceQuery(
      worldA,
      quality,
      tenantA,
      releaseAt,
    );
    const preRetestCut = failingAcceptance.actualCommitSequence;
    const failingEvidence = boolValues(failingAcceptance);
    observe(
      "effectiveSpecificationChangeMakesAcceptanceFail",
      sensorCommit < specificationV2Commit &&
        inspectorCommit < specificationV2Commit &&
        specificationV1Commit < specificationV2Commit &&
        failingEvidence.length > 0 &&
        failingEvidence.every((value) => !value),
    );
    observe(
      "acceptanceComputationCarriesMeasurementUncertaintyAndSpecLineage",
      hasSourceLineage(failingAcceptance, [
        "source.inspector-a",
        "source.quality-engineering",
        "source.sensor-a",
      ]) &&
        hasRelationLineage(failingAcceptance, [
          qualityVocabulary.measurementRelation,
          qualityVocabulary.specificationMinimumRelation,
          qualityVocabulary.uncertaintyRelation,
        ]),
    );
    await recordEvidence(worldA, {
      claimId: "claim.quality.nonconformance-nc-42",
      fixture: quality,
      relationId: qualityVocabulary.nonconformanceRelation,
      sourceId: "source.inspector-a",
      tenantId: tenantA,
      time: instant(releaseAt),
      value: { kind: "text", value: "NC-42 tensile strength below v2" },
    });

    const deniedProposal = await proposeRelease(actionA, quality, "denied");
    const deniedDependencies =
      deniedProposal.stateBasis?.dependencies ?? [];
    observe(
      "releaseDeniedUnderFailingComputedEvidence",
      deniedProposal.decision === PolicyDecision.DENY &&
        deniedProposal.proposal === undefined &&
        deniedProposal.evaluationError.length === 0 &&
        deniedDependencies.some(
          (dependency) =>
            dependency.claimId === "claim.quality.accepted-original",
        ) &&
        deniedDependencies.some(
          (dependency) =>
            dependency.claimId === "claim.quality.specification-v2-minimum",
        ),
    );
    observe(
      "unsatisfiedPreconditionReturnsStateBasisInsteadOfEvaluationError",
      deniedProposal.stateBasis?.digest.length === 64 &&
        deniedDependencies.length === 2,
    );

    const quarantineProposal = await proposeQuarantine(actionA, quality);
    assert.equal(quarantineProposal.decision, PolicyDecision.PERMIT);
    assert.equal(quarantineProposal.proposal?.status, ProposalStatus.READY);
    assert.ok(quarantineProposal.proposal);
    const quarantineCommit = await actionA.commit({
      operationId: quarantineProposal.proposal.operationId,
      proposalId: quarantineProposal.proposal.proposalId,
    });
    assert.equal(quarantineCommit.status, CommitStatus.COMMITTED);
    assert.ok(quarantineCommit.receipt);
    const quarantineEffectRequestId =
      quarantineCommit.receipt.effectRequestIds[0];
    assert.ok(quarantineEffectRequestId);
    const quarantineIdempotencyKey = `idempotency.${tenantA}.${quarantineEffectRequestId}`;
    await setProviderMode("timeout_after_delivery");
    await dispatchOnce();
    const unknownQuarantine = await waitForState(
      effectA,
      quarantineEffectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    const remoteQuarantine = await providerOperation(
      quarantineIdempotencyKey,
    );
    assert.ok(remoteQuarantine);
    observe(
      "quarantineTimeoutStaysUnknownWithoutBlindRetry",
      unknownQuarantine.request?.state === EffectKnowledgeState.UNKNOWN &&
        remoteQuarantine.requests === 1,
    );
    inject("external-quarantine-timeout-after-delivery");

    const beforeReconciliationRestartPid = zoend.child.pid;
    await stopProcess(zoend);
    await restartRestate();
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    const quarantineStatus = await waitForConnectorStatus(
      quarantineIdempotencyKey,
    );
    const reconciledQuarantine = await reconciler.reconcile({
      effectRequestId: quarantineEffectRequestId,
      evidence: evidenceInput(
        quarantineStatus,
        "quality-quarantine-confirmed",
      ),
    });
    observe(
      "restartPrecedesIndependentQuarantineReconciliation",
      beforeReconciliationRestartPid !== zoend.child.pid &&
        reconciledQuarantine.snapshot?.request?.state ===
          EffectKnowledgeState.CONFIRMED,
    );
    const quarantineExplanation = await explainOperation(
      historyA,
      quarantineCommit.receipt.operationId,
    );
    const quarantineAction = actionExplanation(quarantineExplanation);
    observe(
      "quarantineEffectAndReconciliationUseExistingCausalPath",
      quarantineExplanation.complete &&
        quarantineExplanation.gaps.length === 0 &&
        quarantineAction.effects.length === 1 &&
        quarantineAction.effects[0]?.attempts.length === 1 &&
        quarantineAction.effects[0].reconciliations.length === 1,
    );

    const originalBeforeRetest = await claimSnapshot(
      admin,
      tenantA,
      "claim.quality.inspector-original",
    );
    const retestCommit = await recordEvidence(worldA, {
      claimId: "claim.quality.inspector-retest",
      fixture: quality,
      relationId: qualityVocabulary.measurementRelation,
      sourceId: "source.inspector-retest",
      tenantId: tenantA,
      time: interval(releaseAt, yearEnd),
      value: { kind: "integer", value: "78000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.retest-uncertainty",
      fixture: quality,
      relationId: qualityVocabulary.uncertaintyRelation,
      sourceId: "source.inspector-retest",
      tenantId: tenantA,
      time: interval(releaseAt, yearEnd),
      value: { kind: "integer", value: "300" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.accepted-retest",
      fixture: quality,
      relationId: qualityVocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-supervisor",
      tenantId: tenantA,
      time: interval(releaseAt, yearEnd),
      value: { kind: "integer", value: "78000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.retest-corrects-original",
      fixture: quality,
      relationId: qualityVocabulary.correctionRelation,
      sourceId: "source.quality-supervisor",
      tenantId: tenantA,
      time: instant(releaseAt),
      value: {
        kind: "text",
        value: "claim.quality.inspector-original",
      },
    });
    const originalAfterRetest = await claimSnapshot(
      admin,
      tenantA,
      "claim.quality.inspector-original",
    );
    const currentMeasurements = await relationQuery(
      worldA,
      quality,
      tenantA,
      qualityVocabulary.measurementRelation,
      releaseAt,
    );
    const historicalMeasurements = await semanticQuery(worldA, {
      fixture: quality,
      selection: {
        id: qualityVocabulary.measurementRelation,
        kind: "relation",
      },
      snapshotCommit: preRetestCut,
      tenantId: tenantA,
      validAt: releaseAt,
    });
    observe(
      "retestContradictsWithoutMutatingOriginalMeasurement",
      retestCommit > preRetestCut &&
        JSON.stringify(originalBeforeRetest) ===
          JSON.stringify(originalAfterRetest) &&
        sameStrings(integerValues(currentMeasurements), [
          "71000",
          "72000",
          "78000",
        ]) &&
        sameStrings(integerValues(historicalMeasurements), ["71000", "72000"]),
    );
    observe(
      "retestKeepsOriginalsVisibleAsRivals",
      hasRivalMeasurements(currentMeasurements, [
        "source.inspector-a",
        "source.inspector-retest",
        "source.sensor-a",
      ]),
    );
    const correctedAcceptance = await acceptanceQuery(
      worldA,
      quality,
      tenantA,
      releaseAt,
    );
    observe(
      "retestProducesContradictoryAcceptanceResults",
      boolValues(correctedAcceptance).some(Boolean) &&
        boolValues(correctedAcceptance).some((value) => !value),
    );

    await writeQualityPolicies(
      policyManifestPath,
      quality,
      remapped,
      [
        revokedReleasePolicy,
        quarantinePolicy,
        remappedReleasePolicy,
        remappedQuarantinePolicy,
      ],
    );
    await stopProcess(zoend);
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);

    const staleProposal = await proposeRelease(
      actionA,
      quality,
      "stale",
    );
    assert.ok(staleProposal.proposal);
    assert.equal(
      staleProposal.proposal.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    const revokedApproval = await inspector.approve({
      approvalId: "approval.quality.revoked-inspector",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: staleProposal.proposal.proposalId,
    });
    const supervisorApproval = await supervisor.approve({
      approvalId: "approval.quality.supervisor-stale",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: staleProposal.proposal.proposalId,
    });
    observe(
      "revokedInspectorCannotApproveQualityRelease",
      revokedApproval.decision === PolicyDecision.DENY &&
        revokedApproval.approval === undefined &&
        supervisorApproval.decision === PolicyDecision.PERMIT &&
        supervisorApproval.approval?.approvedBy === "actor.supervisor.a",
    );
    inject("inspector-authority-revoked");
    const specificationV3Commit = await recordEvidence(worldA, {
      claimId: "claim.quality.specification-v3-minimum",
      fixture: quality,
      relationId: qualityVocabulary.specificationMinimumRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: instant(releaseAt),
      value: { kind: "integer", value: "76000" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.specification-v3-version",
      fixture: quality,
      relationId: qualityVocabulary.specificationVersionRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: instant(releaseAt),
      value: { kind: "integer", value: "3" },
    });
    const staleProposalBasis = staleProposal.proposal.stateBasis;
    assert.ok(staleProposalBasis);
    const staleRelease = await actionA.commit({
      operationId: staleProposal.proposal.operationId,
      proposalId: staleProposal.proposal.proposalId,
    });
    observe(
      "specificationChangeMakesReleaseBasisStale",
      specificationV3Commit >
        staleProposalBasis.observedCommitSequence &&
        staleRelease.status === CommitStatus.STALE &&
        staleRelease.receipt === undefined &&
        staleRelease.currentStateBasis?.digest !==
          staleProposal.proposal.stateBasis?.digest,
    );
    inject("specification-change-after-release-proposal");

    const currentAcceptance = await acceptanceQuery(
      worldA,
      quality,
      tenantA,
      releaseAt,
    );
    const releaseProposal = await proposeRelease(
      actionA,
      quality,
      "released",
    );
    assert.ok(releaseProposal.proposal);
    const releaseApproval = await supervisor.approve({
      approvalId: "approval.quality.supervisor-release",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: releaseProposal.proposal.proposalId,
    });
    assert.equal(releaseApproval.decision, PolicyDecision.PERMIT);
    const released = await actionA.commit({
      operationId: releaseProposal.proposal.operationId,
      proposalId: releaseProposal.proposal.proposalId,
    });
    assert.equal(released.status, CommitStatus.COMMITTED);
    assert.ok(released.receipt);
    const releaseEffectRequestId = released.receipt.effectRequestIds[0];
    assert.ok(releaseEffectRequestId);
    await setProviderMode("accepted_pending");
    await dispatchOnce();
    await waitForState(
      effectA,
      releaseEffectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    const releaseIdempotencyKey = `idempotency.${tenantA}.${releaseEffectRequestId}`;
    const releaseStatus = await waitForConnectorStatus(releaseIdempotencyKey);
    const reconciledRelease = await reconciler.reconcile({
      effectRequestId: releaseEffectRequestId,
      evidence: evidenceInput(releaseStatus, "quality-release-confirmed"),
    });
    assert.equal(
      reconciledRelease.snapshot?.request?.state,
      EffectKnowledgeState.CONFIRMED,
    );
    const releaseExplanation = await explainOperation(
      historyA,
      released.receipt.operationId,
    );
    observe(
      "releasedLotHasCompleteHistoricalExplanation",
      releaseExplanation.complete &&
        releaseExplanation.gaps.length === 0 &&
        actionExplanation(releaseExplanation).definition?.reference?.digest ===
          quality.digest,
    );
    const releaseExplanationShape = explanationShape(releaseExplanation);

    await recordRemappedEvidence(worldB, remapped);
    const remappedAcceptance = await acceptanceQuery(
      worldB,
      remapped,
      tenantB,
      releaseAt,
    );
    observe(
      "remappedQualityIdsProduceSameComputedBehavior",
      sameBooleans(
        boolValues(currentAcceptance),
        boolValues(remappedAcceptance),
      ),
    );
    const remappedProposal = await proposeRelease(
      actionB,
      remapped,
      "remapped",
    );
    assert.ok(remappedProposal.proposal);
    assert.equal(remappedProposal.proposal.status, ProposalStatus.READY);
    const remappedCommit = await actionB.commit({
      operationId: remappedProposal.proposal.operationId,
      proposalId: remappedProposal.proposal.proposalId,
    });
    observe(
      "twoTenantsUseDifferentDefinitionsAndPoliciesOnOneBinary",
      remappedCommit.status === CommitStatus.COMMITTED &&
        remappedCommit.receipt?.definition?.digest === remapped.digest &&
        remappedCommit.receipt.policy?.revision?.policyId ===
          remappedReleasePolicy.policyId &&
        released.receipt.policy?.revision?.policyId ===
          revokedReleasePolicy.policyId &&
        remapped.digest !== quality.digest &&
        remappedReleasePolicy.digest !== revokedReleasePolicy.digest,
    );

    await stopProcess(zoend);
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    const finalHistory = historyClient(agentAToken);
    const releasedAfterFinalRestart = await explainOperation(
      finalHistory,
      released.receipt.operationId,
    );
    observe(
      "releasedExplanationReproducesAfterLaterChangesAndRestart",
      releasedAfterFinalRestart.complete &&
        explanationShape(releasedAfterFinalRestart) ===
          releaseExplanationShape,
    );
    const historicalSpec = await semanticQuery(worldA, {
      fixture: quality,
      selection: {
        id: qualityVocabulary.specificationMinimumRelation,
        kind: "relation",
      },
      snapshotCommit: preRetestCut,
      tenantId: tenantA,
      validAt: releaseAt,
    });
    observe(
      "historicalMeasurementAndSpecificationCutsRemainReproducible",
      sameStrings(integerValues(historicalMeasurements), ["71000", "72000"]) &&
        sameStrings(integerValues(historicalSpec), ["75000"]),
    );

    const cleanLeakage = await runLeakageGate();
    const mutantLeakage = await runLeakageMutant();
    observe(
      "genericProductionModulesContainNoKnownDomainBranches",
      cleanLeakage.code === 0 &&
        JSON.parse(cleanLeakage.stdout).findings.length === 0,
    );
    observe(
      "domainBranchMutationIsKilled",
      mutantLeakage.code !== 0 &&
        /quality\.releaseLot/u.test(mutantLeakage.stderr),
    );
    const coreTree = await command("cargo", [
      "tree",
      "--package",
      "zoen-core",
      "--depth",
      "1",
    ]);
    observe(
      "zoenCoreStillHasNoVendorOrIoDependencies",
      coreTree.split("\n").filter(Boolean).length === 1,
    );
    const commitLedgers = await admin.query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND (tablename LIKE '%ledger%' OR tablename LIKE '%commits%')
       ORDER BY tablename`,
    );
    observe(
      "authorityCommitsRemainsTheOnlyCommitLedger",
      sameStrings(
        commitLedgers.rows.map((row) => row.tablename),
        ["authority_commits"],
      ),
    );
    observe(
      "samePublicApisDriveQualityEndToEnd",
      definitionACommit > 0n &&
        failingAcceptance.actualCommitSequence > definitionACommit &&
        deniedProposal.decision === PolicyDecision.DENY &&
        quarantineCommit.status === CommitStatus.COMMITTED &&
        reconciledQuarantine.snapshot?.request?.state ===
          EffectKnowledgeState.CONFIRMED &&
        releasedAfterFinalRestart.complete,
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./u);
    const keycloakVersion = await command("docker", [
      "compose",
      "--project-name",
      "zoen-domain-quality",
      "--file",
      "e2e/domain-quality/compose.yaml",
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
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
        restate: "1.7.2",
      },
      definitions: {
        quality: {
          definitionId: quality.definition.definitionId,
          digest: quality.digest,
          revision: quality.definition.revision.toString(),
        },
        remapped: {
          definitionId: remapped.definition.definitionId,
          digest: remapped.digest,
          revision: remapped.definition.revision.toString(),
        },
      },
      effects: {
        quarantine: quarantineEffectRequestId,
        release: releaseEffectRequestId,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      historicalCuts: {
        beforeRetest: preRetestCut.toString(),
        retest: retestCommit.toString(),
        specificationV3: specificationV3Commit.toString(),
      },
      operations: {
        quarantine: quarantineCommit.receipt.operationId,
        release: released.receipt.operationId,
        remappedRelease: remappedCommit.receipt?.operationId,
      },
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      scenario: "domain-quality",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "domain-quality.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    for (const process of processes.reverse()) {
      if (process.child.exitCode === null && process.child.signalCode === null) {
        await stopProcess(process);
      }
    }
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
