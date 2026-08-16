---
issue: 31
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate multi-entity laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`. These are domain laws. They are not RFC-0001 edits. Issue 3 owns whether Role and Relator become engine categories. Issue 14 owns LegalPerson identity. Issue 18 owns location ownership. Issue 21 owns book and currency identity. Issue 30 owns CNPJ.

## L1. Legal person, operating unit, site, and brand are different cuts

**Claim.** Books, tax liability, and statutory registration attach to a legal person. Day-to-day sites attach to an operating unit or facility. A public name can be a brand. None of these is interchangeable with the others.

**Kind.** Candidate law.

**Evidence.** E1, E9, E23, E24. ERPNext Company versus branch. Odoo Company versus Branch versus subsidiary. FIBO LegalEntity as a LegalPerson that can contract and assume debts.

**Decision state.** `supported` for the split. `hypothesis` for the names. `undetermined` for whether a company record is the legal-person identity.

**Falsifier.** A jurisdiction or a mature ERP where a branch, a legal entity, and a brand share one identity without breaking tax, intercompany posting, or authority. ME-008, ME-026.

**Runtime consequence.** Intercompany actions name two legal persons. Inventory at a site names a location. Invoices name the legal person that is liable. Issue 14 L2 already states a close cut. This law only adds the group and intercompany pressure.

## L2. Control is not ownership percent and not a parent-field

**Claim.** Consolidation scope follows control. Control is power, variable returns, and the ability to use that power. Ownership percent, a Parent Company field, and user permission are different facts.

**Kind.** Candidate law.

**Evidence.** E16, E18, E20, E24, E30, E32. IFRS 10 three-element test. IAS 28 significant influence. GLEIF consolidating parent. Investment-entity exception.

**Decision state.** `supported` as accounting-domain law. `hypothesis` that operational ERPs must store the test, not only a parent link.

**Falsifier.** A group in which line-by-line consolidation tracks share count and still matches IFRS 10, including de facto control, collective control, protective rights, and the investment-entity exception. ME-009 through ME-012, ME-028, ME-032.

**Runtime consequence.** Group membership is a dated relationship with a stated basis. Control, consolidating parent, significant influence, and joint control are different bases.

## L3. Intercompany trade is two legal events plus a link

**Claim.** A sale, recharge, or fund transfer between legal persons writes a complete event in each person's books. A link records that they are counterparts. One shared document is not enough.

**Kind.** Candidate law.

**Evidence.** E3, E4, E11, E17, E28, E29.

**Decision state.** `supported`.

**Falsifier.** A mature statutory system that posts one document into two legal persons and still preserves independent tax, cancellation, period lock, and audit. ME-013, ME-014.

**Runtime consequence.** Pair completeness is an invariant. Cancellation is per legal person, then a required review of the counterpart.

## L4. A shared physical warehouse is not a shared stock ledger

**Claim.** One building can hold goods for several legal persons. Each person's quantity, valuation, and warehouse account remain distinct. A change of ownership is intercompany trade.

**Kind.** Candidate law.

**Evidence.** E5, E11. Issue 18 owns custody versus ownership. This law only states the company boundary.

**Decision state.** `hypothesis`. ERPNext collaborators treat it as logical. Odoo 19 stock-move sync is a possible counterexample until traced.

**Falsifier.** A corpus where one warehouse ledger serves two legal persons and still produces correct statutory stock, tax, and COGS for each. ME-004, ME-034.

**Runtime consequence.** Location identity and ownership identity must both be addressable. Do not invent that design here.

## L5. Consolidation is a projection with eliminations

**Claim.** Group statements present several legal persons as one economic entity. They combine like items, translate currencies, and eliminate intragroup positions and unrealized profits. Those steps do not replace each person's statutory books.

**Kind.** Candidate law.

**Evidence.** E8, E12, E16, E17, E19, E25.

**Decision state.** `supported` for the projection claim. `undetermined` for how much ERPNext's named report eliminates.

**Falsifier.** A reporting regime in which the consolidating company is just another operating ledger that users invoice, and statutory books are rewritten by elimination. ME-019, ME-024.

**Runtime consequence.** Elimination entries are scoped to a consolidation run, a policy set, and a rate set. Statutory ledgers stay explainable without them.

## L6. Functional, transaction, and presentation currencies are different facts

**Claim.** Functional currency is an economic-environment fact of a legal person. Transaction currency is a fact of a document. Presentation currency is a fact of a report. Changing one does not rewrite the others.

**Kind.** Candidate law.

**Evidence.** E1, E6, E12, E21, E25. Issue 21 owns deeper currency mechanics.

**Decision state.** `supported` for the three-way cut. `undetermined` for book-versus-entity identity.

**Falsifier.** A system that stores one currency field per company and still answers functional, transaction, and group-presentation questions after a functional-currency change. ME-006, ME-018, ME-020.

**Runtime consequence.** Exchange differences need a stated pair of currencies, a rate date, and a realized-versus-unrealized or translation classification.

## L7. Common identity can carry entity-specific terms

**Claim.** A product, supplier organization, or person can be one individual across the group. Prices, costs, tax templates, payment terms, and receivable accounts can still differ per legal person.

**Kind.** Candidate law.

**Evidence.** E2, E10, E14, E26.

**Decision state.** `supported`.

**Falsifier.** A corpus where sharing a master forces identical commercial terms in every legal person, and where that collapse still matches statutory invoices. ME-001, ME-002, E10 Cost split.

**Runtime consequence.** Identity keys stay on the enduring party or product. Terms attach to a relationship scoped by legal person. Issue 14 L4.

## L8. Corporate structure is effective-dated

**Claim.** Parent, control, consolidating scope, and NCI change on valid dates. Historical reports use the structure that was true then, not the structure that is true now.

**Kind.** Candidate law.

**Evidence.** E16, E18, E22, E24, E31.

**Decision state.** `supported` as a domain requirement. `undetermined` for ERPNext and Odoo trees.

**Falsifier.** A group that mutates a single parent field and can still reconstruct pre-deal consolidation, NCI, and intercompany elimination. ME-007, ME-021, ME-022, ME-027.

**Runtime consequence.** Reorganization is an Action that writes a new relationship interval. It is not an update in place.

## L9. Cross-company permission is not legal authority

**Claim.** A principal may see or act in several legal persons. That grant is policy. It does not make the principal the parent, and it does not merge the books.

**Kind.** Candidate law.

**Evidence.** E13, E15, E30.

**Decision state.** `supported`.

**Falsifier.** A system where login access to two companies is treated as control under IFRS 10 or as a license to post one journal into both ledgers. ME-032.

**Runtime consequence.** Policy checks name principal, action, and legal person. Issue 11 owns Principal.

## L10. Transfer price is a term of a relationship, not a stock movement

**Claim.** The amount one legal person charges another is a priced term. It may differ from external price and from cost. It does not replace the two-ledger trade or the later elimination of unrealized profit.

**Kind.** Candidate law.

**Evidence.** E3 rates on intercompany invoices. E17 elimination of profits in inventory. Official OECD methods were not fetched.

**Decision state.** `hypothesis`. Method choice stays `undetermined`.

**Falsifier.** A regime in which intercompany quantity movement has no independent price, and group statements still eliminate unrealized profit correctly. ME-003, ME-015, ME-019.

**Runtime consequence.** Store the charged amount on the intercompany event. Store any policy that produced it as provenance. Do not invent OECD methods here.

## L11. A reporting basis is not a legal person

**Claim.** Statutory books, management books, and group projections can disagree on depreciation or measurement and still name the same legal person.

**Kind.** Candidate law.

**Evidence.** E7, E12, E19.

**Decision state.** `supported` that the cut exists. `undetermined` whether a book has its own identity. Issue 21.

**Falsifier.** A corpus where creating a Finance Book or multi-ledger necessarily creates a new legal person, or where one book identity is enough for two CNPJs. ME-025.

**Runtime consequence.** Do not use book as a substitute for legal person. Do not use legal person as a substitute for reporting basis.

## L12. Customer and Supplier are not Kinds

**Claim.** Restated from issue 14 L1 because intercompany setups keep creating Customer and Supplier records. Those records are roles that point at another legal person.

**Kind.** Candidate law.

**Evidence.** E3, E14, E26.

**Decision state.** `rejected` that they are Kinds. `supported` that they are roles.

**Falsifier.** Same as issue 14 L1. Not reopened here.
