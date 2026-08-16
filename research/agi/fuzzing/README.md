---
issue: 51
track: agi
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
fetched: 2026-08-16
---

# Semantic fuzzing of candidate ontologies

This folder is a **research attack toolchain**, not OS runtime syntax. It now contains both the methodology and a small executable reference generator so candidate semantic laws can be attacked with replayable/minimizable scenarios instead of prose-only examples.

Nothing here edits RFC-0001 or accepts a primitive.

## Deliverables

Issue #51 asks for:

- scenario DSL/schema proposal;
- reusable generators;
- semantic coverage metrics;
- shrinking/minimization;
- conversion of failures into ontology research questions.

Current files:

| File | Purpose |
| --- | --- |
| [`dsl.md`](dsl.md) | implementation-neutral research scenario shape |
| [`dimensions.md`](dimensions.md) | reusable attack recipes/dimensions |
| [`generator.py`](generator.py) | stdlib-only reference generator, pairwise composition and choice-stream shrinker |
| [`test_generator.py`](test_generator.py) | replay, unknown-outcome, approval-basis, provenance and shrink regression tests |
| [`candidate-laws.md`](candidate-laws.md) | method claims after adversarial narrowing |
| [`scenarios.md`](scenarios.md) | human-readable adversarial cards |
| [`evidence.md`](evidence.md) | source/evidence catalog |
| [`sources.md`](sources.md) | source locators |
| [`open-questions.md`](open-questions.md) | remaining uncertainty |

## Run the reference generator

From this directory:

```bash
python3 generator.py --recipe D-01 --recipe D-12 --seed 7
python3 generator.py --pairwise --recipe D-01 --recipe D-11 --recipe D-12 --seed 7
python3 -m unittest -v test_generator.py
```

The reference implementation currently covers D-01, D-02, D-04, D-10, D-11, D-12, D-13 and D-14. Remaining recipes are specifications for later expansion, not silently claimed as executable.

## Core research rules

- A source system is a differential oracle, not the semantics.
- Happy paths show representability but are not sufficient evidence of semantic robustness.
- `Attempt`, `Observe` and `Occur` remain distinct in the fuzz methodology so the generator can attack stale approval, message duplication and ambiguous outcomes; this does not prove three OS base sorts.
- Shrinking must preserve both recipe validity and the **same semantic failure predicate**.
- Use exact expected-value oracles when the problem is fully specified. Use metamorphic/competency relations when the attack intentionally leaves several valid results or tests history/relations rather than one number.
- An approval binds an explicit proposal plus a declared state/temporal basis. Live-at-commit and frozen-snapshot approvals are both testable cases.
- Transport timeout is not silently turned into business failure.
- A fuzz failure becomes a typed, falsifiable research question; it does not edit the metamodel by itself.

## What the code is not

`generator.py` is research software. Its step kinds, field names, choice-stream representation and oracle vocabulary are not proposed as the OS authoring language or runtime. If a later implementation uses a solver, AST, property-based library or generated code instead, it only needs to preserve the semantic properties under test.

## Relationship to induction

Issue #50 proposes ways to induce candidate distinctions from corpora. Issue #51 is the adversary: it generates cases intended to break those candidate laws. Neither protocol promotes a finding directly to `main`.

## Licensing

OS is MIT. The generator is original research tooling. External ERP/standard sources are used as behavioral/documentary evidence; no copyleft implementation is copied into this tooling.
