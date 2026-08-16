# Adversarial cases — ingestion and entity resolution

**Issue:** #45  
**Purpose:** falsify the candidate ingest contract before runtime selection.

A candidate implementation should be tested against these cases without adding source/product-specific branches to the generic engine.

## S-I45-01 — same normalized code, different legal/business referents

Source A and source B both contain `ABC-001`. Normalization strips punctuation/case and produces the same token. One is a product SKU; the other is a supplier's internal catalog code for a different item.

**Required result:** candidate generation may compare them, but exact normalized string does not bind them without source/type/context evidence.

**Fails if:** the pipeline dedupes solely by normalized key.

## S-I45-02 — one product, several marketplace listings

ERP has one product/SKU. Two marketplace accounts each have their own listing ID and slightly different title/price. One listing is deleted and recreated under a new listing ID.

**Required result:** Product/SKU and MarketplaceListing identities remain distinct and linkable; listing replacement does not create a new Product by default.

**Fails if:** all listing records merge into the Product row or product lifecycle follows listing deletion.

## S-I45-03 — listing exists, expected ERP registration does not

A marketplace user created a listing manually but forgot the ERP product registration.

**Required result:** listing evidence remains valid/unbound or bound to a candidate product; no fake ERP product is invented just to satisfy referential integrity.

**Fails if:** ingest auto-creates a fully authoritative Product with guessed identity/attributes.

## S-I45-04 — aggregate sales row looks like order line

A source report contains:

```text
listing_id, date, unit_price, qty
```

with no order ID or line ID. The same listing has many underlying transactions.

**Required result:** map as aggregate/report observation at its actual grain. Do not synthesize stable `OrderLine` identity.

**Fails if:** a hash of row contents is treated as business order-line identity.

## S-I45-05 — ambiguous suffix repair

Internal codes `XYZ`, `XYZ.1`, `XYZ.2` exist. One historical spreadsheet author used suffixes for dimension/length; another person interprets them as marketplace variants.

**Required result:** mapping proposal records alternatives/evidence and remains unresolved or reviewed. A normalization function cannot silently strip suffixes and bind all rows.

**Fails if:** one heuristic permanently rewrites historical source identity.

## S-I45-06 — duplicate source code with different semantic context

One cost source has the same code twice with different cost/context metadata.

**Required result:** duplicated key creates a source-data conflict/quarantine or a higher-grain identity hypothesis. It is not automatically one record with last-write-wins.

**Fails if:** ingest chooses one row only because it appears later.

## S-I45-07 — missing cost versus numeric zero

Source row A has `cost=0`; source row B has blank cost; source row C's cost field is absent after schema drift.

**Required result:** all three remain distinguishable until target-domain rules say otherwise.

**Fails if:** they all become decimal 0.

## S-I45-08 — low-confidence candidate accepted for analytics but not payment

Probabilistic linkage scores a supplier candidate 0.94. This is sufficient for aggregate supplier-spend exploration but not for initiating payment or tax reporting.

**Required result:** binding/admission scope or action policy can distinguish low-risk analytics from high-risk operations.

**Fails if:** one global canonical supplier ID automatically authorizes every downstream Action.

## S-I45-09 — transitive cluster false merge

Pairwise model yields:

```text
A-B 0.99
B-C 0.99
A-C 0.40
```

Connected components at threshold 0.95 clusters all three.

Domain rule says a cluster may contain at most one active legal registration from each jurisdiction/source and A/C conflict.

**Required result:** cluster remains a model output subject to domain constraints/adjudication; it may split.

**Fails if:** cluster ID becomes permanent identity without cluster-level validation.

## S-I45-10 — source primary key reused years later

A legacy source deletes customer ID `123`. Years later the system reuses `123` for a different customer.

**Required result:** source identity needs source-specific temporal/version context or rebinding history. Historical transactions under old `123` remain linked to old business identity.

**Fails if:** current mapping rewrites all historical records to the new customer.

## S-I45-11 — merge later proven wrong and split

Two Party candidates are manually merged after apparent duplicate evidence. Later a legal document proves they are distinct companies sharing a trade name/address.

**Required result:** split preserves earlier merge decision, identifies which historical statements can be reassigned, and leaves ambiguous history unresolved when evidence cannot decide.

**Fails if:** split pretends the merge never occurred or assigns every historical fact automatically.

## S-I45-12 — source delete from a filtered replica

CDC emits delete for record R because an upstream filter removed it from a replicated table; the authoritative source still contains the business entity.

**Required result:** record source disappearance. Do not delete the domain entity without an explicit lifecycle-authority contract.

**Fails if:** every source tombstone becomes domain deletion.

## S-I45-13 — permission loss looks like disappearance

An API stops returning customer R because the integration credential lost access to one region. No source delete event exists.

**Required result:** distinguish `not observed / inaccessible` from `deleted` where connector semantics permit.

**Fails if:** absence during poll is interpreted as business deletion.

## S-I45-14 — snapshot starts before CDC and overlaps changes

