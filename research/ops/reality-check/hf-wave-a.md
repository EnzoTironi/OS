# Real-company reality check — HF operational evidence vs Wave A

- Artifact ID: `issue-0077-hf-reality-check`
- Issue: <https://github.com/EnzoTironi/OS/issues/77>
- Track: research operations / real-company evidence
- Date: 2026-08-16
- Decision: none. This is evidence against/for Wave A hypotheses, not an HF ontology and not an OS architecture decision.
- Privacy: de-identified at the person level. Raw customer files are **not** committed to OS.

## Question

Where do Wave A candidate laws survive, weaken, or break when confronted with a real company whose operations are spread across spreadsheets, ERP exports, marketplaces, reports, formulas, messaging, and human interpretation?

The test is **not** whether OS can import an XLSX. It is whether the semantic distinctions are capable of describing what operators actually mean without inventing events, identities, authority, or precision that the source evidence does not contain.

## Evidence provenance and limitation

This report reuses the completed HF source-truth audit and meeting/process observations performed against the company's supplied artifacts before the OS Wave A integration. The prior audit recorded raw-file hashes as unchanged while reviewing eight raw source files, 68 workbook sheets and two PDFs. Its classification produced 23 `PROVISIONAL`, 18 `BLOCKED`, and 27 `NOT_CANONICAL` source surfaces, plus 25 explicit findings (11 FAIL, 6 WARN, 8 PASS).

The current ChatGPT Library connector returned `401 Unauthorized`, and the raw source files are not mounted in this runtime. Therefore this artifact **does not claim a fresh byte-for-byte re-extraction on 2026-08-16**. It preserves only concrete observations already recorded from the prior audit/process review. Anything not present in that evidence remains `undetermined` rather than reconstructed from memory.

This limitation is itself useful: synthesis must be able to distinguish `real-company-evidence from a prior audited extraction` from `fresh executable verification`.

## Source families used

The earlier HF review covered, among others:

- `Vendas maio a agosto.xlsx`
- `TABELA DE PREÇOS MERCADO ONLINE 2026.xlsm`
- `respostas-ontologia-hf.json`
- `Relatorio_Vendas_HF_2026-08-10 (HF).pdf`
- `PLANILHA ESTOQUE HF AGOSTO 2 2026.pdf`
- `NOVA PLANILHA DE ANÁLISE HF SP - 11-08-2026.xlsx`
- `DB GLOBAL.xlsx`
- `calculadora_firmare_2.html`
- `Base de custos e códigos.xlsx`
- `Acompanhamento de vendas concorrentes 2026.xlsx`
- process/meeting notes describing the actual listing, pricing, cost, finance and cross-sector workflows.

`respostas-ontologia-hf.json` is treated as elicited knowledge/answers, **not** automatically as operational truth. PDFs are snapshots/reports, not transaction ledgers. Formula workbooks are executable business knowledge but not automatically authoritative records.

# Observed reality

## E-RC-001 — sales rows are aggregates, not order lines

The audited sales material contains rows aggregated by marketplace listing, date and unit price rather than a stable order/line identity. A prior reconciliation reported:

- 6,259 analyzed sales rows;
- approximately R$ 4.12 million gross value;
- 16,984 units;
- `vendas.xlsx` lineage: 3,263 / 3,263 rows matched `DB VENDAS GLOBAL`;
- `VENDAS MÊS` lineage: 18,460 matches against `DB VENDAS GLOBAL`, about 95.9% in the recorded SP slice.

The audit explicitly warned not to sum lineage-equivalent bases as though they were independent transactions.

**Implication:** `MarketplaceSalesAggregate` is evidenced. `OrderLine` is **not** evidenced by these rows because the source lacks a stable order-line identity at this grain.

## E-RC-002 — one physical/business product participates in several source identities

`DB GLOBAL.xlsx`/related global-base sheets mix listing/account/product/internal code/cost/classification concerns in rows intended for operational analysis. Earlier audit statistics recorded:

- 5,392 listing IDs filled;
- 5,326 in Mercado-Livre-style `MLB...` format;
- 5,237 unique IDs;
- 5,046 listings comparable across the audited global-base lineage.

