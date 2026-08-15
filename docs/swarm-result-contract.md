# Swarm result contract

**Status:** required research contribution contract.

This contract defines the durable output for OS swarm research. Research briefs must link to this file instead of restating it. The assigned issue controls the research question and scope. `docs/constitution.md` controls inquiry rules. `docs/thesis.md` remains provisional.

The contract applies to domain research, source archaeology, kill tests, runtime research, and research operations. A summary in an issue or pull request is not a research result.

Issue #74 is the bootstrap exception. This contract, the index schema, and the empty index shard are its durable artifacts. It does not create a domain evidence note.

## Complete the pre-read

Before collecting evidence:

1. Read the assigned issue body, all current comments, the parent issue, and every linked dependency.
2. Read these repository files:
   - `docs/swarm-result-contract.md`
   - `docs/constitution.md`
   - `docs/thesis.md`
   - `docs/hypothesis-history.md`
   - `docs/open-questions.md`
   - `docs/research-program.md`
   - `docs/swarm-research-backlog.md`
   - `research/README.md`
   - `rfcs/0001-metamodel-hypothesis.md`
   - `scenarios/README.md`
3. Search existing files under `research/notes/` and `research/index/` for the same question, sources, and terms.
4. Choose the note stem and research angle before writing. When parallel agents share an issue, each agent must own a different angle and a different note.

The pre-read supplies constraints, not answers. Do not promote a thesis or RFC statement to evidence.

## Name and place artifacts

Every investigation produces one primary evidence note and one index shard. Both files use the same stem:

```text
research/notes/issue-NNNN-<angle>.md
research/index/issue-NNNN-<angle>.json
```

Apply these naming rules:

- Pad the issue number to at least four digits. Issue 7 becomes `0007`.
- Write `<angle>` in lowercase ASCII kebab case.
- Name the angle for the bounded question or source, such as `identity-erpnext` or `late-invoice-corrections`.
- Use a distinct angle for each independent investigation on the same issue.
- Keep the stem after merge. Do not renumber record IDs or rename the artifact to match later terminology.

For example, an ERPNext investigation for issue 7 uses:

```text
research/notes/issue-0007-identity-erpnext.md
research/index/issue-0007-identity-erpnext.json
```

Do not create empty source taxonomies. Create `research/notes/` when the first evidence note lands.

## Structure the evidence note

Start each note with this metadata:

```markdown
# <bounded research title>

- Artifact ID: `issue-NNNN-<angle>`
- Issue: `<full issue URL>`
- Parent: `<full parent issue URL>`
- Research angle: `<one sentence>`
- Decision states present: `hypothesis`, `supported`, `rejected`, or `undetermined`
```

Use these sections in this order:

1. **Question.** State one falsifiable uncertainty.
2. **Source scope.** List sources examined, versions or commits, and material not examined.
3. **Evidence.** Record cited observations as `E-001`, `E-002`, and so on.
4. **Domain evidence.** Explain which real-world distinctions the observations may support.
5. **Source-system artifacts.** Isolate names, schemas, APIs, workflow choices, and implementation mechanics that may be local to a source.
6. **Concepts.** Use `C-001`, `C-002`, and so on.
7. **Invariants.** Use `I-001`, `I-002`, and so on.
8. **Candidate laws.** Use `L-001`, `L-002`, and so on. A candidate law is not an architecture decision.
9. **Counterexamples.** Use `X-001`, `X-002`, and so on.
10. **Disagreements.** Use `D-001`, `D-002`, and so on. Write `None found` when the sources do not disagree.
11. **Runtime consequences.** Use `R-001`, `R-002`, and so on. State required properties without selecting a runtime or toolchain.
12. **Dependent research.** Link the records and issues that this note consumes or changes.
13. **Open questions.** Mark unresolved questions `undetermined`. Do not answer `docs/open-questions.md` without cited evidence.
14. **Licensing.** State whether the work extracted concepts and behavior only or considered implementation reuse.

Keep source observation and interpretation separate. A source table or class belongs under source-system artifacts. A real-world distinction inferred from several observations belongs under domain evidence or candidate laws.

## Evidence grades and citations

`Evidence grade` is this closed enum:

- `implemented-code`: behavior or structure present in source code at an immutable revision. This grade does not prove that the code runs in production.
- `test`: executable expected behavior in a named test at an immutable revision, or an observed test result with the command and revision recorded.
- `official-doc`: normative or descriptive material published by the project, vendor, standards body, or regulator.
- `design-claim`: rationale or intended behavior asserted in an issue, RFC, proposal, maintainer comment, or design document.
- `inference`: an interpretation derived from cited observations. The note must state the reasoning and a way to falsify it.

