# Zoen final program status

Generated from `program.json`, `frontier.json`, and `ledger.tsv`.

- Repository: `EnzoTironi/OS`
- Base: `main@304f2da17f9e8dcc8779101f03bb5b9fc08eaf6b`
- Units: 52 total, 6 done, 4 active, 42 queued
- Canonical journeys: 8, J1 through J8
- Final gates: 9, FIN-01 through FIN-09
- Products: Ontology, Eve, Better Auth
- Public verbs: Discover, Query, Propose, Decide, Commit, Explain, Execute
- WorldRelease catalogs: ontology, policy, executors, components

## Active units

| Unit | Branch | Head or source | Pull request |
| --- | --- | --- | --- |
| W0-05 | codex/zoen-governed-north-ratification | not recorded | #620 |
| W1-03 | codex/w1-03-production-effect-handler | 904562917f994096aab46e6e7dbb04f08ca55919 | #617 |
| W1-04 | codex/w1-04-eve-runtime-boundary | aa07dce89325c25b2c0fd35129f1ee8628e8ff29 | #618 |
| W2-01 | codex/w2-01-world-release-contract | f00efc7f245db80ff0d0d9051986d4d61e0e20e8 | not open |

## Merged pull requests

| Pull request | Unit | Head | Merge | Merged at |
| --- | --- | --- | --- | --- |
| #602 | W1-01 | 6e6eddf3fa326cc1d30182ac5a53a6031d4c6409 | f121cef13e5bb9f8d702eaf15ec87607ae64d7d4 | 2026-09-02T10:48:53Z |
| #609 | W1-02 | 5bff33bfe9d8c1f623867eeff61b277b19c127f6 | cf504cbf68a6956b199b9c8c8a5c2417b322586a | 2026-09-02T14:52:39Z |
| #611 | toolchain | d84f8cf7f9910bdec9b16e92127da33c00121d78 | 304f2da17f9e8dcc8779101f03bb5b9fc08eaf6b | 2026-09-02T20:09:17Z |

PR 611 produced the current `main` commit and activated Rust 1.98 with Kache.

## Journey infrastructure outside the unit graph

| Pull request | State | Branch | Head | Scope |
| --- | --- | --- | --- | --- |
| #619 | open | codex/e2e-concurrent-isolation | 93c800c9de09f43a8b0b145037ac989da7e6782f | Concurrent journey isolation infrastructure; separate from the canonical 52-unit product program. |

## Non-landing records

| Pull request | State | Disposition | Reason |
| --- | --- | --- | --- |
| #603 | open | never-merge | Historical transport record. W0-05 replaces it with repository-owned canonical documents. |
| #616 | closed | retired | The journey-runtime experiment is not a canonical unit and must not be revived. |

PR 616 stays closed. Its journey-runtime experiment is not part of the 52-unit program.
