# Sources

**Kind:** source-system artifact for locators. The documents themselves mix domain evidence and research decisions.  
**Issue:** <https://github.com/EnzoTironi/OS/issues/81>  
**Retrieved:** 2026-08-16  
**Decision state:** `supported` as a locator list. Not a claim about OS primitives.

Sibling research was read with `git show` only. Those trees are not copied into this folder.

## In-tree documents on `origin/main`

Commit `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.

| Path | Used for |
| --- | --- |
| `docs/hypothesis-history.md` | Seed hypotheses H0 through H5 and their recorded statuses |
| `docs/thesis.md` | Current leading framing and the list of things not decided |
| `docs/constitution.md` | Rules 1, 5, 6, 16, 17, 18 |
| `docs/open-questions.md` | Questions this folder must not answer |
| `docs/research-program.md` | Evidence loop and exit criteria |
| `docs/swarm-research-backlog.md` | Agent output contract. Issue 81 placement |
| `rfcs/0001-metamodel-hypothesis.md` | Pack, Compiler, Deterministic Kernel, Agent, Workflow already excluded from the candidate primitive list |
| `scenarios/README.md` | Seed scenarios cited by siblings, not re-litigated here |
| `research/README.md` | Evidence-note quality bar |
| `research/reference-landscape.md` | Nearby systems treated as evidence, not foundations |

`docs/swarm-result-contract.md` is not in that tree.

## Sibling commits read with `git show`

| Branch | Commit | Tree used |
| --- | --- | --- |
| `origin/cursor/issue-55-kill-cfd8` | `5f4233579cf3057783775126afa64c39ed631353` | `research/kill/unified-ontology/` |
| `origin/cursor/issue-56-kill-cfd8` | `b44575d3d212c67258bee6ed0013e8409c530a5e` | `research/kill/primitives/` |
| `origin/cursor/issue-57-kill-cfd8` | `a640d008b555b4060421abebd253be71c6fea3e4` | `research/kill/action-mutation/` |
| `origin/cursor/issue-58-kill-cfd8` | `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef` | `research/kill/specialized-kernels/` |
| `origin/cursor/issue-59-kill-cfd8` | `4f7057cbc56abeb9c64e1d133ecb5eff584ed050` | `research/kill/fact-bitemporal/` |
| `origin/cursor/issue-60-kill-cfd8` | `0a8551c04f25c0feefd8ed616d14e3ff605ed047` | `research/kill/authority/` |
| `origin/cursor/issue-61-kill-cfd8` | `d22e3a24b62483ce5274019db0aa9d3aba268d18` | `research/kill/build-vs-reuse/` |
| `origin/cursor/issue-68-kill-cfd8` | `10314410ed1fddc252360ac9abff04b1b4c16956` | `research/kill/existing-platform/` |
| `origin/cursor/issue-72-kill-cfd8` | `190e4b9ac4aa97422df91a8579ab0e6b33539d34` | `research/kill/semantic-duplication/` |
| `origin/cursor/issue-7-foundation-cfd8` | `08676a1040780eed586288c1a43fa40535e2111d` | `research/notes/issue-0007-action-event-effect.md` |
| `origin/cursor/issue-10-foundation-cfd8` | `3a84854148f43acc71d8a1df56abb9b1fbb8656f` | `research/foundation/process/` |
| `origin/cursor/issue-69-ops-cfd8` | `8d20528db606dc7702c2b74da4f11d224ee2768f` | `research/licensing/` |

Issue 7's note lists decision states `hypothesis`, `supported`, and `undetermined`. It does not mark a claim `rejected`. Issue 56 later marks `Action equals Event` as `rejected` and cites that note. The archive uses issue 56 for that kill.

Issue 69 records licensing policy. It does not reject an architecture idea. Nothing from that tree enters the ledger.

## How to re-read a sibling claim

```text
git show <commit>:<path>
```

Example.

```text
git show 5f4233579cf3057783775126afa64c39ed631353:research/kill/unified-ontology/README.md
```

If the sibling file later changes state, this archive is stale until a later pass updates the locator and the ledger row. Do not silently refresh a rejection from memory.
