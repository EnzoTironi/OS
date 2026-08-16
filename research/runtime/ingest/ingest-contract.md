# Candidate ingest semantic contract

**Issue:** #45  
**Status:** Wave B hypothesis.  
**Goal:** define the semantics an ingest/runtime implementation must preserve before selecting tools.

This contract is intentionally written as **roles and obligations**, not a proposed OS metamodel. Terms such as `Capture`, `SourceRecord`, `MappingProposal`, `IdentityCandidate`, `BindingDecision`, and `AdmittedStatement` are names for jobs in the boundary. #70 must still ask whether each is an ordinary typed record/relationship or requires engine-native semantics.

# 1. Ingest is not one operation

A useful ingest pipeline has at least these conceptual transitions:

```text
CONNECT
  establish a source endpoint/capability/security boundary
        │
        ▼
CAPTURE
  preserve source-local evidence with source position/revision
        │
        ▼
PARSE / PROFILE
  decode structure and missingness without domain invention
        │
        ▼
SEMANTIC INTERPRETATION
  propose statement kind, grain, values, times, units, references
        │
        ▼
IDENTITY RESOLUTION
  generate candidate bindings + evidence/score/constraints
        │
        ▼
ADJUDICATE / ADMIT
  decide which binding/statements may participate in which operational contexts
        │
        ▼
PROJECT / QUERY
  derive current operational views without deleting the evidence below
```

A system can physically fuse stages for performance, but it must preserve enough metadata to explain the semantic boundaries.

# 2. Source boundary

## 2.1 Source descriptor

A source is the external **system/collection/channel boundary**, not the data itself.

A source descriptor needs enough identity to distinguish, for example:

```text
Mercado Livre account A
Mercado Livre account B
Bling tenant X
Postgres database Y/schema Z
spreadsheet file version/hash
WhatsApp group G
SEFAZ authorization endpoint/model
machine sensor gateway
```

Candidate fields/relationships, not a schema requirement:

```text
source identity
connector/capability kind
organization/tenant scope
collection/table/endpoint/channel
credential/security boundary reference
read/write/CDC/snapshot/query capabilities
source-specific ordering/watermark semantics
```

The business model must never depend on connector class names.

## 2.2 Capture identity

A capture is one provenance-bearing act of obtaining source evidence:

```text
file ingestion
API poll/page
SQL snapshot
CDC record batch/transaction
webhook receipt
message fetch
PDF/document upload
LLM extraction run over a pinned artifact
```

A capture should identify:

- source descriptor/revision;
- capture/run identity;
- source position/watermark/offset where available;
- connector/software revision;
- source schema or structural fingerprint;
- capture/record time;
- integrity evidence (hash/checksum/signature/protocol ID) where available;
- parent capture/transaction when source provides grouping;
- actor/workload responsible for capture.

This is provenance. It is not automatically a domain Event.

# 3. Captured evidence

## 3.1 Preserve the strongest available source-local identity

A source evidence item needs a stable locator **within the source context** where available:

```text
(source, collection, primary_key)
(source, partition, offset)
(source, transaction_id, operation_order)
(file_hash, sheet, row/range)
(document_hash, page, region)
(message_channel, message_id)
(API resource URI/id, version/etag)
```

The locator does not claim the item is a stable business entity.

## 3.2 Do not coerce grain

Before semantic mapping, identify what one evidence item describes:

```text
entity snapshot
aggregate
measurement
message
source-row mutation
transaction line
report result
formula/output
plan row
business occurrence record
reference/master row
unstructured document fragment
```

`grain` can be `undetermined`. It must not be guessed merely so a target type can be populated.

Example from HF:

```text
listing + date + unit_price + qty
```

may support a marketplace-sales aggregate statement. Without stable order/line identity it cannot support `OrderLine(id=...)`.

## 3.3 Missingness is data

Ingest must preserve at least the distinction among cases that the target domain cares about:

```text
source field absent
source field present but null/blank
parse failed
value redacted/not visible
not applicable
unknown to source
known numeric zero
```

Adapters may normalize source encodings, but the normalization must not fabricate a value.

# 4. Source schema and mapping revision

## 4.1 Source schema is temporal integration knowledge

A semantic mapping applies to a **source structural contract**, not to a timeless table name.

A mapping should bind either:

- exact source schema revision/hash; or
- an explicit compatibility range/proof.

If a source renames/retypes/splits a field, the old mapping is not silently applied to the new structure.

## 4.2 Mapping revision is independently identifiable

A mapping/extractor needs stable revision identity because a later model can interpret the same evidence differently.

Candidate mapping inputs:

