# Scenarios

Adversarial cards. Each card is a counterexample or a runtime consequence dressed as a case. Kind and decision state are required. Observed result is "not run" unless a cited evidence card already covers it.

## S-001 Sell, make, and value the same GTIN

- Kind: counterexample
- Targets: A-001, L-001
- Setup: GTIN 09506000134352 is an offer in commerce, a manufactured output, and a stock-account mapping.
- Falsifying result: one Product type stores list price, BOM revision, and valuation class, and each context can enforce its invariants by reading that type.
- Observed result: not run. E-019, E-021, E-022 already refuse the collapse.
- Consequence: reject
- Decision state: `supported` as a required split

## S-002 Supplier is also customer

- Kind: counterexample
- Targets: A-002, L-002
- Setup: Seed S-005 (E-027). Organization B sells resin to A and buys bottles from A.
- Falsifying result: B is both a Customer object and a Supplier object, and ending one relationship deletes B.
- Observed result: not run. Party L1 already rejects the kinds.
- Consequence: reject Customer-as-identity
- Decision state: `supported`

## S-003 Loan counterparty is not the storefront customer

- Kind: counterexample
- Targets: A-002, E-015
- Setup: The storefront customer is a brand. The loan is signed by a different legal person in the same group.
- Falsifying result: one Customer identity is the debtor.
- Observed result: not run. FIBO and multi-entity L1 pressure the split (E-015, E-024).
- Consequence: legal counterparty correspondence is to LegalPerson
- Decision state: `hypothesis`

## S-004 Consignment on-hand with zero owner valuation

- Kind: counterexample
- Targets: A-003, L-003
- Setup: Custodian holds 80 units. Owner has title. Owner valuation is zero under the contract.
- Falsifying result: one on-hand field is also the carrying amount.
- Observed result: not run. Inventory L-INV-10 names this case (E-020).
- Consequence: reject
- Decision state: `supported` as a cited sibling case

## S-005 NRV write-down without a stock movement

- Kind: counterexample
- Targets: A-003, E-016, E-022
- Setup: Cost 10. NRV falls to 6. No unit leaves the bin.
- Falsifying result: the write-down is a warehouse movement, or the carrying amount stays 10 because quantity did not change.
- Observed result: not run. IAS 2 requires the write-down (E-016). Accounting L11 forbids treating quantity change as the journal (E-022).
- Consequence: financial inventory context posts a valuation event. Physical context is unchanged.
- Decision state: `supported`

## S-006 Backdated receipt. Physical known-then versus financial valid-then

- Kind: counterexample
- Targets: L-003, L-007
- Setup: Seed S-007. Twenty units left on August 8. Recorded on August 12.
- Falsifying result: one timestamped quantity answers both "what did the warehouse believe on August 10" and "what is the carrying amount now believed for August 10."
- Observed result: not run. Inventory sibling L-INV-08 already splits valid time from knowledge time.
- Consequence: even one context needs two times. Two contexts cannot share one quantity history.
- Decision state: `hypothesis`

## S-007 Employment ends. Login stays. Customer starts

- Kind: counterexample
- Targets: A-004, L-004
- Setup: P is employed, then Left, then buys as a customer, then is rehired.
- Falsifying result: Employee id is the Person id is the User id is the Customer id.
- Observed result: not run. HR L1, L10, L11 and Party L1, L6, L9 (E-018, E-023).
- Consequence: reject
- Decision state: `supported`

## S-008 SCIM deprovision is not termination

- Kind: counterexample
- Targets: A-004, E-017
- Setup: IdP sets `active` false because a contractor loses application access. Employment, if any, is still open. Or the reverse. HR terminates and IAM is late.
- Falsifying result: one `active` flag is both access and employment.
- Observed result: not run. RFC 7643 `active` is an account attribute (E-017). HR L10 says terminate is not delete (E-023).
- Consequence: IAM context and HR context may disagree for a time. Both facts stay.
- Decision state: `supported`

## S-009 Two employments, two principals, one person

- Kind: counterexample
- Targets: A-004, L-004
- Setup: P holds concurrent employments in two legal persons of one group. Each employment grants a different login.
- Falsifying result: one User and one Employee cover both.
- Observed result: not run. HR L11 supports multiplicity (E-023). Multi-entity L1 splits legal persons (E-024).
- Consequence: cross-context identity is Person, with two correspondences into HR and two into IAM.
- Decision state: `supported`

## S-010 Agent asks for the product

- Kind: runtime consequence
- Targets: A-001, L-008
- Setup: An agent tool `GetProduct(id)` is generated from a unified type.
- Falsifying result: the tool returns a record that sales, the plant, and the ledger can all treat as authoritative.
- Observed result: not run.
- Consequence: the tool must take a context, or three tools must exist, or the call fails closed.
- Decision state: `hypothesis`

## S-011 ERPNext Work Order tool pointed at Odoo

- Kind: counterexample
- Targets: A-010, L-001
- Setup: An agent trained on ERPNext authorization Work Orders calls `CompleteWorkOrder` against an Odoo operation Work Order.
- Falsifying result: completion means the same layer.
- Observed result: not run. E-021 records the false cognate.
- Consequence: vendor words cannot be the OS ubiquitous language.
- Decision state: `supported`

## S-012 Shared warehouse, two legal persons

- Kind: counterexample
- Targets: A-011, L-003
- Setup: One building. Legal person A owns 60. Legal person B owns 40. A sells 10 to B inside the building.
- Falsifying result: one warehouse ledger and one Company record post the move.
- Observed result: not run. Multi-entity L3 and L4 (E-024).
- Consequence: physical move may be null. Ownership change is intercompany trade.
- Decision state: `hypothesis` because sibling L4 is still hypothesis

