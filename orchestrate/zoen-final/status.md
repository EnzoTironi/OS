# Zoen final program status

Generated from `program.json`, `frontier.json`, and `ledger.tsv`.

- Repository: `EnzoTironi/OS`
- Base: `main@13395c50f2c4aa458497f01bb2350f49883a37e4`
- Units: 52 total, 14 done, 4 active, 0 proof pending, 34 queued
- Canonical journeys: 8, J1 through J8
- Journey proof dimensions: actors, path, negative, replay, isolation, and recovery
- Final gates: 9, FIN-01 through FIN-09
- Products: Ontology, Eve, Better Auth
- Public verbs: Discover, Query, Propose, Decide, Commit, Explain, Execute
- WorldRelease catalogs: ontology, policy, executors, components
- Initial PR disposition digest: `sha256:6ffc3492284f65b32c62cd69f53d539cd538bd623a17a6bd3a20cd965eb48b38`

## Active and proof-pending units

| Unit | Status | Branch | Head or source | Pull request |
| --- | --- | --- | --- | --- |
| W2-05 | active | coder/w2-05-seven-verbs | not recorded | not open |
| W2-06 | active | coder/w2-06-sealed-cursors | not recorded | not open |
| W2-07 | active | coder/w2-07-budget-class | not recorded | not open |
| W2-08 | active | coder/w2-08-object-key | not recorded | not open |

## Merged pull requests

| Pull request | Unit | Head | Merge | Merged at | Verification |
| --- | --- | --- | --- | --- | --- |
| #602 | W1-01 | 6e6eddf3fa326cc1d30182ac5a53a6031d4c6409 | f121cef13e5bb9f8d702eaf15ec87607ae64d7d4 | 2026-09-02T10:48:53Z | live-ui-verified |
| #609 | W1-02 | 5bff33bfe9d8c1f623867eeff61b277b19c127f6 | cf504cbf68a6956b199b9c8c8a5c2417b322586a | 2026-09-02T14:52:39Z | journey-verified |
| #611 | toolchain | d84f8cf7f9910bdec9b16e92127da33c00121d78 | 304f2da17f9e8dcc8779101f03bb5b9fc08eaf6b | 2026-09-02T20:09:17Z | not applicable |
| #621 | W1-05 | c3e819c15e6aa4109a86a18d1b8e0915c208ceb9 | edc5d1d172f12299a0920aabbcaca8c78c5d525b | 2026-09-03T04:33:27Z | live-ui-verified |
| #619 | journey infrastructure | 3c0d26f1c0778c58ef32b5450258941bbb4d6191 | daba8615f5ed39c1d84f4cd64ac8d830999e16b6 | 2026-09-03T05:04:58Z | not applicable |
| #620 | W0-05 | 1cb0609561fcf00f9c5412a2dfb4cb28235c5c11 | d8843d7effe2822dc69568319a3e01c177648b89 | 2026-09-03T06:17:12Z | journey-verified |
| #622 | Better Auth device-flow repair | 4c45b95482e5b49a06b5cd05755495b6ff6aed9b | be24e0956e0bfb681634c796b5410afc5eef2e38 | 2026-09-03T06:42:21Z | not applicable |
| #618 | W1-04 | 4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3 | 4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3 | 2026-09-03T11:30:11Z | journey-verified |
| #625 | W1-03 | 6683cdcf47af02464a01aa021b34977f450da5d2 | 4e33c57151ec8e3e28ee4c43a894da63173febc0 | 2026-09-03T17:02:36Z | journey-verified |
| #672 | W1-06 | b7379dac92cee3e5824e1b80990f5d9d1cf60670 | 50370d2c9e54af767a4f7ec3d2428fec0e303035 | 2026-09-03T20:22:07Z | pending-ledger-row |
| #674 | W1-07 | ac604bfdb3ff6724efddf82a67acf158e9860eb2 | 0fcb200a69090ff8e4aebb54053914988926adaa | 2026-09-04T02:52:05Z | pending-ledger-row |
| #673 | W2-01 | 630dddd948d8f1a7b2da553d54fb3b4e7526fee1 | fce9bc524b8c54b388968a12e0b918ff2f5d6fe5 | 2026-09-03T22:30:02Z | journey-verified |
| #675 | W2-02 | 61b92229f4951d68e4871bf9a68ac5983deaffbb | 26de4966c0afbf9bf57a433776cf3f6dfdbf0a1d | 2026-09-04T01:37:18Z | journey-verified |
| #676 | W2-03 | e7cfb16ba00e594bfb4543ad59474c6233881571 | 5d6134d4b0d4d97c8f493ed0c22fcf8416887da5 | 2026-09-04T03:58:36Z | journey-verified |
| #678 | W2-04 | eb33b4162f061cdcee3858e164a9f834d54fd50d | 13395c50f2c4aa458497f01bb2350f49883a37e4 | 2026-09-04T05:04:46Z | journey-verified |

