import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { Code } from "@connectrpc/connect";
import { CommitStatus } from "../../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  expectConnectCode,
  minutesFromNow,
  propose,
  startServer,
  stopServer,
} from "../../governed-action/support.js";
import { runCommitProcess } from "../support.js";
import type { DurableScenario } from "../scenario.js";

export async function verifyTenantIsolation(
  scenario: DurableScenario,
): Promise<number> {
  const independentProposalA = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.independent",
    proposalId: "proposal.independent",
    quantity: "4",
  });
  const independentProposalB = await propose(scenario.actionB, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.independent",
    proposalId: "proposal.independent",
    quantity: "4",
  });
  assert.ok(independentProposalA.proposal);
  assert.ok(independentProposalB.proposal);
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath, {
    kind: "failpoints",
    failpoint: {
      name: "after_lock",
      pauseMs: 1_500,
    },
  });
  const independentStartedAt = performance.now();
  const independentRace = await Promise.all([
    runCommitProcess({
      operationId: "operation.independent",
      proposalId: "proposal.independent",
      token: scenario.agentAToken,
    }),
    runCommitProcess({
      operationId: "operation.independent",
      proposalId: "proposal.independent",
      token: scenario.agentBToken,
    }),
  ]);
  const independentElapsedMs = performance.now() - independentStartedAt;
  scenario.recorder.inject("tenant-scoped-lock-delay");
  scenario.recorder.observe(
    "independentTenantsNotGloballySerialized",
    independentRace.every(
      (result) => result.status === CommitStatus.COMMITTED,
    ) && independentElapsedMs < 2_700,
  );
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath);

  const namespaceProposalA = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.namespace",
    proposalId: "proposal.namespace",
    quantity: "4",
  });
  assert.ok(namespaceProposalA.proposal);
  const namespaceCommitA = await scenario.actionA.commit({
    operationId: "operation.namespace",
    proposalId: "proposal.namespace",
  });
  const tenantBStatusCode = await expectConnectCode(
    () =>
      scenario.actionB.getOperationStatus({
        operationId: "operation.namespace",
      }),
    Code.NotFound,
  );
  const namespaceProposalB = await propose(scenario.actionB, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.namespace",
    proposalId: "proposal.namespace",
    quantity: "4",
  });
  assert.ok(namespaceProposalB.proposal);
  const namespaceCommitB = await scenario.actionB.commit({
    operationId: "operation.namespace",
    proposalId: "proposal.namespace",
  });
  scenario.recorder.observe(
    "tenantScopedOperationNamespace",
    tenantBStatusCode === Code.NotFound &&
      namespaceCommitA.status === CommitStatus.COMMITTED &&
      namespaceCommitB.status === CommitStatus.COMMITTED &&
      namespaceCommitA.receipt?.operationId ===
        namespaceCommitB.receipt?.operationId,
  );
  return independentElapsedMs;
}
