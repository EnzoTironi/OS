import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Code } from "@connectrpc/connect";
import { CommitStatus } from "../../../gen/connect/zoen/action/v1/action_pb.js";
import {
  expectConnectCode,
  minutesFromNow,
  propose,
  startServer,
  stopServer,
  tenantA,
} from "../../governed-action/support.js";
import { durableSnapshot } from "../support.js";
import type { DurableScenario } from "../scenario.js";

export async function verifyRollback(
  scenario: DurableScenario,
): Promise<void> {
  const preCommitFailpoints = [
    "before_lock",
    "after_operation_insert",
    "after_semantic_records",
    "after_effect_requests",
    "before_head_advance",
    "before_commit",
  ] as const;
  for (const [index, failpoint] of preCommitFailpoints.entries()) {
    const operationId = `operation.failpoint.${index}`;
    const proposalId = `proposal.failpoint.${index}`;
    const proposal = await propose(scenario.actionA, {
      expiresAt: minutesFromNow(10),
      fixture: scenario.fixtures.direct,
      operationId,
      proposalId,
      quantity: "5",
    });
    assert.ok(proposal.proposal);
    const beforeFailure = await durableSnapshot(
      scenario.runtime.admin,
      tenantA,
    );
    await stopServer(scenario.runtime.server);
    scenario.runtime.server = await startServer(scenario.policyManifestPath, {
      kind: "failpoints",
      failpoint: { name: failpoint },
    });
    const failureCode = await expectConnectCode(
      () => scenario.actionA.commit({ operationId, proposalId }),
      Code.Unavailable,
    );
    await stopServer(scenario.runtime.server);
    scenario.runtime.server = await startServer(scenario.policyManifestPath);
    const afterFailure = await durableSnapshot(
      scenario.runtime.admin,
      tenantA,
    );
    // A rolled-back commit leaves no receipt: the operation stays visible as
    // PENDING (the proposal remains actionable) and the snapshot equality
    // below proves no partial commit landed.
    const rolledBackStatus = await scenario.actionA.getOperationStatus({
      operationId,
    });
    assert.equal(rolledBackStatus.status, CommitStatus.PENDING);
    assert.equal(rolledBackStatus.receipt, undefined);
    scenario.recorder.inject(failpoint);
    scenario.recorder.observe(
      `failpoint${index}RolledBack`,
      failureCode === Code.Unavailable &&
        rolledBackStatus.status === CommitStatus.PENDING &&
        rolledBackStatus.receipt === undefined &&
        isDeepStrictEqual(afterFailure, beforeFailure),
    );
  }
  scenario.recorder.observe(
    "allPreCommitFailpointsRolledBack",
    preCommitFailpoints.every(
      (_, index) =>
        scenario.recorder.assertions[`failpoint${index}RolledBack`] === true,
    ),
  );
}
