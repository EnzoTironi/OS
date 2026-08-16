# Open questions

**Kind:** reference  
**Retrieved:** 2026-08-16  
**Decision:** `undetermined` unless a card says otherwise.

This file does not answer `docs/open-questions.md`. It points at artifacts in this folder or marks the question still open. Invented answers are forbidden.

## Q2. What is the smallest semantic core?

`docs/open-questions.md` item 2 stays open.

This folder's working hypothesis is Type, Link, Action, Event, Eval, Bind. Decision state `hypothesis`. See L-P-14 and [models.md](models.md) M4.

What remains unset inside that hypothesis:

- Whether Interface is a node or a structural contract. L-P-08
- Whether Event is a sort or a required nature with a non-mutable default. L-P-04
- Whether Fact grows back for Class D clashes. L-P-10, S-P-08
- Whether Search is a seventh job. E-020
- Whether Effect needs a sort. Issue 7 L-008, still `hypothesis` that it does not

Do not copy M4 into RFC-0001 from this question.

## Q4. What exactly is an Action?

Not settled here. L-P-02 only kills the collapse into Event.

Still `undetermined`:

- whether every mutation needs a named Action
- whether a durable proposal object is required, or stages on the invocation suffice
- the exact digest that approval binds

Cite issue 7 C-001 through C-003 and L-P-12. Do not invent the digest.

## Q5. Action versus Event versus Effect

Action versus Event is `supported` here. L-P-02.

Effect as a kernel type stays `undetermined` in this folder and `hypothesis` as unnecessary in issue 7 L-008. Unknown after dispatch is `supported`. L-P-03.

`docs/open-questions.md` item 5 therefore stays open on Effect, closed only on the Action=Event collapse, and only as a research claim, not as an RFC edit.

## Q6. What is mutable state?

Not reopened. Issue 12 CL-2 and CL-3 are treated as inputs. L-P-10 uses them to kill M2 as a universal projection law.

Whether current state is always reconstructable enough for audit stays `undetermined`. Cite issue 12 CL-1.

## Q7. Is bitemporality fundamental?

Not answered. L-P-11 repeats issue 5 L1 and L2. Two questions are `supported`. Universal rows are `rejected` as a law. Q7 stays `undetermined`.

## Q9. Function, Constraint, Policy. One thing or three?

`docs/open-questions.md` item 9 stays open as architecture.

This folder rejects "one Function" and rejects "three base sorts." It hypothesizes two jobs, Eval and Bind, with Constraint and Policy as Bind species. L-P-05, L-P-06. Decision state `hypothesis`.

A later agent that wants a yes or no on Q9 must attack L-P-06. It must not treat this paragraph as the answer.

## Q12. Do relationship-entities deserve special semantics?

The threshold is `supported`. Native Relator sort is `rejected` on present evidence. L-P-07.

Issue 28 L4 remains `undetermined` for the engine. This folder's rejection is a kill-test stance, not a close of Q12. If S-P-16 later fires, Q12 reopens toward a sort.

## Q13. How should economic reality be modeled?

Not answered. ValueFlows layers were used as evidence against one Fact predicate. E-001. Which VF types belong in OS stays `undetermined`.

## Q15. What belongs in the ontology versus the runtime?

Bind loci name jobs. They do not pick a store, a policy engine, or a queue. E-014. Wave B waits.

Whether query is language or toolchain was not studied. Issue 13 exists and was not read in full.

## Q23. What would falsify the leading thesis?

Issue 55 already rejected "one enterprise vocabulary" and kept "one metamodel" as `hypothesis`. E-022.

This folder does not kill the executable-ontology thesis. It kills an oversized metamodel list and three undersized slogans.

A later kill that would matter:

- M4 becomes so general that domain rules are unreadable. Q23 third example.
- Bind grows a hidden second engine for accounting. Constitution §12 smell.
- Fact Class D plus external unknown plus SOD exception cannot compose in one core.

None of those is scored here.

## New semantic questions

No new GitHub issue is warranted. The questions below are refinements of Q2 and Q9.

1. Can Event die if Type has a required immutability nature that the engine actually enforces? L-P-04's remaining hole.
2. Can Fact stay an encoding once S-P-08 is run against a real multi-source promised date?
3. Does ATP or planning force Search as a visible job before the first vertical?

Those stay `undetermined`. They are follow-ups, not invented answers.
