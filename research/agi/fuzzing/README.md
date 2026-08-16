---
issue: 51
track: agi
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Semantic fuzzing of candidate ontologies

Query this directory for issue 51. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records a research attack method a synthesis agent can run. RFC-0001 is unread as an edit target. No OS schema is proposed. The DSL in [dsl.md](dsl.md) is a research scenario schema, not engine syntax.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

The method is the artifact. No fuzzer was implemented. No runtime was picked. See [candidate-laws.md](candidate-laws.md) L-FUZ-12.

## Question

How should a swarm attack ontology fragments with generated business scenarios, rather than only validating happy paths, so that a failure becomes a typed research question instead of a discarded test?

Issue 51 names the generation dimensions, the use of source systems as differential oracles that are not assumed correct, and four deliverables. Those deliverables are a scenario DSL or schema proposal, reusable generators, semantic coverage metrics, shrink of failing scenarios, and a process that turns failures into ontology research questions.

## What this folder claims

A later agent can generate scenarios across the named dimensions, score them against candidate laws and competency questions, shrink a failure through the same generator that produced it, and open a research card only after the contradiction is typed.

That claim is a `hypothesis`. First-party testing papers support the pieces. No first-party source validates the whole loop on enterprise ontologies. See [evidence.md](evidence.md) E1 through E16.

Source systems are useful oracles for disagreement. They are not the semantics. McKeeman's majority rule is a quality metric for compilers, not a law for inventory. See L-FUZ-02.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| [sources.md](sources.md) | reference | URLs and sibling notes read this session |
| [evidence.md](evidence.md) | reference | Labeled blocks E1 through E16 |
| [dimensions.md](dimensions.md) | reference | Generator recipes for the issue dimensions |
| [dsl.md](dsl.md) | reference | Research scenario schema. Not OS syntax |
| [candidate-laws.md](candidate-laws.md) | explanation | Smallest method claims and falsifiers |
| [scenarios.md](scenarios.md) | reference | Twenty-four attack cards |
| [open-questions.md](open-questions.md) | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/agi/induction/` on `cursor/issue-50-agi-cfd8`. Protocol, roles, contradiction types, promotion gate.
- `research/domain/o2c/` on `cursor/issue-16-domain-cfd8`. Partial ship, cancel after shipment, substitution.
- `research/domain/inventory/` on `cursor/issue-18-domain-cfd8`. Ownership versus custody, backdating, lots, duplicate movement.
- `research/domain/manufacturing/` on `cursor/issue-19-domain-cfd8`. Substitution, partial complete, specification revision.
- `scenarios/README.md` on `origin/main`. Seed cards S-001 through S-012.

Do not copy those folders. The attack cards cite them as already-mined targets.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `dimensions.md`.
5. **Convergence.** `candidate-laws.md` and `evidence.md`.
6. **Divergence.** `evidence.md` and `scenarios.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md`.
9. **Runtime pressure.** Each law card. Wave B runtime picks wait.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card and this folder. Default is `hypothesis`. Never `accepted`.

## How to read this

Start with [dsl.md](dsl.md) if you need the scenario shape. Use [dimensions.md](dimensions.md) to pick a generator. Use [scenarios.md](scenarios.md) to see which distinctions the generators must be able to break. Use [candidate-laws.md](candidate-laws.md) when a later issue asks what would change the method.

Induction on issue 50 writes laws. This folder attacks them. The adversary role in `research/agi/induction/roles.md` is the consumer of these generators. The two folders are not the same protocol.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. ERPNext and Odoo were read as documentation of behavior. ValueFlows, GS1 EPCIS, PROV-O, and the testing papers were read the same way.
