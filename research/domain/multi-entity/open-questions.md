---
issue: 31
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Unresolved uncertainty only. No invented answers. A later synthesis agent should cite a research artifact or leave the question `undetermined`. These lines do not edit `docs/open-questions.md`.

## Q1. Is a company record the same identity as a legal person?

**Kind.** Open question.

ERPNext Company, Odoo `res.company`, and Moqui Internal Organization all collapse legal person and operating record. FIBO LegalEntity is a LegalPerson under a jurisdiction. GLEIF LEI identifies a legal entity without being an ERP company.

**Decision state.** `undetermined`. Standing order 18. Issue 14 owns LegalPerson identity.

**What would settle it.** Independent first-party sources that agree a company record can exist without legal personality, or that every posting company is exactly one LegalPerson.

## Q2. Is a book the same identity as an entity?

**Kind.** Open question.

ERPNext Finance Book is a reporting basis on one Company. Odoo multi-ledgers filter journals. IAS 27 separate statements are additional reports of a person. None of the fetched pages says a book is a legal person.

**Decision state.** `undetermined`. Issue 21 owns books and currency.

**What would settle it.** A statutory regime that requires a book to have its own legal identity, or a proof that all group measurement differences can live as functions over one person.

## Q3. How should OS represent IFRS 10 control?

**Kind.** Open question.

ERPs store parent links. IFRS 10 stores a three-element test that can diverge from share count. GLEIF stores accounting consolidating parent, which is closer to consolidation scope than to the full test.

**Decision state.** `undetermined`.

**What would settle it.** A Wave A or Wave C note that compares enough real control judgements, including de facto control and agents, without designing a schema here.

## Q4. Does ERPNext eliminate intragroup balances in its consolidated report?

**Kind.** Open question.

The dedicated doc page returned 404. Accounting-reports only names the report. Inter-company invoice docs say consolidation and elimination are separate activities.

**Decision state.** `undetermined`.

**What would settle it.** A later fetch of the report doc or a corpus note from issue 32 that traces the report without copying code.

## Q5. Can one stock event serve two legal persons?

**Kind.** Open question.

ERPNext collaborators say no. Odoo 19 offers Synchronize Stock Moves. Issue 18 owns location ownership.

**Decision state.** `undetermined`.

**What would settle it.** A first-party trace of Odoo stock sync that shows or refutes independent tax, valuation, and cancellation. Do not invent the design here.

## Q6. What transfer-pricing methods must the ontology name?

**Kind.** Open question.

Intercompany invoices have rates. IFRS 10 eliminates unrealized profit. Official OECD Transfer Pricing Guidelines were not fetched.

**Decision state.** `undetermined`.

**What would settle it.** A first-party OECD or Brazilian RFB fetch. Until then L10 only claims that a price exists as a term.

## Q7. When is a CNPJ a legal person, and when is it an establishment?

**Kind.** Open question.

Issue 30 owns Brazilian fiscal identity. This folder must not answer it. ME-026 records the fork.

**Decision state.** `undetermined`. Cite issue 30.

## Q8. Are ERPNext and Odoo parent trees effective-dated?

**Kind.** Open question.

Moqui PartyRelationship is dated. IFRS 10 and GLEIF are dated. ERPNext and Odoo pages fetched this session describe current parent or branch fields.

**Decision state.** `undetermined`.

**What would settle it.** Corpus issues 32 and 33, or a later first-party page that states valid-time behavior.

## Q9. How should joint arrangements be typed?

**Kind.** Open question.

IFRS 10 names collective control and points at IFRS 11. IAS 28 names joint ventures. IFRS 11 full text was not fetched.

**Decision state.** `undetermined`.

## Q10. How should unlike fiscal periods be combined?

**Kind.** Open question.

ME-031. The fetched IFRS 10 About page and PDF do not, in the passages read, settle the maximum reporting-date gap.

**Decision state.** `undetermined`.

## Q11. Does docs/open-questions.md §12 need a Relator for ownership?

**Kind.** Open question.

RFC-0001 already states the threshold for relationship-entities. This folder does not answer §12. L2 and L8 only claim that control and parentage have identity, terms, and validity.

**Decision state.** `undetermined`. Do not edit RFC-0001.

## Q12. Is a non-posting group node a domain thing?

**Kind.** Open question.

ERPNext Is Group parents do not post. IFRS parents often transact. E27 rejects "parents never transact" as a domain law. Whether OS needs a pure grouping node at all stays open.

**Decision state.** `undetermined`.
