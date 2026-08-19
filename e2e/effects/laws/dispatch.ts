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
      (await providerOperation(unavailable.idempotencyKey)) === undefined,
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
  await Promise.all([dispatchOnce(), dispatchOnce()]);
  const confirmedAfterRestate = await waitForState(
    scenario.effectA,
    unavailable.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(confirmedAfterRestate);
  const dispatchIdentity = await scenario.admin.query<{
    accepted_dispatches: string;
    knowledge_commit_sequence: string;
    restate_invocation_id: string;
  }>(
    `SELECT
        knowledge_commit_sequence::text,
        restate_invocation_id,
        (
          SELECT count(*)::text
          FROM effect_dispatch_attempts
          WHERE tenant_id = $1
            AND effect_request_id = $2
            AND outcome = 'accepted'
        ) AS accepted_dispatches
     FROM effect_dispatches
     WHERE tenant_id = $1 AND effect_request_id = $2
     ORDER BY knowledge_commit_sequence DESC
     LIMIT 1`,
    [tenantA, unavailable.effectRequestId],
  );
  scenario.recorder.observe(
    "dispatcherClaimsKnowledgeRevisionBeforeScheduling",
    dispatchIdentity.rows[0]?.accepted_dispatches === "1",
  );
  const lookedUpInvocation = await lookupInvocation(
    unavailable.effectRequestId,
    dispatchIdentity.rows[0]?.knowledge_commit_sequence ?? "",
  );
  const claimedIdentity = await scenario.admin.query<{
    attempt_id: string;
  }>(
    `SELECT attempt_id
     FROM effect_attempt_claims
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantA, unavailable.effectRequestId],
  );
  scenario.recorder.observe(
    "restateInvocationIsTenantScopedAdapterEvidence",
    lookedUpInvocation === dispatchIdentity.rows[0]?.restate_invocation_id &&
      /^attempt\.[0-9a-f]{64}$/.test(
        claimedIdentity.rows[0]?.attempt_id ?? "",
      ) &&
      claimedIdentity.rows[0]?.attempt_id !== lookedUpInvocation,
  );
  return unavailable;
}
