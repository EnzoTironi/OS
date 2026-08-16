---
issue: 58
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

These stay unresolved. None of them is answered by repetition. None of them edits `docs/open-questions.md`.

## OQ-K-01. Is optimization a Function variant?

**State.** `undetermined`  
**Points at.** `docs/open-questions.md` item 9.

This folder supports a class split between deterministic arithmetic and search. It does not choose the metamodel word. Palantir allows several compute engines under one action. That is product evidence, not a primitive decision.

## OQ-K-02. Must OS ship a specialized ledger store?

**State.** `undetermined`  
**Why.** TigerBeetle shows the physical case. ERPNext shows an application-level immutable ledger. Wave B owns the store. L-K-03 and L-K-04 are the semantic pressure.

## OQ-K-03. How is a government validator represented?

**State.** `undetermined`  
**Why.** Sibling fiscal OQ-004 already asks whether a filing is a projection or a ledger. PVA and eSocial receipts are external Effects. The internal record shape is not chosen here.

## OQ-K-04. One type or two for commercial invoice and fiscal document?

**State.** `undetermined`  
**Points at.** Sibling fiscal OQ-001.

The legal distinction is supported. The OS type cut is not. A FiscalKernel would fake an answer.

## OQ-K-05. When does stock couple to the GL?

**State.** `undetermined`  
**Points at.** Sibling accounting L11.

Perpetual, periodic, and invoice-timed coupling all exist. The coupling Action is named when it exists. The default is not chosen.

## OQ-K-06. Integer minor units or decimal?

**State.** `undetermined` as encoding  
**Points at.** Issue 62.

Binary float is rejected. TigerBeetle's uint128 versus decimal is a physical encoding fork.

## OQ-K-07. Can a dated Function library replace commercial tax engines?

**State.** `undetermined`  
**Why.** A-FOR-05 is only a hypothesis. No US engine and no full Brazilian determination corpus were executed in this pass.

## OQ-K-08. Does Bind replace Constraint for posting?

**State.** `undetermined`  
**Points at.** Issue 56 L-P-05 and L-P-06.

This folder can live with Constraint or Bind. It cannot live with an AccountingKernel sort.

## What would reopen R-K-01

Independent first-party evidence that a required invariant cannot be stated in the ontology and can only be executed as sealed engine meaning, in two domains. S-K-12 is the card.

Until then, do not edit RFC-0001.
