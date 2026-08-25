import assert from "node:assert/strict";
import {
  observePackFirstSuccess,
  opaqueId,
  type FirstSuccessEvalResult,
  type ObservationStore,
} from "../../../archive/packages/activation-metrics/src/index.js";
import { packAdmin } from "../support.js";

export async function verifyFirstSuccessOutcome(args: {
  readonly store: ObservationStore;
  readonly adminToken: string;
  readonly installId: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly buildId: string;
  readonly record: (name: string, observed: boolean) => void;
  readonly killMutant: (name: string) => void;
}): Promise<void> {
  const tenantId = opaqueId(args.tenantId);
  const sessionId = opaqueId(args.sessionId);

  const setupEval = await packAdmin(
    "POST",
    "/pack/admin/evaluate-first-success",
    args.adminToken,
    { installId: args.installId, tenantId: args.tenantId },
  );
  assert.equal(setupEval.status, 200, JSON.stringify(setupEval.body));
  const wireStatus = String(setupEval.body.status);
  args.record(
    "pack_eval_not_matched_after_setup",
    wireStatus === "not_matched" || wireStatus === "not_ready",
  );

  const observation = await observePackFirstSuccess({
    tenantId,
    sessionId,
    installId: args.installId,
    eventId: `pack-fs-setup-${args.installId}`,
    buildId: args.buildId,
    store: args.store,
    evaluate: async (): Promise<FirstSuccessEvalResult> => {
      if (wireStatus === "matched") {
        return {
          status: "matched",
          outcomeRef: String(setupEval.body.outcomeRef),
          firedAtMicros: Number(setupEval.body.firedAtMicros),
        };
      }
      if (wireStatus === "not_ready") {
        return { status: "not_ready" };
      }
      return { status: "not_matched" };
    },
  });

  args.record(
    "observe_pack_first_success_not_on_connect",
    observation.status !== "matched",
  );
  args.killMutant("FirstSuccess on integration connect");

  const forgedConnect = await observePackFirstSuccess({
    tenantId,
    sessionId,
    installId: args.installId,
    eventId: `pack-fs-oauth-${args.installId}`,
    buildId: args.buildId,
    store: args.store,
    evaluate: async () => ({ status: "not_matched" }),
  });
  args.record(
    "oauth_connect_not_pack_first_success",
    forgedConnect.status === "not_matched",
  );
}
