# Build from zero versus reuse

- Artifact ID: `issue-0061-build-vs-reuse`
- Issue: <https://github.com/EnzoTironi/OS/issues/61>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Research angle: kill the claim that OS should adopt an existing ERP, ontology runtime, workflow engine, policy store, temporal database, graph engine, or ledger as its semantic core in order to avoid writing new code
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This folder does not edit `rfcs/0001-metamodel-hypothesis.md`. It does not write answers into `docs/open-questions.md`. Question 21 stays open there. Wave B product picks wait.

Each claim is tagged as domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is never `accepted`.

## Question

If the objective is the best semantic system, not the smallest new codebase, should OS build its core from first principles, reuse a mature product as that core, or compose existing runtimes?

An answer that counts must rank architecture alternatives by semantic quality, and must answer five questions for each reused component:

1. Does its abstraction match the desired semantics, or force adaptation?
2. Does it create a second source of business meaning?
3. Can it be replaced later behind a clean semantic boundary?
4. What correctness or maturity benefits are genuinely hard to recreate even with AGI?
5. What legacy constraints would OS inherit?

`Build it ourselves` is a valid winner.

## Verdict

**Folder decision state.** The kill-test claim "building from zero is inferior to reuse" is `rejected` for the semantic core. Adopting ERPNext, Frappe, Moqui, Open Foundry, ObjectStack, Ontologiq, or Temporal as the place where Product, Order, Action, Event, and Policy get their meaning is `rejected` as a greenfield architecture. Reuse of a physical mechanism behind a replaceable boundary is `supported` as a class. Which product, if any, later fills that class is `undetermined`.

`docs/open-questions.md` question 21 is not closed. This folder ranks alternatives. It does not freeze a runtime.

The quality winner on current evidence is:

```text
own the semantic core
reuse only mechanism that cannot invent business meaning
keep every reused engine replaceable
```

That is alternative A1 in [`alternatives.md`](alternatives.md). Building the durability service, the policy evaluator, and the temporal index from scratch as well is alternative A2. A2 is legal. It is worse than A1 when the reused engine adds no second ontology.

## How to read

| File | Kind |
| --- | --- |
| [`sources.md`](sources.md) | source-system artifact. Pages, licenses, sibling `git show` locators |
| [`evidence.md`](evidence.md) | labeled evidence cards |
| [`candidate-laws.md`](candidate-laws.md) | smallest claims, each with a falsifier |
| [`alternatives.md`](alternatives.md) | ranked architectures |
| [`matrix.md`](matrix.md) | five-question grid per component |
| [`counterexamples.md`](counterexamples.md) | attacks on the laws and on reuse-as-core |
| [`open-questions.md`](open-questions.md) | what this session did not settle |

## Cross-link

Sibling notes were read with `git show` only. They were not copied.

- Issue 32 ERPNext corpus on `origin/cursor/issue-32-corpus-cfd8`
- Issue 34 Moqui corpus on `origin/cursor/issue-34-corpus-cfd8`
- Issue 36 operational runtimes on `origin/cursor/issue-36-corpus-cfd8`
- Issue 55 unified ontology kill on `origin/cursor/issue-55-kill-cfd8`
- Issue 58 specialized kernels kill on `origin/cursor/issue-58-kill-cfd8`
- Issue 59 fact and bitemporal kill on `origin/cursor/issue-59-kill-cfd8`
- Issue 69 license register on `origin/cursor/issue-69-ops-cfd8`

## Licensing note

OS is MIT. This folder extracts concepts and observed behavior. ERPNext is GPL-3.0. Odoo Community is LGPLv3. XTDB is MPL-2.0. No implementation was pasted or translated.
