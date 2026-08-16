# Workload matrix — semantic requirements before storage choice

**Issue:** #39  
**Purpose:** derive physical guarantees from already-reviewed semantic contracts.

Legend for physical guarantees:

- `required` — a candidate authoritative architecture must support this directly or through a proven equivalent;
- `scoped` — required only for records/operations that carry the semantic property;
- `derived` — can be implemented as a rebuildable/materialized read model;
- `optional` — useful optimization, not semantic requirement.

# 1. Authoritative operational commit workloads (#40)

| Workload | Example | Required guarantee | Non-requirement |
| --- | --- | --- | --- |
| stable semantic operation dedupe | retry payment/post journal operation after lost response | unique/durable operation identity + intent mismatch detection | globally dedupe equal payloads |
| atomic multi-object mutation | post journal header + lines + account effects | atomic commit of defined mutation set | event source every mutation |
| exact-version dependency | close order only if revision 5 | CAS/version check or equivalent conflict dependency | global serializable for unrelated reads |
| predicate/absence dependency | reserve if total available >= 7; create only if no conflicting active key | serializable predicate/range/exclusion/lock or equivalent | object-version check only |
| invariant enforcement | debit == credit, no over-reservation | invariant evaluated/enforced atomically with commit | app-side validation followed by unguarded write |
| known-abort retry | serialization conflict | distinguish definitely-not-committed conflict | treat every exception as unknown commit |
| indeterminate commit reconciliation | caller loses commit result | durable marker/result evidence queryable by operation ID | assume timeout = rollback |
| pinned/frozen basis | accept immutable quote Q | preserve referenced revision/digest | reread latest value universally |
| current/live basis | sanctions/emergency policy/current stock predicate | fresh-enough/transactionally fenced evaluation per contract | pin everything forever |

**Storage implication:** the primary write authority needs more than CRUD. It must express conflicts over values **and sets/predicates** where business correctness depends on them.

# 2. Identity and ingest workloads (#45)

| Workload | Example | Required guarantee | Time axes |
| --- | --- | --- | --- |
| source capture identity | file hash + sheet + row; Kafka offset; message ID | stable source-local locator + capture provenance | capture/source position |
| raw/structured evidence retention | spreadsheet row, XML/PDF fragment, API payload | retain/retrieve while policy permits; integrity metadata | captured-at, source-reported time if present |
| schema/mapping revisions | same row interpreted by M1 then M2 | immutable/revisioned mapping identity + derivation links | mapping revision time, not necessarily valid time |
| unresolved evidence | unbound source product | queryable without fabricated domain FK | none required beyond provenance |
| candidate relations | fuzzy entity matches | many candidates + relation kind + assurance/model evidence | model/run revision; optional effective interval |
| exact binding history | source code reused/rebound | history/supersession/effectivity without rewriting old decisions | binding effectivity where meaningful |
| split/merge correction | one Party later split into two | historical references remain explainable | correction/admission time + optional domain effectivity |
| source snapshot without events | inventory 108 at date/capture | observation of position at actual grain | observed/capture time; no fabricated movement time |
| lineage-equivalent copies | raw export -> BI table -> imported report | derivation graph/query to avoid double-counting | transform/capture revisions |
| source delete/disappearance | filtered replica drops row | preserve source-state observation separate from domain delete | source position/capture time |

**Storage implication:** provenance is graph-shaped and revision-heavy, but that does not prove graph storage or universal fact tuples. Relational/tuple/document encodings remain viable if they preserve identities/edges and queryability.

# 3. Temporal knowledge workloads

The system must support several distinct temporal questions without pretending they are one universal bitemporal rectangle.

| Question | Example | Needed axis |
| --- | --- | --- |
| what did the source expose at capture C? | listing status from API poll | capture/source revision |
| when does this business fact apply? | contract price valid 1–31 Aug | business valid/effective time |
| when did OS commit/admit this? | binding accepted on Aug 12 | transaction/admission revision |
| what did OS know by time K? | forensic decision reconstruction | knowledge/admission/capture cutoff over relevant evidence |
| which source operation preceded another? | CDC update sequence | LSN/offset/provider sequence |
| which binding applied to source key then? | reused customer code | binding effectivity |
| which ontology/policy defined interpretation? | action under ontology rev 17 | semantic revision identity |
| when did workflow wake/attempt? | retry at 17:05 | runtime operational time |

