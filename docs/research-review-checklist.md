# Research review checklist

**Status:** reference gate for research PRs.  
**Decision:** `supported` as process.  
**Not legal advice.**

Reviewers use this list. Authors run it before they open the PR.

## Identity

- [ ] The change is only research notes, contributor guidance, or provenance schema. It does not edit `LICENSE`, `SOURCES.md`, `pstack/`, `cursor-team-kit/`, `.cursor/`, or RFC-0001 unless independent sources converged and the brief allowed it.
- [ ] The issue number in the branch matches the files. `issue-69` does not own `issue-3` notes.

## Evidence shape

- [ ] The note states a question.
- [ ] Sources have locators. Repo, path, commit, standard URI, issue, or test. "The docs say" is not a source.
- [ ] Each claim is tagged as domain-evidence, source-artifact, candidate-law, counterexample, or runtime-consequence.
- [ ] Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`.
- [ ] `accepted` does not appear as a decision state.
- [ ] Open questions in `docs/open-questions.md` are cited or left untouched. They are not answered from memory.

## Licensing

- [ ] Each cited corpus has a register row or a newly fetched license locator.
- [ ] Brand-level license claims were not used where the vendor ships more than one grant. Frappe vs ERPNext. Odoo Community vs Enterprise. OpenBKN per-file headers.
- [ ] `extraction_mode: implementation` never appears with `reuse_decision: none`.
- [ ] No copyleft, share-alike, custom, or proprietary source was pasted or translated.
- [ ] Documentation quotes are short, attributed, and necessary. Long CC-BY-SA passages are absent.
- [ ] Trademarks are used only to name the corpus.
- [ ] Odoo Enterprise, proprietary apps, and other `forbidden-without-counsel` trees are absent.
- [ ] A reuse proposal, if any, is a note. It is not a vendored tree.

## Agent hygiene

- [ ] Claims a later agent must trust point at files in `research/`, not only at issue-thread prose.
- [ ] The PR description links the note paths and the issue.
- [ ] If `docs/swarm-result-contract.md` exists on the branch, the note follows it. If it does not, the note follows the backlog Agent output contract.

## Fail the review when

- A function, class, or schema from a corpus appears in OS code without an approved reuse decision.
- A note summarizes a repo without a question, a locator, or a decision state.
- The author treated GitHub's SPDX badge as the grant on a `NOASSERTION` or `Other` repo.
