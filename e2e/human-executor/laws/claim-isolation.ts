import assert from "node:assert/strict";
import { Code } from "@connectrpc/connect";
import {
  commitHumanEffect,
  expectConnectCode,
  type HumanScenario,
} from "../scenario.js";
import { tenantB } from "../support.js";

export async function verifyClaimIsolation(scenario: HumanScenario): Promise<void> {
  const committed = await commitHumanEffect(
    scenario.actionA,
    scenario.effectA,
    scenario.fixture,
    "claim-isolation",
  );

  const first = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.first.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.ok(first.claim);

  const replay = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.first.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.equal(replay.claim?.attemptId, first.claim?.attemptId);

  await expectConnectCode(
    () =>
      scenario.effectHumanA.claimAttempt({
        adapterExecutionId: `human-claim.second.${committed.effectRequestId}`,
        effectRequestId: committed.effectRequestId,
      }),
    Code.AlreadyExists,
  );
  scenario.recorder.kill("duplicateClaim", true);

  const otherTenant = await commitHumanEffect(
    scenario.actionB,
    scenario.effectB,
    scenario.fixture,
    "cross-tenant-b",
    { tenantId: tenantB },
  );
  await expectConnectCode(
    () =>
      scenario.effectHumanA.claimAttempt({
        adapterExecutionId: `human-claim.cross.${otherTenant.effectRequestId}`,
        effectRequestId: otherTenant.effectRequestId,
      }),
    Code.NotFound,
  );
  scenario.recorder.kill("crossTenantIdSwap", true);

  await expectConnectCode(
    () =>
      scenario.effectHumanRevokedA.claimAttempt({
        adapterExecutionId: `human-claim.revoked.${committed.effectRequestId}`,
        effectRequestId: committed.effectRequestId,
      }),
    Code.PermissionDenied,
  );
  scenario.recorder.kill("revokedOperator", true);

  await expectConnectCode(
    () =>
      scenario.effectWorkerA.claimAttempt({
        adapterExecutionId: `software-claim.${committed.effectRequestId}`,
        effectRequestId: committed.effectRequestId,
      }),
    Code.PermissionDenied,
  );
  scenario.recorder.observe("softwareWorkerCannotClaimHumanEffect", true);
}
