# Source study — ingestion and entity resolution

**Issue:** #45  
**Decision state:** `undetermined` for architecture; source observations are dated/pinned where possible.  
**Retrieved/rechecked:** 2026-08-16.

This study uses primary/official sources for implementation behavior and the frozen Wave A corpus for internal empirical pressure. It does not use product marketing feature counts as semantic evidence.

## 1. Palantir — domain-first mapping and multi-source object pressure

Primary docs rechecked:

- Ontology best practices: <https://www.palantir.com/docs/foundry/ontology/ontology-best-practices>
- Ontology overview/system: <https://www.palantir.com/docs/foundry/ontology/overview>, <https://www.palantir.com/docs/foundry/architecture-center/ontology-system>
- Data Connection overview/core concepts: <https://www.palantir.com/docs/foundry/data-connection/overview>, <https://www.palantir.com/docs/foundry/data-connection/core-concepts>
- Connecting to data: <https://www.palantir.com/docs/foundry/data-integration/connecting-to-data>
- Multi-datasource object types: <https://www.palantir.com/docs/foundry/object-permissioning/multi-datasource-objects>
- How user edits are applied: <https://www.palantir.com/docs/foundry/object-edits/how-edits-applied>
- Action permission checks on MDOs: <https://www.palantir.com/docs/foundry/object-edits/permission-checks>

### E-I45-PAL-01 — domain before source schema

Palantir's current best-practice guidance explicitly says to:

- identify real-world entities before looking at source schemas;
- recognize that one dataset can describe multiple entities;
- separate identity from observation when a row represents a measurement/event about an entity;
- model the domain first and map source data into it rather than replicating the source shape.

**Pressure for OS:** ingestion cannot define the ontology by copying the source schema. The mapping stage needs an explicit idea of source grain and semantic role.

### E-I45-PAL-02 — source ingestion and ontology modeling are separate layers

Data Connection models a `Source` as a connection/configuration to an external system and supports batch, streaming, CDC and virtual-table patterns. Palantir's data-connection design deliberately keeps preprocessing at the connection boundary minimal so source lineage remains traceable through versioned downstream transforms.

**Pressure for OS:** connector/runtime metadata (credentials, source URL, watermark, sync schedule) is not the business ontology. Keeping raw/source evidence traceable before semantic transforms is valuable.

### E-I45-PAL-03 — one object can receive properties from several datasources, but source ownership remains explicit

Current Object Storage v2 supports column-wise multi-datasource object types. Different property subsets can come from different datasources. A property, however, currently has exactly one datasource in the MDO mapping model (apart from the shared primary key); overlapping property multiplicity is not supported. Row-wise MDO is not generally supported.

**What this proves:** mature operational-ontology systems face real source-composition and permission problems.

**What this does not prove:** OS should copy Palantir's one-property-one-datasource restriction or MDO representation. Wave A already found cases where multiple sources can legitimately assert rival values and where hiding the losing input destroys useful evidence.

### E-I45-PAL-04 — conflict resolution can produce useful current state while hiding epistemic plurality

Palantir supports source-derived state plus user edits and resolves them using strategies such as `user edits win` or a timestamp-based `most recent value` comparison. This is effective product behavior for an operational object, but it can make only the elected property value visible in the normal object representation.

**Pressure for OS:** current operational projection and preserved source assertions should be separable. `latest` is a resolution policy, not universal authority semantics.

### E-I45-PAL-05 — datasource access affects object-property visibility

MDO permission behavior can reveal some properties and return others as null depending on datasource access. Actions touching MDO-backed properties perform permission checks against the relevant backing sources/properties.

**Pressure for OS:** provenance/source binding can participate in authorization and visibility. This does not mean source schema belongs in business semantics, but the system must know which evidence/storage authority a visible value came from.

## 2. Splink — probabilistic linkage is evidence, not identity truth

Primary docs rechecked:

