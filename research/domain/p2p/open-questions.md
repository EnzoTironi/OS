---
issue: 17
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this pass. Nothing here is written into `docs/open-questions.md`. If a later agent answers one of these, cite a research artifact.

## Q1. One identity or two for request and commitment?

Odoo and Moqui store RFQ or quote and the later order on one record with phases. ERPNext and UBL use different documents. L2 is `supported` for the semantic split and `undetermined` for identity.

**What would decide it.** A legal or audit requirement that the request remain addressable after the commitment exists, or a counterexample where phase-on-one-record loses an unselected offer.

## Q2. Who authors the authoritative payable?

Moqui generates a claim from receipt and edits it to match the supplier bill. ERPNext and Odoo usually treat the supplier bill as the payable and use receipt for stock and clearing. UBL has both Invoice and SelfBilledInvoice.

**What would decide it.** A jurisdiction that forbids self-billing, or a control standard that forbids editing a generated payable.

**Related.** `docs/open-questions.md` question 3, what truth means when sources disagree. That question stays `undetermined` here.

## Q3. What is the surplus law?

Moqui adjusts the PO on over-receipt. ValueFlows can record an event with no commitment. ERPNext Close is documented for short-close, not surplus.

**What would decide it.** Receiving practice in regulated industries, and whether title to unordered goods passes by keeping them.

## Q4. Must every fact carry valid time and knowledge time?

Landed cost and backdated receipts pressure bitemporality. `docs/open-questions.md` question 7 stays `undetermined`. This folder only shows that P2P produces cases where the two times differ. P2P-15, E10.

## Q5. Is supplier performance a projection or an object?

ERPNext scorecards were named in the sibling atlas and not fetched as a first-party page this session. P2P-24.

**Decision state.** `undetermined`.

## Q6. How should dropship and subcontract raw-material supply sit in P2P?

ERPNext Purchase Order can carry a customer for drop-ship. Odoo RFQ has a Dropship deliver-to. ERPNext subcontracting consumes raw materials from a supplier warehouse on receipt. Those flows couple P2P to inventory, sales, and manufacturing. They were not mined in full.

**Decision state.** `undetermined`. Hand to issues 16, 18, and 20 when those folders exist.

## Q7. Are payment terms on the party, the agreement, or the commitment?

ERPNext Payment Terms sit on the Purchase Order. Blanket Order has item terms. Party issue 14 asks where commercial conditions live. Not settled here.

## Q8. Does matching belong in the ontology or in policy?

L8 is `hypothesis`. Three-way match could be a Constraint over three projections, a Policy on RecordPayment, or a named Action. This pass did not earn a primitive.

## Q9. What is the smallest set of P2P actions?

`lifecycle.md` lists many Action labels so scenarios can name them. Several may compose. Constitution section 1 still applies. No primitive by aesthetics.

## Q10. Open questions in `docs/open-questions.md` that this folder must not answer

Question 13 asks which REA and ValueFlows concepts are universal, and whether ERP documents are surfaces or independent legal identities. This folder cites L2, L3, L7 and leaves the RFC-level question `undetermined`.

Question 5, Action versus Event versus Effect, is pressured by dispatch timeout and bank-payment unknown outcomes. Not answered.

Question 12, relationship-entities, is pressured by supply agreements. Cross-link party L4. Not answered here.

Do not copy any answer above into `docs/open-questions.md`.

## Follow-ups that stay in scope for later P2P work

- Fetch Odoo landed cost and purchase return pages.
- Fetch ERPNext buying settings, supplier scorecard, and subcontracting receipt pages.
- Read Mantle USL P2P test behavior without pasting code.
- Cross-read issue 16 order-to-cash when that folder exists, especially invoice, claim, and payment.
- Cross-read issue 18 inventory for GRNI, consignment, and quarantine locations.
- Cross-read issue 38 standards notes for a deeper Buy-Ship-Pay and EPCIS pass.

## Decision state

This file is `undetermined` by construction. Laws with a decision live in `candidate-laws.md`.
