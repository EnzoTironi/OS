---
issue: 58
track: kill
decision_state: mixed
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Specialized kernels kill test

Query this directory for issue 58. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

Does deterministic business logic in accounting, inventory, MRP, payroll, tax, or fiscal documents require a specialized kernel after all?

The thesis and RFC-0001 currently say no. H2 put Accounting, Inventory, Manufacturing, and Fiscal kernels under the ontology. That was weakened because a kernel below the ontology is a second business model. Issue 58 attacks the weakening.

The issue asks for cases where a specialized execution engine may be necessary, a test of generic Functions, Constraints, and Actions, a split between semantic specialization and physical specialization, the strongest case for kernels, the strongest case against them, and a boundary if a physical engine is useful without becoming a second semantic authority.

## Verdict

**Folder decision state.** A specialized *semantic* kernel as a second business authority is `rejected` on present evidence. A specialized *physical* evaluator that compiles or executes ontology-defined Functions and Constraints is `supported` as useful in several domains. Whether OS must ship those evaluators as first-class engine modules is `undetermined` and belongs to Wave B.

The thesis sentence that deterministic logic can live inside the same executable ontology survives this pass. The hidden extra claim that one naive interpreter will post ledgers, explode BOMs, sign NF-e, and solve finite schedules at production quality does not survive. That second claim was never a law. It was an implementation hope.

I would not put `AccountingKernel` back into the primitive list. I would also not tell a later runtime agent that generic eval is enough for FIFO repost, high-volume posting, APS search, or a Receita validator. Those are evaluators. They are not a second ontology.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs, versions, and sibling `git show` locators |
| `evidence.md` | reference | Labeled evidence blocks E-001 through E-022 |
| `matrix.md` | reference | Convergence, divergence, and source-artifact mapping |
| `attacks.md` | explanation | Strongest case for kernels, strongest case against |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `boundary.md` | explanation | Proposed physical-versus-semantic cut |
| `scenarios.md` | reference | Falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

Cited via `git show` on the named branch. This folder does not copy those trees.

- Inventory, `origin/cursor/issue-18-domain-cfd8` at `de2bbe3ff71dcabb9ead699854a1b934496affbc`, `research/domain/inventory/`
- Manufacturing, `origin/cursor/issue-19-domain-cfd8` at `2de0548d5e971bb03283891358cc57283904122b`, `research/domain/manufacturing/`
- Accounting, `origin/cursor/issue-21-domain-cfd8` at `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc`, `research/domain/accounting/`
- Finance, `origin/cursor/issue-22-domain-cfd8` at `014868c4c202f12574d620e88d8d7bcc3e19de72`, `research/domain/finance/`
- Planning, `origin/cursor/issue-24-domain-cfd8` at `ca7ce566e48fdcac16516cdf6241c93a58094ecf`, `research/domain/planning/`
- Fiscal, `origin/cursor/issue-30-domain-cfd8` at `f29429685adc04f4e8b3787618ad2edce77f549b`, `research/domain/fiscal/`
- Unified ontology kill, `origin/cursor/issue-55-kill-cfd8` at `5f4233579cf3057783775126afa64c39ed631353`, `research/kill/unified-ontology/`
- Primitives kill, `origin/cursor/issue-56-kill-cfd8` at `b44575d3d212c67258bee6ed0013e8409c530a5e`, `research/kill/primitives/`
- Values, `origin/cursor/issue-62-foundation-cfd8` at `7457c00312a5686092d8c202b26c6bc92a9f7911`, `research/foundation/values/`

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md` and `attacks.md`.
9. **Runtime pressure.** Each law and `boundary.md`. No runtime product pick.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Default `hypothesis`. Never `accepted`.

## How to read this

Start with the verdict and `boundary.md`. Use `attacks.md` when a later issue asks whether H2 should return. Use `candidate-laws.md` when a later issue asks what would change the answer. Use `matrix.md` when a later issue asks what IAS 2, TigerBeetle, Palantir, ValueFlows, ERPNext, Odoo, APS, PAF-ECF, SPED, or eSocial actually said.

Do not treat TigerBeetle Transfer, Palantir Engine, PAF-ECF, or PVA as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. ERPNext and Odoo were read as public documentation. Sibling folders were read with `git show` only.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. The pressure is on H2's kernel layer and on open question 9. The candidate laws below are evidence, not a primitive list.
