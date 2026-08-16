# PostgreSQL 18 executable competency experiment

**Issue:** #39  
**Status:** evidence for H1/H8, not architecture selection.

CI evidence:

```text
storage-research-ci run 31928881458
job postgres18: success
PostgreSQL image: postgres:18
```

The experiment in [`test_storage_contract.py`](test_storage_contract.py) ran against a real PostgreSQL 18 service and tested a narrow set of high-risk competency questions.

# E-PG-01 — write skew demonstrates why isolation choice is semantic

Business invariant:

```text
at least one doctor/resource remains active
```

Two concurrent transactions:

```text
T1 reads count(active)=2, deactivates row 1
T2 reads count(active)=2, deactivates row 2
```

Observed assertions:

- under `REPEATABLE READ`, both disjoint row updates commit and final active count becomes `0`;
- under `SERIALIZABLE`, exactly one commits and one receives a serialization failure; final active count remains `1`.

This is evidence for #40/#39's law:

> row versioning/snapshot consistency is not enough when an Action depends on an aggregate/set predicate.

It is **not** evidence that every Action should run at SERIALIZABLE. Isolation/conflict mechanism should match its declared StateBasis/invariant.

# E-PG-02 — temporal exclusion constraint

The test creates:

```sql
EXCLUDE USING gist (during WITH &&)
```

and confirms an overlapping reservation is rejected while an adjacent non-overlapping interval succeeds.

This supports a physical implementation for a useful subset of CQ-06 without requiring application-side “SELECT then INSERT” race logic.

# E-PG-03 — semantic operation marker + mutation in one transaction

The experiment atomically stores:

```text
LocalOperationId
intent digest
result
business balance mutation
```

Assertions:

- first `O-deposit-1 / deposit:50` commits;
- same operation+intent returns replay and does not add another 50;
- same operation ID with `deposit:500` returns mismatch;
- final balance is 50 and exactly one operation marker exists.

This supports L-STO-08: dedupe/result identity must be inside the authoritative commit boundary, not a later cache write.

# E-PG-04 — source key reuse/history

The experiment stores:

```text
legacy:123 -> Party-A, effective 2020..2025
legacy:123 -> Party-B, effective 2026..
```

and verifies historical/current lookups return different business identities without rewriting the old binding.

This proves only that relational persistence can express the history; it does not yet prove the final generic binding representation.

# E-PG-05 — snapshot without event synthesis

The experiment inserts:

```text
inventory-position observation = 108
provenance = stock PDF capture
```

while the domain Event table remains empty.

This is a small but important falsifier against “event sourcing is required to store state/history”.

# What the experiment does not prove

It does **not** prove:

- production throughput/latency under high contention;
- ontology dynamic-schema mapping;
- deep provenance graph performance;
- tenant isolation/RLS design;
- disaster recovery after independent external effects;
- multi-region active-active semantics;
- graph/vector/OLAP workloads;
- generic valid-time/history ergonomics;
- privacy erasure through backups/derived stores;
- online ontology/physical schema migrations.

These remain explicit open questions/falsifiers before storage selection.
