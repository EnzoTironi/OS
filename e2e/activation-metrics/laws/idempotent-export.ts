import {
  createNullExporter,
  exportPending,
  observeContract,
  opaqueId,
  type ObservationStore,
} from "../../../packages/activation-metrics/src/index.js";

export async function verifyIdempotentExport(args: {
  readonly store: ObservationStore;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly buildId: string;
  readonly record: (name: string, observed: boolean) => void;
}): Promise<void> {
  const tenantId = opaqueId(args.tenantId);
  const sessionId = opaqueId(args.sessionId);

  await observeContract({
    contractId: "pack_installed",
    tenantId,
    sessionId,
    eventId: "idempotent-pack-installed",
    buildId: args.buildId,
    store: args.store,
    evaluator: {
      kind: "outcome",
      evaluate: async () => ({ status: "matched", outcomeRef: "install.1" }),
    },
  });

  const exporter = createNullExporter("idempotent");
  const first = await exportPending({
    store: args.store,
    tenantId,
    exporters: [exporter],
    exportEnabled: true,
  });
  const second = await exportPending({
    store: args.store,
    tenantId,
    exporters: [exporter],
    exportEnabled: true,
  });
  args.record(
    "export_same_event_id_once",
    first.exportedEventIds.includes("idempotent-pack-installed") &&
      second.attempted === 0,
  );
}
