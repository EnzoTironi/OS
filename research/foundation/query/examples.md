# Business question examples

**Kind:** domain evidence applied to the capability matrix.  
**Rule:** each example is a question a human or agent must ask. No syntax. No store.  
**Decision:** the capabilities named are `hypothesis` until a later vertical implements them. The source mappings are labeled.

The five questions come from issue #13. They are written so a synthesis agent can see which capabilities fire. They reuse scenarios S-001, S-002, S-003, S-007, and S-008 where those already exist.

---

## 1. Inventory availability

**Question.** Which stocked items, at which locations, can we promise to a new demand of quantity Q by date D, given reservations, quality holds, and late-recorded movements?

**Why storage layout must not matter.** The asker should not know whether quantity lives in a ledger table, a snapshot column, or a derived projection. Thesis and constitution already treat current quantity as something the system must explain.

**Capabilities that fire.**

| Capability | How it appears |
| --- | --- |
| First-class set | "Available to promise at location L" is a set later used by allocation and by S-002's partial fulfillment. |
| Interface polymorphism | Query `InventoryResource` (RFC-0001 candidate), not `SerializedPart` union `LotTrackedPart` union `BulkCommodity`. |
| Typed traversal | Item to location to reservation to quality hold. Search Around / role play, not `JOIN inv_bin ON ...`. |
| Temporal | S-007. Stock as known on August 10 versus stock now believed for August 10. Valid time and knowledge time both change Q. |
| Provenance | A backdated shipping document and a cycle-count adjustment are not interchangeable evidence for the same quantity. |
| Operational vs analytic | The promise set is operational. "Fill rate by week" is analytic over that set. |
| Authorization | A planner may see quantity and not see the customer name on the reservation that created the hold. |
| Shared expressions | The same "available" predicate must hold in the query, in a Function used by MRP, and in a Policy that forbids promising held lots. |

**Source mapping.**

- **Domain evidence.** `scenarios/README.md` S-002, S-007. `docs/research-program.md` inventory questions (reservation vs possession, current quantity as projection).
- **Source-system artifact.** Palantir object sets plus Search Around. SQL:2011 application-time and `SYSTEM_TIME`. TypeQL roles on relations that can own a start date.
- **Counterexample if missing.** A current-row `ON_HAND` column that cannot answer S-007 will silently over-promise after a late movement.

**Decision state for this example.** `hypothesis`. The question is real. The exact available-to-promise law is not chosen here.

---

## 2. Supplier risk

**Question.** Which suppliers, including those modeled as organizations that also buy from us, currently concentrate risk on items that are short, given late receipts, quality escapes, and single-source dependencies?

**Why storage layout must not matter.** Supplier may be a role on an organization (S-005), not a `suppliers` table. Risk scores may be derived. The question still names a set of parties and a set of items.

**Capabilities that fire.**

| Capability | How it appears |
| --- | --- |
| First-class set | "Suppliers of short items" is reusable in sourcing actions and in a dashboard. |
| Interface / role polymorphism | Query parties that `play` supplier on a supply agreement. Do not require a `Supplier` object type. Palantir `interfaceBase` and TypeQL `plays` both point here. |
| Typed traversal | Organization to supply agreement to item to receipt to quality event. The agreement is a relator if it has terms and lifecycle (RFC-0001, S-006). |
| Temporal | "Currently concentrate" is valid-now. "Who was single-source last quarter" is valid-then. Knowledge time matters if a late quality escape changes last quarter's picture. |
| Provenance | A chat rumor and a signed NCR are not the same risk input (constitution §11, S-011). |
| Analytic vs operational | Concentration percentages are aggregates. The set of at-risk suppliers is operational. ObjectQL's inert `distinct` flag is a warning not to let the engine pick the number. |
| Authorization | A buyer may see late-receipt counts and not see another division's contract price. |
| Shared expressions | A Policy that blocks new POs to high-risk suppliers must use the same risk membership Function the query uses. |

**Source mapping.**

- **Domain evidence.** S-005 (supplier is also customer). S-011 (contradictory observations).
- **Source-system artifact.** TypeDB interface polymorphism on `employment:employer` is the same shape as `supply-agreement:supplier`. Palantir interfaces for shared shape across unlike object types.
- **Counterexample if missing.** Two queries, one over `Supplier` rows and one over `Customer` rows, double-count organization B or miss it.

**Decision state.** `hypothesis`.

---

## 3. Overdue commitments

**Question.** Which customer or supplier commitments are overdue relative to the promised date, not the requested date, and which of those still have an open quantity after partial fulfillment?

**Why storage layout must not matter.** Promised date is not a column named `delivery_date` that lost its friends. Open-questions.md already warns that requested, promised, planned, and actual must not compete for one field.

**Capabilities that fire.**

| Capability | How it appears |
| --- | --- |
| First-class set | "Overdue open commitments" is a named dynamic set. Agents and planners subscribe to it. Palantir dynamic object sets are the product form of this. |
| Polymorphism | Customer order lines and supplier order lines may share a `Fulfillable` or `Commitment` interface (RFC-0001 candidates). One overdue query. |
| Typed traversal | Commitment to remaining quantity to shipments to invoices. Partial fulfillment (S-002) is a path, not a status string. |
| Temporal | Overdue is `now` compared with promised valid time. A backdated promise change must not rewrite history (S-001, S-012). |
| Provenance | Which source established the promised date. ERP vs spreadsheet vs chat (S-011). |
| Composable predicates | `promised < today` AND `open_qty > 0` AND `not cancelled`. Datalog would name this relation. TypeQL would name a function. GraphQL fragments would not. |
| Authorization | Credit may see overdue receivables. Operations may see overdue shipments. Same commitment, different properties. Palantir object+property policies. |
| Shared expressions | A dunning Action's precondition is this set. If the Action reimplements the predicate, the UI and the agent diverge. |

