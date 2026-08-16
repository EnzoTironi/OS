# Evidence

Each card names a kind and a decision state. Limits stay on the card. Thesis and RFC sentences are hypotheses to attack, not observations.

## E-001 Palantir Action is a user-edit transaction

**Kind.** source-system artifact  
**Decision state.** `supported` as Palantir's documented user-write path

An action type is the definition of a set of object, property, and link edits a user can take at once, plus side effects. Applying an action is a single transaction that changes one or more objects. Palantir's own pitch is that users think about objectives instead of property edits.

Citation. Palantir, Action types overview, accessed 2026-08-16, <https://palantir.com/docs/foundry/action-types/overview/>

Limits. Product documentation, not runtime source. "Transaction" here is Foundry's object-edit transaction.

## E-002 Palantir Funnel writes objects from datasources without Actions

**Kind.** source-system artifact, and a counterexample to universal Action-only  
**Decision state.** `supported` as a second write path in the same product

Object Data Funnel "reads data from Foundry datasources (such as datasets, restricted views, and streaming datasources) and user edits (from Actions) and indexes these data into object databases." It also "ensures that indexed data is kept up-to-date as the underlying datasources update." Streaming datasources are a first-class indexing path. User-edit throughput is capped around 10,000 objects per Action. Indexing throughput is "tens of billions of objects for a single object type."

Citation. Palantir, Ontology backend overview, accessed 2026-08-16, <https://palantir.com/docs/foundry/object-backend/overview/>

Limits. Funnel is Foundry plumbing. The domain fact still stands. The product that popularized Action-first does not put every object write through an Action.

## E-003 Palantir edit history is source-agnostic

**Kind.** source-system artifact  
**Decision state.** `supported` as an admission that edits have more than one source

A Palantir engineer wrote that edit history is "intrinsic to the object itself - rather than a side effect of the action writing the edit - so any edits are captured, regardless of their source." Action Logs are a separate object type created when a paired Action runs.

Citation. Palantir Developer Community, Edit History vs Action Logs, <https://community.palantir.com/t/edit-history-vs-action-logs/2890>

Limits. Community post, not a spec. Still a first-party operator drawing the same split as E-002.

## E-004 Palantir writeback is ordered, not jointly atomic

**Kind.** source-system artifact  
**Decision state.** `supported` as Action versus external effect, not as a write-class kill

Writeback webhooks run before object changes. Side-effect webhooks run after. Palantir states it is still possible that the external request succeeds and Ontology changes fail.

Citation. Palantir, Action types webhooks, <https://palantir.com/docs/foundry/action-types/webhooks/>

Limits. Already covered by issue 7 L-004. Kept here because Action-first does not make a dual write one fact.

## E-005 ERPNext draft save is not submit

**Kind.** domain evidence  
**Decision state.** `supported`

A draft normally has no ledger effect. Submission validates posting date, company, currency, accounts, and debit-credit balance, then creates ledger entries. Frappe docstatus is draft 0, submitted 1, cancelled 2. Submitted and cancelled documents cannot be edited except fields marked allow-on-submit.

Citation. Frappe, How transactions affect the ledger, <https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger>. Frappe, Docstatus, <https://docs.frappe.io/framework/user/en/basics/doctypes/frameworktatus>

Limits. Frappe's three integers are a source encoding. The domain split is draft composition versus posting.

## E-006 ERPNext immutable ledger forbids in-place posted mutation

**Kind.** domain evidence  
**Decision state.** `supported`

From v13, GL and stock ledger rows are not deleted on cancel. Reverse entries cancel the effect on the cancellation date. Cancelled transactions linked to ledger rows cannot be deleted. Backdated stock posts after a later timestamp are refused because future rows cannot be silently rewritten.

Citation. ERPNext, Immutable Ledger, <https://docs.erpnext.com/docs/user/manual/en/immutable-ledger-in-erpnext>

Limits. The product later added controlled repost tools. Those are follow-up operations, not field writes on the original row. Sibling issue 21 records Posting as Action and LedgerEntry as occurrence.

## E-007 Frappe save, submit, and db_set are different write mechanisms

**Kind.** source-system artifact  
**Decision state.** `supported` as a ladder of bypasses

`doc.save` runs permissions, `validate`, and `on_update`. `doc.submit` finalizes a submittable document. `doc.db_set` writes a field in the database and "does not trigger controller validations and should be used very carefully." `doc.db_insert` and `doc.db_update` "bypass all validations and controller methods."

Citation. Frappe Document API, updated 2026-04-15, <https://docs.frappe.io/framework/user/en/api/document>

Limits. Escape hatches exist because operators needed them. Their existence is not a license for OS to make silent field write the default.

## E-008 Odoo inventory Apply is the adjustment verb

