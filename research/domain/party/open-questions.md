---
issue: 14
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this pass. None of these writes an answer into `docs/open-questions.md`. If a later agent needs a stance, cite a file in this folder or leave the item `undetermined`.

## Q1. Does OS need a native Role or Relator sort to host this fragment?

`docs/open-questions.md` items 2 and 12 ask this. Issue 3 owns the metamodel cut. This folder only shows that commercial labels behave as roles and that employment behaves as a relationship with a career.

**Decision state.** `undetermined`
**Cite.** `research/identity-kinds-roles/` on `cursor/issue-3-foundation-cfd8`. `candidate-laws.md` L3, L4.

## Q2. Is Party a Kind, or a Category that Person and Organization carry?

OntoUML would make Person and Organization Kinds and might treat Party as a non-sortal. ValueFlows and Moqui use Party or Agent as the named parent. FIBO uses IndependentParty.

**Decision state.** `undetermined`
**Cite.** E13, E15, E18, E20. `fragment.md`

## Q3. Can an Organization be a Party without being a LegalPerson?

ValueFlows says yes if the group has agency. FIBO LegalPerson needs liability capacity. ERPNext Company needs books. EC08 is the test.

**Decision state.** `undetermined`
**Cite.** E15, E19, E6. EC08.

## Q4. Is Legal Entity a Category that includes contracts and legislation?

OntoUML's example Category lists people, organizations, contracts, and legislation. FIBO LegalPerson is a natural person or organization that can accrue liability. This fragment follows FIBO's narrower cut and treats contracts as instruments. That choice is not proved.

**Decision state.** `undetermined`
**Cite.** E19, E20. `matrix.md` note on the two Legal Entity phrases.

## Q5. What is an Address?

Four live options.

1. A value copied onto documents.
2. An object other documents cite.
3. An immutable ContactMeans with dated associations.
4. A child Party, as in Odoo.

ERPNext allows 1 and 2. Moqui insists on 3. Odoo implements 4. E28.

**Decision state.** `undetermined`
**Cite.** E5, E8, E14, E28. L8. EC16.

## Q6. Must TaxRegistration be a core concept, or a localization pack?

Indian GSTIN is location-bound. EU VAT is often party-bound. FIBO already has TaxIdentifier and TaxIdentificationScheme. Multi-entity research may own jurisdiction as a generic dimension.

**Decision state.** `undetermined`
**Cite.** E5, E11, E18. L7. Issue 37 FIBO note on jurisdiction, read only.

## Q7. Is Employee ever a Kind in labor law?

Some statutes talk as if the employee is the person. Payroll products store a personnel file. The fragment treats Employee as a role. EC15 is the first attack. A labor-law corpus was not fetched.

**Decision state.** `undetermined`
**Cite.** E7, E12, L9.

## Q8. Where do payment terms and credit limits live when one party has two commercial directions?

S-005 asks this. Possible homes are the CustomerRelationship, the Agreement, the books LegalPerson pair, or a price list object. This pass did not mine pricing or credit-limit engines beyond the Customer and Supplier field lists.

**Decision state.** `undetermined`
**Cite.** E1, E2, E21. EC01, EC22.

## Q9. Are bill-to, ship-to, payer, and payee roles of one relationship, or separate relationships?

Moqui lists them as RoleTypes. ERPNext uses multiple Addresses on one Customer. Odoo uses child address types. Intercompany and buying-group cases may need different parties rather than only different addresses. EC11.

**Decision state.** `undetermined`
**Cite.** E13, E27, E5, E8.

## Q10. What is Account in this domain?

The issue title names account. This pass rejected Account as a party kind. It did not decide among receivable ledger, user login, bank account, and customer code. Those are different concepts that share a word.

**Decision state.** `rejected` as a party kind. `undetermined` as a word to keep.
**Cite.** R1 in `candidate-laws.md`. E1 default Debtors account. E8 `res.users`.

## Q11. How should principals attach to parties?

`docs/open-questions.md` item 11. Issue 11 owns it. This folder only refuses to identify login with Party and to make a deputy the LegalPerson. EC17.

**Decision state.** `undetermined` here.
**Cite.** `research/foundation/principals/` on `cursor/issue-11-foundation-cfd8`. E4, E12, L6.

## Q12. When is a brand a party?

Marketing systems treat brands as customers. Tax systems do not. No first-party brand model was fetched.

**Decision state.** `undetermined`
**Cite.** L2. EC09.

## Q13. Party split

Merge has evidence. Split does not, beyond legal succession. No source page fetched this session describes splitting one partner into two surviving parties.

**Decision state.** `undetermined`
**Cite.** E9, L5. EC13.

## Q14. EcologicalAgent

ValueFlows includes it. Commercial ERPs do not. Out of scope until a later domain issue asks.

**Decision state.** `undetermined`
**Cite.** E15.

## Questions this pass is not allowed to close

Do not treat any line above as an answer to `docs/open-questions.md`. The living agenda stays untouched.

Wave B runtime and toolchain recommendations wait for more Wave A semantic pressure. This folder is that pressure for party, not a runtime choice.
