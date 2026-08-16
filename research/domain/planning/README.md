# Planning domain notes

**Issue:** [#24](https://github.com/EnzoTironi/OS/issues/24)  
**Track:** domain  
**Fetched:** 2026-08-16  
**Decision:** none. Notes are hypotheses unless a card says `supported`.

This folder is Wave A evidence for planning, forecasting, MRP, capacity, scheduling, and optimization. It is not a target schema and not a solver recommendation.

Manufacturing execution, BOM, routing, and WIP belong to issue #19. Inventory on-hand versus available belongs to issue #18. Those folders are cited, not rewritten.

## Question

What real-world distinctions must an executable ontology keep so that a plan can be explained, challenged, and replanned without collapsing forecast, demand, commitment, material calculation, capacity, and authorization into one mutable schedule record?

## How to read

| File | Mode | Contents |
| --- | --- | --- |
| [sources.md](sources.md) | reference | First-party documents, commits, and pages fetched this session |
| [evidence.md](evidence.md) | reference | Domain evidence and source artifacts |
| [matrix.md](matrix.md) | reference | Convergence and divergence across sources |
| [lifecycle.md](lifecycle.md) | explanation | Observed plan, requirement, and schedule lives |
| [candidate-laws.md](candidate-laws.md) | explanation | Smallest claims, counterexamples, runtime pressure |
| [scenarios.md](scenarios.md) | reference | Adversarial cards, including the five required families |
| [open-questions.md](open-questions.md) | reference | Unresolved forks. No invented answers |

Every card names a **kind** and a **decision state**.

Kinds:

- `domain-evidence`. A real-world distinction forced by operations.
- `source-artifact`. A document, field, report, or service that encodes that distinction in one system.
- `candidate-law`. The smallest claim that would explain several sources.
- `counterexample`. A case that would kill or shrink the claim.
- `runtime-consequence`. What a runtime would have to enforce if the claim survived.

Decision states: `hypothesis`, `supported`, `rejected`, `undetermined`. Nothing here is silently accepted.

## Standing forks left undetermined

Two forks stay open unless later independent first-party sources agree.

1. Forecast versus commitment identity. Sources treat forecast quantity and committed quantity as different inputs. They do not agree that those inputs are the same kind of object with a status flag.
2. Plan as Action versus plan as projection. ERPNext Production Plan is a submitted document that can reserve stock and spawn work. Odoo MPS is a period grid that suggests replenishment. ValueFlows Plan is a collection of processes, intents, and commitments. ISA-95 names a production schedule as a Level 4 to Level 3 message. Those are not yet one primitive.

RFC-0001 is not edited. Open questions in `docs/open-questions.md` are not answered here.

## Candidate planning vocabulary

These are research names, not types to implement.

| Name | Working meaning | State |
| --- | --- | --- |
| Independent demand | End-item need that is not calculated from a parent BOM | `supported` as a distinction |
| Dependent requirement | Need exploded from a parent plan or recipe | `supported` as a distinction |
| Forecast | Estimated future independent demand, not a promise | `supported` as distinct from a sales order. Identity with commitment is `undetermined` |
| Commitment demand | Promised independent demand, often a sales order line | `supported` as distinct from forecast. Identity with forecast is `undetermined` |
| Planning horizon | Bounded interval and bucket size used by one plan run | `supported` as a parameter |
| Safety stock policy | Extra cover added to netting or kept as a target ending inventory | `supported` that the policy exists. Formula is divergent |
| Lead time | Offset from due date to release date for make or buy | `supported` |
| Material netting | Gross need minus inventory position and open supply | `supported` as deterministic calculation |
| Capacity | Time-bounded load a resource can absorb | `hypothesis` relative to capability |
| Capability | What a resource can do, distinct from how much time it has | `hypothesis`. ISA-95 Part 1 attributes `undetermined` |
| Infinite schedule | Dates from lead time and calendars, ignoring contention | `supported` as the MRP-style default |
| Finite schedule | Dates that also refuse or move work when resources collide | `supported` as an APS-style requirement. Product choice `undetermined` |
| Plan revision | A dated set of planned orders under named assumptions | `hypothesis`. Version identity `undetermined` |
| Replan | Recalculation after demand, supply, or capacity facts change | `supported` as a needed verb. Mechanism `undetermined` |

## Function, Action, and reasoning

| Computation | Candidate form | State |
| --- | --- | --- |
| BOM explosion, lead-time offset, projected quantity, MRP netting | Deterministic `Function` | `supported` that these are not agent judgment |
| Finite sequencing, alternate resource choice under a stated objective | Optimization `Function` with explicit inputs and outputs | `hypothesis`. Not a product pick |
| Forecast judgment, priority tradeoffs, exception handling | Agent reasoning that may propose an Action | `hypothesis` |
| Submit, close, release, override, replan | `Action` | `hypothesis`. Plan-as-Action fork remains `undetermined` |
| Receipt posted, capacity lost, demand arrived late | `Event` | `supported` as distinct from the plan |

Solver inputs and outputs are listed in [candidate-laws.md](candidate-laws.md) as conceptual ports. No solver product is recommended.

## Cross-links

- Issue #18 owns on-hand versus available versus reserved. Planning consumes an inventory position. It does not redefine it.
- Issue #19 owns BOM, routing, work order, job, and WIP. Planning explodes and schedules those specifications. It does not own execution.
- Issue #2 is the parent research program.
- `docs/open-questions.md` items 4, 6, 9, 10, and 14 remain open. This folder cites them. It does not close them.

## Licensing

OS is MIT. ERPNext and Odoo are copyleft corpora. Notes extract concepts, documented behavior, field names, and public formulas. No implementation was pasted or translated.