The same operational product can be represented by an internal code/SKU and multiple marketplace listings/accounts. Marketplace listing creation also happens independently enough that a product can exist in ERP but never be listed, while a listing can be created and the ERP registration be forgotten.

**Implication:** `Product`, `SellableSKU` and `MarketplaceListing` cannot safely be collapsed by source-row convenience. Their exact OS encoding remains open.

## E-RC-003 — identity resolution has real ambiguity, not just missing joins

The earlier extraction produced 38 automatic SKU/code repairs affecting roughly R$153.2k of sales; at least one repair had confidence `0.333`. Suffix conventions such as `.1/.2` were explicitly disputed in prior analysis (`meters` vs another interpretation). Composite codes also exist.

The cost audit recorded 1,961 rows for 1,960 codes and a duplicated code `PP140010` with different cost/semantic context; five codes were recorded as composite.

Additional coverage gaps included:

- `Medidas de caixas`: 30 codes, with `CXA0047` incomplete;
- `BD METAL FORT`: 174 PA codes, only 66 represented in the cost source at the audited scope.

**Implication:** a join succeeding syntactically does not prove identity. Candidate bindings need provenance/confidence and ambiguity must survive until resolved. Auto-repair is a research/operational decision, not ontology truth.

## E-RC-004 — missing cost is not zero and “cost” has version/source semantics

Costs are read from both ERP and spreadsheet in the actual workflow. The purchasing role updates spreadsheet costs on roughly a 15-day cadence and also creates new product records in ERP. The audit found missing-cost cases; a prior extraction identified three no-cost sales lines totaling R$1,871.60. An earlier POC had incorrectly materialized missing costs as `unit_cost = 0`.

Cost sheets also expose dated/time-stamped cost records and formula-derived structures rather than one timeless scalar.

**Implication:** `missing`, `unknown`, `not-applicable` and numeric zero are different. A cost used in a historical decision must identify source/effective basis; `Product.cost` as an unqualified mutable scalar loses real information.

## E-RC-005 — pricing is a calculation/decision family, not one price field

The real operation contains distinct pricing concerns:

- manual price changes on Mercado Livre and Shopee;
- list/marketplace price calculations;
- cost inputs;
- tax/financial cost;
- commission;
- freight;
- target margin;
- competitor-observed prices.

The audited `.xlsm` material contains business rules in formulas. A process note reports a marketplace cost/price spreadsheet with product/variation-specific commission and freight calculations. Competitor tracking records seller/brand/product/price/quantity/freight observations.

**Implication:** cost, pricing policy, calculated recommendation, channel offer/listing price, accepted transaction price and competitor observation are distinct statement kinds. Formula lineage is business evidence and should not be flattened into a final scalar without basis.

## E-RC-006 — inventory sources mix position, flow, plan and demand

The stock PDF visibly contains bare product codes and distinct columns for `ENTREGA`, several dated `SAIDA` fields, `DEVOLUÇÃO`, `VENDAS`, and `ESTOQUE SEMANA ATUAL`. Recorded examples include:

- code `03`: 511 initial, 15 exits, 496 remaining;
- code `50`: 147 initial, 39 exits, 108 remaining.

Other audited workbook surfaces mix current stock, exits, costs, cubage, product codes, order/demand summaries and transfer/planning concepts. `GIRO SÃO PEDRO` contained 17,107 observations and 60 duplicate `CI + date` combinations. `QTD PEDIDOS` mixed date/shift summary with demand by marketplace listing. `GERAÇÃO PRODUÇÃO TOTAL` looked like requirement explosion/planning output rather than a submitted production order.

**Implication:** one generic `stock` or `inventory row` is false to the evidence. At minimum the model must keep **observed position**, **movement/flow**, **reservation/commitment if evidenced**, and **planning/demand** separable. The files do not prove that every current position is reconstructable from a complete movement ledger.

## E-RC-007 — current state is sometimes a snapshot because event history is incomplete

Some spreadsheets/PDFs are operational snapshots. The source-truth audit explicitly classified surfaces as provisional/blocked/not-canonical and warned that PDFs are snapshots rather than ledgers. Therefore synthesizing a fake movement history to explain every current quantity would invent facts.