Initial snapshot reads row R at value 10. During snapshot, source changes to 11. CDC stream later includes the update. Depending on source snapshot semantics, naive ingestion can apply 10 after 11 or double-apply.

**Required result:** use source watermark/position/transaction semantics to establish a consistent source history; snapshot reads remain distinct from source change operations.

**Fails if:** ingest relies only on arrival order.

## S-I45-15 — schema rename with same apparent type

Source column `delivery_date` is renamed to `requested_delivery_date`; a new `delivery_date` now means actual delivery date. Both are dates.

**Required result:** schema/mapping revision detects semantic break. Old mapping does not silently bind the new column by name/type similarity.

**Fails if:** automatic schema evolution maps by closest name and creates false historical semantics.

## S-I45-16 — schema type change hides unit change

Column `weight` remains numeric but source changes unit from grams to kilograms in a migration.

**Required result:** mapping contract/source schema or explicit metadata detects unit semantic change; old transform is invalid/quarantined.

**Fails if:** values are accepted because numeric type did not change.

## S-I45-17 — report derived from the same raw source is counted twice

Raw sales export and BI report both contain the same underlying sales. BI report is later imported as if it were an independent source.

**Required result:** provenance/derivation marks lineage equivalence; aggregate analysis does not double-count or treat matching values as independent corroboration.

**Fails if:** number of source files increases confidence automatically.

## S-I45-18 — two truly independent observations agree

Warehouse physical count and ERP book quantity both say 108, but they are independently produced.

**Required result:** preserve both observations/provenance even though values agree. Agreement may increase trust but does not collapse the evidence records.

**Fails if:** equal value causes deduplication of source evidence.

## S-I45-19 — current inventory snapshot without movement history

A PDF says current stock is 108, but prior receipts/issues are unavailable.

**Required result:** represent an observed position/snapshot with provenance. Do not invent movement events to reconstruct 108.

**Fails if:** event-sourced storage refuses the input or synthesizes unexplained `InventoryAdjusted` history solely to make a balance.

## S-I45-20 — later complete ledger arrives

Months later a movement ledger is obtained and implies a reconstructed balance 106 for the same date where snapshot said 108.

**Required result:** preserve the original snapshot and new reconstructed projection/ledger evidence; surface discrepancy/reconciliation question.

**Fails if:** new ledger silently rewrites the snapshot value to 106 or snapshot silently overwrites ledger result.

## S-I45-21 — WhatsApp request versus promise

Customer message: `preciso dia 22`. Supplier employee replies only `vou verificar`. LLM extraction predicts delivery date 22 with 0.93 confidence.

**Required result:** extracted candidate is `customer requested date 22`; no supplier commitment exists.

**Fails if:** generic extractor writes `promisedDeliveryDate=22` because it found a date near delivery language.

## S-I45-22 — OCR/extraction improves under a new model

Model M1 extracts invoice number `1238`; model M2 later reads same document as `123B` with higher evidence and matches external registry.

**Required result:** preserve both extraction runs and mapping revisions; corrected binding can supersede M1 without hiding which historical Action used M1.

**Fails if:** document's old extraction is overwritten with no revision lineage.

## S-I45-23 — signed structured document with deterministic parser

A signed/validated machine-readable document contains an authoritative identifier and amount. Parser is deterministic and schema validation succeeds.

**Required result:** contract should permit automatic admission under a source/document authority rule without unnecessary human review.

**Fails if:** architecture forces every mapping through manual adjudication.

**Purpose:** falsifies over-generalization that every extraction is uncertain/manual.

## S-I45-24 — source says status changed because projection refreshed

ERP row status goes from `Open` to `Closed` because a batch recomputed a derived status field; no explicit business close decision occurred.

CDC emits update.

**Required result:** source mutation is captured, but mapping must not automatically create `OrderClosed` business occurrence unless source semantics establish that status update is the occurrence/decision.

**Fails if:** CDC op becomes Event by table/field name convention.

## S-I45-25 — one business occurrence creates many source mutations

Completing shipment updates shipment row, order status, stock balance, accounting queue and reporting table in one source transaction.

**Required result:** preserve one source transaction with multiple row mutations; do not assume five independent business events solely from row count.

**Fails if:** each CDC change becomes an independent occurrence without semantic mapping.

## S-I45-26 — two business occurrences share identical values

Two separate cash payments have same amount, date and counterparty.

**Required result:** identical value tuple does not deduplicate distinct transaction identities.

**Fails if:** dedupe uses value equality rather than occurrence/source identity/provenance.

## S-I45-27 — source record corrected in place

Spreadsheet operator fixes a typo in historical customer tax ID. No prior version exists in the source file supplied today, but earlier ingestion captured old bytes.

**Required result:** current capture can propose correction/new identity evidence while prior capture remains in OS provenance.

**Fails if:** OS only keeps latest normalized row and cannot explain old decisions.

## S-I45-28 — source loses historical schema information

An API returns old records under the current schema and no longer exposes which historical fields existed.

