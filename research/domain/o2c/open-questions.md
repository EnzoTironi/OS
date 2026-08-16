# Open questions

**Kind.** unresolved uncertainty.  
**Decision.** `undetermined` unless a row says otherwise.  
**Rule.** This file does not write answers into `docs/open-questions.md`. Where that doc already asks the question, the row cites it and stays `undetermined`.

## Q-O2C-01. Is the accepted order an Agreement, or a bundle of Commitments with a document surface?

`docs/open-questions.md` Q13 asks which REA/VF concepts are universal and whether ERP documents are surfaces over those concepts.

**Pressure from this drop.** ERPNext Sales Order, Odoo confirmed `sale.order`, and Moqui Accepted order all look like Agreement surfaces. VF treats Agreement as reciprocal Commitments. Line-level leftover demand behaves like Commitments.

**What would decide.** A case where the header has legal identity (wet signature, contract number) that the lines do not, or the reverse.

**State.** `undetermined`

## Q-O2C-02. Must offer and agreement have different identities?

Sources split. ERPNext yes. Odoo and Moqui no. VF usually yes (Intent then Commitment).

**What would decide.** Legal or fiscal rules that require a new instrument number at accept, found in a standard not fetched this session.

**State.** `undetermined`

## Q-O2C-03. When is a Claim implied, and when must it be instantiated?

VF says a Claim is often implied by an Event plus Agreement. ERPs instantiate invoices for tax, numbering, and aging.

**Related.** `docs/open-questions.md` Q13 (accounting recognition versus economic events). Not answered here.

**State.** `undetermined`

## Q-O2C-04. Is credit limit a Constraint, a Policy, or a relator on a billing relationship?

Opened in ERPNext and Moqui BillingAccount. Not opened in Odoo or VF. Looks like policy over a query of exposure. Could also be an attribute of a commercial relationship (issue 14).

**State.** `undetermined`

## Q-O2C-05. How should requested versus feasible dates be enforced?

L-003 says both facts exist. No fetched page hard-blocks accept when ATP fails. Refuse, promise with risk, or split the line are all live options.

**Related.** `docs/open-questions.md` Q3 (sources disagree) and Q4 (what is an Action). Not answered here.

**State.** `undetermined`

## Q-O2C-06. Is reservation a Relator?

`docs/open-questions.md` Q12 lists Reservation as a relationship-entity candidate. This drop supports lifecycle and purpose. It does not prove a native Relator primitive. ERPNext used a document. Odoo used a field. Moqui used AssetReservation.

**State.** `undetermined`

## Q-O2C-07. What is the cancel semantic after irreversible effects?

`docs/open-questions.md` Q5 (unknown external outcomes) and `scenarios/README.md` S-010. This drop supports compensating Events and refuses delete. It does not choose among reverse-ledger-row, return-document, or draft-reset encodings.

**State.** `undetermined`

## Q-O2C-08. May a posted fiscal claim return to draft?

Odoo often yes. ERPNext no. VF no. Accounting issue 21 and kill-tests should own this. O2C only records the split.

**State.** `undetermined` for OS. `supported` that the products disagree

## Q-O2C-09. Substitution and serial identity on return

Thin first-party evidence this session. Issue 32 has tests. Product identity is issue 15.

**State.** `undetermined`

## Q-O2C-10. Multi-entity and intercompany O2C

ERPNext mentions inter-company order reference. Moqui posts an invoice for both internal orgs when both have accounting settings. Not mined. Issue 29 owns multi-entity.

**State.** `undetermined`

## Q-O2C-11. Standards cells

GS1 EPCIS, UN/CEFACT order/despatch/invoice, and ISO 9735 were not fetched. Matrix standard column stays empty on purpose.

**State.** `undetermined`

## Q-O2C-12. Wave B runtime

Storage, workflow engines, and payment-gateway idempotency wait for more Wave A pressure. Timeout-after-capture is real (Moqui auth/capture, `docs/open-questions.md` Q5) and is not a toolchain choice.

**State.** `undetermined`. No runtime recommendation.

## What this drop will not pretend to know

- The smallest semantic core in `docs/open-questions.md` Q2.
- Whether Fact is fundamental (Q6).
- Whether bitemporality is required on every O2C date (Q7). Promise date versus knowledge of the promise was not opened in source tests this session.
- A target schema for Order, Line, or Invoice.