### Required consequence

A candidate storage architecture must support **temporal composition**:

```text
query current operational state
query historical record revisions
query domain-valid intervals where modeled
query knowledge/source cutoff where provenance supports it
```

without requiring every scalar/property to expose all axes.

# 4. External effect/reconciliation workloads (#41)

| Workload | Required guarantee | Authority relationship |
| --- | --- | --- |
| EffectRequest durability | stable local effect identity causally linked to LocalOperation | local authority for requested intent |
| attempt history | append/query attempts without later attempt erasing earlier uncertainty | operational evidence |
| optional provider keys/receipts | nullable/multi-valued protocol-specific correlation | remote source identifiers, not local truth |
| pending/indeterminate outcome | explicit representability | epistemic state; not provider business enum |
| inbound observation correlation | exact or candidate links to effect | #45 evidence + assurance |
| compensation chain | original effect remains; new effect linked causally | new governed operation |
| executor lease/fencing | avoid simultaneous unsafe handling where implementation requires | physical coordination, not business authority |
| outbox/local-first | commit effect request atomically with local operation when selected | same authoritative transaction scope |

**Storage implication:** an outbox table/log can be an implementation detail of the authoritative store. Publishing it to Kafka does not transfer business authority to Kafka.

# 5. Authorization/governance workloads (#42)

| Workload | Required guarantee | Read shape |
| --- | --- | --- |
| current grant/revocation | low-latency current state and revision | point + relationship traversal |
| delegation chain | child grant -> parent authority source | recursive graph traversal |
| SoD participation | who initiated/approved/committed case C | historical relationship/event query |
| policy/model revision | explain decision under exact policy version | immutable/revisioned artifact lookup |
| bounded-staleness capability | token/lease expiry/revision | point lookup + time validity |
| authorization audit | actor/represented/workload/grant/context/result | append/history query |
| transactional usage budget | e.g. amount/count limit | atomic counter/predicate where semantically hard |

**Storage implication:** authorization can use a specialized index/PDP store, but if tuples/entities are writable authority independent of the business ontology, #42 split-brain risk appears. Prefer derived/projection semantics unless the authorization store itself is explicitly designated authority for that relation family.

# 6. Durable orchestration workloads (#43)

| Workload | Required guarantee | Can be separate store? |
| --- | --- | --- |
| execution checkpoint/history | crash recovery | yes, usually |
| durable timers/waits | survive process/runtime restart | yes |
| signal/input buffering | recover/observe delivery | yes |
| definition revision binding | replay/migration explainability | yes |
| runtime cancellation/admin | operational state | yes |
| link to LocalOperation/EffectRequest IDs | stable causal references | yes, but referential integrity may be eventual across stores |
| co-commit checkpoint + business mutation | useful optimization in DBOS-like architecture | optional; only if same authoritative transaction is proven |

**Storage implication:** orchestration state should not be forced into the business authority database if the chosen runtime has its own durable store. Conversely, a shared database is valid when semantic/operational schemas and retention remain separable.

# 7. Relationship/traversal workloads

Ontology links create real graph-shaped queries:

```text
supplier -> purchase orders -> lines -> products -> BOM components
party -> grants -> parent grants -> organization
product -> listings -> marketplace/account
work order -> operations -> workstation -> machine
source evidence -> mapping -> candidate relation -> binding -> domain object
Action -> effects -> attempts -> observations -> reconciliation
```

Required:

- bounded traversals with filters and authorization;
- reverse links;
- set membership and counts;
- recursive hierarchy where domains need it;
- path/explanation queries for provenance/authority.

Not required:

- arbitrary unbounded graph analytics in the commit path;
- graph-native physical storage merely because Links exist.

A relational engine with indexes/recursive CTEs can satisfy many OLTP traversals. A graph/materialized adjacency store may be a derived accelerator if workload evidence justifies it.

