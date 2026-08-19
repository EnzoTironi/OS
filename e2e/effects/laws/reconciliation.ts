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
  waitForProviderOperation,
  waitForState,
  type CommittedEffect,
  type EffectsScenario,
} from "../scenario.js";

export interface ReconciliationResults {
  accepted: CommittedEffect;
  ambiguous: CommittedEffect;
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
  const acceptedEvidence = await waitForProviderOperation(
    accepted.effectRequestId,
  );
  const actionCommitsBeforeReconcile = await actionCommitCount(scenario.admin);
  const firstEvidence = evidenceInput(
    acceptedEvidence,
    "accepted-confirmed",
  );
  const reconciled = await scenario.effectA.reconcile({
    effectRequestId: accepted.effectRequestId,
    evidence: firstEvidence,
  });
  assert.ok(reconciled.snapshot);
  scenario.recorder.state(reconciled.snapshot);
  const duplicated = await scenario.effectA.reconcile({
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
  const contradicted = await scenario.effectA.reconcile({
    effectRequestId: accepted.effectRequestId,
    evidence: {
      evidenceDigest: sha256(
        `${accepted.effectRequestId}:no_effect:reordered`,
      ),
      evidenceId: "evidence.accepted-no-effect",
      externalOperationId: accepted.effectRequestId,
      observedAt: timestampFromDate(new Date()),
      outcome: EffectEvidenceOutcome.NO_EFFECT,
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
    ambiguous.effectRequestId,
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
  const reconciledUnknown = await scenario.effectA.reconcile({
    effectRequestId: ambiguous.effectRequestId,
    evidence: evidenceInput(ambiguousRemote, "ambiguous-confirmed"),
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
    contradicted: contradicted.snapshot,
    firstEvidence,
  };
}
