# Primitive reduction kill test

- Artifact ID: `issue-0056-metamodel-primitives`
- Issue: <https://github.com/EnzoTironi/OS/issues/56>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Track: kill
- Retrieved: 2026-08-16
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`
- Kind key: domain evidence, source-system artifact, candidate law, counterexample, runtime consequence

This folder does not edit `rfcs/0001-metamodel-hypothesis.md`. It does not invent answers into `docs/open-questions.md`. It does not propose a target schema.

A primitive here is a base semantic sort the engine must treat specially. It is not a programming type and not a table.

## Question

Can the RFC-0001 candidate list collapse to a smaller core without losing enforcement, auditability, static checking, optimization, or meaning?

The candidate list under attack is Type or ObjectType, Interface, Property, Relationship or Link, Action, Function, Constraint, Policy, Event, and Fact.

Issue 56 asks for maximal reduction. Elegance is not the test. Irreducibility is.

## Verdict

**Folder decision state.** The claim that RFC-0001's ten forms are all base sorts is `rejected`. The claim that Type plus Link plus Function plus Action is enough is also `rejected`. The claim that typed Facts plus rules is the kernel is `rejected`. The claim that UFO natures plus verbs is the kernel is `rejected`.

The smallest core that current Wave A evidence does not immediately kill is:

```text
Type
Link
Action
Event
Eval
Bind
```

Decision state for that six-sort core is `hypothesis`. It is not accepted. It is not an RFC edit.

Fact as the only information atom is `rejected`. Fact as a useful encoding for dated, sourced assertions is `hypothesis`. Fact as a kernel sort stays `undetermined`. That matches issue 4 and issue 12. I did not promote it to be polite.

Interface as a Role carrier is `rejected`. Interface as a kernel sort is `undetermined` and leans unused. Shared shape can be a structural contract without a language node.

Relator as a native engine category is `rejected` on present evidence. An identifiable relationship-object remains `supported`. Employment, supply hold, and reservation need a thing to target. They do not yet need a second storage sort.

Constraint and Policy as base sorts are `rejected`. The boolean body is Eval. The job is Bind with obligation, locus, error algebra, and combination. Issue 8 already killed `Function<Bool>` plus fail-closed as a universal law. This folder keeps that kill.

Action collapsed into Event is `rejected`. Event collapsed into Type implementing an Event interface is `rejected` for enforcement. You can store an occurrence as a typed object. You cannot let the engine treat occurrence as a mutable Type plus a tag. Accounting, inventory, and ValueFlows all correct by appending. A tag does not enforce that.

## What I tried to delete

I started from the RFC list and subtracted. Constitution rule 1 is the bar. Composition wins when meaning and enforcement survive.

| RFC form | Can it die as a base sort? | Decision |
| --- | --- | --- |
| Type or ObjectType | No. Identity and classification stay. | `supported` as required |
| Property | Yes. Typed attributes of Type, plus value types from issue 62. | `rejected` as base sort |
| Interface | Yes as Role. Maybe as shape. | Role carrier `rejected`. Kernel sort `undetermined` |
| Link | No as a relation without its own lifecycle. | `supported` as required |
| Relator, not in the RFC list but often added | Yes as a native category. No as a pattern. | Native sort `rejected`. Pattern `supported` |
| Action | No. Attempt is not occurrence. | `supported` as required |
| Function | The body survives as Eval. The word Function is too wide. | Bare Function as the only logic sort `rejected` |
| Constraint | Yes as a sort. No as a job. | Sort `rejected`. Job lives in Bind |
| Policy | Yes as a product engine pick. No as an authority job. | Cedar or OPA as kernel `rejected`. Bind obligation `hypothesis` |
| Event | No as a nature. Yes as "just another Type". | Nature `supported`. Type-plus-interface collapse `rejected` |
| Fact | Not as the only atom. Unclear as a sort. | Sole atom `rejected`. Kernel sort `undetermined` |

## Competing cores

Four cores were written far enough to attack. Three is the floor. A fourth exists because the first three all die and the leftover still needs a name.

1. **M1 Operational quartet.** Type, Link, Function, Action. Palantir-shaped. See [models.md](models.md).
2. **M2 Fact-rule core.** Typed Facts plus rules. Objects as projections. See [models.md](models.md).
3. **M3 UFO plus verbs.** Kind, Role, Relator, Event-nature, Action, Policy. See [models.md](models.md).
4. **M4 Bind-aware six.** Type, Link, Action, Event, Eval, Bind. See [models.md](models.md).

M1, M2, and M3 are `rejected` as sufficient kernels. M4 is `hypothesis`.

## Independence

I did not copy sibling folders. I read them with `git show` on the named branches. Those notes propose distinctions. This folder tries to delete sorts. Where a sibling already killed a collapse, I cite it and re-run the same collapse against accounting, inventory, employment, approvals, time, and external effects. Agreement is not automatic promotion.

Issue 55 kept a shared Action, Event, Fact, Constraint vocabulary. I do not inherit that courtesy. Constraint as a sort dies here. Fact as the only atom dies here. Event as an interface tag dies here.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Versioned locators used this session |
| `evidence.md` | reference | Evidence cards E-001 through E-024 |
| `models.md` | explanation | M1 through M4, encodings, losses, verdicts |
| `matrix.md` | reference | RFC form versus core versus loss versus decision |
| `candidate-laws.md` | explanation | Laws L-P-01 through L-P-14 |
| `scenarios.md` | reference | Scenario cards used as adversarial tests |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked on cards in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md` and the loss tables in `models.md`.
9. **Runtime pressure.** Each law names a runtime consequence without selecting a runtime.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Never `accepted`.

## How to read this

Start with the verdict and L-P-01 through L-P-06. Use `models.md` when a later issue asks whether a smaller core works. Use `matrix.md` when a later issue asks what each deleted sort costs. Use `scenarios.md` when a later issue asks what would revive a dead core.

Do not treat M4 names as OS vocabulary. Eval and Bind are research labels for jobs. They are not a schema.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated. ERPNext, Odoo, and Moqui appear through public docs and sibling notes.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. If synthesis later accepts these kills, the pressure is on open question 2 and open question 9. The candidate laws are evidence, not a primitive list.
