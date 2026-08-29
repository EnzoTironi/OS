import { EffectAttemptReason, EffectKnowledgeState } from "../../../gen/connect/zoen/effect/v1/effect_pb.js";
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
  waitForProviderOperation,
  waitForState,
  type CommittedEffect,
  type EffectsScenario,
} from "../scenario.js";

export interface UncertaintyResults {
  connectorUnavailable: CommittedEffect;
  noEffect: CommittedEffect;
  parseError: CommittedEffect;
  providerRejectedCredential: CommittedEffect;
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
      (await providerOperation(revoked.idempotencyKey)) === undefined,
  );
  await stopProcess(scenario.runtime.connector);
  scenario.runtime.connector = await startConnector();
  scenario.processes.push(scenario.runtime.connector);

  await stopProcess(scenario.runtime.connector);
  const connectorUnavailable = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "connector-unavailable",
  );
  await dispatchOnce();
  scenario.recorder.inject("connector-unreachable-before-send");
  const connectorUnavailableSnapshot = await waitForState(
    scenario.effectA,
    connectorUnavailable.effectRequestId,
    EffectKnowledgeState.DEFINITELY_NOT_SENT,
  );
  scenario.runtime.connector = await startConnector();
  scenario.processes.push(scenario.runtime.connector);
  await dispatchOnce();
  const connectorRecovered = await waitForState(
    scenario.effectA,
    connectorUnavailable.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(connectorUnavailableSnapshot);
  scenario.recorder.state(connectorRecovered);
  scenario.recorder.observe(
    "connectorPreSendFailureIsDefinitelyNotSentAndRetryable",
    connectorUnavailableSnapshot.attempts[0]?.reason ===
      EffectAttemptReason.TIMEOUT_BEFORE_SEND &&
      connectorRecovered.attempts.length === 2,
  );

  await stopProcess(scenario.runtime.connector);
  scenario.runtime.connector = await startConnector({
    credentials: {
      "secret.provider.a": {
        secret: "revoked-provider-secret",
        tenantId: "tenant.a",
      },
      "secret.provider.b": {
        secret: "provider-secret",
        tenantId: "tenant.b",
      },
    },
  });
  scenario.processes.push(scenario.runtime.connector);
  const providerRejectedCredential = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "provider-rejected-credential",
  );
  await dispatchOnce();
  const providerRejectedSnapshot = await waitForState(
    scenario.effectA,
    providerRejectedCredential.effectRequestId,
    EffectKnowledgeState.UNKNOWN,
  );
  scenario.recorder.state(providerRejectedSnapshot);
  scenario.recorder.observe(
    "providerAuthRejectionAfterSendIsUnknown",
    providerRejectedSnapshot.attempts[0]?.reason ===
      EffectAttemptReason.PROVIDER_UNAVAILABLE,
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
  const definitelyNotSent = await waitForState(
    scenario.effectA,
    safeRetry.effectRequestId,
    EffectKnowledgeState.DEFINITELY_NOT_SENT,
  );
  scenario.runtime.provider = await startFaultProvider();
  scenario.processes.push(scenario.runtime.provider);
  await dispatchOnce();
  const safelyRetried = await waitForState(
    scenario.effectA,
    safeRetry.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  scenario.recorder.state(safelyRetried);
  scenario.recorder.observe(
    "definitelyNotSentTransportFailureGetsNewDurableAttempt",
    definitelyNotSent.attempts.length === 1 &&
      safelyRetried.attempts.length === 2 &&
      safelyRetried.attempts.every((attempt) =>
        /^attempt\.[0-9a-f]{64}$/.test(attempt.attemptId),
      ) &&
      (await waitForProviderOperation(safeRetry.idempotencyKey)).requests === 1,
  );
  return {
    connectorUnavailable,
    noEffect,
    parseError,
    providerRejectedCredential,
    revoked,
    safeRetry,
    schemaError,
  };
}
