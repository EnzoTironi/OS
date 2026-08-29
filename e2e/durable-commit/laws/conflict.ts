import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { CommitStatus } from "../../../gen/connect/zoen/action/v1/action_pb.js";
import {
  minutesFromNow,
  propose,
  tenantA,
} from "../../governed-action/support.js";
import { durableSnapshot, runCommitProcess } from "../support.js";
import type { DurableScenario } from "../scenario.js";

export async function verifyConflictingCas(
  scenario: DurableScenario,
): Promise<void> {
  const conflictingProposalA = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.self,
    operationId: "operation.conflict.a",
    proposalId: "proposal.conflict.a",
    quantity: "1",
  });
  const conflictingProposalB = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.self,
    operationId: "operation.conflict.b",
    proposalId: "proposal.conflict.b",
    quantity: "1",
  });
  assert.ok(conflictingProposalA.proposal);
  assert.ok(conflictingProposalB.proposal);
  assert.equal(
    conflictingProposalA.proposal.stateBasis?.digest,
    conflictingProposalB.proposal.stateBasis?.digest,
  );
  const beforeConflictingRace = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const conflictingRace = await Promise.all([
    runCommitProcess({
      operationId: "operation.conflict.a",
      previewHash: conflictingProposalA.proposal.previewHash,
      proposalId: "proposal.conflict.a",
      token: scenario.agentAToken,
    }),
    runCommitProcess({
      operationId: "operation.conflict.b",
      previewHash: conflictingProposalB.proposal.previewHash,
      proposalId: "proposal.conflict.b",
      token: scenario.agentAToken,
    }),
  ]);
  const afterConflictingRace = await durableSnapshot(
    scenario.runtime.admin,
    tenantA,
  );
  const conflictingStatuses = conflictingRace
    .map((result) => result.status)
    .sort((left, right) => left - right);
  const stale = conflictingRace.find(
    (result) => result.status === CommitStatus.STALE,
  );
  scenario.recorder.inject("same-head-conflicting-multi-process-race");
  scenario.recorder.observe(
    "sameHeadConflictHasOneSemanticWinner",
    isDeepStrictEqual(conflictingStatuses, [
      CommitStatus.COMMITTED,
      CommitStatus.STALE,
    ]) &&
      stale?.currentStateBasisDigest !==
        conflictingProposalA.proposal.stateBasis?.digest &&
      afterConflictingRace.actionOperations ===
        beforeConflictingRace.actionOperations + 1 &&
      afterConflictingRace.authorityHead ===
        beforeConflictingRace.authorityHead + 1,
  );

  const storedProcedureCount = (
    await scenario.runtime.admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_proc
       WHERE prokind = 'f'
         AND (
           prosrc ILIKE '%action_operations%'
           OR prosrc ILIKE '%semantic_claims%'
           OR prosrc ILIKE '%projection_outbox%'
         )`,
    )
  ).rows[0]?.count;
  scenario.recorder.observe(
    "noStoredProcedureOwnsActionSemantics",
    storedProcedureCount === "0",
  );
}
