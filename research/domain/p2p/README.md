---
issue: 17
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Procure-to-pay

Query this directory for issue 17. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

What procure-to-pay distinctions survive when ERPNext buying documents, Odoo purchase records, Moqui Order plus Shipment plus Invoice, REA and ValueFlows flows, and procurement standards are treated as observations rather than tables to copy?

The issue asks for demand, requisition, RFQ, supplier offer, supplier selection, purchase order versus agreement, partial receipt, ownership transfer versus physical receipt, inspection and quarantine, invoice matching, payable claim, landed cost, returns, substitutions, prepayment, and supplier performance.

Adversarial cases named in the issue are partial invoice before full receipt, over-receipt, rejected material, supplier substitution, late price change, duplicated supplier invoice, and order cancelled after dispatch.

## Overview

Independent sources split **need**, **offer**, **commitment**, **physical receipt**, **rights or risk transfer**, **inspection state**, **payable claim**, **valuation adjustment**, and **settlement**. They do not treat those as one mutable purchase record.

ERPNext names seven buying stages and still lets organizations skip RFQ or skip receipt. Odoo stores RFQ and purchase order on one record and still splits receipt, bill, and payment. Moqui uses one OrderHeader for purchase and sales, then generates a payable from received quantity. ValueFlows never lets an Economic Event stand for a future promise. Incoterms 2020 move risk, not title. GS1 EPCIS names owning party and possessing party as different source types.

That is the useful pressure on RFC-0001 Action versus Event, and on open question 13. It is not a schema to copy.

## Key concepts

**Demand.** A need for a specification, with a reason and a required-by time. Not yet a commercial promise. ERPNext Material Request. ValueFlows Intent with a receiver and no provider.

**Requisition.** An authorized internal request that buying may act on. Often the same record as demand. Not mandatory in ERPNext. Distinct from a supplier-facing RFQ.

**RFQ.** A published request for offers, often to many suppliers. UBL `RequestForQuotation`. ERPNext Request for Quotation. Odoo RFQ is also the draft of the later order.

**Supplier offer.** A priced proposal from one supplier for a period. ValueFlows Intent with a provider. ERPNext Supplier Quotation. UBL `Quotation`.

**Selection.** A decision that one offer, or one supplier under an agreement, will found a commitment. The decision is not the commitment.

**Agreement.** Standing commercial terms and a quantity or price envelope over a validity interval. ERPNext and Odoo Blanket Order. ValueFlows Agreement. Does not receive, bill, or pay by itself.

**Commitment.** A bilateral promise to transfer a specified quantity under stated terms. ERPNext Purchase Order. Odoo confirmed purchase order. ValueFlows Commitment. UBL `Order` plus `OrderResponse`.

**Physical receipt.** Observed arrival of quantity into custody. ERPNext Purchase Receipt accepted and rejected quantities. Moqui AssetReceipt. Odoo stock picking. GS1 receiving event with possessing party.

**Rights or risk transfer.** Change of ownership, stewardship, or risk of loss. Need not coincide with warehouse arrival. ValueFlows transfer of rights versus transfer of custody. Incoterms delivery as risk, not title. GS1 `owning_party`.

**Inspection or quarantine.** A quality state that can block use or billing even after physical arrival. ERPNext Quality Inspection can block receipt submit. Odoo Input then Quality Control then Stock.

**Payable claim.** The receiver-initiated assertion of amount due. ValueFlows Claim. ERPNext Purchase Invoice. Odoo vendor bill. Moqui incoming Invoice. UBL `Invoice`.

**Matching.** Comparison of commitment, receipt, and claim quantities and prices. Odoo three-way matching with Should Be Paid. ERPNext billed percentage on order and receipt. Moqui clerk review of generated invoice against supplier paper.

**Landed cost.** Later charges that change inventory valuation without rewriting the original receipt event. ERPNext Landed Cost Voucher.

**Settlement.** Money movement that reduces a claim or sits as an unallocated advance. ERPNext Payment Entry. Distinct from the claim.

