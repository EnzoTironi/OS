# UFO / OntoUML endurant types

- Artifact ID: `issue-0037-endurant-types`
- Issue: https://github.com/EnzoTironi/OS/issues/37
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Research angle: What UFO and OntoUML 2.0 actually say about kinds, roles, phases, relators, events, and qualities.
- Decision states present: `supported`, `hypothesis`, `undetermined`
- Primary synthesis: [`../comparative/issue-0037-formal-ontology-synthesis.md`](../comparative/issue-0037-formal-ontology-synthesis.md)

## Question

Which UFO distinctions are formal enough to constrain an OS type system, and which are only a modeling language?

## Source scope

- Guizzardi et al., *Towards OntoUML 2.0*, 2018. https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf
- Guizzardi et al., *UFO: Unified Foundational Ontology*, Applied Ontology 2021, DOI 10.3233/AO-210256. ResearchGate author text, accessed 2026-08-15.
- Not read in full: Guizzardi 2005 thesis, UFO-B mereology papers, UFO-C, UFO-S.

## Evidence

See comparative `E-001` through `E-006`. Short restatement:

UFO-A covers endurants. UFO-B covers perdurants. Endurants change. Perdurants do not. A kind is a rigid ultimate sortal and is unique per individual. Roles are anti-rigid and relational. Phases are anti-rigid and intrinsic. Relators are existentially dependent individuals, often composed of commitments and claims. OntoUML 2.0 applies kind/role/phase to relators, modes, and qualities after modelers repeatedly broke OntoUML 1 to do that. Table 1 of the 2018 paper lists checkable taxonomic constraints.

## Domain evidence

Identity survives role change. A relationship can itself have a career. A quality such as a benefit amount can change without becoming a different quality. Occurrences are not objects with a status field.

## Source-system artifacts

`«kind»`, `«relatorKind»`, `«modeKind»`, `«qualityKind»`, mixins, the Visual Paradigm plugin, TPTP axiom names. These are OntoUML machinery.

## Candidate laws

Comparative `L-001` and `L-002`. Unique kind, and lifecycle-bearing relationships as individuals.

## Counterexamples

Comparative `X-001`, `X-002`, `X-008`.

## Runtime consequences

Comparative `R-001` and `R-005`. Definition-time taxonomic checks. Actions that target the relationship individual.

## Open questions

Whether OS needs native Kind/Role/Phase/Relator categories, or type meta-properties plus constraints. `undetermined`. Do not treat this note as an answer to `docs/open-questions.md` items 2 and 12.

## Licensing

Concepts and published axioms only. No tool code reused.

## Decision state

`supported` for the distinctions. `hypothesis` for encoding them without new RFC primitives. `undetermined` for qualities as a kernel concern.
