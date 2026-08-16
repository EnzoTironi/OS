---
issue: 31
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenario cards

Adversarial cases for one group with several legal persons. Happy paths alone are not evidence. Each card names kind and decision state. These are not executable tests yet.

The running group is Nova Brasil. Holding Nova Participações Ltda. Operating companies Nova Indústria Ltda. and Nova Comércio Ltda. Each operating company has its own CNPJ. Fiscal-document rules belong to issue 30. CNPJ here is only a jurisdictional identifier.

## ME-001. Shared products, two CNPJs

**Kind.** Counterexample.

A finished good is one product across the group. Indústria manufactures it. Comércio sells it. External customers see one SKU.

Questions:

- Is product identity group-wide while cost, tax template, and income account are per legal person?
- If Comércio's cost differs from Indústria's cost, which value is inventory and which value is transfer price?

**Laws.** L7, L10. **Evidence.** E2, E10. **Decision state.** `hypothesis`.

## ME-002. Shared supplier, entity-specific terms

**Kind.** Counterexample.

The same steel mill supplies both CNPJs. Payment terms are 14 days for Indústria and 45 days for Comércio. Each company has its own payable account.

Questions:

- Does the supplier organization remain one party?
- Do terms live on a relationship scoped by legal person?

**Laws.** L7, L12. **Evidence.** E2, E14, E26. **Decision state.** `supported` that Supplier is not a Kind.

## ME-003. Intercompany inventory sale with markup

**Kind.** Counterexample.

Indústria sells 100 units to Comércio at a transfer price above cost. Goods remain unsold at month end.

Questions:

- Are there two invoices and two stock events?
- Does group reporting eliminate the unrealized profit still in Comércio's inventory?
- Do statutory books of each CNPJ keep the markup?

**Laws.** L3, L5, L10. **Evidence.** E3, E17. **Decision state.** `hypothesis`.

## ME-004. One building, two stock ledgers

**Kind.** Counterexample.

Indústria and Comércio share a rented shed in Guarulhos. Pickers walk one aisle.

Questions:

- Are there two warehouse records and two valuation accounts?
- What document moves ownership from one CNPJ to the other?
- Can a stock entry between the two warehouse records be legal?

**Laws.** L4. **Evidence.** E5. **Decision state.** `hypothesis`. Issue 18 owns custody.

## ME-005. Cross-entity service recharge

**Kind.** Counterexample.

Participações pays a shared software bill. Indústria consumed 70 percent. Comércio consumed 30 percent.

Questions:

- Does one bank payment plus two due-to or due-from entries explain the event?
- Is an invoice required, or is a linked journal pair enough?
- What happens if only the paying company's entry is submitted?

**Laws.** L3, L10. **Evidence.** E4, E28. **Decision state.** `supported` that a claim is required.

## ME-006. Functional currency change

**Kind.** Counterexample.

Comércio's primary cash environment moves from BRL to USD after an export shift. IAS 21 says functional currency changes only when underlying conditions change.

Questions:

- Is the change a dated fact about the legal person?
- Are historical functional amounts still explainable?
- Does group presentation currency stay BRL?

**Laws.** L6, L8. **Evidence.** E21. **Decision state.** `hypothesis`. Issue 21 owns mechanics.

## ME-007. Historical spin-off

**Kind.** Counterexample.

On 1 March 2024, Comércio is carved out of Indústria into a new CNPJ. Intercompany balances begin that day. Auditors ask for February 2024 as if one legal person still existed.

Questions:

- Can the system answer valid-then versus known-then?
- Is this legal succession, record split, or both? Issue 14 owns that fork.

**Laws.** L8. **Evidence.** E18, E22, E24. **Decision state.** `hypothesis`.

## ME-008. Branch recorded as a company

**Kind.** Counterexample.

A São Paulo sales office of Indústria is created as its own Company so managers can see a P&L. It has no CNPJ. Intercompany invoices start appearing for internal stock.

Questions:

- Should this have been a branch, cost center, or warehouse?
- Does creating a Company force a legal-person identity that does not exist?

**Laws.** L1, L11. **Evidence.** E1, E9, E27. **Decision state.** `supported` that the cut matters.

## ME-009. Sixty percent subsidiary, NCI forty percent

**Kind.** Counterexample.

Participações owns 60 percent of Indústria and controls it. Forty percent is an outside investor.

Questions:

- Is Indústria fully combined, with NCI in equity?
- Does 60 percent combination of each line item satisfy IFRS 10? The standard says no. Full combination plus NCI.

**Laws.** L2, L5. **Evidence.** E16, E18. **Decision state.** `supported` as an IFRS requirement.

## ME-010. Twenty-five percent associate

**Kind.** Counterexample.

Participações owns 25 percent of a logistics company and has significant influence, not control.

Questions:

- Is the investee outside line-by-line consolidation?
- Does the equity method live on Participações' books rather than in elimination journals?

**Laws.** L2. **Evidence.** E20. **Decision state.** `supported`.

## ME-011. De facto control without a majority

**Kind.** Counterexample.

