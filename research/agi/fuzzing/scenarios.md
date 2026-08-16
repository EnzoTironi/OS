---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Attack cards

Twenty-four generated-scenario targets. Each card names kind, decision state, dimensions, the law it attacks, and what a shrink must keep.

These are research scenarios, not executable tests. Happy paths are omitted unless they set up the attack.

Seed overlap is cited, not copied. Sibling cards stay on their branches.

## S-FUZ-01. Partial ship then accelerate the rest

- Kind: counterexample
- Decision state: `supported` as a required distinction
- Dimensions: D-01
- Attacks: L-FUZ-01, sibling o2c leftover demand
- Setup: Order 10. Ship 4. Two plans cover the rest. Customer accelerates the remainder.
- Must answer: Same commitment? New plan versus mutated history?
- Shrink must keep: leftover demand separate from leftover bill
- Seed: S-002. Sibling S-O2C-02

## S-FUZ-02. Over-delivery of two extra units

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-01
- Attacks: overflow policy
- Setup: Promise 10. Warehouse ships 12.
- Must answer: Are 2 a new sale, a capped event, or an error? Does billing follow 10 or 12?
- Shrink must keep: promised qty and shipped qty as two facts
- Seed: sibling S-O2C-04

## S-FUZ-03. Late receipt after a later issue

- Kind: counterexample
- Decision state: `supported` as a required pair of times
- Dimensions: D-02
- Attacks: L-FUZ-05. Sibling L-INV-08
- Setup: Known stock 10 on Aug 10. Issue 15 on Aug 10. On Aug 12 a document proves 20 arrived on Aug 8.
- Oracle: metamorphic. Believed-then moves. Known-then does not.
- Shrink must keep: both timestamps
- Seed: S-007. Sibling S-INV-02
- Source echo: E9 repost. Not the correct valuation number.

## S-FUZ-04. Backdate into a closed period

- Kind: counterexample
- Decision state: `supported` as ERPNext documented block. `hypothesis` as domain law
- Dimensions: D-02, D-03
- Attacks: L-FUZ-07
- Setup: Period closed. User tries a backdated cancel or amend.
- Must answer: Refuse, reopen under authority, or post a current-period compensating action?
- Shrink must keep: the close event
- Source echo: E9 period controls. Source-system artifact until a second family agrees.

## S-FUZ-05. Cancel after shipment and payment

- Kind: counterexample
- Decision state: `supported`
- Dimensions: D-03
- Attacks: L-FUZ-07
- Setup: Invoice posted. Stock moved. Payment allocated. User cancels the invoice.
- Must answer: Refuse, reverse, or return? Do original rows remain?
- Shrink must keep: at least one irreversible downstream occurrence
- Seed: S-010. Sibling S-O2C-07, S-O2C-08
- Differential: E9 reversal rows versus E10 reverse transfer plus credit note. Type this. Do not majority-vote.

## S-FUZ-06. Cancel a draft versus cancel a commitment

- Kind: counterexample
- Decision state: `supported` as a timing split
- Dimensions: D-03
- Attacks: L-FUZ-03
- Setup: Same parameters. Cancel before submit, then replay with cancel after accept and before fulfill.
- Must answer: Is the first a non-event? Is the second a compensating action?
- Shrink must keep: the submit boundary
- Source echo: E9 draft may be deleted. Submitted cancel keeps history.

## S-FUZ-07. Duplicate receipt from two integrations

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-04
- Attacks: L-FUZ-09
- Setup: Same supplier document arrives twice with different message ids.
- Must answer: What identity makes the second a duplicate? Does quantity double?
- Shrink must keep: occurrence key versus message key
- Seed: sibling S-INV-07

## S-FUZ-08. Reordered ship and receive observations

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-04, D-12
- Attacks: L-FUZ-09, L-FUZ-03
- Setup: Carrier scan "delivered" arrives before warehouse "issued."
- Must answer: Two observations of one flow, or two occurrences? Can on-hand go negative as a policy exception?
- Shrink must keep: both observations and their known times
- Sibling: L-INV-07 negative stock as policy

