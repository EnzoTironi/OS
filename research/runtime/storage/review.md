# Adversarial review — issue #39 storage models

**Date:** 2026-08-16  
**Status:** `review-clean` after source comparison, adversarial review, structural checks and PostgreSQL 18 executable evidence.

Validated CI before final review-status mutation:

```text
storage-research-ci run 31929101666
job postgres18: success
job research: success
35 candidate laws
55 competency questions
70 adversarial scenarios
PostgreSQL 18 executable competency subset green
```

# R-STO-01 — “PostgreSQL authority” must be scoped to local semantic authority

The working H8 diagram can be misread as:

```text
Postgres knows the truth about everything
```

That violates #41/#45.

Examples:

```text
SEFAZ is authority for NF-e authorization result
marketplace is authority for current remote listing state
bank/payment provider can be authority for processor/settlement state
source artifact is authority for what bytes/document said
```

PostgreSQL can be the **local authoritative commit store** for OS decisions, operation identities, admitted projections/bindings and locally governed state, while storing/referencing external evidence whose semantic authority remains external.

Refinement incorporated in the primary overview:

> one writable semantic authority per statement/transition family, which may be OS-local or external; the local database is not metaphysical truth.

# R-STO-02 — object storage can be authoritative for artifact bytes without becoming business-state authority

Large PDFs/XML/audio/media should likely live outside hot PostgreSQL tables.

If the relational store contains only:

```text
artifact id
content hash
object version/key
source/provenance metadata
```

then durable object storage may be the authority for **artifact bytes** while Postgres is authority for the artifact identity/metadata/admission relationships.

This does not violate the one-authority rule because the two stores author different semantic roles.

Required downstream proof:

- content hash/integrity;
- versioning/immutability as needed;
- atomic-enough publication/reference pattern;
- retention/legal hold/encryption;
- restore and orphan handling.

# R-STO-03 — `SERIALIZABLE` protects only dependencies actually read inside the transaction

The PostgreSQL experiment is valid but easy to overgeneralize.

SSI cannot protect a hidden dependency such as:

```text
external sanctions API
stale ClickHouse total
LLM judgment
cached graph relation
current provider balance
```

unless the relevant dependency is represented/revalidated through the #40 StateBasis contract and fenced appropriately.

Therefore:

> serializable database isolation is an implementation of **database-visible** semantic dependencies, not a replacement for #40 basis modeling.

# R-STO-04 — Postgres SERIALIZABLE correctness can trade throughput for aborts

The experiment proves write-skew protection, not production scalability.

Hot SKU/account/aggregate predicates can produce:

- serialization aborts;
- predicate-lock pressure;
- long retry tails;
- starvation under pathological contention.

H8 must benchmark domain-specific alternatives:

```text
reservation/escrow records
materialized counters
common-row/advisory locks
partitioned authority
FoundationDB conflict ranges
```

Do not turn “Serializable passed” into “run every transaction at SERIALIZABLE forever”.

# R-STO-05 — FoundationDB implementation burden is not automatically disqualifying under the AGI premise

The ranking currently penalizes custom query/index/schema/security layers. That is valid because more trusted code increases verification/operational surface, but the user's premise explicitly removes ordinary implementation labor as the main bottleneck.

The fair comparison is:

```text
benefit of stronger/scalable programmable transaction substrate
vs
additional correctness/security/operational surface we must own and prove
```

not developer-month cost.

H2 deserves an executable tuple/index prototype before final rejection.

# R-STO-06 — XTDB physical universal bitemporality need not create semantic universal bitemporality

The risk is conceptual leakage, not an inherent flaw in XTDB.

A clean adapter can treat `_valid_*`/`_system_*` as physical database dimensions while domain types expose only the time concepts they actually mean.

H3 should be tested on:

- #40 contention/transaction behavior;
- current-query latency;
- storage growth/retention;
- ontology-schema evolution;
- mapping extra clocks such as source capture/provider sequence.

Do not reject it merely because OS rejected `ValidTime` as a universal ontology primitive.

# R-STO-07 — Datomic/fact history must be evaluated against correction and identity ergonomics, not dismissed as EAV

