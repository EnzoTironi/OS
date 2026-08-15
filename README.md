# OS

OS is a greenfield research project exploring a simple but ambitious question:

> If enterprise software, operational ontologies, and AI agents were invented together today, what would the correct system look like?

The current working hypothesis is that the fundamental product may not be an ERP at all. It may be an **executable ontology of an organization**: one model for things, relationships, decisions, events, rules, history, humans, agents, and systems.

This repository is intentionally **pre-architecture**. Nothing here should be read as a frozen product definition, metamodel, storage choice, language, runtime design, or technology commitment.

## Start here

- [`docs/thesis.md`](docs/thesis.md) — the current thesis, explicitly provisional.
- [`docs/hypothesis-history.md`](docs/hypothesis-history.md) — how the idea evolved during the initial research session, including hypotheses we considered and then weakened or abandoned.
- [`docs/constitution.md`](docs/constitution.md) — rules for how we research and decide, not rules for how the final system must work.
- [`docs/open-questions.md`](docs/open-questions.md) — cross-cutting questions that remain deliberately unresolved, including what would falsify the leading thesis.
- [`docs/research-program.md`](docs/research-program.md) — the first research program across enterprise domains and reference systems.
- [`rfcs/0001-metamodel-hypothesis.md`](rfcs/0001-metamodel-hypothesis.md) — a deliberately unstable metamodel hypothesis to attack.
- [`scenarios/README.md`](scenarios/README.md) — adversarial business scenarios that candidate models must survive.
- [`research/README.md`](research/README.md) — how evidence from ERPNext, Odoo, Moqui, Palantir, REA/ValueFlows, standards, and other systems should be recorded.
- [`research/reference-landscape.md`](research/reference-landscape.md) — lessons, useful abstractions, and warnings from adjacent operational ontology / agentic enterprise projects.

## Current posture

We are not trying to copy ERPNext, Palantir, Odoo, Moqui, or any other system. Mature systems are **evidence**: years of production usage encode real domain distinctions, invariants, failure modes, and operational patterns that we can study.

We are also not optimizing for the smallest amount of new code. The working assumption is that powerful AI systems radically reduce the cost of understanding, generating, testing, and maintaining software. The optimization target is therefore **semantic correctness, generality, safety, explainability, and evolvability**.

A useful working rule is:

> Code can be large. The semantic core should be small, orthogonal, and difficult to simplify further.

## License and research hygiene

OS is MIT licensed. Some important research references, including ERPNext and Odoo, use copyleft licenses. Research notes should extract concepts, behavior, invariants, scenarios, and references rather than transplanting implementation code into OS. Any reuse of implementation must be an explicit licensing decision, never an accidental outcome of research.
