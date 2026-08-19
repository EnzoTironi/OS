import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectKnowledgeState,
} from "../../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  connectorCallerToken,
  connectorUrl,
  dispatchOnce,
  setProviderMode,
  tenantB,
} from "../support.js";
import {
  commitEffect,
  dispatchAttemptCount,
  evidenceInput,
  expectConnectCode,
  waitForConnectorStatus,
  waitForState,
  type CommittedEffect,
  type EffectsScenario,
} from "../scenario.js";

export async function verifyTenantIsolation(
  scenario: EffectsScenario,
  accepted: CommittedEffect,
  evidence: ReturnType<typeof evidenceInput>,
): Promise<void> {
  const crossTenantGet = await expectConnectCode(
    () =>
      scenario.effectB.getEffect({
        effectRequestId: accepted.effectRequestId,
      }),
    Code.NotFound,
  );
  const dispatchAttemptsBeforeTenantB = await dispatchAttemptCount(
    scenario.admin,
    accepted.effectRequestId,
  );
  const crossTenantReconcile = await expectConnectCode(
    () =>
      scenario.effectReconcilerB.reconcile({
        effectRequestId: accepted.effectRequestId,
        evidence,
      }),
    Code.NotFound,
  );
  const actionReconcile = await expectConnectCode(
    () =>
      scenario.effectA.reconcile({
        effectRequestId: accepted.effectRequestId,
        evidence,
      }),
    Code.PermissionDenied,
  );
  const actionClaim = await expectConnectCode(
    () =>
      scenario.effectA.claimAttempt({
        adapterExecutionId: "forged.action.invocation",
        effectRequestId: accepted.effectRequestId,
      }),
    Code.PermissionDenied,
  );
  const actionRecord = await expectConnectCode(
    () =>
      scenario.effectA.recordAttempt({
        attempt: {
          attemptId: "attempt.forged",
          observedAt: timestampFromDate(new Date()),
          outcome: EffectAttemptOutcome.UNKNOWN,
          reason: EffectAttemptReason.TIMEOUT_AFTER_POSSIBLE_DELIVERY,
        },
        effectRequestId: accepted.effectRequestId,
      }),
    Code.PermissionDenied,
  );
  const workerReconcile = await expectConnectCode(
    () =>
      scenario.effectWorkerA.reconcile({
        effectRequestId: accepted.effectRequestId,
        evidence,
      }),
    Code.PermissionDenied,
  );

  const unauthenticatedConnector = await fetch(connectorUrl, {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const emptyDigest = createHash("sha256").update("").digest("hex");
  const foreignCredential = await fetch(connectorUrl, {
    body: JSON.stringify({
      credentialRef: "secret.provider.a",
      effectRequestId: "effect.connector-attack",
      idempotencyKey: "idempotency.connector-attack",
      payloadBase64: "",
      requestDigest: emptyDigest,
      tenantId: tenantB,
    }),
    headers: {
      authorization: `Bearer ${connectorCallerToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  await setProviderMode("confirmed");
  const tenantBEffect = await commitEffect(
    scenario.actionB,
    scenario.fixture,
    "tenant-b",
    tenantB,
  );
  await dispatchOnce(tenantB);
  const tenantBConfirmed = await waitForState(
    scenario.effectB,
    tenantBEffect.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  const tenantBProvider = await waitForConnectorStatus(
    tenantBEffect.idempotencyKey,
    tenantB,
  );
  const dispatchAttemptsAfterTenantB = await dispatchAttemptCount(
    scenario.admin,
    accepted.effectRequestId,
  );

  scenario.recorder.observe(
    "tenantIsolationCoversWorkerConnectorScheduleQueryAndReconcile",
    crossTenantGet === Code.NotFound &&
      crossTenantReconcile === Code.NotFound &&
      actionReconcile === Code.PermissionDenied &&
      actionClaim === Code.PermissionDenied &&
      actionRecord === Code.PermissionDenied &&
      workerReconcile === Code.PermissionDenied &&
      unauthenticatedConnector.status === 401 &&
      foreignCredential.status === 403 &&
      dispatchAttemptsBeforeTenantB === dispatchAttemptsAfterTenantB &&
      tenantBConfirmed.attempts.length === 1 &&
      tenantBProvider.idempotencyKey === tenantBEffect.idempotencyKey,
  );
  assert.equal(tenantBProvider.outcome, "confirmed");
}