The enum describes the kind of evidence, not a confidence ranking. An `official-doc` can be stale. A `test` can cover only one case. An `inference` remains an inference even when tests support its premises.

Use this evidence record:

```markdown
### E-001 `<short label>`

- Grade: `implemented-code | test | official-doc | design-claim | inference`
- Claim supported: `<one bounded claim>`
- Citation: `<immutable or versioned locator>`
- Observation: `<what the source says or does>`
- Limits: `<scope, missing cases, or uncertainty>`
```

Use an exact citation form:

- Code or test: `<repository URL>/blob/<full commit SHA>/<path>#L<start>-L<end>`, plus the symbol or test name.
- Repository file: `<path>@<full commit SHA>#L<start>-L<end>`.
- Versioned document: `<publisher>, <title>, <version or date>, <section>, <URL>`.
- Standard: `<standards body>, <identifier and version>, <clause or page>, <URL>`.
- Issue or review: `<full issue or review URL>`, plus the comment link or date when the page contains several claims.
- Observed execution: `<repository and full commit SHA>`, `<command>`, and the relevant output or durable result.

When a web document has no version, record the access date and quote only the minimum text needed to identify the claim. A home page, search result, branch name, or repository name alone is not a citation.

## Use stable record templates

Record IDs are local to the note. Do not reuse an ID for a different claim after review.

### Concept template

```markdown
### C-001 `<concept name>`

- Source term: `<term used by the source, if any>`
- Domain distinction: `<real-world distinction, not a table or class>`
- Evidence: `E-001`, `E-002`
- Source-specific form: `<schema, API, workflow, or naming that may not generalize>`
- Alternative interpretations: `<credible alternatives>`
- Decision state: `hypothesis | supported | rejected | undetermined`
```

### Invariant template

```markdown
### I-001 `<invariant name>`

- Statement: `<condition that must remain true>`
- Scope: `<where and when the statement applies>`
- Evidence: `E-001`, `E-002`
- Failure case: `<what breaks when the invariant does not hold>`
- Falsifier: `<observation that would disprove or narrow it>`
- Decision state: `hypothesis | supported | rejected | undetermined`
```

### Candidate law template

```markdown
### L-001 `<candidate law name>`

- Statement: `<smallest general claim that explains the evidence>`
- Evidence: `E-001`, `E-002`
- Independent convergence: `<records from independent sources, or none>`
- Known limits: `<scope boundaries>`
- Counterexamples: `X-001`
- Decision state: `hypothesis | supported | rejected | undetermined`
```

### Counterexample template

```markdown
### X-001 `<counterexample name>`

- Targets: `C-001 | I-001 | L-001`
- Setup: `<scenario and relevant preconditions>`
- Falsifying result: `<result that would disprove or narrow the target>`
- Observed result: `<result with E-ID, or "not run">`
- Consequence: `<reject, narrow, or leave undetermined>`
- Decision state: `hypothesis | supported | rejected | undetermined`
```

### Disagreement template

```markdown
### D-001 `<disagreement name>`

- Claim A: `<artifact-id>#<record-id>`
- Claim B: `<artifact-id>#<record-id>`
- Conflict: `<different observation, scope, terminology, or interpretation>`
- Evidence for A: `<E-IDs or linked records>`
- Evidence for B: `<E-IDs or linked records>`
- Possible explanation: `<why both may appear true>`
- Resolution test: `<evidence that would settle or narrow the conflict>`
- Status: `open | resolved`
- Resolution: `<linked evidence and retained decision history, or "unresolved">`
```

### Runtime consequence template

```markdown
### R-001 `<required runtime property>`

- If claim survives: `C-001 | I-001 | L-001`
- Required property: `<what a runtime must preserve or make observable>`
- Evidence: `E-001`, `E-002`
- Non-requirement: `<architecture or technology not implied by the evidence>`
- Decision state: `hypothesis | supported | rejected | undetermined`
```

Use decision states consistently:

- `hypothesis`: a falsifiable candidate that has not yet earned support.
- `supported`: cited evidence supports the claim within its stated scope and no recorded counterexample defeats it.
- `rejected`: cited evidence or a counterexample defeats the claim.
- `undetermined`: evidence is absent, insufficient, or in unresolved conflict.

Never use `accepted`. Synthesis and RFC work own later architecture decisions.

## Disagreement rules

Do not edit another note to make it agree with yours. Add a disagreement record to the note that found the conflict and link both record IDs. If a later investigation resolves the conflict, keep the two claims and append the resolution evidence. Do not delete the losing claim or its prior state.

Different terms are not automatically a disagreement. State whether the conflict concerns observed behavior, scope, terminology, or interpretation. When two sources model different realities, narrow both claims instead of averaging them.

Add every disagreement to the index shard. A synthesis agent must be able to find open disagreements without reading the full corpus.

## Cross-link dependent research

Link to the smallest durable target:

```text
<relative note path>#<record-id>
```

In Markdown, link to the record heading. In the index shard, use `<artifact-id>#<record-id>`. Link a source observation once instead of copying its prose into another note.