**Source mapping.**

- **Domain evidence.** S-001, S-002, S-011. `docs/open-questions.md` Q3 caution on collapsed dates.
- **Source-system artifact.** Palantir `Filters.and`. Soufflé named rules. TypeQL functions as reusable membership.
- **Counterexample if missing.** A report that sorts on `delivery_date` after a planner overwrote promised with actual.

**Decision state.** `hypothesis` for the commitment model. `supported` for "overdue is a named predicate over distinct date facts," given S-001 and the open-questions caution.

---

## 4. Production bottlenecks

**Question.** Which work centers or operations are currently the constraint, given queues of authorized work, actual execution progress, scrap, and rework?

**Why storage layout must not matter.** The asker should not know whether a queue is a work-order table, a job-card table, or a graph of operation links. Research-program manufacturing questions already separate specification, authorization, and execution.

**Capabilities that fire.**

| Capability | How it appears |
| --- | --- |
| First-class set | "Operations waiting on work center W" is a set. "Orders whose next operation is in that set" is a Search Around / role traversal. |
| Polymorphism | Machines, lines, and cells may implement `WorkCenter` or play `operation:resource`. New resource types must join the bottleneck query. Palantir interface compatibility claim. |
| Typed traversal | Work order to operation to work center to actual job. S-008 / S-009 need input-output links for scrap and rework, not a quantity adjustment only. |
| Temporal | Queue as of shift start versus queue as known now. A late booking of completion changes the bottleneck. |
| Aggregates | Queue hours and utilization are aggregates. The bottleneck *object* is operational. Palantir `groupBy` plus a later load of the top bucket's object set is the product split. |
| Recursive path | Routing predecessors. Datalog recursion and SPARQL `+` express "upstream of the jammed operation." Palantir's three-hop load limit is a `runtime consequence` that a semantic model must not bake in. |
| Authorization | A supervisor sees only their work centers. Object-level policy. |
| Shared expressions | Scheduling Functions and the bottleneck query must use the same "still open" definition. |

**Source mapping.**

- **Domain evidence.** `docs/research-program.md` manufacturing list. S-008, S-009.
- **Source-system artifact.** TypeQL recursive functions. SPARQL property paths. Palantir Search Around hop caps.
- **Counterexample if missing.** A dashboard that counts open work orders per plant and calls the largest plant the bottleneck, ignoring operation sequence.

**Decision state.** `hypothesis`.

---

## 5. Financial exposure

**Question.** What is our exposure if customer C and every party that C guarantees fail, including open receivables, uninvoiced shipments, and inventory already reserved to C, under the knowledge we had at the last close and under knowledge now?

**Why storage layout must not matter.** Exposure is a cut through commercial, logistics, and inventory objects. A warehouse schema and a GL schema are observations, not the question.

**Capabilities that fire.**

| Capability | How it appears |
| --- | --- |
| First-class set | "Parties in C's guarantee graph" is a set. Exposure is an aggregation over that set plus related operational objects. |
| Polymorphism | Customers, guarantors, and internal counterparties may share `Principal` or `Party`. Interface query. |
| Typed / recursive traversal | Guarantee and ownership links. SPARQL `*` / Datalog / TypeQL functions. Palantir hop caps will not walk a deep guarantee chain if treated as a semantic limit. |
| Temporal | Exposure at last close (valid time of the close, knowledge time of the close) versus exposure now. SQL:2011 bitemporal tables are the existence proof that both questions are expressible. |
| Provenance | Which valuation and which invoice status are accepted. A disputed invoice is not the same receivable as a signed one. |
| Analytic vs operational | Total currency amount is analytic. The set of shipments to hold is operational. Mixing them in one AST without an execution contract is ObjectQL #6815. |
| Authorization | Treasury sees amounts. A CSR sees the order but not the guarantee chain. Property and object policies. |
| Shared expressions | A credit Policy that blocks shipment must evaluate the same exposure Function the treasurer queries. S-003 (stale approval) applies if the Function is not re-read at commit. |

**Source mapping.**

- **Domain evidence.** S-003, S-007 (knowledge vs valid), constitution §11 and §14.
- **Source-system artifact.** SQL:2011 dual periods. PROV-AQ SPARQL over derivation. Palantir cell-level security example (VIP passenger vs PII properties) is the same grain, different domain.
- **Counterexample if missing.** A GL balance for customer C that ignores uninvoiced shipments and reserved inventory, or a graph walk that leaks another customer's terms.

**Decision state.** `hypothesis`.

---

## Cross-example pattern

All five questions have the same shape.

```text
named set
  <- polymorphic type or role
  <- typed paths
  <- predicates over properties, time, and provenance
  <- authorization of the principal
  <- optional aggregate
  -> later Action or Function consumes the same set
```

A query model that can only return a GraphQL tree or an ObjectQL page forces every later Action to reconstruct the set. That reconstruction is where meaning forks.
