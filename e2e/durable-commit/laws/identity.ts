import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import {
  CommitIdentityKind,
  CommitStatus,
  type CommitReceipt,
} from "../../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  minutesFromNow,
  propose,
  tenantA,
} from "../../governed-action/support.js";
import {
  durableSnapshot,
  seedEffectRequestCollision,
  seedSemanticRecordCollision,
} from "../support.js";
import { type DurableScenario, receiptShape } from "../scenario.js";

export async function verifyIdentity(
  scenario: DurableScenario,
  canonicalReceipt: CommitReceipt,
): Promise<void> {
  const independentProposalA = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.same-plan.a",
    proposalId: "proposal.same-plan.a",
    quantity: "2",
  });
  const independentProposalB = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.same-plan.b",
    proposalId: "proposal.same-plan.b",
    quantity: "2",
  });
  assert.ok(independentProposalA.proposal);
  assert.ok(independentProposalB.proposal);
  assert.equal(
    independentProposalA.proposal.intentDigest,
    independentProposalB.proposal.intentDigest,
  );
  const beforeIndependentCommits = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const [independentCommitA, independentCommitB] = await Promise.all([
    scenario.actionA.commit({
      operationId: "operation.same-plan.a",
      proposalId: "proposal.same-plan.a",
    }),
    scenario.actionA.commit({
      operationId: "operation.same-plan.b",
      proposalId: "proposal.same-plan.b",
    }),
  ]);
  const afterIndependentCommits = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const independentShapeA = receiptShape(independentCommitA.receipt);
  const independentShapeB = receiptShape(independentCommitB.receipt);
  scenario.recorder.observe(
    "independentSamePlanOperationsCommitted",
    independentCommitA.status === CommitStatus.COMMITTED &&
      independentCommitB.status === CommitStatus.COMMITTED &&
      isDeepStrictEqual(independentShapeA.recordIds, [
        "claim.action.operation.same-plan.a.0",
        "claim.action.operation.same-plan.a.1",
      ]) &&
      isDeepStrictEqual(independentShapeB.recordIds, [
        "claim.action.operation.same-plan.b.0",
        "claim.action.operation.same-plan.b.1",
      ]) &&
      isDeepStrictEqual(independentShapeA.effectRequestIds, [
        "effect.action.operation.same-plan.a.0",
        "effect.action.operation.same-plan.a.1",
      ]) &&
      isDeepStrictEqual(independentShapeB.effectRequestIds, [
        "effect.action.operation.same-plan.b.0",
        "effect.action.operation.same-plan.b.1",
      ]) &&
      independentShapeA.recordIds.every(
        (id) => !independentShapeB.recordIds.includes(id),
      ) &&
      independentShapeA.effectRequestIds.every(
        (id) => !independentShapeB.effectRequestIds.includes(id),
      ) &&
      afterIndependentCommits.actionOperations ===
        beforeIndependentCommits.actionOperations + 2 &&
      afterIndependentCommits.semanticClaims ===
        beforeIndependentCommits.semanticClaims + 4 &&
      afterIndependentCommits.effectRequests ===
        beforeIndependentCommits.effectRequests + 4 &&
      afterIndependentCommits.authorityHead ===
        beforeIndependentCommits.authorityHead + 2,
  );

  const semanticCollisionProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.semantic-collision",
    proposalId: "proposal.semantic-collision",
    quantity: "1",
  });
  assert.ok(semanticCollisionProposal.proposal);
  const sourceClaimId = canonicalReceipt.recordIds[0];
  assert.ok(sourceClaimId);
  await seedSemanticRecordCollision(
    scenario.runtime.admin,
    tenantA,
    sourceClaimId,
    "claim.action.operation.semantic-collision.0",
  );
  const beforeSemanticCollision = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const semanticCollision = await scenario.actionA.commit({
    operationId: "operation.semantic-collision",
    proposalId: "proposal.semantic-collision",
  });
  const semanticCollisionReplay = await scenario.actionA.commit({
    operationId: "operation.semantic-collision",
    proposalId: "proposal.semantic-collision",
  });
  const afterSemanticCollision = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  scenario.recorder.inject("semantic-record-identity-collision");
  scenario.recorder.observe(
    "semanticRecordCollisionTypedAndAtomic",
    semanticCollision.status === CommitStatus.IDENTITY_COLLISION &&
      semanticCollision.collisionKind ===
        CommitIdentityKind.SEMANTIC_RECORD &&
      semanticCollisionReplay.status === CommitStatus.IDENTITY_COLLISION &&
      semanticCollisionReplay.collisionKind ===
        CommitIdentityKind.SEMANTIC_RECORD &&
      isDeepStrictEqual(afterSemanticCollision, beforeSemanticCollision),
  );

  const effectCollisionProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.effect-collision",
    proposalId: "proposal.effect-collision",
    quantity: "3",
  });
  assert.ok(effectCollisionProposal.proposal);
  await seedEffectRequestCollision(
    scenario.runtime.admin,
    tenantA,
    canonicalReceipt.commitSequence,
    "effect.action.operation.effect-collision.0",
  );
  const beforeEffectCollision = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const effectCollision = await scenario.actionA.commit({
    operationId: "operation.effect-collision",
    proposalId: "proposal.effect-collision",
  });
  const effectCollisionReplay = await scenario.actionA.commit({
    operationId: "operation.effect-collision",
    proposalId: "proposal.effect-collision",
  });
  const afterEffectCollision = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  scenario.recorder.inject("effect-request-identity-collision");
  scenario.recorder.observe(
    "effectRequestCollisionTypedAndAtomic",
    effectCollision.status === CommitStatus.IDENTITY_COLLISION &&
      effectCollision.collisionKind === CommitIdentityKind.EFFECT_REQUEST &&
      effectCollisionReplay.status === CommitStatus.IDENTITY_COLLISION &&
      effectCollisionReplay.collisionKind ===
        CommitIdentityKind.EFFECT_REQUEST &&
      isDeepStrictEqual(afterEffectCollision, beforeEffectCollision),
  );
}