```text
source field/fragment selectors
target semantic statement/type references
value parser/unit conversion
null/missing treatment
grain declaration
identity hints/blocking features
time semantics
authority/source-role hint
validation constraints
```

Candidate mapping outputs:

```text
one or more semantic statement proposals
zero or more identity candidates
parse/validation diagnostics
explicit unbound fields/evidence
```

A mapping can produce **zero** semantic statements when evidence is insufficient. That is better than inventing a target object.

## 4.3 AI/LLM mapping is a proposal generator

An agent may infer:

- column meaning;
- likely units;
- likely object/type;
- candidate links;
- date semantics;
- document/message extraction;
- probable identifiers.

The model/retrieval/prompt/extractor revision becomes provenance of the proposal. Its output does not gain source authority merely because the model is confident.

# 5. Semantic statement proposal

A proposed statement should make explicit **what kind of thing is being asserted** before deciding whether it is admitted as operational state.

Examples:

```text
source-local snapshot:
  listing MLB123 currently displays price BRL 199.90 at capture C

measurement:
  physical count observed quantity 108 for bin/location L at time T

aggregate:
  source report says 12 units sold for listing X on date D

source state:
  integration hub marks listing X paused

message extraction:
  message author requested delivery on 22 Aug

business occurrence candidate:
  bank statement line appears to represent settlement transaction X
```

A proposal needs enough information to answer:

```text
what evidence supports it?
what semantic kind/grain is proposed?
which subject identity is known or unresolved?
what source authored/reported it?
what extractor/mapping revision produced it?
what time is explicit, inferred, or absent?
what uncertainty/alternatives remain?
```

# 6. Identity resolution

## 6.1 Source key != business identity

The core relation is not:

```text
source_key == business_id
```

but conceptually:

```text
source-local referent  --candidate/accepted binding-->  business referent
```

Examples:

```text
ERP item code PA1000 -> Product/SKU candidate
MLB listing id -> MarketplaceListing identity
supplier row id -> Party/CommercialRelationship candidate
bank account counterparty string -> Party candidate
WhatsApp sender endpoint -> Person/Contact/Party candidate
```

Different source identities can bind to one business identity. One source identity can also need **rebinding/splitting over time** if a source reused a code or a prior match was wrong.

## 6.2 Candidate generation is part of provenance

Identity resolution may use:

```text
exact identifier rules
source-managed stable IDs
crosswalks
blocking/retrieval
string similarity
probabilistic record linkage
embedding/semantic retrieval
relational/context constraints
human/agent suggestions
```

Record which method/revision produced the candidate set. A missing candidate after aggressive blocking is not proof of non-match.

## 6.3 Candidate evidence should be decomposable

Do not preserve only one opaque score when the decision matters.

Useful evidence may include:

```text
exact tax id match
same email
conflicting legal entity
same source-exclusive key
name similarity
address agreement
product dimensions match
one-per-source cluster constraint
historical prior binding
manual evidence reference
```

The exact representation can be tool-specific, but an auditor should be able to explain why the candidate ranked highly.

## 6.4 Pairwise match != cluster identity

An entity-resolution engine may produce pairwise edges and then cluster them. Domain constraints can invalidate pure connected-components transitivity.

Example:

```text
source A record a  <0.99>  source B record b
source B record b  <0.99>  source C record c
source A record a  <0.40>  source C record c
```

A cluster may still contain all three at a threshold of 0.95. Whether that is acceptable depends on domain/source cardinality and identity semantics.

Therefore preserve:

```text
pairwise candidate edges
cluster algorithm/revision/threshold
cluster-level constraints/evaluation
final binding decision separately
```

## 6.5 Confidence is not authority

A confidence/probability answers:

> how strongly does this model/evidence support the match under its assumptions?

Authority answers:

> may this match be used as the binding that drives this operation/projection?

These are different questions.

A domain can define automatic admission rules, for example:

```text
if source supplies globally unique signed identifier
  bind automatically

if probability >= threshold AND no exclusivity conflict AND no negative legal-id evidence
  bind for low-risk analytic aggregation

if binding would merge payment counterparties or legal entities
  require authorized review
```

The important property is that the **rule/decision** is explicit and versioned; the score alone is not the rule.

# 7. Binding/adjudication

## 7.1 Binding is scoped

An accepted binding should identify its scope. Possible dimensions:

```text
source/source collection
source-local identity
target business identity
valid/effective interval when source identity can be reused
statement families/actions for which binding is acceptable
tenant/legal entity/context
binding revision
```

Not every system needs every dimension.

Example: a weak fuzzy match may be accepted for competitor-price analytics but forbidden for supplier payment execution.

## 7.2 Binding decision has a basis

A binding can come from:

