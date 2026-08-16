# Evidence

**Kind.** reference
**Fetched.** 2026-08-16
**Decision.** per card. Never `accepted`.

Each card names its kind as domain evidence or source-system artifact. Inference is marked. A later synthesis agent should re-read the locator, not this paraphrase.

## E-001 Ontology is a mapping over existing assets

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported` as Palantir's documented placement
- Claim: Palantir Ontology is an operational layer mapped onto existing datasources, not a replacement store.
- Citation: Palantir, Overview, Ontology building, accessed 2026-08-16, https://palantir.com/docs/foundry/ontology/overview/
- Observation: "The Ontology sits on top of the digital assets integrated into the Palantir platform (datasets, virtual tables, and models)". "Defining the semantics of your organization happens by mapping existing datasources into objects, properties, and links".
- Limits: Does not prove every customer leaves the ERP in place. Marketing-adjacent overview.

## E-002 Virtual table is a pointer. Ontology object is still stored

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: Palantir virtual tables avoid Foundry dataset storage. Objects and pipeline outputs created from them are still stored.
- Citation: Palantir, Virtual tables, sections "Virtual tables", "Using virtual tables vs syncing to datasets", and "Configure objects backed by virtual tables", accessed 2026-08-16, https://palantir.com/docs/foundry/data-integration/virtual-tables/
- Observation: "A virtual table acts as a pointer to a table in a source system outside of Foundry." Benefits include "Reduction of duplicate storage by not storing source data in Foundry." The same page then says "Foundry will still store data for any downstream-created resources, such as datasets and objects that are outputs from Foundry pipelines." Objects backed by a virtual table reindex when update detection fires.
- Limits: Capability matrix is source-specific. Some virtual tables are read-only.

## E-003 Writeback is not two-phase commit

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: An ontology action that writes an external system can accept remotely and fail locally.
- Citation: Palantir, Action types, Side effects, Webhooks, section "Writeback webhooks", accessed 2026-08-16, https://palantir.com/docs/foundry/action-types/webhooks/
- Observation: A writeback webhook runs before object changes. If it fails, no Ontology changes are made. "It is still possible that the external request may succeed but Ontology changes could fail." Side-effect webhooks run after the user sees success and have no guaranteed order.
- Limits: Describes Foundry Actions. The split is the domain fact. Timeout-after-possible-success is scenario S-004.

## E-004 Indexed objects merge pipeline rows and user edits

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: Palantir keeps two write paths into one object. The default merge makes user edits win forever on edited properties.
- Citation: Palantir, How user edits are applied, sections "Persistent storage of user edits" and "Resolve conflicting user edits and datasource updates", accessed 2026-08-16, https://palantir.com/docs/foundry/object-edits/how-edits-applied/
- Observation: Funnel owns a merged dataset that "combines data coming from datasources and user edits". Strategy 1, the default, says "the final state of an object is always determined by the user edits applied to it, regardless of any future datasource updates for edited properties". A later source update to an edited property is ignored. Strategy 2 compares edit time to a datasource timestamp, not to a legal valid time. Deletion hides the object "regardless of datasource state".
- Limits: Conflict rules are product configuration. They are evidence that a materialized ontology must pick a loser.

## E-005 Action apply can see a different object version than the form

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported` for the version gap. `undetermined` for whether OSv2's weaker check is acceptable.
- Claim: The object loaded in the Action form is not guaranteed to be the object the server applies.
- Citation: Palantir, How user edits are applied, section "Entity version control between front-end consumers and the Actions server", same URL as E-004.
- Observation: The `/apply` request does not include the versions the form loaded. The server loads objects again. "there is no guarantee that the versions ... will always be the same." OSv2 checks only objects used to generate edits.
- Limits: Product versioning, not a general theory of stale approval. Scenario S-003 is the domain form of the same gap.

## E-006 Dataverse virtual tables do not replicate rows

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: A virtual table is a Dataverse table whose rows stay in the external database.
- Citation: Microsoft Learn, Create and edit virtual tables, dated 2026-04-17, git commit `be08db439b471951d6b83f7733d1ac598cfd3566`, https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-virtual-entities
- Observation: Virtual tables "contain data that is sourced from an external database". You "connect directly with an external data source at runtime ... without the need for data replication."
- Limits: Maker documentation. Write support depends on the provider.

