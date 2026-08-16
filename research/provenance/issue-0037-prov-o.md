# W3C PROV-O as a reference, not a kernel

- Artifact ID: `issue-0037-prov-o`
- Issue: https://github.com/EnzoTironi/OS/issues/37
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Research angle: Which PROV distinctions OS should enforce or export, and which would damage the object model if adopted.
- Decision states present: `supported`, `hypothesis`, `rejected`
- Primary synthesis: [`../comparative/issue-0037-formal-ontology-synthesis.md`](../comparative/issue-0037-formal-ontology-synthesis.md)

## Question

Which of Entity, Activity, Agent, derivation, and delegation belong in the OS metamodel, and which belong in an interchange mapping?

## Source scope

- W3C PROV-O, 30 April 2013. http://www.w3.org/TR/2013/REC-prov-o-20130430/
- W3C PROV-DM, 30 April 2013. http://www.w3.org/TR/2013/REC-prov-dm-20130430/
- W3C PROV-CONSTRAINTS, 30 April 2013. http://www.w3.org/TR/2013/REC-prov-constraints-20130430/

## Evidence

See comparative `E-015` through `E-018`.

Starting point classes are Entity, Activity, Agent. Derivation can omit the activity. Delegation (`actedOnBehalfOf`) keeps both agents responsible. Entity attributes are fixed aspects of an underlying changing thing. Instantaneous generation, use, invalidation, start, and end events are implicit. Validity is defined by uniqueness, ordering, impossibility, and type constraints. Entity and activity identifiers must not overlap.

## Domain evidence

"Where did this number come from" and "who acted for whom" are part of meaning when policy depends on them. That matches constitution article 11 and RFC-0001's provenance section. It does not require PROV class names in the kernel.

## Source-system artifacts

OWL-RL encoding, qualified-influence reification, bundles, collections, `prov:value`, RDF serializations.

## Candidate laws

Comparative `L-005`. Export and validate PROV. Do not use `prov:Entity` as ObjectType.

## Counterexamples

Comparative `X-005`. A person who changes phase cannot be one PROV entity with mutable attributes.

## Runtime consequences

Comparative `R-004`. Derivation and delegation used in authority decisions should be reconstructable and checkable.

## Open questions

Open question 8 remains `undetermined` except for the negative claim that Entity is the wrong object primitive. Whether every Fact carries a derivation graph is not answered here.

## Licensing

W3C documents. Concepts only. No OWL file imported.

## Decision state

`supported` for derivation, delegation, and validity-as-enforcement. `rejected` for Entity as ObjectType. `hypothesis` for how OS Facts relate to PROV snapshots.
