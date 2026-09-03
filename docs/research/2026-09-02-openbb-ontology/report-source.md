# OpenBB × Bloomberg × Palantir × Zoen — research source

Status: canonical source record for the visual dossier  
Research date: 2026-09-02 (America/Sao_Paulo)  
Zoen final audited snapshot: `e34445c511f24e879c3dfb93387861f7cdd9e98e`  
Method: official documentation, source repositories pinned to commits, and a read-only audit of the Zoen working tree. Statements are tagged as **Fact**, **Inference**, or **Recommendation**.

## Executive answer

**Fact.** OpenBB, Bloomberg, Palantir, and Zoen overlap at the user experience but solve different layers of the system.

- **OpenBB ODP** is a provider federation and contract-generation runtime. It turns provider adapters into a consistent Python/REST/MCP surface, and its Workspace ecosystem turns API contracts into widgets and agent context.
- **Bloomberg** is a governed financial data product. Public evidence shows a stable identifier hierarchy (FIGI), a unified data model linking legal entities, securities, markets, prices, a large field/dataset catalog, delivery, and entitlements.
- **Palantir Ontology** is an operational decision system: objects, properties, links, functions, Actions, and security, backed by separate data, streaming, and time-series machinery.
- **Zoen** is already an authority/evidence/action kernel: published canonical definitions, immutable bitemporal claims, consistency cuts, causal lineage, governed propose/approve/commit, and durable external-effect reconciliation.

**Inference.** OpenBB is not an ontology in the Palantir sense, and Bloomberg's public data architecture is not simply a terminal full of API links. OpenBB standardizes the shape of calls and rows. Bloomberg resolves what instrument a fact belongs to and controls how the fact can be consumed. Palantir binds data to an operational world and its verbs. Zoen's opportunity is to join these layers without making provider endpoints the ontology.

**Recommendation.** Build a native Zoen financial data plane around five missing primitives: a provider capability contract, an identity/security master, immutable raw artifacts, a separate observation-series plane, and a typed object view. Keep the existing authority ledger as the governing spine. Generate CLI, API, MCP, and Eve from the same published meaning.

## Research scope and snapshots

The OpenBB organization exposed 42 public repositories through the GitHub API at research time. The detailed audit cloned 17 OpenBB repositories material to ODP, Workspace integrations, MCP, agents, templates, and adjacent history, plus four independent finance-semantics repositories, into a temporary research directory. The main OpenBB repository's default branch was `develop`; the pinned tree was still AGPL-3.0 at the audited commit.

| Repository | Commit | Role | License at snapshot |
|---|---|---|---|
| OpenBB-finance/OpenBB | `3e071fcc2cd9f891cac6040ae60296dba76dab46` | ODP, providers, REST, MCP, desktop | AGPL-3.0 (repository LICENSE) |
| OpenBB-finance/openbb-docs | `acd5b2bf2d8603f574bd6b2da2e15e1aae8b017d` | ODP + Workspace documentation | MIT |
| OpenBB-finance/backends-for-openbb | `a6293707576e16edda8305adda95b07b6a4b968b` | Workspace backend examples | MIT |
| OpenBB-finance/widgets-library | `31378c4c71ce0c591de7ae398061bcd2ca1f7b85` | widget assets/legacy integrations | MIT |
| OpenBB-finance/design-system | `8a35011409a58bc021660ead5fd36db9944e0d3a` | UI components | MIT |
| OpenBB-finance/openbb-platform-pro-backend | `2c7905c092ec38d2b80de17efb27c95680122c22` | OpenAPI-to-widget adapter | MIT |
| OpenBB-finance/openbb-ai | `9a2f0991002cd48d2d0bc5606498b52167a1c6fc` | Copilot protocol/models | MIT |
| OpenBB-finance/agent-rita | `f673c1fbeeeedfdbf4a253031d85eb8e96538924` | reference agent implementation | MIT |
| OpenBB-finance/agents-for-openbb | `aa1073d2b098ae6cf597dabf0635822aa808dd81` | example agents | MIT |
| OpenBB-finance/openbb-docs-mcp | `fa7b496dff2394a2b085d8f6e6af5e55dc91f57e` | documentation retriever MCP, not Workspace MCP | MIT |
| OpenBB-finance/openbb-cookiecutter | `538c4780130589ea4bb4da1e3a10337e9b58c1f8` | provider/router extension template | MIT |
| OpenBB-finance/openbb-snaptrade | `5edc96b406a85b7afde2bd357ce10af37f97cd6e` | authenticated Workspace app/MCP integration | MIT |
| OpenBB-finance/openbb-brightquery | `f5c9181aad4d86119a54a9e03c79bb110a207914` | Workspace app/backend example | MIT |
| OpenBB-finance/examples | `01ccc445bd8cf5b9e0a9992f10b460fd79500e63` | version-pinned notebooks/routines | MIT |
| OpenBB-finance/awesome-openbb | `11d03e922a88dd434a9793550d5230f23f40a8a8` | ecosystem index | MIT |
| OpenBB-finance/experimental-openbb-platform-agent | `1cfee33dc8443a9507698fc13c2c4eba88a03211` | stale/WIP predecessor | no root license detected |
| OpenBB-finance/pywry | `82c85ddababb089df1cbb752a7c7b2c608606168` | archived optional chart-window dependency | MIT |

An independent finance-semantics lane also cloned and pinned the OpenFIGI examples (`f847dce9492a6bac685f9fdf1d9450e57280a9c4`), FIBO (`119fa8c091aa4beece7d22aefa6fe138021a4355`), Bloomberg's `blpapi-http` (`dc49f3ecdcb8b4807049129c998449c88bfcced2`), and the third-party `msitt/blpapi-python` source mirror (`f4a164fac62c58be9ca2b989ddb6a0648170c895`). Total cloned repositories: 21. The mirror was used only to inspect packaging/source shape, never as Bloomberg organizational authority. Official FIGI, BLPAPI, SEC XBRL, IBM filing, OpenFIGI schema, and live API responses were captured separately with content hashes under the temporary research directory.

