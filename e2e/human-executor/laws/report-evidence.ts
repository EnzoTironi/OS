import assert from "node:assert/strict";
import { Code } from "@connectrpc/connect";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectKnowledgeState,
} from "../../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  commitEffect,
  evidenceInput,
  expectConnectCode,
  freezeHumanPayload,
  humanTaskContract,
  mapOperatorReport,
  sha256,
  submitOperatorReport,
  type HumanScenario,
} from "../scenario.js";

export async function verifyReportEvidence(scenario: HumanScenario): Promise<{
  acceptedPendingId: string;
  attemptId: string;
}> {
  const committed = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "report-evidence",
  );
  const contract = humanTaskContract();
  await freezeHumanPayload(scenario.admin, committed.effectRequestId, contract);
  const claim = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.report.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.ok(claim.claim);

  const mapped = mapOperatorReport({
    kind: "reported-success",
    notes: "signature collected",
  });
  assert.equal(mapped.outcome, EffectAttemptOutcome.ACCEPTED_PENDING);
  assert.notEqual(mapped.outcome, EffectAttemptOutcome.CONFIRMED);

  const first = await submitOperatorReport(
    scenario.effectHumanA,
    committed.effectRequestId,
    claim.claim.attemptId,
    "reported-success",
    "signature collected",
  );
  scenario.recorder.state(first);
  scenario.recorder.observe(
    "reportedSuccessIsAcceptedPending",
    first.request?.state === EffectKnowledgeState.ACCEPTED_PENDING,
  );
  scenario.recorder.kill(
    "operatorResultSetsConfirmed",
    first.request?.state !== EffectKnowledgeState.CONFIRMED &&
      first.request?.state !== EffectKnowledgeState.CONFIRMED_NO_EFFECT,
  );

  const second = await submitOperatorReport(
    scenario.effectHumanA,
    committed.effectRequestId,
    claim.claim.attemptId,
    "reported-success",
    "signature collected",
  );
  assert.equal(second.request?.state, EffectKnowledgeState.ACCEPTED_PENDING);
  scenario.recorder.kill("resultTwice", second.attempts.length === 1);

  await expectConnectCode(
    () =>
      scenario.effectHumanA.recordAttempt({
        attempt: {
          attemptId: claim.claim!.attemptId,
          observedAt: timestampFromDate(new Date()),
          outcome: EffectAttemptOutcome.CONFIRMED,
          providerOperationId: mapped.providerOperationId,
          reason: EffectAttemptReason.UNSPECIFIED,
          responseDigest: mapped.responseDigest,
        },
        effectRequestId: committed.effectRequestId,
      }),
    Code.InvalidArgument,
  );
  scenario.recorder.observe("engineRejectsHumanConfirmedOutcome", true);

  const confirmed = await scenario.effectReconcilerA.reconcile({
    effectRequestId: committed.effectRequestId,
    evidence: evidenceInput({
      evidenceId: "evidence.human.confirmed",
      idempotencyKey: committed.idempotencyKey,
      outcome: "confirmed",
      providerOperationId: mapped.providerOperationId,
      sourceRef: `urn:reconciler:${committed.effectRequestId}:confirmed`,
    }),
  });
  assert.ok(confirmed.snapshot);
  scenario.recorder.state(confirmed.snapshot);
  scenario.recorder.observe(
    "independentReconcilerCanConfirm",
    confirmed.snapshot.request?.state === EffectKnowledgeState.CONFIRMED,
  );

  const contradicted = await scenario.effectReconcilerA.reconcile({
    effectRequestId: committed.effectRequestId,
    evidence: evidenceInput({
      evidenceId: "evidence.human.no-effect",
      idempotencyKey: committed.idempotencyKey,
      outcome: "no_effect",
      providerOperationId: mapped.providerOperationId,
      sourceRef: `urn:reconciler:${committed.effectRequestId}:no-effect`,
    }),
  });
  assert.ok(contradicted.snapshot);
  scenario.recorder.state(contradicted.snapshot);
  scenario.recorder.kill(
    "reportedSuccessLaterContradicted",
    contradicted.snapshot.request?.state === EffectKnowledgeState.CONTRADICTED,
  );

  const expired = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "expired-task",
  );
  await freezeHumanPayload(
    scenario.admin,
    expired.effectRequestId,
    humanTaskContract({
      expiryMicros: 1,
      instruction: "too late",
    }),
  );
  await expectConnectCode(
    () =>
      scenario.effectHumanA.claimAttempt({
        adapterExecutionId: `human-claim.expired.${expired.effectRequestId}`,
        effectRequestId: expired.effectRequestId,
      }),
    Code.InvalidArgument,
  );
  scenario.recorder.kill("expiredTaskRemainsActionable", true);
  scenario.recorder.observe(
    "reportDigestStable",
    /^[0-9a-f]{64}$/.test(sha256("human-report:reported-success:signature collected")),
  );

  return {
    acceptedPendingId: committed.effectRequestId,
    attemptId: claim.claim.attemptId,
  };
}
