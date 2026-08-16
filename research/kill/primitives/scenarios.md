# Scenarios

**Kind:** reference  
**Retrieved:** 2026-08-16  
**Decision:** per card. These are adversarial tests, not executable suites.

Seed scenarios from `scenarios/README.md` are reused where they already kill a collapse. New cards are marked. Each card says which core it attacks and what would count as a counterexample to the attack.

## S-P-01. Four dates, one field

- Kind: counterexample to M1 and M2
- Setup: Seed S-001. Requested 18, promised 20, planned 21, delivered 22.
- Attack: M1 stores one `deliveryDate` Property. M2 stores one Fact predicate `delivery_date`.
- Expected if L-P-02 and E-001 hold: four different layers. At least one Intent or request, one Commitment, one plan, one Event.
- Counterexample to the attack: all four values are the same customer promise and operations never need them apart.
- Decision state: `supported` as a failed collapse of layers
- Runtime consequence: Generic Fact or Property named "the date" is illegal for this case.

## S-P-02. Stale approval after a receipt

- Kind: counterexample to M1 Policy-as-Function and M2 approved-Fact
- Setup: Seed S-003. Propose at 10:01. Receipt at 10:06. Approve at 10:07.
- Attack: M1 evaluates a Function at propose and treats approval as commit. M2 asserts `purchaseApproved=true`.
- Expected if L-P-12 holds: commit rebinds, sees 800 units, refuses or replans. Approval remains a judgment record.
- Counterexample to the attack: auditors accept the 1,000-unit purchase as authorized because a human clicked Approve, even after the receipt.
- Decision state: `supported` as a failed collapse of preview and commit
- Runtime consequence: Bind loci are not optional metadata.

## S-P-03. Timeout after a possible refund

- Kind: counterexample to M1 Action=Event and M2 failed Fact
- Setup: Seed S-004. Refund request leaves OS. Connection dies.
- Attack: M1 emits `RefundFailed` because the Action threw. M2 asserts `refunded=false` and a later retry uses a new key.
- Expected if L-P-03 holds: invocation is `unknown`. No economic Event yet. Retry uses the same identity.
- Counterexample to the attack: the payment network treats timeout as failure and a new key is always safe. Stripe docs say the opposite. E-006
- Decision state: `supported` as a failed collapse
- Runtime consequence: Effect outcomes live on the attempt. Business Events wait for observation.

## S-P-04. Supplier is also customer

- Kind: counterexample to M1 Interface-as-Role and M3 Role-as-Kind
- Setup: Seed S-005. Organization B sells to A and buys from A.
- Attack: M1 implements `Supplier` and `Customer` interfaces with two keys. M3 makes two Kinds.
- Expected if L-P-08 holds: one Organization. Two relationship-objects or role facts with validity.
- Counterexample to the attack: destroying the organization leaves a Supplier individual that still names the same legal party with no Organization left.
- Decision state: `supported` as a failed collapse
- Runtime consequence: Role names do not occupy the Interface slot.

## S-P-05. Employment with promote, suspend, terminate

- Kind: counterexample to M1 Link-only and a test of L-P-07
- Setup: Seed S-006. Person P at Organization O, position change, pay change, suspension, exit.
- Attack: M1 uses `worksFor` with properties on the edge or on Person. M2 uses loose Facts with no Action target.
- Expected if L-P-07 holds: an identifiable Employment Type. Actions target it. History stays as validity, not overwrite.
- Counterexample to the attack: those attributes stay correct on Person after the employer is replaced or merged. Issue 28 named this.
- Decision state: `supported` for the relationship-object. Native Relator sort still `rejected`
- Runtime consequence: M3 is not required to pass this test.

## S-P-06. Backdated stock

- Kind: counterexample to M1 current-field and M2 universal clocks
- Setup: Seed S-007. Believed 100 on Aug 10. Learn on Aug 12 that 20 left on Aug 8.
- Attack: M1 edits `qty=80` and `updatedAt`. M2 requires four timestamps on the warehouse note that recorded the rumor.
- Expected if L-P-10, L-P-11, and L-INV-08 hold: a movement Event with valid time Aug 8 and knowledge time Aug 12. Projections move. Decisions made on Aug 10 stay explainable as known-then.
- Counterexample to the attack: a real close that never needs known-then after a late receipt.
- Decision state: `supported` as a failed M1 collapse. Universal M2 clocks still `rejected` as a law
- Runtime consequence: Time is declared on the movement, not on every Type.

## S-P-07. Cancel after payment allocation

- Kind: counterexample to M1 mutable Event and M2 in-place Fact
- Setup: Seed S-010. Posted invoice, stock, payment allocation, then cancel.
- Attack: M1 sets `Invoice.status=cancelled` and deletes GL rows. M2 retracts the original Facts.
- Expected if E-007 and issue 21 L3, L4 hold: original Events remain. Compensating Events or a reverse Action add new rows. Cancel and reverse stay distinguishable.
- Counterexample to the attack: a regulated production system whose supported path is delete-and-rekey of posted rows with no residual original.
- Decision state: `supported` as a failed collapse
- Runtime consequence: Event nature refuses delete-as-cancel.

## S-P-08. Three sources, one promised date