- Blocking tutorial: <https://moj-analytical-services.github.io/splink/demos/tutorials/03_Blocking.html>
- Inference API: <https://moj-analytical-services.github.io/splink/api_docs/inference.html>
- Fellegi-Sunter theory: <https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html>
- Clustering: <https://moj-analytical-services.github.io/splink/api_docs/clustering.html>
- Cluster/graph explanation: <https://moj-analytical-services.github.io/splink/topic_guides/theory/linked_data_as_graphs.html>
- Evaluation: <https://moj-analytical-services.github.io/splink/topic_guides/evaluation/edge_overview.html>

### E-I45-SPL-01 — candidate generation and match scoring are separate stages

Splink uses blocking rules to choose which record pairs are compared, then a probabilistic linkage model scores candidate pairs. Blocking has an explicit recall/performance tradeoff: too strict can miss true candidates; too loose can explode comparisons.

**Pressure for OS:** absence of a match candidate can be a retrieval/model artifact, not evidence of non-identity. Entity-resolution provenance should preserve how the candidate set was generated.

### E-I45-SPL-02 — a probability is an estimate under a model

Splink's Fellegi-Sunter implementation derives match weights/probabilities from model assumptions and comparison evidence. The score is therefore about the linkage model's belief/evidence, not a business authority declaration.

**Pressure for OS:** `confidence`/`probability` belongs to the candidate/evidence basis. It must not be silently converted into `same entity forever`.

### E-I45-SPL-03 — threshold choice materially changes the final identity clusters

Splink can turn pairwise predictions into connected-component clusters by applying a match-probability/weight threshold. Its documentation shows that changing the threshold can split or merge the resulting clusters. It also provides alternative clustering such as `single best links` with source-specific constraints.

**Pressure for OS:** a cluster ID is an algorithm output under a specific model/threshold/algorithm revision. It is not inherently a stable domain identity.

A dangerous case is transitivity:

```text
A --0.99--> B
B --0.99--> C
A --0.40--> C
```

Connected components at 0.95 can still put A/B/C in one cluster. A domain may reject that if the entity grain requires pairwise or source-cardinality constraints.

### E-I45-SPL-04 — evaluation needs labelled/clerical evidence and must include cluster quality

Splink's evaluation tooling supports comparison to labelled/clerical matches and warns that evaluating pairwise links is insufficient when the pipeline ultimately produces clusters.

**Pressure for OS:** automatic identity-resolution policy needs domain-specific evaluation/false-positive cost. A universal score threshold is not a semantic law.

## 3. OpenRefine — reconciliation as candidate search + human correction

Primary docs rechecked:

- Reconciliation manual: <https://openrefine.org/docs/manual/reconciling>
- Reconciliation API: <https://openrefine.org/docs/technical-reference/reconciliation-api>

### E-I45-OR-01 — reconciliation is explicitly matching against an external source

OpenRefine describes reconciliation as matching a dataset against an external source and places it alongside record linkage, entity resolution, property matching and duplicate detection.

### E-I45-OR-02 — the protocol is a candidate-oriented search API

The reconciliation API is described as a standardized search API for data matching. It supports candidate matches, previews and workflows that help a user review/correct a match.

**Pressure for OS:** a clean ingestion interface should be able to return `no candidate`, `one candidate`, or `several candidates with evidence` without being forced to choose immediately. Human/agent adjudication can be a later governed operation.

### E-I45-OR-03 — property semantics come from the reconciliation service

The OpenRefine protocol does not predefine the semantics of properties; the reconciliation service defines them.

**Pressure for OS:** field names used to match entities are part of a source/target matching model, not global ontology semantics. Match-model metadata should be versioned and inspectable.

## 4. Debezium — captured source changes preserve source operation, position, transaction and schema context

Primary docs rechecked:

- Features: <https://debezium.io/documentation/reference/features.html>
- PostgreSQL connector: <https://debezium.io/documentation/reference/stable/connectors/postgresql.html>
- MySQL connector/schema history: <https://debezium.io/documentation/reference/stable/connectors/mysql.html>
- Event flattening: <https://debezium.io/documentation/reference/stable/transformations/event-flattening.html>

