# Semantic distortions

**Status.** What happens if V-001 is forced onto each platform.  
**Kind.** counterexample plus runtime consequence.  
**Decision.** per platform.

"With extensions" is allowed by the issue. An extension that the engine does not enforce is scored as a distortion, not as a pass. Developer days are irrelevant.

## Palantir

**Decision.** `rejected` as a clean replace. `supported` as the proprietary benchmark.

V-001's four stock and demand observations become one `InventoryRecord.onHand` and one `Demand.qty` after a pipeline with precedence rules. E-002 says to do that. The chat substitute either dies or becomes a comment property. Provenance of the losing claim is ETL residue, which E-002's sibling anti-pattern "Kitchen Sink" tells you not to expose.

Requested, promised, planned, and actual become four timestamp properties on `SalesOrder`, or four linked objects the modeler invents. The engine treats them as dates. ValueFlows would have called them different classes. E-020.

`PurchaseRaw` can be an Action with submission criteria. Preview is a Scenario or a test run in Ontology Manager. Approval is a second Action, a Workshop button, or AIP Manual confirm. None of those bind a digest of arguments and re-evaluate after a later human signature. The 10:06 receipt wins only if the 10:07 submitter happens to load fresh objects. That is luck, not a protocol.

`BookCarrier` as writeback can book the carrier and then fail the ontology write. E-006. The same action as a side effect can tell the user the purchase succeeded and leave the booking for later, unshown. There is no `unknown`. Reconciliation is another pipeline.

The late August 8 movement becomes a backdated property edit or an amendment object. E-003 forbids a `StockAsOf` object per day. "What did we believe on 10 August?" depends on edit history and pipeline snapshots remaining queryable. Official pages opened here do not give a bitemporal API.

Object-backed links can hold a customer-and-supplier relationship. One-to-one cardinality will not keep a second `primarySupplier` from existing. E-007.

**Extension fantasy.** Build `Observation`, `Proposal`, `EffectAttempt`, and `KnowledgeSlice` object types, plus automations that refuse merge-without-provenance. That is an OS ontology hosted on Foundry. The platform's own anti-patterns argue against the first and third of those types. The kill test measures the platform, not a second system built on top of it.

**Source artifacts to leave behind.** Funnel, Phonograph, writeback dataset, Restricted View, Workshop, OSDK, Multipass, Scenario as the only preview, generated CRUD actions.

## Open Foundry (syzygyhack)

**Decision.** `rejected` as a replace.

The supply-chain pack already names PurchaseOrder and ShipOrder. That looks like V-001 until you watch the executor. Local objects commit. Webhooks run after. `ROLLBACK_ALL` restores Foundry-like local state and does not unbook a carrier. E-009.

There is no proposal object in the inspected executor. An agent that can call `POST /api/v1/actions/CreateOrder` can commit. Stale approval is a missing type, not a missing config flag.

Seeds write objects outside the action pipeline. That is a second mutation authority.

Temporal queries and CDC are README claims. Treating them as P1 and P10 enforcement would be a grade inflation. E-010.

**Extension fantasy.** Add Ontologiq's proposal table and `unknown` enum to the executor. At that point the interesting code is the extension. The existing engine is a typed object store with CEL.

**Name collision.** S10 and S15. "Open Foundry" is several repos. This card is `syzygyhack/open-foundry` at `f29bcb9ed819`.

## Ontologiq

**Decision.** `rejected` as a replace. `supported` as the protocol donor for P4, P5, P6, and P8.

V-001 steps 1 through 5 have no home except the warehouse tables the ontology reads. There is one `on_hand` and one computed `state`. Competing observations are a modeling error. E-012.

`PurchaseRaw` as a gated webhook is the best open match to steps 6 through 9. The agent proposes. The human approves. The 10:06 receipt, if it has already landed in the warehouse, fails the second precondition. That part is clean. E-011.

Steps 10 and 11 split. The carrier timeout can stay `unknown`. The late stock document cannot be recorded as a known-then fact. There is no history. Reconciliation of the booking is "do not retry," not a later observation that closes the unknown.

