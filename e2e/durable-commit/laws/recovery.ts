import assert from "node:assert/strict";
import { once } from "node:events";
import { isDeepStrictEqual } from "node:util";
import { Code } from "@connectrpc/connect";
import { Client as PostgresClient } from "pg";
import { CommitStatus } from "../../../gen/connect/zoen/action/v1/action_pb.js";
import {
  adminDatabaseUrl,
  delay,
  expectConnectCode,
  minutesFromNow,
  propose,
  startServer,
  stopServer,
  tenantA,
  type ServerProcess,
} from "../../governed-action/support.js";
import {
  composeOutput,
  killCommitProcess,
  startCommitProcess,
  waitForOperation,
} from "../support.js";
import { type DurableScenario, receiptShape } from "../scenario.js";

export interface RecoveryEvidence {
  clientDeath: string;
  lostResponse: string;
  serverDeath: string;
}

export async function verifyRecovery(
  scenario: DurableScenario,
): Promise<RecoveryEvidence> {
  const lostResponseProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.direct,
    operationId: "operation.lost-response",
    proposalId: "proposal.lost-response",
    quantity: "5",
  });
  assert.ok(lostResponseProposal.proposal);
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath, {
    kind: "failpoints",
    failpoint: { name: "after_commit" },
  });
  const lostResponseCode = await expectConnectCode(
    () =>
      scenario.actionA.commit({
        operationId: "operation.lost-response",
        proposalId: "proposal.lost-response",
      }),
    Code.Unavailable,
  );
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath);
  const lostResponseStatus = await scenario.actionA.getOperationStatus({
    operationId: "operation.lost-response",
  });
  const lostResponseReplay = await scenario.actionA.commit({
    operationId: "operation.lost-response",
    proposalId: "proposal.lost-response",
  });
  scenario.recorder.inject("postgres-commit-then-lost-response");
  scenario.recorder.observe(
    "lostResponseRecoveredWithoutSecondCommit",
    lostResponseCode === Code.Unavailable &&
      lostResponseStatus.status === CommitStatus.COMMITTED &&
      isDeepStrictEqual(
        receiptShape(lostResponseReplay.receipt),
        receiptShape(lostResponseStatus.receipt),
      ),
  );

  const clientDeathProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.client-death",
    proposalId: "proposal.client-death",
    quantity: "2",
  });
  assert.ok(clientDeathProposal.proposal);
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath, {
    kind: "failpoints",
    failpoint: {
      name: "after_commit",
      pauseMs: 2_500,
    },
  });
  const doomedClient = startCommitProcess({
    operationId: "operation.client-death",
    previewHash: clientDeathProposal.proposal.previewHash,
    proposalId: "proposal.client-death",
    token: scenario.agentAToken,
  });
  await waitForOperation(
    scenario.runtime.admin,
    tenantA,
    "operation.client-death",
  );
  await killCommitProcess(doomedClient);
  const clientDeathStatus = await scenario.actionA.getOperationStatus({
    operationId: "operation.client-death",
  });
  const clientDeathReplay = await scenario.actionA.commit({
    operationId: "operation.client-death",
    proposalId: "proposal.client-death",
  });
  scenario.recorder.inject("client-killed-after-request-delivery");
  scenario.recorder.observe(
    "clientDeathRecoveredFromStatusAndReplay",
    clientDeathStatus.status === CommitStatus.COMMITTED &&
      isDeepStrictEqual(
        receiptShape(clientDeathReplay.receipt),
        receiptShape(clientDeathStatus.receipt),
      ),
  );
  await delay(2_600);
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath);

  const serverDeathProposal = await propose(scenario.actionA, {
    expiresAt: minutesFromNow(10),
    fixture: scenario.fixtures.multi,
    operationId: "operation.server-death",
    proposalId: "proposal.server-death",
    quantity: "3",
  });
  assert.ok(serverDeathProposal.proposal);
  await stopServer(scenario.runtime.server);
  scenario.runtime.server = await startServer(scenario.policyManifestPath, {
    kind: "failpoints",
    failpoint: {
      name: "after_commit",
      pauseMs: 5_000,
    },
  });
  const interruptedClient = startCommitProcess({
    operationId: "operation.server-death",
    previewHash: serverDeathProposal.proposal.previewHash,
    proposalId: "proposal.server-death",
    token: scenario.agentAToken,
  });
  await waitForOperation(
    scenario.runtime.admin,
    tenantA,
    "operation.server-death",
  );
  await killServer(scenario.runtime.server);
  await killCommitProcess(interruptedClient);
  scenario.runtime.server = await startServer(scenario.policyManifestPath);
  const serverDeathStatus = await scenario.actionA.getOperationStatus({
    operationId: "operation.server-death",
  });
  const serverDeathReplay = await scenario.actionA.commit({
    operationId: "operation.server-death",
    proposalId: "proposal.server-death",
  });
  scenario.recorder.inject("zoend-killed-after-postgres-commit");
  scenario.recorder.observe(
    "serverDeathRecoveredAfterRestart",
    serverDeathStatus.status === CommitStatus.COMMITTED &&
      isDeepStrictEqual(
        receiptShape(serverDeathReplay.receipt),
        receiptShape(serverDeathStatus.receipt),
      ),
  );

  await stopServer(scenario.runtime.server);
  await scenario.runtime.admin.end();
  await composeOutput("restart", "postgres");
  await composeOutput("up", "--detach", "--wait");
  scenario.runtime.admin = new PostgresClient({
    connectionString: adminDatabaseUrl,
  });
  await scenario.runtime.admin.connect();
  scenario.runtime.server = await startServer(scenario.policyManifestPath);
  const postgresRestartStatus = await scenario.actionA.getOperationStatus({
    operationId: "operation.server-death",
  });
  scenario.recorder.inject("postgres-restart-after-commit");
  scenario.recorder.observe(
    "postgresRestartPreservedReceipt",
    postgresRestartStatus.status === CommitStatus.COMMITTED &&
      isDeepStrictEqual(
        receiptShape(postgresRestartStatus.receipt),
        receiptShape(serverDeathStatus.receipt),
      ),
  );

  return {
    clientDeath: receiptShape(clientDeathStatus.receipt).operationId,
    lostResponse: receiptShape(lostResponseStatus.receipt).operationId,
    serverDeath: receiptShape(serverDeathStatus.receipt).operationId,
  };
}

async function killServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGKILL");
  await once(server.child, "exit");
}
