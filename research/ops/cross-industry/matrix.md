# Primitive stress matrix

**Kind.** convergence and stress  
**Fetched.** 2026-08-16  
**Decision.** per row. Never `accepted`.

This is the issue 79 deliverable. It is not a feature checklist. A cell says whether a candidate semantic survived a named attack.

Marks.

- **G.** Generalizes. Independent non-ERP sources make the same cut.
- **E.** Enterprise-domain-specific. Survives plants and commerce. Fails or stays silent outside them.
- **R.** Needs reframing. The cut is real. The ERP wording is the wrong law.
- **X.** Rejected as a universal kernel law.
- **?** Not evidenced enough this pass.

## RFC-0001 candidate forms

| Candidate | SaaS | Services | Healthcare | Insurance | Construction | Energy | Instruments | Field service | Lease | Public case | Verdict | State |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Action ≠ Event | G. Cancel and collect are attempts. Access end is later. E-01, E-16 | G. Invoice ≠ acceptance. SIB-29 | G. Claim is a request. E-06 | G. FNOL and predetermination are requests. E-06, E-07 | G. Approve change ≠ pour concrete. E-08 | G. Bid or schedule ≠ metered delivery. E-11 | G. Payment instruction ≠ payment event. SIB-22 | G. Assign appointment ≠ complete job. E-12 | G. Sign lease ≠ commencement use. E-09 | G. File ≠ disposition. E-13 | Generalizes | `supported` |
| Event nature must refuse silent edit | G. New invoice, not rewrite period. E-03 | G. Compensating time. SIB-29 L-014 | G. statusHistory. E-05 | G. Later claim does not delete occurrence. E-07 | G. Catch-up is a new measure. E-08 | ? | G. Chargeback is a later event. SIB-22 | G. Product Consumed is a record. E-12 | G. Modification is a new lease assessment. E-09 | G. New filing. E-13 | Generalizes | `supported` |
| Commitment ≠ occurrence | G. Subscription versus usage versus invoice. E-01, E-03 | G. SIB-29 L-001 | G. Episode versus Encounter. E-05 | G. Coverage versus claim. E-06 | G. Contract versus progress. E-08 | G. Schedule versus meter. E-11 | G. Obligation versus payment event. E-10 | G. Product Required versus Consumed. E-12 | G. Lease versus commencement. E-09 | G. Case versus disposition. E-13 | Generalizes | `supported` |
| Offer or intent ≠ commitment | G. Pricing plan versus subscription. E-01 | G. Quote versus order. SIB-16 | G. InsurancePlan versus Coverage. E-06 | G. Predetermination. E-06 | G. Unpriced change. E-08 | G. Bid versus contract. E-11 | ? prospectus versus trade | ? | G. Inception assessment versus commencement. E-09 | ? | Generalizes where opened | `supported` |
| Type or ObjectType for identifiable things | G. Customer, subscription, price | G. Project, task | G. Patient, EpisodeOfCare | G. Coverage, Claim | G. Contract, WBS | G. Market participant, metering point | G. Instrument, position | G. Work Order, Product Item | G. Underlying asset, ROU | G. Case, filing | Generalizes as a sort. Not as Item | `supported` as sort. `rejected` as Item |
| Interface as shared shape | R. Entitled versus Priceable | R. Billable | R. Patient is not InventoryResource | R. Coverable | R. Progressable | R. Flowable | R. Negotiable | R. Maintainable | R. Usable | R. Filable | Shape may help. Role-as-interface fails | `undetermined` as sort. Role carrier `rejected` |
| Property as a base sort | E. Amounts live on types | E | E | E | E | E | E. MonetaryAmount | E | E | E | Still a value, not a sort | `rejected` as sort. Matches SIB-56 L-P-09 |
| Link versus object-backed relation | R. Subscription item | R. Assignment | R. EpisodeOfCare | R. Coverage | R. Change order | R. Contract position | R. Ownership, control | R. Appointment | R. Lease | R. CaseOfficial | Standing relations have lifecycle | `supported` as pattern. Native Relator `undetermined` |
| Function | G. Rating, proration, progress | G. Cost versus price | G. Eligibility | G. Coordination of benefits | G. Percent complete | G. Imbalance, formula out of CIM | G. Accrual, option payoff | G. Duration | G. PV of payments | ? | Generalizes as computation | `supported` |
| Constraint versus Policy | ? fail-closed rating | ? NTE cap | G. Coverage in force | G. Notice-prejudice | ? | ? market rules | ? | ? | G. Identified asset test | G. Authority to file | Bind-job hypothesis from SIB-56 not retested | `undetermined` here |
| Fact as sole atom | X. Periods, statuses, and meters are not one assertion type | X | X. statusHistory plus events | X. Three dates | X | X. Flow over interval | X | X | X. Commencement plus term | X | Still not the only atom | `rejected` as sole atom |
| Identity | R. Entitlement and account, not serial | R. Engagement undetermined | R. Patient plus org episode | R. Policy number plus person | R. Contract plus site | R. Point plus interval | R. Instrument versus position | R. Asset serial versus van quant | R. Building versus ROU | R. Docket plus case | Identity generalizes. Grain must vary | `supported` as a concern. `rejected` as lot-or-serial only |
| Valid time versus known time | G. Backdated subscription. E-03 | G. Late timesheet | G. statusHistory. E-05 | G. Occurrence versus notice. E-07 | G. Late priced change. E-08 | G. Meter versus settlement | ? | G. Required versus consumed | G. Inception versus commencement | G. Filing versus disposition | Generalizes. Not every row needs both | `supported` |
| Provenance | G. Meter source | G. Who logged hours | G. Which org's episode | G. Certificate versus policy | G. Who approved scope | G. Meter authority | G. Trade source | G. Van versus store purchase | G. Contract text | G. Filing author | Generalizes as meaning when authority depends on it | `hypothesis` as kernel attachment |
| Workflow as a primitive | X. Subscription is not a workflow sort | X | X. Episode is tracking, not CarePlan | X | X | X | X | X. Appointment is a scheduled occurrence | X | X. Case is an aggregation | Long-running container ≠ workflow primitive | `rejected` as primitive |

