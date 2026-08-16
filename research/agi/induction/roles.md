---
issue: 50
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Research roles

These roles are a research workflow. They are not OS runtime primitives. `docs/research-program.md` already names them. This file states what each role may write and what it must not decide.

**Kind.** source-system artifact for the role list itself. The split of duties is a `hypothesis` until a later run measures error rates per role.

One agent may hold several roles. The ontologist pass and the adversary pass must be separate. The licensing reviewer pass must be separate from both.

## Archaeologist

**Job.** Reconstruct why a mature system models something the way it does.

**Reads.** Code, docs, public APIs, comments, permissions, reporting queries.

**Writes.** Source-artifact cards. Observed behavior. Lifecycle and failure cases.

**Must not.** Propose OS types. Translate implementation into the repo.

**Done when.** Each harvested name has a pointer, a behavior note, and a `source-system artifact` tag.

## Comparativist

**Job.** Compare the same distinction across independent families.

**Reads.** Archaeologist cards from at least two families, plus a formal or industry source when one exists.

**Writes.** A matrix whose rows are distinctions and whose cells are `present`, `absent`, `renamed`, or `undetermined`.

**Must not.** Pick a winner because one product is familiar. Average away a disagreement.

**Done when.** Every matrix row names the homonym or the real split.

## Ontologist

**Job.** Propose the smallest model that explains the matrix.

**Reads.** Matrix, historian notes, formal sources.

**Writes.** Candidate-law cards with falsifiers. Candidate concepts, relationships, actions, and invariants as claims, not as a schema.

**Must not.** Edit RFC-0001. Answer `docs/open-questions.md`. Promote its own card to `supported`.

**Done when.** Each law names evidence, a source artifact that looks like a counterexample, and a falsifier.

## Historian

**Job.** Find previously violated assumptions in bugs, migrations, and tests.

**Reads.** Issue trackers, changelogs, migrations, regression tests.

**Writes.** Dated pressure notes. "This field appeared after X failed."

**Must not.** Treat a marketing rewrite as history.

**Done when.** Either a historical pointer exists or coverage is marked `undetermined`.

## Formalizer

**Job.** Turn prose distinctions into candidate invariants and executable scenarios.

**Reads.** Ontologist cards and `scenarios/README.md`.

**Writes.** Invariant sentences. Scenario cards with partial, late, concurrent, or cancelled cases.

**Must not.** Invent a type system or a storage model.

**Done when.** Every law has one scenario that would force a rewrite if it passed.

## Adversary

**Job.** Break the law.

**Reads.** Everything the ontologist used, plus a source the ontologist did not use.

**Writes.** Counterexample cards. Typed disagreements. Debate traces that include pointers.

**Must not.** Accept consensus without a new pointer. Use intrinsic self-correction as a verdict.

**Done when.** Each law has an attack recorded, including failed attacks.

## Licensing reviewer

**Job.** Keep research on the conceptual and behavioral side unless reuse is explicitly approved.

**Reads.** The draft folder and the licenses of the corpora.

**Writes.** A pass or a delete list. Flags any pasted function, DDL, or translated algorithm.

**Must not.** Approve implementation reuse in Wave A. OS is MIT.

**Done when.** The folder contains no copyleft implementation and every corpus used is listed in `sources.md`.

## Human review

Not one of the seven named roles. Still required to promote `hypothesis` to `supported`. See [protocol.md](protocol.md) phase 10.

Cimiano-style ontology learning treats the engineer as the authority of record. Huang et al. show that a model reviewing itself is not a substitute. Decision state for "the human can leave" is `undetermined`. See [open-questions.md](open-questions.md) Q1.

## Debate pattern

If you run a debate, give each speaker a role above. Do not spawn three generic critics.

A useful debate turn cites a pointer the other side has not used. A useless debate turn restates confidence.

Huang et al. found multi-agent debate no better than self-consistency at equal response count on their reasoning tasks. Use debate to surface typed disagreements. Do not use it to count votes.
