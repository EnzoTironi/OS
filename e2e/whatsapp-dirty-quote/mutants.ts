export const REQUIRED_MUTANTS = [
  "Fuse-at-ingest",
  "Preview writes belief",
  "Agent SQL write",
  "RecordEvidence skips Action",
] as const;

export type RequiredMutant = (typeof REQUIRED_MUTANTS)[number];