PR 611 activated Rust 1.98 with Kache. PR 620 completed W0-05. PR 621 completed W1-05 with its live two-account Telegram ceremony. PR 622 repaired Better Auth device flow without changing the W1-02 verdict. PR 625 completed W1-03. PR 618 completed W1-04 with journey proof on main@4dc06a4, which is the recorded current main. PR 619 landed the concurrent journey isolation barrier outside the 52-unit graph.

## Immutable journey-infrastructure audit evidence

This snapshot does not track the live PR or branch. It is evidence outside the 52-unit graph.

| Pull request | Record | State at audit | Branch at audit | Head at audit | Observed at | Provenance | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #619 | immutable-audit-evidence | open | codex/e2e-concurrent-isolation | 93c800c9de09f43a8b0b145037ac989da7e6782f | 2026-09-03T04:21:55Z | W0-05 authoritative task handoff; this record does not follow the live branch. | Concurrent journey isolation infrastructure; separate from the canonical 52-unit product program. |

## Initial pull request dispositions

This is the complete 20-PR intake set that W8-03 must resolve.

| Pull request | Classification | Disposition | Reason |
| --- | --- | --- | --- |
| #601 | Replace | Supersede after extracting the verified external-subject intent | It propagates channel identity, but uses a reversible machine admin token and races on Membership-scoped credential state. Rebuild under W3-02 and W3-03. |
| #600 | Drop | Close without restack after a replacement exists | It replaces Restate with Rivet, rewrites a migration baseline, adds unit-style tests, and conflicts with the product law. |
| #598 | Replace | Supersede with generic automation | It hardcodes `personal.createReminder`, `personal.dueAt`, and delivery semantics in the kernel. Replace in W6-01. |
| #597 | Keep and restack | Preserve the direct Connect transport idea, then rebuild IDs and authority context | Moving Eve away from CLI spawn is correct. Fixed IDs and the missing journey are not. Target W3-06 and W7-01. |
| #593 | Regenerate | Recreate in one npm lockfile cohort | Land with #521 and #523 only after application typecheck and the image build pass. |
| #533 | Coordinate | Recreate with #532 as one toolchain unit | Rust image version must match `rust-toolchain.toml`, CI, protobuf tooling, and the release image. |
| #532 | Coordinate | Recreate with #533 as one toolchain unit | Node image changes must match Auth, Eve, root build, native dependencies, and image proof. |
| #531 | Safe cohort | Rebase and verify with #519, #522, #525, and #526 | A leaf dependency update. It still needs the current journey and image gates. |
| #530 | Blocked pair | Replace together with #528 | `connectrpc` and `buffa` versions must move in one dependency graph. Individual heads have incompatible types. |
| #529 | Blocked pair | Replace together with #527 | `parquet` and `object_store` must use the versions selected by DataFusion and the projection worker. |
| #528 | Blocked pair | Replace together with #530 | The generated Connect boundary cannot carry two `buffa` versions. |
| #527 | Blocked pair | Replace together with #529 | The current update conflicts with the Parquet and DataFusion object-store graph. |
| #526 | Safe cohort | Rebase and verify with the safe dependency cohort | Restate remains the correct product dependency. Verify the production handler and restart journey. |
| #525 | Safe cohort | Rebase and verify with the safe dependency cohort | Action version change is mechanical, but the new image CI gate must prove it. |
| #524 | Defer | Recreate after W1-07 owns a real image build | Updating setup-buildx before CI builds the product image provides no product proof. |
| #523 | Regenerate | Recreate in the npm lockfile cohort | Type packages and Zod should share one regenerated lockfile and app typecheck. |
| #522 | Safe cohort | Rebase and verify with the safe dependency cohort | Action version change is mechanical, but all workflows must pass together. |
| #521 | Regenerate | Recreate in the npm lockfile cohort | Node types must match the chosen runtime versions and all TypeScript applications. |
| #520 | Defer | Recreate after W1-07 owns a real image build and push artifact | The change becomes useful only when CI proves the Docker artifact. |
| #519 | Safe cohort | Rebase and verify with the safe dependency cohort | Artifact download is mechanical, but must be checked against the final CI artifact layout. |

## Non-landing records

| Pull request | State | Disposition | Reason |
| --- | --- | --- | --- |
| #603 | open | never-merge | Historical transport record. W0-05 replaces it with repository-owned canonical documents. |
| #616 | closed | retired | The journey-runtime experiment is not a canonical unit and must not be revived. |

PR 616 stays closed. Its journey-runtime experiment is not part of the 52-unit program.