# 8. Read/query workloads

## 8.1 Operational current queries

Examples:

```text
open orders for customer
available inventory by warehouse
pending approvals
unreconciled effects
active grants
workflows waiting on commitment
```

Needs low latency, strong enough freshness for the action at hand, typed filters/joins, tenant/security constraints.

## 8.2 Historical/forensic queries

Examples:

```text
why did we choose cost 105 on Aug 12?
which binding did payment O use?
what source evidence contradicted current stock?
what policy revision allowed approval?
```

Needs causal/provenance/revision joins more than generic time travel alone.

## 8.3 Analytics/OLAP

Examples:

```text
sales by marketplace/month/category
supplier lead-time distributions
inventory turns
agent/action outcomes
process cycle times
```

Large scans/aggregations can be served by columnar/lakehouse projections. They do not need to run on the authoritative OLTP representation if lineage/freshness is explicit.

## 8.4 Search/text/vector

Documents/messages/product titles may require:

- full-text search;
- fuzzy matching;
- vector retrieval;
- trigram/phonetic similarity.

These are discovery/candidate-generation mechanisms. A search/vector index is normally a derived index and must not become identity/authority simply because it ranks a match highly.

# 9. Lifecycle/retention workloads

Physical persistence must support policy differences:

```text
legal/financial ledger: long-lived immutable/reversal history
raw PII evidence: minimization/erasure/redaction policy
operational projections: rebuildable/disposable
workflow history: shorter operational retention/compaction possible
search/vector index: rebuildable and deletable with source
backups: retention + restore point semantics
```

A universal append-only forever store conflicts with privacy/minimization requirements. A universal mutable latest-state store conflicts with audit/reconciliation requirements.

# 10. Multi-tenancy and isolation

At minimum evaluate:

- tenant identity in every authoritative key/constraint;
- cross-tenant unique/index leakage;
- row/object authorization filters;
- per-tenant encryption/keying where required;
- noisy-neighbor isolation;
- backup/restore/export/delete at tenant/legal-entity granularity;
- graph/search/vector indexes preserving tenant boundaries;
- orchestration/effect credentials scoped to tenant/environment.

# 11. Failure and restore workloads

Any authoritative design must explain:

```text
point-in-time recovery
backup verification
regional/node failure
partial projection/index loss
rebuild derived stores
restore without duplicating effects
restore without resurrecting revoked grants/deleted PII incorrectly
operation-id replay after restore
schema/ontology migration rollback
```

Restoring a database snapshot to an earlier point while external effects already happened is **not** sufficient disaster recovery. #41 reconciliation/outbox/effect identities must survive or be reconstructed safely.

# 12. Physical capability summary

| Capability | Authoritative core | Evidence/history | Derived indexes |
| --- | --- | --- | --- |
| strong atomic multi-object commit | **required** | scoped | no |
| predicate/absence concurrency | **required** for affected Actions | no | no |
| operation idempotency marker | **required** | historical copy useful | no |
| immutable/revision history | scoped | **required/scoped by record** | optional |
| business valid-time intervals | scoped | scoped | derived copies okay |
| system/commit revision | required internally | useful | derived |
| raw document/blob | optional in core | required where retained | searchable projection |
| provenance graph | queryable | **required** | derived accelerators okay |
| recursive graph traversal | sufficient for OLTP | useful | graph index optional |
| full-text/vector | optional | optional | **derived** |
| large OLAP scan | avoid in hot path | export | **columnar derived** |
| workflow checkpoints | optional/co-commit | separate runtime okay | n/a |
| authorization relationship index | can be authoritative/derived by explicit contract | audit history | derived PDP index possible |

# 13. First falsifier for any proposed architecture

Ask:

> **If this store/index disappears and is rebuilt from the remaining stores, did we lose business truth or only query performance?**

If the answer is “business truth”, that store is an authority and must satisfy the corresponding #40/#41/#42 semantic contract.

If two independent stores both answer “yes” for the same statement family without an explicit leader/reconciliation contract, the architecture contains rival authorities.
