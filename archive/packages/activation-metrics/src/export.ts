import type { OpaqueId } from "./brands.js";
import { sanitizeExportBatch } from "./privacy.js";
import type {
  ActivationMetricsConfig,
  Exporter,
  ObservationRecord,
  ObservationStore,
} from "./types.js";

export type ExportResult = {
  readonly attempted: number;
  readonly exportedEventIds: string[];
  readonly exporterErrors: readonly {
    readonly exporterId: string;
    readonly message: string;
  }[];
};

/** No-op exporter for self-host / offline. */
export function createNullExporter(id = "null"): Exporter {
  return {
    id,
    async exportBatch(records) {
      return { exportedEventIds: records.map((record) => record.eventId) };
    },
  };
}

/**
 * Push pending observations through configured exporters.
 * Failures are collected; never thrown to the product path.
 */
export async function exportPending(args: {
  readonly store: ObservationStore;
  readonly tenantId: OpaqueId;
  readonly exporters: readonly Exporter[];
  readonly exportEnabled: boolean;
  readonly limit?: number;
}): Promise<ExportResult> {
  if (!args.exportEnabled || args.exporters.length === 0) {
    return { attempted: 0, exportedEventIds: [], exporterErrors: [] };
  }

  const pending = await args.store.listPendingExport(
    args.tenantId,
    args.limit ?? 100,
  );
  if (pending.length === 0) {
    return { attempted: 0, exportedEventIds: [], exporterErrors: [] };
  }

  const batch = sanitizeExportBatch(pending);
  const exported = new Set<string>();
  const exporterErrors: { exporterId: string; message: string }[] = [];

  for (const exporter of args.exporters) {
    try {
      const result = await exporter.exportBatch(batch);
      for (const eventId of result.exportedEventIds) {
        exported.add(eventId);
      }
    } catch (error) {
      exporterErrors.push({
        exporterId: exporter.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const exportedEventIds = [...exported];
  if (exportedEventIds.length > 0) {
    await args.store.markExported(args.tenantId, exportedEventIds);
  }

  return {
    attempted: batch.length,
    exportedEventIds,
    exporterErrors,
  };
}

export type ActivationMetrics = {
  readonly config: ActivationMetricsConfig;
  observe(record: ObservationRecord): Promise<ObservationRecord>;
  exportPending(tenantId: OpaqueId): Promise<ExportResult>;
};

/**
 * Facade: local store write first; export never blocks observe.
 */
export function createActivationMetrics(
  config: ActivationMetricsConfig,
): ActivationMetrics {
  return {
    config,
    async observe(record) {
      return config.store.insert(record);
    },
    async exportPending(tenantId) {
      return exportPending({
        store: config.store,
        tenantId,
        exporters: config.exporters,
        exportEnabled: config.exportEnabled,
      });
    },
  };
}
