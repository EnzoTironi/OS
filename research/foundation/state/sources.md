# Sources for issue 12

**Kind:** source-system artifact catalog  
**Fetched:** 2026-08-16  
**Decision:** n/a for the catalog itself. Claims built from these pages live in [evidence.md](evidence.md).

Only pages retrieved or confirmed in this session are listed. Memory is not a source.

## OS documents read this session

These are local repo files, not external corpora.

| Path | Use |
| --- | --- |
| `docs/thesis.md` | Current state should be explainable. Pure event sourcing is not assumed. |
| `docs/constitution.md` | Current state must be explainable where it matters. Mutation must be explicit. |
| `docs/open-questions.md` | Q6 on mutable state. Cited, not edited. |
| `docs/research-program.md` | Inventory quantity as fact versus projection. |
| `docs/swarm-research-backlog.md` | Agent output contract used for this folder. |
| `rfcs/0001-metamodel-hypothesis.md` | Fact/Event candidates. Not edited. |
| `scenarios/README.md` | S-007 backdated stock. S-010 cancellation after irreversible consequences. |
| `research/README.md` | Evidence note template and clean-room posture. |
| `research/reference-landscape.md` | Palantir, ERPNext, Odoo, XTDB pointers. Not treated as primary evidence. |
| GitHub issue #12 body | Question, compare list, deliverables. |

`docs/swarm-result-contract.md` is not on `origin/main`. This folder follows the backlog contract instead.

## First-party pages fetched this session

### ERPNext / Frappe

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext | 2026-08-16 | Current immutable-ledger behavior, reversals, Repost Item Valuation, closed periods. Updated 2026-08-14. |
| https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger | 2026-08-16 | Draft versus submit. GL, Payment Ledger, Stock Ledger. Commitment documents versus ledger documents. Updated 2026-07-30. |
| https://docs.frappe.io/erpnext/perpetual-inventory | 2026-08-16 | Stock transaction posts GL. Disable perpetual inventory and users must post stock-in-hand manually. Updated 2026-02-27. |
| https://docs.frappe.io/erpnext/stock-reservation | 2026-08-16 | Stock Reservation Entry as an explicit allocation document. Updated 2026-03-02. |
| https://docs.erpnext.com/docs/user/manual/en/immutable-ledger-in-erpnext | 2026-08-16 (search snippet plus page title) | Older v13 wording. Reverse on cancel. Backdated stock blocked. Used only as historical contrast with the 2026 Frappe page. |
| https://docs.erpnext.com/docs/user/manual/en/stock-ledger | 2026-08-16 (search snippet) | Stock Ledger Report attributes. Balance quantity and valuation rate from movements. |

### Odoo

Odoo is LGPL. Concepts and documented user behavior only. No implementation was copied.

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/using_inventory_valuation.html | 2026-08-16 | Automated valuation. Valuation smart button on PO/DO. Stock Valuation dashboard. Manual revaluation. Journal entries for valuation. |
| https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/reporting/moves_history.html | 2026-08-16 | Moves History. Status values Done, Available, Partially Available. Filters for in-progress versus done. |
| https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/reporting/aging.html | 2026-08-16 (search snippet) | Stock valuation layer (SVL) created when a warehouse operation is validated. |
| https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/inventory_valuation_config.html | 2026-08-16 (search snippet) | Automatic valuation. Each new SVL can generate a journal entry. |

Odoo 18 `stock.move` field help was inspected only as a public model docstring on GitHub to confirm documented status names. That is a source-system artifact, not a license to reuse code.

### Event sourcing and CQRS

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://martinfowler.com/eaaDev/EventSourcing.html | 2026-08-16 | Event log plus application state. Rebuild, temporal query, replay. Official record may be the log or the current state. |
| https://martinfowler.com/articles/201701-event-driven.html | 2026-08-16 | Event notification, event-carried state transfer, event sourcing, CQRS as distinct patterns. Event store as principal source of truth is the ES test. |
| https://martinfowler.com/bliki/CQRS.html | 2026-08-16 | Separate command and query models. Often harmful if applied to a whole system. Reporting database is a weaker alternative. |

### Datomic

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://docs.datomic.com/datomic-overview.html | 2026-08-16 | Database is a set of immutable datoms. Entity is a point-in-time projection. Log is indelible. |
| https://docs.datomic.com/reference/filters.html | 2026-08-16 | `as-of`, `since`, `history`. "The Present Pays No Penalty." Entity cannot be built from a history database. |
| https://docs.datomic.com/transactions/transaction-functions.html | 2026-08-16 (search snippet) | `:db/cas` compare-and-swap against current value. |
| https://docs.datomic.com/client-tutorial/history.html | 2026-08-16 (search snippet) | History query returns assertions and retractions. |

### XTDB

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://docs.xtdb.com/about/time-in-xtdb.html | 2026-08-16 | Default SQL looks atemporal. Valid time and system time. Current-state indexes separate from history. |
| https://docs.xtdb.com/concepts/key-concepts.html | 2026-08-16 | Row versions. `_id` plus temporal columns. Mentions event sourcing as a related developer idea, not as the required write model. |

### Palantir Foundry Ontology

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://palantir.com/docs/foundry/action-types/overview/ | 2026-08-16 | Actions change object properties and links. Writeback / current object data is the operational product. |
| https://palantir.com/docs/foundry/object-link-types/derived-properties/ | 2026-08-16 | Derived properties calculated at runtime from linked objects. Read-only. Not editable by Actions. |
| https://palantir.com/docs/foundry/object-backend/overview/ | 2026-08-16 | Funnel indexes datasources plus Action edits. Object databases serve current objects. Actions can produce an action log. |
| https://palantir.com/docs/foundry/object-backend/osv1-osv2-migration/ | 2026-08-16 (search snippet) | OSv2 materializations are optional. User edits do not require a writeback dataset. |
| https://palantir.com/docs/foundry/object-backend/object-storage-v2-breaking-changes/ | 2026-08-16 (search snippet) | OSv2 user edits only via Actions. Materializations renamed from writeback datasets. |

### ValueFlows

| URL | Retrieved | What it is |
| --- | --- | --- |
| https://www.valueflo.ws/specification/all_vf/ | 2026-08-16 (search snippet plus spec text) | `onhandQuantity` and `accountingQuantity` may be stored or derived from economic events. |
| https://www.valueflo.ws/concepts/actions/ | 2026-08-16 | Action effects on onhand and accounting quantities. `raise` / `lower` for counts and opening balances. |
| https://www.valueflo.ws/specification/model-text/ | 2026-08-16 (search snippet) | EconomicResource accounting properties updated only by EconomicEvents. Events can correct prior events. |

## Sources seen but not treated as primary

| Item | Why not primary |
| --- | --- |
| ERPNext GitHub issue #52618 (reservation redesign proposal) | Proposal, not shipped behavior. |
| Third-party ERPNext/Odoo blogs | Secondary restatements. |
| Odoo Python models | Copyleft implementation. Used only to confirm public field help already reflected in user docs. |
| `research/reference-landscape.md` | Prior OS note, not a first-party corpus page. |

## Clean-room note

No ERPNext or Odoo source was pasted or translated into this repo. Documented posting, cancellation, reservation, and valuation behavior is recorded as concepts.