## E-007 Virtualization drops ontology-adjacent capabilities

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported` as a capability tax, not as an OS primitive list
- Claim: Once rows are not stored, audit, search, offline, calculated columns, row-level security, change tracking, and business process flows are refused or must be reimplemented on the source.
- Citation: Same page as E-006, section "Considerations when you use virtual tables".
- Observation: Virtual tables do not support auditing, rollups, calculated columns, dashboards, charts, queues, SLAs, duplicate detection, change tracking, mobile offline, column security, or Dataverse search. They are organization-owned and "don't support the row-level Dataverse security concepts." Column min/max metadata is not enforced on query because "the value is coming from an external data source".
- Limits: Dataverse-specific list. The tax is the domain fact. A virtualized OS type will lose whatever the engine used storage to provide.

## E-008 Finance and operations virtual entities run source logic

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: When Dataverse exposes an F&O entity as virtual, CRUD invokes the physical entity and its business logic in finance and operations.
- Citation: Microsoft Learn, Virtual entities overview, dated 2026-01-21, git commit `f3620b9f4e646da05b8104ef906fc7bff4811316`, https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/power-platform/virtual-entities-overview
- Observation: "By definition, the data for virtual entities doesn't reside in Dataverse. Instead, it continues to reside in the app where it belongs." "Because a finance and operations entity is directly invoked in all operations, any business logic on the entity or its backing tables is also invoked." Calls run as the mapped F&O user, not as a god service.
- Limits: Requires co-located environments for the stated latency. Authorization is two security systems, not one.

## E-009 Dual-write is a bidirectional replica

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: Dual-write copies each change in both directions so Dataverse and finance and operations hold the same rows.
- Citation: Microsoft Learn, Dual-write overview, dated 2026-01-15, git commit `df3b6529af0c026724975543fb431cf8c2b2041f`, https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/dual-write-overview
- Observation: "Any data change in finance and operations apps causes writes to Dataverse, and any data change in Dataverse causes writes to finance and operations apps." Infrastructure includes "play, pause, and catchup modes" and "ability to sync initial data". Application maps include "Integrated customer master", "Unified product mastering experience", and "Integrated prospect-to-cash experience".
- Limits: Vendor overview. The replica is the fact. "Unified" is marketing for a pair of mapped tables.

## E-010 The replica layer mutates the other model's schema

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: To keep the two stores in parity, dual-write adds company, party, date effectivity, and extra currency precision to Dataverse.
- Citation: Same page as E-009, section "What does dual-write mean for developers and architects of customer engagement apps?"
- Observation: Installing the package "makes some crucial changes in the Dataverse schema". Dataverse "includes new concepts such as company and party". "Date effectivity is added to Dataverse." Currency may move from money to decimal with ten places.
- Limits: Microsoft-specific types. The domain fact is that a canonical overlay does not leave the other model alone.

## E-011 Dual-write has no distributed transaction

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: A bidirectional replica can accept on one side and miss the other.
- Citation: Microsoft Learn, System requirements for dual-write, dated 2026-05-04, git commit `0b72f2d54cccc32c2892032ea3b03342e8156d6a`, https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/dual-write-system-req
- Observation: "Dual-write doesn't support distributed transactions. For example, if the product receipt posting process is canceled, dual-write might create the product receipt in Dataverse but doesn't create it in Supply Chain Management."
- Limits: One named example. Enough to kill the claim that a sync bus makes two stores one store.

## E-012 Source bypass skips the replica

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: Writes that avoid the hooked API leave the replica stale by design.
- Citation: Same page as E-011.
- Observation: "Dual-write isn't triggered by the doInsert, doUpdate, and doDelete events of finance and operations apps. Use the Insert, Update, and Delete events ... when you want to trigger dual-write."
- Limits: X++ specific names. The domain fact is that every replica has an unhooked write path.

## E-013 Replica pause and size limits make staleness ordinary

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: Live sync is bounded. Pause is a first-class mode. Catch-up has a short retention window.
- Citation: Microsoft Learn, Dual-write limits for live synchronization, https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/sync-limits . What's new in dual-write, compliance note that paused maps store data 24 hours, https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/whats-new-dual-write . Both accessed 2026-08-16.
- Observation: Every live transaction has a two-minute timeout and is aborted on both sides if it overruns. Finance-to-Dataverse live sync caps a transaction at 1,000 records. Paused maps keep data 24 hours, then administrators must run the maps. Dual-write is 1:1 between one finance environment and one Dataverse environment (E-011 page).
- Limits: Product quotas. They show that "near-real-time" is a quota, not a law.

## E-014 Microsoft already split virtualize versus replicate by ownership

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: The vendor that sells both products tells architects to pick by data ownership, not by which UI they like.
- Citation: Microsoft Learn training, Dual-write vs. virtual tables, dated 2025-06-02, git commit `aaf48eca5c8fcc8c166212128ed16833900e0cc3`, https://learn.microsoft.com/en-us/training/modules/get-started-with-powerapps-common-data-service/2b-dual-write-vs-virtual-table
- Observation: Dual-write when you need near-real-time synchronization, offline, and "a tightly integrated and replicated dataset". Virtual tables when you want "access external data in real time without duplicating it", large datasets, or "read-heavy scenarios or light CRUD operations that don’t require local data storage". "The decision ... depends on the data ownership model, the need for replication, and offline requirements."
- Limits: Training unit, four minutes. Still the official split.

## E-015 A new master still keeps the old replicas

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: SAP Business Partner did not delete Customer and Vendor. It added a third object and a synchronization cockpit.
- Citation: SAP Help, Business Partner Conversion Activities, S/4HANA 1610, https://help.sap.com/doc/f2ca09fbcb444d0c906dedacc1775288/1610/en-US/loiocef3a8570239a30be10000000a44147b.pdf . SAP Learning, Manage Customer / Vendor Integration, accessed 2026-08-16.
- Observation: "The BP transaction is the single point of entry to create, edit, and display master data for business partners, customers, and suppliers. Supplier and Customer Master Data are widely used within SAP S/4HANA." CVI "occurs in the background". Creating or updating a business partner "automatically populates and synchronizes the required fields in the corresponding customer or vendor record." MDS_LOAD_COCKPIT converts unsynchronized customer/supplier data. Link tables exist so the three records can be found.
- Limits: Conversion-era help. S/4 still uses customer and supplier in documents. The new ontology did not remove the old ones.

## E-016 Sync failure is an operational office, not an edge case

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: SAP treats CVI drift as a standing workload with its own transaction.
- Citation: SAP Community blog by SAP, Business Partner Usage of Postprocessing Office, https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-sap/business-partner-usage-of-postprocessing-office-ppo/ba-p/13439767 accessed 2026-08-16.
- Observation: "Postprocessing Office is the main log for synchronization issues created by Customer Vendor Integration (CVI) independent on synchronization direction." "PPO should be checked periodically to avoid data inconsistencies during CVI synchronization." Orders are created from MDS_LOAD_COCKPIT and from transaction BP.
- Limits: Community blog, SAP-authored. The office exists because the three records diverge.

## E-017 Salesforce External Objects hold no rows

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Claim: A second independent product virtualizes ERP and warehouse data as a schema projection with no persistent copy.
- Citation: Salesforce Architect, Data Virtualization, accessed 2026-08-16, https://architect.salesforce.com/docs/architect/fundamentals/guide/data-virtualization.html
- Observation: Salesforce Connect "powers External Objects ... without replicating data into Salesforce storage." "External Objects ... hold no data. External Objects are a schema projection over the source system." "Zero-copy means no persistent replication into Salesforce storage." Result sets still travel the network. Dual governance applies. Source RLS and Salesforce sharing both run.
- Limits: Architect guide, Snowflake worked example. Write behavior is adapter-specific and was not fully retrieved.

## E-018 SPARQL federation queries without materializing the remote graph

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported` for read federation. `rejected` as a write or lifecycle model.
- Claim: W3C standardized virtual query across endpoints. It does not create a second graph and it does not own lifecycle.
- Citation: W3C, SPARQL 1.1 Federated Query, Recommendation 21 March 2013, https://www.w3.org/TR/2013/REC-sparql11-federated-query-20130321/
- Observation: "This extension allows a query author to direct a portion of a query to a particular SPARQL endpoint. Results are returned to the federated query processor and are combined with results from the rest of the query." SPARQL "can be used to express queries across diverse data sources, whether the data is stored natively as RDF or viewed as RDF via middleware."
- Limits: Query language. No Action, no conflict rule, no system of record.

