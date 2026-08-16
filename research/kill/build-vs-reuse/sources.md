# Sources

**Status:** session inventory, 2026-08-16.  
**Kind:** source-system artifact.  
**Decision:** none.

Only first-party pages, license files, OS docs on this branch, and sibling trees opened with `git show` are listed. Product trees were not cloned.

## Search and fetch commands actually run

```text
git fetch origin main
git fetch origin cursor/issue-61-kill-cfd8
git fetch origin cursor/issue-32-corpus-cfd8
git fetch origin cursor/issue-34-corpus-cfd8
git fetch origin cursor/issue-35-corpus-cfd8
git fetch origin cursor/issue-36-corpus-cfd8
git fetch origin cursor/issue-55-kill-cfd8
git fetch origin cursor/issue-56-kill-cfd8
git fetch origin cursor/issue-57-kill-cfd8
git fetch origin cursor/issue-58-kill-cfd8
git fetch origin cursor/issue-59-kill-cfd8
git fetch origin cursor/issue-69-ops-cfd8
git show origin/cursor/issue-32-corpus-cfd8:research/erpnext/README.md
git show origin/cursor/issue-32-corpus-cfd8:research/erpnext/invariants.md
git show origin/cursor/issue-34-corpus-cfd8:research/moqui/README.md
git show origin/cursor/issue-34-corpus-cfd8:research/moqui/service-action-pattern-catalog.md
git show origin/cursor/issue-34-corpus-cfd8:research/notes/issue-0034-moqui-mantle-archaeology.md
git show origin/cursor/issue-36-corpus-cfd8:research/operational-runtimes/README.md
git show origin/cursor/issue-36-corpus-cfd8:research/operational-runtimes/steal-improve-reject.md
git show origin/cursor/issue-36-corpus-cfd8:research/operational-runtimes/sources.md
git show origin/cursor/issue-36-corpus-cfd8:research/operational-runtimes/evidence.md
git show origin/cursor/issue-55-kill-cfd8:research/kill/unified-ontology/README.md
git show origin/cursor/issue-58-kill-cfd8:research/kill/specialized-kernels/candidate-laws.md
git show origin/cursor/issue-58-kill-cfd8:research/kill/specialized-kernels/boundary.md
git show origin/cursor/issue-59-kill-cfd8:research/kill/fact-bitemporal/bitemporal-scope.md
git show origin/cursor/issue-69-ops-cfd8:research/licensing/corpus-license-register.md
```

Web fetches this session:

- `https://docs.temporal.io/workflows`
- `https://docs.temporal.io/evaluate/understanding-temporal`
- `https://docs.temporal.io/activity-definition`
- `https://docs.temporal.io/design-patterns/entity-workflow`
- `https://docs.cedarpolicy.com/`
- `https://docs.cedarpolicy.com/auth/authorization.html`
- `https://docs.xtdb.com/about/time-in-xtdb.html`
- `https://docs.xtdb.com/quickstart/sql-overview.html`
- `https://docs.frappe.io/framework/user/en/basics/doctypes/controllers`
- `https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition`
- `https://openfga.dev/docs/concepts`
- `https://docs.tigerbeetle.com/reference/transfer/`
- `https://docs.tigerbeetle.com/concepts/debit-credit/`

GitHub license files fetched this session:

- `temporalio/temporal` `LICENSE` (MIT, copyright Temporal Technologies Inc. 2025 and Uber Technologies, Inc. 2020)
- `cedar-policy/cedar` `LICENSE` (Apache-2.0)
- `openfga/openfga` `LICENSE` (Apache-2.0)
- `xtdb/xtdb` `LICENSE` (Mozilla Public License 2.0)

`docs/swarm-result-contract.md` was requested. It is not on `origin/main`.

## OS documents on this branch