```text
deterministic source contract
trusted crosswalk
constraint solver
reviewed probabilistic candidate
manual adjudication
agent proposal approved by authorized actor
```

Record:

```text
who/what decided
rule/model/version
evidence/candidate set seen
scope
state/temporal basis
when admitted
supersedes/replaces which prior binding
```

If #40 later defines a generic Decision/Action commit witness, binding adjudication should use that contract rather than inventing its own transaction semantics.

## 7.3 Merge, split and rebind preserve history

Never rewrite earlier evidence as if the source was always correctly bound.

### Merge

Two previously distinct business identities are determined to be one.

Questions:

- Are identities actually duplicates, or is there a parent/child/role relation?
- Which historical actions referenced each identity?
- Does merge imply identifier aliasing, record migration, or only a current projection?

### Split

One prior business identity is discovered to represent multiple real entities.

The split cannot safely assign all historical statements automatically. Some records remain ambiguous/unassigned until evidence decides their target.

### Rebind

A source-local identifier was associated with target A, then later should map to B.

Do not mutate old decisions. Record the new binding scope/effectivity and preserve prior decisions/actions under the binding used at the time.

# 8. Authority after identity resolution

Binding identity does not settle value authority.

Example:

```text
Bling Product 123          ┐
Marketplace Listing MLB42  ├─ correctly linked to Product P
Cost spreadsheet row X     ┘
```

These sources can still disagree about:

```text
display name
cost
available quantity
listing status
price
weight
```

Authority should be resolved per **statement kind/action/context**, e.g.:

```text
marketplace is authoritative evidence of marketplace listing status
OS Action may be authority for internal repricing decision
ERP may be authority for registered SKU identity
spreadsheet cost may be observational/provisional
SEFAZ is external authority for NF-e authorization outcome
```

A current operational projection may select one value. The source assertions remain inspectable where audit/reconciliation needs them.

# 9. Snapshot, CDC, webhook and document semantics

## 9.1 Snapshot

A snapshot says:

> source S exposed state V for source-local referent R at capture C.

It does not say how state V came about.

If no complete business history exists, keep the observed state. Later movement/event evidence can reconcile with it.

## 9.2 CDC record

A CDC record says roughly:

> source database record R was created/updated/deleted/read at source position P with before/after values and transaction/schema metadata.

It does not imply:

```text
business event type = source operation
```

A row update can be correction, projection refresh, manual override, business action consequence, or source artifact.

## 9.3 Webhook