### E-I45-DBZ-01 — a change-capture record is a source-database operation observation

Debezium emits changes with operation (`create/update/delete/read/...`), source metadata, before/after state, timestamps, and optionally transaction metadata.

**Pressure for OS:** this faithfully describes what changed in the source database. It does **not** establish that a corresponding business Event occurred. Updating `delivery_date` in an ERP row can be a correction, plan revision, user mistake, source projection update, or event consequence.

### E-I45-DBZ-02 — transaction/source position are essential dedupe/order evidence

Debezium can enrich data events with transaction identity/order and exposes source offsets/LSNs depending on connector. This supports replay, deduplication and source ordering.

**Pressure for OS:** source operation identity must be different from domain occurrence identity. Multiple CDC records can describe one business occurrence; one CDC transaction can change several representations.

### E-I45-DBZ-03 — schema-at-event-time matters

Debezium maintains schema history so a captured change can be decoded according to the table structure that existed when the source log record was produced. Its docs explicitly warn that applying the current schema to old events can be wrong.

**Pressure for OS:** semantic mapping must bind source-schema revision (or compatible structural fingerprint) to the transform/extractor version used. `Column X means Y` is temporal/versioned integration knowledge.

### E-I45-DBZ-04 — snapshot records and change records differ

Debezium uses operation `r` for snapshot reads. An initial snapshot can establish current source state before continuing from the log.

**Pressure for OS:** snapshot read != source mutation != business occurrence. The ingest contract needs to represent an observed source position/state without fabricating the events that led there.

### E-I45-DBZ-05 — flattening can discard semantics downstream consumers may later need

Debezium offers event-flattening transforms because many consumers want only the `after` row. The full envelope, however, contains source/op/before/after/transaction/time metadata.

**Pressure for OS:** convenience projection should not be the only retained evidence where provenance/replay/correction requires the original envelope.

## 5. W3C PROV — provenance relationships do not elect business truth

Primary source:

- PROV-O Recommendation: <https://www.w3.org/TR/prov-o/>
- PROV-CONSTRAINTS: <https://www.w3.org/TR/prov-constraints/>

### E-I45-PROV-01 — provenance separates thing, process and responsibility

PROV-O's starting classes separate `Entity`, `Activity`, and `Agent`, with relations such as generation, use, derivation and attribution/association/delegation.

**Pressure for OS:** source artifact, extraction/mapping activity and responsible actor/model are different provenance dimensions. A mapping result should be able to say what evidence it used and which activity/model generated it.

### E-I45-PROV-02 — provenance supports trust assessment but does not choose authority

PROV is designed so provenance can be used to assess quality/reliability/trustworthiness. It does not define which rival business assertion is accepted.

**Pressure for OS:** provenance is necessary input to authority/adjudication, not authority itself.

## 6. Wave A / real-company evidence

Internal evidence used:

- `research/ops/reality-check/hf-wave-a.md`
- `research/foundation/facts/wave-a-issue-4.md`
- `research/foundation/provenance/wave-a-issue-6.md`
- `research/reviews/wave-a-review-ledger.md`

### E-I45-HF-01 — source row grain can be materially different from the domain grain

HF sales rows were aggregates by marketplace listing/date/price and lacked stable order-line identity. Mapping them to `OrderLine` would invent identity/granularity.

### E-I45-HF-02 — exact-string repairs can remain ambiguous

The prior audit found automatic SKU/code repairs, including low-confidence cases and disputed suffix meaning. A corrected join improved referential coverage but did not prove business identity.

### E-I45-HF-03 — one domain concept can have several source identities and lifecycle paths

Internal SKU/product registration and marketplace listing identifiers are not one identity. A product can exist without a listing and a listing can be created while expected ERP registration is missing.

### E-I45-HF-04 — current state may be known only from a snapshot

