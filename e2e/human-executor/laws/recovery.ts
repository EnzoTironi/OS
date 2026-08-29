import assert from "node:assert/strict";
import { EffectKnowledgeState } from "../../../gen/connect/zoen/effect/v1/effect_pb.js";
import {
  commitHumanEffect,
  submitOperatorReport,
  waitForState,
  type HumanScenario,
} from "../scenario.js";
import { dispatchOnce, restartRestate } from "../support.js";

export async function verifyRecovery(scenario: HumanScenario): Promise<void> {
  const committed = await commitHumanEffect(
    scenario.actionA,
    scenario.effectA,
    scenario.fixture,
    "restate-restart",
  );
  await dispatchOnce();

  const claim = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.restate.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.ok(claim.claim);
  const attemptId = claim.claim.attemptId;

  scenario.recorder.inject("restate-restart-during-human-task");
  await restartRestate();

  const replay = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.restate.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.equal(replay.claim?.attemptId, attemptId);

  const recorded = await submitOperatorReport(
    scenario.effectHumanA,
    committed.effectRequestId,
    attemptId,
    "reported-success",
    "after restate restart",
  );
  scenario.recorder.state(recorded);
  assert.equal(recorded.request?.state, EffectKnowledgeState.ACCEPTED_PENDING);
  assert.equal(recorded.attempts.length, 1);
  assert.equal(recorded.attempts[0]?.attemptId, attemptId);

  const after = await waitForState(
    scenario.effectA,
    committed.effectRequestId,
    EffectKnowledgeState.ACCEPTED_PENDING,
  );
  scenario.recorder.kill(
    "restateRestart",
    after.attempts.length === 1 && after.attempts[0]?.attemptId === attemptId,
  );

  const workerLogs = scenario.runtime.worker.output.join("");
  scenario.recorder.kill(
    "submitNeverTouchesMessaging",
    !workerLogs.includes("packages/transport") &&
      !workerLogs.includes("@zoen/transport"),
  );
}
