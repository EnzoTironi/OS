# Competency questions — storage architecture acceptance suite

**Issue:** #39  
**Purpose:** force candidate physical architectures to answer concrete semantic questions before product selection.

A database feature only matters if it helps answer one of these correctly under failure/concurrency/retention constraints.

# A. Identity and current operational state

## CQ-01 — canonical identity with multiple source identities

Given:

```text
Product P
Bling item 123 -> P
Marketplace Listing MLB42 -> Listing L -> P
cost sheet row R -> candidate relation to P
```

Can the system return current P and all exact/candidate source relations without flattening Listing L into Product P or promoting candidate R to exact identity?

## CQ-02 — source key reused over time

Source customer id `123` referred to Party A until 2024 and Party B from 2026.

Can a historical payment in 2024 still resolve to A while current source id `123` resolves to B, with binding history/provenance intact?

## CQ-03 — split after prior merge

Two Party identities were merged, then later split after legal evidence.

Can storage preserve:

- earlier merge decision/evidence;
- current distinct identities;
- historical Actions under the identity basis used then;
- unresolved history that cannot be reassigned safely?

# B. Transaction and concurrency

## CQ-04 — exact-version guarded update

Can Action `CloseOrder` commit only if Order revision is exactly 5 and atomically record operation identity/result?

## CQ-05 — write skew across rows

Two concurrent Actions each read two doctors/approvers/resources and try to preserve “at least one remains active”. Can both commits be prevented from violating the cross-row invariant?

## CQ-06 — phantom/absence invariant

Action may create an active agreement only if no overlapping active agreement exists for a subject/date range.

Can absence/range predicate be protected atomically, not just row version?

## CQ-07 — aggregate inventory reservation

Two warehouses/lots contribute to `available >= 7`; concurrent reservations race.

Can storage enforce the declared aggregate dependency under a valid serialization mechanism?

## CQ-08 — operation replay after caller timeout

Caller does not know whether O committed.

Can it query/retry by O's stable semantic identity and distinguish:

```text
committed previously
same O with different intent -> reject
known not committed -> retry eligible
still indeterminate -> reconcile
```

## CQ-09 — frozen basis

Quote Q says price 100 and current price later becomes 130.

Can Action intentionally commit against immutable Q without a generic “latest state” layer silently substituting 130?

# C. Source evidence and provenance

## CQ-10 — current snapshot without movement history

PDF/API says stock 108 at T; no complete movement ledger exists.

Can storage represent this observed position without synthesizing stock Events?

## CQ-11 — later ledger contradicts old snapshot

Later a complete ledger implies balance 106 at the same date.

Can both old snapshot and reconstructed ledger evidence coexist, with discrepancy visible, instead of one overwriting the other?

## CQ-12 — same evidence reprocessed under mapping M2

Original document extracted invoice number `1238` under model M1; M2 later extracts `123B`.

Can both derivations remain attributable while current operational binding can supersede M1?

## CQ-13 — source lineage copy

Raw sales export -> cleaned table -> BI aggregate -> imported report.

Can lineage show these are derived from the same underlying evidence so analytics does not double-count corroboration/sales?

## CQ-14 — unresolved source evidence

A source row cannot be confidently bound to any Product.

Can it remain queryable/quarantined without null foreign-key hacks, fake placeholder Product, or data loss?

# D. Temporal questions

## CQ-15 — domain valid time

What contract price was valid for Customer C on 2026-08-01?

This requires a modeled business-valid interval.

## CQ-16 — system/admission history

When did OS first commit/admit the current exact binding between source record S and Product P?

This is not necessarily the same as business-valid time.

## CQ-17 — knowledge cutoff

What evidence and admitted relations were available to decision O at the moment it committed?

Can storage reconstruct the decision basis from revisions/provenance, even if no universal `known_from/known_to` column exists?

## CQ-18 — source sequence

What source mutation preceded CDC record X according to provider/source ordering?

Can source LSN/offset/transaction sequence coexist with business time without conflation?

## CQ-19 — bitemporal counterexample

A static country code/reference table has no meaningful business-valid interval in the domain.

Can the architecture store ordinary current/revision history without forcing meaningless valid-time values?

## CQ-20 — more-than-two-clocks counterexample

A binding has:

```text
source record time
capture time
binding decision time
binding effective interval
ontology revision
```

Can the model preserve the actual axes without squeezing them into one generic valid/system bitemporal pair?

# E. Ledger and correction semantics

## CQ-21 — immutable accounting posting

Posted journal entry must not be silently overwritten; correction is reversal/new posting.

Can storage enforce/represent immutable domain ledger semantics?

## CQ-22 — mutable provisional configuration

Draft routing rule can be edited until published and old drafts may be retention-governed.

Can the same architecture avoid forcing accounting-style reversal for every draft field change?

## CQ-23 — source correction in place

Spreadsheet operator corrects historical tax ID. Earlier capture retained old value.

Can latest source state change while earlier captured evidence remains explainable?

# F. External effects

## CQ-24 — atomic local commit + effect request

Can one local Action atomically commit business state and durable EffectRequest/outbox intent when local-first ordering is selected?

## CQ-25 — worker crashes after remote send

Can storage preserve attempt `sent/no-response` so later worker cannot overwrite it with `not sent` from a second failed attempt?

## CQ-26 — provider receipt learned later

Effect had no pre-send provider key; async response returns receipt R.

Can optional remote correlation identity be added without changing EffectRequest identity?

