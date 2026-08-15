# Swarm research backlog

**Status:** execution map, not architecture.

The research backlog is coordinated by issue #2. Issue numbering is not priority. The swarm should optimize for **information gain**: research the questions whose answers most change the space of possible architectures.

## Why this exists

OS is intentionally pre-architecture. A large swarm is useful only if parallel work compounds rather than becoming dozens of isolated summaries.

Every agent should read:

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/hypothesis-history.md`
- `docs/open-questions.md`
- `docs/research-program.md`
- `rfcs/0001-metamodel-hypothesis.md`
- `scenarios/README.md`
- its assigned issue and linked dependencies

The swarm should treat mature systems as evidence, not targets to copy. Claims should distinguish implemented behavior, official design/documentation, inference, and speculation.

## Workstream map

### Foundation semantics

Issues #3–#13, plus #62–#63.

These attack the semantic core: identity/kinds/roles/relators; facts and authority; time; provenance; Action/Event/Effect; Functions/Constraints/Policies; ontology evolution; processes/workflows; principals/delegation; state/projections; query/object sets/interfaces; value types; composition/reuse.

These are high-information-gain tasks and should start early.

### Enterprise domains

Issues #14–#31 and #67.

Domains include party/organization, product/resource identity, order-to-cash, procure-to-pay, inventory, manufacturing, logistics, accounting, finance/payments, pricing/marketplaces, planning/MRP, quality, assets/maintenance, CRM/support, HR/payroll, projects/services, Brazilian fiscal, multi-entity/intercompany and governance/risk/compliance.

Domain agents should not design a schema from scratch first. They should mine several independent sources and produce convergence/divergence evidence.

### Corpus archaeology

Issues #32–#38.

- #32 ERPNext
- #33 Odoo
- #34 Moqui/Mantle
- #35 Palantir Ontology
- #36 modern operational-ontology / agentic-business runtimes
- #37 formal ontology traditions (UFO/OntoUML, REA/ValueFlows, PROV-O, FIBO)
- #38 industry standards (GS1 EPCIS, ISA-95, semantic interchange, traceability)

Corpus agents own a source family. Domain agents own a business question. Their outputs should cross-link.

### Runtime research

Issues #39–#49 and #66.

Storage, transactions/concurrency, external effects/reconciliation, authorization, durable execution, surfaces, ingestion/entity resolution, formal verification, safe code execution, scaling, observability and analytics/metrics.

Runtime agents should derive requirements from surviving semantics. They must not select technology merely because it is interesting.

### AGI-native research and product behavior

Issues #50–#54.

Ontology induction, semantic fuzzing, self-evolving ontology, agent operating model and generated applications/surfaces.

These tasks test the premise that software-generation and research capacity are no longer the dominant constraint.

### Kill tests

Issues #55–#61, #68 and #72.

Their objective is to invalidate attractive ideas:

- one unified ontology may be the wrong abstraction;
- the metamodel may contain too many primitives;
- Action-only mutation may be over-generalized;
- specialized business kernels may actually be necessary;
- Fact/bitemporal semantics may be over-generalized;
- explicit authority may be unnecessary after correct modeling;
- building from zero may be inferior to reuse;
- an existing platform may already solve the problem;
- an ontology layer may create more semantic duplication than it removes.

A kill-test agent should be rewarded for changing the thesis when evidence warrants it.

### Toolchain

Issues #64–#65.

Authoring language/model and compiler/interpreter/generated-artifact strategy. These are intentionally downstream of semantics: authoring syntax and compilation are not assumed to be business primitives.

### Research operations and meta-research

- #69 licensing / clean-room evidence boundaries
- #73 unknown-unknowns domain scan
- #74 swarm result contract
- #75 machine-readable research graph / disagreement ledger
- #76 prioritization by information gain
- #77 validation against messy real-company reality
- #78 continuous literature/project watch
- #79 cross-industry stress test
- #80 research stop conditions
- #81 failure archive
- #82 decision discipline
- #83 domain-to-engine leakage audit

These exist to keep a large swarm coherent and self-correcting.

### Synthesis

- #70 cross-domain convergence → metamodel hypothesis v1
- #71 first executable vertical and semantic acceptance suite

Do not rush these. Synthesis should consume evidence, disagreements and counterexamples produced elsewhere.

## Suggested execution waves

### Wave A — start immediately

Run in parallel:

- foundation #3–#13 and #62;
- domain #14–#31 and #67;
- corpus #32–#38;
- AGI research protocol #50–#51;
- research operations #69, #73–#74, #76–#79, #81–#83;
- kill tests #55–#61, #68 and #72 where enough existing evidence already exists.

The goal of Wave A is not consensus. It is to generate independent evidence and contradictions quickly.

### Wave B — informed by Wave A

Prioritize:

- runtime #39–#49 and #66;
- composition #63;
- toolchain #64–#65;
- self-evolution and product-side AGI #52–#54;
- research graph #75.

Some of these can begin earlier as exploratory work, but recommendations should wait for semantic pressure from Wave A.

### Wave C — synthesis

Run #70 when there is enough cross-source and cross-domain evidence. Run #80 in parallel as a readiness gate.

Then #71 defines an implementation-neutral vertical and acceptance suite.

Only after that should a runtime implementation be treated as more than an experiment.

## Agent output contract

All research issues follow `docs/swarm-result-contract.md`; the list below summarizes the required result:

1. **Question** — what semantic uncertainty was investigated.
2. **Sources** — exact repositories/files/commits/docs/standards used.
3. **Evidence** — behavior, tests, invariants, historical fixes, formal definitions.
4. **Source artifacts** — concepts that appear implementation-specific.
5. **Convergence** — independent sources that make the same distinction.
6. **Divergence** — sources that disagree and plausible reasons why.
7. **Candidate laws** — smallest semantic claims explaining the evidence.
8. **Counterexamples** — scenarios attempting to falsify those claims.
9. **Runtime pressure** — enforcement/runtime properties implied if the claim survives.
10. **Open questions** — unresolved uncertainty.
11. **Decision state** — normally `hypothesis`, `supported`, `rejected`, or `undetermined`; never silently `accepted`.

Do not close an issue with only a prose summary in the issue thread. Land durable evidence under `research/` and link it.

## Parallelism rules

- Multiple agents may investigate the same concept from independent corpora; this is useful, not duplication.
- Avoid multiple agents summarizing the same repository without different research questions.
- Domain agents should consume corpus artifacts when available, but should not wait for perfect archaeology if direct evidence can be gathered independently.
- Kill-test agents should remain independent from agents proposing the model they attack.
- When a finding changes several issues, record it once as evidence and cross-link rather than copy-pasting conclusions.
- New issues are encouraged when a genuinely new semantic question appears.

## What success looks like

The swarm is successful if it makes the design space **smaller and more inevitable**.

It is not successful merely because it produces a large ontology, large document corpus, or large implementation.

The intended trajectory is:

```text
many hypotheses
    -> independent evidence
    -> disagreements
    -> counterexamples
    -> fewer surviving semantic laws
    -> metamodel hypothesis v1
    -> implementation-neutral acceptance suite
    -> competing runtime experiments
```

Code can be large. The semantic core should become difficult to simplify further.