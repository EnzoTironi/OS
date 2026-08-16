# Existing-platform kill test

- Artifact ID: `issue-0068-existing-platform`
- Issue: <https://github.com/EnzoTironi/OS/issues/68>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Research angle: can Palantir, Open Foundry, ObjectStack, Ontologiq, Moqui, Frappe/ERPNext, or another credible platform satisfy the OS thesis with extensions, so a new core is unnecessary?
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This folder does not edit `rfcs/0001-metamodel-hypothesis.md`. It does not write answers into `docs/open-questions.md`. It does not clone product trees. Claims come from public documentation plus `git show` of sibling notes. No copyleft implementation was pasted or translated.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is never `accepted`.

## Question

If we model one demanding vertical on the strongest existing platforms, do any of them already enforce the thesis properties without semantic distortion?

The issue asks for a replace-OS report. Developer effort is out of scope. Missing enforcement and collapsed distinctions are in scope.

## Verdict

**Folder decision state.** The claim that an existing platform already satisfies the OS thesis cleanly enough to replace a new core is `rejected`.

The claim that one of these platforms can host the vertical as an application, if OS rebuilds the missing laws as unenforced convention, is `supported` and is the wrong test. Palantir and ObjectStack already invite that path. The constitution measures enforcement, not screens.

The claim that OS should vendor or fork any inspected runtime as the MIT core is `rejected` for this pass. Palantir is closed. ERPNext is GPL. Odoo Community is LGPL. OpenBKN and Xpert carry reuse blocks recorded by issue 69. Ontologiq, Open Foundry, and ObjectStack are Apache-2.0 or mixed commercial, and each fails a required property in the engine.

Success for this issue is a change to the build-versus-reuse question if evidence warrants it. The evidence does not warrant adopting a core. It warrants stealing three protocols and refusing four collapses. See `replace-os-report.md`.

## What almost kills the new core

Palantir is the strongest proprietary benchmark. Official docs already give objects, links, interfaces, actions, functions, shared action logic across apps, and agents that submit those same actions. That is most of the nearby "ontology plus verbs" story.

It still fails the vertical on the properties the thesis treats as laws.

1. Multi-source observations are an anti-pattern. The recommended fix merges sources and picks a winner.
2. Requested, committed, planned, and actual are ordinary properties unless the modeler invents four types. The engine does not know they are different natures.
3. Approval is submit-time criteria or an AIP confirm toggle. It is not a hashed proposal that must re-read the world.
4. An external timeout is not `unknown`. A writeback webhook can succeed while the ontology write fails. A side-effect webhook can run after the user already saw success.
5. History is current state plus amendment objects. Official guidance calls a version-per-time object a Time Machine anti-pattern.

Ontologiq is the strongest open protocol for stale approval and lost I/O. It still fails the vertical because it never writes operational truth, never keeps history, and never holds competing observations.

No inspected platform has both halves.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Versioned locators used this session |
| `vertical.md` | reference | The one vertical all candidates were scored against |
| `evidence.md` | reference | Evidence cards E-001 through E-024 |
| `scorecard.md` | reference | Required property by platform, with enforcement class |
| `distortions.md` | explanation | Semantic distortions if the vertical is forced onto each platform |
| `candidate-laws.md` | explanation | Laws L-001 through L-008 |
| `counterexamples.md` | reference | Scenarios that would change the replace-OS answer |
| `replace-os-report.md` | explanation | The issue deliverable |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

Cited via `git show` on the named branch. This folder does not copy those trees.

- Palantir corpus, `origin/cursor/issue-35-corpus-cfd8` at `a2bb627d9929d9bdd332958cf4b482b0ba9d61af`, `research/notes/issue-0035-palantir-ontology-primitives.md`
- Operational runtimes, `origin/cursor/issue-36-corpus-cfd8` at `0d83a5f72b97e754db12f67441ca9bf01e1a6211`, `research/operational-runtimes/`
- ERPNext corpus, `origin/cursor/issue-32-corpus-cfd8` at `d91c62dd9ee94a0639c2eba3b789b10c3d6c5715`, `research/erpnext/`
- Moqui corpus, `origin/cursor/issue-34-corpus-cfd8` at `24c9b9986e3aa2d5f45d7c3bfd26d2e5404ad64c`, `research/moqui/`
- Unified-ontology kill, `origin/cursor/issue-55-kill-cfd8` at `5f4233579cf3057783775126afa64c39ed631353`, `research/kill/unified-ontology/`
- Specialized-kernels kill, `origin/cursor/issue-58-kill-cfd8` at `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef`, `research/kill/specialized-kernels/`
- Licensing, `origin/cursor/issue-69-ops-cfd8` at `8d20528db606dc7702c2b74da4f11d224ee2768f`, `research/licensing/`

`cursor/issue-61-kill-cfd8` was not on the remote this session.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `distortions.md`.
5. **Convergence.** `scorecard.md`.
6. **Divergence.** `scorecard.md` and `distortions.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `counterexamples.md`.
9. **Runtime pressure.** Each law names a runtime consequence without selecting a runtime.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Default `hypothesis`. Never `accepted`.

## How to read this

Start with `replace-os-report.md` and L-001 through L-004. Use `vertical.md` when a later issue asks what "the same demanding vertical" was. Use `scorecard.md` when a later issue asks which property a platform actually enforces. Use `distortions.md` when a later issue asks whether extensions close the gap.

Do not treat Foundry, ODL, DocType, or Service as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. ERPNext appears only through official docs and sibling notes. No GPL, LGPL, or AGPL implementation was opened in this VM beyond what sibling notes already cited.