A fact model can naturally preserve retractions/system history and stable entity identity. Its risk is not “facts are bad”; it is whether:

- source assertion vs accepted projection remains clear;
- high-churn operational queries remain efficient;
- #40 set invariants are enforceable;
- business-valid time does not get confused with transaction history;
- object/action ergonomics remain understandable to developers/agents.

# R-STO-08 — graph store as derived index needs a consistency contract, not just “eventual”

A derived graph can be stale exactly when an Action wants a relationship query.

Every consumer/query should know which class it needs:

```text
A. authoritative/current-at-commit -> query authoritative store/basis
B. bounded-staleness operational read -> graph projection with freshness watermark
C. exploratory/analytical -> stale-tolerant graph snapshot
D. historical named projection -> pinned revision
```

Without this, a “read-only graph index” can still become an accidental authority through application behavior.

# R-STO-09 — derived analytics can become admitted evidence

Derived does not mean “never usable for decisions”.

Example:

```text
Iceberg snapshot S
  produced by known lineage at revision R
  audited/frozen
```

can be explicitly bound into a #40 frozen/as-of StateBasis for a historical analytical decision.

What remains prohibited is silently treating whatever current derived table returns as authoritative fresh state.

# R-STO-10 — “rebuildable” must include semantic equivalence and deletion state

A projection is not safely rebuildable merely because raw rows can be copied again.

Rebuild must preserve/rederive:

- semantic IDs;
- ontology/projection revision;
- tenant boundaries;
- source lineage;
- deletion/erasure tombstones;
- authorization visibility;
- freshness/checkpoint.

Otherwise a rebuild can resurrect erased data or produce a semantically different index.

# R-STO-11 — backups are another storage layer with authority/retention implications

Backup/PITR is often omitted from topology diagrams but can retain:

- erased PII;
- old grants;
- old effect state;
- old ontology schema;
- credentials if improperly stored.

Restore procedures must include **forward reconciliation** from restored physical history to current legal/external facts, not just database recovery.

# R-STO-12 — ontology physical representation is intentionally unresolved

H8 cannot be selected until #39/#70 test at least:

```text
table-per-type
shared typed property tables
JSON/document + typed projections
hybrid generated relational layout
```

A PostgreSQL-centered architecture that degenerates into untyped JSON blobs would throw away much of the reason to choose PostgreSQL as the commit authority.

Likewise, table-per-type with blocking DDL for every ontology edit can make AGI-driven ontology evolution operationally brittle.

# R-STO-13 — one authority per statement family needs precise granularity

Too coarse:

```text
System X owns Product
```

Better:

```text
OS-local Action owns internal planning price decision
marketplace owns observed listing publication status
cost document/source provides evidence of invoice cost
approved costing Action owns current planning cost projection
```

Storage topology follows those boundaries. A single object can aggregate statements from several authorities without becoming multi-master for the same statement.

# R-STO-14 — current candidate ranking is a research ordering, not architecture freeze

Current ranking:

1. H8/H1 PostgreSQL-centered hybrid;
2. XTDB;
3. FoundationDB;
4. Datomic-like;
5. graph-first.

This ranking is based on **evidence completeness and trusted-kernel size today**, not a permanent preference. Q-STO-10/11/12 can reorder it.

# Final review verdict

The core storage thesis survived primary-source comparison, 55 competency questions, 70 adversarial scenarios, structural regression checks and a real PostgreSQL 18 concurrency/contract experiment:

```text
semantic authority boundaries first
physical stores second
```

The current working architecture is therefore more precise, not more frozen:

```text
OS-local governed commit store (PostgreSQL-leading hypothesis)
  + external/source authorities represented as governed evidence
  + durable artifact-byte storage
  + rebuildable/freshness-aware search/graph/analytics projections
  + independent orchestration memory
```

`storage-research-ci` run `31929101666` confirmed both the research checker and the PostgreSQL 18 experiment on PR head `d2302193b12cc93a35adf9a613b05801787011d6`.

The PostgreSQL experiment materially strengthens H8 but does **not** select it. Dynamic ontology layout, high-contention benchmarks and DR after external effects remain explicit falsifiers before storage selection and #70 synthesis.