## ERP-shaped assumptions

| Assumption | What the corpus tempts | Cross-industry result | Verdict | State |
| --- | --- | --- | --- | --- |
| Tangible resource identity | SKU, lot, serial, GTIN | Licensed seats, coverage cards, market positions, instruments, cases, and episodes identify without stock instances. E-04, E-06, E-10, E-11, E-13 | Specific to inventoried goods | `rejected` as universal. Spec-versus-instance still `supported` |
| Linear leftover-quantity fulfillment | Order 10, ship 4, leftover 6 | Remaining period, remaining coverage, remaining entitlement, remaining case work, and percent complete are different remainders. S-01, S-02, S-04, S-06, S-11 | Needs reframing as remainder of a commitment, not unshipped qty | `rejected` as the only remainder. Remainder-as-projection `supported` |
| Inventory movement as fulfillment | Delivery Note is the event | Usage, visit, adjudication, progress, imbalance, exercise, disposition, and commencement often fulfill without a move. E-03, E-05, E-08, E-11 | Specific to goods | `rejected` as universal |
| Simple ownership | One owner field | Title, use, residual, custody, beneficial hold, and control split. E-09, E-10, E-17, S-10 | Needs a rights bundle | `rejected` as one pointer |
| One-time order | Sales Order is the commercial primitive | Subscription, Coverage, lease, loan, episode, and case are standing or contingent. E-01, E-06, E-09, E-13 | Specific to discrete commerce | `rejected` as the commercial primitive |
| Manufacturing transformation | Consume inputs, produce outputs | SaaS, coverage, case, lease, and many services have no new material identity. Field service may consume without producing. E-12, E-18, S-09 | Specific to plants and some repairs | `rejected` as the only Process |
| Shipment before receivable | Delivery then invoice | Licensed invoices, prepay, construction progress bills, and healthcare claims fire without shipment. E-01, E-06, E-08 | Already rejected in SIB-16. Still rejected | `rejected` |
| Customer as a kind | Customer master | Patient, subscriber, insured, lessee, market participant, and case party are roles. E-05, E-13 | Role, not kind | `supported` as role. Matches thesis H5 leftover |
| Item as one catalog type | Item or Product master | InsurancePlan, Price, Instrument, Coverage, and ServiceRequest are different kinds of description. E-04, E-06, E-10 | Source artifact | `rejected`. Matches SIB-15 R-01 |
| Warehouse as the only place | Bin location | Metering point, functional location, jurisdiction, docket, and service address are places with other invariants. E-11, E-12, SIB-26 | Specific to stock | `rejected` as the only place |
| Primary output | One production item | Construction WIP is customer-controlled. Options do not produce a "primary" good. Episodes have no output SKU. S-06, S-08 | Specific to some plants | `rejected` as universal. Matches SIB-19 L9 pressure |

