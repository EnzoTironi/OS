/** Named mutants this scenario must kill (ticket #258 / AD-07). */
export const REQUIRED_MUTANTS = [
  "Hidden mapping in parser",
  "Ambiguity answer only in chat",
  "Shadow calls commitOrRecover",
  "Shadow writes EffectRequest",
  "Source schema copied 1:1 as customer ontology",
  "Generated ontology auto-activated without publish governance",
  "Schema drift silently reinterprets bindings",
  "Model handed raw write credential",
] as const;

export type RequiredMutant = (typeof REQUIRED_MUTANTS)[number];