## S-FUZ-09. Consigned stock sold by the custodian

- Kind: counterexample
- Decision state: `supported`
- Dimensions: D-05
- Attacks: L-FUZ-08
- Setup: Vendor owns 50 in warehouse W. Consignee sells 12.
- Must answer: Whose rights fall? Whose on-hand falls? Whose valuation changes?
- Shrink must keep: owner and custodian as two parties
- Seed: sibling S-INV-04. E11 `transferAllRights` versus `transferCustody`

## S-FUZ-10. Loan of a serialized tool

- Kind: counterexample
- Decision state: `supported` as a split. `hypothesis` as encoding
- Dimensions: D-05, D-06
- Attacks: L-FUZ-08
- Setup: Serial S is loaned for a week. Title stays.
- Must answer: Does Q-OWNED change? Does location change? Does the serial change?
- Shrink must keep: rights unchanged while custody moves
- Seed: sibling S-INV-09. E11 `transferCustody` plus `move`

## S-FUZ-11. Lot recall across a transformation

- Kind: counterexample
- Decision state: `supported`
- Dimensions: D-06
- Attacks: sibling L-INV-11
- Setup: Defective input lot. Multiple output lots. Split across customers. Some still in transit.
- Must answer: Can the walk name every possible output? Is quantity separate from lot identity?
- Shrink must keep: transformation participation, not only transfers
- Seed: S-008. Sibling S-INV-03. E12 TransformationEvent

## S-FUZ-12. Pack then unpack the same serials

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-06
- Attacks: sibling L-INV-11
- Setup: Serials enter a pallet. Pallet ships. Pallet is unpacked at the customer DC.
- Must answer: Aggregation versus transformation? Do child identities survive?
- Shrink must keep: parent and children
- Source echo: E12 AggregationEvent Action add versus delete. EPCIS is a visibility standard, not a valuation oracle.

## S-FUZ-13. Pay an invoice after the rate moved

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-07
- Attacks: L-FUZ-05
- Setup: Invoice in USD at rate R1. Settlement at R2. Company books in BRL.
- Must answer: Where does the difference live? Does the claim's original base amount rewrite?
- Shrink must keep: R1 and R2
- Source echo: S-ERPN-LED foreign-currency paragraph. Source artifact names are not OS types.

## S-FUZ-14. Revalue an open foreign balance

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-07
- Attacks: L-FUZ-05
- Setup: Open receivable. Month-end revaluation. Later settlement at a third rate.
- Must answer: Unrealized then realized. Can both be explained?
- Shrink must keep: revaluation as a dated observation or action, not a silent rate overwrite
- Source echo: ERPNext Exchange Rate Revaluation document. Source-system artifact.

## S-FUZ-15. Tax rate changes between accept and invoice

- Kind: counterexample
- Decision state: `undetermined` as a law. `supported` as a required attack
- Dimensions: D-08
- Attacks: L-FUZ-05
- Setup: Accept under 18 percent. Law changes to 20 percent before invoice. Goods already reserved.
- Must answer: Which rate binds? Is the difference a new claim?
- Shrink must keep: accepted tax and invoiced tax
- Limits: Brazilian fiscal docs not opened. Sibling issue 29 unread this session.

## S-FUZ-16. Substitute at pick, return the substitute

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-09
- Attacks: sibling S-O2C-05
- Setup: Commitment is item P. Picker ships approved Q. Customer returns Q.
- Must answer: Does the commitment change resource, or does the event cite Q against the same demand?
- Shrink must keep: committed resource and event resource
- Manufacturing analog: S-M02

## S-FUZ-17. Two orders race the last serial

- Kind: counterexample
- Decision state: `supported` as ERPNext reserved-serial behavior. `hypothesis` as domain law
- Dimensions: D-10
- Attacks: L-FUZ-10's exclusivity neighbor. Sibling S-INV-01, S-O2C-15
- Setup: Orders A and B confirm at the same second for serial S.
- Must answer: Does B read stale on-hand? Is the loser still a commitment?
- Shrink must keep: both Attempts and one exclusive Occur
- Falsifies last-write-wins