**Kind.** domain evidence  
**Decision state.** `supported`

Odoo counts live in a Counted column. The business write is Apply or Apply All, with an Inventory Reason defaulting to "Physical Inventory" and a Counting Date. Relocate and Set to 0 are named Actions on the same page. Changing a counted number without Apply does not move stock.

Citation. Odoo 19, Inventory adjustments, <https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html>

Limits. UI labels. The domain fact is that a count is an observation until someone applies it as an adjustment.

## E-009 Odoo write on a done stock move is refused for some fields

**Kind.** source-system artifact  
**Decision state.** `supported` as posted-state protection

Public `stock.move.write` raises if `product_uom` changes on a move whose state is `done`. Quantity edits on reserved moves unreserve and recompute state. Done-move mutation is not ordinary ORM write.

Citation. Odoo public tree, `addons/stock/models/stock_move.py` at `dda9700d8236091626cbd78efc0ca4116e1e1acd`. Behavior and error text only.

Limits. LGPL corpus. Concepts extracted. No implementation copied.

## E-010 Moqui prefers services, including implicit CRUD services

**Kind.** source-system artifact  
**Decision state.** `supported` as "generic but still a named operation"

Moqui says only in rare cases should you create a record with the Entity Facade. CrUD should go through services. Automatic CrUD services exist for every entity with no definition, named `create#Entity`, `update#Entity`, `delete#Entity`, `store#Entity`. Entity-auto update enforces status transitions against `StatusFlowTransition`.

Citation. Moqui Entity Facade, <https://www.moqui.org/docs/framework/Data%20and%20Resources/The%20Entity%20Facade>. Moqui Service Implementation, <https://moqui.org/m/docs/framework/Logic+and+Services/Service+Implementation>

Limits. Implicit `update#Item` is still generic field mutation with a service wrapper. It is evidence that a mature framework wanted a verb even for CRUD, and also evidence that the verb can be empty of business meaning.

## E-011 ValueFlows EconomicEvent is an observed past flow

**Kind.** domain evidence  
**Decision state.** `supported`

"Economic Events describe past flows, something observed, never some potential future event." They appear only as records of the past. Future plans are Intents and Commitments. Events are immutable in accounting practice. Correction is another event related by `corrects`, possibly with a negative quantity.

Citation. ValueFlows, Flows, <https://www.valueflo.ws/concepts/flows/>. ValueFlows, Diagram explanations, <https://www.valueflo.ws/specification/model-text/>

Limits. ValueFlows `Action` is a flow verb such as `produce` or `transfer`. It is not Palantir's mutation type. Issue 7 D-001 already named the collision.

## E-012 GS1 EPCIS writes are visibility events, including OBSERVE

**Kind.** domain evidence  
**Decision state.** `supported`

EPCIS data consist of visibility events. The informal example is "At 1:23pm on 15 March 2004, EPC X was observed at Location L." Event data grows as business is transacted and is tied to moments in time. Master data is not. ObjectEvent action may be ADD, OBSERVE, or DELETE. OBSERVE records that objects were seen. It does not invent a business decision named ObservePallet.

Citation. GS1 EPCIS 2.0.1, <https://ref.gs1.org/standards/epcis/2.0.1/>, especially the event-data versus master-data note and ObjectEvent action values.

Limits. Capture workflow on the dock is often custom. The standard still models the persist as an event, not as an object-field patch.

## E-013 Fowler event sourcing rebuilds state without a new command

**Kind.** domain evidence for derived writes  
**Decision state.** `supported`

"Complete Rebuild. We can discard the application state completely and rebuild it by re-running the events from the event log on an empty application." Current state may be stored for speed. It remains derivable. Azure's write-up calls materialized views read-only projections updated by handlers after events are raised.

Citation. Martin Fowler, Event Sourcing, <https://martinfowler.com/eaaDev/EventSourcing.html>. Microsoft, Event Sourcing pattern, <https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing>

Limits. Event sourcing is not assumed for OS. The write-class fact survives without that assumption. Rebuilding a projection is not a business decision.

## E-014 PostgreSQL materialized view refresh replaces derived rows

**Kind.** source-system artifact, and a counterexample to Action-only persist  
**Decision state.** `supported`

`REFRESH MATERIALIZED VIEW` "completely replaces the contents of a materialized view." The old contents are discarded. The backing query provides new data. Concurrent refresh needs a UNIQUE index so rows can be matched. Privilege required is `MAINTAIN`, not a business-action grant.

Citation. PostgreSQL 18, <https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html>

Limits. Storage engine. Constitution §6 already says caches and materialized views may be useful without being ontology concepts.

## E-015 Yjs applyUpdate is a commutative document write

**Kind.** domain evidence for collaborative drafts  
**Decision state.** `supported`

