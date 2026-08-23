declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

function brandString<B extends string>(
  value: string,
  label: B,
): Brand<string, B> {
  if (value.length === 0 || value.length > 200) {
    throw new Error(`${label} must be 1..200 chars`);
  }
  return value as Brand<string, B>;
}

/** Opaque product/tenant/session id. Never raw content. */
export type OpaqueId = Brand<string, "OpaqueId">;

export function opaqueId(value: string): OpaqueId {
  return brandString(value, "OpaqueId");
}

export const ACTIVATION_CONTRACT_IDS = [
  "contact_started",
  "intent_expressed",
  "account_verified",
  "workspace_joined",
  "integration_connected",
  "source_inspected",
  "mapping_proposed",
  "ambiguity_resolved",
  "ontology_ready",
  "shadow_started",
  "first_useful_answer",
  "first_proposal",
  "first_approved_action",
  "first_delegated_action",
  "second_process",
  "pack_installed",
  "pack_first_success",
  "pack_shared",
] as const;

export type ActivationContractId = (typeof ACTIVATION_CONTRACT_IDS)[number];

const contractIdSet = new Set<string>(ACTIVATION_CONTRACT_IDS);

export function parseActivationContractId(value: string): ActivationContractId {
  if (!contractIdSet.has(value)) {
    throw new Error(`unknown ActivationContractId: ${value}`);
  }
  return value as ActivationContractId;
}

export function isActivationContractId(
  value: string,
): value is ActivationContractId {
  return contractIdSet.has(value);
}
