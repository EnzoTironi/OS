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
  LineageRole,
  type SemanticQueryResponse,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  actionInput,
  adminClient,
  command,
  compileQuality,
  definitionClient,
  dispatchOnce,
  effectClient,
  evidenceInput,
  expectConnectCode,
  explainOperation,
  explainProposal,
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
  writePolicyManifest,
  type ActionClient,
  type EvidenceTime,
  type ManagedProcess,
  type PolicyFixture,
  type QualityFixture,
  type SemanticValue,
  type WorldClient,
} from "./domain-quality/support.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const observedAt = new Date("2026-03-15T12:00:00.000Z");
const releaseAt = new Date("2026-08-15T12:00:00.000Z");
const yearStart = new Date("2026-01-01T00:00:00.000Z");
const specificationChange = new Date("2026-06-01T00:00:00.000Z");
const yearEnd = new Date("2027-01-01T00:00:00.000Z");

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
          value: { amount: "072", kind: "quantity", unit: "MPa" },
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
      value: { amount: "70", kind: "quantity", unit: "MPa" },
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
      value: { amount: "72", kind: "quantity", unit: "MPa" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.sensor-uncertainty",
      fixture: quality,
      relationId: qualityVocabulary.uncertaintyRelation,
      sourceId: "source.sensor-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { amount: "0.4", kind: "quantity", unit: "MPa" },
    });
    const inspectorCommit = await recordEvidence(worldA, {
      claimId: "claim.quality.inspector-original",
      fixture: quality,
      relationId: qualityVocabulary.measurementRelation,
      sourceId: "source.inspector-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { amount: "71", kind: "quantity", unit: "MPa" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.inspector-uncertainty",
      fixture: quality,
      relationId: qualityVocabulary.uncertaintyRelation,
      sourceId: "source.inspector-a",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { amount: "0.2", kind: "quantity", unit: "MPa" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.accepted-original",
      fixture: quality,
      relationId: qualityVocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-engineering",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { amount: "71", kind: "quantity", unit: "MPa" },
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
      value: { amount: "75", kind: "quantity", unit: "MPa" },
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

    const deniedProposal = await proposeRelease(
      actionA,
      quality,
      "denied",
      false,
    );
    assert.equal(deniedProposal.decision, PolicyDecision.PERMIT);
    assert.equal(
      deniedProposal.proposal?.status,
      ProposalStatus.AWAITING_APPROVAL,
    );
    assert.ok(deniedProposal.proposal);
    const beforeProposalRestartPid = zoend.child.pid;
    await stopProcess(zoend);
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    observe(
      "runtimeRestartedAfterReleaseProposal",
      beforeProposalRestartPid !== zoend.child.pid,
    );
    const deniedApproval = await inspector.approve({
      approvalId: "approval.quality.release-denied",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: deniedProposal.proposal.proposalId,
    });
    assert.equal(deniedApproval.decision, PolicyDecision.PERMIT);
    const deniedRelease = await actionA.commit({
      operationId: deniedProposal.proposal.operationId,
      proposalId: deniedProposal.proposal.proposalId,
    });
    const deniedExplanation = await explainProposal(
      historyA,
      deniedProposal.proposal.proposalId,
    );
    const deniedAction = actionExplanation(deniedExplanation);
    const deniedDependencies =
      deniedAction.proposalStateBasis?.basis?.dependencies ?? [];
    observe(
      "releaseDeniedUnderFailingComputedEvidence",
      deniedRelease.status === CommitStatus.DENIED &&
        deniedRelease.receipt === undefined &&
        deniedDependencies.some(
          (dependency) =>
            dependency.claimId === "claim.quality.accepted-original",
        ) &&
        deniedDependencies.some(
          (dependency) =>
            dependency.claimId ===
            "claim.quality.specification-v2-minimum",
        ),
    );
    observe(
      "deniedReleaseHasCompleteCausalExplanation",
      deniedExplanation.complete &&
        deniedExplanation.gaps.length === 0 &&
        deniedAction.definition?.reference?.digest === quality.digest &&
        deniedAction.policies.length === 2 &&
        deniedAction.policies.every(
          (policy) =>
            policy.policy?.revision?.digest.length === 64 &&
            policy.policy.determiningPolicyIds.length > 0,
        ),
    );
    const deniedExplanationShape = explanationShape(deniedExplanation);

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
      value: { amount: "78", kind: "quantity", unit: "MPa" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.retest-uncertainty",
      fixture: quality,
      relationId: qualityVocabulary.uncertaintyRelation,
      sourceId: "source.inspector-retest",
      tenantId: tenantA,
      time: interval(releaseAt, yearEnd),
      value: { amount: "0.3", kind: "quantity", unit: "MPa" },
    });
    await recordEvidence(worldA, {
      claimId: "claim.quality.accepted-retest",
      fixture: quality,
      relationId: qualityVocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-supervisor",
      tenantId: tenantA,
      time: interval(releaseAt, yearEnd),
      value: { amount: "78", kind: "quantity", unit: "MPa" },
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
        sameStrings(quantityValues(currentMeasurements), ["71", "72", "78"]) &&
        sameStrings(quantityValues(historicalMeasurements), ["71", "72"]),
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
      acceptedByComputation(correctedAcceptance),
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
      value: { amount: "76", kind: "quantity", unit: "MPa" },
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
      acceptedByComputation(currentAcceptance),
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
      acceptedByComputation(remappedAcceptance),
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
    const deniedAfterFinalRestart = await explainProposal(
      finalHistory,
      deniedProposal.proposal.proposalId,
    );
    const releasedAfterFinalRestart = await explainOperation(
      finalHistory,
      released.receipt.operationId,
    );
    observe(
      "deniedAndReleasedExplanationsReproduceAfterLaterChangesAndRestart",
      deniedAfterFinalRestart.complete &&
        releasedAfterFinalRestart.complete &&
        explanationShape(deniedAfterFinalRestart) ===
          deniedExplanationShape &&
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
      sameStrings(quantityValues(historicalMeasurements), ["71", "72"]) &&
        sameStrings(quantityValues(historicalSpec), ["75"]),
    );

    const cleanLeakage = await runLeakageGate();
    const mutantLeakage = await runLeakageGate(
      "e2e/domain-quality/mutants/domain-branch.rs",
    );
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
    const genericDiff = await command("git", [
      "diff",
      "--name-only",
      "ea7cbad8476b7f148e4908d2b998009f5dce6815",
      "--",
      "crates/zoen-core/src",
      "crates/zoen-engine/src",
      "crates/zoen-query/src",
      "crates/zoen-adapters/src",
      "apps/zoend/src",
    ]);
    observe(
      "qualityRequiredNoGenericRustSourceChange",
      genericDiff.length === 0,
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
        deniedRelease.status === CommitStatus.DENIED &&
        quarantineCommit.status === CommitStatus.COMMITTED &&
        reconciledQuarantine.snapshot?.request?.state ===
          EffectKnowledgeState.CONFIRMED &&
        deniedAfterFinalRestart.complete,
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
        deniedRelease: deniedProposal.proposal.operationId,
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

async function writeQualityPolicies(
  outputPath: string,
  quality: QualityFixture,
  remapped: QualityFixture,
  policies: readonly PolicyFixture[],
): Promise<void> {
  await writePolicyManifest(outputPath, [
    {
      fixture: quality,
      policies: policies.filter((policy) =>
        policy.actionId.startsWith("quality."),
      ),
    },
    {
      fixture: remapped,
      policies: policies.filter((policy) => policy.actionId.startsWith("lab.")),
    },
  ]);
}

function interval(start: Date, end: Date): EvidenceTime {
  return { end, kind: "interval", start };
}

function instant(at: Date): EvidenceTime {
  return { at, kind: "instant" };
}

function acceptanceQuery(
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

function relationQuery(
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

function proposeRelease(
  client: ActionClient,
  fixture: QualityFixture,
  suffix: string,
  accepted: boolean,
) {
  return client.propose({
    actionId: fixture.vocabulary.releaseAction,
    definition: fixture.definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      actionInput("accepted", { kind: "bool", value: accepted }),
      actionInput("status", { kind: "text", value: "released" }),
    ],
    operationId: `operation.quality.release-${suffix}`,
    proposalId: `proposal.quality.release-${suffix}`,
    resourceId: fixture.vocabulary.resourceId,
    validAt: timestampFromDate(releaseAt),
  });
}

function proposeQuarantine(
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

async function recordRemappedEvidence(
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
      value: { amount: "75", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.specification-v3-minimum",
      relationId: vocabulary.specificationMinimumRelation,
      sourceId: "source.quality-engineering",
      time: instant(releaseAt),
      value: { amount: "76", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.measurement-sensor",
      relationId: vocabulary.measurementRelation,
      sourceId: "source.sensor-a",
      time: interval(yearStart, yearEnd),
      value: { amount: "72", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.measurement-inspector",
      relationId: vocabulary.measurementRelation,
      sourceId: "source.inspector-a",
      time: interval(yearStart, yearEnd),
      value: { amount: "71", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.measurement-retest",
      relationId: vocabulary.measurementRelation,
      sourceId: "source.inspector-retest",
      time: interval(releaseAt, yearEnd),
      value: { amount: "78", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.uncertainty-sensor",
      relationId: vocabulary.uncertaintyRelation,
      sourceId: "source.sensor-a",
      time: interval(yearStart, yearEnd),
      value: { amount: "0.4", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.uncertainty-inspector",
      relationId: vocabulary.uncertaintyRelation,
      sourceId: "source.inspector-a",
      time: interval(yearStart, yearEnd),
      value: { amount: "0.2", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.uncertainty-retest",
      relationId: vocabulary.uncertaintyRelation,
      sourceId: "source.inspector-retest",
      time: interval(releaseAt, yearEnd),
      value: { amount: "0.3", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.accepted-original",
      relationId: vocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-engineering",
      time: interval(yearStart, yearEnd),
      value: { amount: "71", kind: "quantity", unit: "MPa" },
    },
    {
      claimId: "claim.lab.accepted-retest",
      relationId: vocabulary.acceptedMeasurementRelation,
      sourceId: "source.quality-supervisor",
      time: interval(releaseAt, yearEnd),
      value: { amount: "78", kind: "quantity", unit: "MPa" },
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

function boolValues(response: SemanticQueryResponse): boolean[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "boolValue");
    return result.value.value.value;
  });
}

function quantityValues(response: SemanticQueryResponse): string[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "quantityValue");
    return result.value.value.value.amount;
  });
}

function acceptedByComputation(response: SemanticQueryResponse): boolean {
  const values = boolValues(response);
  assert.ok(values.length > 0);
  return values.some(Boolean);
}

function hasRivalMeasurements(
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
            dependency.relationId.endsWith(".measurement") &&
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

function hasSourceLineage(
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

function hasRelationLineage(
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

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

function sameBooleans(
  actual: readonly boolean[],
  expected: readonly boolean[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

function normalizedDefinition(
  fixture: QualityFixture,
  prefix: string,
): string {
  return fixture.canonicalJson.replaceAll(prefix, "domain.");
}

function actionExplanation(
  explanation: Awaited<ReturnType<typeof explainProposal>>,
) {
  if (explanation.subject.case !== "action") {
    throw new Error(
      `expected Action explanation, received ${explanation.subject.case ?? "none"}`,
    );
  }
  return explanation.subject.value;
}

function explanationShape(
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

async function semanticClaimCount(
  client: ReturnType<typeof adminClient>,
  tenantId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM semantic_claims WHERE tenant_id = $1",
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

async function claimSnapshot(
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

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
