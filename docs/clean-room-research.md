# How to extract evidence without contaminating the MIT tree

**Status:** contributor how-to for issue #69.  
**Not legal advice.** The research note is `research/licensing/issue-69-clean-room-boundaries.md`.

OS is MIT. Many corpora are not. Your job is to learn the domain distinction and leave the other project's writing where it is.

## Before you open a corpus

1. Read the register row in `research/licensing/corpus-license-register.md`.
2. Open the license file or terms page named there. Do not trust the GitHub badge alone.
3. If the reuse class is `forbidden-without-counsel` or `undetermined`, stop.

Odoo Enterprise, Odoo proprietary apps, and unpinned "Open Foundry" repos are stop cases.

## What to take

Take the real-world distinction, the invariant, the failure mode, and the scenario that forced the concept to exist.

Write it in your own words. Point at the exact file, commit, issue, test, or standard URI.

Use the evidence classes from the backlog contract:

- domain-evidence
- source-artifact
- candidate-law
- counterexample
- runtime-consequence

Set a decision state. Use `hypothesis`, `supported`, `rejected`, or `undetermined`. Never `accepted`.

Attach a provenance object that validates against `research/licensing/source-attribution.schema.json`.

## What not to take

Do not paste source into this repo.

Do not translate a function from Python, Groovy, or TypeScript into OS code.

Do not copy XML, JSON, or DocType schemas as OS types. A one-to-one mapping from a source table to an ontology type is already forbidden by `docs/constitution.md` §2.

Do not copy documentation chapters. ERPNext docs are CC-BY-SA-3.0. ValueFlows is CC-BY-SA-4.0. Paraphrase and cite.

Do not use ERPNext, Odoo, or other marks in an OS product name. Citation is fine. Branding is not.

## If you must quote

Quote only when paraphrase would hide the evidence. Keep it short. Put the locator next to the quote. Leave `reuse_decision` at `none`.

A two-line test assertion can be evidence. A module cannot.

## If you want to reuse implementation

Stop writing code.

Open a note that sets `extraction_mode` to `implementation` and `reuse_decision` to `proposed`. Name the license, the boundary, and the alternative of writing it ourselves.

Do not land the copy in the same change as the proposal.

Permissive licenses still need this step. Apache-2.0 and MIT make reuse possible. They do not make it the default.

## Split the work

If you are mining ERPNext, Odoo Community, AGPL code, or a custom mixed repo, write a research note.

If you are writing OS runtime or toolchain code, read the note. Do not clone the copyleft tree into the same session.

Throwaway clones belong in a worktree that is never committed here.

## After you write

Run the checklist in `docs/research-review-checklist.md`.

Validate JSON if you added a provenance file:

```bash
python3 -m json.tool research/licensing/examples/work-order-distinction.provenance.json
python3 -c "import json; json.load(open('research/licensing/source-attribution.schema.json'))"
```