## What generalizes

Independent sources outside manufacturing ERP agree on these cuts.

1. Attempted intervention is not occurrence. E-16.
2. Standing or contingent promise is not the satisfying event. E-01, E-05, E-06, E-09.
3. Kind description is not an inventoried individual. E-04, E-06, E-14.
4. Money claim is not settlement. SIB-22 plus E-06.
5. Work or responsibility container is not the commercial commitment. E-05, E-13, SIB-29.
6. Observed, billable, and invoiced can differ. E-03, E-08, E-15.
7. Title, use, custody, and control can differ. E-09, E-17.
8. Valid time and knowledge time can differ. E-03, E-07.
9. Correction appends. It does not erase.

## What is enterprise-domain-specific

Keep these in domain definitions. Do not put them in the generic engine.

1. Lot and serial grains.
2. Warehouse, bin, and quant keys.
3. BOM, routing, WIP warehouse, and backflush.
4. Delivery Note as a required document.
5. One-shot sales order identity.
6. Primary production item.
7. Negative stock policies.

## What needs reframing

| ERP wording | Reframe under test | State |
| --- | --- | --- |
| Fulfillment | Satisfaction of a commitment by events or by a progress measure over an interval | `hypothesis` |
| Resource | Specification, entitlement or right, position, physical instance, continuous quantity. Not one Item | `hypothesis` |
| Ownership | Time-bounded rights bundle. Title, use, residual, custody, beneficial hold, control | `hypothesis` |
| Order | Agreement of reciprocal commitments. May be standing, contingent, or one-shot | `hypothesis` |
| Transformation | Material consume-produce is one process family. Grant, adjudicate, dispose, exercise, and imbalance are others | `hypothesis` |
| Reservation | Exclusive claim on a slice, a seat, a fund, a slot, or eligibility | `hypothesis` |
| Quantity remaining | Remainder of the commitment in its own unit. Days, seats, limit, percent, MWh, hours | `hypothesis` |
| Location | Place typed by invariant. Stock place, capable place, metering point, jurisdiction | `hypothesis` |

## Source artifacts. Do not import

Stripe status enum and Billing Meters product. FHIR resource names and Claim.use codes. ACORD form numbers. IFRS lessee single-model bookkeeping. CIM/XML and ESMP documents. Salesforce Work Order and Price Book. NIEM element names. ERPNext and Odoo DocTypes from sibling folders.

## Divergence that must stay open

1. Whether Coverage, Lease, and CaseOfficial force a native Relator sort. SIB-56 rejected the sort on present evidence. This pass adds pressure and does not reopen the RFC.
2. Whether a billable observation is already a Claim. SIB-29 left this undetermined. Stripe invoices and FHIR Claims do not settle it.
3. Whether a financial position is a new identity or a slice of an instrument. E-10.
4. Whether energy imbalance is a Claim, an Event, or both. E-11.
5. Whether EpisodeOfCare, Case, and Subscription share one "standing container" pattern or stay ordinary types.
