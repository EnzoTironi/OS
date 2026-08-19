import { EffectAttemptReason, EffectKnowledgeState } from "../../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  dispatchOnce,
  providerOperation,
  setProviderMode,
  startConnector,
  startFaultProvider,
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

export interface UncertaintyResults {
  noEffect: CommittedEffect;
  parseError: CommittedEffect;
  revoked: CommittedEffect;
  safeRetry: CommittedEffect;
  schemaError: CommittedEffect;
}

export async function verifyUncertainty(
  scenario: EffectsScenario,
): Promise<UncertaintyResults> {
  await setProviderMode("parse_error");
  const parseError = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "parse-error",
  );
  await dispatchOnce();
  const parseSnapshot = await waitForState(
    scenario.effectA,
    parseError.effectRequestId,
    EffectKnowledgeState.UNKNOWN,
  );
  scenario.recorder.state(parseSnapshot);
  scenario.recorder.observe(
    "responseParseErrorTypedUnknown",
    parseSnapshot.attempts[0]?.reason ===
      EffectAttemptReason.RESPONSE_PARSE_ERROR,
  );

  await setProviderMode("schema_error");
  const schemaError = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "schema-error",
  );
  await dispatchOnce();
  const schemaSnapshot = await waitForState(
    scenario.effectA,
    schemaError.effectRequestId,
    EffectKnowledgeState.UNKNOWN,
  );
  scenario.recorder.state(schemaSnapshot);
  scenario.recorder.observe(
    "responseSchemaErrorTypedUnknown",
    schemaSnapshot.attempts[0]?.reason ===
      EffectAttemptReason.RESPONSE_SCHEMA_ERROR,
  );

  await setProviderMode("confirmed_no_effect");
  const noEffect = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "no-effect",
  );
  await dispatchOnce();
  const noEffectSnapshot = await waitForState(
    scenario.effectA,
    noEffect.effectRequestId,
    EffectKnowledgeState.CONFIRMED_NO_EFFECT,
  );
  scenario.recorder.state(noEffectSnapshot);

  await stopProcess(scenario.runtime.connector);
  scenario.runtime.connector = await startConnector({ credentials: {} });
  scenario.processes.push(scenario.runtime.connector);
  await setProviderMode("confirmed");
  const revoked = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "revoked",
  );
  await dispatchOnce();
  const revokedSnapshot = await waitForState(
    scenario.effectA,
    revoked.effectRequestId,
    EffectKnowledgeState.DEFINITELY_NOT_SENT,
  );
  scenario.recorder.state(revokedSnapshot);
  scenario.recorder.observe(
    "credentialRevocationIsDefinitelyNotSent",
    revokedSnapshot.attempts[0]?.reason ===
      EffectAttemptReason.CREDENTIAL_REVOKED &&
      (await providerOperation(revoked.effectRequestId)) === undefined,
  );
  await stopProcess(scenario.runtime.connector);
  scenario.runtime.connector = await startConnector();
  scenario.processes.push(scenario.runtime.connector);

  await stopProcess(scenario.runtime.provider);
  const safeRetry = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "safe-retry",
  );
  await dispatchOnce();
  scenario.recorder.inject("provider-unreachable-before-send");
  await delay(150);
  scenario.runtime.provider = await startFaultProvider();
  scenario.processes.push(scenario.runtime.provider);
  const safelyRetried = await waitForState(
    scenario.effectA,
    safeRetry.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(safelyRetried);
  scenario.recorder.observe(
    "definitelyNotSentTransportFailureSafelyRetriedByRestate",
    (await waitForProviderOperation(safeRetry.effectRequestId)).requests === 1,
  );
  return { noEffect, parseError, revoked, safeRetry, schemaError };
}
