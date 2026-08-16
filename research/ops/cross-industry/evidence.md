# Evidence

**Kind.** domain evidence  
**Fetched.** 2026-08-16  
**Decision.** per card. Never `accepted`.

Each card is an observation from a named source. Interpretation is separate. Source-system names are artifacts unless a law promotes them.

## E-01. Subscription is a standing object with many later invoices

**Kind.** domain evidence  
**Source.** S-STRIPE-SUB, S-STRIPE-UBB  
**Decision.** `supported` as product behavior

A Stripe `subscription` has `start_date`, item `current_period_start` and `current_period_end`, `status`, `latest_invoice`, `cancel_at`, `cancel_at_period_end`, `canceled_at`, and `ended_at`. Status values include `incomplete`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, and `paused`. `pause_collection` can stop collection while status stays unchanged.

**Source artifact.** The Stripe object name, the status enum, and `billing_mode`.

**Interpretation.** The commercial thing is a standing agreement that emits period claims. It is not one sales order that leftover-quantity fulfillment closes.

## E-02. Service interval is not billing interval

**Kind.** domain evidence  
**Source.** S-STRIPE-UBB  
**Decision.** `supported`

Stripe defines a service interval as the window that evaluates usage and access. A billing interval is when accrued charges become an invoice. The service interval must be longer than or equal to the billing interval. Customers are billed for completed service intervals. Usage still accruing waits for the next invoice.

**Source artifact.** Stripe "pricing plan" and "meter" product names.

**Interpretation.** Requested, promised, planned, and actual still split. Recurring access adds a fifth cut. The performance window is not the invoice window.

## E-03. Usage is an observation. The invoice is a later claim

**Kind.** domain evidence  
**Source.** S-STRIPE-UBB, S-STRIPE-MGT  
**Decision.** `supported`

Meter events are recorded as customer actions. A meter aggregates them over the service interval. An invoice is created on the billing cadence. Mid-cycle cancel bills accrued usage on the shortened period. Backdate can attach prior usage to a later-created subscription. Classic billing mode can ignore pre-swap usage after a price change.

**Source artifact.** Meter Event API and `backdate_start_date`.

**Interpretation.** Consumption observation, rating function, and claim issuance are three facts. None is a warehouse move.

## E-04. Licensed access is not a stocked individual

**Kind.** domain evidence  
**Source.** S-STRIPE-SUB, S-STRIPE-UBB, SIB-15 L-09  
**Decision.** `supported`

A licensed subscription item has `usage_type=licensed` and a recurring `interval`. A metered item attaches to a meter. Both can sit on one pricing plan with a license fee. No serial, lot, or warehouse is required to bill.

**Source artifact.** Stripe `plan` versus `price` duality.

**Interpretation.** Sibling product research already put services on the specification layer. SaaS adds entitlement quantity, seats, and credits. Those are not inventoried instances.

## E-05. Episode of care is responsibility over a period. Encounter is a visit

**Kind.** domain evidence  
**Source.** S-FHIR-EOC, S-FHIR-ENC  
**Decision.** `supported`

FHIR EpisodeOfCare is an association of a patient with an organization for a period during which the organization assumes responsibility. It can exist with no encounters. Encounter records an activity that directly involves the patient. CarePlan is a planning resource. EpisodeOfCare is a tracking resource and usually exists first. Each organization keeps its own EpisodeOfCare. Transfer of care creates a new episode at the receiving organization. `statusHistory` stores prior statuses with periods.

**Source artifact.** FHIR resource names and the required status codes.

**Interpretation.** The long-running container is not the visit and not the plan. Linear quote-order-ship does not describe this.

## E-06. A healthcare claim is a request. Coverage is not the plan catalog

**Kind.** domain evidence  
**Source.** S-FHIR-CLM, S-FHIR-COV  
**Decision.** `supported`

FHIR Claim is a workflow request. `Claim.use` is `claim`, `preauthorization`, or `predetermination`. Predetermination is a what-if. Preauthorization reserves funds or permission before service. Claim seeks adjudication after, or for, actual or proposed service. ClaimResponse is the payor decision. CoverageEligibilityRequest asks whether coverage is in force. Coverage is the insurance-card instance for a person. InsurancePlan is the offer definition and does not list purchasers. Contract can hold the agreement text. Self-pay Coverage is not the account guarantor.

**Source artifact.** FHIR financial resource split and UB04 or CMS1500 mappings.

**Interpretation.** Offer, standing coverage, authorization, service event, reimbursement request, and adjudication are distinct. A sales invoice that also moves stock collapses too many of them.

## E-07. Occurrence time and claim time can bind different policies

**Kind.** domain evidence  
**Source.** S-ACORD-3, S-ACORD-25  
**Decision.** `supported` for the date split. `hypothesis` for how OS should encode it

