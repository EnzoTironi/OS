# Matrix

**Kind.** reference. Each cell is domain evidence, source-system artifact, or a named gap.  
**Decision state.** Convergence `supported` where at least two independent families agree. Divergence stays `undetermined` until a later pass explains it.

## Write class versus source family

| Write class | Palantir | Frappe / ERPNext | Odoo | Moqui | ValueFlows | GS1 EPCIS | Derived / sync literature |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 Decision | Action apply. E-001 | submit, cancel, amend. E-005 E-006 | Apply, Relocate, button methods. E-008 | Named services, status flow. E-010 | Intent and Commitment, not Event | Capture workflow may decide. Event is still the persist | Command in event sourcing. E-013 |
| W2 Observation | Weak. Later sync or another Action writes objects. Issue 7 | Receipt and delivery documents, then ledger rows | Counted column before Apply | AssetDetail diffs via sibling 18 | EconomicEvent. E-011 | ObjectEvent, including OBSERVE. E-012 | Domain event append |
| W3 Replica | Funnel from datasets and streams. E-002 | Data Import, third-party sync, not studied in depth | External connector writes, not studied | Entity XML load | Not a VF concept | Partner query and document exchange | Replica apply, outbox consume |
| W4 Derived | Indexed object DB over datasources | Reports, repost tools | `stock.quant` stored, sibling 18 marks artifact | `quantityOnHandTotal` derived, sibling 18 | Resource quantities "for performance" | Query over event store | Fowler rebuild, PG matview. E-013 E-014 |
| W5 Collaborative draft | Not examined | Draft save, comments | Draft orders | EntityValue dirty fields | Plan composition | Not applicable | Yjs applyUpdate. E-015 |
| W6 Admin | Ontology Manager, action-type definition | Customize Form, Property Setter, DocType | `ir.model.fields` | Entity definitions, services | Recipe and knowledge layer | Master data, slowly changing | Schema migration |
| W7 Bulk / cutover | 10k objects per Action cap. E-002 | Data Import, ignore flags. E-007 | Import wizard | Entity XML, store# | Not specified | Batch EPCIS Document | Opening balances as events |
| W8 Maintenance | Reindex, edit migration after schema break. E-002 | Repost Item Valuation | Recompute state on write. E-009 | cache refresh | Recalculate resource fields | Compact event DB | VACUUM, REFRESH, snapshot |
| W9 Generic CRUD | Thin Edit-property Actions. E-021 | `save` on draft, `db_set` escape. E-007 | ORM `write()` | Implicit `update#Entity`. E-010 | Not the VF style | Master-data maintenance | JSON Patch, REST PUT |
| W10 Telemetry | Streaming datasources. E-002 | Not a native path | IoT modules exist, not examined | Not examined | Not the VF layer | sensorElementList on events. E-012 | Time-series append |

## Convergence

Independent families agree on these cuts. Decision state `supported`.

1. Attempted intervention is not observed occurrence. Palantir Action, VF Event, ERPNext submit versus ledger, GS1 visibility event, issue 7 L-005, issue 56 L-P-02.
2. Posted or observed history is not updated in place. ERPNext immutable ledger, VF `corrects`, Odoo refusal to change UoM on a done move, issue 56 L-P-04.
3. Current quantity and many statuses are projections or consequences. Sibling 18, VF resource quantities, Fowler rebuild, PG matview.
4. There is more than one write path into "current objects." Palantir Funnel plus Actions. Frappe save versus submit versus db_set. Moqui Entity Facade versus Service Facade.
5. Draft composition is looser than commit. Frappe docstatus 0. Odoo counted-before-Apply. Accounting compose-before-Post. Yjs until a later business commit.

## Divergence

These disagreements are research questions. Decision state `undetermined`.

1. Palantir still presents Actions as how users change objects, while Funnel changes objects without users. Is the Action slogan about surfaces, or about all persists?
2. Moqui wraps generic CRUD as implicit services. Palantir wraps generic edits as Action types. Frappe lets draft `save` be generic and then locks submit. Three answers to "is CRUD an Action?"
3. ValueFlows `Action` is a verb on a flow. Palantir `Action` is a mutation transaction. Same English word. Opposite job. Issue 7 D-001.
4. Odoo stores `stock.quant` as if on-hand were a row. ERPNext writes stock ledger entries and reports quantities. Sibling 18 already called the stored quant a source artifact.
5. GS1 action ADD/OBSERVE/DELETE is an event field, not an OS Action type. Easy to mis-map.

## Source artifacts. Do not promote

**Kind.** source-system artifact  
**Decision state.** `rejected` as OS primitives

- Palantir Funnel, OMS, Action Log object type, writeback webhook, 10k-objects-per-Action
- Frappe `docstatus`, `db_set`, `allow_on_submit`, `ignore_permissions`
- Odoo `write()`, `stock.quant`, Inventory Reason string
- Moqui `create#Entity`, Entity Facade `create()`, `StatusFlowTransition`
- ValueFlows flow `Action` enum
- GS1 ObjectEvent `action` ADD/OBSERVE/DELETE
- PostgreSQL `REFRESH MATERIALIZED VIEW`
- Yjs `applyUpdate`, state vector
- Fowler "complete rebuild"

## What would look like agreement and is not

A thin `EditObject` Action in every product would look like convergence on Action-only. E-021 shows that wrapper can be a property list with a name. Convergence on a wrapper is not convergence on a business verb. L-AM-11.
