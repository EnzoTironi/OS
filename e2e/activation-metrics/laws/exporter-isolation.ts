import assert from "node:assert/strict";
import {
  createActivationMetrics,
  exportPending,
  observeContract,
  opaqueId,
  type Exporter,
  type ObservationStore,
} from "../../../packages/activation-metrics/src/index.js";
import { createMemoryFrictionStore } from "../../../packages/activation-metrics/src/memory-store.js";

export async function verifyExporterIsolation(args: {
  readonly store: ObservationStore;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly buildId: string;
  readonly record: (name: string, observed: boolean) => void;
  readonly killMutant: (name: string) => void;
}): Promise<{ readonly egressCount: number }> {
  const tenantId = opaqueId(args.tenantId);
  const sessionId = opaqueId(args.sessionId);
  let egressCount = 0;

  const faulty: Exporter = {
    id: "faulty",
    async exportBatch(records) {
      egressCount += records.length;
      throw new Error("exporter outage");
    },
  };

  const tracking: Exporter = {
    id: "tracking",
    async exportBatch(records) {
      egressCount += records.length;
      return { exportedEventIds: records.map((r) => r.eventId) };
    },
  };

  const metrics = createActivationMetrics({
    store: args.store,
    frictionStore: createMemoryFrictionStore(),
    exporters: [faulty],
    exportEnabled: true,
  });

  const ready = await observeContract({
    contractId: "ontology_ready",
    tenantId,
    sessionId,
    eventId: "sample-ontology-ready",
    buildId: args.buildId,
    store: args.store,
    nowMicros: () => 1_000,
    evaluator: {
      kind: "outcome",
      evaluate: async () => ({ status: "matched" }),
    },
  });
  assert.equal(ready.status, "matched");

  const action = await observeContract({
    contractId: "first_approved_action",
    tenantId,
    sessionId,
    eventId: "sample-first-action",
    buildId: args.buildId,
    store: args.store,
    nowMicros: () => 2_000,
    evaluator: {
      kind: "outcome",
      evaluate: async () => ({
        status: "matched",
        outcomeRef: "op.sample.commitment",
      }),
    },
  });
  assert.equal(action.status, "matched");
  args.record("sample_action_completes_with_exporter_fault", true);

  const outage = await metrics.exportPending(tenantId);
  assert.equal(outage.exporterErrors.length, 1);
  args.record("exporter_outage_does_not_fail_product", true);
  args.killMutant("Analytics outage blocks onboarding");

  const disabled = await exportPending({
    store: args.store,
    tenantId,
    exporters: [],
    exportEnabled: false,
  });
  assert.equal(disabled.attempted, 0);
  args.record("exporters_disabled_zero_egress_attempt", disabled.attempted === 0);
  args.killMutant("Mandatory Zoen telemetry heartbeat");

  const first = await exportPending({
    store: args.store,
    tenantId,
    exporters: [tracking],
    exportEnabled: true,
  });
  const second = await exportPending({
    store: args.store,
    tenantId,
    exporters: [tracking],
    exportEnabled: true,
  });
  args.record(
    "duplicate_export_idempotent",
    first.exportedEventIds.length > 0 && second.attempted === 0,
  );

  return { egressCount };
}
