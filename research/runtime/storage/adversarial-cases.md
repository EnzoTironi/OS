# Adversarial cases — physical persistence

**Issue:** #39  
**Purpose:** falsify storage architectures before selecting an authoritative engine/topology.

# Authority / dual-write

## S-STO-01 — relational and graph stores both accept supplier correction

PostgreSQL says Product P supplier=S1. Graph store says S2. Both APIs permit direct writes.

**Required:** architecture must designate one authority or a formal merge protocol. “Eventually sync” is not enough.

## S-STO-02 — search admin edits product title in index

Operator fixes wrong title directly in Elasticsearch-like index.

**Required:** derived change does not silently become business truth. Correction must flow to authoritative Action/source or remain index-local disposable edit.

## S-STO-03 — analytics writeback updates current price

BI tool writes a “corrected” price into analytical table; agent later reads it.

**Required:** analytical value cannot authorize repricing unless explicitly admitted via governed operation/evidence.

## S-STO-04 — replica promoted accidentally while old primary still writable

Both relational nodes accept authoritative writes after network partition.

**Required:** HA topology/fencing prevents semantic split-brain or has explicit conflict resolution appropriate to every affected statement family.

## S-STO-05 — two legal entities share external SKU

Cross-tenant/global unique index incorrectly treats SKU as globally unique.

**Required:** uniqueness scope includes tenant/legal entity when domain identity is scoped.

# Transactions / isolation

## S-STO-06 — write skew under snapshot isolation

Two concurrent transactions each observe two active approvers and disable one.

**Required:** if invariant is “at least one active”, storage/Action mechanism aborts one. Snapshot-isolated happy reads are insufficient.

## S-STO-07 — phantom overlapping agreement

Two transactions see no overlapping active agreement and create intersecting intervals.

**Required:** exclusion/range/serializable predicate protects absence condition.

## S-STO-08 — row-version check misses aggregate invariant

Two lots each version-check successfully while combined reservation oversells aggregate inventory.

**Required:** StateBasis covers aggregate/set dependency, not merely mutated rows.

## S-STO-09 — transaction retries with newly generated operation ID

Serialization abort causes application to regenerate LocalOperationId.

**Required:** same semantic operation retains ID across physical retry; otherwise dedupe/audit semantics break.

## S-STO-10 — same operation ID reused for changed intent

Retry logic modifies amount but keeps operation ID.

**Required:** authoritative marker detects digest/bounds mismatch and rejects/reproposal.

## S-STO-11 — operation marker written after business commit

Business state commits; process crashes before idempotency table write.

**Required:** architecture fails this design. Marker/result must be atomic with authoritative mutation or equivalent.

## S-STO-12 — operation marker in separate Redis cache expires

Mutation committed months ago; dedupe key expired; delayed duplicate request arrives.

**Required:** semantic operation history required for replay cannot depend solely on ephemeral cache TTL.

# Temporal semantics

## S-STO-13 — physical system-time mistaken for contract valid time

Contract effective Aug 1 is entered Aug 10.

**Required:** business effective date remains Aug 1 while system/admission time is Aug 10.

## S-STO-14 — future valid-time row mistaken for current commitment

Future price becomes valid Sep 1.

**Required:** current operational projection follows declared valid-time semantics; physical insertion time does not activate it early.

## S-STO-15 — atemporal reference forced into fake valid interval

Country/currency reference has no domain need for effective interval.

**Required:** no ontology-level false `validFrom/To` semantics just because storage has temporal columns.

## S-STO-16 — five clocks squeezed into two

Source row has event time, capture time, mapping revision, binding effectivity and admission revision.

**Required:** preserve actual axes; no lossy generic valid/system pair.

## S-STO-17 — PITR used to answer “what did Action know?”

DBA restores cluster to 10:00 and assumes resulting state equals Action O's decision basis.

**Required:** reject inference unless action's evidence/revision basis was explicitly captured. PITR is physical recovery.

## S-STO-18 — historical correction backdates valid time

Correction entered today changes what system now believes was valid last month.

**Required:** system can distinguish current corrected historical view from what OS believed before correction where domain/audit needs it.

## S-STO-19 — future-dated binding decision

Source code reuse is known in advance; binding B becomes effective next month.

**Required:** binding decision/admission time and effectivity remain distinct.

## S-STO-20 — provider sequence disagrees with wall clock

Two CDC/webhook records have skewed timestamps but ordered offsets.

**Required:** source ordering uses protocol sequence where semantically relevant, not generic timestamp sort.

# Evidence / provenance

## S-STO-21 — snapshot-only stock

Only PDF quantity=108 exists.

**Required:** store observation without synthetic StockMovement rows.

## S-STO-22 — later ledger says 106

Complete movement ledger arrives later.

**Required:** old snapshot remains historical evidence; discrepancy is visible.

## S-STO-23 — OCR/model correction

M1 extracts invoice `1238`; M2 extracts `123B`.

**Required:** derivation/version lineage retained; current binding can supersede without rewriting M1.

