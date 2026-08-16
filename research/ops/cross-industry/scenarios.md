# Scenarios

**Kind.** counterexample  
**Fetched.** 2026-08-16  
**Decision.** per scenario. These are attacks, not product designs.

Each scenario exists because it breaks an ERP-shaped assumption. Happy-path catalogs are out of scope.

## S-01. Seat change mid-period on a licensed SaaS plan

**Attacks.** one-time order. inventory movement. tangible identity.

A customer has 10 licensed seats. On day 12 of a 30-day period they add 4 seats. On day 20 they remove 2. Usage meters also record API calls.

**Questions.**

- What is the identity of the original commitment?
- Is the mid-period seat change an amendment, a new commitment, or a quantity edit?
- Which invoice owns the proration?
- Where does remaining entitlement live if there is no warehouse?

**If OS models this as a sales order of 10 plus a delivery note, the model is wrong.**

**Decision.** `supported` as a required attack. Encoding `undetermined`.

## S-02. Cancel at period end after usage has accrued

**Attacks.** linear fulfillment. leftover unshipped quantity.

The customer sets `cancel_at_period_end`. Collection is later paused. Meter events keep arriving until the service interval ends. The final invoice must include accrued usage. Access should stop at `ended_at`, not at the moment the cancel Action was submitted.

**Questions.**

- Is cancel an Action that schedules an Event, or an Event that rewrites status?
- Can `canceled_at` and `ended_at` stay different facts?
- What leftover exists? Unused days, unused credits, or unused seats?

**Decision.** `supported` as a required attack.

## S-03. Time and materials hours that the contract will not pay

**Attacks.** inventory movement. manufacturing transformation. simple leftover demand.

A consultant logs 12 hours. The engagement is T&M with a not-to-exceed cap. 2 hours are internal rework. 1 hour exceeds the cap. A fixed-price sibling workstream on the same project is 40 percent complete and 10 percent billed.

**Questions.**

- Which quantity is fulfillment. Observed, billable, or invoiced?
- Does extra cost raise the commercial commitment?
- Is there a stock movement?

Sibling issue 29 already records this split. This scenario keeps it in the stress set so synthesis cannot treat it as a project-app exception.

**Decision.** `supported`.

## S-04. Chronic-care episode with no visit this month

**Attacks.** linear fulfillment. one-time order. tangible identity.

A diabetes EpisodeOfCare is `active` for eleven months. No Encounter occurs in month seven. The managing organization still has responsibility. A later Encounter at a different hospital creates a second EpisodeOfCare. Billing uses a Coverage that was not in force on the first referral date and is in force on the visit date.

**Questions.**

- What is "open leftover demand" when no visit is owed?
- Is the patient a Customer kind or a role on Coverage and EpisodeOfCare?
- Which valid time decides coverage. Referral, visit, or claim?

**Decision.** `supported`.

## S-05. Predetermination, then preauthorization, then claim, then denial

**Attacks.** commitment is occurrence. shipment before receivable. simple ownership.

A dentist sends a predetermination. The payor says a crown would be covered at 50 percent. The dentist sends a preauthorization and treats. The claim is denied because notice was late on a claims-made rider. A secondary Coverage exists. Coordination of benefits has not run.

**Questions.**

- Which of those four FHIR uses is an Action, and which is an Event?
- Does denial delete the service Event?
- Who "owns" the benefit. Subscriber, provider, or assignee?

**Decision.** `supported`.

## S-06. Unpriced change order on a building the customer already controls

**Attacks.** one-time order. linear leftover quantity. manufacturing primary-output.

The owner approves extra foundation work. Price is not agreed. The contractor pours concrete on land the customer owns. Progress is measured by cost input. A later priced modification uses cumulative catch-up. Retainage is still unpaid. The customer has not signed acceptance.

**Questions.**

- Is the change a new order, an amendment, or variable consideration on the same performance obligation?
- What quantity remains? Cubic meters, percent complete, or unbilled value?
- Does customer control of the WIP make this a transfer of a finished good?

**Decision.** `supported`.

## S-07. Market imbalance with no serial to move

**Attacks.** tangible identity. inventory movement. lot genealogy.

A generator schedules 100 MWh. Meters later show 94 MWh delivered over the settlement interval. The market computes an imbalance amount. The CIM message carries the position. It does not carry a lot number. The electrons are not retrievable.

**Questions.**

- What is the resource identity?
- Is imbalance a transformation, a transfer, or a claim?
- Can recall-style genealogy apply?

**Decision.** `supported` as a contrast. Formula `undetermined`.

## S-08. Exercise of an option. The instrument stays. The position changes

**Attacks.** tangible identity. simple ownership. consume-produce.

A party holds a call option. They exercise. Cash and the underlying position move. The option contract is the same instrument definition. Ownership of the issuer is unchanged. Control of the issuer is unchanged.

**Questions.**

- Is exercise a transformation that consumes the option and produces shares?
- Or is it a set of economic events against a standing instrument and a position?
- Does "owner" mean beneficial holder, legal title, or control?

**Decision.** `hypothesis`. Needs a deeper FIBO pass.

## S-09. Van stock used on a repair. No new SKU is born

**Attacks.** manufacturing transformation. inventory as the job.

A technician is assigned a Service Appointment on a Work Order. The van has 3 seals. The job requires 1. The technician uses 1 and records Product Consumed against the Product Item. A second seal is used and recorded only against a price book, because it was bought at a hardware store. The asset serial is unchanged. The functional location is unchanged.

**Questions.**

- Is the Work Order a production authorization?
- Which consume writes inventory?
- Did identity of the maintained thing change?

**Decision.** `supported`.

## S-10. Sublease of a right-of-use

**Attacks.** simple ownership. one location pointer.

A lessee controls a floor under IFRS 16. They sublease two rooms. The head lessor still has title. The head lessee still has a lease liability. The sublessee has use. A maintenance vendor holds keys for a week.

**Questions.**

- How many ownership-like facts exist?
- Which one does a stock-owner field mean?
- Is the right-of-use a second asset identity beside the building serial?

**Decision.** `supported`.

## S-11. Case official leaves before disposition

**Attacks.** one-time order. Customer as kind. linear fulfillment.

A public-sector case has filings and a docket. The assigned official starts in March and leaves in June with a termination reason. The case continues. Disposition arrives in November. No good is shipped.

**Questions.**

- What leftover demand exists?
- Is the official a role on a relator, a field on the case, or a kind?
- Is disposition an Event, an Action, or a status write?

**Decision.** `supported` as a contrast. NIEM 5 depth `undetermined`.

## Seed-suite links

These scenarios extend, and do not replace, `scenarios/README.md` S-001, S-002, S-005, S-006, and S-010. They add standing periods, contingent coverage, continuous flow, and case aggregation.
