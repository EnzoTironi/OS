import type { ActivationContractId, OpaqueId } from "./brands.js";

export type ContractOutcomeSpec =
  | { readonly kind: "action_committed"; readonly actionId: string }
  | { readonly kind: "evidence_recorded"; readonly relationId: string }
  | { readonly kind: "install_receipt_active"; readonly installIdBrand: "InstallId" }
  | { readonly kind: "session_marker"; readonly marker: string }
  | { readonly kind: "not_ready_slot"; readonly blockedBy: string };

export type ActivationContract = {
  readonly contractId: ActivationContractId;
  readonly declaredContractId?: string;
  readonly outcome: ContractOutcomeSpec;
  readonly after?: ActivationContractId;
};

export type MetricSpec = {
  readonly metricId: string;
  readonly from: ActivationContractId;
  readonly to: ActivationContractId;
  readonly aggregation: "duration" | "conversion";
};

export type ObservationStatus =
  | "matched"
  | "not_matched"
  | "not_ready"
  | "abandoned";

export type FrictionCategory =
  | "confusion"
  | "error"
  | "timeout"
  | "permission"
  | "no_outcome"
  | "manual_help"
  | "other";

/** Privacy-safe observation of a named activation contract. */
export type ObservationRecord = {
  readonly eventId: string;
  readonly contractId: ActivationContractId;
  readonly declaredContractId?: string;
  readonly status: ObservationStatus;
  readonly observedAtMicros: number;
  readonly tenantId: OpaqueId;
  readonly accountId?: OpaqueId;
  readonly sessionId: OpaqueId;
  readonly productId?: OpaqueId;
  readonly buildId: string;
  readonly outcomeRef?: string;
  readonly reasonCategory?: FrictionCategory;
};

export type ContractObservation = ObservationRecord;

export type MetricResult =
  | {
      readonly kind: "duration";
      readonly metricId: string;
      readonly from: ActivationContractId;
      readonly to: ActivationContractId;
      readonly durationMicros: number;
      readonly fromEventId: string;
      readonly toEventId: string;
    }
  | {
      readonly kind: "conversion";
      readonly metricId: string;
      readonly from: ActivationContractId;
      readonly to: ActivationContractId;
      readonly matchedFrom: number;
      readonly matchedToGivenFrom: number;
    }
  | {
      readonly kind: "unavailable";
      readonly metricId: string;
      readonly reason:
        | "missing_from"
        | "missing_to"
        | "not_matched"
        | "not_ready_slot";
    };

export type FrictionEntry = {
  readonly frictionId: string;
  readonly contractId: ActivationContractId;
  readonly sessionId: OpaqueId;
  readonly elapsedMicros: number;
  readonly category: FrictionCategory;
  readonly userVisibleMessageCode: string;
  readonly recoveryPath: string;
  readonly manualHelpNeeded: boolean;
  readonly buildId: string;
  readonly recordedAtMicros: number;
};

/** AD-08 FirstSuccessEval wire shape consumed by observePackFirstSuccess. */
export type FirstSuccessEvalResult =
  | { readonly status: "not_ready" }
  | { readonly status: "not_matched" }
  | {
      readonly status: "matched";
      readonly outcomeRef: string;
      readonly firedAtMicros: number;
    };

export type Exporter = {
  readonly id: string;
  exportBatch(
    records: readonly ObservationRecord[],
  ): Promise<{ exportedEventIds: string[] }>;
};

export type ObservationStore = {
  insert(record: ObservationRecord): Promise<ObservationRecord>;
  getByEventId(
    tenantId: OpaqueId,
    eventId: string,
  ): Promise<ObservationRecord | undefined>;
  listBySession(
    tenantId: OpaqueId,
    sessionId: OpaqueId,
  ): Promise<readonly ObservationRecord[]>;
  listPendingExport(
    tenantId: OpaqueId,
    limit: number,
  ): Promise<readonly ObservationRecord[]>;
  markExported(
    tenantId: OpaqueId,
    eventIds: readonly string[],
  ): Promise<void>;
};

export type FrictionStore = {
  append(entry: FrictionEntry): Promise<FrictionEntry>;
  listBySession(
    sessionId: OpaqueId,
  ): Promise<readonly FrictionEntry[]>;
};

export type ActivationMetricsConfig = {
  readonly store: ObservationStore;
  readonly frictionStore: FrictionStore;
  readonly exporters: readonly Exporter[];
  readonly exportEnabled: boolean;
};
