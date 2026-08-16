# Candidate laws

**Kind.** candidate law  
**Fetched.** 2026-08-16  
**Decision.** per law. Never `accepted`.

Smallest claims that still fit the evidence. Each law names a falsifier and a runtime consequence. These are not RFC-0001 edits.

## L-01. Action is not Event, including outside commerce

**Claim.** An attempted, authorized, or proposed intervention is a different sort from an observed occurrence in SaaS, care, insurance, energy markets, and public cases. One Action may yield zero, one, or many Events. Events may arrive with no OS Action.

**Kind.** candidate law  
**Evidence.** E-01, E-06, E-16. SIB-56 L-P-02  
**Decision.** `supported`

**Counterexample that would reject it.** A mature operational domain where "we requested X" and "X occurred" are safely one record, including timeouts, denials, and late observations.

**Runtime consequence.** Surfaces share Actions. Ledgers, meters, adjudications, and dispositions store Events. A generic engine must not treat `status=canceled` as proof that access ended.

## L-02. A standing or contingent promise is not the satisfying event

**Claim.** Subscriptions, coverages, leases, loans, episodes, and cases can exist as open promises or responsibility intervals. Usage, visits, payments, commencements, and dispositions are later events. Creating the promise does not fulfill it.

**Kind.** candidate law  
**Evidence.** E-01, E-05, E-06, E-09, E-13, E-14  
**Decision.** `supported`

**Counterexample.** A domain where creating the standing object is legally identical to performance, with no later observation, and auditors accept that.

**Runtime consequence.** `AcceptAgreement` must not mint fulfillment Events. Remainders are projections over the promise and later events.

## L-03. Specification is not instance, including when nothing is stocked

**Claim.** A plan, price, instrument definition, insurance product, or service description can be sold, promised, or scheduled without minting an inventoried individual.

**Kind.** candidate law  
**Evidence.** E-04, E-06, E-10, E-14. SIB-15 L-01, L-09  
**Decision.** `supported`

**Counterexample.** A source that cannot create a subscription, coverage, or loan without first creating a stock instance.

**Runtime consequence.** Inventory constraints are conditional on a capability of the specification. They are not a kernel requirement of Type.

## L-04. Inventory movement is not the fulfillment primitive

**Claim.** A commitment can be satisfied by access over an interval, observed work, a visit, an adjudication, a progress measure, a metered flow, or a legal disposition. A stock move is one satisfaction family.

**Kind.** candidate law  
**Evidence.** E-03, E-05, E-08, E-11, E-12, E-15. S-01 through S-07  
**Decision.** `supported`

**Counterexample.** A lawful model where every recognized satisfaction in those domains is rewritten as a warehouse movement without leftover ambiguity.

**Runtime consequence.** The engine must not contain `if fulfilled then moveStock`. Domain definitions choose the satisfaction Events.

## L-05. One-shot leftover quantity is not the only remainder

**Claim.** Open demand can be remaining period, remaining seats or credits, remaining coverage limit, remaining billable hours, remaining percent of a performance obligation, remaining imbalance, or remaining case work. Unshipped quantity is one remainder.

**Kind.** candidate law  
**Evidence.** E-01, E-02, E-07, E-08, E-15. S-01, S-02, S-04, S-06  
**Decision.** `supported`

**Counterexample.** A domain where all of those remainders collapse to one unshipped-qty field with no audit loss.

**Runtime consequence.** Remainder is a function of a commitment and its events, in the commitment's unit. Do not store a single `qty_left` on every Type.

## L-06. Title, use, custody, and control are different facts

**Claim.** A thing can have legal title in one party, right of use in another, physical custody in a third, and control of an issuer or role in a fourth. One owner pointer cannot carry the bundle.

**Kind.** candidate law  
**Evidence.** E-09, E-10, E-17. S-10. SIB-15 L-06. SIB-26 L-009  
**Decision.** `supported` as a distinction. Encoding `undetermined`

**Counterexample.** A domain where those four questions always have the same answer and never need history.

**Runtime consequence.** Actions that transfer use must not silently transfer title. Queries must say which right they mean.

## L-07. Performance window is not invoice window

**Claim.** The interval during which access, work, or coverage is evaluated can differ from the interval that groups those observations into a claim.

**Kind.** candidate law  
**Evidence.** E-02, E-03, E-08  
**Decision.** `supported` for SaaS and construction. `hypothesis` as a universal cut

**Counterexample.** A recurring domain that always invoices on the same bounds as performance and never needs to explain a split.

**Runtime consequence.** Rating Functions take a service interval. `IssueClaim` takes a billing interval. They may coincide. They are not one property.

## L-08. Observed, authorized or billable, and claimed are three quantities

**Claim.** What happened, what a standing agreement allows to charge or cover, and what was placed on a claim can differ. Policy can force them equal. The model must still be able to store the split.

**Kind.** candidate law  
**Evidence.** E-03, E-06, E-08, E-12, E-15  
**Decision.** `supported`

