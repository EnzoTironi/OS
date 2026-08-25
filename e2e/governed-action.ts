import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Code } from "@connectrpc/connect";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Client as PostgresClient } from "pg";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  actionClient,
  actionId,
  activateDefinition,
  adminDatabaseUrl,
  approveProposal,
  assertPolicy,
  command,
  composeOutput,
  commitProposal,
  corruptToken,
  databaseSnapshot,
  definitionClient,
  definitionId,
  delay,
  expectConnectCode,
  flippedPreviewHash,
  generatedDirectory,
  isPreviewHash,
  leaksInternalId,
  loadFixture,
  millisecondsFromNow,
  minutesFromNow,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  propose,
  publishDefinition,
  recordAvailable,
  repositoryRoot,
  resourceId,
  rowCount,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  textInput,
  unboundActionClient,
  unrelatedResourceId,
  worldClient,
  writePolicyManifest,
} from "./governed-action/support.js";
import { writeScenarioArtifact } from "./host-env.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function recordAssertion(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function recordFailureInjection(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixtures = {
    deny: await loadFixture("deny", 3),
    direct: await loadFixture("direct", 1),
    error: await loadFixture("error", 4),
    human: await loadFixture("human", 2),
    self: await loadFixture("self", 5),
  };
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, Object.values(fixtures));

  const agentAToken = await oidcToken("agent-a");
  const approverAToken = await oidcToken("approver-a");
  const agentBToken = await oidcToken("agent-b");
  const adminAToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  const expandedToken = await oidcToken("expanded-a");
  const wrongAudienceToken = await oidcToken("wrong-audience-a");
  const expiredToken = await oidcToken("expired-a");

  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const definitionAdminA = definitionClient(adminAToken);
  const definitionAdminB = definitionClient(adminBToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const actionA = actionClient(agentAToken);
  const approverA = actionClient(approverAToken);
  const actionB = actionClient(agentBToken);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  let server = await startServer(policyManifestPath);
  await admin.connect();

  try {
    for (const fixture of Object.values(fixtures)) {
      await publishDefinition(definitionA, tenantA, fixture);
      await activateDefinition(definitionAdminA, tenantA, fixture);
    }
    await publishDefinition(definitionB, tenantB, fixtures.direct);
    await activateDefinition(definitionAdminB, tenantB, fixtures.direct);

    await recordAvailable(worldA, {
      claimId: "claim.available.direct.a",
      fixture: fixtures.direct,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.human.a",
      fixture: fixtures.human,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.deny.a",
      fixture: fixtures.deny,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.error.a",
      fixture: fixtures.error,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.self.a",
      fixture: fixtures.self,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldB, {
      claimId: "claim.available.direct.b",
      fixture: fixtures.direct,
      resource: resourceId,
      tenantId: tenantB,
      value: "20",
    });

    const directDiscovery = await actionA.discover({
      definition: fixtures.direct.definition,
      resourceId,
    });
    const trusted = directDiscovery.trustedContext;
    assert.ok(trusted);
    assert.equal(trusted.tenantId, tenantA);
    assert.equal(trusted.actorId, "actor.agent.a");
    assert.equal(trusted.principalId, "principal.agent.a");
    assert.equal(trusted.workloadId, "workload.agent.a");
    assert.equal(trusted.delegation.length, 1);
    assert.deepEqual(trusted.delegation[0]?.actionIds, [actionId]);
    assert.deepEqual(trusted.delegation[0]?.resourceIds, [resourceId]);
    assert.deepEqual(trusted.delegation[0]?.workloadIds, [
      "workload.agent.a",
    ]);
    assert.deepEqual(
      directDiscovery.actions.map((action) => action.actionId),
      [actionId],
    );
    const directCapability = directDiscovery.actions.find(
      (action) => action.actionId === actionId,
    );
    assert.ok(directCapability);
    assert.equal(directCapability.decision, PolicyDecision.PERMIT);
    assertPolicy(directCapability.policy, fixtures.direct);
    recordAssertion(
      "oidcTrustedContextDerived",
      trusted.tenantId === tenantA &&
        trusted.actorId === "actor.agent.a" &&
        trusted.principalId === "principal.agent.a" &&
        trusted.workloadId === "workload.agent.a",
    );
    recordAssertion(
      "delegationScopeExposed",
      trusted.delegation.length === 1 &&
        isDeepStrictEqual(trusted.delegation[0]?.actionIds, [actionId]) &&
        isDeepStrictEqual(trusted.delegation[0]?.resourceIds, [resourceId]) &&
        isDeepStrictEqual(trusted.delegation[0]?.workloadIds, [
          "workload.agent.a",
        ]),
    );
    recordAssertion(
      "discoveryIntersectsDelegationScope",
      isDeepStrictEqual(
        directDiscovery.actions.map((action) => action.actionId),
        [actionId],
      ),
    );
    recordAssertion(
      "cedarDeterminingPolicyRecorded",
      directCapability.policy?.revision?.policyId ===
        fixtures.direct.policyId &&
        directCapability.policy.determiningPolicyIds.length > 0,
    );

    const actionProtocol = await readFile(
      path.join(
        repositoryRoot,
        "proto",
        "zoen",
        "action",
        "v1",
        "action.proto",
      ),
      "utf8",
    );
    const proposeRequest = actionProtocol.match(
      /message ProposeRequest \{(?<body>[^}]*)\}/s,
    )?.groups?.body;
    assert.ok(proposeRequest);
    assert.doesNotMatch(
      proposeRequest,
      /\b(?:actor_id|principal_id|tenant_id|workload_id)\b/,
    );
    recordAssertion(
      "identityFieldsAbsentFromActionRequest",
      !/\b(?:actor_id|principal_id|tenant_id|workload_id)\b/.test(
        proposeRequest,
      ),
    );

    const direct = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.direct",
      proposalId: "proposal.direct",
      quantity: "2",
    });
    assert.equal(direct.decision, PolicyDecision.PERMIT);
    const directProposal = direct.proposal;
    assert.ok(directProposal);
    assert.equal(directProposal.status, ProposalStatus.READY);
    assert.equal(directProposal.stateBasis?.dependencies.length, 1);
    assertPolicy(directProposal.policy, fixtures.direct);
    recordAssertion(
      "proposeReturnsPreviewHash",
      isPreviewHash(directProposal.previewHash),
    );
    recordAssertion(
      "proposeReturnsPortuguesePreviewWithoutIds",
      directProposal.canonicalPreviewText ===
        "Vou executar requestStock com quantidade 2." &&
        !leaksInternalId(directProposal.canonicalPreviewText),
    );
    const rawActionA = unboundActionClient(agentAToken);
    const missingPreview = await rawActionA.commit({
      operationId: "operation.direct",
      proposalId: "proposal.direct",
    });
    assert.equal(missingPreview.status, CommitStatus.PREVIEW_MISMATCH);
    const tamperedPreview = await commitProposal(actionA, directProposal, {
      previewHash: flippedPreviewHash(directProposal.previewHash),
    });
    assert.equal(tamperedPreview.status, CommitStatus.PREVIEW_MISMATCH);
    const stalePreviewSource = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.previewStale",
      proposalId: "proposal.previewStale",
      quantity: "3",
    });
    assert.ok(stalePreviewSource.proposal);
    const stalePreview = await commitProposal(actionA, directProposal, {
      previewHash: stalePreviewSource.proposal.previewHash,
    });
    assert.equal(stalePreview.status, CommitStatus.PREVIEW_MISMATCH);
    recordAssertion(
      "previewHashGateRejectsMissingTamperedAndStale",
      missingPreview.status === CommitStatus.PREVIEW_MISMATCH &&
        tamperedPreview.status === CommitStatus.PREVIEW_MISMATCH &&
        stalePreview.status === CommitStatus.PREVIEW_MISMATCH &&
        stalePreviewSource.proposal.previewHash !== directProposal.previewHash,
    );
    const beforeReservedClaim = await databaseSnapshot(admin, tenantA);
    const reservedClaimCode = await expectConnectCode(
      () =>
        recordAvailable(worldA, {
          claimId: "claim.action.operation.direct.0",
          fixture: fixtures.direct,
          resource: resourceId,
          tenantId: tenantA,
          value: "99",
        }),
      Code.InvalidArgument,
    );
    const afterReservedClaim = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterReservedClaim, beforeReservedClaim);
    recordFailureInjection("reserved-action-claim-id");
    const directCommit = await commitProposal(actionA, directProposal);
    assert.equal(directCommit.status, CommitStatus.COMMITTED);
    assert.ok(directCommit.receipt);
    assertPolicy(directCommit.receipt.policy, fixtures.direct);
    assert.equal(directCommit.receipt.definition?.digest, fixtures.direct.digest);
    const directStatus = await actionA.getOperationStatus({
      operationId: "operation.direct",
    });
    assert.equal(directStatus.status, CommitStatus.COMMITTED);
    assert.equal(
      directStatus.receipt?.intentDigest,
      directCommit.receipt.intentDigest,
    );
    const directReplay = await rawActionA.commit({
      operationId: "operation.direct",
      proposalId: "proposal.direct",
    });
    assert.equal(
      directReplay.receipt?.commitSequence,
      directCommit.receipt.commitSequence,
    );
    recordAssertion(
      "directPermitCommitted",
      directCommit.status === CommitStatus.COMMITTED &&
        directCommit.receipt.definition?.digest === fixtures.direct.digest,
    );
    recordAssertion(
      "actionClaimNamespaceRejectedCallerEvidence",
      reservedClaimCode === Code.InvalidArgument &&
        isDeepStrictEqual(afterReservedClaim, beforeReservedClaim),
    );
    recordAssertion(
      "operationIdempotencyPreserved",
      directReplay.receipt?.commitSequence ===
        directCommit.receipt.commitSequence,
    );
    recordAssertion(
      "replayWithoutPreviewHashReturnsReceipt",
      directReplay.status === CommitStatus.COMMITTED &&
        directReplay.receipt?.commitSequence ===
          directCommit.receipt.commitSequence,
    );

    const duplicateIntent = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.duplicateIntent",
      proposalId: "proposal.duplicateIntent",
      quantity: "2",
    });
    assert.equal(
      duplicateIntent.proposal?.intentDigest,
      directCommit.receipt.intentDigest,
    );
    assert.ok(duplicateIntent.proposal);
    const duplicateIntentCommit = await commitProposal(
      actionA,
      duplicateIntent.proposal,
    );
    assert.equal(duplicateIntentCommit.status, CommitStatus.COMMITTED);
    assert.ok(duplicateIntentCommit.receipt);
    assert.deepEqual(
      duplicateIntentCommit.receipt.recordIds,
      ["claim.action.operation.duplicateIntent.0"],
    );
    assert.deepEqual(
      duplicateIntentCommit.receipt.effectRequestIds,
      ["effect.action.operation.duplicateIntent.0"],
    );
    recordAssertion(
      "independentSameIntentOperationsCommitted",
      duplicateIntentCommit.status === CommitStatus.COMMITTED &&
        isDeepStrictEqual(duplicateIntentCommit.receipt.recordIds, [
          "claim.action.operation.duplicateIntent.0",
        ]) &&
        isDeepStrictEqual(duplicateIntentCommit.receipt.effectRequestIds, [
          "effect.action.operation.duplicateIntent.0",
        ]),
    );

    const selfMutating = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.self,
      operationId: "operation.selfMutating",
      proposalId: "proposal.selfMutating",
      quantity: "2",
    });
    assert.ok(selfMutating.proposal);
    const selfMutatingCommit = await commitProposal(
      actionA,
      selfMutating.proposal,
    );
    assert.equal(selfMutatingCommit.status, CommitStatus.COMMITTED);
    const selfMutatingReplay = await actionA.commit({
      operationId: "operation.selfMutating",
      proposalId: "proposal.selfMutating",
    });
    assert.equal(
      selfMutatingReplay.receipt?.commitSequence,
      selfMutatingCommit.receipt?.commitSequence,
    );
    recordAssertion(
      "selfMutatingActionReplayReturnedCanonicalReceipt",
      selfMutatingReplay.receipt?.commitSequence ===
        selfMutatingCommit.receipt?.commitSequence,
    );

    await recordAvailable(worldA, {
      claimId: "claim.available.large.a",
      fixture: fixtures.direct,
      resource: resourceId,
      tenantId: tenantA,
      value: "9223372036854775809",
    });
    const beforeLargeCedarInput = await databaseSnapshot(admin, tenantA);
    const largeCedarInput = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.largeCedarInput",
      proposalId: "proposal.largeCedarInput",
      quantity: "9223372036854775808",
    });
    assert.equal(
      largeCedarInput.decision,
      PolicyDecision.EVALUATION_ERROR,
    );
    assert.match(largeCedarInput.evaluationError, /quantity.*integer range/);
    const afterLargeCedarInput = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterLargeCedarInput, beforeLargeCedarInput);
    recordFailureInjection("cedar-integer-out-of-range");
    recordAssertion(
      "cedarRejectedOutOfRangeIntegerWithoutWrites",
      largeCedarInput.decision === PolicyDecision.EVALUATION_ERROR &&
        isDeepStrictEqual(afterLargeCedarInput, beforeLargeCedarInput),
    );

    const beforeThresholdDeny = await databaseSnapshot(admin, tenantA);
    const thresholdDeny = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.thresholdDeny",
      proposalId: "proposal.thresholdDeny",
      quantity: "6",
    });
    assert.equal(thresholdDeny.decision, PolicyDecision.DENY);
    assert.equal(thresholdDeny.proposal, undefined);
    const afterThresholdDeny = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterThresholdDeny, beforeThresholdDeny);
    recordAssertion(
      "cedarThresholdControlsPermit",
      thresholdDeny.decision === PolicyDecision.DENY &&
        thresholdDeny.proposal === undefined,
    );
    recordAssertion(
      "deniedProposalHasNoWrites",
      isDeepStrictEqual(afterThresholdDeny, beforeThresholdDeny),
    );

    const humanExpiresAt = minutesFromNow(5);
    const human = await propose(actionA, {
      expiresAt: humanExpiresAt,
      fixture: fixtures.human,
      operationId: "operation.human",
      proposalId: "proposal.human",
      quantity: "2",
    });
    assert.equal(human.decision, PolicyDecision.PERMIT);
    assert.ok(human.proposal);
    assert.equal(human.proposal.status, ProposalStatus.AWAITING_APPROVAL);
    assertPolicy(human.proposal.policy, fixtures.human);
    const humanBasisDigest = human.proposal.stateBasis?.digest;
    assert.ok(humanBasisDigest);

    await recordAvailable(worldA, {
      claimId: "claim.available.unrelated.a",
      fixture: fixtures.human,
      resource: unrelatedResourceId,
      tenantId: tenantA,
      value: "99",
    });
    await stopServer(server);
    server = await startServer(policyManifestPath);
    const humanRetry = await propose(actionA, {
      expiresAt: humanExpiresAt,
      fixture: fixtures.human,
      operationId: "operation.human",
      proposalId: "proposal.human",
      quantity: "2",
    });
    assert.equal(
      humanRetry.proposal?.proposedAt?.seconds,
      human.proposal.proposedAt?.seconds,
    );
    const humanApprovalExpiresAt = minutesFromNow(4);
    const humanProposal = humanRetry.proposal;
    assert.ok(humanProposal);
    const flippedHumanApproveCode = await expectConnectCode(
      () =>
        approveProposal(
          approverA,
          humanProposal,
          {
            approvalId: "approval.human.flipped",
            expiresAt: timestampFromDate(humanApprovalExpiresAt),
          },
          { previewHash: flippedPreviewHash(humanProposal.previewHash) },
        ),
      Code.InvalidArgument,
    );
    recordAssertion(
      "approveRejectsFlippedPreviewHash",
      flippedHumanApproveCode === Code.InvalidArgument,
    );
    const humanApproval = await approveProposal(approverA, humanProposal, {
      approvalId: "approval.human",
      expiresAt: timestampFromDate(humanApprovalExpiresAt),
    });
    assert.equal(humanApproval.decision, PolicyDecision.PERMIT);
    assert.equal(humanApproval.approval?.approvedBy, "actor.approver.a");
    const humanApprovalRetry = await approveProposal(approverA, humanProposal, {
      approvalId: "approval.human",
      expiresAt: timestampFromDate(humanApprovalExpiresAt),
    });
    assert.equal(
      humanApprovalRetry.approval?.approvedAt?.seconds,
      humanApproval.approval?.approvedAt?.seconds,
    );
    const humanCommit = await commitProposal(actionA, humanProposal);
    assert.equal(humanCommit.status, CommitStatus.COMMITTED);
    const authorityBasis = (
      await admin.query<{
        approved_principal_id: string;
        approval_grants: string;
        committed_principal_id: string;
        operation_grants: string;
        proposal_grants: string;
        proposed_principal_id: string;
      }>(
        `SELECT
            proposal.proposed_principal_id,
            approval.approved_principal_id,
            operation.committed_principal_id,
            (SELECT count(*)::text FROM action_proposal_grants WHERE tenant_id = proposal.tenant_id AND proposal_id = proposal.proposal_id) AS proposal_grants,
            (SELECT count(*)::text FROM action_approval_grants WHERE tenant_id = approval.tenant_id AND proposal_id = approval.proposal_id) AS approval_grants,
            (SELECT count(*)::text FROM action_operation_grants WHERE tenant_id = operation.tenant_id AND operation_id = operation.operation_id) AS operation_grants
         FROM action_proposals AS proposal
         JOIN action_approvals AS approval
           ON approval.tenant_id = proposal.tenant_id
          AND approval.proposal_id = proposal.proposal_id
         JOIN action_operations AS operation
           ON operation.tenant_id = proposal.tenant_id
          AND operation.proposal_id = proposal.proposal_id
         WHERE proposal.tenant_id = $1 AND proposal.proposal_id = $2`,
        [tenantA, "proposal.human"],
      )
    ).rows[0];
    assert.ok(authorityBasis);
    recordAssertion(
      "proposalRecoveredAcrossRestart",
      humanApproval.approval?.proposalId === "proposal.human",
    );
    recordAssertion(
      "proposalAndApprovalRetriesReturnedStoredRecords",
      humanRetry.proposal?.proposedAt?.seconds ===
        human.proposal.proposedAt?.seconds &&
        humanApprovalRetry.approval?.approvedAt?.seconds ===
          humanApproval.approval?.approvedAt?.seconds,
    );
    recordAssertion(
      "unrelatedStateDidNotFalseStale",
      humanCommit.status === CommitStatus.COMMITTED,
    );
    recordAssertion(
      "humanApprovalCommitted",
      humanApproval.decision === PolicyDecision.PERMIT &&
        humanCommit.status === CommitStatus.COMMITTED,
    );
    recordAssertion(
      "durableHistoryRetainedAuthorityBasis",
      authorityBasis.proposed_principal_id === "principal.agent.a" &&
        authorityBasis.approved_principal_id === "principal.approver.a" &&
        authorityBasis.committed_principal_id === "principal.agent.a" &&
        authorityBasis.proposal_grants === "1" &&
        authorityBasis.approval_grants === "1" &&
        authorityBasis.operation_grants === "1",
    );

    const boundedProposal = await propose(actionA, {
      expiresAt: minutesFromNow(1),
      fixture: fixtures.human,
      operationId: "operation.approvalBounds",
      proposalId: "proposal.approvalBounds",
      quantity: "2",
    });
    const boundedHumanProposal = boundedProposal.proposal;
    assert.ok(boundedHumanProposal);
    const approvalsBeforeBounds = await rowCount(
      admin,
      "action_approvals",
      tenantA,
    );
    const approvalBoundsCode = await expectConnectCode(
      () =>
        approveProposal(approverA, boundedHumanProposal, {
          approvalId: "approval.outsideBounds",
          expiresAt: timestampFromDate(minutesFromNow(2)),
        }),
      Code.FailedPrecondition,
    );
    const approvalsAfterBounds = await rowCount(
      admin,
      "action_approvals",
      tenantA,
    );
    assert.equal(approvalsAfterBounds, approvalsBeforeBounds);
    recordFailureInjection("approval-outside-bounds");
    recordAssertion(
      "approvalBoundsEnforced",
      approvalBoundsCode === Code.FailedPrecondition &&
        approvalsAfterBounds === approvalsBeforeBounds,
    );

    const expiringProposal = await propose(actionA, {
      expiresAt: minutesFromNow(1),
      fixture: fixtures.human,
      operationId: "operation.expiredApproval",
      proposalId: "proposal.expiredApproval",
      quantity: "2",
    });
    const expiringHumanProposal = expiringProposal.proposal;
    assert.ok(expiringHumanProposal);
    const expiringApproval = await approveProposal(
      approverA,
      expiringHumanProposal,
      {
        approvalId: "approval.expired",
        expiresAt: timestampFromDate(millisecondsFromNow(1_000)),
      },
    );
    assert.equal(expiringApproval.decision, PolicyDecision.PERMIT);
    await delay(1_200);
    const beforeExpiredCommit = await databaseSnapshot(admin, tenantA);
    const expiredApprovalCode = await expectConnectCode(
      () =>
        commitProposal(actionA, expiringHumanProposal),
      Code.FailedPrecondition,
    );
    const afterExpiredCommit = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterExpiredCommit, beforeExpiredCommit);
    recordFailureInjection("expired-approval");
    recordAssertion(
      "expiredApprovalRejectedWithoutWrites",
      expiredApprovalCode === Code.FailedPrecondition &&
        isDeepStrictEqual(afterExpiredCommit, beforeExpiredCommit),
    );

    const stale = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.human,
      operationId: "operation.stale",
      proposalId: "proposal.stale",
      quantity: "2",
    });
    assert.ok(stale.proposal?.stateBasis);
    assert.ok(stale.proposal);
    assert.equal(stale.proposal.stateBasis.digest, humanBasisDigest);
    await approveProposal(approverA, stale.proposal, {
      approvalId: "approval.stale",
      expiresAt: timestampFromDate(minutesFromNow(4)),
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.changed.a",
      fixture: fixtures.human,
      resource: resourceId,
      tenantId: tenantA,
      value: "6",
    });
    const beforeStaleCommit = await databaseSnapshot(admin, tenantA);
    const staleCommit = await commitProposal(actionA, stale.proposal);
    assert.equal(staleCommit.status, CommitStatus.STALE);
    assert.ok(staleCommit.currentStateBasis);
    assert.notEqual(staleCommit.currentStateBasis.digest, humanBasisDigest);
    assert.equal(staleCommit.currentStateBasis.dependencies.length, 2);
    const afterStaleCommit = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterStaleCommit, beforeStaleCommit);
    recordFailureInjection("relevant-state-change");
    recordAssertion(
      "relevantDependencyChangeRejectedBeforeMutation",
      staleCommit.status === CommitStatus.STALE &&
        staleCommit.currentStateBasis.digest !== humanBasisDigest &&
        isDeepStrictEqual(afterStaleCommit, beforeStaleCommit),
    );

    const underChangedState = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.human,
      operationId: "operation.changed",
      proposalId: "proposal.changed",
      quantity: "2",
    });
    assert.equal(
      underChangedState.proposal?.stateBasis?.digest,
      staleCommit.currentStateBasis.digest,
    );
    assert.ok(underChangedState.proposal);
    await approveProposal(approverA, underChangedState.proposal, {
      approvalId: "approval.changed",
      expiresAt: timestampFromDate(minutesFromNow(4)),
    });
    const changedCommit = await commitProposal(
      actionA,
      underChangedState.proposal,
    );
    assert.equal(changedCommit.status, CommitStatus.COMMITTED);
    recordAssertion(
      "secondProposalUnderChangedStateCommitted",
      underChangedState.proposal?.stateBasis?.digest ===
        staleCommit.currentStateBasis.digest &&
        changedCommit.status === CommitStatus.COMMITTED,
    );

    const denyDiscovery = await actionA.discover({
      definition: fixtures.deny.definition,
      resourceId,
    });
    assert.equal(denyDiscovery.actions[0]?.decision, PolicyDecision.PERMIT);
    const beforePolicyDeny = await databaseSnapshot(admin, tenantA);
    const denied = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.deny,
      operationId: "operation.deny",
      proposalId: "proposal.deny",
      quantity: "2",
    });
    assert.equal(denied.decision, PolicyDecision.DENY);
    assertPolicy(denied.policy, fixtures.deny);
    const afterPolicyDeny = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterPolicyDeny, beforePolicyDeny);
    recordAssertion(
      "visibleActionStillRequiredCommitAuthorization",
      denyDiscovery.actions[0]?.decision === PolicyDecision.PERMIT &&
        denied.decision === PolicyDecision.DENY,
    );
    recordAssertion(
      "explicitDenyDistinguished",
      denied.decision === PolicyDecision.DENY &&
        (denied.policy?.determiningPolicyIds.length ?? 0) > 0 &&
        isDeepStrictEqual(afterPolicyDeny, beforePolicyDeny),
    );

    const beforeEvaluationError = await databaseSnapshot(admin, tenantA);
    const evaluationError = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.error,
      operationId: "operation.error",
      proposalId: "proposal.error",
      quantity: "2",
    });
    assert.equal(
      evaluationError.decision,
      PolicyDecision.EVALUATION_ERROR,
    );
    assert.match(evaluationError.evaluationError, /missing/);
    assertPolicy(evaluationError.policy, fixtures.error, false);
    const afterEvaluationError = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterEvaluationError, beforeEvaluationError);
    recordFailureInjection("cedar-evaluation-error");
    recordAssertion(
      "cedarEvaluationErrorDistinguished",
      evaluationError.decision === PolicyDecision.EVALUATION_ERROR &&
        /missing/.test(evaluationError.evaluationError) &&
        isDeepStrictEqual(afterEvaluationError, beforeEvaluationError),
    );

    const beforeForgedInput = await databaseSnapshot(admin, tenantA);
    const forgedInputCode = await expectConnectCode(
      () =>
        propose(actionA, {
          expiresAt: minutesFromNow(5),
          extraInputs: [textInput("principal_id", "principal.approver.a")],
          fixture: fixtures.human,
          operationId: "operation.forgedPrincipal",
          proposalId: "proposal.forgedPrincipal",
          quantity: "2",
        }),
      Code.InvalidArgument,
    );
    const afterForgedInput = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterForgedInput, beforeForgedInput);
    recordFailureInjection("caller-supplied-principal");
    recordAssertion(
      "callerIdentityInputRejected",
      forgedInputCode === Code.InvalidArgument &&
        isDeepStrictEqual(afterForgedInput, beforeForgedInput),
    );

    const beforeTokenFailures = await databaseSnapshot(admin, tenantA);
    const invalidSignatureCode = await expectConnectCode(
      () =>
        actionClient(corruptToken(agentAToken)).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.Unauthenticated,
    );
    const wrongAudienceCode = await expectConnectCode(
      () =>
        actionClient(wrongAudienceToken).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.Unauthenticated,
    );
    await delay(1_100);
    const expiredTokenCode = await expectConnectCode(
      () =>
        actionClient(expiredToken).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.Unauthenticated,
    );
    const expandedDelegationCode = await expectConnectCode(
      () =>
        actionClient(expandedToken).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.PermissionDenied,
    );
    const afterTokenFailures = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterTokenFailures, beforeTokenFailures);
    recordFailureInjection("invalid-token-signature");
    recordFailureInjection("wrong-token-audience");
    recordFailureInjection("expired-token");
    recordFailureInjection("child-delegation-expansion");
    recordAssertion(
      "oidcFailuresRejectedWithoutWrites",
      [invalidSignatureCode, wrongAudienceCode, expiredTokenCode].every(
        (code) => code === Code.Unauthenticated,
      ) &&
        expandedDelegationCode === Code.PermissionDenied &&
        isDeepStrictEqual(afterTokenFailures, beforeTokenFailures),
    );
    recordAssertion(
      "childDelegationExpansionRejected",
      expandedDelegationCode === Code.PermissionDenied,
    );

    const foreignOperation = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.foreign",
      proposalId: "proposal.foreign",
      quantity: "2",
    });
    assert.ok(foreignOperation.proposal);
    const beforeForeignOperation = await databaseSnapshot(admin, tenantA);
    const foreignOperationMismatch = await actionA.commit({
      operationId: "operation.other",
      proposalId: "proposal.foreign",
    });
    assert.equal(
      foreignOperationMismatch.status,
      CommitStatus.OPERATION_MISMATCH,
    );
    const afterForeignOperation = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterForeignOperation, beforeForeignOperation);
    const foreignRecovery = await commitProposal(
      actionA,
      foreignOperation.proposal,
    );
    assert.equal(foreignRecovery.status, CommitStatus.COMMITTED);
    recordFailureInjection("foreign-operation-identity");
    recordAssertion(
      "foreignOperationRejectedWithoutWrites",
      foreignOperationMismatch.status === CommitStatus.OPERATION_MISMATCH &&
        isDeepStrictEqual(afterForeignOperation, beforeForeignOperation) &&
        foreignRecovery.status === CommitStatus.COMMITTED,
    );

    const tenantACollision = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.tenantCollision",
      proposalId: "proposal.tenantCollision",
      quantity: "3",
    });
    assert.ok(tenantACollision.proposal);
    const tenantBBeforeCrossAttempt = await databaseSnapshot(admin, tenantB);
    const crossTenantCommitCode = await expectConnectCode(
      () =>
        actionB.commit({
          operationId: "operation.tenantCollision",
          proposalId: "proposal.tenantCollision",
        }),
      Code.NotFound,
    );
    const tenantBAfterCrossAttempt = await databaseSnapshot(admin, tenantB);
    assert.deepEqual(tenantBAfterCrossAttempt, tenantBBeforeCrossAttempt);
    const tenantBCollision = await propose(actionB, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.tenantCollision",
      proposalId: "proposal.tenantCollision",
      quantity: "3",
    });
    assert.ok(tenantBCollision.proposal);
    const tenantBCommit = await commitProposal(
      actionB,
      tenantBCollision.proposal,
    );
    assert.equal(tenantBCommit.status, CommitStatus.COMMITTED);
    assert.ok(tenantACollision.proposal);
    const tenantACommit = await commitProposal(
      actionA,
      tenantACollision.proposal,
    );
    assert.equal(tenantACommit.status, CommitStatus.COMMITTED);
    const crossTenantDefinitionCode = await expectConnectCode(
      () =>
        definitionA.getRevision({
          definitionId,
          digest: fixtures.direct.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordFailureInjection("cross-tenant-proposal-lookup");
    recordAssertion(
      "identicalActionAndOperationIdsIsolatedByTenant",
      crossTenantCommitCode === Code.NotFound &&
        crossTenantDefinitionCode === Code.PermissionDenied &&
        isDeepStrictEqual(
          tenantBAfterCrossAttempt,
          tenantBBeforeCrossAttempt,
        ) &&
        tenantBCommit.status === CommitStatus.COMMITTED &&
        tenantACommit.status === CommitStatus.COMMITTED,
    );

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const recoveredStatus = await actionA.getOperationStatus({
      operationId: "operation.changed",
    });
    assert.equal(recoveredStatus.status, CommitStatus.COMMITTED);
    assert.equal(
      recoveredStatus.receipt?.proposalId,
      changedCommit.receipt?.proposalId,
    );
    recordAssertion(
      "receiptRecoveredAfterRestart",
      recoveredStatus.status === CommitStatus.COMMITTED &&
        recoveredStatus.receipt?.proposalId ===
          changedCommit.receipt?.proposalId,
    );

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
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      actors: {
        agent: trusted.actorId,
        approver: humanApproval.approval?.approvedBy,
      },
      assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      definitions: Object.fromEntries(
        Object.entries(fixtures).map(([name, fixture]) => [
          name,
          {
            digest: fixture.digest,
            revision: fixture.definition.revision.toString(),
          },
        ]),
      ),
      failureInjections,
      finishedAt: new Date().toISOString(),
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      operations: {
        changed: changedCommit.receipt?.operationId,
        direct: directCommit.receipt.operationId,
        human: humanCommit.receipt?.operationId,
      },
      policies: Object.fromEntries(
        Object.entries(fixtures).map(([name, fixture]) => [
          name,
          {
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: fixture.policyRevision,
          },
        ]),
      ),
      protocolDigest: sha256(actionProtocol),
      scenario: "governed-action",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await writeScenarioArtifact(repositoryRoot, "governed-action", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    if (server.child.exitCode === null) {
      await stopServer(server);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