Read at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`:

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/open-questions.md`
- `docs/research-program.md`
- `docs/swarm-research-backlog.md`
- `docs/hypothesis-history.md`
- `rfcs/0001-metamodel-hypothesis.md`
- `scenarios/README.md`
- `research/README.md`
- `research/reference-landscape.md`

Issue text: <https://github.com/EnzoTironi/OS/issues/61> and parent <https://github.com/EnzoTironi/OS/issues/2>.

## Sibling locators, not copies

Cite these paths. Do not treat this folder as a reprint.

| Locator | Why it was opened |
| --- | --- |
| `origin/cursor/issue-32-corpus-cfd8:research/erpnext/invariants.md` | submit, cancel, amend, ledger immutability |
| `origin/cursor/issue-34-corpus-cfd8:research/moqui/service-action-pattern-catalog.md` | Service versus implicit CRUD |
| `origin/cursor/issue-36-corpus-cfd8:research/operational-runtimes/evidence.md` | Open Foundry, Ontologiq, ObjectStack executors |
| `origin/cursor/issue-58-kill-cfd8:research/kill/specialized-kernels/candidate-laws.md` | semantic authority versus physical evaluator |
| `origin/cursor/issue-69-ops-cfd8:research/licensing/corpus-license-register.md` | ERPNext GPL-3.0, Frappe MIT, Moqui CC0, ObjectStack Apache-2.0 |

## Named candidates

| Candidate | First-party locator used this session | License as fetched or registered | Inspection depth |
| --- | --- | --- | --- |
| Frappe | controllers page on `docs.frappe.io` | MIT per issue 69 register | public docs |
| ERPNext | sibling issue 32 plus issue 69 register | GPL-3.0 | sibling notes plus license register. no clone |
| Moqui | Service Definition page on `moqui.org` | CC0 1.0 plus patent grant per issue 69 | public docs plus sibling issue 34 |
| Open Foundry | sibling issue 36 pinned `syzygyhack/open-foundry` `f29bcb9ed819` | Apache-2.0 per issue 36 | sibling code notes. no clone |
| ObjectStack | sibling issue 36 plus issue 69 | Apache-2.0. ObjectOS commercial excluded | sibling docs notes. no clone |
| Ontologiq | sibling issue 36 pinned `ontologiq/ontologiq` `5a087250f5ee` | Apache-2.0 | sibling code notes. no clone |
| Temporal | `docs.temporal.io` workflows and understanding pages. `LICENSE` MIT | MIT | public docs plus license file |
| Cedar | `docs.cedarpolicy.com` welcome and authorization pages. `LICENSE` Apache-2.0 | Apache-2.0 | public docs plus license file |
| OpenFGA | `openfga.dev/docs/concepts`. `LICENSE` Apache-2.0 | Apache-2.0 | public docs plus license file |
| XTDB | time-in-xtdb and SQL quickstart. `LICENSE` MPL-2.0 | MPL-2.0 | public docs plus license file |
| TigerBeetle | transfer reference and debit-credit concept pages | not re-fetched this pass. treat reuse as `undetermined` until the file is opened | public docs |
| Graph and query engines | `research/reference-landscape.md` on this branch | mixed | landscape only. no product adopted |
| Palantir Ontology | `research/reference-landscape.md` and sibling issue 35 tree listed, not opened beyond landscape | proprietary. cite-only | landscape |

## Searches that stayed undetermined

| Target | What was tried | Result |
| --- | --- | --- |
| `docs/swarm-result-contract.md` | read on this branch, fetch `cursor/issue-74-ops-cfd8` | file absent. issue 74 branch absent |
| Issue 68 existing-platform kill | `git fetch origin cursor/issue-68-kill-cfd8` | remote ref missing |
| TigerBeetle LICENSE file | docs only | grant not pinned this session |
| A specific planning solver as OS kernel | issue text names "existing ledger/planning libraries" | no first-party solver docs opened. class handled via issue 58 laws |
| SQL:2011 standard text | XTDB pages cite it | the ISO text was not fetched |
