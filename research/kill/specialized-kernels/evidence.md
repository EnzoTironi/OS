---
issue: 58
kind: reference
fetched: 2026-08-16
decision_state: mixed
---

# Evidence

Each block names a kind and a decision state. Sibling folders are cited, not copied.

## E-001. H2 already named the kernel and then dropped it

**Kind.** source-system artifact of this repo  
**Decision.** supported as history

`docs/hypothesis-history.md` H2 placed Deterministic Kernels for accounting, inventory, manufacturing, and fiscal under a compiler. The weakening says an AccountingKernel below the ontology creates a second business model. RFC-0001 lists Deterministic Kernel among concepts intentionally not proposed as semantic primitives. Thesis section "Determinism belongs inside the business model" uses DebitTotal, CreditTotal, BalancedJournal, and PostJournalEntry as the example.

This is the claim under attack. It is not independent domain proof.

## E-002. Constitution already splits semantics from mechanism

**Kind.** source-system artifact of this repo  
**Decision.** supported as a standing rule, not as domain proof

Constitution §6 lists caches, materialized views, indexes, queues, generated code, and compiler phases as useful without being ontology concepts. Constitution §1 says a primitive must earn its place by enforcement that composition cannot reproduce, independent appearance, repeated failure, or a property that cannot be expressed without hidden convention.

A specialized evaluator can sit in §6. A second chart of accounts inside the engine cannot.

## E-003. Debit equals credit is a refuse-closed invariant

**Kind.** domain evidence  
**Decision.** supported

TigerBeetle states one invariant. Every debit has an equal and opposite credit. Transfers are immutable. Reversals are new transfers. Account objects keep the cluster-wide sums of posted debits and posted credits equal. S-TB-01, S-TB-03.

Sibling accounting L1 says a successful posting has debit total equal to credit total in the functional currency. Decision there is `supported`. S-SIB-21.

Thesis already uses that invariant as a Constraint. The domain law does not need a new primitive name.

## E-004. High-volume posting wants the invariant in the store

**Kind.** source-system artifact  
**Decision.** supported that the product exists. `undetermined` that OS must adopt it.

TigerBeetle's pitch is that SQL needs many round-trips per business transaction and that a database built for the debit/credit schema can enforce balance limits without application round-trips. S-TB-01. Uber, Airbnb, and Stripe are cited there as companies that later rebuilt around double-entry.

This is the strongest physical-kernel exhibit. It is still a store for one invariant plus append-only transfers. It does not decide which account is COGS, when revenue is recognized, or how a Brazilian CFOP is chosen.

## E-005. Palantir already splits Language from Engine

**Kind.** domain evidence for the cut. source-system artifact for the product names.  
**Decision.** supported as an independent operational-ontology split

Palantir's architecture page says the logic under an action can be a business rule, a machine-learning model, an LLM-driven function, or a multi-step orchestration that involves several compute engines. It then groups the system as Language, Engine, and Toolchain. The Language models objects, links, properties, actions, and the literal pieces of logic. The Engine substantiates the Language with high-scale reads, materializations, and atomic writes. S-PL-01.

Functions run server-side in an isolated environment and can back actions. S-PL-02.

That is semantic specialization in the Language and physical specialization in the Engine. It is not an AccountingKernel primitive.

## E-006. ValueFlows treats economic quantities as derived

**Kind.** domain evidence  
**Decision.** supported

ValueFlows says all economic information on an Economic Resource must be put there by an Economic Event. The current quantities can be stored or derived by iterating events. Derivation can have performance issues, so storage is allowed. S-VF-01, S-VF-02.

Accounting quantity and onhand quantity are different facts. The increment and decrement rules live on the action, not in a separate ledger language. S-VF-03.

A stored projection is a runtime choice. It is not a second semantic authority.

## E-007. IAS 2 names cost formulas, not an inventory kernel

**Kind.** domain evidence  
**Decision.** supported

IAS 2 paragraph 25 requires FIFO or weighted average for interchangeable inventories. The same formula must be used for inventories of similar nature and use. Paragraph 27 defines FIFO as earliest in, earliest out, and weighted average as a periodic or per-shipment average. Specific identification is required when items are not interchangeable. S-IF-01, S-IF-02.

LIFO is excluded in the IFRS text. US GAAP still allows it. That is a policy fork, not an engine primitive.

Sibling inventory says FIFO, LIFO, or average must not be placed in the kernel. S-SIB-18, "What this pass does not claim."