## CQ-27 — compensation chain

Can original confirmed payment and later refund remain distinct causal effects/operations rather than refund mutating payment into “never happened”?

# G. Authorization/governance

## CQ-28 — current grant lookup + history

Can authorization quickly answer whether Grant G is active now while audit can explain its parent chain/revisions at old Action O?

## CQ-29 — SoD history

Can policy ask whether current approver is independent from whoever initiated/edited the same case, based on participation history?

## CQ-30 — emergency revocation vs historical approval

Can storage preserve a valid historical Approval while current emergency policy blocks commit/effect, without rewriting approval as invalid?

# H. Orchestration

## CQ-31 — runtime checkpoint lost after business commit

Can workflow backend/runtime recover and reference already committed LocalOperation O without requiring the business database to trust workflow step status?

## CQ-32 — timer after deadline change

Can old timer fire without altering domain deadline state, and can the next operation evaluate its declared basis?

## CQ-33 — business audit outlives workflow history

Can orchestration history be compacted/deleted while legally required business/effect/approval evidence remains available?

# I. Graph/traversal

## CQ-34 — provenance explanation path

Can query:

```text
current Product.cost
 <- selected projection/decision
 <- source observation
 <- mapping revision
 <- raw capture
```

with acceptable latency?

## CQ-35 — authorization delegation path

Can query Grant G -> parent G1 -> represented principal -> organization/resource, with revision/current filtering?

## CQ-36 — manufacturing traversal

Can query WorkOrder -> BOM -> components -> suppliers -> open purchase commitments without copying the whole ontology into a second authoritative graph store?

## CQ-37 — reverse links

Given Supplier S, find all Products/BOMs/Orders affected if S becomes unavailable.

# J. Analytics and search

## CQ-38 — high-volume marketplace analytics

Can scan/aggregate hundreds of millions of sales/listing observations by date/product/channel without degrading authoritative OLTP commit latency?

A derived columnar path is allowed.

## CQ-39 — entity-resolution candidate search

Can fuzzy/vector/full-text search produce candidate Products/Parties efficiently while keeping match confidence separate from identity authority?

## CQ-40 — historical analytical snapshot

Can analytics reproducibly query a named export/snapshot/revision and know its data freshness/lineage?

# K. Multi-tenancy/security

## CQ-41 — tenant-safe uniqueness

Can unique business keys be enforced within tenant/legal entity without collisions/leakage across tenants?

## CQ-42 — tenant-safe derived indexes

Can graph/search/vector/OLAP projections enforce tenant boundaries and delete/rebuild one tenant's data correctly?

## CQ-43 — restore one tenant/legal entity

Can export/restore/migrate tenant data while preserving stable semantic identities/provenance and without colliding with current external effects?

# L. Retention/privacy

## CQ-44 — erase raw PII but preserve allowed audit result

Policy requires deleting a raw document but preserving a non-PII decision/result and proof that an authorized process occurred.

Can data lifecycle detach raw evidence retention from durable operation/audit identity?

## CQ-45 — vector/search deletion

When source document is erased, can all derived embeddings/full-text entries be located and removed/rebuilt?

## CQ-46 — legal hold

Can retention prevent deletion of scoped evidence without making every unrelated record immutable forever?

# M. Backup/restore/failure

## CQ-47 — PITR after external effects

Database restored to T before payment E was recorded locally, but provider still shows payment succeeded after T.

Can recovery reconcile provider/effect state without sending duplicate payment or claiming rollback of external world?

## CQ-48 — derived index total loss

Graph/search/OLAP store disappears completely.

Can it be rebuilt without loss of authoritative business truth?

If not, it was not merely a derived index and must satisfy authority requirements.

## CQ-49 — authority DB failover/restore

Can operation idempotency markers, commit revisions, invariants and effect requests survive failover/restore guarantees strongly enough to prevent duplicate semantic operations?

## CQ-50 — schema/ontology migration rollback

Can physical schema/index migrations be rolled back or forward-fixed while preserving ontology revision identity and historical interpretation?

# N. Architecture sanity checks

## CQ-51 — dual writable representation

If relational store and graph store disagree on Product P's supplier relation, which one can accept the authoritative correction?

A valid architecture must answer unambiguously.

## CQ-52 — rebuild criterion

For every secondary store/table/index, answer:

> If deleted and rebuilt from remaining authorities, what semantic information is irrecoverably lost?

Anything irrecoverable identifies an authority/audit store, not a cache.

## CQ-53 — write-path count

How many independent systems must acknowledge before a high-risk #40 Action is considered locally committed?

Every extra synchronous authority raises distributed-consistency/availability cost and must be justified.

## CQ-54 — ontology evolution without physical identity rewrite

Can ObjectType/property/link schema evolve while stable Object identities/historical Actions remain valid and queryable?

## CQ-55 — storage technology replacement

Can a derived graph/search/analytics/workflow backend be replaced without changing business identifiers or ontology semantics?

If not, implementation concepts have leaked into the semantic contract.

# Scoring rule for candidates

For each architecture/candidate, record:

```text
PASS       native/directly supported
PASS*      supported with explicit implementation pattern
DERIVED    valid only as a derived/read model
FAIL       violates semantic contract or cannot enforce correctness
UNKNOWN    needs executable experiment/benchmark
```

No architecture wins by raw PASS count. A FAIL on #40 correctness, identity history, authority uniqueness, restore safety, or evidence explainability is more serious than a weak graph/OLAP convenience score.
