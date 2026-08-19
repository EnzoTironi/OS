import assert from "node:assert/strict";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  EffectEvidenceOutcome,
  EffectKnowledgeState,
  type EffectSnapshot,
} from "../../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  dispatchOnce,
  setProviderMode,
} from "../support.js";
import {
  actionCommitCount,
  commitEffect,
  delay,
  evidenceCounts,
  evidenceInput,
  sha256,
  waitForConnectorStatus,
  waitForProviderOperation,
  waitForState,
  type CommittedEffect,
  type EffectsScenario,
} from "../scenario.js";

export interface ReconciliationResults {
  accepted: CommittedEffect;
  ambiguous: CommittedEffect;
  claimedRace: CommittedEffect;
  contradicted: EffectSnapshot;
  firstEvidence: ReturnType<typeof evidenceInput>;
}

export async function verifyReconciliation(
  scenario: EffectsScenario,
): Promise<ReconciliationResults> {
  await setProviderMode("accepted_pending");
  const accepted = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "accepted",
  );
  await dispatchOnce();
  const acceptedSnapshot = await waitForState(
    scenario.effectA,
    accepted.effectRequestId,
    EffectKnowledgeState.ACCEPTED_PENDING,
  );
  scenario.recorder.state(acceptedSnapshot);
  scenario.recorder.observe(
    "remoteAcceptedRemainsPending",
    acceptedSnapshot.request?.state === EffectKnowledgeState.ACCEPTED_PENDING,
  );
  const acceptedEvidence = await waitForConnectorStatus(
    accepted.idempotencyKey,
  );
  scenario.recorder.observe(
    "productionConnectorQueriesProviderStatus",
    acceptedEvidence.idempotencyKey === accepted.idempotencyKey &&
      acceptedEvidence.providerOperationId.startsWith("provider."),
  );
  const actionCommitsBeforeReconcile = await actionCommitCount(scenario.admin);
  const firstEvidence = evidenceInput(
    acceptedEvidence,
    "accepted-confirmed",
  );
  const reconciled = await scenario.effectReconcilerA.reconcile({
    effectRequestId: accepted.effectRequestId,
    evidence: firstEvidence,
  });
  assert.ok(reconciled.snapshot);
  scenario.recorder.state(reconciled.snapshot);
  const duplicated = await scenario.effectReconcilerA.reconcile({
    effectRequestId: accepted.effectRequestId,
    evidence: firstEvidence,
  });
  assert.ok(duplicated.snapshot);
  const duplicateCounts = await evidenceCounts(
    scenario.admin,
    accepted.effectRequestId,
  );
  scenario.recorder.observe(
    "duplicateEvidenceIsIdempotent",
    duplicateCounts.evidence === 1 && duplicateCounts.reconciliations === 1,
  );
  const contradicted = await scenario.effectReconcilerA.reconcile({
    effectRequestId: accepted.effectRequestId,
    evidence: {
      evidenceDigest: sha256(
        `${accepted.effectRequestId}:no_effect:reordered`,
      ),
      evidenceId: "evidence.accepted-no-effect",
      idempotencyKey: accepted.idempotencyKey,
      observedAt: timestampFromDate(new Date()),
      outcome: EffectEvidenceOutcome.NO_EFFECT,
      providerOperationId: acceptedEvidence.providerOperationId,
      sourceId: "source.provider-query",
      sourceRef: `urn:provider-query:${accepted.effectRequestId}:no-effect`,
    },
  });
  assert.ok(contradicted.snapshot);
  scenario.recorder.state(contradicted.snapshot);
  scenario.recorder.observe(
    "reorderedOpposingEvidenceIsContradicted",
    contradicted.snapshot.request?.state === EffectKnowledgeState.CONTRADICTED,
  );
  scenario.recorder.observe(
    "reconciliationDoesNotRerunBusinessAction",
    (await actionCommitCount(scenario.admin)) ===
      actionCommitsBeforeReconcile,
  );

  await setProviderMode("hold_confirmed");
  const claimedRace = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "claim-reconcile-race",
  );
  await dispatchOnce();
  const claimedRemote = await waitForProviderOperation(
    claimedRace.idempotencyKey,
  );
  const beforeRaceReconcile = await scenario.admin.query<{
    attempts: string;
    claims: string;
  }>(
    `SELECT
        (SELECT count(*)::text FROM effect_attempt_claims WHERE tenant_id = $1 AND effect_request_id = $2) AS claims,
        (SELECT count(*)::text FROM effect_attempts WHERE tenant_id = $1 AND effect_request_id = $2) AS attempts`,
    ["tenant.a", claimedRace.effectRequestId],
  );
  const reconciledDuringSend = await scenario.effectReconcilerA.reconcile({
    effectRequestId: claimedRace.effectRequestId,
    evidence: {
      evidenceDigest: sha256(
        `${claimedRace.idempotencyKey}:no_effect:while-send-pending`,
      ),
      evidenceId: "evidence.claim-race-no-effect",
      idempotencyKey: claimedRace.idempotencyKey,
      observedAt: timestampFromDate(new Date()),
      outcome: EffectEvidenceOutcome.NO_EFFECT,
      providerOperationId: claimedRemote.providerOperationId,
      sourceId: "source.independent-audit",
      sourceRef: `urn:independent-audit:${claimedRemote.providerOperationId}`,
    },
  });
  assert.ok(reconciledDuringSend.snapshot);
  const raceContradicted = await waitForState(
    scenario.effectA,
    claimedRace.effectRequestId,
    EffectKnowledgeState.CONTRADICTED,
  );
  scenario.recorder.state(raceContradicted);
  scenario.recorder.observe(
    "attemptClaimPrecedesSendAndObservationSurvivesReconciliationRace",
    beforeRaceReconcile.rows[0]?.claims === "1" &&
      beforeRaceReconcile.rows[0]?.attempts === "0" &&
      reconciledDuringSend.snapshot.request?.state ===
        EffectKnowledgeState.CONFIRMED_NO_EFFECT &&
      raceContradicted.attempts.length === 1,
  );

  await setProviderMode("timeout_after_delivery");
  const ambiguous = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "ambiguous-timeout",
  );
  await dispatchOnce();
  const unknownSnapshot = await waitForState(
    scenario.effectA,
    ambiguous.effectRequestId,
    EffectKnowledgeState.UNKNOWN,
  );
  scenario.recorder.state(unknownSnapshot);
  const ambiguousRemote = await waitForProviderOperation(
    ambiguous.idempotencyKey,
  );
  await delay(1_100);
  const ambiguousAfterDelay = await scenario.effectA.getEffect({
    effectRequestId: ambiguous.effectRequestId,
  });
  assert.ok(ambiguousAfterDelay.snapshot);
  scenario.recorder.observe(
    "timeoutAfterPossibleDeliveryStaysUnknownWithoutBlindRetry",
    ambiguousAfterDelay.snapshot.request?.state ===
      EffectKnowledgeState.UNKNOWN && ambiguousRemote.requests === 1,
  );
  const reconciledUnknown = await scenario.effectReconcilerA.reconcile({
    effectRequestId: ambiguous.effectRequestId,
    evidence: evidenceInput(
      await waitForConnectorStatus(ambiguous.idempotencyKey),
      "ambiguous-confirmed",
    ),
  });
  assert.ok(reconciledUnknown.snapshot);
  scenario.recorder.state(reconciledUnknown.snapshot);
  scenario.recorder.observe(
    "independentEvidenceReconcilesUnknown",
    reconciledUnknown.snapshot.request?.state ===
      EffectKnowledgeState.CONFIRMED,
  );
  return {
    accepted,
    ambiguous,
    claimedRace,
    contradicted: contradicted.snapshot,
    firstEvidence,
  };
}