ACORD 3 tells the clerk to enter date of occurrence for occurrence policies, and date the insured discovered the incident for claims-made policies. Date of claim is the suit or claim-filing date and exists only for claims-made. After a claims-made policy ends, a claim can still be valid if the incident occurred during the policy and was reported within a stated window. An ACORD 25 certificate shows effective and expiration dates. The certificate does not change coverage. The policy terms do.

**Source artifact.** ACORD form numbers and the certificate layout.

**Interpretation.** Valid time of the loss, valid time of notice, and valid time of the coverage instrument can disagree. One `delivery_date` style field is not enough. This is the same warning as `docs/open-questions.md` question 3, now from insurance. This card does not answer that question.

## E-08. Over-time performance is not leftover unshipped quantity

**Kind.** domain evidence  
**Source.** S-IFRS15-IE, S-IFRS15-PWC, S-ASC606-EY, S-ASC606-RSM, SIB-29 L-015  
**Decision.** `supported`

IFRS 15 paragraph 35 recognizes revenue over time when the customer consumes as the entity performs, when the customer controls the asset as it is created, or when the asset has no alternative use and the entity has a right to payment for work to date. IE68 uses payroll processing. Construction on customer land uses the second test. Progress is an input method or an output method. ASC 606 treats a change order as a contract modification. An unpriced change order is variable consideration. Scope can be approved while price is not. Sibling project research already split work progress from billed progress.

**Source artifact.** "Percentage of completion" as a report name. ASC 605-35 completed-contract leftover.

**Interpretation.** Fulfillment can be a progress measure on a standing obligation. It is not a remaining pick quantity.

## E-09. A lease splits use from title

**Kind.** domain evidence  
**Source.** S-IFRS16 paragraphs 9, 22, 61. S-IFRS16-BC  
**Decision.** `supported`

IFRS 16 paragraph 9. A contract contains a lease if it conveys the right to control the use of an identified asset for a period in exchange for consideration. The period may be described as amount of use, such as production units. At commencement the lessee recognizes a right-of-use asset and a lease liability. A finance lease transfers substantially all risks and rewards incidental to ownership. An operating lease does not. The lessor can keep title and residual rights while the lessee controls use. Subleases of right-of-use assets are in scope.

**Source artifact.** Lessee single-model bookkeeping and the low-value exemption.

**Interpretation.** Legal title, right of use, custody, and residual interest are different facts. One owner field on a serial cannot carry them.

## E-10. A financial instrument is an agreement. Ownership is not control

**Kind.** domain evidence  
**Source.** S-FIBO-FBC, S-FIBO-FND, S-FIBO-GH, SIB-22 L-001 and L-002  
**Decision.** `supported` for instrument-as-agreement. `hypothesis` for position identity

FIBO FBC describes financial instruments as agreements, contracts, notes, equities, options, and debt, some negotiable. The LOAN module models obligations to fund and to repay on a schedule. DER covers options, futures, forwards, and swaps. FND splits Ownership and Control into separate ontologies. Sibling finance research already split claim from settlement and instruction from payment event.

**Source artifact.** OWL module names and FIBO Viewer IRIs.

**Interpretation.** The thing sold can be a bundle of obligations with no physical instance. A position against an instrument is not the instrument. Transfer of a position is not a stock move of a serial.

## E-11. Electrical energy is scheduled, flowed, and imbalanced. It is not a lot

**Kind.** domain evidence  
**Source.** S-CIM-EPRI, S-CIM-MG  
**Decision.** `supported` as a contrast. Settlement formula `undetermined`

IEC 61970 models the interconnected grid for operation and planning. IEC 62325 models market processes including bidding, contracts, clearing, and settlement. IEC 62325-451-4 carries settlement and reconciliation data for European-style markets. The standard says it does not define the settlement formula. It enables exchange of the data needed to compute each participant's final position and imbalance amounts.

**Source artifact.** CIM packages, CIM/XML, and ESMP document names.

**Interpretation.** The resource is a continuous flow over an interval at a network location. Identity is a market position and a metering point, not an SGTIN. "Inventory movement" is the wrong verb.

## E-12. Field service consumes parts only sometimes. The job is not a manufacture

**Kind.** domain evidence  
**Source.** S-SF-PC, S-SF-INV, SIB-26 L-006  
**Decision.** `supported`

Salesforce Product Required is the anticipated part list on a work order or work type. Product Consumed is what was used. Linking Product Consumed to a Product Item decrements location quantity. Leaving Product Item blank and setting PricebookEntryId records consumption without inventory. Sibling asset research already split consumable issue from rotating install.

**Source artifact.** Salesforce object names and the Price Book join.