Inventory/spreadsheet/PDF evidence sometimes describes current position without complete movement history. Reconstructing missing events would fabricate reality.

### E-I45-HF-05 — authority differs by statement/action

Product registration, marketplace listing state, marketplace price and spreadsheet/ERP cost each have different operational ownership. No single file/system owns all statements about `Product`.

### E-I45-HF-06 — lineage-equivalent tables can double-count if treated as independent facts

The source audit found strong row lineage/overlap across sales surfaces and warned not to sum equivalent bases as independent transactions.

### E-I45-HF-07 — missing is semantically meaningful

Missing cost existed and an earlier prototype incorrectly converted missing cost to zero. An ingest/value layer must preserve `missing/unknown/not-applicable` distinctions where the domain requires them.

## 7. Convergence matrix

| Pressure | Palantir | Splink | OpenRefine | Debezium | PROV | HF reality |
| --- | --- | --- | --- | --- | --- | --- |
| Domain model must not copy source schema | strong | indirect | indirect | neutral | neutral | strong |
| Source identity != business identity | strong/implicit | strong | strong | strong | compatible | strong |
| Candidate matching can remain unresolved | product-dependent | strong | strong | n/a | compatible | strong |
| Confidence != authority | indirect | strong | strong | n/a | strong | strong |
| Source operation != business occurrence | indirect | n/a | n/a | strong | strong | strong |
| Schema/version context matters | strong | model settings matter | service semantics matter | strong | provenance-compatible | strong |
| Snapshot must not invent history | compatible | n/a | n/a | strong | compatible | strong |
| Current projection may need conflict policy | strong | n/a | n/a | n/a | n/a | strong |
| Preserve provenance/activity/basis | strong | model/eval metadata | review service/candidates | strong | strong | strong |
| Identity clusters can change under algorithm parameters | n/a | strong | n/a | n/a | n/a | HF ambiguity gives pressure |

## 8. Important divergences

### D-I45-01 — operational projection vs preserved rival assertions

Palantir object state often wants one visible property value after source/edit resolution. Wave A/HF evidence requires the ingestion/research layer to preserve rival source statements in some cases.

**Resolution:** do not force one layer to do both jobs. Preserve source/admitted evidence; let a separate operational projection elect a value when a business operation needs one.

### D-I45-02 — probabilistic clustering vs stable domain identity

Splink's cluster is a model output. Business identity may have invariants that connected components cannot enforce.

**Resolution:** clustering can generate `identity candidates`; accepted business binding is a separate governed step/rule.

### D-I45-03 — source CDC deletion vs semantic deletion

Debezium accurately reports source-row deletion. HF/enterprise integration can still need the business entity to survive because the source was a replica/view or its authority ended.

**Resolution:** treat source disappearance as source evidence. Propagate business deletion only under an explicit authority/action contract.

### D-I45-04 — source timestamp vs valid/effective time

CDC source timestamps/LSNs and capture times answer source ordering. A business value's effective time may be another field or may be absent.

**Resolution:** never infer business valid time merely from connector ingestion time.

## 9. Source families not independently re-audited in this pass

- Semantica's current upstream/release architecture. Earlier project research exists outside this issue, but this pass avoids treating it as current primary evidence without a fresh pin.
- Open Foundry's current source-sync implementation. Wave A #36 covers operational-runtime corpus behavior; #45 focuses on the semantic boundary rather than redoing that archaeology.
- Proprietary MDM systems. Their concepts can be benchmarked later if they add a distinct semantic pressure.

This omission is deliberate. The sources above already provide independent pressure for the core boundary, while the contract remains falsifiable by later systems.

## 10. Source-level conclusion

No inspected source supports the naive pipeline:

```text
source rows -> clean canonical table -> ontology truth
```

The independent evidence instead supports a layered model where source evidence, semantic interpretation, identity matching and operational acceptance are separately inspectable. None of the sources proves that these layers require new OS kernel primitives; that is the reduction question carried into `ingest-contract.md` and #70.
