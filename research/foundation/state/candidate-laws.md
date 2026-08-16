# Candidate laws for issue 12

**Kind:** candidate law set  
**Fetched:** 2026-08-16  
**Decision:** per claim. None accepted.

Each law is the smallest claim that still explains the evidence. A later synthesis agent should attack these, not paraphrase them.

---

## CL-1. Reconstructability is not a storage style

**Claim.** For high-value operational state, OS must be able to explain why the world currently appears as it does. That explanation can be a fact log, a ledger of effects, a bitemporal row history, or a source document plus generated entries. It does not have to be a domain-event store.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-02, E-09, E-11, E-12, E-15

**Counterexample to try.** A domain where two independent audits cannot reconstruct the same balance from the retained evidence, yet the business still treats the balance as trustworthy. If that domain is common and acceptable, CL-1 is too strong.

**Runtime pressure.** Whatever is retained must be queryable by valid time and by knowledge time for the cases in scenario S-007. Wave B should not pick a database until Wave A says which of those times are required on which facts.

---

## CL-2. Some current values are primary facts

**Claim.** A value is a primary fact when it is a decision, an accepted observation, or a description that no independent movement stream owns. Treating those as disposable projections forces fake events.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-01 (commitments), E-06 (reservation entries), E-13 (Palantir object properties), E-14 (`raise`/`lower`), taxonomy "when current state is a primary fact"

**Counterexample.** A property that looks descriptive but is always the remainder of other facts. Customer outstanding presented as a typed field. If every such field can be replaced by a function without losing a decision, CL-2 still holds and the field was misclassified.

**Runtime pressure.** Writes to primary facts need authority, identity, and provenance. They do not need replay.

---

## CL-3. Arithmetic remainders are derived

**Claim.** If two honest clerks would compute the same number from the same committed facts, the number is derived. Storing it as a user-editable current field without those facts is a cache pretending to be a fact.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-01, E-04, E-05, E-07, E-14

**Counterexample.** Opening balance at cutover, or a legal figure that must be frozen after period close even if later facts would recompute it differently. Those are committed snapshots of a derivation, not user doodles. They do not kill CL-3. They add a "frozen derived" case.

**Runtime pressure.** Derived reads must name their function and inputs. If a cache is used, invalidation or controlled repost is part of the write path for late facts.

---

## CL-4. Status is not one thing

**Claim.** A status that names a decision is stored as a committed fact. A status that names a predicate is derived, and may only be cached.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-01 (draft/submit/cancel), E-08 (Odoo availability), taxonomy status table

**Counterexample.** Odoo stores Available / Partially Available on the move after a reservation check. That is a stored predicate. It is a source-system artifact. It falsifies "no system stores derived status." It does not falsify "the meaning is still a predicate."

**Second counterexample to try.** A legal status that looks like a predicate (insolvent, licensed) but is actually an official act. Then it is committed, not derived.

**Runtime pressure.** Do not put a generic `status` string on every object type. If OS needs a status field, it should say whether the value is assigned by an Action or computed by a Function.

---

## CL-5. Pure event sourcing is not required

**Claim.** OS does not need a kernel rule that every mutation is a domain event, that current objects are only working copies, and that an event store is the sole system of record.

**Kind:** candidate law  
**Decision:** rejected as a kernel requirement. The weaker claim in CL-1 remains supported.

**Evidence:** E-09 (Fowler allows current state as official record), E-10 (CQRS not implied), E-12 (XTDB updates), E-13 (Palantir objects), E-14 (ValueFlows stored or derived), E-15 (thesis already refuses the implication)

**Why the strong claim fails.**

1. ValueFlows, the independent economic model, refuses to require derived-only quantity.
2. Palantir's operational ontology writes current properties through Actions and treats materializations as optional exports.
3. XTDB presents `UPDATE`/`DELETE` as the normal write and keeps history underneath.
4. ERPNext's reconstructability comes from source documents plus immutable generated ledgers, not from replaying user-level events through a ship-tracker.
5. Fowler's own ES page says the official record may be current application state, with logs for audit and special processing.
6. Pure ES makes external effects and event-schema evolution expensive. Constitution §9 says unknown external outcomes are real. That cost is not justified for every property.

**Counterexample that would revive the strong claim.** A first vertical (order-to-cash or inventory) where every reconstructability failure traces to a stored current field that had no event, and where adding events is cheaper than adding a ledger-of-effects or a fact log. Not seen this session.