Because Ontologiq never writes, P7 is not a local transaction. The far system is the system of record. If that system is ERPNext, you have inherited ERPNext's distortions and added a governance sidecar. That is a product shape, not a replacement for an OS core.

**Extension fantasy.** Add a fact store and multi-source claims. The README's adoption story ("write access to nothing") dies. You have designed OS.

## ObjectStack

**Decision.** `rejected` as a replace.

V-001 can be drawn as objects, fields, actions, and a generated Console. The agent calls `run_action`. The human clicks the same action. E-013. That is the thesis diagram for surfaces.

The script body then runs with the application's full data authority. A policy that said the agent may propose a purchase of 1000 only in region West can be bypassed by a `find` inside the body. Surface parity is not authority parity.

Approval nodes re-read `current.*` at entry. That helps routing after the 10:06 receipt if the receipt is a field on the same record. It does not hash the approved arguments of a script action. S10 left that path undetermined.

`runAs: 'system'` is required for approval-outcome writes. Elevation is at least explicit. It is still a boolean-shaped hole next to `isSystem` skipping provenance. S10 E-011.

Unknown carrier outcomes are not in the opened docs.

**Extension fantasy.** Carry caller authority through script bodies and add an `unknown` effect status. ObjectOS commercial terms still sit beside the Apache tree. S15.

## Moqui / Mantle

**Decision.** `rejected` as a replace.

`place#Order`, `reserve#AssetsForOrder`, `receive#Asset`, and a later `approve#` service can tell V-001 as SOA. E-015. Screens, REST, and jobs can call the same service. That is P12 for 2010.

`update#Entity` can set `statusId` without placing an order. The named-verb story has an official back door. S12.

SECA `tx-commit` can email the carrier after the purchase service commits. A timeout in that thread is a job failure. It is not an `unknown` on the action. E-016.

Requested versus promised versus planned versus actual is easier here than on a single ERPNext delivery date, and still not four natures. S12.

No MCP, no hashed proposal, no first-class observation. Adding them is a new runtime.

**Source artifacts to leave behind.** Hash in the service name, XML Actions, SECA file extensions, TransactionCache, implicit entity-auto CRUD.

## Frappe / ERPNext

**Decision.** `rejected` as a replace. `supported` as a domain corpus.

V-001 becomes Sales Order, Delivery Note, Work Order, Purchase Order, Stock Entry, and a Workflow on the PO. That is how mature ERPs survive. It is also how dates collapse onto forms and how submit becomes the only real verb. E-017, E-019.

The 10:07 approval is a Workflow state. The 10:06 receipt is another document. Revalidation is whatever the `validate` hook on submit happens to read. There is no proposal digest.

Carrier booking is an integration script. Timeout is an exception. Retry is the usual disaster.

The late stock document is a backdated Stock Entry plus Repost Item Valuation. E-018. You can reconstruct history if you know `creation` and `posting_datetime` and you trust the repost. You cannot ask the engine "what did we believe on 10 August?" as a first-class question.

Agent and human share `frappe.client.submit` if someone wraps it. They do not share a generated Action. Forms are generated from DocTypes, which is P13 for humans and a trap for agents.

GPL. S15, E-023. Even a perfect semantic match would be a license fork, not a core.

**Source artifacts to leave behind.** `docstatus`, `update_after_submit`, `ignore_linked_doctypes`, two cancel encodings, Bin as a second stored projection.

## ValueFlows, Odoo, and the rest

ValueFlows names P3 correctly and then stops. Hosting V-001 on hREA was not tested. It would still need P4 through P9 from somewhere.

Odoo is a second document ERP. S12. Scoring it separately would repeat the ERPNext column with different names.

OpenBKN and Xpert advertise loops this session did not open. License first. S15.

gura105 is the most honest small reference for "one write door and an authority line." It is not a platform you can extend into an organization.

## Cross-platform distortion pattern

Every candidate that can run a company today collapses observations into current rows, collapses time into current-plus-changelog, and treats a lost external call as success or failure. Every candidate that handles stale approval and `unknown` refuses to own operational writes and history.

That split is the kill-test result. Extensions do not close it unless they become the core.