**Current-state caveat.** On 2026-08-25 OpenBB announced a commitment to release Workspace, ODP, Copilot, and the Excel add-in under a permissive license, while saying release order and timing would follow. At research time six plausible product repository names — `workspace`, `workspace-mcp`, `openbb-workspace`, `openbb-copilot`, `openbb-excel`, and `excel-addin` — returned 404 through the public repository API; the ODP tree's LICENSE remained AGPL-3.0. Public announcement, public repository visibility, and permissive licensing are therefore three different states. ODP MCP, the hosted Workspace MCP described in product documentation, and Agent Rita's proof-of-concept bridge are distinct systems and must not be conflated.

The audited `develop` tree declares package version 4.7.3, while the latest semantic GitHub release observed was v4.7.0. All static counts in this report therefore describe `develop@3e071fc`, not the v4.7.0 release artifact or an arbitrary installed environment.

## OpenBB, traced through executable contracts

### Runtime pipeline

1. Python packages register core, provider, and output extensions through entry points.
2. A `Provider` declares credentials and a `fetcher_dict` mapping a model name such as `EquityHistorical` to a `Fetcher` implementation.
3. Every fetcher follows transform-query → extract → transform-data.
4. `RegistryMap` walks Pydantic inheritance and class file locations to divide fields into OpenBB-standard versus provider-specific extras.
5. Router/signature generation merges provider choices, common parameters, provider extras, and response schemas.
6. A `Query` resolves one provider, and `QueryExecutor` runs exactly that provider's fetcher.
7. `OBBject` wraps the result, provider, warnings, optional chart, and an open-ended `extra` dictionary.
8. The same FastAPI/OpenAPI surface is adapted into MCP tools; Workspace integrations derive widget contracts from APIs.

**Fact.** This is a strong extension architecture. It makes adding a provider cheap and propagates its contract to multiple consumption surfaces.

**Inference.** It is a federation layer, not a truth-resolution layer. The ordinary execution path chooses one provider. It does not join providers, establish economic equivalence, preserve mandatory raw lineage, or govern which rival fact becomes operational state.

Automatic provider choice is ordered fallback, not semantic ranking. An explicit choice wins; otherwise the runtime uses a command default/generated priority and chooses the first provider whose declared credentials are available. Uptime, latency, price, freshness, quality, and license purpose are not scored in this selector.

### Standardization: what it guarantees and what it does not

OpenBB's own contribution guide says that fields shared by two or more providers are standardized; fields absent from another provider become optional; aliases may need manual mappings; the OpenBB team maintains the standard models. `Data` and `QueryParams` allow extra fields and are non-strict. `RegistryMap` determines “standard” partly from the Python source-file location of a class.

This provides a practical **least-common structural contract**. It does not, by itself, prove:

- that two symbols name the same venue instrument;
- that price values have the same currency, timezone, session calendar, corporate-action adjustment, or as-of semantics;
- that a field has the same entitlement or redistribution rights;
- that a transformed cell can be reconstructed from an immutable raw artifact;
- that one provider should outrank another.

### Quantitative static audit

At the pinned OpenBB commit, excluding the provider test directory, the tree contained 32 provider directories, 180 standard-model files, and 342 provider-model files. A fetcher-registration audit identified 202 distinct capability/model names and 350 provider-capability registrations. This is the all-extras checked-in universe. The non-optional default install is materially smaller: 17 providers, 266 provider-model pairs, and 180 unique model IDs.

Provider coverage was long-tailed: 134 capabilities were implemented by only one provider; 32 by two; 13 by three; 12 by four; 5 by five; 4 by six; none by seven; and only 2 by eight. Thus 66.3% of named capabilities had no interchangeable second provider in the audited tree.

Identifier vocabulary in the 180 standard-model files was also uneven (case-insensitive static scan, file count / token hits): `symbol` 117 / 424; `currency` 31 / 137; `cik` 12 / 23; `cusip` 9 / 25; `isin` 6 / 15; `lei` 4 / 8; `figi` 3 / 6; `adjustment` 1 / 2; `mic` 0 / 0; `timezone` 0 / 0. This is not a semantic-quality score; it is evidence that stable cross-provider identity and market context are not universal standard-model invariants.

The same reproducible AST audit counted 19 all-extras core entry points (14 extension packages plus 5 provider packages), 278 declared routes and 277 runtime-eligible routes: 212 GET and 65 POST. The default install had 15 core entry points, 210 declared routes, and 193 eligible routes. The OpenAPI-to-widget generator produced 425 provider/custom definitions before exclusions or chart clones. After the ODP MCP default module exclusions, the all-extras graph left 216 command candidates, before MCP administration, skills, prompts, or resources. There were zero route-path, slash-to-underscore tool-name, or derived widget-ID collisions in the audited graph. These are static source counts; the installed Python distributions and settings determine the real runtime surface.

### Worked fracture: “IBM historical price”

The standard `EquityHistorical` query requires only a string `symbol` plus optional dates. Its output requires date, OHLC, and optional volume/VWAP. It requires no instrument ID, venue/MIC, currency, timezone, session calendar, adjustment basis, provider observation time, or raw artifact digest.

The provider implementations reveal the hidden semantics:

- Intrinio says the same `symbol` slot may contain ticker, FIGI, ISIN, CUSIP, or an Intrinio ID, and adds timezone/source parameters.
- YFinance adds interval, extended-hours, corporate actions, and adjustment policy; it calls its helper with `ignore_tz=True`.
- Because the base output allows extras, a provider may return useful fields without making them part of the common invariant.

Therefore `equity.price.historical(symbol="IBM")` is a convenient request, not a proof that every returned row denotes the same venue instrument or price basis.

### OpenBB's strongest semantic pocket

The SEC/XBRL statement subsystem is qualitatively different from most provider adapters. Its checked-in methodology maps 1,190 XBRL tag/namespace pairs to 250 standardized line items, handles 15 years of taxonomy vintages, distinguishes extracted/imputed/corrected/reconciled/reconstructed values, does not silently overwrite conflicting hard facts, and reports validation diagnostics. The claimed zero unresolved violations is explicitly scoped to a curated 970-company validation corpus.