**Interpretation.** A service job can use inventory without becoming a work order that produces a new SKU. Required quantity and consumed quantity can differ. That is reservation versus consumption, not BOM explosion.

## E-13. A public-sector case is an aggregation of activities. It is not an order

**Kind.** domain evidence  
**Source.** S-NIEM-CASE, S-NIEM-OFF  
**Decision.** `supported` as a contrast. Full NIEM 5 model `undetermined`

NIEM `nc:CaseType` is "an aggregation of information about a set of related activities and events." It extends `nc:ActivityType` and carries filings, disposition, docket, and tracking identifiers. `j:CaseOfficialType` gives an official a role, a start date, an end date, and a termination reason on that case.

**Source artifact.** NIEM element names and versioned schemas.

**Interpretation.** The container is a case file with authority, filings, and disposition. There is no leftover ship quantity. Officials are time-bounded roles on the case, not Customer or Supplier kinds.

## E-14. Valueflows already has standing agreements without stock

**Kind.** domain evidence  
**Source.** S-VF-EX, S-VF-FL, S-VF-ONT  
**Decision.** `supported`

Valueflows Agreement is a set of reciprocal commitments or reciprocal events. Commitment is a promised future flow. Economic Event is past only. Claims are initiated by the receiver. EconomicResource can be material or digital and can be inventoried. A specification can exist without an inventoried resource.

**Source artifact.** VF class names and the optional storage of both direct and fulfill links.

**Interpretation.** An independent economic model does not start from Sales Order, Delivery Note, and Item. Recurring service, coverage, and case work can be commitments and events over time.

## E-15. Observed work, billable quantity, and invoiced quantity already diverge in services

**Kind.** domain evidence  
**Source.** SIB-29 L-007, L-009, L-010, L-015  
**Decision.** `supported` as sibling pressure. This pass did not re-fetch those ERP pages

Issue 29 records independent agreement that hours happened, hours the contract may charge, and hours already invoiced are three facts. Fixed-price sales do not rise when more cost is incurred. Service fulfillment is not a stock movement. Work progress and billing progress can move independently.

**Source artifact.** ERPNext decimal milestone quantity. Odoo Reached checkbox.

**Interpretation.** Professional services already falsify inventory-as-fulfillment inside the enterprise corpus. Cross-industry sources extend the same cut.

## E-16. Action versus Event already survives a kill test

**Kind.** domain evidence  
**Source.** SIB-56 L-P-02, L-P-03. S-CONST §8 and §9. S-FHIR-CLM. S-STRIPE-SUB  
**Decision.** `supported`

Issue 56 keeps Action distinct from Event and keeps unknown-after-dispatch out of the Event sort. FHIR Claim is explicitly a request. Stripe `incomplete` means the first collection attempt failed. `past_due` means a later invoice is unpaid. Those are intervention outcomes, not proof that access was granted or denied in the product.

**Source artifact.** Stripe status machine.

**Interpretation.** Non-ERP domains add more request types. They do not collapse request into occurrence.

## E-17. Simple ownership already fails inside assets and product

**Kind.** domain evidence  
**Source.** SIB-15 L-06. SIB-26 L-001, L-009. S-IFRS16  
**Decision.** `supported`

Issue 15 splits ownership, custody, and location. Issue 26 splits capitalization, role, and serial hardware, and allows third-party-owned maintainable equipment. IFRS 16 adds right of use as a fourth fact.

**Source artifact.** ERPNext Asset DocType collapse. Odoo two-app split.

**Interpretation.** Cross-industry leases and coverages are not a new surprise. They make the same split unavoidable.

## E-18. Manufacturing consume-produce is a real law in plants. It is not a kernel law

**Kind.** domain evidence  
**Source.** SIB-19 L1, L9, L12. S-FHIR-EOC. S-STRIPE-UBB. S-NIEM-CASE  
**Decision.** `supported` as a scope limit

Issue 19 supports specification versus authorization versus execution, and many-to-many transformation contribution, for plants. EpisodeOfCare, subscription metering, and NIEM Case have no consume-produce pair that mints a new material identity.

**Source artifact.** Work Order as a document name.

**Interpretation.** Transformation events stay in the manufacturing and traceability folders. They must not become the only Process primitive.

## Rejected lookalikes

### R-01. FHIR Subscription is a SaaS commercial subscription

**Kind.** source-system artifact  
**Decision.** `rejected` as evidence for issue 79

FHIR Subscription is a notification channel for resource changes. It is not a billed customer agreement. Do not cite it as SaaS.

### R-02. ACORD 25 is the policy

**Kind.** source-system artifact  
**Decision.** `rejected`

The certificate summarizes coverage. Carriers say the policy terms govern. Treating the certificate as the agreement repeats the ERP habit of treating the printout as the fact.
