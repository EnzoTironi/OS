---
issue: 31
kind: domain evidence
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Each block names its kind. Source-system artifacts are observations about one product. Domain evidence is a distinction that appears in the world or in an independent standard. Decision state is never `accepted`.

## E1. Company is the legal-entity book boundary in ERPNext

**Kind.** Source-system artifact.

**Source.** https://docs.frappe.io/erpnext/company-setup retrieved 2026-08-16.

**Observed model.** A Company is a legal entity whose transactions, accounts, taxes, stock valuation, and financial statements must be kept together. Create a Company when the entity keeps separate books or statutory registrations. Use branches, cost centers, accounting dimensions, or warehouses when the operation belongs to the same legal entity.

**Observed behavior.** Is Group marks a parent used to organize children. A group does not post normal business transactions. Parent Company places an entity under a group. Default Currency is the base ledger currency. Reporting Currency is a second display currency.

**Invariant.** Inter-company sales and purchases must still be recorded in the relevant legal entities.

**Interpretation.** ERPNext collapses legal person and operating company record into one DocType, then carves out a non-posting group node.

**Decision state.** `supported` as ERPNext behavior. `undetermined` as a claim that legal person and company record are the same identity.

## E2. Shared masters, separate books

**Kind.** Source-system artifact.

**Source.** https://docs.frappe.io/erpnext/concepts-and-terms retrieved 2026-08-16.

**Observed model.** One site can hold many Company records. Accounting differs per Company. Customer, Supplier, and Item records are shared.

**Interpretation.** Common catalog identity is not the same as common books. Issue 14 already rejects Customer and Supplier as kinds. The shared masters here are still source labels.

**Decision state.** `supported` as ERPNext behavior.

## E3. Intercompany invoices are two legal documents

**Kind.** Domain evidence, observed through a source artifact.

**Source.** https://docs.frappe.io/erpnext/inter-company-invoices retrieved 2026-08-16.

**Observed model.** A Customer represents the buying Company. A Supplier represents the selling Company. Represents Company binds the party record to the other legal entity. A submitted Sales Invoice can create a linked Purchase Invoice. The reverse flow exists. Choose one direction. Do not create both counterparts independently.

**Observed behavior.** The Purchase Invoice is a separate accounting transaction. Accounts, warehouses, and taxes stay company-specific. Tax rows on the source document are not assumed correct for the target. The invoice pair does not replace stock movement. Delivery Note, Purchase Receipt, or an inter-company stock process is still required. Cancellation of one invoice does not automatically correct the other.

**Invariant.** Inter-company invoices do not consolidate the companies. Consolidated reporting and elimination are separate activities.

**Runtime consequence.** An intercompany sale is two Actions, two Events, and two ledgers, plus a link. One shared movement would erase tax, stock, and cancellation independence.

**Decision state.** `supported` for two-document intercompany trade.

## E4. Intercompany journal is two balanced entries

**Kind.** Domain evidence, observed through a source artifact.

**Source.** https://docs.frappe.io/erpnext/inter-company-journal-entry retrieved 2026-08-16.

**Observed model.** Shared software or trade-show cost paid by one company on behalf of another. First Journal Entry posts only in the paying company. A linked draft is created for the second company with empty account rows. Accounts belong to different charts, so they are not copied.

**Observed behavior.** Each company's entry balances independently. Same-currency linked totals must reverse. Cancelling one entry reverses its own ledger and drops the reference. It does not correct the other company.

**Invariant.** The event is complete across the group only after both linked entries are submitted.

**Decision state.** `supported`.

## E5. Warehouse belongs to one company

**Kind.** Domain evidence, observed through a source artifact.

**Sources.** https://docs.frappe.io/erpnext/warehouse retrieved 2026-08-16. https://github.com/frappe/erpnext/issues/46286 comments retrieved 2026-08-16.

**Observed model.** Warehouses are saved with the Company abbreviation. With perpetual inventory, each Warehouse must belong to a specific company so company-wise stock balance can be kept. Each Warehouse links to an Account of the same name.

**Observed behavior.** Issue 46286 asked for a shared warehouse across companies. Collaborator DipenFrappe wrote that it is not possible with the current design and not logical. A physical warehouse may be one. The books show it separately. Stock movement across companies uses Delivery Note or Sales Invoice and Material Receipt or Purchase Invoice. A stock entry between warehouses of separate companies may not work because each company has a separate chart of accounts.