List a dependency when your claim consumes another artifact's evidence. List related research when the work shares a topic but neither artifact depends on the other. Comment on each affected issue with the new artifact path and the exact record IDs that matter.

## Open child issues only for new questions

Open a child issue only when all of these conditions hold:

- The question is a new semantic uncertainty, not a restatement of the assigned issue.
- Another agent can investigate it independently.
- Its answer can change a candidate law, counterexample, or downstream research requirement.
- The current issue can satisfy its acceptance criteria without answering it.
- No existing open issue already owns it.

Give the child issue a falsifiable question, parent link, relevant artifact and record links, and a completion condition. Keep a same-scope unknown in the current note as `undetermined`. Do not open a child issue only to store a disagreement, a missing citation, or work required by the current issue.

## Publish a machine-readable index shard

The research index is the set of JSON shards under `research/index/`. One note owns one shard, so parallel agents never append to one shared index file. Synthesis agents read every `research/index/*.json` file and concatenate each file's `entries` array.

`research/schema/research-index.schema.json` is normative. `research/index/_empty.json` is the empty, valid example. Each real shard:

- uses the same stem as its note;
- contains exactly one entry;
- includes only record IDs that exist in the note;
- records open and resolved disagreements;
- validates against the schema before commit.

The entry fields have fixed jobs:

- `artifact_id`, `artifact`, and `issue` identify the note and assigned issue.
- `title` and `question` state the bounded investigation.
- `topics` and `source_keys` provide lowercase kebab-case query keys.
- `evidence_grades` and `decision_states` list the enum values present in the note.
- `concepts`, `invariants`, `candidate_laws`, `counterexamples`, and `runtime_consequences` list local record IDs.
- `disagreements` lists each `D-ID`, both target record references, and `open` or `resolved` status.
- `depends_on` lists record references consumed by this note.
- `related_issues` lists issue numbers that share or consume the result.

The index is a locator, not a replacement for evidence. Keep claims, citations, reasoning, and limitations in the Markdown note.

## Completion checklist

Copy this checklist into the pull request or final issue comment:

```markdown
- [ ] I read the assigned issue, its comments, its parent, and every linked dependency.
- [ ] I read every file in the contract pre-read list.
- [ ] The primary note is `research/notes/issue-NNNN-<angle>.md`.
- [ ] The index shard is `research/index/issue-NNNN-<angle>.json` and has the same stem.
- [ ] Every factual claim has an `E-ID`, an evidence grade, and an exact citation.
- [ ] The note separates domain evidence from source-system artifacts.
- [ ] Concepts, invariants, candidate laws, counterexamples, and runtime consequences use stable IDs and decision states.
- [ ] Disagreements link both claims and preserve conflicting evidence.
- [ ] Dependent artifacts and affected issues are cross-linked without copied prose.
- [ ] New child issues, if any, contain genuinely new semantic questions.
- [ ] The index shard validates against `research/schema/research-index.schema.json`.
- [ ] The licensing section confirms clean-room treatment and identifies any reuse review.
- [ ] No architecture choice, source-schema mapping, or answer to an open question is presented as settled.
- [ ] The pull request and issue comment link the durable artifact paths.
```

An issue is not complete when any applicable item remains unchecked. Partial research may land, but its unresolved claims must remain `undetermined`.

## Forbidden results

Do not:

- make a premature architecture, primitive, runtime, database, language, or toolchain decision;
- treat a thesis, RFC, source schema, class, table, or API as the OS domain model;
- paste or mechanically translate source code or schemas, especially from copyleft projects;
- state an uncited factual claim;
- hide an inference under another evidence grade;
- overwrite, average away, or delete a disagreement;
- answer `docs/open-questions.md` from intuition;
- edit RFC-0001 as part of a research result;
- close a research issue with only summary prose in an issue or pull request;
- create a large research taxonomy or placeholder corpus without evidence.

The contract is the product for issue #74. It defines how later evidence composes. It does not settle what OS should become.