## S-STO-24 — source row deleted after ingestion

Spreadsheet owner deletes a row.

**Required:** source disappearance does not universally delete business entity; historical capture retention follows policy.

## S-STO-25 — same raw source copied through three ETLs

Analytics imports all copies.

**Required:** lineage prevents treating copies as independent corroboration/business occurrences.

## S-STO-26 — evidence blob missing but metadata remains

Object-storage file is accidentally deleted while DB retains hash/provenance row.

**Required:** system surfaces broken evidence integrity; it must not claim underlying bytes remain verifiable.

## S-STO-27 — blob replaced under same object key

External object store allows overwrite.

**Required:** content-address/hash/version evidence detects substitution; source identity is not merely mutable URL.

## S-STO-28 — unresolved evidence violates relational FK expectation

Source row cannot map to Product.

**Required:** preserve evidence/candidate without fake placeholder Product or forced exact FK.

# Binding / identity history

## S-STO-29 — source PK reused after years

Legacy ID 123 changes from Party A to B.

**Required:** historical Actions resolve against prior binding basis; current mapping points to B.

## S-STO-30 — merge later split

Two Parties merged, later proven distinct.

**Required:** preserve merge decision and selective/unresolved historical reassignment.

## S-STO-31 — graph projection still has old merged edge

Authoritative split committed; graph CDC lags.

**Required:** high-risk Action cannot rely on stale graph as identity authority. Freshness/basis contract routes to authority.

## S-STO-32 — vector candidate index returns deleted Party

PII deletion removed source/authority but vector index failed to delete embedding.

**Required:** retention lineage detects/prohibits leaked candidate and repairs derived store.

# Ledger / mutability

## S-STO-33 — posted journal row UPDATE

Developer runs update on posted debit amount.

**Required:** ledger domain prevents silent mutation; correction uses reversal/new posting or explicitly governed correction law.

## S-STO-34 — draft configuration incorrectly append-only

Every keystroke becomes immutable business Event and cannot be cleaned under retention policy.

**Required:** architecture does not impose ledger semantics on drafts.

## S-STO-35 — imported source correction is mistaken for ledger reversal

Source spreadsheet fixes typo.

**Required:** source observation revision/correction semantics differ from accounting reversal semantics.

# External effects / restore

## S-STO-36 — local PITR before remote payment

Local DB restored to before EffectRequest appears, but payment provider shows success.

**Required:** recovery reconciles remote authority before reissuing; cannot assume restored DB rewound external world.

## S-STO-37 — outbox published but projection DB restored behind offset

Consumer may replay messages.

**Required:** projection idempotency and semantic IDs make replay safe; authority remains upstream.

## S-STO-38 — effect attempt table loses latest row

Backup restore removes `sent/no-response` evidence while external mutation may have occurred.

**Required:** DR design must explain recovery of effect identity/outcome evidence or mark uncertainty; blind retry prohibited.

## S-STO-39 — compensation relation exists only in analytics store

Primary DB restored; refund causal link lost.

**Required:** compensation/effect causality needed for business truth belongs in authoritative/audit store, not analytics-only projection.

## S-STO-40 — provider receipt only in application log

DB has EffectRequest but receipt R is only unstructured log and logs rotated.

**Required:** correlation identity required for reconciliation must be durably persisted under effect contract.

# Authorization / governance

## S-STO-41 — authorization graph stale after revocation

Derived graph/PDP cache still shows active grant.

**Required:** #42 currentness/bounded-staleness rule prevents unsafe commit; cache TTL alone is not universal authority.

## S-STO-42 — historical approval disappears when current grant deleted

Grant row hard-deleted and approval audit only points to it.

**Required:** enough historical grant/revision evidence remains to explain prior valid approval while respecting retention/privacy.

## S-STO-43 — SoD query uses current organization only

Employee changed departments after approval.

**Required:** historical participation/authority context remains reconstructible where SoD audit needs it.

## S-STO-44 — usage budget counter in eventual cache

Two high-value approvals concurrently consume same remaining delegation budget.

**Required:** hard usage limit is transactionally enforced in authority domain, not eventual projection.

# Orchestration / runtime persistence

## S-STO-45 — workflow history treated as business ledger

Workflow DB is deleted after retention expiration.

**Required:** business audit remains complete from semantic commit/effect/approval evidence if runtime internals were only coordination memory.

## S-STO-46 — workflow store and authority DB disagree after crash

Runtime says step incomplete; LocalOperation O already committed.

**Required:** recovery queries semantic operation identity and replays/no-ops correctly.

## S-STO-47 — shared Postgres transaction co-commits checkpoint + Action

DBOS-like architecture atomically stores both.

**Required:** allowed; semantic distinction does not mandate separate stores.

## S-STO-48 — workflow timer table directly updates deadline status by trigger

Timer fires and trigger marks Commitment overdue without #40 basis evaluation.

**Required:** reject semantic leakage.

# Graph / traversal

## S-STO-49 — deep provenance path becomes slow in relational authority

Explainability query crosses 12 relation types and millions of evidence rows.