## E-008. ERPNext posts stock and GL from the same app, then admits the cost of recomputation

**Kind.** source-system artifact  
**Decision.** supported as behavior of one corpus

Perpetual inventory writes a GL effect on each stock transaction. Valuation uses FIFO, moving average, or actual serial cost. A warehouse may link to an account. S-EN-01.

Immutable ledger keeps original rows and writes reversals. Backdated stock can change later FIFO or moving-average values. ERPNext therefore runs a Repost Item Valuation job and warns that large or old corrections are expensive. S-EN-02.

The product did not invent a second language. It invented a specialized recompute job because generic row edits would destroy audit and because naive replay is slow.

## E-009. Odoo 19 splits physical stock from accounting valuation and still names the same formulas

**Kind.** source-system artifact  
**Decision.** supported as behavior of one corpus

Odoo Inventory keeps real-time physical valuation. Accounting updates on request, at closing, or when bills and invoices post under perpetual mode. Company settings choose Periodic or Perpetual, and Standard, FIFO, or Average. Continental and Anglo-Saxon timing differ. Stock interim accounts were removed in 19. A Variation account now buffers unbilled movement. S-OD-01.

Sibling accounting L11 says a stock quantity change is not automatically a ledger Event. Coupling trigger stays `undetermined`. S-SIB-21.

Odoo and ERPNext disagree on when the GL writes. They agree that costing is a named method over movements, not a separate ontology.

## E-010. MRP explosion is deterministic. Finite scheduling is search.

**Kind.** domain evidence  
**Decision.** supported for the split

Sibling planning L-01 and L-03 treat BOM explosion and material netting as Functions that pin specification revision and position snapshot. L-06 says a legal MRP output can still be impossible to run. Finite scheduling is an extra constraint set. S-SIB-24.

Wikipedia APS says traditional MRP allocates material and capacity in steps, often ignores constraints, and can emit infeasible plans. APS plans materials, labor, and plant capacity together. The solution space grows roughly factorially with the number of items. S-APS-01.

Explosion is arithmetic over a recipe. Sequencing under contention is combinatorial search. Calling both `Function` without naming the class hides the difference. Open question 9 already asks this. This folder does not close it.

## E-011. A solver that writes work orders is a second authority

**Kind.** counterexample pressure  
**Decision.** hypothesis

Dassault-style APS products push a feasible schedule back into the ERP for execution. That is a vendor pattern, not a first-party OS source. The useful observation is the handoff. If the solver's chosen start time becomes operational truth without an Action that rebinds current demand, capacity, and policy, the solver is the business model.

Sibling planning L-07 says authorizing supply is a different speech act from calculating need. Decision there is `hypothesis`. S-SIB-24.

## E-012. Fiscal legal existence is signature plus authorization

**Kind.** domain evidence  
**Decision.** supported

Ajuste SINIEF 07/05 cláusula primeira § 1º defines NF-e as a digital document whose legal validity is a qualified electronic signature plus authorization of use by the tax administration, before the fato gerador. Cláusula quarta says the digital file may be used as a fiscal document only after transmission and Autorização de Uso. S-AJ-01, S-AJ-02.

Sibling fiscal CL-003 and CL-005 say the same and treat authorization as an external authority event. S-SIB-30.

An OS kernel that "is" the NF-e would be lying. The authorizer is SEFAZ.

## E-013. Certified fiscal software forbids a second set of books

**Kind.** domain evidence  
**Decision.** supported as a legal requirement on software. `undetermined` as an OS module.

Ato COTEPE/ICMS 9/13 binds both the PAF-ECF and the Sistema de Gestão. ER-PAF-ECF requisito I says the PAF-ECF and the management or back-office system must not let the user hold accounting information different from what is supplied to the Fazenda, citing Lei 8.137/90 art. 2, V. S-PAF-01, S-PAF-02.

That is a certification and integration duty. It is not a reason to put CFOP in the generic engine. Sibling fiscal already refuses CFOP, CST, and chave de acesso as kernel primitives. S-SIB-30.

## E-014. SPED validators are official programs outside the ERP

**Kind.** domain evidence  
**Decision.** supported

Receita publishes separate validator programs for ECD, ECF, EFD-Contribuições, and EFD ICMS IPI. S-SPED-01. The ECD service page tells the taxpayer to download the Programa Validador Assinador and always use the latest version. S-SPED-02.

