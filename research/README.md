# Research notes

This directory is for **evidence**, not for prematurely defining OS.

Research should extract domain meaning from mature systems, standards, formal ontologies, and real operational scenarios while keeping source-specific implementation details clearly separated from candidate OS semantics.

## Suggested structure

```text
research/
  erpnext/
  odoo/
  moqui/
  palantir/
  valueflows-rea/
  ontouml-ufo/
  gs1-epcis/
  isa95/
  fibo/
  provenance/
  temporal/
  comparative/
```

Directories should be created when they contain actual research. Empty taxonomy is not useful.

## Evidence note template

A useful research note should answer:

```text
Question
    What real-world distinction are we investigating?

Source
    Which implementation / standard / document / test / issue?

Observed model
    What concepts and relationships does the source use?

Observed behavior
    What actually happens? Include lifecycle and failure cases.

Invariants
    What must remain true?

Edge cases
    What exceptions or historical fixes reveal hidden assumptions?

Interpretation
    What real-world distinction may explain the source design?

Alternative interpretations
    What else could explain it?

Cross-reference
    Which independent systems agree or disagree?

Candidate implication for OS
    A hypothesis, never a direct mapping.

Counterexample needed
    What scenario could prove this interpretation wrong?

Licensing note
    Are we extracting behavior/concepts only, or considering implementation reuse?
```

## Clean-room posture

OS is MIT licensed. Research into GPL/LGPL/other licensed projects should default to conceptual and behavioral analysis:

- schemas as evidence of domain distinctions;
- tests as evidence of invariants and edge cases;
- documentation as evidence of intended behavior;
- issues/migrations as evidence of historical failures;
- public APIs as evidence of operational boundaries.

Do not paste or mechanically translate source implementation into OS core unless implementation reuse has been explicitly reviewed and approved.

## Research quality bar

A note should prefer concrete evidence over feature summaries.

Weak:

> ERPNext has Work Orders and Job Cards.

Better:

> ERPNext separates Work Order (authorized/planned production) from Job Card (actual execution of an operation at a workstation), and downstream completion/cancellation behavior depends on this distinction. Compare with Odoo Work Orders and ValueFlows planned Process versus observed EconomicEvents to test whether the distinction is domain-level.

The second form can inform a metamodel. The first cannot.