## E-019 Shared field names with different types fail closed

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: A federated type that silently picks one of two incompatible `timestamp` definitions is the bug. Composition failure is the feature.
- Citation: Apollo GraphOS, Value Types in Apollo Federation, section "Differing shared fields", accessed 2026-08-16, https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/sharing-types
- Observation: Two subgraphs both declare `Event.timestamp`. One returns `Int`, one returns `String`. "This is invalid." "composition ... fails due to an unresolvable conflict". A field defined in two subgraphs without `@shareable` "will break composition" because "the router doesn't know which subgraph is responsible". If a field is shareable, "each subgraph's resolver for that field [must] behave identically."
- Limits: GraphQL composition, not enterprise master data. The fail-closed rule is the transferable fact.

## E-020 EPCIS events are assertions from capturing apps, not a replacement ERP

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: The visibility standard adds a shareable event model beside enterprise applications. It does not become their store.
- Citation: GS1, EPCIS Standard, Release 2.0, ratified Jun 2022, https://ref.gs1.org/standards/epcis/2.0.0/ sections on Capturing Application, Capture Interface, and eventTime.
- Observation: "The primary output consists of EPCIS events is called an 'EPCIS Capturing Application'". The Capture Interface delivers those events to a repository or consumer. "EPCIS insulates enterprise applications from understanding the details of how individual steps in a business process are carried out". `eventTime` is "the date and time at which the EPCIS Capturing Applications asserts the event occurred." An ObjectEvent "can be used for any event a Capturing Application wants to assert about objects".
- Limits: Visibility standard. Sibling issue 38 already maps EPCIS Action away from RFC-0001 Action. This card uses the standard text, not that note.