**Runtime pressure.** Do not build an event store, CQRS bus, or snapshot pipeline because issue #12 exists. Wait for a bounded context that fails CL-1 without one.

---

## CL-6. Correcting history and compensating history are different

**Claim.** If a past fact was false, record a correction that changes what we now believe was valid then. If a past fact was true and the business later needs the opposite effect, record a compensation that leaves the original visible.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-02 (ERPNext reverse on cancel), E-03 (repost after late stock), E-12 (XTDB valid time versus system time), E-14 (ValueFlows `corrects`), scenario S-007 and S-010

**ERPNext mix.** Cancel of a wrong invoice is compensation in the ledger (opposite rows, original kept) and a document-status decision. Repost Item Valuation is closer to correction of derived valuation after a newly accepted late movement. The product uses both.

**Counterexample to try.** Tax or fiscal rules that forbid changing valid-time belief after a declaration, so every fix must be a current-period compensation even when the original fact was false. That would constrain CL-6 by jurisdiction, not kill it.

**Runtime pressure.** The write API must not have a single "fix this" that sometimes deletes, sometimes reverses, and sometimes backdates. Those are different Actions.

---

## CL-7. Late facts invalidate later derived values

**Claim.** A backdated or correcting fact is not finished when it is stored. Later derived values that depended on the old sequence must be recomputed, temporally reinterpreted, or explicitly frozen by period close.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-03, E-07 (Valuation At Date), E-09 (retroactive events), E-12, scenario S-007

**Counterexample.** A derived value that is defined only "as known at decision time" and must never move, such as a price quoted under a stale approval (scenario S-003). That value is a committed snapshot of a derivation. CL-7 still applies to book quantity and valuation.

**Runtime pressure.** Period close, freeze dates, and serial/batch constraints are not UI nits. They are the brakes on recomputation. ERPNext documents all three next to immutable ledger.

---

## CL-8. Ledger authority is not cache authority

**Claim.** An authoritative ledger is a sequence of committed effects that reports must be able to sum. A materialized projection is a stored sum or snapshot. Promoting the snapshot to authority is how books and stock silently diverge.

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-02, E-04, E-05, E-07, E-13 (optional materializations)

**Counterexample.** A legal close that freezes a snapshot as the declared figure. The snapshot becomes a committed fact about what was declared, while the ledger remains the explanation of how it was computed at close. Two facts, two jobs.

**Runtime pressure.** If OS materializes balances, the materialization must cite the ledger cut and the function revision. Palantir's optional materialization is the product form of this. ERPNext's "do not delete SLE rows" is the negative form.

---

## CL-9. Commitments, reservations, WIP, and receivables are not on-hand

**Claim.** These aggregates share a shape (quantity or money tied to an open relation) and do not share a state form with units in a bin.

| Aggregate | Primary fact | Derived remainder |
| --- | --- | --- |
| On-hand | Movement / count | Sum of movements |
| Reservation | Allocation entry | On-hand − active allocations |
| WIP | Issue and output events against an open order | Issued − completed − scrap, or qty in WIP location |
| Receivable | Invoice and allocation | Billed − settled |
| Customer commitment | Sales Order / VF Commitment | Ordered − delivered − cancelled |

**Kind:** candidate law  
**Decision:** supported  
**Evidence:** E-01, E-06, E-14, `docs/research-program.md` inventory questions

**Counterexample to try.** A domain that treats reservation as a warehouse movement into a virtual "reserved" location and never needs the allocation identity. If that works for serials, partials, and unreserve, CL-9 can collapse reservation into movement. ERPNext v15 added an explicit entry instead.

---

## Decision board

| ID | Decision | One line |
| --- | --- | --- |
| CL-1 | supported | Explainability required. Mechanism open. |
| CL-2 | supported | Some current values are facts. |
| CL-3 | supported | Remainders are derived. |
| CL-4 | supported | Decision status versus predicate status. |
| CL-5 | rejected | Pure ES is not a kernel requirement. |
| CL-6 | supported | Correct versus compensate. |
| CL-7 | supported | Late facts force recompute or freeze. |
| CL-8 | supported | Ledger ≠ cache. |
| CL-9 | supported | Reservations, WIP, AR, commitments are distinct. |

RFC-0001 Fact/Event wording is unchanged. Independent sources converge on the distinctions above. They do not converge on Fact as the storage unit.

## What would change RFC-0001

Only if a later corpus shows that every reconstructable system in the compare set uses one information atom (datom, event, or row version) and that OS cannot express CL-1 without picking it. This session shows three viable atoms. That is not convergence.