**Implication:** `current state should be explainable` remains a product goal, but the ingestion ontology must support an **observed state/position with provenance** when historical events are missing. Reconstructability cannot be retroactively fabricated.

## E-RC-008 — source authority is per statement/action, not per file

Several systems participate in one operational chain: ERP, Bling, marketplace accounts, spreadsheets and human workflows. Real cases show asymmetric ownership:

- product registration is expected in ERP;
- listings are manually created/edited in marketplaces;
- prices are manually changed in marketplaces;
- costs are consulted in ERP **and** spreadsheet;
- a marketplace listing can exist without its expected ERP product registration and vice versa.

A separate operational incident reported a listing paused in an integration hub that later became active again in Mercado Livre, with no usable logs found in either interface during debugging.

**Implication:** `file/system X is authoritative for the Product` is too coarse. Authority/provenance must be scoped to statement kind/action/context. External state may need observation and reconciliation rather than automatic overwrite.

## E-RC-009 — business knowledge lives outside systems of record

Reported operational practice includes:

- manual creation of marketplace listings after product registration;
- manual listing edits;
- manual price changes;
- product photography and image editing when assets are missing;
- separate people responsible for listings and pricing;
- purchasing role updating costs periodically and creating new products;
- more than 30, and in another meeting estimate more than 40, WhatsApp groups coordinating sectors, decisions, documents, informal approvals and production follow-up;
- financial batches where descriptions such as `parafuso` still require a person to decide whether the item is use/consumption, kit component or direct input;
- Power BI/reporting views that still require data treatment/recalculation to answer product-volume questions.

**Implication:** “the ERP row is the company” is empirically false here. Observations, human classifications, informal decisions, documents/messages and derived analytics all carry operational meaning.

## E-RC-010 — marketplace/customer-facing reporting has narrower scope than enterprise truth

The sales PDF is explicitly a Mercado Livre sales summary and was recorded as updated through 09/08/2026. It is an executive/reporting snapshot, not an enterprise transaction ledger. Actual sales span multiple marketplace accounts plus internal sales, and combining them requires treatment/interpretation.

**Implication:** a dashboard/report artifact must preserve its scope and derivation. It cannot silently become the source of universal `Sale` truth.

# Candidate-law impact matrix

| Wave A pressure / candidate | Real-company result | Why |
| --- | --- | --- |
| `Product == SKU == Listing` | **broken** | ERP/product identity and marketplace listings diverge in lifecycle and multiplicity; listing can exist without expected ERP registration and vice versa. |
| Source row/class is ontology entity | **broken** | global sheets mix several concerns; sales rows are aggregates; PDFs are reports; formula workbooks encode logic. |
| Every sales row is `OrderLine` | **broken for these sources** | aggregate grain lacks stable order-line identity. |
| Missing numeric value may safely default to zero | **broken** | missing costs exist; zero would fabricate economics. |
| Identity binding can be auto-fixed from string conventions | **broken as unconditional rule** | low-confidence repairs and ambiguous suffix semantics exist. |
| One current `cost` scalar | **broken** | ERP + spreadsheet + dated cadence/formulas; historical basis matters. |
| One `price` scalar | **broken** | cost, policy/calculation, channel price, transaction price, competitor observation differ. |
| One `stock` quantity/row | **broken** | position, flow, return, sales, demand and planning appear separately/combined. |
| Current inventory must always reconstruct from stored events | **not supported by current data** | snapshots exist without complete event history. Preserve observed position rather than invent events. |
| Observation == occurrence | **broken** | reports, market observations, financial classifications and stock snapshots report/interpret reality; they are not necessarily the underlying business occurrence. |
| Last source write can become canonical truth | **broken** | multiple systems/humans own different slices and can disagree/lag. |
| One system/file is authoritative for an entity | **weakened strongly** | authority is split by product registration, listing, price, cost, external marketplace state and human decisions. |
| Action-only is the universal persistence API | **broken** | external/manual observations and marketplace state enter without an OS Action. Named Actions remain useful for OS-governed decisions. |
| Every approval/decision is already structured in ERP | **broken** | messaging groups and human interpretation carry decisions/approvals outside formal systems. |
| Bitemporal fields must exist on every source value | **not supported** | source time/date quality varies. Preserve actual occurrence/effective/record knowledge when evidenced; do not fabricate missing clocks. |
| Requested / committed / planned / actual delivery dates are all evidenced in the structured files | **undetermined** | planning/delivery/exit fields exist, but this slice does not establish a clean four-way mapping. Messages may contain requests/promises; no universal mapping is claimed. |
| One global ontology vocabulary is therefore impossible | **not proved** | the data proves overloaded source vocabulary is dangerous; it does not decide scoped modules vs federation vs one compositional ontology. |
| Semantic second kernels are required | **not proved** | deterministic formulas exist, but that does not establish a second semantic authority beneath the ontology. |
| Real operations require provenance | **strongly supported** | duplicated lineage, source overlap, manual interpretation, snapshots and low-confidence identity repairs are uninterpretable without source/basis. |