This subsystem is the closest thing in the repository to evidence-aware semantic engineering. The crucial lesson is not “OpenBB already has a universal ontology”; it is that serious semantics appeared where a vertical domain supplied identities, invariants, derivations, provenance, and a validation corpus. That pattern should be elevated into a provider-independent Zoen contract.

### MCP, Workspace, and agents

OpenBB's MCP extension converts FastAPI routes into tools, derives a category hierarchy from paths, compresses schemas, trims descriptions, indexes tools for browsing, disables the large tool set by default, and supports per-session progressive activation. This is a strong context-window pattern for Zoen MCP.

There are three different MCP boundaries in the public evidence. ODP MCP converts the local FastAPI command graph and uses its own Basic-token mechanism. The hosted Workspace MCP is documented as a PAT/browser-relay product, but its implementation was not public in the audited organization. Agent Rita contains a proof-of-concept browser bridge that keeps sessions/tokens in memory and defaults execution to the first connected browser. None of these implementations can be used to infer the security or concurrency properties of another.

Workspace parameter grouping synchronizes widgets that share `paramName` and compatible options. This is excellent interaction state, but `paramName="symbol"` is not security-master resolution.

ODP core itself does not establish a finance-grade tenant/RBAC entitlement system. Its built-in server mode exposes one global HTTP Basic credential and a separately installed auth extension hook; provider credentials live in local/environment user settings. Workspace Enterprise advertises broader RBAC, audit, export, and retention behavior in documentation, but the product implementation was not public at the snapshot, so those enforcement paths could not be audited.

OpenBB AI and Agent Rita carry widget collections, raw context, URLs, workspace state, tools, and timezone into an agent. Agent Rita splits structured context into queryable SQLite tables and prompt text. Citations identify a widget plus input arguments (or an MCP/web/file resource). That is valuable analytical-session provenance; it is not row/cell causal lineage nor a governed operational state transition.

## Bloomberg: identity and governed data, not merely links

### Identity hierarchy

FIGI is permanent, opaque, and non-reused. The code itself is semantically meaningless; meaning lives in metadata and relationships. OpenFIGI exposes distinct levels:

- venue-level FIGI: one tradable instrument in a venue context;
- Composite FIGI: links venue FIGIs within a country/market;
- Share Class FIGI: links composite FIGIs for the same class across countries.

OpenFIGI mapping accepts contextual filters including exchange code or MIC and currency. Its documentation explicitly labels `BASE_TICKER` as indistinct and potentially linked to multiple instruments. Identity resolution must therefore return candidates plus evidence, not silently uppercase a ticker.

### Live IBM resolution: 86 answers before one subject

On 2026-09-02, an exact OpenFIGI request for `TICKER=IBM` returned 86 current candidates: 63 Common Stock records, 18 Depositary Receipts, and 5 money-market records including CP and MTN programs. The ambiguity therefore crosses venue, market, security structure, and even asset class.

Adding `micCode=XNYS` returned one current candidate:

```text
venue-contextual FIGI  BBG000BLNQ16  ticker/exchange: IBM UN
             memberOf  BBG000BLNNH6  US composite: IBM US
             memberOf  BBG001S5S399  global share class
```

The input MIC was `XNYS`; the result exposes Bloomberg exchange code `UN`, not the MIC. A resolver must therefore retain the query and mapping evidence, not only copy response fields. `IBM US` is composite scope, not the NYSE listing. The FIGI share-class/composite hierarchy is also not universal across asset classes: the allocation rules apply share-class identifiers mainly to equities and funds, with documented exceptions.

The issuer side is a different identity. International Business Machines Corporation is SEC filer `CIK 0000051143`; the same filer reports common equity and separately listed notes. Neither the SEC Companyfacts response nor the OpenFIGI mapping directly asserts that this CIK issues share-class FIGI `BBG001S5S399`. That cross-source edge is an integration assertion inferred from names, security title, ticker, and venue evidence. It needs its own provenance and confidence; it must not be represented as a fact supplied by either API.

The minimum safe identity chain is therefore:

```text
filer/legal entity → issuer role → instrument/equity class
  → FIGI share class → market composite → venue instrument → venue
  → observation assertion
```

Ticker, CIK, share-class FIGI, composite FIGI, venue FIGI, MIC, and a provider symbol answer different questions. They must not be collapsed with `sameAs`.

### Data model, contracts, and economics

Bloomberg's public Data License material reports more than 70 million instruments, 40,000 fields, 8,000 datasets, and 100 billion data points published daily. Data License Plus describes a unified model connecting legal entities, securities, markets, and prices; it also describes field selection, refresh schedules, access control, and traceability back to source files. BLPAPI services expose runtime operation request and response schemas and identify an authorization service for restricted operations.

The public evidence supports a strong conclusion: the Bloomberg experience is powered by three coupled systems — identity, field/data contracts, and entitlements — not by terminal hyperlinks alone. It does **not** justify claiming that every terminal cell exposes universal cell-level lineage or that public documentation reveals Bloomberg's internal canonical architecture.

Public BLPAPI request semantics show why an observation key is larger than `(security, field, date)`. Reference requests return a value at request time, possibly delayed by entitlement. Historical requests carry date range, calendar, currency, non-trading-day fill, periodicity, maximum points, price/yield choice, and corporate-action adjustment settings. If `adjustmentFollowDPDF=true`, user Terminal defaults override explicit split/normal/abnormal flags. Reproduction therefore requires the effective request policy, not merely its three most visible arguments.

`FieldInfoRequest` accepts a mnemonic or alphanumeric field ID and can return a unique ID, datatype, documentation, category, properties, overrides, and field type. A successful HTTP response can still contain nested response-, security-, or field-level errors. A Zoen provider contract should retain the field-catalog/schema snapshot and model error scopes explicitly.

Authorization is user identity plus service plus entitlement-ID set. That delivery authorization is not evidence of contractual permission to store, derive, display, export, or redistribute. Those rights need separate, effective-dated contracts in the ontology.