The government already reserved a physical checker. An OS that silently reimplements PVA as semantic law will drift on every layout revision.

Sibling fiscal CL-012 says ECD, ECF, EFD ICMS IPI, and EFD-Contribuições are distinct accessory obligations. Projection versus ledger stays `undetermined`. S-SIB-30.

## E-015. Payroll and tax filing are dated government layouts

**Kind.** domain evidence  
**Decision.** supported that the layout is external. `undetermined` that calculation must leave the ontology.

eSocial S-1.3 publishes S-1200 for remuneration of workers under RGPS and S-1202 for RPPS. The event carries rubricas and incidence codes. S-ES-01.

The calculation of INSS, IRRF, or FGTS from those rubricas is a dated function of published tables. The filing is an accessory obligation with a government schema. Those are not the same job.

US certified payroll engines were not fetched. Do not invent a US law from the Brazilian layout.

## E-016. Money is decimal. Binary float is already rejected.

**Kind.** domain evidence  
**Decision.** supported

Sibling values L-NUM-01 rejects IEEE 754 binary float for money. L-NUM-02 says rounding mode, increment, and application point are named. L-MNY-01 says money is amount plus currency. S-SIB-62.

Sibling accounting L16 rejects float-for-money as a primitive and supports the rejection. S-SIB-21.

TigerBeetle stores amounts as unsigned 128-bit integers. S-TB-03. That is a physical encoding of the same law.

A decimal evaluator is required. A MoneyKernel primitive is not.

## E-017. Stock events and ledger events are different individuals

**Kind.** domain evidence  
**Decision.** supported

Sibling accounting L11. Sibling primitives L-P-13. Sibling inventory L-INV-10 via the 55 and 56 notes. S-SIB-21, S-SIB-56, S-SIB-18.

ERPNext can couple them on every stock voucher. Odoo 19 can delay the accounting write until invoice or closing. Moqui can post asset receipt without treating the movement as the journal. The coupling is a named Action when it exists.

A specialized inventory-accounting kernel that always posts both would erase a supported split.

## E-018. Context ontologies are not specialized kernels

**Kind.** domain evidence from a sibling kill test  
**Decision.** supported as a warning, not as this issue's main law

Issue 55 rejects one enterprise vocabulary and keeps a shared metamodel as `hypothesis`. Commerce Product, manufacturing specification, and accounting valuation class are false cognates. S-SIB-55.

That is semantic specialization of *definitions*. It is the opposite of a hidden engine that owns posting rules the ontology cannot see.

## E-019. Eval is not Bind

**Kind.** sibling candidate law  
**Decision.** cited as `supported` there. Not re-litigated here.

Issue 56 L-P-05 says typed computation and a gate with an obligation are different jobs. Constraint and Policy may be Bind jobs. Function as the only logic word dies. S-SIB-56.

If synthesis later accepts that, a posting Constraint is still not an AccountingKernel. It is Bind with obligation=system over debit and credit totals.

## E-020. Backdated valuation is an ordered replay

**Kind.** domain evidence  
**Decision.** supported as a runtime pressure

ERPNext states that inserting an earlier stock movement can change later FIFO layers or moving-average rates and that recomputing every later entry is expensive. The supported path is a sequenced Repost Item Valuation job, not a silent UPDATE. S-EN-02.

IAS 2 FIFO is an order over receipts. Replay must be deterministic given the same movements, the same formula, and the same valid times.

A generic unordered Function fold will get this wrong. A specialized layer walker can still be the evaluator of an ontology-defined formula.

## E-021. Failed or unknown posting is a real state

**Kind.** domain evidence  
**Decision.** hypothesis, following siblings

Sibling accounting L18. Constitution §9. Fiscal authorization can finish authorized, rejected, or unknown. S-SIB-21, S-SIB-30.

A kernel that only knows posted-or-rolled-back cannot represent SEFAZ timeout or a background journal that failed after draft.

## E-022. Company-specific fiscal and payroll rules must not enter the generic engine

**Kind.** standing rule plus domain evidence  
**Decision.** supported as a prohibition

Constitution §12 forbids `if company == X` in the generic engine. Sibling fiscal says CFOP, CST, CSOSN, CEST, and NCM are dated Brazil tables, not engine primitives. S-SIB-30.

eSocial rubrica codes are the same class of table. S-ES-01.

Semantic specialization belongs in the model. Physical layout emitters may compile those tables. They may not become the place the rules are invented.
