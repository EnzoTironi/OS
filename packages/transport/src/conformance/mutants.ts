export type MutantId =
  | "renderer_changes_business_meaning"
  | "unsupported_capability_silently_disappears"
  | "duplicate_webhook_duplicate_interaction"
  | "provider_user_id_as_zoen_identity"
  | "rich_action_fallback_bypasses_surface"
  | "restart_duplicates_delivery"
  | "official_cloud_api_satisfies_unofficial_brazil";

export const MUTANT_IDS: readonly MutantId[] = [
  "renderer_changes_business_meaning",
  "unsupported_capability_silently_disappears",
  "duplicate_webhook_duplicate_interaction",
  "provider_user_id_as_zoen_identity",
  "rich_action_fallback_bypasses_surface",
  "restart_duplicates_delivery",
  "official_cloud_api_satisfies_unofficial_brazil",
] as const;

export interface MutantKill {
  readonly id: MutantId;
  readonly killed: true;
  readonly evidence: string;
}

export function mutantKill(id: MutantId, evidence: string): MutantKill {
  return { evidence, id, killed: true };
}