# Smallest justified semantic pressures

The real-company slice justifies **questions/requirements**, not new primitives:

1. **Statement kind matters.** Position, movement, aggregate sale, competitor observation, cost observation, price decision and report are not interchangeable.
2. **Stable business identity and source identity must be separable.** A marketplace listing ID, internal code/SKU, product specification and source-row identity can coexist.
3. **Bindings need provenance and uncertainty.** A guessed SKU repair must not become permanent truth merely because it made a join succeed.
4. **Observed current state must be representable without fabricated history.** Later reconciliation can connect it to events when evidence exists.
5. **Authority is scoped.** Ask who/what may assert/change a specific statement/action in a context, not “which file owns the entity?”
6. **Missing ≠ zero.** Unknown/absent/not-applicable semantics need to survive typed calculations.
7. **Derived business values need basis.** Cost/price/reporting results need formula/rule/input/version provenance where decisions depend on them.
8. **Human and message-derived evidence are legitimate sources but not automatically authoritative facts.** Classification/approval provenance matters.

None of those statements proves that `Fact`, `Observation`, `Role`, `Relator`, `Event`, `Projection`, `AuthorityPolicy`, or any other candidate must be a base metamodel primitive. They are pressure the eventual model must satisfy compositionally or natively.

# What this real-company check breaks in our research process

It also attacks the research process itself:

- A source-truth audit can produce thousands of machine-detected “issues”; those are not automatically ontology disagreements.
- Referential integrity after auto-fixing identifiers proves the **materialized mapping**, not the real identity semantics.
- A clean canonical table produced by ETL can hide uncertainty that operators still experience.
- A real company cannot wait for every source to become event-complete before being modeled; snapshots and incomplete provenance are part of the starting reality.
- Customer-specific source names/columns must remain adapters/research evidence, not leak into the generic engine.

# Open gaps

This report intentionally leaves these unresolved:

- Fresh byte-level rerun of all mandatory files in the current session (Library access was unavailable).
- Extraction of actual requested/promised/planned/actual date claims from messaging + order/production evidence at a common identity grain.
- Full movement-level proof for inventory reconstruction.
- Formal source/action authority matrix across ERP, Bling, integration hubs, each marketplace account and manual spreadsheet workflows.
- Historical versioning semantics of every cost/price formula.
- Whether the observed identity ambiguities demand a native `Claim/Observation/Binding` primitive or are safely composable from smaller forms.

These are not reasons to reject the reality check; they are exactly the uncertainty #77 requires us to preserve.

# Verdict

The real HF evidence **supports the direction of modeling the world rather than copying ERP/spreadsheet schemas**, but it rejects several over-generalizations already found in Wave A:

- do not equate records with occurrences;
- do not invent complete event history behind snapshots;
- do not auto-promote successful joins to identity truth;
- do not make one file/system universally authoritative;
- do not collapse cost/price/inventory/sales into convenient mutable scalar fields;
- do not assume structured systems contain all operational decisions.

Most importantly, the reality check does **not** validate a particular metamodel. It makes the acceptance bar harder: a candidate OS model must preserve ambiguity, provenance, partial observations, scoped authority and human/external decisions **without becoming source-shaped**.
