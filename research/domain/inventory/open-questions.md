# Open questions

**Kind.** unresolved uncertainty  
**Fetched.** 2026-08-16  
**Decision.** `undetermined` unless a row says otherwise. Nothing here is an answer to `docs/open-questions.md`.

Cite a research artifact or leave the question undetermined. Do not write invented answers into `docs/open-questions.md`.

## Question

What remains unknown after this pass, and which existing open questions does inventory pressure without closing?

## Inventory questions opened by this pass

### Q-INV-01. Is reserved quantity a stock figure or a commitment?

ValueFlows has no reserved qty on the resource. ERPNext, Odoo, and Moqui materialize one because concurrent promising fails without it.

**Decision.** `undetermined`  
**Touches.** `docs/open-questions.md` Q12, Q13. Law L-INV-04. Evidence E-12.  
**Falsify either way.** A source that does ATP correctly with only commitments and no reserved remainder, or a source that cannot express a sales commitment without a stock reservation row.

### Q-INV-02. What is the stock-slice key?

Candidate key. Specification, identity grain, location, owner, custodian. ValueFlows sometimes treats a rights transfer of non-serialized stock as a different resource. Odoo keeps one quant with an Owner field.

**Decision.** `undetermined`  
**Touches.** Product L-06 on `origin/cursor/issue-15-domain-cfd8`.  
**Falsify.** A first-party model that reports two accounting quantities for one fungible resource without extra structure, and still posts valuation correctly.

### Q-INV-03. How should hold, quarantine, and damage be composed?

ERPNext uses Rejected Warehouse. GS1 uses disposition and forbids a standard `quarantined` URI. Odoo uses locations and quality apps not fully fetched this session.

**Decision.** `undetermined`  
**Touches.** L-INV-12. Evidence E-21.  
**Falsify.** A regulated flow that needs a hold fact that is neither a place nor a disposition.

### Q-INV-04. What is in-transit, ontologically?

Transit warehouse, Transit location type, pickup and dropoff process, or `in_transit` disposition. Ownership may already have moved.

**Decision.** `undetermined`  
**Touches.** L-INV-13. S-INV-05, S-INV-20.  
**Falsify.** One encoding that answers owner, possessor, and place for FOB, dropship, and two-step warehouse transit without hidden flags.

### Q-INV-05. Must every inventory fact carry valid time and knowledge time?

ERPNext posting date versus creation, freeze dates, and future recomputation argue yes for movements and valuations. Odoo counting date is thinner in the fetched pages.

**Decision.** `undetermined` as a universal requirement  
**Touches.** `docs/open-questions.md` Q7. Temporal L1. L-INV-08.  
**Do not answer Q7 here.**

### Q-INV-06. Is cancel-and-amend compatible with "correction adds facts"?

ERPNext updates a submitted stock entry by cancelling and amending, and documents an immutable ledger from v13. Odoo revert keeps the original move.

**Decision.** `undetermined`  
**Touches.** `docs/open-questions.md` Q5, Q6. L-INV-16. Evidence E-26.  
**Do not answer Q5 or Q6 here.**

### Q-INV-07. Which costing methods, if any, belong in the semantic core?

FIFO, LIFO, moving average, standard, and actual-serial cost all appear. Constitution §5 says implementation complexity may be large. Method choice looks like policy.

**Decision.** `undetermined`  
**Touches.** `docs/open-questions.md` Q15. L-INV-10.  
**Falsify.** An accounting invariant that cannot be expressed unless the engine knows the method name.

### Q-INV-08. Is projected quantity one function or many?

ERPNext and Odoo disagree on the formula. Planning, ATP, and financial on-hand are different consumers.

**Decision.** `undetermined` as one named function  
**Touches.** [quantities.md](quantities.md) Q-PROJ.  
**Falsify.** A single equation that serves reorder, ATP, and financial stock without leftover terms.

### Q-INV-09. Does dropship ever create inventory facts for the seller?

Odoo dropship moves from vendor location to customer location. Not fully mined this session.

**Decision.** `undetermined`  
**Follow-up.** Fetch the Odoo dropship page in a later pass. S-INV-11.

### Q-INV-10. Can identity-bearing negative stock ever be a valid book state?

ERPNext v15 forbids it. That is one product's current rule.

**Decision.** `undetermined` as a universal ban  
**Touches.** L-INV-07. S-INV-36.

## Existing open questions this pass pressures, without answering

| Open question | Pressure from this folder | Still |
| --- | --- | --- |
| Q4 Action | Reserve, apply count, post movement, transfer rights, transfer custody | `undetermined` |
| Q5 Action vs Event vs Effect | Duplicate integration post. Unknown carrier scan | `undetermined` |
| Q6 Mutable state | On-hand as cache. Reservation as primary claim | `undetermined` |
| Q7 Bitemporality | Backdated receipt. Landed cost. Freeze | `undetermined` |
| Q12 Relators | Reservation, ownership, custody | `undetermined` |
| Q13 Economic reality | VF transfer family versus ERP documents | `undetermined` |
| Q14 Manufacturing | Consume, produce, WIP warehouse, process loss | `undetermined` |
| Q15 Ontology vs runtime | Perpetual GL posting must not become `if StockEntry` | `undetermined` |

RFC-0001 falsification target 3 asks whether the metamodel can model ownership, custody, reservation, lot identity, and movement without conflating them. This folder supplies evidence and candidate laws. It does not promote those laws into the RFC.

## Out of scope this session

- Brazilian fiscal inventory rules. Issue 28.
- Full Odoo `stock.quant` developer internals. Copyleft. Behavior only, from docs.
- Manufacturing WIP as a first-class domain. Issue 19.
- Logistics carrier events beyond EPCIS. Issue 20.
- A target schema.

## Follow-ups

1. Read corpus notes on `research/erpnext/` and `research/odoo/` after those PRs land, and add cross-links only.
2. Fetch Odoo dropship and quality-alert pages if Q-INV-09 or Q-INV-03 stay hot.
3. Keep Wave B runtime recommendations waiting. L-INV-15 is pressure, not a storage choice.