### Open standard versus licensed facts

FIGI is open data and has an OMG specification/ontology representation. Bloomberg market/reference/fundamental facts remain licensed products. This separation is architecturally useful for Zoen: identifier vocabulary and mappings can be open, while each observation still carries provider license, entitlement, purpose, and redistribution constraints.

There is also a vocabulary collision worth preventing. FIBO's `Entitlement` is an economic instrument/right held by someone. Bloomberg “entitlement” is authorization to consume a service or data item. Use distinct concepts such as `HolderEconomicRight`, `DataAccessEntitlement`, and `ContractualUsageRight`.

### Assertions, revisions, and four clocks

The SEC defines an XBRL fact as a filer assertion whose identity includes concept, entity, period, unit/decimals, language, and taxonomy-defined dimensions. Companyfacts is a convenient projection: it excludes custom facts and complete dimensional contexts, collapses taxonomy-year identity into `namespace/tag`, and mutates as filings disseminate.

The IBM capture contains a concrete revision for `Assets`, USD, economic instant `2014-12-31`:

```text
117,532,000,000  accession 0001047469-15-001106  filed 2015-02-24
117,271,000,000  accession 0001047469-16-010329  filed 2016-02-23
```

Thus `(entity, concept, period, unit)` is not a unique observation. Equal values repeated by later filings also remain distinct assertions. Queries need an explicit policy: exact accession/as-filed, as-known-at a timestamp, latest assertion, or SEC frame. The `frame` endpoint is itself a last-filed, calendar-alignment policy with duration tolerances, not canonical accounting truth.

A finance-grade model needs at least four clocks:

1. identifier/listing validity time;
2. economic observation period;
3. event/corporate-action effective time;
4. assertion publication and ingestion/retrieval time.

Taxonomy identity is part of meaning too. IBM's filing imports US-GAAP 2025, while the current Companyfacts description may reflect a different taxonomy vintage. Persist the complete taxonomy namespace/version/package digest and definition snapshot rather than only `us-gaap:Assets`.

### FIBO: vocabulary, not an instance master

FIBO usefully distinguishes issuer as a role, financial instrument, exchange listing, temporally reassignable ticker, pricing source, observed time, and economic rights. It does not supply authoritative instances, FIGI allocation, a historical alias service, licensed facts, or provider query semantics. Its Market Data domain and detailed corporate-action material were still marked provisional in the audited 2026 tree. Use FIBO for governed vocabulary and crosswalk design, then add local executable constraints; do not treat it as a ready-made observation store.

## Institutional standards cross-check

The relevant standards converge more narrowly than a casual synthesis suggests. They support explicit semantics, governed/contextual identifiers, distinguishable events and timestamps, provenance, measured quality, and controlled model evolution. They do **not** jointly prescribe an opaque internal master ID, full bitemporality, append-only event sourcing, a resolution receipt for rival facts, provider entitlements, or Palantir-style Actions. Those are informed Zoen architecture choices, not compliance claims.

| Standard | What it actually contributes | Boundary / Zoen implication |
|---|---|---|
| BCBS 239 / SRP36 | governed taxonomies/metadata; accuracy, integrity, completeness, timeliness, adaptability; reconciliation; ownership; authoritative sources; `as of` reconstruction | every published dataset/view needs owner, source, quality controls, documented exceptions, and reconciliation; multiple physical models remain acceptable |
| GLEIF / LEI | opaque legal-entity identity separate from names; Level 1 “who is who”; Level 2 “who owns whom”; relationship periods/status; originator and validation source; full/delta files | use stable entity identity plus typed assignments; preserve effective/recorded dates, origin, validation status, exceptions, and deltas |
| FIBO | formal vocabulary for roles, instruments, listings, identifier schemes, pricing, and rights, with release/provisional maturity | borrow governed concepts/crosswalks; do not mistake vocabulary for authoritative instances or operational lineage |
| ISO 20022 | governed Data Dictionary and Business Process Catalogue from which message concepts are derived; proprietary codes can declare issuer/scheme | namespace every external code and separate interchange contract from system of record/object ontology |
| FINOS CDM | lifecycle events as composable `before → after` trade-state transitions; workflow lineage; event/effective dates; corrections/cancellations | model business change as explicit reconstructible transition; this does not itself require append-only physical storage |
| W3C PROV-O | Entity–Activity–Agent, derivation, usage, generation, attribution, revision, primary source, delegation, and qualified influence | every material transformation can identify inputs, activity/plan, responsible agent, and output; provenance supports trust assessment but does not choose truth |

BCBS's “single authoritative source” should not be implemented by deleting rival claims. Zoen can satisfy the operational intent more safely by preserving assertions, publishing a purpose-specific resolution policy, selecting an accepted view, and emitting a durable explanation/receipt. That receipt is a Zoen design advantage, not something BCBS, PROV-O, or FIBO mandates.

## Palantir: the ontology is a decision system

Palantir's current architecture documentation says the Ontology represents interconnected decisions, integrates data, logic, action, and security, and is implemented through a Language, Engine, and Toolchain. Objects/properties/links are the nouns; Actions are the verbs; functions and models provide logic; policies govern both schema resources and object/link instances.

Two Palantir details matter especially for this design:

1. **Interfaces are semantic capability contracts.** An interface can require common properties, link constraints, and action constraints across concrete object types. This is closer to a governed domain interface than OpenBB's shared Pydantic fields.
2. **Time series are not flattened into ordinary object rows.** A time-series object stores metadata and a series ID; a separate sync backed by a dataset or stream indexes timestamp/value pairs. Ontology-aware applications resolve the series through that reference.

The second point answers a critical Zoen question: the ontology should bind and govern high-volume observations, not force every tick or OHLC cell through the same transactional claim path as a business decision.

Four adjacent contracts complete the picture. Object sets are lazy, single-type query plans with property filters, link traversal, set algebra, ordering, limits, and aggregations. Link types expose independently named sides and can be foreign-key-, join-table-, or object-backed when the relation itself needs metadata. Actions can transact over several objects/properties/links, and function-backed Actions operate on one consistent ontology snapshot. OSDKs and Ontology MCP generate permission-scoped client/tool surfaces from selected ontology resources. This is the executable-object layer Zoen does not yet have.