Participações owns 48 percent. The remaining shares are widely held. Participações directs relevant activities.

Questions:

- Does a Parent Company field that requires 50 percent miss control?
- What evidence records power and variable returns?

**Laws.** L2. **Evidence.** E16. **Decision state.** `hypothesis` for operational storage. `supported` that share count is insufficient.

## ME-012. Protective rights only

**Kind.** Counterexample.

A lender can block large asset sales. It has no power to direct relevant activities.

Questions:

- Do those rights create a parent?
- IFRS 10 says protective rights do not give power.

**Laws.** L2. **Evidence.** E16. **Decision state.** `supported` as IFRS. `undetermined` in ERPs.

## ME-013. One intercompany invoice cancelled

**Kind.** Counterexample.

Indústria submits a sales invoice to Comércio. Comércio's purchase invoice is submitted. Indústria later cancels its invoice. Comércio's invoice remains.

Questions:

- Are the books now inconsistent as a pair?
- Does cancellation of one force a required action on the other without silently deleting it?

**Laws.** L3. **Evidence.** E3. **Decision state.** `supported` that the documents are independent.

## ME-014. Intercompany journal posted on one side

**Kind.** Counterexample.

The paying company's journal is submitted. The linked draft for the other company is never submitted.

Questions:

- Is the group event incomplete?
- Can reports detect the missing counterpart?

**Laws.** L3. **Evidence.** E4. **Decision state.** `supported`.

## ME-015. Transfer price differs from external price

**Kind.** Counterexample.

Indústria sells to Comércio at 80. Comércio sells to a customer at 120. A tax auditor asks why 80 is the intercompany amount.

Questions:

- Is 80 a term of the intercompany relationship?
- Which official pricing method produced it? OECD text was not fetched. Stays `undetermined`.

**Laws.** L10. **Evidence.** E3, E17. **Decision state.** `hypothesis`.

## ME-016. Cross-border intercompany, different tax

**Kind.** Counterexample.

A US sister sells to Nova Indústria. Tax rows valid in the US are wrong for Brazilian inbound purchase. E29.

Questions:

- Can mapped counterparts copy quantity and fail closed on tax?
- Issue 30 owns the fiscal document.

**Laws.** L3, L7. **Evidence.** E29, E11. **Decision state.** `supported` that tax can differ.

## ME-017. Shared product, company-specific cost

**Kind.** Counterexample.

Odoo 19 allows a shared product with company-specific Cost and shared Sales Price.

Questions:

- Is that the right split for a Brazilian group that also has entity-specific list prices?
- What happens if Cost is used as an implicit transfer price?

**Laws.** L7, L10. **Evidence.** E10. **Decision state.** `hypothesis`.

## ME-018. Reporting currency without changing books

**Kind.** Counterexample.

Indústria's company currency is BRL. Directors want a USD pack. Presentation currency changes display only. E25.

Questions:

- Are ledger entries still BRL?
- Is this different from a functional-currency change?

**Laws.** L6, L11. **Evidence.** E21, E25. **Decision state.** `supported` that display is not rewrite.

## ME-019. Unrealized profit in transit

**Kind.** Counterexample.

Goods left Indústria on 28 August and arrived at Comércio on 2 September. Month-end consolidation is 31 August.

Questions:

- Where is ownership at month end?
- Which unrealized profit is eliminated, and in which period?
- Issue 18 owns in-transit custody.

**Laws.** L3, L4, L5. **Evidence.** E17. **Decision state.** `hypothesis`.

## ME-020. Cumulative translation adjustment

**Kind.** Counterexample.

Indústria is BRL functional. Group presentation is USD. Equity uses historical rates. Profit and loss uses average rates. Other balance-sheet items use closing rates. E12.

Questions:

- Is CTA a consolidation fact rather than a statutory journal in Indústria?
- Which company's rate table is used? Odoo uses the currently selected company.

**Laws.** L5, L6. **Evidence.** E12, E21. **Decision state.** `hypothesis`.

## ME-021. Mid-year acquisition

**Kind.** Counterexample.

Control of a third CNPJ is obtained on 15 August. IFRS 10 starts consolidation that day. IFRS 3 measures the business combination.

Questions:

- Are pre-15 August revenues of the acquiree outside the group statement?
- Is goodwill a group fact, not a line in the acquiree's statutory book?

**Laws.** L2, L5, L8. **Evidence.** E16, E22. **Decision state.** `supported` as IFRS. `undetermined` in ERPs.

## ME-022. Loss of control

**Kind.** Counterexample.

Participações sells enough of Indústria to lose control and keeps 15 percent.

Questions:

- Do Indústria's assets leave the group projection?
- Is the retained 15 percent a new financial asset or associate?
- Do historical group statements before the sale remain explainable?

**Laws.** L2, L8. **Evidence.** E18, E20. **Decision state.** `supported` as IFRS.

## ME-023. Ownership change without loss of control

**Kind.** Counterexample.

Participações buys another 10 percent of Indústria and still controls it. IFRS 10 treats this as an equity transaction.

Questions:

- Does goodwill get remeasured? The standard says no for this case.
- Does NCI change inside equity?

**Laws.** L2, L8. **Evidence.** E18. **Decision state.** `supported` as IFRS.

## ME-024. Two charts, mapped consolidation

**Kind.** Counterexample.

Indústria uses a Brazilian chart. A US sister uses a US chart. Odoo maps five US income accounts to one Belgian income account. E12.

Questions:

- Is mapping a consolidation function, not a requirement that every company share one chart?
- ERPNext prefers matching child accounts to a parent structure. E1. How strict that is stays `undetermined` after the 404.

**Laws.** L5. **Evidence.** E12, E1. **Decision state.** `hypothesis`.

## ME-025. Statutory book versus group book

**Kind.** Counterexample.

Indústria depreciates an asset under local rules in one Finance Book and under group rules in another. E7. The CNPJ does not split.

Questions:

- Is the book a reporting basis for one legal person?
- Does creating the group book invent a second company record?

**Laws.** L11. **Evidence.** E7, E19. **Decision state.** `undetermined` for book identity. Issue 21.

## ME-026. CNPJ on address versus on legal person

**Kind.** Counterexample.

ERPNext Indian GSTIN sits on Address. A Brazilian group may have a CNPJ per establishment. Issue 30 owns the fiscal cut.

Questions:

- Can two CNPJs belong to one legal person, or is each CNPJ a legal person?
- This folder must not invent the answer.

**Laws.** L1. **Evidence.** E1, E23. **Decision state.** `undetermined`. Cite issue 30.

## ME-027. Effective-dated parent change recorded late

**Kind.** Counterexample.

A share purchase closed on 1 January. The system is told on 20 February.

Questions:

- What was group membership as known on 31 January?
- What is group membership now believed to have been on 31 January?

**Laws.** L8. **Evidence.** E16, E24, E31. Constitution §10. **Decision state.** `hypothesis`.

## ME-028. Joint control

**Kind.** Counterexample.

Two unrelated parents must act together to direct a plant. IFRS 10 says neither individually controls. IAS 28 and IFRS 11 then apply. IFRS 11 full text was not fetched.

Questions:

- Is the plant a subsidiary of either parent?
- Mark IFRS 11 mechanics `undetermined`.

**Laws.** L2. **Evidence.** E16, E20. **Decision state.** `undetermined` for joint-arrangement typing.

## ME-029. Investment entity exception

**Kind.** Counterexample.

A parent meets the IFRS 10 investment-entity tests and measures a subsidiary at fair value instead of consolidating it.

Questions:

- Does control without line-by-line combination survive?
- Should OS treat this as policy over a control fact?

**Laws.** L2, L5. **Evidence.** E32. **Decision state.** `hypothesis`.

## ME-030. Intragroup loan as net investment

**Kind.** Counterexample.

Participações lends USD to a foreign subsidiary as part of its net investment. IAS 21 sends some exchange differences to other comprehensive income in the statements that include the foreign operation.

Questions:

- Is the loan still an intercompany claim that eliminates?
- Is the translation difference a group fact?

**Laws.** L5, L6. **Evidence.** E17, E21. **Decision state.** `hypothesis`. Issue 21.

## ME-031. Different fiscal year ends

**Kind.** Counterexample.

One subsidiary closes on 31 March. The parent closes on 31 December. IFRS 10 requires uniform policies and dated control. The pages fetched do not spell the maximum gap.

Questions:

- What additional facts are needed to combine unlike periods?
- Mark the allowed gap `undetermined`.

**Laws.** L5, L8. **Evidence.** E16. **Decision state.** `undetermined`.

## ME-032. Cross-company permission leak

**Kind.** Counterexample.

A clerk of Comércio is granted view access to Indústria so she can match intercompany invoices. She posts a journal into Indústria.

Questions:

- Did visibility imply posting authority?
- Did posting imply IFRS control? No.

**Laws.** L9. **Evidence.** E13, E15, E30. **Decision state.** `supported` that the three facts differ.

## ME-033. One external customer, two legal sellers

**Kind.** Counterexample.

A supermarket buys from Indústria in one state and from Comércio in another. The supermarket is one organization.

Questions:

- Are there two customer relationships, one party?
- S-005 already asks the supplier-is-also-customer case. This card adds two sellers.

**Laws.** L7, L12. **Evidence.** E2, E26. **Decision state.** `hypothesis`.

## ME-034. Synced stock move versus commercial pair

**Kind.** Counterexample.

Odoo 19 can synchronize stock moves between companies. ERPNext collaborators require Delivery Note and Purchase Receipt.

Questions:

- Can one physical pick produce two legal-person stock events without a hidden second engine?
- If sync auto-validates, what happens when one side is cancelled?

**Laws.** L3, L4. **Evidence.** E5, E11. **Decision state.** `undetermined` which operationalization survives.

## Seed suite cross-links

`scenarios/README.md` S-005 and S-006 remain foundation scenarios. This folder does not rewrite them. Multi-company was listed there as a future family. ME-001 through ME-034 are that family for issue 31.
