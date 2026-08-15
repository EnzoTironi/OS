# Research constitution

**Status:** rules for inquiry, not product architecture.

The purpose of this document is to prevent the project from freezing attractive ideas before they survive evidence and counterexamples.

## 1. No primitive by aesthetics

A concept does not become a kernel primitive because it feels elegant, mirrors another platform, or makes diagrams cleaner.

A primitive must earn its place by at least one of these routes:

- it is required for enforcement that composition cannot reproduce safely;
- it appears independently across multiple domains or mature systems;
- removing it creates semantic ambiguity that repeatedly causes real failures;
- it enables a critical property that cannot be expressed without hidden conventions.

If composition preserves meaning and enforcement, prefer composition.

## 2. Model the world, not the source schema

ERP tables, APIs, spreadsheets, event payloads, and legacy classes are observations about a domain, not the domain itself.

Research should begin with the real-world distinction being modeled, then use source systems as evidence.

A one-to-one mapping from a source table/DocType/model to an ontology type is never assumed correct.

## 3. Mature software is empirical evidence

Years of production usage encode knowledge in places documentation does not:

- validation logic;
- migrations;
- bug fixes;
- tests;
- cancellation behavior;
- reconciliation logic;
- support for partial and exceptional cases;
- historical changes in the data model.

We will mine these artifacts to infer domain laws and failure modes.

## 4. Independent convergence increases confidence

A distinction found in ERPNext is interesting.

The same distinction found independently in ERPNext, Odoo, Moqui, ValueFlows, and an industry standard is much stronger evidence.

Disagreement is not noise to average away. It is a research question: different systems may model different realities, optimize for different workflows, or encode historical accidents.

## 5. Code cost is not the primary optimization target

We assume AI systems can materially reduce the cost of reading, generating, testing, refactoring, documenting, and migrating software.

Therefore we do not choose a worse semantic model merely because an existing framework saves implementation effort.

We still avoid needless complexity. The distinction is:

> implementation complexity may be large when justified; semantic complexity must earn every concept.

## 6. Separate domain semantics from implementation mechanics

The following may be useful without being ontology concepts:

- packages;
- modules;
- compiler phases;
- caches;
- materialized views;
- database tables;
- indexes;
- queues;
- deployment units;
- generated code;
- SDK boundaries.

Do not promote them into the domain model unless the domain itself requires their meaning.

## 7. Mutation semantics must be explicit

We currently favor the hypothesis that meaningful business mutations should be represented as explicit operations/actions rather than arbitrary field mutation.

This is **not yet a frozen rule**. Research must test whether there are domains where generic mutation is semantically correct and safer than named actions.

Any accepted mutation model must make authority, invariants, causality, and auditability explicit.

## 8. Requested is not happened

We currently strongly favor distinguishing an attempted decision/intervention from the events/facts that establish what actually occurred.

Research should actively search for counterexamples and for domains where this distinction needs further refinement.

## 9. Failure and uncertainty are real domain states

External operations can produce ambiguous outcomes. A timeout does not prove failure. Concurrent state can invalidate an approved plan. Sources can disagree. Historical corrections can arrive late.

The model must not erase uncertainty merely to simplify implementation.

## 10. Time is not an afterthought

Research must distinguish at least:

- when a statement/event is valid in the modeled world;
- when the system learned/recorded it.

Whether those dimensions become native primitives, annotations, or another mechanism remains open.

## 11. Provenance is part of meaning when decisions depend on it

If two identical values have different authority because one came from a signed invoice and another from an extracted chat message, source and derivation cannot be treated as incidental logs.

We will study W3C PROV and operational systems before designing our own vocabulary.

## 12. No company-specific logic in the generic engine

A real company can introduce real concepts, rules, localizations, policies, and extensions.

The generic engine must not contain branches such as:

```text
if company == X
```

Organization-specific behavior belongs in the executable model unless evidence proves otherwise.

## 13. Every proposed model must survive adversarial scenarios

A clean happy path proves little.

We will test partial fulfillment, reversals, late information, duplicate events, concurrent actions, backdating, substitution, rework, overpayment, unknown external outcomes, schema evolution, and other adversarial cases.

Agents should generate counterexamples continuously.

## 14. Current state must be explainable where it matters

For high-value operational state, we want a causal explanation rather than an unexplained mutable value.

The exact mechanism remains open: event history, fact history, temporal records, transaction journals, or another model may satisfy this.

## 15. Human and machine surfaces must not fork business meaning

If a human, agent, API client, or automation performs the same business operation, we should strongly prefer one semantic operation with multiple surfaces rather than duplicated logic.

This is a working principle to validate, not yet a language rule.

## 16. Licensing is part of research hygiene

OS is MIT licensed.

Research may deeply study copyleft systems. Notes may document concepts, behavior, test scenarios, invariants, and public references. Implementation code must not be copied into the MIT core without an explicit licensing review and deliberate decision.

## 17. RFCs are hypotheses until evidence promotes them

Early RFCs should carry a status such as:

- `hypothesis`;
- `investigating`;
- `supported`;
- `challenged`;
- `rejected`;
- `superseded`.

Even `supported` does not mean immutable. The project should preserve the reasoning and evidence behind decisions so they can be revisited.

## 18. Optimize for falsifiability

A good design claim should imply tests that could prove it wrong.

"Actions are better" is weak.

"Every business mutation in the first four domains can be represented by explicit actions without introducing arbitrary escape hatches, while preserving human/API/agent parity and required invariants" is falsifiable.

Prefer the second kind of claim.