**Counterexample.** A source that has one quantity field for all three and still handles denied claims, NTE caps, and unpriced change orders.

**Runtime consequence.** Progress reports and aging reports are different queries.

## L-09. A long-running container is not a workflow primitive

**Claim.** EpisodeOfCare, Case, Subscription, and Project organize related activities over time. That does not earn Workflow as a base ontology sort. The container is a Type with events and maybe object-backed relations.

**Kind.** candidate law  
**Evidence.** E-05, E-13, E-01. S-RFC "Workflow" exclusion  
**Decision.** `supported` as a rejection of Workflow-as-primitive. Shared container pattern `hypothesis`

**Counterexample.** A first vertical where ordinary Types cannot express statutory case sequence or care transfer without a hidden workflow engine.

**Runtime consequence.** Wave B must not ship a workflow kernel because healthcare and public sector exist. Compose Actions and Events first.

## L-10. Consume-produce is a plant law. It is not the Process primitive

**Claim.** Manufacturing transformations that consume identified inputs and produce identified outputs are real. Many operational domains never mint a new material identity. Field service may consume without producing.

**Kind.** candidate law  
**Evidence.** E-12, E-18. S-09. SIB-19 L1, L12  
**Decision.** `supported`

**Counterexample.** A source that cannot record a visit, a subscription period, or a case filing unless it also writes consume and produce of a SKU.

**Runtime consequence.** Genealogy and TransformationEvent stay in manufacturing and traceability definitions. The generic engine must not require IPO on every Process.

## L-11. Offer, standing instrument, and instance membership are three descriptions

**Claim.** InsurancePlan, pricing plan, and instrument definition describe what can be offered. Coverage, subscription, and position bind a party to a version of that offer. Certificate, card, and confirmation are evidence, not the instrument.

**Kind.** candidate law  
**Evidence.** E-01, E-06, E-07, E-10. R-02  
**Decision.** `supported` for the insurance and SaaS split. `hypothesis` for a shared three-layer law

**Counterexample.** A regulated market that treats the certificate or the trade confirmation as the only contract and has no standing instrument.

**Runtime consequence.** Printing a certificate or invoice must not mint the agreement.

## L-12. Occurrence time, notice time, and instrument time can disagree

**Claim.** When the world happened, when someone told the system, and when the covering instrument was in force are three times. Claims-made versus occurrence coverage exists because those times can pick different instruments.

**Kind.** candidate law  
**Evidence.** E-07, E-03, E-05. S-OQ question 3  
**Decision.** `supported` as a distinction. How it maps to bitemporality `undetermined`

**Counterexample.** A domain where those three times never diverge and late notice never changes which instrument applies.

**Runtime consequence.** Do not invent an answer to `docs/open-questions.md` question 3 or 7 from this card. Record that insurance supplies a falsifier for one `delivery_date`.

## L-13. Customer, patient, insured, lessee, and official are roles

**Claim.** The enduring party can outlive a commercial or care relationship. The relationship carries terms, periods, and actions.

**Kind.** candidate law  
**Evidence.** E-05, E-13, E-09. S-SCEN S-005, S-006  
**Decision.** `supported`

**Counterexample.** A source that must mint a new legal person when a supplier becomes a customer, or when a patient becomes a subscriber.

**Runtime consequence.** Role names do not belong in the identity key. Matches SIB-56 L-P-08.

## Rejected as universal laws

| Rejected claim | Why | State |
| --- | --- | --- |
| Every fulfillment is an inventory movement | E-04, E-11, L-04 | `rejected` |
| The commercial primitive is a one-shot sales order | E-01, E-06, L-02 | `rejected` |
| Every process consumes and produces material identity | E-18, L-10 | `rejected` |
| One owner field is ownership | E-09, L-06 | `rejected` |
| Leftover demand is unshipped quantity | L-05 | `rejected` |
| Item or Product is the resource type | SIB-15 R-01, E-04 | `rejected` |
| FHIR Subscription is evidence of SaaS billing | R-01 | `rejected` |
| Workflow is required as a base sort | L-09 | `rejected` as primitive |
| Relator is required as an engine sort | SIB-56 L-P-07. This pass adds pressure only | `undetermined` as sort. `rejected` as required this pass |
| Fact is the only information atom | SIB-56 L-P-10, matrix | `rejected` |

## Runtime pressure if the supported laws survive

**Kind.** runtime consequence

- Named Actions at phase changes on standing objects. Not generic field writes on `status` or `qty_left`.
- Remainders as projections in the commitment's unit.
- Rights queries that name title, use, custody, or control.
- Unknown collection outcomes after a charge attempt. This folder does not answer `docs/open-questions.md` question 5.
- No `if objectType == "SalesOrder"` and no `if objectType == "WorkOrder"` in a generic engine.
- Wave B storage and workflow recommendations wait. These laws are semantic pressure only.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. These laws pressure falsification targets 1, 2, 3, 4, and 10. They do not shrink the candidate list. Sibling issue 56 already proposed a smaller core. This folder neither accepts nor rejects that shrinkage.
