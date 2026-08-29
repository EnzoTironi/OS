import { CommitStatus } from "../../../gen/connect/zoen/action/v1/action_pb.js";
import { EffectKnowledgeState } from "../../../gen/connect/zoen/effect/v1/effect_pb.js";
import {
  dispatchOnce,
  providerOperation,
  restartRestate,
  setProviderMode,
  startConnector,
  startZoend,
  stopProcess,
} from "../support.js";
import {
  commitEffect,
  delay,
  waitForProviderOperation,
  waitForState,
  type CommittedEffect,
  type EffectsScenario,
} from "../scenario.js";

export interface RecoveryResults {
  restateRestart: CommittedEffect;
  zoendRestart: CommittedEffect;
}

export async function verifyRecovery(
  scenario: EffectsScenario,
): Promise<RecoveryResults> {
  await stopProcess(scenario.runtime.connector);
  scenario.runtime.connector = await startConnector({ timeoutMs: 3_000 });
  scenario.processes.push(scenario.runtime.connector);
  await setProviderMode("hold_confirmed");
  const restateRestart = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "restate-restart",
  );
  await dispatchOnce();
  await waitForProviderOperation(restateRestart.idempotencyKey);
  scenario.recorder.inject("restate-restart-during-pending-work");
  await restartRestate();
  const afterRestateRestart = await waitForState(
    scenario.effectA,
    restateRestart.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(afterRestateRestart);
  scenario.recorder.observe(
    "restateRestartPreservesDurableInvocation",
    afterRestateRestart.attempts.length === 1 &&
      (await providerOperation(restateRestart.idempotencyKey)) !== undefined,
  );

  await setProviderMode("hold_confirmed");
  const zoendRestart = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "zoend-restart",
  );
  await dispatchOnce();
  await waitForProviderOperation(zoendRestart.idempotencyKey);
  scenario.recorder.inject("zoend-restart-after-remote-delivery");
  await stopProcess(scenario.runtime.zoend);
  await delay(2_200);
  scenario.runtime.zoend = await startZoend(scenario.policyManifestPath);
  scenario.processes.push(scenario.runtime.zoend);
  const afterZoendRestart = await waitForState(
    scenario.effectA,
    zoendRestart.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(afterZoendRestart);
  const durableReceipt = await scenario.actionA.getOperationStatus({
    operationId: zoendRestart.operationId,
  });
  scenario.recorder.observe(
    "zoendRestartConvergesFromPostgresWithoutActionRerun",
    afterZoendRestart.attempts.length === 1 &&
      durableReceipt.status === CommitStatus.COMMITTED,
  );
  return { restateRestart, zoendRestart };
}
