# Kinds versus verdicts in research decisions

- Artifact ID: `issue-0082-kinds-versus-verdicts`
- Issue: <https://github.com/EnzoTironi/OS/issues/82>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Research angle: whether issue 82's extra labels earn a place as Wave A verdicts, or only as artifact kinds and later document statuses
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. Draft contract `docs/swarm-result-contract.md` on [PR 84](https://github.com/EnzoTironi/OS/pull/84).

This note is process research. It does not choose OS primitives. It does not edit RFC-0001.

## 1. Question

Can a swarm write `accepted` on a plausible idea and thereby turn it into architecture, and which of the issue 82 labels must exist to stop that?

Falsifiable claim under test:

> Wave A records need one closed verdict enum, `hypothesis`, `supported`, `rejected`, `undetermined`. Observation, candidate model, experiment, proposed, accepted, and superseded are kinds or later document statuses. They are not Wave A verdicts. Mixing the two axes is the silent-promotion failure.

If a later merged contract puts `accepted` on research notes, or if a single-axis machine is shown to block silent promotion better, this claim is wrong.

## 2. Source scope

Docs and RFC-0001 were read on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.

Examined:

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/hypothesis-history.md`
- `docs/open-questions.md`
- `docs/research-program.md`
- `docs/swarm-research-backlog.md`
- `rfcs/0001-metamodel-hypothesis.md`
- `scenarios/README.md`
- `research/README.md`
- GitHub issues 2, 74, 75, 76, 80, 81, 82
- Draft contract `docs/swarm-result-contract.md` and `research/schema/research-index.schema.json` via `git show origin/cursor/swarm-result-contract-cfd8` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9`
- Sibling ops notes via `git show` only, `origin/cursor/issue-76-ops-cfd8` at `0a682f68c4a8c6864d8c549774e5e501fd1c68a1` and `origin/cursor/issue-69-ops-cfd8` at `8d20528db606dc7702c2b74da4f11d224ee2768f`
- Nygard, 2011, Documenting Architecture Decisions
- IETF RFC 2026 and RFC 6410
- W3C Process Document, 2023-11-03
- Stanford Encyclopedia of Philosophy, Karl Popper, accessed 2026-08-16
- MADR status vocabulary from published MADR notes

Not examined:

- A full MADR template file. The raw GitHub path 404'd during this run.
- Issue 81 durable files. Remote `cursor/issue-81-ops-cfd8` was absent.
- Issue 74 exclusive remote. The contract draft lives on `cursor/swarm-result-contract-cfd8`.
- Issue 80 scorecard. No remote existed.
- Domain Observation versus Accepted Fact. That is open question 3 and stays `undetermined`.

## 3. Evidence

### E-001 Wave A verdict enum is already closed

- Grade: `official-doc`
- Claim supported: research notes use four verdicts and must not silently write `accepted`
- Citation: `docs/swarm-research-backlog.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L157-L169`
- Observation: the Agent output contract names `hypothesis`, `supported`, `rejected`, or `undetermined`, and says never silently `accepted`.
- Limits: the section is provisional until issue 74 lands.

### E-002 Draft contract repeats the same four verdicts

- Grade: `design-claim`
- Claim supported: the unmerged contract keeps the same closed enum and forbids `accepted` on research records
- Citation: `git show origin/cursor/swarm-result-contract-cfd8:docs/swarm-result-contract.md` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9`. Schema enum in `research/schema/research-index.schema.json` on the same commit.
- Observation: concept, invariant, candidate-law, counterexample, and runtime-consequence templates each take `hypothesis | supported | rejected | undetermined`. The prose says never use `accepted`. Synthesis and RFC work own later architecture decisions.
- Limits: PR 84 is unmerged. Issue 2 review called drafts through PR 119 not merge-ready.

### E-003 Constitution RFC statuses are a different list

- Grade: `official-doc`
- Claim supported: RFC document status is not the same enum as Wave A note verdicts
- Citation: `docs/constitution.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L152-L163`
- Observation: early RFCs should carry `hypothesis`, `investigating`, `supported`, `challenged`, `rejected`, `superseded`. Even `supported` is not immutable.
- Limits: the list is introduced with "such as". It is not declared closed.

### E-004 Issue 82 mixes kinds, methods, and verdicts in one list

- Grade: `design-claim`
- Claim supported: the issue's suggested states are not one semantic category
- Citation: <https://github.com/EnzoTironi/OS/issues/82>
- Observation: the body lists observation or evidence, hypothesis, candidate model, experiment, supported or rejected or undetermined, proposed decision, accepted decision, and superseded decision. It also requires preserved conflicting hypotheses and named falsification conditions on accepted decisions. It asks for conventions on `main`.
- Limits: the list is labeled suggested states to research, not a frozen enum.

### E-005 Current repo documents already separate Status from Decision

- Grade: `implemented-code`
- Claim supported: OS already writes `Decision: none` on living research docs
- Citation: `docs/open-questions.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L1-L4` and `rfcs/0001-metamodel-hypothesis.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L3-L5`
- Observation: open questions say `Decision: none`. RFC-0001 says `Status: hypothesis` and `Decision: none`.
- Limits: two documents. Not a written rule that every future RFC must copy the pair.

### E-006 Hypothesis history keeps weakened ideas

- Grade: `official-doc`
- Claim supported: rejected or weakened hypotheses stay in the repo
- Citation: `docs/hypothesis-history.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L1-L5` and `#L23`
- Observation: earlier hypotheses are kept even when later weakened. H0 is `rejected` as product framing and retained as a source of domain evidence.
- Limits: the file is narrative history, not a machine-checked archive. Issue 81 still has no remote files.

### E-007 Research program already names candidate models and experiments without making them verdicts

- Grade: `official-doc`
- Claim supported: candidate model fragments and adversarial scenarios are artifact kinds
- Citation: `docs/research-program.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L142-L153` and `scenarios/README.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L1-L24`
- Observation: research artifacts include evidence notes, concept cards, invariant cards, scenario cards, disagreement notes, candidate model fragments, counterexamples, and RFC updates. Scenarios are a seed suite, not a status field.
- Limits: naming an artifact kind does not prove a later document status is unnecessary.

### E-008 Exit criteria demand falsifiers before experimental implementation

- Grade: `official-doc`
- Claim supported: even experimental implementation is not a permanent primitive
- Citation: `docs/research-program.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L241-L254`
- Observation: a candidate primitive is ready for experimental implementation when multiple domains require it, alternatives are documented, counterexamples were attempted, enforcement is understood, a falsifier is stated, and the design is not one source schema. The last sentence says experimental implementation still does not make the primitive permanent.
- Limits: this is a readiness bar for an experiment, not an accepted-decision gate. Issue 80 owns stop conditions and has no artifacts yet.

### E-009 Constitution already forbids promotion by elegance and requires falsifiable claims

- Grade: `official-doc`
- Claim supported: a plausible idea is not a primitive, and a good claim names what would prove it wrong
- Citation: `docs/constitution.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L7-L18` and `#L165-L173`
- Observation: section 1 says a concept does not become a kernel primitive because it feels elegant. Section 18 prefers claims that imply tests that could prove them wrong.
- Limits: these are inquiry rules, not a state machine.

### E-010 Independent convergence is the project's own promotion pressure

- Grade: `official-doc`
- Claim supported: one source is interesting, several independent sources are stronger, disagreement is kept
- Citation: `docs/constitution.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L43-L49`
- Observation: disagreement is a research question, not noise to average away.
- Limits: the text does not define a numeric source count.

### E-011 Nygard ADR statuses are document lifecycle, and reversed decisions are kept

- Grade: `official-doc`
- Claim supported: proposed, accepted, deprecated, and superseded describe an architecture-decision document, not an evidence verdict
- Citation: Nygard, Michael. "Documenting Architecture Decisions." Cognitect, 2011-11-15, Status section. <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions> accessed 2026-08-16.
- Observation: a decision may be `proposed` before stakeholders agree, or `accepted` once agreed. A later ADR that changes or reverses it may mark the old record `deprecated` or `superseded` with a reference to the replacement. If a decision is reversed, the old record stays. Blind acceptance and blind reversal are the two failures the format exists to prevent.
- Limits: Nygard writes for project architecture after a decision is in force. OS is still pre-architecture. The post does not require named falsifiers on `accepted`.

### E-012 IETF splits research publications from standards-track maturity

- Grade: `official-doc`
- Claim supported: Experimental is a document track, not a claim verdict, and Historic is the keep-the-old-spec status
- Citation: IETF, RFC 2026, October 1996, sections 4.1.1, 4.2.1, 4.2.4. <https://www.rfc-editor.org/rfc/rfc2026.html> accessed 2026-08-16. IETF, RFC 6410, 2011, section 2. <https://datatracker.ietf.org/doc/html/rfc6410> accessed 2026-08-16.
- Observation: RFC 2026 puts Proposed Standard on the standards track after an IESG action. Experimental, Informational, and Historic are off-track. Experimental denotes a research or development effort published as an archival record. Historic is for a specification superseded or otherwise obsolete. RFC 6410 later collapsed Draft Standard into a two-tier ladder, Proposed Standard then Internet Standard, because the three-tier ladder stalled.
- Limits: IETF maturity is about protocol specifications and interoperability, not ontology research notes.

### E-013 W3C Recommendation Track uses extra stages only after wide review and implementation experience

- Grade: `official-doc`
- Claim supported: Candidate Recommendation and Proposed Recommendation are gated document stages, not first-write labels
- Citation: W3C, Process Document, 2023-11-03, section 6.3 and 6.3.1. <https://www.w3.org/policies/process/20231103/#rec-track> accessed 2026-08-16.
- Observation: the track is First Public Working Draft, revised Working Drafts, Candidate Recommendation, Proposed Recommendation, then Recommendation. Candidate Recommendation is published to gather implementation experience after wide review. Proposed Recommendation triggers Advisory Committee review. A later Recommendation may become a Superseded Recommendation when a newer version is recommended for new adoption.
- Limits: W3C stages assume chartered groups, patent policy, and membership review. OS has none of those yet.

### E-014 Popper requires named refutation criteria before a test counts as support

- Grade: `official-doc`
- Claim supported: support is corroboration after a risky test, never verification, and accepted decisions that omit falsifiers fail this bar
- Citation: Thornton, Stephen. "Karl Popper." Stanford Encyclopedia of Philosophy, substantive revision, section on falsifiability. <https://plato.stanford.edu/entries/popper/#FALS> accessed 2026-08-16. Quotes Popper 1963: 38 footnote 3 and 2002: 86.
- Observation: real support comes from observations undertaken as tests. Criteria of refutation have to be laid down beforehand. A corroborated theory is retained provisionally until falsified or superseded by a better theory. Testing stops at a convention-based decision to accept a basic statement. That "accept" is an agreement that a test ended, not a promotion of a universal theory to architecture.
- Limits: philosophy of science, not a software process. Methodologically one counter-instance is not always treated as instant death.

### E-015 MADR keeps proposed, accepted, rejected, deprecated, superseded on the decision document

- Grade: `official-doc`
- Claim supported: later ADR templates still treat those words as document status
- Citation: Zimmermann, Olaf. "The Markdown ADR Template Explained and Distilled." 2022-11-22. <https://ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html> accessed 2026-08-16. Status field `{proposed | rejected | accepted | deprecated | ... | superseded by }`.
- Limits: secondary walkthrough of MADR. The project's own template file was not retrieved in this run.

### E-016 Sibling issue 76 already used the four verdicts as coordination rules

- Grade: `design-claim`
- Claim supported: another ops worker treated `supported` as a scoped process rule and never wrote `accepted`
- Citation: `git show origin/cursor/issue-76-ops-cfd8:research/ops/prioritization/candidate-laws.md` at `0a682f68c4a8c6864d8c549774e5e501fd1c68a1`
- Observation: laws are marked `supported` as a coordination or scheduling rule, `hypothesis`, or `rejected`. The header says never `accepted`.
- Limits: unmerged exclusive tree. Not independent of this project's own contract.

### E-017 Draft contract already preserves disagreements instead of deleting the loser

- Grade: `design-claim`
- Claim supported: conflicting claims stay linked until a resolution test
- Citation: `git show origin/cursor/swarm-result-contract-cfd8:docs/swarm-result-contract.md` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9`, disagreement template and disagreement rules.
- Observation: a disagreement record links claim A and claim B, keeps both evidence sets, and stays `open` or `resolved`. Do not edit another note to make it agree. If later work resolves the conflict, keep both claims and append the resolution.
- Limits: unmerged.

### E-018 Open question 3 already uses Observation and Accepted Fact as domain words

- Grade: `official-doc`
- Claim supported: reusing those words as research verdicts would look like an answer to an open question
- Citation: `docs/open-questions.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L54-L66`
- Observation: question 3 asks whether OS distinguishes Observation, Claim, Assertion, Accepted Fact, and Derived Fact, and whether two contradictory claims can remain first-class.
- Limits: the question is about operational truth, not research-ops labels. The collision is linguistic.

### E-019 Issue 2 forbids closing research with issue-thread prose

- Grade: `design-claim`
- Claim supported: an issue is a question owner, not a verdict
- Citation: <https://github.com/EnzoTironi/OS/issues/2>
- Observation: do not close a research issue with only a prose summary. Land durable evidence under `research/`.
- Limits: GitHub `open` and `closed` remain workflow states.

## 4. Domain evidence

These are facts about how inquiry and standards processes behave, not facts about orders, stock, or parties.

**DE-001.** A claim has an epistemic verdict. A document has a lifecycle. Independent processes keep those axes apart. IETF Experimental is a publication class. W3C Candidate Recommendation is a gated stage. Nygard `accepted` is an in-force architecture record. Popper corroboration is a test result. None of those systems stuff observation, experiment, and accepted into one enum that a first-pass writer can increment.

**DE-002.** Silent promotion happens when a reader treats a document kind as a verdict. A Working Draft is not a Recommendation. An Experimental RFC is not an Internet Standard. A research note marked `candidate model` would be read the same way if that label sat in the Decision state field.

**DE-003.** Reversed decisions stay useful. Nygard keeps the superseded ADR. IETF assigns Historic. W3C keeps Superseded Recommendations. OS already keeps H0 through H3. Deleting the loser is the failure.

**DE-004.** Support without a pre-declared falsifier is cheap. Popper's footnote and constitution section 18 agree. Issue 82's demand that accepted decisions name falsification conditions is the same rule.

## 5. Source-system artifacts

**SA-001.** GitHub issue and PR numbers, exclusive branch names, and the Wave A through C labels. Coordination mechanics.

**SA-002.** Nygard path `doc/arch/adr-NNN.md`, MADR YAML `status`, IETF IESG Last Call, W3C Advisory Committee review, and W3C patent exclusion. Those are other organizations' process objects.

**SA-003.** The words Observation and Accepted Fact in open question 3. Domain research vocabulary. Not this folder's verdicts.

**SA-004.** Draft contract paths `research/notes/` and `research/index/`. This exclusive unit cannot write those trees. The local shard is a locator, not a second contract.

**SA-005.** Constitution statuses `investigating` and `challenged`. RFC-facing words. Absent from the Wave A note enum.

## 6. Concepts

### C-001 Verdict

- Source term: Decision state in the Agent output contract
- Domain distinction: how far a stated claim has been tested
- Evidence: E-001, E-002, E-014
- Source-specific form: the four-string enum on research records
- Alternative interpretations: a numeric confidence score. Rejected for Wave A because it invites silent rounding into architecture.
- Decision state: `supported` as the Wave A field

### C-002 Artifact kind

- Source term: research artifacts in the research program, plus issue 82's observation, candidate model, and experiment
- Domain distinction: what sort of record is being written
- Evidence: E-004, E-007, E-012
- Source-specific form: E, C, I, L, X, D, R identifiers in the draft contract
- Alternative interpretations: kinds as states in one machine. See X-001.
- Decision state: `supported`

### C-003 Later document status

- Source term: Nygard Status, IETF maturity, W3C maturity, constitution section 17
- Domain distinction: whether a decision document is in force, proposed, or replaced
- Evidence: E-003, E-011, E-012, E-013, E-015
- Source-specific form: RFC header `Status`, ADR `Status`
- Alternative interpretations: fold these into Wave A verdicts. See L-005.
- Decision state: `hypothesis` that OS will need this axis on RFCs or later ADRs. `rejected` as a Wave A note field.

### C-004 Falsification condition

- Source term: constitution section 18, issue 82, Popper criteria of refutation
- Domain distinction: an observable result that would defeat or narrow the claim, written before the claim is treated as in force
- Evidence: E-008, E-009, E-014
- Source-specific form: `Falsifier` on invariant and law templates in the draft contract
- Alternative interpretations: a vague "revisit later" sentence. Too weak. See X-004.
- Decision state: `supported` as a required field on any later accepted-decision document. `hypothesis` for the exact wording.

## 7. Invariants

### I-001 Wave A notes never write accepted

- Statement: a file under `research/` does not use `accepted` as Decision state
- Scope: Wave A evidence notes, including this ops tree
- Evidence: E-001, E-002, E-016
- Failure case: a plausible candidate model is copied into an engine design because its header said `accepted`
- Falsifier: a merged contract that adds `accepted` to the research-note enum and states why silent promotion is no longer the risk
- Decision state: `supported` as a coordination rule

### I-002 Conflicting claims stay until a resolution test

- Statement: an open disagreement keeps both claims and both evidence sets
- Scope: research notes and hypothesis history
- Evidence: E-006, E-010, E-017
- Failure case: the weaker hypothesis is deleted and later revived without its original support
- Falsifier: a case where keeping both claims demonstrably prevents a needed decision and a recorded resolution test already exists
- Decision state: `supported`

### I-003 Research-ops labels do not answer open question 3

- Statement: Observation and accepted in this folder are process words. They do not define domain Observation or Accepted Fact.
- Scope: this issue and any later promotion of these conventions
- Evidence: E-018
- Failure case: a synthesis agent treats this note as settling open question 3
- Falsifier: a domain note that independently settles question 3 and then maps the two vocabularies with citations
- Decision state: `supported` as a hygiene rule. The domain question stays `undetermined`.

## 8. Candidate laws

### L-001 Verdict and kind are orthogonal

- Statement: a record has a kind and a verdict. Putting kind names in the verdict field is what lets swarm output become architecture by renaming.
- Evidence: E-001, E-002, E-004, E-007, E-011, E-012, E-013
- Independent convergence: Nygard, IETF, W3C, and the OS contract all separate document class from in-force status or from evidence grade
- Known limits: a later accepted-decision document will carry both a kind and a later status. That is still two fields.
- Counterexamples: X-001
- Decision state: `supported` as a coordination law

### L-002 Wave A verdicts stay at four values

- Statement: Decision state on a research record is exactly `hypothesis`, `supported`, `rejected`, or `undetermined`
- Evidence: E-001, E-002, E-016
- Independent convergence: backlog contract and draft schema. Issue 76 already followed it.
- Known limits: RFC headers may keep constitution section 17 words. Those headers are not research-note verdicts.
- Counterexamples: X-002
- Decision state: `supported` as a coordination law

### L-003 Observation, candidate model, and experiment do not earn verdict slots

- Statement: those three issue 82 labels already exist as evidence records, RFC or model fragments, and scenario or counterexample cards
- Evidence: E-004, E-007, E-012
- Independent convergence: IETF Experimental is off-track publication. OS scenarios are a suite.
- Known limits: a later experiment report may need its own document kind. That still does not add a verdict.
- Counterexamples: X-001
- Decision state: `supported`

### L-004 Proposed, accepted, and superseded earn a later document axis, not a Wave A verdict

- Statement: those three labels match ADR and standards-track lifecycle. They become legal only on an RFC or later ADR, and only after synthesis consumes Wave A evidence.
- Evidence: E-003, E-005, E-008, E-011, E-013, E-015
- Independent convergence: Nygard, MADR, W3C, constitution section 17 `superseded`
- Known limits: whether OS needs ADRs in addition to RFCs is `undetermined`. The exact accepted-decision gate is owned by issue 80 and stays `undetermined`.
- Counterexamples: X-002, X-005
- Decision state: `hypothesis` for the later axis. `rejected` as a Wave A verdict.

### L-005 An accepted-decision document must name falsification and revisit conditions

- Statement: if a later document uses `accepted`, it lists observable results that would reopen or replace it. `supported` on a research note is corroboration, not this status.
- Evidence: E-008, E-009, E-014, issue 82 body
- Independent convergence: Popper's prior criteria of refutation, constitution section 18, research-program exit criteria
- Known limits: Nygard does not require this field. That is a gap in the ADR source, not a reason to drop it here.
- Counterexamples: X-004
- Decision state: `supported` as a condition on any later accepted-decision. No such document exists yet.

### L-006 Investigating and challenged stay RFC-only until a later note proves they earn Wave A slots

- Statement: constitution section 17 adds two statuses the Wave A enum lacks. Notes map them instead of extending the enum.
- Evidence: E-003, E-002
- Independent convergence: none yet. This is an internal split.
- Known limits: a later contract revision could add them. Until then, `investigating` writes as `hypothesis` or `undetermined`, and `challenged` keeps the claim and opens a disagreement.
- Counterexamples: a merged contract that adds both words to the note enum with mechanical tests
- Decision state: `undetermined` whether they ever join Wave A. `supported` as the interim mapping rule.

## 9. Counterexamples

### X-001 Single-axis promotion

- Targets: L-001, L-003
- Setup: an agent marks a note `observation`, then `candidate model`, then `accepted`, because each word appears in issue 82's list
- Falsifying result: readers treat the last label as architecture and stop looking for counterexamples
- Observed result: the current contract forbids `accepted` on notes. The issue list still invites the climb if copied as one enum.
- Consequence: keep two fields
- Decision state: `supported` as a threat. The climb itself was not run.

### X-002 Accepted on a first-pass note

- Targets: L-002, L-004
- Setup: a Wave A note writes `Decision state: accepted` because two sources agreed
- Falsifying result: issue 2 review would have to treat that note as an architecture decision
- Observed result: not run on this branch. Issue 2 comment 5305027316 already found over-strong `supported` claims on other drafts.
- Consequence: forbid the word on research notes
- Decision state: `hypothesis` that review will keep rejecting it

### X-003 Delete the weaker hypothesis

- Targets: I-002
- Setup: two notes disagree on Relator. A later writer deletes the `undetermined` side
- Falsifying result: issue 81 cannot reconstruct why the idea looked attractive
- Observed result: not run. Hypothesis history and the draft disagreement rules already forbid the deletion.
- Consequence: keep both records
- Decision state: `supported` as a forbidden move

### X-004 Accepted without a falsifier

- Targets: L-005, C-004
- Setup: an RFC header says `Decision: accepted` and lists benefits only
- Falsifying result: constitution section 18 is violated and the claim cannot be tested
- Observed result: not run. RFC-0001 still says `Decision: none`.
- Consequence: require the field in the local schema
- Decision state: `supported` as a schema constraint. No accepted RFC exists.

### X-005 Process accepted answers open question 3

- Targets: I-003, L-004
- Setup: a synthesis agent reads `accepted decision` in this folder and concludes OS has Accepted Fact
- Falsifying result: open question 3 is silently closed
- Observed result: not run
- Consequence: this note states the collision and leaves question 3 `undetermined`
- Decision state: `hypothesis`

## 10. Disagreements

### D-001 Three status lists already disagree

- Claim A: `docs/swarm-research-backlog.md#L169` four Wave A verdicts
- Claim B: `docs/constitution.md#L154-L161` six RFC statuses
- Conflict: `investigating`, `challenged`, and `superseded` appear on RFCs only. Issue 82 then adds observation, candidate model, experiment, proposed, and accepted.
- Evidence for A: E-001, E-002
- Evidence for B: E-003, E-004
- Possible explanation: notes record tested claims. RFCs are documents that can be investigated or challenged as wholes. Issue 82 listed both axes plus artifact kinds.
- Resolution test: a later merged contract that either adopts two fields or justifies one closed list
- Status: `open`
- Resolution: unresolved

### D-002 Issue 82 asked for conventions on main

- Claim A: issue 82 body, deliver governance conventions in `main`
- Claim B: this unit's brief, write them only under `research/ops/decision-discipline/`
- Conflict: destination of the conventions
- Evidence for A: E-004
- Evidence for B: worker brief for this exclusive branch
- Possible explanation: the issue states the end state. The swarm standing orders delay promotion until a coordinator merge.
- Resolution test: a later PR that copies `conventions.md` onto `main` after review
- Status: `open`
- Resolution: unresolved. This branch follows the exclusive-tree rule.

## 11. Runtime consequences

### R-001 Indexes need two fields

- If claim survives: L-001
- Required property: a machine-readable record stores `kind` and `decision_state` separately
- Evidence: E-002, E-016
- Non-requirement: a graph database, RDF store, or workflow engine. Issue 75 owns the research graph.
- Decision state: `hypothesis`

### R-002 A checker can reject accepted on research notes

- If claim survives: I-001
- Required property: validation fails when a research record's verdict is `accepted`
- Evidence: E-001, E-002
- Non-requirement: a CI product choice
- Decision state: `hypothesis`

### R-003 Accepted-decision records require a non-empty falsifier list

- If claim survives: L-005
- Required property: the local schema refuses `kind: accepted-decision` without `falsification_conditions`
- Evidence: E-014, E-008
- Non-requirement: a specific RFC syntax or ADR directory
- Decision state: `hypothesis`

## 12. Dependent research

Consumed:

- Draft swarm result contract on `origin/cursor/swarm-result-contract-cfd8` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9`
- Issue 76 candidate laws via `git show` only
- Issue 69 header via `git show` only, for exclusive-tree pattern, not for license conclusions

Changes if this note survives review:

- Issue 74 can keep the four-verdict enum and treat issue 82 kinds as record types
- Issue 75 can index `kind` and `decision_state` as separate keys
- Issue 80 still owns the accepted-decision gate and remains `undetermined`
- Issue 81 still owns the failure archive. This note only restates that rejected records stay

Sibling files were not copied.

## 13. Open questions

- Q-001. Does OS need ADRs in addition to RFCs? `undetermined`
- Q-002. What exact evidence scorecard promotes a supported law to an accepted-decision document? Issue 80. `undetermined`
- Q-003. Do `investigating` and `challenged` ever join the Wave A note enum? `undetermined`
- Q-004. How do research-ops verdicts map to domain Observation, Claim, Assertion, Accepted Fact, and Derived Fact? Open question 3. `undetermined`. Do not answer it from this note.

## 14. Licensing

Concepts and process behavior only. Nygard, IETF, W3C, and SEP text were quoted at the minimum needed to identify the claim. No implementation reuse.