## S-013 Brand invoice, legal-person tax

- Kind: counterexample
- Targets: A-011, L-002
- Setup: Storefront brand is "North." Invoice must name CNPJ of legal person South.
- Falsifying result: one Company name field is both brand and tax identity.
- Observed result: not run. Party L2 and multi-entity L1 (E-018, E-024).
- Consequence: reject
- Decision state: `supported`

## S-014 owl:sameAs from SKU to GTIN to GL account

- Kind: counterexample
- Targets: A-008, L-005
- Setup: Commerce asserts sameAs(SKU, GTIN). Manufacturing asserts sameAs(GTIN, specification). Accounting asserts sameAs(specification, valuation class).
- Falsifying result: offer price becomes a property of the GL account, or the account code becomes a property of the offer, and both remain correct.
- Observed result: not run. E-013 states substitutive closure.
- Consequence: reject sameAs as the mapping primitive
- Decision state: `supported`

## S-015 Late identity correspondence

- Kind: counterexample
- Targets: L-005, E-028
- Setup: Two Person records are later found to be one human. Meanwhile one record accrued employment and the other accrued customer invoices.
- Falsifying result: a merge that rewrites history and still answers what each context believed at posting time.
- Observed result: not run. Party L5 distinguishes record merge, legal succession, and identifier correction.
- Consequence: correspondence can be asserted late. Historical facts keep their original local identity plus the new link.
- Decision state: `hypothesis`

## S-016 Contradictory promised dates

- Kind: counterexample
- Targets: L-007, E-028
- Setup: Seed S-011. ERP says 25. Spreadsheet says 27. Chat says 24.
- Falsifying result: one promisedDate field, last write wins, and provenance is a log.
- Observed result: not run.
- Consequence: three claims can coexist. Authority is a policy over provenance, not a unique slot.
- Decision state: `supported` as a required capability. The policy itself is `undetermined`.

## S-017 Event.timestamp composition failure

- Kind: counterexample
- Targets: A-007, L-006
- Setup: Commerce Event.timestamp is an ISO string. Manufacturing Event.timestamp is epoch millis.
- Falsifying result: a unified ontology silently stores both in one property.
- Observed result: not run. Apollo fails composition (E-011).
- Consequence: fail closed
- Decision state: `supported`

## S-018 Parallel depreciation books

- Kind: counterexample
- Targets: A-013, L-007
- Setup: Statutory life 10 years. Management life 5 years. Both required for the same asset.
- Falsifying result: one depreciation fact is organizational truth.
- Observed result: not run. Accounting L17 is a sibling cut.
- Consequence: two local models coexist. Consolidation or management reporting is a projection.
- Decision state: `hypothesis`

## S-019 Contractor labeled Employee

- Kind: counterexample
- Targets: A-004, L-004
- Setup: HR product stores Employment Type = Contractor on an Employee master. IAM provisions a User. Accounts payable treats the party as a supplier.
- Falsifying result: one Employee type is correct for labor law, access, and pay.
- Observed result: not run. HR L12 calls this a source convenience (E-023).
- Consequence: three contexts, three mappings, one Person
- Decision state: `hypothesis`

## S-020 Transfer price is not a stock movement

- Kind: counterexample
- Targets: A-011, L-003
- Setup: Legal person A transfers title to B at a transfer price. Goods do not leave the shared building.
- Falsifying result: the priced relationship is a warehouse transfer, or the warehouse transfer is the invoice.
- Observed result: not run. Multi-entity issue text already names this cut. Sibling L3 requires two legal events.
- Consequence: commerce or intercompany context owns the price. Inventory context may see no movement.
- Decision state: `hypothesis`

## S-021 Ontology revision in one context only

- Kind: counterexample
- Targets: L-006, L-009
- Setup: Commerce revises Offer. Manufacturing specification is unchanged. Historical sales actions must still explain under the old offer rules (seed S-012).
- Falsifying result: one organizational ontology revision number pins every context.
- Observed result: not run.
- Consequence: context ontologies version independently. A cross-context action pins every context revision it read.
- Decision state: `hypothesis`

## S-022 Shared Kernel change breaks a downstream context

- Kind: counterexample
- Targets: A-012, L-009
- Setup: Shared kernel adds a required property on LegalPerson that manufacturing does not have.
- Falsifying result: the change ships and manufacturing keeps meaning.
- Observed result: not run. Evans requires consultation and a small kernel (E-006).
- Consequence: kernel change is a mapped, versioned event. Silent widening is forbidden.
- Decision state: `hypothesis`

## S-023 Separate Ways for a local fiscal concept

- Kind: counterexample
- Targets: L-009, E-005
- Setup: A Brazil-only fiscal document concept has no counterpart in commerce outside that jurisdiction.
- Falsifying result: the concept is forced into the shared Product or Invoice type so the one ontology stays complete.
- Observed result: not run. Evans Separate Ways is the named pattern. Open question 16 already asks how Brazil-specific concepts compose.
- Consequence: a context may exist without a global type. Mapping is optional.
- Decision state: `hypothesis`

## S-024 Agent reconciliation across contradictory contexts

- Kind: runtime consequence
- Targets: L-007, L-008
- Setup: Warehouse says 12 on hand. Ledger carrying amount implies 10 after an unposted write-down. An agent is asked "how much inventory do we have."
- Falsifying result: one number is returned without naming context, grain, and provenance.
- Observed result: not run.
- Consequence: the honest answer is two numbers plus a mapping status. A single number is a policy projection and must say so.
- Decision state: `hypothesis`
