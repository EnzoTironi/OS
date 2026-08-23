/** Named mutants this scenario must kill (ticket #266 / AD-15). */
export const REQUIRED_MUTANTS = [
  "FirstSuccess on integration connect",
  "Raw message body exported",
  "Analytics outage blocks onboarding",
  "Mandatory Zoen telemetry heartbeat",
  "Cross-tenant event query",
  "Creator attribution receives Action payload",
] as const;

export type RequiredMutant = (typeof REQUIRED_MUTANTS)[number];
