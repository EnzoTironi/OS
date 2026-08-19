import assert from "node:assert/strict";
import { EffectKnowledgeState } from "../../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  dispatchOnce,
  lookupInvocation,
  providerOperation,
  setProviderMode,
  startRestate,
  stopRestate,
  tenantA,
} from "../support.js";
import {
  commitEffect,
  waitForState,
  type CommittedEffect,
  type EffectsScenario,
} from "../scenario.js";

export async function verifyDispatch(
  scenario: EffectsScenario,
): Promise<CommittedEffect> {
  await setProviderMode("confirmed");
  const unavailable = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "restate-unavailable",
  );
  const beforeDispatch = await scenario.effectA.getEffect({
    effectRequestId: unavailable.effectRequestId,
  });
  assert.ok(beforeDispatch.snapshot);
  scenario.recorder.state(beforeDispatch.snapshot);
  const storedBeforeRemote = await scenario.admin.query<{
    dispatches: string;
    requests: string;
  }>(
    `SELECT
        (SELECT count(*)::text FROM effect_requests WHERE tenant_id = $1 AND effect_request_id = $2) AS requests,
        (SELECT count(*)::text FROM effect_dispatch_attempts WHERE tenant_id = $1 AND effect_request_id = $2) AS dispatches`,
    [tenantA, unavailable.effectRequestId],
  );
  scenario.recorder.observe(
    "effectRequestStoredBeforeRemoteAttempt",
    storedBeforeRemote.rows[0]?.requests === "1" &&
      storedBeforeRemote.rows[0]?.dispatches === "0" &&
      (await providerOperation(unavailable.effectRequestId)) === undefined,
  );

  await stopRestate();
  scenario.recorder.inject("restate-unavailable");
  await dispatchOnce();
  const unavailableDispatch = await scenario.admin.query<{ outcome: string }>(
    `SELECT outcome
     FROM effect_dispatch_attempts
     WHERE tenant_id = $1 AND effect_request_id = $2
     ORDER BY attempt_number`,
    [tenantA, unavailable.effectRequestId],
  );
  scenario.recorder.observe(
    "temporaryRestateUnavailabilityTyped",
    unavailableDispatch.rows[0]?.outcome === "restate_unavailable",
  );
  await startRestate();
  await dispatchOnce();
  const confirmedAfterRestate = await waitForState(
    scenario.effectA,
    unavailable.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(confirmedAfterRestate);
  const dispatchIdentity = await scenario.admin.query<{
    restate_invocation_id: string;
  }>(
    `SELECT restate_invocation_id
     FROM effect_dispatches
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantA, unavailable.effectRequestId],
  );
  const lookedUpInvocation = await lookupInvocation(
    unavailable.effectRequestId,
  );
  scenario.recorder.observe(
    "restateInvocationKeyedByTenantAndEffect",
    lookedUpInvocation === dispatchIdentity.rows[0]?.restate_invocation_id,
  );
  return unavailable;
}
