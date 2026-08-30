import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Code } from "@connectrpc/connect";
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
    const missingStatusCode = await expectConnectCode(
      () => scenario.actionA.getOperationStatus({ operationId }),
      Code.NotFound,
    );
    scenario.recorder.inject(failpoint);
    scenario.recorder.observe(
      `failpoint${index}RolledBack`,
      failureCode === Code.Unavailable &&
        missingStatusCode === Code.NotFound &&
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