**Interpretation.** Physical site and stock ledger are different identities. Issue 18 owns location ownership. This block only records the company boundary.

**Decision state.** `supported` for ERPNext. `hypothesis` as a domain law. See L4.

## E6. Three currencies on one invoice

**Kind.** Domain evidence, observed through a source artifact.

**Source.** https://docs.frappe.io/erpnext/multi-currency-accounting retrieved 2026-08-16.

**Observed model.** Company currency is the base ledger. Account currency is fixed on a ledger. Transaction currency is the invoice currency. A Price List can add a fourth pricing currency.

**Observed behavior.** ERPNext prevents changing an Account's currency after ledger entries exist. Revaluation changes company-currency carrying value. It does not change the foreign amount. Realized difference appears at settlement. Unrealized difference appears at a reporting date.

**Cross-reference.** Issue 21 owns book and currency mechanics. This block only records that company currency is not transaction currency.

**Decision state.** `supported` as ERPNext behavior.

## E7. Finance Book is a reporting basis, not a company

**Kind.** Source-system artifact.

**Source.** https://docs.frappe.io/erpnext/finance-book retrieved 2026-08-16.

**Observed model.** One Company can keep parallel views. Typical uses are statutory versus management depreciation, or local rules versus a group-reporting basis. Do not create books to separate departments. Use Cost Centers or Accounting Dimensions for those.

**Observed behavior.** A blank Finance Book is common and appears in every book view. Journal Entry Finance Book is read-only and comes from the company default.

**Interpretation.** Book and legal entity are different. Whether OS should treat a book as its own identity stays `undetermined`. Issue 21 owns that fork.

**Decision state.** `supported` as ERPNext behavior. `undetermined` as book-versus-entity identity.

## E8. Consolidated report is a group view over company filters

**Kind.** Source-system artifact.

**Source.** https://docs.frappe.io/erpnext/accounting-reports retrieved 2026-08-16.

**Observed model.** Company filter restricts a report to one legal entity. Use Consolidated Financial Statements for a group view. Presentation currency changes displayed amounts without changing ledger entries.

**Gap.** The dedicated Consolidated Financial Statement page returned 404. Whether ERPNext eliminates intragroup balances inside that report is `undetermined`.

**Decision state.** `supported` that ERPNext names a group report. `undetermined` for elimination behavior.

## E9. Odoo Company versus Branch

**Kind.** Domain evidence, observed through a source artifact.

**Sources.** https://www.odoo.com/documentation/18.0/applications/general/companies.html and https://www.odoo.com/documentation/18.0/applications/finance/accounting.html retrieved 2026-08-16.

**Observed model.** A company is an individual business entity with its own legal identity, financial records, and settings. Branches are subdivisions such as regional offices or departments under a common parent. Independent subsidiaries must be created as additional companies, not branches. A company defined as a parent cannot later become a branch.

**Observed behavior.** Branches share the parent chart of accounts, main currency, and taxes. Branches may have their own journals. Parent lock dates apply. A branch may set an earlier lock date. The parent can see all branch documents. A branch sees only its own. Adding a branch enables multi-company functions. Branches may share or split VAT numbers.

**Invariant.** Consolidating companies involves legally separate entities. Branches are subdivisions of one legal entity and are not consolidated the same way. Stated on the Odoo 18 consolidation page. See E12.

**Decision state.** `supported` for the legal-entity versus subdivision cut.

## E10. Shared record versus company-restricted record

**Kind.** Source-system artifact.

**Sources.** Odoo 18 and 19 multi-company pages retrieved 2026-08-16.

**Observed model.** Leave Company blank to share a product, contact, or equipment. Set Company to restrict it. Quotations, invoices, and bills are tied to one company. New products and contacts default to shared.

**Observed behavior.** Odoo 19 states that a shared product can still have company-specific Cost while Sales Price and Reference stay common.

**Interpretation.** Common catalog identity can carry entity-specific terms. Shared is not all-or-nothing.

**Decision state.** `supported` as Odoo behavior.

## E11. Intercompany counterpart generation

**Kind.** Source-system artifact.

**Sources.** Odoo 18 and 19 multi-company pages retrieved 2026-08-16.

**Observed model.** One company sells or buys from another company in the same database. Settings can generate bills, sales orders, or purchase orders. Products must be shared. Odoo 19 adds Synchronize Stock Moves. Warehouses for extra companies are created manually.