## E-021 SEFAZ, not the emitter's store, authorizes the fiscal document

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Claim: A Brazilian NF-e is not a legal document because an ERP or ontology stored it. It is legal because SEFAZ authorized it.
- Citation: SEFAZ/MS, NF-e, accessed 2026-08-16, https://www.sefaz.ms.gov.br/documentos-fiscais-eletronicos/nf-e/ . RFB, Manual de Compartilhamento da NF-e, retrieved 2026-08-16.
- Observation: SEFAZ/MS. The NF-e is "emitido e armazenado eletronicamente, de existência apenas digital", and "validade jurídica é garantida por uma assinatura eletrônica qualificada e pela autorização de uso concedida pela Secretaria de Estado de Fazenda (SEFAZ), antes da ocorrência do fato gerador." The sharing manual says the authorizing SEFAZ assigns a protocol number that identifies authorization, denial, cancel, inutilization, and events.
- Limits: One state's public page plus the national sharing manual. Enough to refuse OS ownership of the authorized document.

## E-022 Product is not one create site

- Kind: domain evidence
- Grade: inference from sibling plus public mapping pressure
- Decision state: `supported` that one Product create is false. `undetermined` for the exact OS type list.
- Claim: Specification, SKU, offer, GTIN, and marketplace listing are different grains. Creating "a Product" in OS as a copy of the ERP item adds a sixth grain.
- Citation: Sibling `origin/cursor/issue-15-domain-cfd8` at `80637d0ecadb9e123afc773a10e16c055ceeb2eb`, `research/domain/product/candidate-laws.md`, L-01 through L-05, read by `git show` only. Dual-write overview "Unified product mastering experience" (E-009). Apollo `Product` entity contributed by multiple subgraphs without a single owner, https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/entities/enforce-ownership
- Observation: Issue 15 rejects Item or Product as a single OS type and splits specification, SKU, lot, and serial. Dual-write still maps "products" as if one master can be unified by table maps. Federation 2 says neither subgraph owns `Product`. They contribute fields.
- Limits: Sibling is not primary evidence. The public sources show vendors keep collapsing the word.

## E-023 A Sales Order is a commitment, and several systems can hold one