Document updates are commutative, associative, and idempotent. `Y.applyUpdate` applies a binary update. Clients sync by exchanging state vectors and diffs. A single character insert is a first-class write. There is no application-level ShipOrder in that path.

Citation. Yjs, Document updates, <https://docs.yjs.dev/api/document-updates.md>

Limits. CRDTs solve concurrent text, not posted stock. The kill is against Action-per-keystroke, not against Action-on-commit.

## E-016 Issue 7 already allows Events with no OS Action

**Kind.** candidate law already on another branch  
**Decision state.** `supported` there. Reused here as a kill against Action-only writes

Issue 7 L-005. An occurrence can fulfill, correct, or ignore prior actions. An action can produce zero, one, or many occurrences, or only an attempt record. Decision state there is `supported`.

Citation. `git show origin/cursor/issue-7-foundation-cfd8:research/notes/issue-0007-action-event-effect.md` at `08676a1040780eed586288c1a43fa40535e2111d`

Limits. That note did not taxonomize replica, cache, or CRDT writes. This folder does.

## E-017 Issue 4 splits Observation from Decision

**Kind.** candidate law already on another branch  
**Decision state.** `hypothesis` there for the exact type cut. The operational split is reused as `supported`

Issue 4 taxonomy. Observation is a record that something was perceived or measured. Decision is a governed intervention an actor attempted. "Approving a promise and seeing a truck arrive are different acts."

Citation. `git show origin/cursor/issue-4-foundation-cfd8:research/foundation/facts/taxonomy.md` at `905baa0c99f09fd445b9f1bb0eee5435fa814be3`

Limits. That folder does not settle Fact as a kernel type. This folder does not either.

## E-018 Issue 56 keeps Action as a sort and rejects Action-equals-Event

**Kind.** candidate law already on another branch  
**Decision state.** `supported` there for Action-is-not-Event

L-P-02. Attempted intervention is a different sort from observed occurrence. Events may arrive with no OS Action. L-P-04. The engine default for Event individuals must refuse in-place mutation.

Citation. `git show origin/cursor/issue-56-kill-cfd8:research/kill/primitives/candidate-laws.md` at `b44575d3d212c67258bee6ed0013e8409c530a5e`

Limits. Issue 56 asked whether Action is a base sort. This folder asks whether Action is the only write. Those are different questions. Agreement on the first is not a win for universal Action-only.

## E-019 Issue 18 treats current quantity as a projection

**Kind.** domain evidence via sibling  
**Decision state.** `supported` there for quantity-as-projection

"Current quantity is a projection in every source that talks about explainability." Odoo still stores `stock.quant` and records a move when an adjustment is applied. That stored quant is marked a source artifact.

Citation. `git show origin/cursor/issue-18-domain-cfd8:research/domain/inventory/README.md` at `de2bbe3ff71dcabb9ead699854a1b934496affbc`

Limits. This folder does not rewrite inventory research.

## E-020 Issue 21 names Posting as Action and LedgerEntry as occurrence

**Kind.** domain evidence via sibling  
**Decision state.** `hypothesis` there for the fragment. The Action-versus-occurrence cut is reused as `supported`

Compose draft Journal has no LedgerEntry. Posting Action may be refused. Success creates LedgerEntries. Reverse is another Action that creates compensating entries.

Citation. `git show origin/cursor/issue-21-domain-cfd8:research/domain/accounting/lifecycle.md` at `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc`

Limits. Journal-versus-event identity stays `undetermined` in that folder.

## E-021 Palantir Action wrappers can be property-edit boilerplate

**Kind.** source-system artifact  
**Decision state.** `supported` as a warning, not as a kill of named decisions

Workshop docs say an Action might change `Time of Departure` or `Origin` on a Flight. The Assign Employee example changes a `role` property and maybe creates a Manager link. The Action is a "user-friendly wrapper for complex object data edits."

Citation. Palantir, Use Actions in Workshop, <https://palantir.com/docs/foundry/workshop/actions-use/>. Palantir, Action types overview.

Limits. A thin EditFlightTimes Action is still better than raw PATCH if it carries criteria and an action log. It is worse than a real decision if the name only restates the fields.

## E-022 Constitution §7 already invited this kill

**Kind.** domain evidence inside OS docs  
**Decision state.** `supported` as the research brief, not as a completed law

"We currently favor the hypothesis that meaningful business mutations should be represented as explicit operations/actions rather than arbitrary field mutation. This is not yet a frozen rule. Research must test whether there are domains where generic mutation is semantically correct and safer than named actions."

Citation. `docs/constitution.md` §7. `docs/open-questions.md` item 4. RFC-0001 Action open question "Do all mutations require named actions?"

Limits. These are the claims under attack, not independent empirical sources.
