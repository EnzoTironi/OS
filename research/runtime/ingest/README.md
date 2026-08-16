# Ingestion, source binding, schema discovery, and entity resolution

- Artifact ID: `issue-0045-ingest-entity-resolution`
- Issue: <https://github.com/EnzoTironi/OS/issues/45>
- Track: Wave B runtime boundary research
- Date: 2026-08-16
- Base evidence: Wave A frozen snapshot `research/wave-a-2026-08-16` @ `53235fc5b8fb723e84351435ccfad719e784d5ba`
- Decision: none. This folder defines a candidate **ingest semantic contract** and falsifiers; it does not select an ETL framework, database, ontology primitive, or entity-resolution engine.

## Question

How can OS absorb spreadsheets, ERP tables, APIs, CDC streams, reports, documents, messages and human classifications without making any of these source schemas the ontology — and without laundering probabilistic/ambiguous mappings into business truth?

Wave A made this a P0 problem. The HF reality check found:

- successful joins did not prove identity;
- one operational product had several source identities/listings;
- some automatic code repairs were low-confidence and semantically disputed;
- sales rows could be aggregates rather than order lines;
- stock files mixed position, movement, return, demand and plan;
- some current state existed only as a snapshot, with no complete event history;
- source authority varied by statement/action rather than by whole entity/file;
- missing values, manual interpretation and message-derived knowledge were normal.

The contract here is designed to preserve those facts rather than clean them away.

## Core result

The ingest boundary should be understood as a sequence of **epistemic transformations**, not `source row -> canonical object`:

```text
external source
      │
      ▼
CAPTURED EVIDENCE
bytes / row / message / CDC record / document fragment
source locator + source position + schema revision + capture provenance
      │
      ▼
PARSE / PROFILE / EXTRACT
what fields/statements can this evidence support?
what is its grain?
what time does it actually provide?
      │
      ▼
SEMANTIC MAPPING PROPOSAL
candidate statement kinds + value transforms + provenance
      │
      ├───────────────┐
      ▼               ▼
IDENTITY CANDIDATES   UNBOUND / SOURCE-LOCAL STATEMENTS
scores + evidence     still queryable; no invented target identity
      │
      ▼
BINDING / ADJUDICATION
rule, deterministic identifier, reviewed probabilistic match,
or an explicit authorized decision
      │
      ▼
ADMITTED STATEMENTS
bound identity + statement kind + authority context + provenance
      │
      ▼
OPERATIONAL PROJECTIONS / QUERIES / ACTION INPUTS
```

At every arrow, the prior evidence remains inspectable. Reprocessing may produce a **new proposal**; it does not rewrite what an earlier model/source/reviewer concluded.

## Strongest Wave B laws so far

These are candidate laws, not accepted metamodel:

1. **Capture is evidence, not business truth.** A row/message/change record says what a source contained or emitted.
2. **Source identity and business identity are different scopes.** A stable source key can bind to a business identity, but the binding is a claim/decision with provenance and history.
3. **Grain precedes mapping.** An aggregate sales row cannot become an `OrderLine` merely because its columns resemble one.
4. **Confidence is not authority.** Probabilistic match score can rank candidates; it does not by itself authorize a permanent identity merge.
5. **Binding is revisable without rewriting history.** Merge, split, rebind and supersession must preserve the earlier basis.
6. **Source absence is not business deletion.** A CDC tombstone, missing spreadsheet row or API deletion describes source state unless the source is explicitly authoritative for the relevant deletion action.
7. **Schema/mapping revision is part of reproducibility.** A record captured under schema R and mapped by transform M must not later be silently interpreted using schema R+1 / transform M+1.
8. **Do not invent temporal precision.** Preserve source event/effective time when evidenced plus capture/record time. Missing business-valid time remains missing.
9. **Snapshots are legitimate observations.** If complete movements do not exist, represent an observed position rather than synthesize fake events.
10. **Authority is statement/action scoped.** Product registration, marketplace listing state, cost observation, price decision and fiscal authorization may have different authorities.
11. **Lineage-equivalent data is not independent evidence.** Copies/exports/materializations of one source must not be double-counted as separate business occurrences or independent corroboration.
12. **Extraction from text/images/LLMs produces proposals/evidence.** Human or agent interpretation can become an explicit decision; it must not silently become source-authored truth.
13. **Identity clusters are hypotheses.** Pairwise scores + clustering rules can create transitive groups whose semantic identity still needs domain constraints/review.
14. **Reprocessing is append/supersede, not historical mutation.** A newer model may improve a mapping; earlier decisions remain explainable under their original evidence/model revision.

## Primitive reduction result

Issue #45 explicitly attacks whether `Observation`, `Assertion`, `Fact`, `Binding`, or `SourceRecord` must become generic engine primitives.

This pass does **not** earn them as base sorts.

The required semantics can currently be expressed as ordinary typed records/relations plus generic capabilities already under investigation:

- stable identity for evidence and domain objects;
- typed relationships;
- provenance/derivation;
- uncertainty/value metadata;
- immutable or historically traceable decisions;
- Functions for deterministic extraction/scoring;
- Actions/Decisions for governed adjudication;
- temporal/revision identity where actually evidenced;
- query/projection over unresolved and resolved records.

A native primitive becomes justified only if composition cannot safely enforce one of these distinctions across multiple unrelated domains. That test remains open for #70.

## Files

| File | Purpose |
| --- | --- |
| [`source-study.md`](source-study.md) | Primary-source comparison: Palantir, Splink, OpenRefine, Debezium, W3C PROV + Wave A evidence |
| [`ingest-contract.md`](ingest-contract.md) | Candidate lifecycle, contracts, authority/binding semantics, schema drift and reprocessing |
| [`candidate-laws.md`](candidate-laws.md) | Falsifiable laws with states and explicit non-laws |
| [`adversarial-cases.md`](adversarial-cases.md) | Scenario suite attacking identity, grain, source deletion, clustering, schema drift and temporal precision |
| [`open-questions.md`](open-questions.md) | What remains for #40/#41/#42/#63/#70 |

## What this research rejects

It rejects the following as general ingestion rules:

```text
row -> object
same string -> same entity
high score -> permanent merge
source delete -> business delete
CDC event -> business event
latest value -> authoritative value
null/missing -> zero
report row -> transaction
snapshot -> reconstructed event history
LLM extraction -> accepted fact
successful ETL -> semantic correctness
```

## What it does not reject

- deterministic identifiers where a domain/source contract really guarantees them;
- automatic binding when a governed rule is strong enough and its scope is explicit;
- materialized canonical/current projections for operations;
- probabilistic entity-resolution libraries;
- CDC and source synchronization;
- human review;
- agent-generated mappings;
- source-specific adapters;
- eventual migration of semantic ownership into OS.

The constraint is that these mechanisms preserve provenance, uncertainty, scope and correction history rather than pretending they never existed.

## Dependency handoff

- **#40 commit semantics:** an identity/admission decision that affects business actions needs a state/revision contract; stale binding proposals must not commit against changed evidence unnoticed.
- **#41 external effects:** source writeback and remote manual changes are external effects/observations, not normal ingest mutation.
- **#42 authorization:** who may accept/rebind/merge/split identities is separate from match confidence.
- **#39 storage:** must support unresolved evidence, binding history, schema/mapping revisions and source snapshots without forcing one bitemporal rectangle.
- **#49 observability:** must answer `which source evidence + mapping + binding decision produced this current value/identity?`
- **#70 synthesis:** should evaluate whether any ingest concept actually requires a base primitive after this compositional model is fuzzed.