**Required:** architecture may add derived graph/materialized path index without granting it write authority.

## S-STO-50 — derived graph loses one CDC batch

Graph says supplier relation absent.

**Required:** projection health/freshness visible; graph can be rebuilt/backfilled from authority.

## S-STO-51 — graph-native authority uses snapshot isolation

Two relation mutations jointly violate exclusivity/SoD invariant.

**Required:** explicit constraint/serialization protocol or architecture fails authority role.

## S-STO-52 — RDF store serializes every writer

Correctness holds but write throughput collapses under production load.

**Required:** performance benchmark can reject it as OLTP authority even with strong semantics.

# Analytics / OLAP

## S-STO-53 — analyst queries stale ClickHouse projection for high-risk Action

Projection lags 90 seconds.

**Required:** Action requiring current basis reads authority/fresh enough snapshot, not convenience OLAP table.

## S-STO-54 — Iceberg time-travel snapshot used as named evidence

Action explicitly pins analytical snapshot S for a historical analysis decision.

**Required:** valid when snapshot identity/lineage is part of declared basis; being derived does not make it unusable evidence.

## S-STO-55 — Iceberg branch edited independently then mistaken for production state

Experimental branch contains alternative classification.

**Required:** branch remains analytical/scenario data until governed admission.

## S-STO-56 — OLAP total differs from OLTP due CDC lag

Dashboard shows 99 while authority says 100.

**Required:** freshness/lineage is visible; discrepancy is not automatically an invariant violation.

## S-STO-57 — analytics store becomes only copy of old raw data

Primary retention removed detailed historical rows but analytics kept unique business-required evidence accidentally.

**Required:** reclassify analytics as audit authority or redesign retention; cannot call it rebuildable if truth exists only there.

# Kafka/log

## S-STO-58 — exactly-once Kafka processing duplicates external email/payment

Consumer transaction commits Kafka offsets/records but external provider request response is lost.

**Required:** #41 provider idempotency/reconciliation still required.

## S-STO-59 — same business Action emits several Kafka records

Header/line/projection topics each receive records.

**Required:** record count does not become business event count.

## S-STO-60 — compacted topic drops historical values

Consumer assumes Kafka compacted topic is full audit ledger.

**Required:** only use it as audit if retention/compaction semantics actually satisfy audit contract.

# Privacy / retention

## S-STO-61 — raw PII erased, decision audit retained

Legal policy permits retaining operation ID/result but not source document.

**Required:** derived sensitive content removed while permitted audit evidence remains meaningful without reconstructing erased PII.

## S-STO-62 — immutable-history DB excision/erase requested

Architecture claims immutable forever.

**Required:** demonstrate actual erasure/excision/crypto-erasure policy or fail applicable privacy requirement.

## S-STO-63 — backup restores previously erased PII

Old backup is restored into production after erasure request.

**Required:** restore procedure reapplies tombstone/erasure ledger/key destruction obligations before serving data.

## S-STO-64 — legal hold conflicts with ordinary retention

Evidence normally expires but case puts it on hold.

**Required:** scoped retention override without freezing every unrelated record.

# Schema / ontology evolution

## S-STO-65 — property changes type under new ontology revision

Old Actions used integer; new ontology uses structured Money.

**Required:** historical interpretation remains tied to revision; migration/projection does not rewrite old Action intent.

## S-STO-66 — Link cardinality changes

New ontology requires one active supplier instead of many.

**Required:** migration validates existing data and future writes atomically; physical constraint rollout cannot create invisible invalid window.

## S-STO-67 — online index migration occurs with no semantic change

DB adds/rebuilds index.

**Required:** no OntologyRevision invented solely for physical maintenance.

## S-STO-68 — derived graph schema changes before OLTP schema

Projection deploys new relation representation.

**Required:** semantic IDs/revisions still map correctly; projection version does not become ontology authority.

# Disaster recovery / topology

## S-STO-69 — entire derived layer lost

ClickHouse, graph and vector indexes all disappear.

**Required:** business operations may degrade in query capability but authoritative truth remains and projections can rebuild.

## S-STO-70 — entire authority DB lost beyond backups

Only derived indexes remain.

**Required:** architecture must state business truth is lost/incomplete unless a designated durable audit/replica authority can reconstruct it. Do not pretend derived copies automatically become authoritative after disaster.

# Coverage dimensions

Future fuzz/benchmark work should combine:

```text
authority: primary / replica / derived / external
isolation: read-committed / snapshot / serializable / explicit lock
history: mutable / revisioned / append-retract / valid-time / system-time
failure: crash / timeout / partition / PITR / projection loss / stale CDC
time: business-valid / system / source / capture / provider-sequence / binding-effectivity
retention: normal / erase / legal hold / backup restore
tenancy: single / cross-tenant collision / tenant migration
query: OLTP point / predicate / recursive graph / OLAP / fuzzy-vector
schema: stable / additive / breaking ontology / physical-only migration
```

A storage architecture that passes only CRUD and time-travel demos has not been tested against OS semantics.