**Observed behavior.** Counterpart documents can be drafts or validated. Fiscal positions and localizations must be set. The furniture-line use case warns that a new company may be the wrong cut when analytic accounting and warehouses suffice.

**Decision state.** `supported` as Odoo behavior. Diverges from ERPNext on automatic validation and stock-move sync.

## E12. Consolidation tools are not operating books

**Kind.** Domain evidence, observed through a source artifact.

**Source.** https://www.odoo.com/documentation/18.0/applications/finance/accounting/get_started/consolidation.html retrieved 2026-08-16.

**Observed model.** Consolidation combines financial data from separate companies, each with its own books, into a unified view. Account mapping joins similar accounts. Regular ledgers exclude consolidation-adjustment journals. A multi-ledger on the consolidating company includes those adjustments. Horizontal groups show each company's contribution.

**Observed behavior.** Financial reports default to a statutory view. The full consolidation picture requires the multi-ledger that includes adjustments. Account merging is optional. Unmerging permanently merges chatter history. Translation uses historical rates for equity, average rates for profit and loss, and closing rates for other balance-sheet accounts. Rates used are those of the company currently selected.

**Invariant.** Branches are not consolidated the same way as legally separate entities.

**Decision state.** `supported` that consolidation is a mapped projection plus elimination journals.

## E13. Users see many companies and post in one

**Kind.** Source-system artifact.

**Source.** Odoo 18 accounting page retrieved 2026-08-16.

**Observed model.** Users can view records and reports from multiple companies simultaneously. They can work on a single company's accounting at a time.

**Interpretation.** Cross-company visibility is not the same as authority to mutate another entity's books.

**Decision state.** `supported` as Odoo behavior.

## E14. Internal Organization is a Party role

**Kind.** Source-system artifact.

**Sources.** Moqui Company Setup and Mantle Party pages retrieved 2026-08-16.

**Observed model.** A company is an Organization Party with role Internal. Accounting preferences attach after that role exists. Base Currency and a Source Party copy chart mappings. Party, Person, and Organization share `partyId`. Roles include carrier, bill-to customer, ship-from vendor, employee, and affiliate. PartyRelationship has fromDate, thruDate, and status. PartyIdentification holds driver license, employee number, and external ids. TimePeriod can be party-specific and closable for the general ledger.

**Interpretation.** Moqui does not invent a Company kind. It reuses Party plus role plus dated relationship. This agrees with issue 14 L1.

**Decision state.** `supported` as Moqui behavior.

## E15. Multi-organization isolation is a filter, not a tenant

**Kind.** Source-system artifact.

**Source.** https://www.moqui.org/m/docs/framework/Security retrieved 2026-08-16.

**Observed model.** `activeOrgId` is the user-selected organization. `filterOrgIds` is that org, or all orgs the user belongs to when none is selected. Entity filters constrain Invoice, Payment, OrderPart, Shipment, and similar records by from or to party.

**Interpretation.** Cross-company permission is record-level authorization over party membership. It is not a second database and not legal control.

**Decision state.** `supported` as Moqui behavior.

## E16. IFRS 10 control is not share count

**Kind.** Domain evidence.

**Sources.** https://www.ifrs.org/issued-standards/list-of-standards/ifrs-10-consolidated-financial-statements/ and the 2021 IFRS 10 Part A PDF retrieved 2026-08-16.

**Observed model.** An investor controls an investee if and only if it has power, exposure or rights to variable returns, and the ability to use that power to affect those returns. Power is existing rights that give the current ability to direct relevant activities. Protective rights do not give power. Two or more investors collectively control when they must act together. Then no investor individually controls.

**Observed behavior.** Control is reassessed when facts change. Consolidation begins when control is obtained and ceases when control is lost. Only one investor can control. Several parties can share returns. Non-controlling interests share profits.

**Invariant.** Consolidated financial statements present the assets, liabilities, equity, income, expenses, and cash flows of a parent and its subsidiaries as those of a single economic entity.

**Decision state.** `supported`.

## E17. Full intragroup elimination

**Kind.** Domain evidence.

**Source.** IFRS 10 paragraph B86 in the 2021 Part A PDF retrieved 2026-08-16.

