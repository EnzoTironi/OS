---
issue: 50
track: agi
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Ontology induction protocol

Query this directory for issue 50. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records a research protocol a synthesis agent can run. RFC-0001 is untouched. No target schema is proposed.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

The protocol is the artifact. The current swarm is not the finished protocol. See [candidate-laws.md](candidate-laws.md) L-IND-09.

## Question

How can a research pipeline infer candidate domain semantics from heterogeneous evidence, rather than summarize sources, and how do you test that the pipeline is doing that job?

Issue 50 names the inputs, the seven research roles, the required output split, and three benchmark concepts. The open method questions are iterative self-correction, multi-agent debate, evidence retrieval, contradiction detection, and human review.

## What this folder claims

A later agent can treat source tables, DocTypes, and class names as observations. It can propose a smallest domain law only after at least two independent families agree, an adversary has tried to break the law, and a licensing reviewer has blocked implementation reuse.

That claim is a `hypothesis`. First-party ontology-learning papers treat automation as support for an ontology engineer, not as a replacement. Intrinsic LLM self-correction without external feedback can make reasoning worse. Debate can converge on a wrong shared answer. See [evidence.md](evidence.md) E6, E7, E8.

Whether induction can replace a human ontologist stays `undetermined`. Independent first-party sources do not agree that it can.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| [sources.md](sources.md) | reference | URLs and sibling notes read this session |
| [evidence.md](evidence.md) | reference | Labeled blocks E1 through E16 |
| [protocol.md](protocol.md) | how-to | Reproducible induction loop |
| [roles.md](roles.md) | reference | The seven required roles and their products |
| [benchmark.md](benchmark.md) | reference | Thin run on reservation, Work Order versus execution, and supplier or customer roles |
| [candidate-laws.md](candidate-laws.md) | explanation | Smallest protocol claims and falsifiers |
| [open-questions.md](open-questions.md) | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/party/` on `cursor/issue-14-domain-cfd8`
- `research/domain/inventory/` on `cursor/issue-18-domain-cfd8`
- `research/domain/manufacturing/` on `cursor/issue-19-domain-cfd8`
- `research/identity-kinds-roles/` on `cursor/issue-3-foundation-cfd8`
- `research/erpnext/`, `research/odoo/`, `research/moqui/` on corpus branches 32 through 34
- `research/ontouml-ufo/`, `research/valueflows-rea/` on `cursor/issue-37-corpus-cfd8`

Do not copy those folders. The benchmark cites them as already-mined evidence.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `benchmark.md`.
5. **Convergence.** `benchmark.md` and `candidate-laws.md`.
6. **Divergence.** `benchmark.md` and `evidence.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `candidate-laws.md` and `evidence.md`.
9. **Runtime pressure.** Each law card. Wave B runtime picks wait.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card and this folder. Default is `hypothesis`. Never `accepted`.

## How to read this

Start with [protocol.md](protocol.md) if you need to run the loop. Use [roles.md](roles.md) to assign work. Use [benchmark.md](benchmark.md) to see whether the loop separates source artifact from domain law on the three named concepts. Use [candidate-laws.md](candidate-laws.md) when a later issue asks what would change the protocol.

Real-company spreadsheets, APIs, documents, and messages are an input class in the issue. No such corpus is in this repository. That class is `undetermined`. Issue 77 remains blocked-needs-data.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. ERPNext and Odoo were read as documentation of behavior. ValueFlows, UFO, ISA-95 job-control text, and Palantir public docs were read the same way.