A webhook is evidence that the remote system sent a message. Its reliability/ordering/delivery semantics are connector-specific. The business outcome may need authoritative read-back/reconciliation (#41).

## 9.4 Documents/messages

A PDF, XML, email or chat message can itself be a real business/legal artifact **and** contain extracted propositions.

Keep separate:

```text
document/message identity + authenticity/provenance
extracted candidate statements
binding of referenced parties/products/transactions
business/legal meaning of the document when independently established
```

For example, a WhatsApp message containing `entrega 22/08` can support `sender requested delivery date 22/08`; it does not automatically rewrite `promisedDeliveryDate`.

# 10. Source delete / disappearance

A source delete/tombstone should first produce a source-state observation:

```text
source S no longer contains / marks deleted source record R as of source position P
```

Only propagate a domain deletion when the authority contract proves it.

Counterexamples:

- source table is a filtered cache;
- marketplace listing archived while Product still exists;
- source record was merged into another key;
- API stops returning inaccessible records due permission change;
- spreadsheet row accidentally deleted;
- source is no longer authoritative after migration.

For source-owned records, the same observation may legitimately trigger a domain deletion/retirement Action — but the trigger/authority must be explicit.

# 11. Reprocessing and replay

## 11.1 Same evidence + same mapping/model revision should be reproducible

Where extraction is deterministic, reprocessing should reproduce the same semantic proposals. If a stochastic/LLM model is used, preserve enough model/configuration/evidence that changes are attributable even if byte-identical replay is impossible.

## 11.2 New model revision creates new proposals

Suppose mapping M1 linked suffix `.1` to variant type A and M2 later discovers the suffix means length.

Do not rewrite M1's historical output silently. Emit M2 proposals/binding corrections and record supersession/impact.

## 11.3 Actions already committed under prior bindings remain historically explainable

A later improved identity resolution does not imply an old approved payment/stock decision happened to a different entity without explicit correction/migration semantics.

This is why #9 ontology revision, #40 commit witness and #49 explanation depend on ingest/binding revision identity.

# 12. Deduplication and lineage equivalence

Two records can be:

```text
same physical/business occurrence
same source record copied to another table
same source materialized through ETL
same business state independently observed by two sources
different business occurrences with identical values
```

Do not dedupe by value equality alone.

Preserve enough provenance to identify known derivation:

```text
raw export -> cleaned sheet -> BI table
ERP CDC -> lake dataset -> report aggregate
marketplace API -> integration hub -> spreadsheet export
```

Lineage-equivalent copies are not independent corroboration and must not be double-counted as separate events.

# 13. Quarantine and unresolved evidence

An ingest pipeline should have a safe state for evidence that cannot yet be admitted:

```text
parse error
schema incompatible
ambiguous identity
unknown unit
missing required grain
conflicting deterministic identifiers
invalid signature/checksum
policy/permission prevents inspection
candidate violates target invariant
```

Quarantine is not data loss. Operators/agents need to query and resolve it.

A useful invariant:

> failure to map/bind must never force the system either to drop source evidence or to fabricate a semantic target.

# 14. Ingestion ownership modes

Avoid `system X owns object Y`. A more precise capability/authority matrix can distinguish:

| Mode | Meaning |
| --- | --- |
| observational | source statements are evidence; no automatic operational authority |
| authoritative-statement | source is authoritative for a scoped statement family/context |
| authoritative-lifecycle | source can create/retire a scoped source/domain identity under contract |
| delegated-write | OS may request mutation remotely but remote outcome remains #41 external-effect semantics |
| OS-owned | OS is semantic authority for a statement/action; external systems may receive projections/writeback |
| mirror/materialization | derived copy with no independent authority |

One source can occupy different modes for different statement families.

# 15. Minimal engine capabilities implied — if this contract survives

This contract currently requires generic capabilities, not ingest-specific engine branches:

1. stable typed identities for evidence/business objects;
2. typed relationships and many-to-many mapping history;
3. provenance/derivation metadata;
4. immutable or history-preserving decisions/revisions;
5. typed missing/unknown/uncertain values where needed;
6. Functions for parsing/mapping/scoring;
7. governed Actions/Decision semantics for high-impact binding/adjudication;
8. query over unresolved and resolved evidence;
9. temporal fields only when semantically available;
10. source/version/revision identity;
11. authorization over evidence and binding actions;
12. projections/materializations that can elect operational current state without deleting the inputs.

No evidence here requires the generic engine to understand `Excel`, `MercadoLivre`, `SKU`, `NF-e`, `Supplier`, or `Cost` by name.

# 16. Primitive reduction experiment

## M-A — native ingest primitives

```text
Observation
SourceRecord
IdentityCandidate
Binding
```

**Benefit:** obvious APIs/enforcement.  
**Risk:** prematurely turns integration roles into universal ontology sorts.

## M-B — ordinary ontology types + generic provenance/action semantics

```text
CapturedArtifact : Type implementing provenance/evidence conventions
MappingProposal  : ordinary Type
IdentityCandidate: ordinary Type/relation
BindingDecision  : ordinary governed Action/Decision output
```

**Benefit:** smaller metamodel, domain extensibility.  
**Risk:** enforcement may become convention-only if the engine cannot guarantee required historical/provenance behavior.

## M-C — fact/statement-oriented core

Represent all source evidence/mapping/binding as typed statements over referents with provenance/authority metadata.

**Benefit:** uniform epistemic representation.  
**Risk:** Wave A #59/#129 already warns fact decomposition can over-generalize and hide identity/action ergonomics.

### Current verdict

`M-B` is the strongest working hypothesis because no ingest-specific enforcement has yet defeated composition. It is **not selected**. #46/#70 should attack it with the adversarial suite below and with a real executable ingestion vertical.

# 17. Acceptance questions for any implementation

A candidate runtime fails #45 if it cannot answer these without source-specific hidden conventions:

1. What exact raw/source evidence produced this value?
2. Which source schema and mapping/extractor revision interpreted it?
3. What is the source-local identity/grain?
4. Which business identity was it bound to, by what evidence/rule/actor, and when?
5. What alternative identity candidates existed?
6. Can a binding be split/rebound without rewriting old evidence/actions?
7. Can unresolved evidence remain queryable?
8. Can a snapshot express current state without invented events?
9. Can source deletion remain only source disappearance when source lacks business deletion authority?
10. Can one business identity preserve rival source assertions?
11. Can an operational projection select a current value without deleting rivals?
12. Can lineage-equivalent copies be detected/marked to prevent double-counting?
13. Can schema drift quarantine or route to a new mapping revision instead of silently coercing?
14. Can LLM/document extraction remain proposal/evidence until admitted?
15. Can an automatic identity rule be scoped differently for analytics versus high-risk Actions?
16. Can later model improvements explain why historical bindings/actions used the older interpretation?

If not, the implementation is cleaning data by destroying semantic evidence.