Palantir also separates schema-resource permissions from instance data controls and supports row/object, property/column, and combined read policies. Its documentation warns that downstream exports need their own protection. That is directly relevant to financial data: authorization must happen before object/segment discovery and independently at derived output/export, not only while rendering a value.

## Zoen audit at commit e34445c

### What is already unusually strong

- Canonical definition JSON is published under a digest and revision.
- Evidence claims carry definition reference, entity, relation, exact value, valid time, source ID/digest/reference, source observation time, and server-stamped ingestion time.
- Claims are immutable and ordered by a tenant authority commit sequence.
- Reads expose a knowledge cut and valid-time selection; Postgres authority and immutable Parquet projections share query semantics.
- The final snapshot hardens the projection worker to reject ambient authority credentials and require the exact least-privilege `zoen_projection` role/capability boundary.
- Semantic results carry supporting, rival, and computation-dependency lineage.
- Actions separate proposal, policy evaluation/approval, preview/state-basis hash, commit, and external-effect attempt/reconciliation.
- Cedar policy is applied on reads and governed Actions; the product already understands human and workload principals.
- Evidence operations are idempotent by operation ID plus an intent digest.

These are the right foundations for a governed data product. OpenBB does not provide equivalent authority semantics in its general provider runtime.

### Missing semantics and correctness gaps

1. **No explicit object instance/type membership invariant.** `EntityId` is a nominal string. A by-type query derives membership from the presence of a claim on any relation whose `source_type` matches the requested type.
2. **Link target validation is shallow.** When a relation targets `Type(T)`, admission checks only that the value is an entity reference; it does not verify that the target entity is an instance of `T`.
3. **Type attributes are declaration-only in the audited path.** They do not materialize an object store with required property contracts.
4. **No provider-independent identity resolution.** Current source flows do not define identifier assignments, ambiguity, merge/split/supersession, venue context, or resolution evidence.
5. **Evidence is plural, but belief selection is under-specified.** A relation query can return rival values. For action state with cardinality one, the current helper selects the value with the latest supporting commit; source authority, quality, observation time, and governed adjudication are not part of that selection.
6. **The generic evidence write is session/tenant authenticated but not Cedar-evaluated.** The record endpoint validates the trusted session and tenant, then calls `WorldEngine`; the audited mutation path does not attach a policy decision or bind caller identity to the caller-supplied provenance source. A tenant-authorized caller can therefore impersonate a provider/source in semantic evidence.
7. **Authorization granularity ends at the entity on reads and runs after candidate discovery.** The read engine executes semantic query/pagination and only then applies per-entity policy. Unauthorized candidates can alter page length and cursors. There is no property/relation/source/purpose entitlement model suitable for licensed financial fields.
8. **Current source CLI mapping is a vertical demo.** It content-addresses payloads and submits workload signals, but uses hard-coded demo resources and `source.mapQuantity`; this is not yet a general semantic mapping runtime.

### The scale trap

`RecordEvidenceBatch` is capped at 1,000 claims. The store executes the batch transactionally, but each new **direct-ingress** claim receives its own authority commit and its own projection-outbox event. This is route-specific: the semantic effects of one governed Action share one action commit, and scenario effects share a scenario commit. The current projection worker reloads every claim through the target commit and writes a full Parquet snapshot.

**Inference.** Recording daily OHLCV for 10,000 listings for ten years through direct evidence would create roughly 151 million scalar claims before fundamentals, quotes, or intraday data. At the current shape, that also implies 151 million authority commits/outbox entries and repeated full projection rebuilds. Current semantic queries are point-in-time; instant evidence matches only the exact requested timestamp, with no series-native latest/range/downsample contract. This is the wrong physical representation for observations even if claims are logically expressive enough.

**Recommendation.** Keep scalar claims for low-velocity operational truth, decisions, exceptions, annotations, and selected materialized facts. Store dense observations as immutable, content-addressed series partitions. Put a typed `ObservationSeries`/`DatasetVersion` object in the ontology with identity, coverage, unit/currency/timezone/calendar/adjustment semantics, provider/entitlement, raw and normalized digests, and derivation graph. A series ID becomes a foreign key from the object world into the data plane, analogous to Palantir's time-series property/sync boundary but preserving Zoen's explicit evidence model.

Use one authority commit per admitted synchronization slice or immutable segment package, not per point. Build append-only Parquet/Arrow-style segments and incremental partition manifests; reserve full rebuild for repair. The read contract must natively support `latest`, `first`, `last`, `range`, `as_of`, `aggregate`, and `downsample`, while citing the authority cut, segment range, mapping revision, and provider.

## Target Zoen architecture

The unit of reproducibility should be broader than an ontology-definition revision. Introduce a minimal published `WorldRelease` (or equivalent release closure) that pins the ontology, provider/source contracts, identity and resolution policies, quality rules, computation/executor digests, and relevant entitlement-policy revisions. Then make the point-in-time contract explicit:

```text
result = WorldRelease × valid_at × knowledge_cut × knowledge_basis × principal/purpose
```

Queries, projections, cursors, Action proposals/receipts, and material external effects should retain this basis. `knowledge_basis` names the purpose-specific accepted-view policy; it must not delete the underlying rival assertions.

### Layer 1 — provider capability contract

A provider plugin should publish canonical JSON describing:

- provider and adapter identity/version/digest;
- capability ID independent of provider endpoint path;
- typed query and output schemas;
- standard fields versus namespaced provider extensions;
- identity requirements and resolution strategy;
- time, unit, currency, calendar, corporate-action, revision/vintage semantics;
- raw artifact acquisition and digest rules;
- credential, license, entitlement, purpose, retention, and redistribution constraints;
- deterministic mapping from source fields to ontology relations or series columns;
- generated surface metadata for CLI/API/MCP/Eve/visualization.

Borrow OpenBB's extension registry and schema propagation. Do not borrow its endpoint taxonomy as domain meaning.

