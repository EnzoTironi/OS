---
issue: 21
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Canonical accounting fragment and lifecycle

Concepts, not a schema. Names below are research labels. They are not OS types.

## Canonical fragment

A later synthesis agent can start from this cut. Every line is a hypothesis unless marked otherwise.

```text
BooksEntity
    the legal person whose financial statements these are

Account
    a named economic nature
    root: Asset | Liability | Equity | Income | Expense
    role: group | leaf
    only a leaf may receive a posting

Chart
    the tree of Accounts used by one BooksEntity
    definition of an Account may be shared
    membership in a BooksEntity is a separate fact

Journal
    an intended balanced set of lines
    may be a manual adjustment
    may be generated from an operational document
    identity of Journal versus identity of the operational Event stays undetermined

JournalLine
    one side of the Journal
    Account, signed amount or debit-xor-credit, currency
    optional party, operational reference, and dimensions

Dimension
    a management segment
    not an Account
    may be mandatory on income and expense
    may be absent on older posted rows

Posting  (Action)
    attempt to make the Journal affect the books
    fails if unbalanced, if the period is locked, if a leaf is missing,
    or if a required dimension is missing

LedgerEntry  (occurrence)
    the posted effect of a successful Posting
    keeps the original rows after later reversal
    is not deleted by ordinary users

Period
    a fiscal interval owned by a BooksEntity
    open | closed-for-ordinary-posting | locked
    those states are not one boolean
    how they are encoded stays undetermined

CloseTransfer  (Action)
    move remaining Income and Expense to Equity
    does not by itself lock the Period

LockPeriod  (Action)
    stop ordinary Posting into the Period
    may still allow typed close adjustments or a privileged force

Reverse  (Action)
    create compensating LedgerEntries
    may share the original Journal identity or create a new Journal
    that fork is a source artifact

RecognitionSchedule
    timing of income or expense that is not the billing date
    and not the cash date

CurrencyTriple
    transaction currency
    account currency
    functional or company currency
    plus an exchange rate at a named date

StockCoupling
    a stock movement may or may not emit LedgerEntries
    depending on perpetual-on-movement, perpetual-at-invoice, or periodic-at-close
    the trigger stays undetermined
```

**Kind.** Candidate law, as a fragment. **Decision state.** `hypothesis`.

## Lifecycle

```text
compose draft Journal
        |
        |  no LedgerEntry
        v
Posting Action
        |
        +-- refused: unbalanced, locked period, missing leaf, missing dimension
        |
        +-- unknown or unposted: mapping missing, error journal  (Moqui)
        |
        +-- succeeded: LedgerEntries exist
                |
                +-- allocate cash to claims          (not a new Journal kind)
                +-- recognize deferred amounts       (later Journals or entries)
                +-- revalue open foreign balances    (unrealized)
                +-- close transfer to equity
                +-- lock the Period
                |
                +-- Reverse or Cancel Action
                        compensating LedgerEntries
                        original rows remain
```

Draft work is an Action in progress. It is not an Event. Constitution rule 8 still holds. A timeout while posting to an external fiscal service would leave `unknown`. That case was not evidenced in the three ERPs this session and stays `undetermined`.

## Action versus Event

| Step | Candidate form | Why |
| --- | --- | --- |
| Save draft | Action, no Event | E-001, E-014, E-020 |
| Post or submit | Action | May fail. Does not prove the intended reports are signed off |
| Ledger row created | Event or Fact | The books changed |
| Payment allocation | Action on a claim | E-012, E-023. Identity owned by issues 16 and 17 |
| Recognize deferred income | Action producing Events | E-010, E-031 |
| Revalue FX | Action producing Events | E-008, E-017 |
| Close transfer | Action producing Events | E-005, E-015, E-022 |
| Lock period | Action, policy effect | May produce no LedgerEntry |
| Reverse | Action producing Events | E-002, E-019, E-024 |
| IAS 8 restatement | Reporting Action | May require rewriting comparatives, not only a current reverse. E-029 |

**Journal-versus-event identity.** `undetermined`. Odoo treats the invoice as the move. ERPNext treats the invoice as a source document that emits GL Entries. Moqui treats `AcctgTrans` as a generated or manual transaction pointing at the invoice or payment. Independent sources do not agree on one identity.

**Period-close encoding.** `undetermined`. The three products implement close as some mix of P&L transfer, lock date, typed exceptions, and report reset. They agree the jobs are different. They do not agree on one record shape.

## Hard invariants

These are the smallest must-hold statements. Full law cards live in `candidate-laws.md`.

1. A successful Posting has debit total equal to credit total in the functional currency.
2. A group Account never receives a LedgerEntry.
3. A draft Journal is invisible to financial statements.
4. A later correction leaves the original LedgerEntries explainable.
5. A Dimension does not change Account identity.
6. Functional amount and foreign amount are both retained when they differ.
7. Recognition, billing, and cash may be three dates.

## What this fragment refuses

- A float or binary approximation as the money type. Already rejected elsewhere. See L16.
- A target database schema.
- A one-to-one map from Journal Entry, `account.move`, or `AcctgTrans` into OS.
- An answer to whether Event is a primitive. That is RFC-0001 work. This folder does not edit the RFC.
- Payment, receivable, and payable identity. Those stay on issues 16 and 17.
- Stock quantity and lot identity. Those stay on issue 18.

## Runtime consequence

If the fragment survives, a runtime must be able to refuse an unbalanced Posting, refuse a posting to a group Account, retain compensating history, answer both "what was posted that day" and "when did we record it", and keep stock valuation triggers explicit rather than hidden in a module named inventory. No engine, store, or language is selected here.