## S-FUZ-18. Approval after the assumption died

- Kind: counterexample
- Decision state: `supported` as a required attack
- Dimensions: D-11, D-15
- Attacks: L-FUZ-10
- Setup: Agent proposes buy 1000 because on-hand is 20 and demand is 980. Receipt of 800 posts at 10:06. Human approves at 10:07.
- Must answer: What was approved? Must commit re-read?
- Shrink must keep: the intervening Occur between Attempt-propose and Attempt-commit
- Seed: S-003. E14

## S-FUZ-19. Timeout after a possible remote success

- Kind: counterexample
- Decision state: `supported` as a required unknown
- Dimensions: D-12
- Attacks: L-FUZ-03
- Setup: Action requests an external change. Connection dies. Remote may have applied.
- Must answer: Can outcome stay unknown? What evidence allows retry?
- Shrink must keep: ExternalUnknown. Do not shrink it to failed
- Seed: S-004. Constitution rule 9

## S-FUZ-20. Three sources, one promised date field

- Kind: counterexample
- Decision state: `supported` as a required split
- Dimensions: D-13
- Attacks: L-FUZ-03, L-FUZ-11
- Setup: ERP says 25 Aug. Spreadsheet says 27 Aug. Chat says 24 Aug.
- Must answer: Same property or collapsed dates? If they conflict, do all three claims remain?
- Shrink must keep: three Observe steps with different sources
- Seed: S-011. E13. Induction homonym versus genuine conflict

## S-FUZ-21. Policy revision after a historical discount

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-14
- Attacks: L-FUZ-13
- Setup: V1 allows a discount. Action commits. V2 changes the function. Auditor asks why years later.
- Must answer: Can the old revision be recovered without replaying V2?
- Shrink must keep: ontology_pin on the commit step
- Seed: S-012

## S-FUZ-22. BOM revision mid-order

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-14, D-09
- Attacks: L-FUZ-13
- Setup: Order copies BOM A. BOM B substitutes a solvent. Order is half issued.
- Must answer: Does B change required qty in place? Which specification does genealogy cite?
- Shrink must keep: specification identity at authorize time
- Seed: manufacturing S-M01

## S-FUZ-23. Agent double-submits after revocation

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-15, D-04, D-11
- Attacks: L-FUZ-10, L-FUZ-09
- Setup: Human delegates a one-task purchase. Revokes mid-flight. Agent retries with the old idempotency key and with a new key.
- Must answer: Which Attempts are authorized? Is the second key a new action?
- Shrink must keep: Revoke between the two Attempts
- Open questions cited, not answered: items 10 and 11

## S-FUZ-24. Offline warehouse versus online reservation

- Kind: counterexample
- Decision state: `hypothesis`
- Dimensions: D-12, D-10, D-01
- Attacks: L-FUZ-03
- Setup: Warehouse scanner is offline. It issues 6. Meanwhile the online system reserves those 6 for another order. Scanner later uploads.
- Must answer: Two Attempts on one quantity. Which observation wins? Can both remain?
- Shrink must keep: unknown-then-observed issue, not a silent last write
- Pairwise cell for M2

## How to turn a failure into a question

Run the process in [dsl.md](dsl.md). Example using S-FUZ-05.

1. Shrink until removing shipment or payment makes cancel succeed as a simple reverse.
2. If ERPNext reverses rows and Odoo demands a return plus credit note, type the disagreement. Likely collapsed modality if both keep history, or genuine conflict if one deletes.
3. Write the question. "Is cancellation of a posted invoice a reversal of the same occurrence, a new compensating occurrence, or a refused action once fulfillment exists?"
4. Land that sentence on the o2c or foundation card. Do not edit `docs/open-questions.md`.
5. Leave the law `hypothesis` until a human promotes it.

A card that stops at "the two ERPs differ" has not finished.