**Required result:** mark source history limitation. Do not claim exact historical reinterpretation beyond evidence.

**Fails if:** ingest fabricates a precise source-schema revision for old records.

## S-I45-29 — one source is authoritative only for one statement family

Marketplace API is authoritative for listing publication/status, but internal cost/stock values shown in the same API payload are stale projections.

**Required result:** authority can be scoped by statement/action. Binding source to Listing/Product does not grant authority to every field.

**Fails if:** entity-level source precedence chooses all marketplace fields.

## S-I45-30 — manual override is an explicit operational decision

Operator reviews source cost 100, spreadsheet cost 105 and supporting invoice, then approves 105 as current planning cost.

**Required result:** preserve both observations and the approved decision/projection basis. Confidence is not required to erase losing source values.

**Fails if:** override mutates the source evidence or cannot be distinguished from source observation.

## S-I45-31 — automatic deterministic binding under trusted identifier

Two systems carry the same cryptographically/legally guaranteed global identifier under an integration contract that forbids reuse.

**Required result:** pipeline can auto-bind deterministically and avoid pointless probabilistic/human workflow.

**Fails if:** all identity resolution is forced into scored candidates/review.

**Purpose:** prevents overfitting the contract to messy-source cases.

## S-I45-32 — analytics wants weak linkage, Action requires stronger linkage

Competitor intelligence can tolerate a fuzzy match linking two marketplace offers to a probable product family. A repricing Action must not use that weak relation to edit the company's own listing.

**Required result:** candidate/binding scope/risk can differ by consumer/action.

**Fails if:** one canonical link has universal semantics.

## S-I45-33 — source-local child arrives before parent

CDC/webhook for order line arrives before the corresponding order/master row due partition/retry ordering.

**Required result:** evidence can remain unresolved/pending; no fake parent identity needed. Later parent arrival resolves link if compatible.

**Fails if:** ingest drops child or invents placeholder business truth with no provenance.

## S-I45-34 — parent never arrives

The order line source record exists because source integrity is bad or parent is inaccessible.

**Required result:** unresolved/quarantine remains queryable, with reason. No endless silent retry claiming success.

**Fails if:** pipeline forces referential integrity by deleting evidence.

## S-I45-35 — source-generated key changes during migration

ERP migration replaces numeric IDs with UUIDs and provides a partial crosswalk. Some old IDs map cleanly; others were merged/split.

**Required result:** source identity migration/crosswalk is evidence requiring validation; OS stable business identity need not change when crosswalk is reliable, and ambiguous mappings remain unresolved.

**Fails if:** new source key automatically creates new business entities for all records.

## S-I45-36 — one source row contains multiple real entities

Spreadsheet row includes supplier name, product code, warehouse location and one monthly purchase quantity.

**Required result:** mapping may emit several candidate entities/relationships/statements from one source row without making the row itself the universal domain object.

**Fails if:** one-row-one-object restriction loses semantic distinctions.

## S-I45-37 — one real entity spans multiple source rows

One product specification is represented by a header row plus multiple variant/property rows.

**Required result:** mapping can compose evidence into one candidate identity/specification while retaining source-row provenance.

**Fails if:** each row must become a separate domain entity.

## S-I45-38 — adversarial LLM hallucination with plausible confidence

An extraction agent invents a missing product code based on neighboring rows and assigns 0.98 confidence.

**Required result:** source-evidence locator cannot support the invented literal; proposal is rejected/quarantined or explicitly labelled inferred with no false source attribution.

**Fails if:** model output is attributed to the spreadsheet as though source contained it.

## S-I45-39 — source read is redacted by permission

User/agent can see object identity but one source-backed property is hidden/redacted. The ingest/reconciliation process receives null-like output.

**Required result:** distinguish inaccessible/redacted from source-authored null where the connector/security layer exposes the distinction.

**Fails if:** permission denial becomes a business `null` value.

## S-I45-40 — a binding rule changes after a high-risk Action

Binding rule R1 maps bank counterparty text to Party A and an approved payment Action references that binding. Later rule R2 maps new evidence to Party B.

**Required result:** do not retroactively claim the payment was made to Party B. Historical Action remains explained under R1; correction/reclassification, if legally/business required, is explicit.

**Fails if:** querying historical Action resolves identity through only the latest binding.

# Coverage dimensions

An implementation/semantic-fuzz harness should tag these scenarios across:

```text
source mode: snapshot / CDC / webhook / file / document / message
identity: deterministic / probabilistic / unresolved / merge / split / rebind
source grain: entity / aggregate / measurement / report / mutation
schema: stable / additive / rename / semantic change / missing history
time: source time / valid time / capture time / absent
missingness: zero / null / absent / parse fail / redacted / unknown
lineage: independent / copied / transformed / aggregate
risk: analytics / operational decision / financial/fiscal high-risk
authority: observational / statement-scoped / lifecycle / OS-owned / external authority
```

Passing happy-path imports without these adversarial dimensions is not evidence that the ingest semantics are sound.