### Layer 2 — identity/security master

Minimum object model:

- `LegalEntity`
- `Instrument`
- `ShareClassOrIssue`
- `Listing` / `VenueInstrument`
- `Venue` with MIC and calendar
- `ExternalIdentifierAssignment`
- `CorporateAction`

`ExternalIdentifierAssignment` must carry scheme, value, authority, entity level, context, valid interval, evidence, and status (`candidate`, `resolved`, `superseded`, `conflicted`). Mapping `IBM` should return a set of candidates and the filters/evidence used to choose one. The stable internal `EntityId` should not be a ticker.

The resolver contract should be explicit:

```text
resolve(scheme, value, desired_identity_level, venue_or_market_scope?,
        valid_at?, include_inactive?, source)
  → 0..n candidates + evidence
```

It must never choose the first candidate silently.

### Layer 3 — immutable acquisition and mapping

The ingestion path should be:

`provider fetch → raw content-addressed artifact → typed normalization → identity resolution → evidence candidates / series partition → validation → governed promotion`

Raw bytes, request identity, adapter version, provider response headers, observed/retrieved times, and terms should be preserved. A normalization result must be replayable from the artifact and mapping digest.

### Layer 4 — two evidence planes

- **Semantic claim plane:** sparse, bitemporal, causal, governed facts and decisions.
- **Observation plane:** dense immutable time-series/tabular partitions with manifests, statistics, revisions, and column-level semantic bindings.

Both planes resolve through the same entity identities and definition revisions. A semantic result may cite a scalar claim, a dataset partition/range, or a computation across both.

The observation contract is correspondingly explicit:

```text
observe(subject_at_explicit_identity_level, field_definition_revision,
        economic_period, as_known_at_or_accession, dimensions,
        unit_or_currency, periodicity, calendar, fill_policy,
        corporate_action_policy, overrides, source, entitlement_context)
  → assertions + provenance
```

Provider-to-provider field equivalence is itself a revisioned governed assertion. Matching labels or mnemonics are not identity.

### Layer 5 — typed object view

Materialize `ObjectView<T>` at `(definition revision, valid_at, knowledge_cut, principal)` with:

- verified type membership;
- required/optional properties and typed links;
- selected belief plus rivals and the selection policy;
- series references rather than embedded high-volume observations;
- property-level classification/entitlement decisions;
- available governed Actions.

Then introduce an `ObjectSet<T>` plan pinned to definition revision, valid time, knowledge cut, belief policy, principal, filters, traversals, ordering, pagination, and aggregations. Policy and entitlement filtering must happen before candidate discovery so cursors do not leak hidden population structure.

### Layer 6 — verbs and effects

Separate two kinds of action rule:

- **Ontology edits:** accept/supersede an identifier assignment, select a preferred fact, annotate a conflict, create/link an object.
- **External effects:** place an order, submit a filing, message a person, update an ERP.

Both use Zoen's proposal/preview/policy/commit model. Only external effects enter the dispatcher/reconciliation lifecycle.

### Layer 7 — one meaning, many surfaces

Generate the same capability/object/action contracts into:

- `zoen data ...` and `zoen object ...` CLI verbs;
- Connect API;
- progressively disclosed MCP tools;
- Eve's human explanation;
- widget/view metadata.

Borrow OpenBB's progressive MCP discovery and workspace-context ergonomics. Require Zoen lineage and policy evidence underneath every result and action.

At the audited snapshot this remains a target, not a current parity claim: the CLI registry is static, and no tracked inbound Ontology MCP server implementation was found. The executable MCP path in the Rust product is a source/client connector to another MCP server.

## Adopt, adapt, reject

| Source | Adopt | Adapt | Reject |
|---|---|---|---|
| OpenBB | provider registry; transform/extract/transform; schema-to-REST/MCP/widget propagation; progressive tool discovery; vertical SEC methodology | make standardization semantic and versioned; require identity/time/unit/lineage/terms | endpoint tree as ontology; provider string as identity; open-ended extras as universal contract |
| Bloomberg/OpenFIGI | opaque stable IDs; venue/composite/share-class context; master-data links; field catalogs; entitlements | multi-scheme assignments with explicit resolution evidence; source-file trace plus Zoen causal lineage | vendor lock-in; licensed identifier as the internal object ID; assuming ticker uniqueness |
| Palantir | nouns + governed verbs + security; interfaces; materialized object views; data/stream/time-series separation | implement the smallest coherent subset compatible with Zoen's canonical JSON and evidence ledger | cloning Foundry's breadth or UI before the domain kernel exists |
| Zoen today | immutable bitemporal evidence; knowledge cuts; rivals; action state basis; effect reconciliation | add source-bound admission, property entitlements, identity master, object view, series plane | one scalar claim per market-data cell; latest commit as an implicit universal truth policy |

## Sequenced delivery

### Journey 0 — identity ambiguity, end to end

Given `ticker=IBM`, call OpenFIGI with venue/currency context; preserve all returned candidates and raw response digest; create candidate identifier assignments; require an Action to resolve the desired listing; query the resolved Listing and explain the decision.

Exit proof: two ambiguous candidates cannot silently collapse into one entity; replay from raw artifact yields the same candidates; history explains who resolved it, under which definition and policy.

### Journey 1 — one comparable price, two providers

Fetch one daily close from two providers for the resolved Listing. Bind currency, venue, date/calendar, adjustment basis, and provider observation time. Store raw artifacts and normalized evidence as rivals. Apply a published selection policy or explicit Action.

Exit proof: a query returns selected belief plus rivals; changing provider priority does not rewrite history; the output can be reconstructed from raw bytes and mapping version.

### Journey 2 — a real observation series

Ingest one year of daily OHLCV as immutable partitions and bind them to an `ObservationSeries`. Query a range through DataFusion without producing one authority commit per cell. Promote one derived metric (for example, 20-day volatility) as a claim with computation lineage into the series range.

Exit proof: range query, snapshot reproducibility, partition replacement as a new version, and causal explanation of the derived claim.

### Journey 3 — SEC fundamental fact

