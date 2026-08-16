---
issue: 21
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate accounting laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`. These are domain laws. They are not RFC-0001 edits.

## L1. A posted journal is balanced

**Claim.** A successful posting has debit total equal to credit total in the functional currency of the books.

**Kind.** Candidate law.

**Evidence.** E-001, E-014, E-021. Thesis already uses this as the example constraint and is not edited here.

**Decision state.** `supported`

**Falsifier.** A mature ledger that posts an unbalanced journal as the ordinary happy path, without a suspense or error bucket that remains explicitly unposted or reconciling.

**Runtime consequence.** Posting is refuse-closed on imbalance. Agents may not improvise a plug account to force balance. See S-ACC-005 and S-ACC-023.

## L2. Draft work does not affect the books

**Claim.** Until a Posting Action succeeds, financial statements, trial balance, and party outstanding ignore the draft.

**Kind.** Candidate law.

**Evidence.** E-001, E-014, E-020.

**Decision state.** `supported`

**Falsifier.** A production ledger that includes unsaved or draft rows in statutory reports without labeling them as unposted.

**Runtime consequence.** Preview can compute a hypothetical effect. It must not write LedgerEntries.

## L3. Posted ledger history is not deleted

**Claim.** After posting, ordinary correction adds compensating rows or a linked reversing journal. It does not remove the original evidence.

**Kind.** Candidate law.

**Evidence.** E-002, E-007, E-019, E-024.

**Decision state.** `supported`

**Falsifier.** A regulated production system whose supported correction path is delete-and-rekey of posted rows with no residual original.

**Runtime consequence.** Delete of a LedgerEntry is not a business Action. Cancel and Reverse are. See S-ACC-004.

## L4. Cancel and reverse are different Actions

**Claim.** Voiding the original document's active effect is not the same as posting a new opposite journal that the original remains beside.

**Kind.** Candidate law.

**Evidence.** E-002, E-019. ERPNext states the difference in those words.

**Decision state.** `hypothesis`

**Falsifier.** A corpus where cancel and reverse are the same Action with only a UI label changed, and auditors cannot tell them apart.

**Runtime consequence.** The Action name must say whether the original Journal stays submitted-and-cancelled or stays posted with a sibling reverse.

## L5. Only a leaf account receives a posting

**Claim.** Group or heading accounts organize the chart. They are not posting targets.

**Kind.** Candidate law.

**Evidence.** E-003, E-025.

**Decision state.** `supported`

**Falsifier.** A chart that posts to parent totals as the system of record, with children only as report filters.

**Runtime consequence.** Account.role = group makes Posting illegal.

## L6. A management dimension is not an account

**Claim.** Department, project, product line, and analytic plan tag a posting. They do not replace the economic Account.

**Kind.** Candidate law.

**Evidence.** E-004, E-016. Moqui categories are a weaker form, E-025.

**Decision state.** `supported`

**Falsifier.** A mature system that can answer statutory and management questions only by exploding the chart into one account per department, with no second axis.

**Runtime consequence.** Report filters must be able to slice one Account by Dimension. Creating a new Department must not require a new Sales account. See S-ACC-016 and S-ACC-017.

## L7. Close transfer and period lock are different Actions

**Claim.** Moving Income and Expense to Equity is not the same as refusing later ordinary Posting into the period.

**Kind.** Candidate law.

**Evidence.** E-005, E-006, E-015, E-022, E-032.

**Decision state.** `supported` for the split. `undetermined` for the record shape that encodes close.

**Falsifier.** A corpus where one boolean `closed` both appropriates earnings and locks posting, and where those jobs cannot be performed separately without breaking reports.

**Runtime consequence.** CloseTransfer may post. LockPeriod may post nothing. Combining them in one button is a surface, not a law. See S-ACC-003, S-ACC-020, S-ACC-021.

## L8. Recognition, billing, and cash are different times

**Claim.** The date a performance obligation is satisfied, the date a customer is billed, and the date cash moves can all differ. None may overwrite the others.

**Kind.** Candidate law.

**Evidence.** E-010, E-011, E-012, E-018, E-023, E-031.

**Decision state.** `supported`

**Falsifier.** A domain where those three dates are always the same fact, including prepaid services, unbilled deliveries, and goods received not invoiced.

**Runtime consequence.** Deferred revenue, accruals, and advances are scheduled recognitions or allocations, not edits of the original cash Event. See S-ACC-014, S-ACC-015, S-ACC-029.

## L9. Foreign amount and functional amount are both retained

**Claim.** When a posting is denominated in a currency other than the books' functional currency, both amounts stay. Revaluation changes the functional carrying amount and does not rewrite the foreign amount.

**Kind.** Candidate law.

**Evidence.** E-008, E-017, E-027, E-030.

**Decision state.** `supported`

**Falsifier.** A multi-currency ledger that stores only the functional amount and cannot reproduce the foreign invoice total after a later rate change.

**Runtime consequence.** Money is an amount plus a currency. Conversion is a dated rate, not a silent overwrite. See S-ACC-006 and S-ACC-007.

## L10. Realized FX and unrealized FX are different Events

**Claim.** A difference that appears because a claim was settled at a new rate is not the same as a difference that appears because an open balance was revalued at a reporting date.

**Kind.** Candidate law.

**Evidence.** E-008, E-017.

**Decision state.** `supported`

**Falsifier.** A system that posts one undifferentiated exchange account for both, with no way to say whether the claim is still open.

**Runtime consequence.** Revaluation Actions must be distinguishable from settlement Actions.

## L11. Stock quantity change is not automatically a ledger Event

**Claim.** A movement of quantity can exist without a general ledger posting. When coupling is on, the trigger may be the movement, the invoice, or the period close. Those triggers are not the same law.

**Kind.** Candidate law.

**Evidence.** E-009, E-018. Moqui asset receipt and issuance, E-023.

**Decision state.** `supported` for the split. `undetermined` for a single coupling trigger.

**Falsifier.** Independent perpetual systems that all post the same accounts on the same operational Event, including Odoo 19, ERPNext, and Moqui.

**Runtime consequence.** Do not hide a GL write inside an inventory module. Name the coupling Action. Issue 18 owns quantity. This issue owns the accounting effect. See S-ACC-010, S-ACC-011, S-ACC-030.

## L12. Journal header and journal line both have identity

**Claim.** Balance, period, and reverse attach to the header. Account, amount, dimension, and party attach to the line. Neither identity is enough alone.

**Kind.** Candidate law.

**Evidence.** E-001, E-014, E-020, E-024.

**Decision state.** `hypothesis`

**Falsifier.** A production ledger that stores only lines, or only headers, and can still reverse, allocate, and report without reconstructing the missing identity.

**Runtime consequence.** Reverse names a header. Dimension and account filters name lines.

## L13. An operational document is not automatically the ledger journal

**Claim.** Invoice, payment, receipt, and stock document may cause a Journal. They are not the same individual as the Journal unless independent sources converge on that collapse.

**Kind.** Candidate law.

**Evidence.** E-011, E-014, E-023. Divergence in the matrix.

**Decision state.** `undetermined`

**Falsifier.** First-party agreement across ERPNext, Odoo, and Moqui that the invoice record is the journal record, or the reverse.

**Runtime consequence.** Do not freeze Action/Event identity on this collapse. See Q1.

## L14. Period-close encoding is not yet a law

**Claim.** No single record shape for close survived the sources.

**Kind.** Candidate law.

**Evidence.** E-005, E-015, E-022.

**Decision state.** `undetermined`

**Falsifier.** Independent first-party sources that implement close as the same combination of transfer, lock, exception types, and report reset.

**Runtime consequence.** Wave B must not pick a close table. Keep the two Actions in L7.

## L15. A prior-period error is not current profit

**Claim.** When a material error belongs to a prior reporting period, correction is restatement of that period or of opening equity, not income of the discovery period.

**Kind.** Candidate law.

**Evidence.** E-029. Counterexamples in operational reverse-in-current-period practice, S-ACC-028.

**Decision state.** `hypothesis`

**Falsifier.** A reporting framework that requires material prior-period errors to hit current profit, or an operational corpus that can produce IAS 8 comparatives from current-period reversals alone without a restatement view.

**Runtime consequence.** Reverse-in-open-period and restate-comparatives must both be representable. One is not a substitute for the other.

## L16. Money is not a binary float

**Claim.** Ledger amounts are decimal values in a currency. Binary floating point is not a money type.

**Kind.** Candidate law.

**Evidence.** E-027 `xsd:decimal`. Recurring rejection elsewhere, not reopened as a new primitive.

**Decision state.** `rejected` as a candidate primitive. The rejection is `supported`.

**Falsifier.** A first-party accounting model that stores statutory money as IEEE-754 binary and treats rounding as undefined.

**Runtime consequence.** Use a decimal amount plus currency. FIBO `MonetaryAmount` is evidence, not an import.

## L17. Parallel books are a cut, not a proven primitive

**Claim.** Actual, budget, and management books, or finance books, may need to post the same operational Event into more than one ledger slice.

**Kind.** Candidate law.

**Evidence.** Moqui `glFiscalTypeEnumId` E-020. ERPNext Finance Book on Journal Entry S-EN-01. Weak elsewhere.

**Decision state.** `hypothesis`

**Falsifier.** One books slice that can express statutory, management, and budget views without a fiscal-type or finance-book axis.

**Runtime consequence.** Do not add a Book primitive until issue 30 or a later pass finds independent convergence.

## L18. Failed posting is a real state

**Claim.** An attempted Posting can remain unposted with a reason. That is not the same as refused validation and not the same as success.

**Kind.** Candidate law.

**Evidence.** E-021. Weaker echoes in Odoo lock-shifted dates and ERPNext background submit for large journals.

**Decision state.** `hypothesis`

**Falsifier.** A corpus where every failed post is either fully rolled back or fully posted, with no durable unposted-with-reason record.

**Runtime consequence.** Constitution rule 9 applies. `unknown` and `unposted` must remain first-class if automatic posting exists.
