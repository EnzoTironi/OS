export const REQUIRED_MUTANTS = [
  "text-only-dedupe",
  "cross-tenant-dedupe-collision",
  "removed-member-still-notified",
  "fallback-ignores-audience",
  "old-StateBasis-commits",
  "automation-calls-external-effect",
  "duplicate-trigger-duplicates-Action",
] as const;

export type RequiredMutant = (typeof REQUIRED_MUTANTS)[number];