Ingest one company filing, preserve CIK/accession/XBRL concept/context/unit/period, normalize one line item with direct/imputed distinction, and validate an accounting identity.

Exit proof: the standardized value retains the original fact and derivation; a restatement becomes a new vintage rather than an overwrite.

### Journey 4 — entitlement-aware object/action

Apply provider/field purpose and redistribution constraints at property/series access. Render the same authorized object and Actions in CLI, API, MCP, and Eve.

Exit proof: unauthorized fields are not leaked through values, lineage, citations, errors, or generated tool descriptions.

### Journey 5 — corporate-action derivation

Preserve an unadjusted raw series; publish a split/dividend event with announcement, ex, record, pay, and effective times; derive an adjusted series that cites event, formula/component digest, mapping revision, and knowledge cut.

Exit proof: adjusted data never overwrites raw observations, and the derivation is reproducible under the exact action/event vintage.

### Journey 6 — multi-leg rebalance

Preview one governed rebalance plan, allow market state to make it stale, re-propose and approve, atomically commit the portfolio changes, dispatch broker effects, and reconcile an initially unknown provider result.

Exit proof: state decision and external order effects remain distinct, and every leg shares one governed operation basis.

### Journey 7 — provider schema evolution

Change a provider field or semantic mapping; report impact on accepted views, series, policies, Wasm capabilities, and generated surfaces; migrate, activate, and roll back while retaining old explanations.

Exit proof: historical results remain explainable under their original provider/field/mapping revisions.

### Journey 8 — surface parity

Generate the same permission-scoped object query and Action into CLI, Connect API, MCP, and Eve.

Exit proof: names, inputs, policy, valid/knowledge cuts, lineage, and effects agree across surfaces; no surface exposes a direct-mutation bypass.

## Decision gates

1. Do not integrate OpenBB wholesale until a clean-process AGPL decision is made. Its design can be studied; copying or embedding AGPL code into an MIT/network service has distribution implications that need counsel.
2. Do not promise Bloomberg equivalence without licensed content, a field entitlement model, and identity operations.
3. Do not call a provider-normalized row an ontology object until type membership, links, belief policy, and security are enforced.
4. Do not put dense price history into `semantic_claims`; land the series boundary first.
5. Do not admit provider evidence through caller-supplied `source_id` alone; bind a source-specific workload to raw CAS and a governed mapper.
6. Build the first vertical journey before a generic plugin marketplace or dashboard surface.

## Evidence ledger

Local reproducibility artifacts:

- OpenBB evidence register: `/private/tmp/zoen-openbb-deep.0N6mfl/openbb-lane/evidence-register.md`
- Re-runnable static audit: `/private/tmp/zoen-openbb-deep.0N6mfl/openbb-lane/audit_counts.py`
- Machine-readable audit output: `/private/tmp/zoen-openbb-deep.0N6mfl/openbb-lane/audit-counts.json`
- Finance specifications, cloned sources, and immutable captures: `/private/tmp/zoen-openbb-deep.0N6mfl/finance-lane`

### OpenBB source

- Provider registry contract: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/abstract/provider.py#L6-L54>
- Fetcher lifecycle: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/abstract/fetcher.py#L36-L85>
- Standard/extra classification: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/registry_map.py#L71-L181>
- Single-provider query path: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/app/query.py#L17-L80> and <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/query_executor.py#L12-L97>
- Standardization caveats: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/CONTRIBUTING.md#L119-L143>
- Flexible data model: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/abstract/data.py#L26-L85>
- Equity historical contract: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/standard_models/equity_historical.py#L17-L60>
- YFinance hidden semantics: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/providers/yfinance/openbb_yfinance/models/equity_historical.py#L23-L193>
- Intrinio identifier/time semantics: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/providers/intrinio/openbb_intrinio/models/equity_historical.py#L29-L74>
- General result/provenance envelope: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/app/model/obbject.py#L36-L62> and <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/provider/abstract/annotated_result.py#L10-L20>
- SEC methodology: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/providers/sec/openbb_sec/utils/STATEMENT_SCHEMA_README.md#L7-L105>
- Progressive MCP: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/extensions/mcp_server/openbb_mcp_server/app/app.py#L345-L549>
- ODP auth boundary: <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/api/auth/user.py#L12-L56> and <https://github.com/OpenBB-finance/OpenBB/blob/3e071fcc2cd9f891cac6040ae60296dba76dab46/openbb_platform/core/openbb_core/app/service/auth_service.py#L28-L76>
- Workspace parameter grouping: <https://github.com/OpenBB-finance/openbb-docs/blob/acd5b2bf2d8603f574bd6b2da2e15e1aae8b017d/content/workspace/developers/widget-parameters/parameter-grouping.md#L17-L59>
- Agent context and citations: <https://github.com/OpenBB-finance/openbb-ai/blob/9a2f0991002cd48d2d0bc5606498b52167a1c6fc/openbb_ai/models.py#L190-L266>, <https://github.com/OpenBB-finance/agent-rita/blob/f673c1fbeeeedfdbf4a253031d85eb8e96538924/src/agent/context.ts#L1-L128>, <https://github.com/OpenBB-finance/agent-rita/blob/f673c1fbeeeedfdbf4a253031d85eb8e96538924/src/protocol/citations.ts#L10-L126>
- 2026 open-source announcement: <https://openbb.co/blog/openbb-belongs-to-everyone/>

### Bloomberg / FIGI

