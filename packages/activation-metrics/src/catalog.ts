import type { ActivationContract, MetricSpec } from "./types.js";

/** Built-in activation contracts. #256/#258 register as not_ready_slot. */
export const ACTIVATION_CONTRACTS: readonly ActivationContract[] = [
  {
    contractId: "contact_started",
    outcome: { kind: "session_marker", marker: "contact_started" },
  },
  {
    contractId: "intent_expressed",
    after: "contact_started",
    outcome: { kind: "session_marker", marker: "intent_expressed" },
  },
  {
    contractId: "account_verified",
    after: "intent_expressed",
    outcome: { kind: "session_marker", marker: "account_verified" },
  },
  {
    contractId: "workspace_joined",
    after: "account_verified",
    outcome: { kind: "session_marker", marker: "workspace_joined" },
  },
  {
    contractId: "integration_connected",
    after: "workspace_joined",
    outcome: { kind: "session_marker", marker: "integration_connected" },
  },
  {
    contractId: "source_inspected",
    after: "integration_connected",
    outcome: { kind: "session_marker", marker: "source_inspected" },
  },
  {
    contractId: "mapping_proposed",
    after: "source_inspected",
    outcome: { kind: "session_marker", marker: "mapping_proposed" },
  },
  {
    contractId: "ambiguity_resolved",
    after: "mapping_proposed",
    outcome: { kind: "session_marker", marker: "ambiguity_resolved" },
  },
  {
    contractId: "ontology_ready",
    after: "ambiguity_resolved",
    outcome: { kind: "session_marker", marker: "ontology_ready" },
  },
  {
    contractId: "shadow_started",
    after: "ontology_ready",
    outcome: { kind: "session_marker", marker: "shadow_started" },
  },
  {
    contractId: "first_useful_answer",
    after: "source_inspected",
    outcome: { kind: "evidence_recorded", relationId: "query.answer" },
  },
  {
    contractId: "first_proposal",
    after: "ontology_ready",
    outcome: { kind: "session_marker", marker: "first_proposal" },
  },
  {
    contractId: "first_approved_action",
    after: "ontology_ready",
    outcome: {
      kind: "action_committed",
      actionId: "commercial.changeCommitment",
    },
  },
  {
    contractId: "first_delegated_action",
    after: "shadow_started",
    outcome: { kind: "not_ready_slot", blockedBy: "#258" },
  },
  {
    contractId: "second_process",
    after: "first_approved_action",
    outcome: { kind: "not_ready_slot", blockedBy: "#256" },
  },
  {
    contractId: "pack_installed",
    outcome: {
      kind: "install_receipt_active",
      installIdBrand: "InstallId",
    },
  },
  {
    contractId: "pack_first_success",
    after: "pack_installed",
    declaredContractId: "sample.first_governed_commitment",
    outcome: {
      kind: "action_committed",
      actionId: "commercial.changeCommitment",
    },
  },
  {
    contractId: "pack_shared",
    after: "pack_first_success",
    outcome: { kind: "session_marker", marker: "pack_shared" },
  },
] as const;

export const METRIC_SPECS: readonly MetricSpec[] = [
  {
    metricId: "time_to_sample_first_action",
    from: "ontology_ready",
    to: "first_approved_action",
    aggregation: "duration",
  },
  {
    metricId: "time_to_first_useful_own_data",
    from: "source_inspected",
    to: "first_useful_answer",
    aggregation: "duration",
  },
  {
    metricId: "time_to_first_governed_action",
    from: "workspace_joined",
    to: "first_approved_action",
    aggregation: "duration",
  },
  {
    metricId: "demo_to_own_data",
    from: "first_approved_action",
    to: "first_useful_answer",
    aggregation: "conversion",
  },
  {
    metricId: "source_connect_to_first_success",
    from: "integration_connected",
    to: "pack_first_success",
    aggregation: "conversion",
  },
  {
    metricId: "first_to_repeated_action",
    from: "first_approved_action",
    to: "second_process",
    aggregation: "conversion",
  },
  {
    metricId: "first_to_second_process",
    from: "first_proposal",
    to: "second_process",
    aggregation: "conversion",
  },
  {
    metricId: "shadow_to_delegated",
    from: "shadow_started",
    to: "first_delegated_action",
    aggregation: "conversion",
  },
  {
    metricId: "pack_install_to_first_success",
    from: "pack_installed",
    to: "pack_first_success",
    aggregation: "duration",
  },
] as const;

const contractById = new Map(
  ACTIVATION_CONTRACTS.map((contract) => [contract.contractId, contract]),
);

const metricById = new Map(
  METRIC_SPECS.map((metric) => [metric.metricId, metric]),
);

export function getActivationContract(
  contractId: string,
): ActivationContract | undefined {
  return contractById.get(contractId as ActivationContract["contractId"]);
}

export function getMetricSpec(metricId: string): MetricSpec | undefined {
  return metricById.get(metricId);
}

export function requireMetricSpec(metricId: string): MetricSpec {
  const spec = getMetricSpec(metricId);
  if (spec === undefined) {
    throw new Error(`unknown MetricSpec: ${metricId}`);
  }
  return spec;
}
