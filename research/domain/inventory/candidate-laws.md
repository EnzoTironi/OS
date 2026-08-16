# Candidate laws

**Kind.** candidate law, with counterexamples and runtime consequences  
**Fetched.** 2026-08-16  
**Decision.** per law. Never `accepted`.

Each law is the smallest claim that explains a row in [matrix.md](matrix.md). A later synthesis agent should try to break these before promoting anything into RFC-0001. RFC-0001 was not edited.

## L-INV-01. Ownership is not custody

**Claim.** Primary rights and physical possession can belong to different parties at the same time. A model that stores one party on a quantity cannot represent consignment, VMI, loan, or FOB-in-transit.

**Kind.** candidate law  
**Evidence.** E-01, E-02, E-03, E-04  
**Decision.** `supported`

**Counterexample that would reject it.** A mature domain where every lawful stock quantity has the same party as owner and as custodian, and the documented VMI and consignment cases are treated as non-inventory.

**Runtime consequence.** Actions that change rights and actions that change possession are different. A warehouse field is not an owner field.

## L-INV-02. Location is not a party

**Claim.** A place answers where. A party answers who owns or who holds. Encoding a supplier as a warehouse or as Location Type Vendor is a source convenience.

**Kind.** candidate law  
**Evidence.** E-03, E-05, E-06, E-07  
**Decision.** `supported` as a domain split. `hypothesis` that OS forbids location-typed counterparties even as a projection

**Counterexample.** A jurisdiction where the legal custody record is the bonded warehouse identifier and no separate party is ever required.

**Runtime consequence.** Queries for "stock at supplier" must join a custody relation, not filter Location Type.

## L-INV-03. On-hand is not available

**Claim.** Physical quantity and quantity that may still be claimed are different facts. Available is a remainder of on-hand and exclusive claims, plus optional policy.

**Kind.** candidate law  
**Evidence.** E-08, E-09, E-10, E-11  
**Decision.** `supported`

**Counterexample.** A source that can promise and issue correctly with only one stored quantity and no reservation or commitment records.

**Runtime consequence.** Surfaces that show "in stock" must name which quantity they mean. See [quantities.md](quantities.md) Q-ONHAND versus Q-ATP.

## L-INV-04. Reservation is a claim, not a movement

**Claim.** A reservation reduces what others may consume. It does not change on-hand possession. It is tied to a purpose. Identity-bearing slices cannot be issued against a different purpose without releasing the claim.

**Kind.** candidate law  
**Evidence.** E-09, E-10, E-11, E-24  
**Decision.** `supported`

**Cross-link.** `research/domain/o2c/` L-004 on `origin/cursor/issue-16-domain-cfd8`.

**Counterexample.** Shared unreserved remainder of a batch can be delivered. That does not kill the law. Exclusivity is of the reserved quantity, not of the batch identity. Sibling product notes already record this.

**Runtime consequence.** A single reserved integer on Item is not enough. Purpose, warehouse, and identity grain must be addressable. Concurrent claims need isolation. L-INV-15.

**Open.** ValueFlows stores no reserved qty (E-12). Whether the claim is a Commitment, a relator, or a stock figure is `undetermined`. `docs/open-questions.md` Q12.

## L-INV-05. Movement is an occurrence. Balance is a projection

**Claim.** A trustworthy on-hand figure is explained by dated movements, receipts, issues, transfers, and applied adjustments. Editing a bin without an event is not an inventory fact.

**Kind.** candidate law  
**Evidence.** E-13, E-14, E-15, E-16  
**Decision.** `supported`

**Cross-link.** `research/foundation/state/` CL-1 and CL-3 on `origin/cursor/issue-12-foundation-cfd8`.

**Counterexample.** A domain that treats the counted bin as the only legal record and discards movement history, yet still answers recall and valuation. Not found this session.

**Runtime consequence.** Current state may be cached. The cache is not the authority. Wave B must not pick a store until this claim is kept or rejected.

## L-INV-06. Lot identity and serial identity are different grains

**Claim.** A lot identifies a substitutable group and carries quantity. A serial identifies one unit. They are not two labels for one type.

**Kind.** candidate law  
**Evidence.** E-17  
**Decision.** `supported`

**Cross-link.** `research/domain/product/` L-04 and L-06.

**Counterexample.** A lawful model where a serial regularly has quantity greater than one without being reclassified as a lot.

**Runtime consequence.** Reservation, recall, and valuation attach to either grain. Serial exclusivity is per unit. Lot exclusivity is per reserved quantity.

## L-INV-07. Negative stock is a policy exception, not a law

**Claim.** Fungible on-hand may be allowed to go negative when documents arrive out of order. Serial and lot identity cannot. A kernel that always allows or always forbids negative qty will fight the evidence.

**Kind.** candidate law  
**Evidence.** E-18, E-15, S-INV-36  
**Decision.** `supported` as "not a universal allow." `hypothesis` as the exact policy hook

**Counterexample.** A regulated serial flow that posts delivery before receipt and still claims one serial in two places as a valid book state.

**Runtime consequence.** Negative qty is a constraint with a declared scope. It is not an implicit integer.

## L-INV-08. Backdating changes valid time and forces later projections to move

**Claim.** A movement can be valid earlier than it was known. After it is recorded, balances and valuations that depend on that valid time must be recomputed or marked stale. Knowledge time does not change.

**Kind.** candidate law  
**Evidence.** E-19  
**Decision.** `supported` as ERPNext and temporal evidence. `hypothesis` that every inventory fact carries both times