**Observed model.** Consolidated statements combine like items, offset the parent's investment against the parent's share of subsidiary equity, and eliminate in full intragroup assets, liabilities, equity, income, expenses, and cash flows. Profits or losses sitting in inventory or fixed assets are eliminated in full. Intragroup losses may indicate impairment.

**Invariant.** Uniform accounting policies apply for like transactions in similar circumstances.

**Runtime consequence.** Elimination is a consolidation-time fact. It must not rewrite each subsidiary's statutory ledger.

**Decision state.** `supported`.

## E18. Non-controlling interest and ownership change

**Kind.** Domain evidence.

**Source.** IFRS 10 paragraphs 22–25 in the 2021 Part A PDF retrieved 2026-08-16.

**Observed model.** NCI is presented in equity, separately from owners of the parent. A change in ownership that does not lose control is an equity transaction. Loss of control derecognises the subsidiary's assets and liabilities, recognises any retained investment, and recognises a gain or loss on the former controlling interest.

**Decision state.** `supported`.

## E19. Separate statements are not consolidated statements

**Kind.** Domain evidence.

**Source.** https://www.ifrs.org/issued-standards/list-of-standards/ias-27-separate-financial-statements/ retrieved 2026-08-16.

**Observed model.** Separate financial statements are presented in addition to consolidated statements. In separate statements, investments in subsidiaries, joint ventures, and associates are at cost, under IFRS 9, or using the equity method.

**Interpretation.** A parent has at least two reporting identities. Its own books and the group projection.

**Decision state.** `supported`.

## E20. Significant influence is not control

**Kind.** Domain evidence.

**Source.** https://www.ifrs.org/issued-standards/list-of-standards/ias-28-investments-in-associates-and-joint-ventures/ retrieved 2026-08-16.

**Observed model.** An associate is an entity over which the investor has significant influence. Significant influence is the power to participate in financial and operating policy decisions without control or joint control. Twenty percent or more of voting power is presumed to be significant influence. The equity method updates the carrying amount for the investor's share of profit or loss and other comprehensive income.

**Decision state.** `supported`.

## E21. Functional, foreign, and presentation currency

**Kind.** Domain evidence.

**Sources.** IAS 21 About page and the 2025 issued HTML standard retrieved 2026-08-16.

**Observed model.** Functional currency is the currency of the primary economic environment, the environment in which the entity primarily generates and expends cash. Any other currency is a foreign currency. Presentation currency is the currency in which financial statements are presented and may be any currency. A foreign currency transaction is recorded in functional currency using the spot rate at the transaction date.

**Observed behavior.** Once determined, functional currency is not changed unless the underlying transactions, events, and conditions change. An entity may keep books in a currency other than functional currency. At reporting time those amounts are translated into functional currency. A group translates each entity whose functional currency differs from the presentation currency.

**Cross-reference.** Issue 21 owns currency mechanics. This block only records the three-way cut needed for multi-entity groups.

**Decision state.** `supported`.

## E22. Acquisition creates a new group composition

**Kind.** Domain evidence.

**Source.** https://www.ifrs.org/issued-standards/list-of-standards/ifrs-3-business-combinations/ retrieved 2026-08-16.

**Observed model.** An acquirer measures consideration at fair value, allocates it to identifiable assets and liabilities, and records goodwill or a bargain-purchase gain. The 2018 amendment distinguishes a business from a group of assets.

**Interpretation.** Historical reorganization is not a rename of a company record. It is a dated change of control plus a measurement event.

**Decision state.** `supported` for the existence of an acquisition event. `undetermined` for OS primitives.

## E23. LegalEntity is a LegalPerson under a jurisdiction

**Kind.** Domain evidence.

**Source.** https://github.com/edmcouncil/fibo/blob/master/ONTOLOGY_GUIDE.md retrieved 2026-08-16.

**Observed model.** A legal entity is a legal person that is a partnership, corporation, or other organization having the capacity to negotiate contracts, assume financial obligations, and pay off debts, organized under the laws of some jurisdiction.

**Gap.** The FIBO viewer page for LegalEntity did not render class text. OwnershipAndControl class bodies were not retrieved. 2025Q1 release notes say LegalPerson and LegalEntity moved to OMG Commons Organizations.

**Cross-reference.** Issue 14 owns LegalPerson identity. This block only records the FIBO differentia that matter for groups.

**Decision state.** `supported` for the published definition. `undetermined` for FIBO ownership and control properties.

