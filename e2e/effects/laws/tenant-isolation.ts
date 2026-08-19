import { Code } from "@connectrpc/connect";
import {
  dispatchOnce,
  tenantB,
} from "../support.js";
import {
  dispatchAttemptCount,
  evidenceInput,
  expectConnectCode,
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
  await dispatchOnce(tenantB);
  const dispatchAttemptsAfterTenantB = await dispatchAttemptCount(
    scenario.admin,
    accepted.effectRequestId,
  );
  const crossTenantReconcile = await expectConnectCode(
    () =>
      scenario.effectB.reconcile({
        effectRequestId: accepted.effectRequestId,
        evidence,
      }),
    Code.NotFound,
  );
  scenario.recorder.observe(
    "tenantIsolationCoversScheduleQueryAndReconcile",
    crossTenantGet === Code.NotFound &&
      crossTenantReconcile === Code.NotFound &&
      dispatchAttemptsBeforeTenantB === dispatchAttemptsAfterTenantB,
  );
}