**Cross-link.** `research/foundation/temporal/` L1 and L4. Seed S-007.

**Counterexample.** A real inventory close that never needs "what did we believe then" after a late receipt. Not found.

**Runtime consequence.** Posting date is a domain value. Freeze and role override are policy on the action. Query must name valid-then versus known-then.

## L-INV-09. Reconciliation is a raise or lower event, not a rewrite

**Claim.** A count is an observation. Applying it posts a variance event that states the resulting quantity, and optionally value, as of a time. It does not delete prior movements.

**Kind.** candidate law  
**Evidence.** E-14, E-15, E-16, E-20  
**Decision.** `supported`

**Counterexample.** A legal stocktake that replaces history and is still accepted as the audit trail. If that is common, the law is too strong and a "frozen snapshot" case is needed. State CL-3 already allows frozen derived figures.

**Runtime consequence.** Count and apply are different actions. Apply while picks are open is S-INV-27.

## L-INV-10. Valuation layers are not quantity layers

**Claim.** Cost is attached to quantity events or to identity-bearing units. Consigned on-hand can exist with zero valuation for the custodian. Changing costing method is not a stock movement.

**Kind.** candidate law  
**Evidence.** E-04, E-22, E-19 landed cost  
**Decision.** `supported` that valuation ≠ quantity. `undetermined` which methods are native

**Counterexample.** A source where quantity cannot be queried without a cost layer, including for consigned and zero-rate samples. ERPNext Allow Zero Valuation Rate argues the other way.

**Runtime consequence.** The engine must not contain `if objectType == "StockEntry" then postCOGS`. Policy on the event chooses whether a valuation layer is written.

## L-INV-11. Transformation is not transfer and not packing

**Claim.** Consuming inputs to create outputs, changing location or rights of the same resource, and packing resources that can later be separated are three relations.

**Kind.** candidate law  
**Evidence.** E-23  
**Decision.** `supported`

**Cross-link.** `research/standards/` L-004 and L-005.

**Counterexample.** A single parent-child form that answers recall, unpack, and ship-without-consume without hidden flags.

**Runtime consequence.** Recall walks transformation participation and may be lossy. Unpack walks aggregation. A transfer keeps identity.

## L-INV-12. Disposition is not location

**Claim.** Recalled, damaged, available, and in-transit are business conditions. They can coincide with a hold bin, but a bin is not the condition.

**Kind.** candidate law  
**Evidence.** E-21, E-03, S-GS1-CBV dispositions  
**Decision.** `hypothesis`

**Counterexample.** A warehouse that uses only locations for hold and never needs a condition that survives a bin move. Then disposition is a projection of location policy.

**Runtime consequence.** Do not invent a GS1 `quarantined` URI. If OS needs hold, compose location, disposition, or both, and document which is authoritative.

## L-INV-13. Transit is custody in motion. Ownership may already have moved

**Claim.** Goods between two places still have an owner and a possessor. Transit may be modeled as a location, a transport process, or a disposition. None of those three answers the other two.

**Kind.** candidate law  
**Evidence.** E-01 FOB, E-13 Add to Transit, E-03 `in_transit`  
**Decision.** `supported` as a split. `undetermined` as one preferred encoding

**Counterexample.** A source that can answer owner, possessor, and place for in-transit goods with only a Transit location type and no other facts.

**Runtime consequence.** Dropship and FOB tests must not assume the seller ever had Q-ONHAND.

## L-INV-14. Unit of measure conversion is not identity

**Claim.** Changing the unit or correcting a conversion factor does not mint a product. A wrong factor is a quantity and valuation error, not a new SKU.

**Kind.** candidate law  
**Evidence.** E-25  
**Decision.** `supported`

**Cross-link.** `research/domain/product/` L-05.

**Counterexample.** A source that must change product identity to convert kilograms to grams, other than a documented workaround.

**Runtime consequence.** Events carry a unit. Identity references do not. A conversion correction is a new event or a backdated recompute, not a silent UPDATE.

## L-INV-15. Concurrent reservation needs an exclusive claim on a slice

**Claim.** Two actions that both require available quantity on the same slice cannot both succeed for more than the remaining ATP. The slice key includes specification, identity grain, location, and owner or custodian.

**Kind.** candidate law  
**Evidence.** E-24, E-11  
**Decision.** `supported` as a requirement. `undetermined` as the isolation mechanism

**Counterexample.** A successful double-promise of the same serial, or of more than on-hand of a lot, that the business treats as correct.

**Runtime consequence.** Wave B transaction research should treat this as semantic pressure, not as a reason to pick a database today.

## L-INV-16. Correction adds facts. It does not erase occurrence

**Claim.** A duplicate or mistaken movement is handled by a new cancel, amend, revert, or error-declaration fact. The original occurrence remains explainable.

**Kind.** candidate law  
**Evidence.** E-26, S-INV-07, S-INV-34, S-INV-35  
**Decision.** `hypothesis`

**Counterexample.** A legal process that physically deletes the original stock ledger row and is still accepted as the audit. ERPNext cancel-and-amend may be this. If so, the law must weaken to "a successor pointer remains."

**Runtime consequence.** External timeouts stay unknown until a reconciling observation. Constitution §8 and §9.

## What this pass does not claim

These are not laws yet.

- A target inventory schema.
- That Reservation is a Relator primitive.
- That every fact is bitemporal.
- That FIFO, LIFO, or average must be in the kernel.
- That Warehouse, Location, or Asset are OS types.