## E24. LEI Level 2 is accounting-consolidating parent, not share count

**Kind.** Domain evidence.

**Sources.** GLEIF concatenated-file page and RR-CDF 2.1 schema retrieved 2026-08-16.

**Observed model.** Level 1 answers who is who. Level 2 answers who owns whom. A legal entity reports its direct accounting consolidating parent and its ultimate accounting consolidating parent. StartNode is the child whose accounts are fully consolidated by EndNode. Exceptions include no parent, opt-out, and parent without an LEI.

**Interpretation.** Public legal-entity identity already treats consolidating parent as a dated relationship, not as a field on the child.

**Decision state.** `supported`.

## E25. Presentation currency does not rewrite the ledger

**Kind.** Domain evidence, observed through a source artifact.

**Source.** ERPNext accounting-reports page retrieved 2026-08-16.

**Observed model.** Presentation currency changes displayed amounts without changing underlying ledger entries.

**Cross-reference.** IAS 21 E21. Odoo consolidation uses selected-company rates. E12.

**Decision state.** `supported`.

## E26. Customer and Supplier as kinds already rejected

**Kind.** Domain evidence.

**Sources.** `docs/hypothesis-history.md` on origin/main. Issue 14 L1 on `cursor/issue-14-domain-cfd8`. ERPNext inter-company invoices still create Customer and Supplier records with Represents Company.

**Observed model.** The same organization can be customer of one entity and supplier of another. Internal party records are roles that point at another Company.

**Decision state.** `rejected` that Customer or Supplier is a Kind. Not reopened here.

## E27. Group node that cannot transact

**Kind.** Source-system artifact.

**Source.** ERPNext company-setup page retrieved 2026-08-16.

**Observed model.** Is Group makes the record an organizational parent instead of a normal transaction company.

**Counterexample pressure.** IFRS 10 parents are themselves legal entities that often transact. A holding company that issues invoices is not a non-posting folder. See ME-008.

**Decision state.** `supported` as ERPNext behavior. `rejected` as a domain law that parents never transact.

## E28. Shared service creates a claim, not a free transfer

**Kind.** Domain evidence, observed through a source artifact.

**Source.** ERPNext inter-company journal example retrieved 2026-08-16.

**Observed model.** One bank account paid. Each legal entity still needs balanced books and a due-from or due-to balance showing who owes whom.

**Decision state.** `supported`.

## E29. Tax treatment can differ on the two sides

**Kind.** Domain evidence, observed through a source artifact.

**Source.** ERPNext inter-company invoices page retrieved 2026-08-16.

**Observed model.** Tax treatment can differ between selling and buying entities. Do not assume source tax rows are correct for the target. Check templates, accounts, rates, addresses, and regional compliance.

**Cross-reference.** Issue 30 owns Brazilian fiscal documents. This block only records that two legal persons can tax the same economic movement differently.

**Decision state.** `supported`.

## E30. User permission is per company

**Kind.** Source-system artifact.

**Sources.** ERPNext company-setup troubleshooting. Odoo companies and multi-company pages. Moqui entity filters. All retrieved 2026-08-16.

**Observed model.** A company does not appear in an ERPNext transaction if the user lacks permission. Odoo grants access at parent, branch, or both. Moqui filters by organization membership.

**Interpretation.** Cross-company permission is a policy over principals and legal persons. It is not ownership.

**Decision state.** `supported` as a recurring source pattern.

## E31. Effective-dated party relationships exist in Moqui

**Kind.** Source-system artifact.

**Source.** Mantle Party page retrieved 2026-08-16.

**Observed model.** PartyRelationship carries fromDate, thruDate, roles, and status with audit log on status.

**Gap.** ERPNext Parent Company and Odoo parent or branch links were not documented as bitemporal on the pages fetched. Whether those trees are effective-dated stays `undetermined`.

**Decision state.** `supported` for Moqui. `undetermined` for ERPNext and Odoo valid time.

## E32. Investment entity exception

**Kind.** Domain evidence.

**Source.** IFRS 10 About page and PDF retrieved 2026-08-16.

**Observed model.** An investment entity measures particular subsidiaries at fair value through profit or loss instead of consolidating them.

**Falsifier pressure.** Control is necessary but not always sufficient for line-by-line consolidation.

**Decision state.** `supported` that the exception exists. `undetermined` for when OS must model it.
