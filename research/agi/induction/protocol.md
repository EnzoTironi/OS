---
issue: 50
kind: how-to
fetched: 2026-08-16
decision_state: hypothesis
---

# How to run ontology induction

This is a research procedure. It is not an OS runtime and not a vendor agent stack.

Use it when you need candidate domain semantics from mature code, tests, migrations, issues, docs, formal standards, or, when present, real-company records. Do not use it to summarize a repository into a class list.

The loop is `hypothesis`. First-party method papers support pieces of it. No first-party source validates the whole loop on enterprise corpora. See [candidate-laws.md](candidate-laws.md).

## What you produce

For each domain question, write cards that a stranger can query. Every card carries **kind** and **decision state**.

Required fields on a law card:

- `id`
- `question`
- `kind` of each attached statement
- `decision_state`
- `claim`
- `evidence_pointers` with URL or git path plus a locator
- `confidence` as `low`, `medium`, or `high`, plus one sentence why
- `disagreements` typed per [Contradiction types](#contradiction-types)
- `source_artifacts` that must not become OS names
- `candidate_concepts`, `candidate_relationships`, `candidate_actions`, `candidate_invariants`
- `counterexamples`
- `unanswered`
- `runtime_consequence`

Separate the source artifact from the inferred domain law in the card body. If you cannot point at a source, the claim is not evidence.

Do not design a target schema. Do not edit RFC-0001. Do not write answers into `docs/open-questions.md`.

## Inputs

Use at least two independent families before you propose a law.

1. Operational systems. ERPNext, Odoo, Moqui docs, tests, migrations, issues. Read behavior. Do not paste implementation.
2. Formal models. UFO or OntoUML, REA or ValueFlows, PROV-O, FIBO when the question is legal identity.
3. Industry standards. GS1 EPCIS, ISA-95 or IEC 62264, and peers named in `docs/research-program.md`.
4. Real-company spreadsheets, APIs, documents, and messages. If the corpus is absent, mark the class `undetermined` and continue. Do not invent rows.

If a method paper or a vendor page fails to fetch, mark that cell `undetermined` and keep going.

## Roles

Assign the seven roles in [roles.md](roles.md). One person or one agent may hold more than one role. The adversary and the licensing reviewer must not be the same pass as the ontologist.

## The loop

Run the phases in order. After phase 7 you may return to phase 1 with a narrower question. Stop when a stop rule fires.

### 1. Write the real-world question

State a distinction in the world, not a table name.

Weak. "What is a Work Order?"

Better. "What fact authorizes production, and what fact records that a workstation did an operation?"

Record the question on the card before you open a corpus.

### 2. Harvest source artifacts. Archaeologist

For each system, collect names, documents, fields, services, and UI verbs. Tag every item `source-system artifact`.

Look in the places `docs/research-program.md` names. Entity or schema definitions, controllers or services, state transitions, validation, transaction boundaries, tests, migrations, issues, bug fixes, comments on exceptions, reconciliation and cancellation, permissions, reporting queries, integration boundaries.

Write what happens on submit, cancel, partial complete, and failure. Do not write a law yet.

### 3. Harvest historical pressure. Historian

Read issues, migrations, and tests that changed the artifact. Prefer a fix that added a field or a status after a production failure over a marketing page.

If you cannot reach issue history, mark historian coverage `undetermined` and say so on the card.

### 4. Build a convergence matrix. Comparativist

Rows are distinctions, not product features. Columns are independent families. Cells are `present`, `absent`, `renamed`, or `undetermined`.

A tick means the source makes the distinction. It does not mean OS should copy the name.

### 5. Propose the smallest law. Ontologist

Write one claim that explains the matrix. Name the source artifacts that look like the law but are not the law.

Confidence starts `low` with one family, `medium` with two families that agree, `high` only after the adversary fails to break the claim and a human keeps it at `supported`.

Never write `accepted`.

### 6. Formalize invariants and scenarios. Formalizer

Turn the claim into a sentence a scenario can break. Attach at least one scenario from `scenarios/README.md` or a new card with partial completion, cancellation after consequences, late data, identity ambiguity, or concurrent claims.

Name candidate actions only as verbs the domain already needs. Do not invent an action vocabulary for a runtime.

### 7. Attack the claim. Adversary

Try to make the claim false using another corpus, a seed scenario, or a generated case. Record the attempt even when it fails.

If debate is used, give each side the other side's pointers. Do not allow a vote without new pointers. See E6 and E8.

If the only signal is the same model talking to itself, keep the decision at `hypothesis`.

### 8. Type disagreements

Classify each disagreement before you resolve it.

Then either split the concept, keep both claims with provenance, or leave the item `undetermined`. Do not average.

### 9. License review

Confirm the notes extract concepts and behavior only. Delete any pasted function body, schema DDL, or translated algorithm from a copyleft tree. OS is MIT. Constitution rule 16.

### 10. Human review gate

A human or a designated reviewer promotes `hypothesis` to `supported`, or `supported` to a later RFC edit. Agents may propose. Agents may not silently accept.

Promotion to `supported` requires all of the following.

- Two independent families.
- At least one failed or bounded counterexample.
- Typed disagreements recorded.
- Licensing reviewer pass.
- No RFC-0001 edit unless independent sources converge and a later synthesis issue owns that edit.

### 11. Record runtime pressure. Do not pick a runtime

Write what would have to be true of any engine if the law survives. Isolation for concurrent claims, append-only observations, role membership that can start and stop. Stop there.

Wave B owns storage, vendors, and toolchains.

## Contradiction types

| Type | What it is | What you do |
| --- | --- | --- |
| Homonym | Same word, different layer. ERPNext Work Order versus Odoo Work Order | Split the row. Keep both names as artifacts |
| Collapsed modality | One field stores requested, promised, planned, or actual | Split the facts. Do not pick one winner |
| Genuine conflict | Same property, same time, different values from different sources | Keep both claims plus provenance. Authority is a later policy question |
| Implementation accident | One product grew a workaround. Party Link, Location Type Vendor | Record as artifact. Do not promote |
| Missing corpus | A required family did not load | Cell is `undetermined`. Do not fill from memory |

## Evidence pointer shape

Write pointers a later agent can open.

```text
family: ERPNext | Odoo | Moqui | ValueFlows | UFO | ISA-95 | sibling | paper
url_or_git: https://... or origin/<branch>:<path>
locator: heading, quote, or evidence id
retrieved: YYYY-MM-DD
kind: domain evidence | source-system artifact | ...
```

A pointer without a locator is a summary. Reject it in review.

## Retrieval

Prefer first-party pages and in-repo sibling notes over blogs. When two pages disagree, keep both pointers. When a page 404s, write `undetermined` and use the next first-party URL.

Do not clone copyleft trees into this repository to "finish" induction. Quote documented behavior. Point at the upstream URL.

## Self-correction

Use Reflexion-style memory only to store failed counterexamples and missing pointers. Use Self-Refine only to tighten wording after new evidence arrives.

Do not use intrinsic self-correction as the promotion rule. Huang et al. show that loop can degrade reasoning when no external signal exists.

## Stop rules

Stop and publish partial cards when any of these is true.

- The timebox ends.
- Two new independent families produced no new distinction.
- The adversary cannot type a new contradiction.
- The only remaining input class is messy real-company data and that corpus is absent.
- A fetch failed and a substitute first-party source is also absent.

Partial cited findings beat a polished essay.

## What failure looks like

The run failed if the output is a feature matrix of modules, a copied DocType list, a schema, a vendor kernel recommendation, or a silent `accepted` decision.

The run succeeded if a later agent can query a law, see the pointers, see the artifact that must not be copied, and see what would falsify the law.
