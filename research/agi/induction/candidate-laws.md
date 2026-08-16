---
issue: 50
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate induction laws

Smallest claims about the research pipeline. Each law names a falsifier. Decision state is never `accepted`.

These are protocol laws. They are not RFC-0001 edits and not answers to `docs/open-questions.md`.

## L-IND-01. A source artifact is not a domain law

**Claim.** A table, DocType, class, service, or UI label is an observation about a system. The domain law is the smallest distinction that still explains two or more independent families.

**Kind.** candidate law

**Evidence.** E3, E5, E14. Constitution rule 2. `research/README.md` quality bar.

**Decision state.** `supported`

**Falsifier.** A mature independent family whose table names are already the domain distinctions, including after homonyms such as Work Order are aligned, and whose copying never produces a later correction.

**Runtime consequence.** Induction output must keep two columns. Artifact. Law. A one-column dump has failed.

## L-IND-02. Term extraction is not induction

**Claim.** The ontology-learning layer cake can list terms, synonyms, and taxonomies from text. Issue 50 requires inferred concepts, relationships, actions, invariants, counterexamples, and unanswered questions. Crossing that gap needs comparison, attack, and typed disagreement.

**Kind.** candidate law

**Evidence.** E1, E2, E3.

**Decision state.** `supported`

**Falsifier.** A layer-cake run on ERPNext plus Odoo docs that, with no comparativist or adversary pass, produces the reservation, authorization-versus-execution, and role splits and also types the Work Order homonym.

**Runtime consequence.** Do not score a run by concept count. Score it by surviving laws and recorded failures.

## L-IND-03. Independent convergence raises confidence. Disagreement is a question

**Claim.** One family makes a distinction interesting. Two families make it a candidate law. A disagreement is not noise to average.

**Kind.** candidate law

**Evidence.** E5. Constitution rule 4. Benchmark concepts A through C.

**Decision state.** `supported`

**Falsifier.** A domain where the second family always copies the first, so convergence is plagiarism rather than independent pressure.

**Runtime consequence.** Confidence may not reach `high` on one family. A lone ERPNext harvest stays `hypothesis`.

## L-IND-04. Intrinsic self-correction is not a promotion rule

**Claim.** An agent that revises its own law without a new pointer, a test, or a human gate is in Huang et al.'s intrinsic setting. That setting can make reasoning worse.

**Kind.** candidate law

**Evidence.** E7, E8.

**Decision state.** `supported`

**Falsifier.** A first-party study that shows intrinsic self-correction improving enterprise ontology induction without oracle labels or new evidence, replicated on two corpora.

**Runtime consequence.** A second pass over the same prompt cannot move `hypothesis` to `supported`.

## L-IND-05. Debate surfaces disagreement. Consensus is not evidence

**Claim.** Multi-agent debate is allowed as a way to force new pointers into the open. Agreement after debate does not raise decision state.

**Kind.** candidate law

**Evidence.** E6. Huang et al. on debate versus self-consistency.

**Decision state.** `supported` as a limit. `hypothesis` as the best use of debate in this repo

**Falsifier.** A measured induction run where debate consensus, with no new pointers, predicts later human agreement better than pointer count does.

**Runtime consequence.** Store debate traces as disagreements. Do not store them as verdicts.

## L-IND-06. Contradictions must be typed before anyone picks a winner

**Claim.** Homonym, collapsed modality, genuine conflict, implementation accident, and missing corpus need different next actions.

**Kind.** candidate law

**Evidence.** E11, E16. Open-questions caution on `delivery_date`. Scenario S-011.

**Decision state.** `hypothesis` for the five-type list. `supported` that untyped string mismatch is the wrong detector

**Falsifier.** A detector that only flags unequal strings and still separates ERPNext Work Order from Odoo Work Order, and still refuses to collapse requested and actual dates.

**Runtime consequence.** Human review should see the type. A reviewer asked only "which source is right" will flatten S-001 into one field.

## L-IND-07. Human review is the promotion gate

**Claim.** Automation may propose laws. Promotion to `supported` requires a reviewer who can reject the card. First-party ontology learning treats the engineer as the authority of record.

**Kind.** candidate law

**Evidence.** E2, E8. Cimiano. Sabou's gold ontology.

**Decision state.** `supported` for this project's Wave A. `undetermined` as a forever rule

**Falsifier.** Independent first-party sources that agree a human ontologist is unnecessary for enterprise invariants, plus a measured run that matches human review on the three benchmark concepts.

**Runtime consequence.** Agents write `hypothesis`. Reviewers write `supported` or `rejected`.

## L-IND-08. Copyleft corpora are evidence, not source

**Claim.** OS is MIT. Research may read GPL and LGPL systems. Notes may record concepts, behavior, tests, and public references. Implementation must not be pasted or translated into the MIT tree.

**Kind.** candidate law

**Evidence.** E5. Constitution rule 16. `research/README.md` clean-room posture.

**Decision state.** `supported`

**Falsifier.** An explicit project decision to relicense or to vendor a named implementation after a licensing review. That decision does not exist in this folder.

**Runtime consequence.** The licensing reviewer deletes function bodies, DDL, and translated algorithms. Concepts stay.

## L-IND-09. The current swarm is not this protocol

**Claim.** Wave A notes that already use kind tags are inputs and hygiene. They are not a measured, iterative induction pipeline with historian coverage, messy-data attack, and promotion gates.

**Kind.** candidate law

**Evidence.** E5. Benchmark score table. Historian cells `undetermined`. E15.

**Decision state.** `supported` as a negative claim. The finished-protocol claim is `rejected`

**Falsifier.** A later run that executes all eleven phases on a fresh concept, with historian pointers and a messy-data attack, and that beats a summarizer baseline on homonym detection.

**Runtime consequence.** Issue 50 stays open until a run produces that measurement. This folder is the protocol, not the measurement.

## L-IND-10. Missing messy data blocks one input class. It does not block the protocol note

**Claim.** Real-company spreadsheets, APIs, documents, and messages are required by the issue when available. They are not in this repository. Mark the class `undetermined` and publish the rest.

**Kind.** candidate law

**Evidence.** E15. Issue 77.

**Decision state.** `supported` as a stop rule

**Falsifier.** A de-identified corpus landing in-repo under an approved path. Then this law's second sentence is stale and a new induction pass must attack the three benchmark concepts with that corpus.

**Runtime consequence.** Do not invent company rows. Do not claim field validation against mess.

## L-IND-11. Vendor operational ontologies are not the induction kernel

**Claim.** Palantir-style mapping of datasources into objects, links, actions, and interfaces is a way to operate on types you already chose. It is not the procedure that infers which distinctions belong to the domain.

**Kind.** candidate law

**Evidence.** E4. Standing order 7.

**Decision state.** `supported` as a non-pick. `undetermined` as a later integration architecture

**Falsifier.** A first-party Palantir or peer document that shows their product inducing Kind versus Role versus document from heterogeneous ERP evidence without a human modeler choosing the types.

**Runtime consequence.** Wave B must not select a vendor agent stack as the OS kernel on the back of this issue.
