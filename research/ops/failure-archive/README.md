# Failure archive

- Artifact ID: `issue-0081-failure-archive`
- Issue: <https://github.com/EnzoTironi/OS/issues/81>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Track: ops
- Retrieved: 2026-08-16
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This folder archives ideas that research has already marked `rejected`. It is not a new kill test. It does not invent rejections. It does not copy sibling trees. It does not edit `rfcs/0001-metamodel-hypothesis.md` or `docs/open-questions.md`.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is never `accepted`.

## Question

Which hypotheses, primitives, architecture ideas, and domain models has OS already rejected, and what falsifying context must a later agent see before rediscovering them?

Issue 81 asks for a durable archive so future agents stop treating attractive dead ends as fresh options. The seed list is the historical path in `docs/hypothesis-history.md`. Wave A kill and foundation notes that already mark a claim `rejected` are cited, not restated as new verdicts.

## Verdict

**Folder decision state.** The six historical framings named in issue 81 are archived as `rejected` in the scopes those sources already used. Sibling Wave A notes add more `rejected` readings. Claims those notes left `hypothesis`, `supported`, or `undetermined` stay in those states. They are listed in [`undetermined.md`](undetermined.md) so synthesis does not promote them.

H0 is `rejected` as the top-level product. H1 is `rejected` as the greenfield architecture and remains `hypothesis` as brownfield integration. Pack, visible Compiler, and semantic Deterministic Kernel are `rejected` as ontology primitives. Frappe or ERPNext as the greenfield foundation is `rejected`. ERPNext stays a primary corpus.

The overreach "the executable-ontology thesis is dead" is itself `rejected` by issue 55. Archive that too. A later agent that reads only the kill-test titles can invent a stronger death than the evidence paid for.

## How to query this folder

| File | Mode | What a synthesis agent should read it for |
| --- | --- | --- |
| [`ledger.md`](ledger.md) | reference | Every archived `rejected` claim, one row, with scope and revival |
| [`cards/FA-historical-seeds.md`](cards/FA-historical-seeds.md) | explanation | Full records for H0, H1, Pack, Compiler, Kernel, Frappe |
| [`cards/FA-sibling-rejections.md`](cards/FA-sibling-rejections.md) | explanation | Folder-level `rejected` claims already marked on sibling branches |
| [`undetermined.md`](undetermined.md) | reference | Claims siblings left open. Do not treat these as archived kills |
| [`sources.md`](sources.md) | reference | Exact `git show` locators and document paths |

Start at the ledger. Open a card only when you need the original support, the breaking evidence, or the revival condition. If a row is missing, the claim is not archived. Absence is not a new rejection.

## Kind key

- **domain evidence.** A distinction the world keeps forcing.
- **source-system artifact.** A product, schema, or packaging choice.
- **candidate law.** The smallest claim a source already marked `rejected` or `supported` against a dead end.
- **counterexample.** The case that broke the attractive reading.
- **runtime consequence.** What an engine must refuse if the rejection stands.

## What this folder will not do

It will not answer `docs/open-questions.md`. Cite a research artifact or leave the question `undetermined`.

It will not promote H4 or H5 to `rejected`. Those remain the leading thesis and the favored method.

It will not treat a kill-test attack card marked `supported` as a rejected OS primitive. Only claims a source already labeled `rejected` enter the ledger.

It will not copy `research/kill/` or `research/foundation/` trees. Locators point at sibling commits.

## Output contract

1. **Question.** This README.
2. **Sources.** [`sources.md`](sources.md).
3. **Evidence.** The historical cards and the sibling cards. Evidence is quoted from sources already in the repo or from `git show` of named commits.
4. **Source artifacts.** Marked on each card. Pack, Compiler, DocType, Workflow engine, and product names stay artifacts unless a source already treated them as domain meaning.
5. **Convergence.** Independent sources that reject the same reading. See the ledger `cited from` column.
6. **Divergence.** Scope splits. H1 is dead as greenfield and live as integration. Kernels are dead as a second business authority and live as physical evaluators.
7. **Candidate laws.** Each card states the rejected claim as a law a later agent can try to revive.
8. **Counterexamples.** Each card names the breaking evidence the source already used.
9. **Runtime pressure.** Each card names what a runtime must refuse. No engine is selected.
10. **Open questions.** [`undetermined.md`](undetermined.md).
11. **Decision state.** Each card. Default for archived rows is `rejected` in a named scope.

## Licensing

OS is MIT. These notes extract concepts and documented research decisions. No copyleft implementation was pasted or translated.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. The archive records pressure that already exists in hypothesis history and in sibling notes. Independent sources have not converged on a new primitive list in this pass.
