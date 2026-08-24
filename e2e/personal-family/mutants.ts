export const REQUIRED_MUTANTS = [
  "if-personal-generic-branch",
  "personal-tenant-fallback-enterprise",
  "personal-memory-in-company-prompt",
  "family-group-as-principal",
  "personal-proposal-resolved-by-enterprise",
  "action-client-ignores-request-tenant",
] as const;

export type RequiredMutant = (typeof REQUIRED_MUTANTS)[number];