- Kind: domain evidence
- Grade: inference from sibling plus dual-write prospect-to-cash
- Decision state: `supported` that accept is not occurrence. `undetermined` for which system owns the customer-facing order when a marketplace is present.
- Claim: Accepting an order creates leftover demand. It does not move stock or recognize income. The screen that first typed the SKU is not therefore the system of record for fulfillment, claim, or cash.
- Citation: Sibling `origin/cursor/issue-16-domain-cfd8` at `9d82f27e9cea2a8d2d71ed77de9eaa553121e6b5`, `research/domain/o2c/candidate-laws.md` L-001, L-002, L-006 and `lifecycle.md`, read by `git show` only. Dual-write overview "Integrated prospect-to-cash experience" (E-009).
- Observation: Issue 16 splits offer, commitment, reservation, fulfillment, claim, and settlement. Dual-write maps those documents across two Microsoft apps and still needs pause, catch-up, and a no-2PC warning (E-011, E-013).
- Limits: Marketplace contracts were not retrieved. Ownership of an Amazon or Mercado Livre order stays `hypothesis`.

## E-024 One enterprise vocabulary is already under kill

- Kind: domain evidence
- Grade: sibling pointer
- Decision state: pointer only. This folder does not re-litigate issue 55.
- Claim: A later synthesis agent should not treat "one Product type" as live.
- Citation: `origin/cursor/issue-55-kill-cfd8` at `5f4233579cf3057783775126afa64c39ed631353`, `research/kill/unified-ontology/README.md`, read by `git show` only.
- Observation: That folder rejects one enterprise vocabulary and keeps a shared metamodel as `hypothesis`.
- Limits: Independent kill. Cross-link, do not copy.

## E-025 A standing truth layer is already under kill

- Kind: domain evidence
- Grade: sibling pointer
- Decision state: pointer only. This folder does not re-litigate issue 60.
- Claim: Golden-record merge and dual-write copies are the large mechanism issue 60 rejected.
- Citation: `origin/cursor/issue-60-kill-cfd8` at `0a8551c04f25c0feefd8ed616d14e3ff605ed047`, `research/kill/authority/smallest-mechanism.md`, read by `git show` only.
- Observation: That note already used Microsoft virtual tables versus dual-write. This folder re-read the Microsoft pages as primary sources and adds Palantir merge, SAP CVI, Salesforce, SPARQL, GraphQL, EPCIS, and SEFAZ.
- Limits: Independent kill. Cross-link, do not copy.

## E-026 Legal person is not the integration tenant

- Kind: domain evidence
- Grade: sibling pointer plus dual-write company concept
- Decision state: `supported` that company in a sync map is not legal identity
- Claim: Dual-write's Dataverse "company" and a 250-legal-entity live-sync cap are integration artifacts. They are not the legal person of issue 31.
- Citation: Sibling `origin/cursor/issue-31-domain-cfd8` at `59a5c79f939518f5cacccced8ace26e93be4a91b`, `research/domain/multi-entity/candidate-laws.md` L1, L3, L7, read by `git show` only. Dual-write overview company/party (E-010). Dual-write live sync 250 legal entities (E-011 page).
- Observation: Issue 31 splits legal person, operating unit, site, and brand, and requires two legal events for intercompany trade. Dual-write adds "company" to Dataverse so table maps can carry a legal-entity code.
- Limits: Sibling plus vendor schema. Do not import Dataverse company as an OS type.

## E-027 Constitution already forbids treating the source schema as the domain

- Kind: design-claim
- Grade: this repo
- Decision state: `supported` as a research rule. `undetermined` as an implemented engine rule.
- Claim: A one-to-one mapping from ERP table to ontology type is never assumed correct.
- Citation: `docs/constitution.md` item 2 and item 6, `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.
- Observation: "ERP tables, APIs, spreadsheets, event payloads, and legacy classes are observations about a domain, not the domain itself." Materialized views, caches, and database tables "may be useful without being ontology concepts."
- Limits: Research constitution, not runtime.

## E-028 Thesis currently draws external systems under one ontology box

- Kind: design-claim
- Grade: this repo
- Decision state: `rejected` as a placement of state, given E-001 through E-021. The executable-ontology thesis as a metamodel is not rejected here.
- Claim: The thesis diagram puts commerce through HR and "external systems" under one Executable Ontology. Issue 72's standing assumption makes that diagram a SoR claim the evidence does not support.
- Citation: `docs/thesis.md` section "What OS may become", `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. Issue 72 body, https://github.com/EnzoTironi/OS/issues/72
- Observation: The diagram hangs external systems off the same trunk as inventory and accounting. Issue 72 says companies will continue to have those systems. E-009 through E-016 show what happens when a new layer pretends they share one store.
- Limits: Diagram, not a coded engine. The kill is of the SoR reading, not of a shared Action and Event vocabulary.
