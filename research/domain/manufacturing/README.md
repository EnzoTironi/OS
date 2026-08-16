---
issue: 19
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Manufacturing semantics

Query this directory for issue 19. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md` question 14. It records evidence a synthesis agent can cite. RFC-0001 is untouched. No target schema is proposed.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

Which manufacturing distinctions survive when ERPNext Work Order and Job Card, Odoo Manufacturing Order and Work Order, Moqui production run and `ProductAssoc`, ValueFlows Recipe and Process, GS1 EPCIS `TransformationEvent`, and ISA-95 schedule versus performance are treated as observations rather than tables to copy?

The issue asks for product and resource specification; BOM and recipe or process specification; revision and effectivity; routing; operation definition versus actual execution; work center, resource, and capability; production intent, plan, order, and authorization; material reservation, issue, and consumption; WIP; outputs, by-products, and co-products; scrap and rework; subcontracting; capacity; genealogy and traceability.

## Canonical concept map

This is a domain cut, not a schema.

```text
Knowledge / specification
  Resource specification  (what kind of thing)
  Material specification  (BOM, recipe inputs, exploded tree)
  Process specification   (routing, recipe processes, process segments)
  Operation definition    (named step, default capability)
  Capability / work center / equipment class
  Effectivity interval on a specification revision

Intent / plan / authorization
  Independent demand      (sales, stock replenish, material request)
  Production plan         (scaled recipe, MPS, production schedule)
  Production authorization (order released to the floor)
  Reservation / allocation of material and capacity
  Dispatch of an operation to a capable resource

Observation / execution
  Process instance / job
  Material issue or transfer into the process
  Consumption, use, cite, work
  WIP as in-process resource plus location plus stage
  Output produce, by-product, co-product
  Scrap, process loss, pending remainder
  Rework as accept and modify, or as a new process
  Subcontract as production by another agent
  Transformation contribution (any input may have entered any output)
  Correction of a prior observation
```

The same real process can carry planned flows and observed flows. ValueFlows says this explicitly. ERPNext and Odoo split the layers into different documents. ISA-95 splits them into schedule versus performance. EPCIS records only the observation.

## Plan versus execution

| Layer | What it answers | Not the same as |
| --- | --- | --- |
| Specification | How this kind of thing is made, while the revision is in effect | An order, a job, a stock move |
| Plan | What we intend to make, with scaled quantities and times | What happened |
| Authorization | What the floor is allowed to start | Completion, consumption, or quality release |
| Execution | What a workstation actually did | The BOM line that predicted it |
| Observation | What a capturing party asserts occurred | The action that tried to make it so |

ERPNext uses "Work Order" for authorization. Odoo uses "Work Order" for one operation's execution. Same words. Different layers. See [lifecycle.md](lifecycle.md).

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E1 through E36 |
| `matrix.md` | reference | Convergence, divergence, source-artifact mapping |
| `lifecycle.md` | explanation | Plan versus execution and phase cuts |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `scenarios.md` | reference | Thirty-six falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/product/` on `cursor/issue-15-domain-cfd8`. Issue 15 owns specification versus instance, lot, and serial.
- `research/standards/` on `cursor/issue-38-corpus-cfd8`. Issue 38 owns EPCIS event types and ISA-95 interchange objects.
- `research/valueflows-rea/` on `cursor/issue-37-corpus-cfd8` if present. Issue 37 owns REA and ValueFlows vocabulary.
- `research/erpnext/`, `research/odoo/`, `research/moqui/` on corpus branches 32 through 34 if present.

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

Start with the concept map above and [lifecycle.md](lifecycle.md). Use [matrix.md](matrix.md) when a later issue asks what source X did with Work Order. Use [candidate-laws.md](candidate-laws.md) and [scenarios.md](scenarios.md) when a later issue asks what would change the answer.

Do not treat ERPNext Work Order, Odoo Manufacturing Order, or Moqui `WepProductionRun` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and ERPNext were read as documentation of behavior. Moqui entity names and maintainer comments were read the same way. GS1 EPCIS 2.0 was read from the published standard. ISA-95 Part 1 object attributes stay behind a paywall. Those cells are `undetermined` unless a public page stated them.