## How it works

A later synthesis agent should read the flow as stages, not as one document lifecycle.

1. Someone records a need. That need can come from a person, a reorder rule, a production plan, or a sales order.
2. Buying may publish an RFQ and collect offers. Selection produces a commitment, or it releases quantity from an existing agreement.
3. The supplier ships. Carrier handover, dock receipt, inspection, put-away, and title or risk transfer can happen at different times and places.
4. A claim appears when the supplier bills, when the receiver self-bills from received quantity, or both. Matching decides whether the claim is payable.
5. Later freight, duty, or insurance can change valuation after the goods are already in stock.
6. Payment can precede the claim as a prepayment, or follow it as settlement. Returns and debit notes compensate earlier events. They do not delete them.

Happy-path document chains in ERPs collapse several of those stages. The adversarial cases in `scenarios.md` force the stages back apart.

## Where things live

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and sibling notes fetched or read this session |
| `evidence.md` | reference | Labeled blocks E1 through E32 |
| `matrix.md` | reference | Convergence, divergence, and source artifacts |
| `lifecycle.md` | explanation | Semantic stages, candidate Actions, Events, and Invariants |
| `scenarios.md` | explanation | Twenty-four falsifying scenario cards |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/party/` on `cursor/issue-14-domain-cfd8`. Supplier is a role, not a Kind.
- `research/domain/product/` on `cursor/issue-15-domain-cfd8`. Specification versus instance, lot, and serial.
- `research/erpnext/` on `cursor/issue-32-corpus-cfd8`. Atlas A-BUY.
- `research/odoo/` on `cursor/issue-33-corpus-cfd8`. Atlas purchase and `account.move`.
- `research/moqui/` on `cursor/issue-34-corpus-cfd8`. Order, Shipment, Invoice, AssetReceipt.
- `research/valueflows-rea/issue-0037-economic-cycle.md` on `cursor/issue-37-corpus-cfd8`.
- `research/standards/` on `cursor/issue-38-corpus-cfd8`.
- `scenarios/README.md` on `origin/main`. S-003 stale purchase approval. S-005 supplier is also customer. S-010 cancel after irreversible consequences.

Issue 16 order-to-cash had no research branch at fetch time. Cross-link that folder when it exists.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md`.
9. **Runtime pressure.** `candidate-laws.md` and `lifecycle.md`.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each law and this folder. Default is `hypothesis`. Never `accepted`.

## How to read this

Start with `lifecycle.md` for the stage cut. Use `matrix.md` when a later issue asks what source X did with Purchase Order. Use `candidate-laws.md` and `scenarios.md` when a later issue asks what would change the answer.

Do not treat ERPNext Purchase Order, Odoo `purchase.order`, or Moqui `OrderHeader` as OS vocabulary. They are observations about other systems.

## Gotchas

Odoo RFQ and purchase order are one record. That is a source artifact. The docs still distinguish send, confirm, receive, and bill.

ERPNext can invoice from the order before receipt, or skip receipt entirely. That is a policy choice, not proof that claim and receipt are the same fact.

Moqui generates a payable from delivered quantity, then asks a clerk to reconcile the supplier's bill. Generated claim and supplier claim can disagree.

Incoterms "delivery" is risk transfer. Warehouse receipt is custody. Title is a third fact that the sales contract must state.

Landed cost arrives late and rewrites valuation projections. It does not rewrite the original receipt as if the freight had always been known.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and ERPNext were read as documentation of behavior. Moqui docs were read the same way. ValueFlows, UBL, GS1, UN/CEFACT, and ICC pages were read for published definitions only.

## Decision state

Folder default is `hypothesis`.

`supported` for the split of need, offer, commitment, physical receipt, claim, and settlement. `supported` for ownership or risk versus custody. `hypothesis` for whether Agreement and Commitment are two types or one type with different completeness. `undetermined` for supplier performance as a first-class economic object. `rejected` for treating any source document name as an OS primitive.
