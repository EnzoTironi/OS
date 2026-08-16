---
issue: 58
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Counterexample scenarios

Each card tries to kill a law. Seed scenarios S-007, S-010, and S-012 remain relevant and are not rewritten.

## S-K-01. Kernel posts a different journal than the ontology showed

**Attacks.** L-K-01, A-AGAINST-01  
**Setup.** Preview of PostJournalEntry shows debit 100 to Expense and credit 100 to Bank. The specialized poster writes 100 to a hidden rounding account.  
**If this is accepted as correct.** Semantic kernels return. L-K-01 dies.  
**If this is refused.** The evaluator failed test 2 and test 3 in `boundary.md`.

## S-K-02. Authors cannot state FIFO without an InventoryKernel type

**Attacks.** L-K-02, L-K-05  
**Setup.** A first vertical needs IAS 2 FIFO. The only working encoding is an engine type `FifoLayer` that ontology Functions cannot mention.  
**If two corpora need that.** R-K-02 is reopened.  
**Present evidence.** ERPNext and Odoo name the method on item or category and walk movements. They do not mint a language.

## S-K-03. A statutory ledger posts unbalanced journals as the happy path

**Attacks.** L-K-03  
**Setup.** A mature production ledger posts debit 100 and credit 99 with no suspense bucket and no unposted error.  
**If found.** L-K-03 and sibling L1 die.  
**Present evidence.** TigerBeetle and sibling L1 go the other way.

## S-K-04. Regulated correction is delete-and-rekey of posted rows

**Attacks.** L-K-04  
**Setup.** A regulator accepts deletion of the original GL row with no residual original.  
**If found in a first-party rule.** L-K-04 weakens.  
**Present evidence.** ERPNext immutable ledger and TigerBeetle forbid it.

## S-K-05. Unordered fold matches FIFO after backdating

**Attacks.** L-K-05, A-FOR-02  
**Setup.** On day 1 receive 10 at 10. On day 3 receive 10 at 20. On day 2 a late document shows an issue of 10. An unordered sum and an ordered FIFO walker disagree.  
**If the unordered Function is accepted as statutory.** L-K-05 dies.  
**If they disagree and FIFO is required.** A-FOR-02 stands. The walker is physical.

This is seed S-007 with a valuation question attached.

## S-K-06. Every perpetual system posts the same GL on the same stock Event

**Attacks.** L-K-06  
**Setup.** ERPNext, Odoo 19, and Moqui all write the same accounts at the same moment for receipt, delivery, and transfer, including consignment.  
**If shown.** L-K-06 and sibling L11 die.  
**Present evidence.** Odoo 19 can wait for invoice or closing. ERPNext default perpetual writes on the stock voucher.

## S-K-07. Finite contention is a closed-form Function

**Attacks.** L-K-07  
**Setup.** A plant with shared work centers produces a unique feasible sequence from BOM and lead time alone, with no search and no infeasible MRP output.  
**If that is the general case.** The class split shrinks to "optional solver."  
**Present evidence.** Wikipedia APS and sibling L-06 treat infeasible MRP as normal.

## S-K-08. Solver write is the authorization

**Attacks.** L-K-08  
**Setup.** An APS engine inserts work orders. No Action rebinds demand or capacity. Auditors treat the solver log as the authorization.  
**If that is lawful and general.** L-K-08 dies and R-K-04 returns.  
**Present evidence.** Sibling L-07 and Palantir's split between running a scenario and triggering a purchase order.

## S-K-09. Local signature creates the NF-e without an authorizer

**Attacks.** L-K-09  
**Setup.** A first-party rule says taxpayer signature alone creates the NF-e in the ordinary path, including non-contingency.  
**If found.** L-K-09 and sibling CL-005 die.  
**Present evidence.** Ajuste SINIEF 07/05 cláusula quarta.

## S-K-10. Certified POS is allowed a second book

**Attacks.** L-K-10  
**Setup.** A first-party PAF or successor rule allows the management system to hold accounting totals different from the fiscal file.  
**If found.** L-K-10 dies. A-FOR-01 weakens.  
**Present evidence.** ER-PAF-ECF requisito I.

## S-K-11. Statutory money is only correct in binary float

**Attacks.** L-K-11  
**Setup.** A first-party accounting model stores statutory money as IEEE 754 binary and treats rounding as undefined, and that is accepted.  
**If found.** Issue 62 L-NUM-01 and this law die.  
**Present evidence.** None in this pass.

## S-K-12. Required meaning exists only inside the evaluator

**Attacks.** L-K-12, A-AGAINST-05  
**Setup.** After good-faith Functions and Constraints, a vertical still has a business rule that can be executed only as sealed engine code and cannot be printed as a definition.  
**If found in two domains.** Semantic kernels return for that rule.  
**Present evidence.** Not found. Tax tables, FIFO, and balance all have printable forms.

## S-K-13. High-volume poster plus unknown authorization

**Attacks.** E-021, L-K-09  
**Setup.** A specialized ledger store posts locally, then NF-e authorization times out. The store thinks posted. SEFAZ is unknown.  
**Required behavior.** Local books may hold a journal. Fiscal legal existence stays unknown. Constitution §9.  
**If the store collapses this to posted-and-legal.** The physical engine failed test 4.

## S-K-14. Period close versus valuation replay

**Attacks.** L-K-04, L-K-05  
**Setup.** A backdated receipt lands in a closed period. Replay would change last quarter COGS.  
**Required behavior.** Period lock and valuation replay are different Actions. Sibling accounting L7.  
**If one kernel button does both and cannot split them.** Source accident, not a law.

## S-K-15. Payroll rubrica versus accounting wage expense

**Attacks.** L-K-09, L-K-06  
**Setup.** eSocial S-1200 accepts a rubrica. The GL wage expense uses a different grouping.  
**If they must be one kernel object.** Rejected on present evidence. They are two projections of employment Facts.  
**If they can diverge without a named mapping.** Maintainability fails. That is a mapping problem, not a kernel.

## S-K-16. Seed S-010 through a specialized poster

**Attacks.** L-K-04, L-K-06  
**Setup.** A posted sales invoice has GL rows, stock movements, and a payment allocation. Cancel is requested.  
**Required behavior.** Compensating Actions, not deletion. Stock reverse and GL reverse may be different Actions.  
**If a kernel delete-cascade is the only path.** L-K-04 dies.