- OpenFIGI overview: <https://www.openfigi.com/about/overview>
- OpenFIGI mapping API: <https://www.openfigi.com/api/documentation>
- OpenFIGI machine-readable schema: <https://api.openfigi.com/schema>
- FIGI allocation rules: <https://www.openfigi.com/docs/figi-allocation-rules.pdf>
- OMG FIGI specification: <https://www.omg.org/spec/FIGI/1.2>
- Bloomberg Data License: <https://professional.bloomberg.com/products/data/data-license/>
- Bloomberg Data License Plus unified model: <https://professional.bloomberg.com/products/data/data-license/dms/>
- BLPAPI documentation: <https://bloomberg.github.io/blpapi-docs/>
- BLPAPI Identity/entitlement API: <https://bloomberg.github.io/blpapi-docs/cpp/3.26.3/classBloombergLP_1_1blpapi_1_1Identity.html>
- Bloomberg HTTP field/error examples at pinned commit: <https://github.com/bloomberg/blpapi-http/blob/dc49f3ecdcb8b4807049129c998449c88bfcced2/doc/http-api-guide.md#L110-L269>
- SEC EDGAR APIs and frame semantics: <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
- IBM 2025 10-K filing used for the issuer/fact example: <https://www.sec.gov/Archives/edgar/data/51143/000005114326000010/ibm-20251231.htm>
- FIBO financial-instrument ontology at pinned commit: <https://github.com/edmcouncil/fibo/blob/119fa8c091aa4beece7d22aefa6fe138021a4355/FBC/FinancialInstruments/FinancialInstruments.rdf>
- FIBO listing and temporal ticker semantics: <https://github.com/edmcouncil/fibo/blob/119fa8c091aa4beece7d22aefa6fe138021a4355/SEC/Securities/SecuritiesListings.rdf#L133-L192> and <https://github.com/edmcouncil/fibo/blob/119fa8c091aa4beece7d22aefa6fe138021a4355/SEC/Securities/SecuritiesIdentification.rdf#L395-L417>

### Institutional standards

- BCBS 239 consolidated principles: <https://www.bis.org/committees/bcbs/basel-framework/standard/srp/36/inforce/2019-12-15/published/2019-12-15>
- 2026 BCBS implementation update: <https://www.bis.org/publications/implementation-principles-effective-risk-data-aggregation-and-risk-reporting-bcbs-239-principles>
- GLEIF access, Level 1/Level 2, formats, and delta files: <https://www.gleif.org/en/lei-data/access-and-use-lei-data>
- GLEIF relationship format and validation provenance: <https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-relationship-record-rr-cdf-2-1-format>
- GLEIF data-quality checks: <https://www.gleif.org/en/lei-data/gleif-data-quality-management/data-quality-checks>
- ISO 20022 repository/business model: <https://www.iso20022.org/iso20022-repository/business-model>
- FINOS CDM event model: <https://cdm.finos.org/docs/event-model/>
- W3C PROV-O: <https://www.w3.org/TR/prov-o/>
- W3C PROV constraints: <https://www.w3.org/TR/prov-constraints/>

### Palantir

- Ontology system: <https://www.palantir.com/docs/foundry/architecture-center/ontology-system>
- Ontology overview: <https://www.palantir.com/docs/foundry/ontology/overview>
- Object permissioning: <https://www.palantir.com/docs/foundry/object-permissioning/overview>
- Object security policies: <https://www.palantir.com/docs/foundry/object-permissioning/object-security-policies/>
- Interfaces: <https://www.palantir.com/docs/foundry/interfaces/interface-overview>
- Link types: <https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/>
- Object sets: <https://www.palantir.com/docs/foundry/functions/api-object-sets/>
- Actions: <https://www.palantir.com/docs/foundry/action-types/overview/>
- Time-series architecture: <https://www.palantir.com/docs/foundry/time-series/time-series-overview>
- Ontology SDK: <https://www.palantir.com/docs/foundry/ontology-sdk/overview/>
- Ontology MCP: <https://www.palantir.com/docs/foundry/ontology-mcp/overview/>
- Object edits: <https://www.palantir.com/docs/foundry/object-edits/overview>

### Zoen local evidence

- Product invariant: `/Users/enzotironi/Code/OS/README.md:6`
- World/evidence wire contract: `/Users/enzotironi/Code/OS/proto/zoen/world/v1/world.proto:7`
- Evidence admission: `/Users/enzotironi/Code/OS/crates/zoen-engine/src/admission.rs:86`
- Semantic query/rival lineage: `/Users/enzotironi/Code/OS/crates/zoen-engine/src/action/state_basis.rs:145`
- Type query inference: `/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:916`
- Evidence batch writes: `/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:31`
- One commit/outbox row per new claim: `/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:246`
- One shared commit for an Action's semantic effects: `/Users/enzotironi/Code/OS/crates/zoen-adapters/src/action_store/commit.rs:161`
- One shared commit for a Scenario package: `/Users/enzotironi/Code/OS/crates/zoen-adapters/src/scenario_store.rs:297`
- Full Parquet projection rebuild: `/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:69`
- Exact projection-role allowlist: `/Users/enzotironi/Code/OS/crates/zoen-adapters/src/authority_store.rs:128`
- Projection supervisor rejects ambient authority credentials: `/Users/enzotironi/Code/OS/apps/zoend/src/bin/zoen-projection.rs:22`
- Projection role grants: `/Users/enzotironi/Code/OS/crates/zoen-adapters/migrations/0027_projection_role_boundary.sql:17`
- Exact-instant point query behavior: `/Users/enzotironi/Code/OS/crates/zoen-adapters/src/claim_store.rs:90`
- Per-entity read policy: `/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:130`
- Current source demo mapping: `/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2301`
- Static CLI registry and outbound/source MCP connector: `/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:120` and `/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2116`

## Limitations

- Bloomberg Terminal and Foundry are proprietary; conclusions are bounded to official public documentation and public SDK behavior. Internal implementations are not asserted.
- Static repository counts describe pinned source trees, not installed providers, runtime availability, data quality, or commercial coverage.
- OpenBB announced future permissive releases one week before this research. Repository visibility and licenses can change quickly; re-audit before reuse.
- The Zoen HEAD advanced from `07fea4c` through `41c5392` and `605927d` to `e34445c` while parallel research was running. The final delta strengthened the projection credential/role boundary and changed its default poll interval, but retained the full-snapshot projection algorithm; the evidence, identity, link, accepted-view, query, and surface findings remained unchanged. The working tree also contained unrelated user changes/untracked files during the audit; no Zoen product files were modified by this research.
- This is architecture/product research, not legal advice. License and data-entitlement decisions require counsel and provider agreements.