- Kind: counterexample to M1 object merge
- Setup: Seed S-011. ERP says Aug 25. Spreadsheet says Aug 27. Chat says Aug 24.
- Attack: M1 Foundry-style merge. User edits win. Losing values leave the object. E-023
- Expected if E-015 holds: three assertions with provenance remain speakable. Accepted operational date, if any, is a Decision Action or a Bind projection.
- Counterexample to the attack: after splitting requested versus promised versus actual, no same-predicate clash remains in the first vertical. Issue 4 F1.
- Decision state: `hypothesis` as a Fact-sort pressure. `supported` as an M1 failure
- Runtime consequence: This is the cleanest path for Fact to grow back into M4.

## S-P-09. Unbalanced journal from a helpful agent

- Kind: counterexample to M1 Function-as-Constraint
- Setup: New. An agent calls `PostJournalEntry` with debit 100 and credit 90, then tries `InsertLedgerLine` to skip the named Action.
- Attack: M1 puts `BalancedJournal` inside the first Action body only.
- Expected if L-P-05 and issue 21 L1 hold: Bind at commit refuses both paths. No plug account.
- Counterexample to the attack: a mature ledger that posts unbalanced journals as the ordinary happy path with no suspense bucket.
- Decision state: `supported` as a failed M1 collapse
- Runtime consequence: Bind is mandatory at the write boundary, not a courtesy Function.

## S-P-10. Consignment quantity with zero carrying amount

- Kind: counterexample to M1 one inventory number and M3 one Event-nature covering valuation
- Setup: New, from issue 18 L-INV-01, L-INV-10 and issue 21 L11. Custodian holds 50. Owner is the consignor. Books carry zero.
- Attack: M1 one `qty` and one `value` on Stock. M2 one Fact `inventory(item, 50, $0)` as organizational truth. M3 one Event that is both movement and posting.
- Expected if L-P-13 holds: quantity Event, optional valuation Event, ownership Link or relationship-object, custody Link.
- Counterexample to the attack: a source where quantity cannot be queried without a cost layer, including for consigned goods.
- Decision state: `supported` as a failed collapse
- Runtime consequence: One Event sort, two individuals, named coupling.

## S-P-11. Two reservations, one serial

- Kind: counterexample to M2 remainder-only reservation
- Setup: New, from L-INV-04 and L-INV-15. Two Actions claim the same serial.
- Attack: M2 derives reserved as a rule over intents. No reservation individual.
- Expected: one exclusive claim object or Fact that the second Action can be refused against. Release names that claim.
- Counterexample to the attack: shared unreserved remainder of a batch can ship. That does not kill serial exclusivity.
- Decision state: `supported` as a requirement. Encoding as Relator `undetermined`
- Runtime consequence: M2 needs an identifiable claim anyway, which is a Type or a Fact-with-id. The verb `Reserve` remains an Action.

## S-P-12. Prior-period error versus current reverse

- Kind: counterexample to M1 one `fix` Action
- Setup: New, from issue 21 L15 and issue 12 CL-6. Material error in a closed year, discovered now.
- Attack: M1 one `FixJournal` that sometimes deletes, sometimes reverses in the open period, sometimes backdates.
- Expected: correction of valid-time belief and compensation in the open period are different Actions. Both representable.
- Counterexample to the attack: a reporting framework that requires material prior-period errors to hit current profit only, with no restatement view.
- Decision state: `hypothesis` as accounting law, `supported` as a primitive-reduction test
- Runtime consequence: Undo is not one verb. Issue 7 L-006.

## S-P-13. SOD with an exception window

- Kind: counterexample to M3 Policy-as-sort and M1 Bool Function
- Setup: New, from issue 67 L-06, L-07. The same principal must not create and approve a payment. A documented exception exists for ten days.
- Attack: M1 `canApprove` Function returns true because of the exception and forgets the forbid. M3 a Policy object with no fold.
- Expected if E-002 holds: combination is explicit. Exception is accepted residual risk for a window, not a deleted rule.
- Counterexample to the attack: a corpus where deleting the forbid and adding a permit is how exceptions work, and audit can still reconstruct the old forbid.
- Decision state: `hypothesis`
- Runtime consequence: Policy algebra lives in Bind, not in a single Bool.

## S-P-14. What would revive M1

- Kind: counterexample needed
- Setup: First vertical implemented on Type, Link, Function, Action only, with linters for Event immutability and policy fold.
- Pass condition: no escape-hatch Action that mutates posted occurrences, no skipped Bind at commit, no silent object merge, no timeout stored as failure, across accounting, inventory, and one external effect.
- Decision state: `undetermined`. Not run. This folder did not implement a vertical.
- Runtime consequence: If this pass condition is later met, L-P-14 dies and M4 shrinks.

## S-P-15. What would revive M2

- Kind: counterexample needed
- Setup: First vertical where every reconstructability failure traces to a stored current field with no Event, and Action stages plus unknown outcomes are expressible as Fact predicates without hidden verbs.
- Pass condition: issue 12 CL-5's revival test, plus L-P-03 expressed without an Action invocation record.
- Decision state: `undetermined`. Not run.
- Runtime consequence: Fact would become the kernel sort. RFC pressure would reverse L-P-10.

## S-P-16. What would revive M3

- Kind: counterexample needed
- Setup: Two corpora where Type plus Links plus Binds cannot keep Role out of the identity key or target relationship Actions.
- Pass condition: issue 3's own falsifier, met twice.
- Decision state: `undetermined`. HR did not meet it. E-010
- Runtime consequence: Relator returns as a native category. L-P-07 dies.
