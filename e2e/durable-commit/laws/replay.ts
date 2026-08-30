import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Code } from "@connectrpc/connect";
import {
  CommitStatus,
  type CommitReceipt,
  PolicyDecision,
} from "../../../gen/connect/zoen/action/v1/action_pb.js";
import {
  delay,
  expectConnectCode,
  millisecondsFromNow,
  minutesFromNow,
  propose,
  startServer,
  stopServer,
  tenantA,
} from "../../governed-action/support.js";
import {
  durableSnapshot,
  runCommitProcess,
  startCommitProcess,
  waitForCommitProcess,
} from "../support.js";
import {
  type DurableScenario,
  type ReceiptShape,
  receiptShape,
} from "../scenario.js";

export interface ReplayEvidence {
  canonicalReceipt: CommitReceipt;
  canonicalShape: ReceiptShape;
}

export async function verifyReplayAndMismatch(
  scenario: DurableScenario,
): Promise<ReplayEvidence> {
  const sameOperationProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.same-race",
    proposalId: "proposal.same-race",
    quantity: "1",
  });
  assert.equal(sameOperationProposal.decision, PolicyDecision.PERMIT);
  assert.ok(sameOperationProposal.proposal);
  const beforeSameOperationRace = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const sameOperationRace = await Promise.all([
    runCommitProcess({
      operationId: "operation.same-race",
      previewHash: sameOperationProposal.proposal.previewHash,
      proposalId: "proposal.same-race",
      tenantId: tenantA,
      token: scenario.agentAToken,
    }),
    runCommitProcess({
      operationId: "operation.same-race",
      previewHash: sameOperationProposal.proposal.previewHash,
      proposalId: "proposal.same-race",
      tenantId: tenantA,
      token: scenario.agentAToken,
    }),
  ]);
  const afterSameOperationRace = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  scenario.recorder.observe(
    "sameOperationRaceConverged",
    sameOperationRace.every(
      (result) => result.status === CommitStatus.COMMITTED,
    ) &&
      isDeepStrictEqual(
        sameOperationRace[0]?.receipt,
        sameOperationRace[1]?.receipt,
      ) &&
      afterSameOperationRace.actionOperations ===
        beforeSameOperationRace.actionOperations + 1 &&
      afterSameOperationRace.semanticClaims ===
        beforeSameOperationRace.semanticClaims + 1 &&
      afterSameOperationRace.effectRequests ===
        beforeSameOperationRace.effectRequests + 1 &&
      afterSameOperationRace.projectionOutbox ===
        beforeSameOperationRace.projectionOutbox + 1 &&
      afterSameOperationRace.authorityHead ===
        beforeSameOperationRace.authorityHead + 1,
  );

  const canonicalProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.canonical",
    proposalId: "proposal.canonical",
    quantity: "1",
  });
  assert.ok(canonicalProposal.proposal);
  const canonicalCommit = await scenario.actionA.commit({
    operationId: "operation.canonical",
    proposalId: "proposal.canonical",
  });
  assert.equal(canonicalCommit.status, CommitStatus.COMMITTED);
  assert.ok(canonicalCommit.receipt);
  const canonicalReceipt = canonicalCommit.receipt;
  const canonicalReplay = await scenario.actionA.commit({
    operationId: "operation.canonical",
    proposalId: "proposal.canonical",
  });
  const canonicalStatus = await scenario.actionA.getOperationStatus({
    operationId: "operation.canonical",
  });
  const canonicalShape = receiptShape(canonicalReceipt);
  assert.deepEqual(canonicalShape.recordIds, [
    "claim.action.operation.canonical.0",
    "claim.action.operation.canonical.1",
  ]);
  assert.deepEqual(canonicalShape.effectRequestIds, [
    "effect.action.operation.canonical.0",
    "effect.action.operation.canonical.1",
  ]);
  scenario.recorder.observe(
    "canonicalReceiptOrderingStable",
    isDeepStrictEqual(receiptShape(canonicalReplay.receipt), canonicalShape) &&
      isDeepStrictEqual(receiptShape(canonicalStatus.receipt), canonicalShape),
  );

  const beforeIntentMismatch = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const intentMismatchCode = await expectConnectCode(
    () =>
      propose(scenario.actionA, {
        expiresAt: minutesFromNow(10),
        fixture: scenario.fixtures.direct,
        operationId: "operation.canonical",
        proposalId: "proposal.intent-mismatch",
        quantity: "2",
      }),
    Code.InvalidArgument,
  );
  const afterIntentMismatch = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  scenario.recorder.observe(
    "sameOperationDifferentIntentTypedMismatch",
    intentMismatchCode === Code.InvalidArgument &&
      isDeepStrictEqual(afterIntentMismatch, beforeIntentMismatch),
  );

  const otherProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.other",
    proposalId: "proposal.other",
    quantity: "2",
  });
  assert.ok(otherProposal.proposal);
  const beforeProposalMismatch = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const proposalMismatch = await scenario.actionA.commit({
    operationId: "operation.canonical",
    proposalId: "proposal.other",
  });
  const proposalMismatchReplay = await scenario.actionA.commit({
    operationId: "operation.canonical",
    proposalId: "proposal.other",
  });
  const afterProposalMismatch = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  scenario.recorder.observe(
    "wrongProposalTypedMismatch",
    proposalMismatch.status === CommitStatus.OPERATION_MISMATCH &&
      proposalMismatchReplay.status === CommitStatus.OPERATION_MISMATCH &&
      isDeepStrictEqual(afterProposalMismatch, beforeProposalMismatch),
  );

  const expiringProposal = await propose(scenario.actionA, {
    expiresAt: millisecondsFromNow(5_000),
    fixture: scenario.fixtures.direct,
    operationId: "operation.expiring-race",
    proposalId: "proposal.expiring-race",
    quantity: "1",
  });
  assert.ok(expiringProposal.proposal);
  const beforeExpiringRace = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath, {
    kind: "failpoints",
    failpoint: {
      name: "before_commit",
      pauseMs: 8_000,
    },
  });
  const firstCommit = startCommitProcess({
    operationId: "operation.expiring-race",
    previewHash: expiringProposal.proposal.previewHash,
    proposalId: "proposal.expiring-race",
    tenantId: tenantA,
    token: scenario.agentAToken,
  });
  await delay(6_000);
  const retry = scenario.actionA.commit({
    operationId: "operation.expiring-race",
    proposalId: "proposal.expiring-race",
  });
  const [firstResult, retryResult] = await Promise.all([
    waitForCommitProcess(firstCommit),
    retry,
  ]);
  const afterExpiringRace = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  scenario.recorder.inject("retry-after-first-commit-crossed-expiry");
  scenario.recorder.observe(
    "racedExpiredRetryReturnedDurableReceipt",
    firstResult.status === CommitStatus.COMMITTED &&
      retryResult.status === CommitStatus.COMMITTED &&
      isDeepStrictEqual(
        firstResult.receipt,
        receiptShape(retryResult.receipt),
      ) &&
      afterExpiringRace.actionOperations ===
        beforeExpiringRace.actionOperations + 1 &&
      afterExpiringRace.authorityHead ===
        beforeExpiringRace.authorityHead + 1,
  );
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath);

  return { canonicalReceipt, canonicalShape };
}
