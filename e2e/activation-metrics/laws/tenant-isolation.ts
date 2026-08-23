import assert from "node:assert/strict";
import {
  observeContract,
  opaqueId,
  type ObservationStore,
} from "../../../packages/activation-metrics/src/index.js";

export async function verifyTenantIsolation(args: {
  readonly store: ObservationStore;
  readonly sessionId: string;
  readonly buildId: string;
  readonly record: (name: string, observed: boolean) => void;
  readonly killMutant: (name: string) => void;
}): Promise<void> {
  const tenantA = opaqueId("tenant.a");
  const tenantB = opaqueId("tenant.b");
  const sessionId = opaqueId(args.sessionId);

  await observeContract({
    contractId: "integration_connected",
    tenantId: tenantA,
    sessionId,
    eventId: "tenant-a-integration",
    buildId: args.buildId,
    store: args.store,
    evaluator: {
      kind: "outcome",
      evaluate: async () => ({ status: "matched" }),
    },
  });

  const cross = await args.store.listBySession(tenantB, sessionId);
  assert.equal(cross.length, 0);
  args.record("cross_tenant_query_fails", cross.length === 0);
  args.killMutant("Cross-tenant event query");
}
