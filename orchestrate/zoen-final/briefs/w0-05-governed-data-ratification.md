# W0-05 governed-data ratification

## Outcome

Commit the governed-data extension as an approved addition to the Zoen architecture. Preserve its research record, make each decision testable, and revise the program from 44 to 52 units.

## Required decisions

1. Separate `WorldRelease` content from publication metadata. Derive `ReleaseDigest` from domain-tagged RFC 8785 JCS bytes and keep the fields private.
2. Separate `DatasetVersion` content from acceptance metadata.
3. Persist each `ResolutionDecision` by digest without treating it as authority or a `CommitReceipt`.
4. Use one transactional World owner ceremony, refuse repeat state, remove the capability on commit, and create no superuser or later bypass.
5. Authorize discovery and scan planning before storage work. Return non-disclosing denials.
6. Require valid `TypeAssignment` evidence for both typed-link endpoints over the link interval.
7. Treat standards as informative. Keep OpenBB work clean-room, authorize no AGPL code reuse in W0-05, and require the separate `LIC-01` disposition before any later reuse.

## Program change

Add W0-05 and seven implementation units to the original 44-unit graph. Do not add the PR 616 journey runtime. The resulting graph has 52 units and covers J1 through J8 plus FIN-01 through FIN-09.

## Acceptance

- The spec has ratified status and no unresolved validation questions.
- The research copy retains source pins and hashes.
- The HTML architecture view matches the ratified contracts.
- Program parsers prove 52 units, eight canonical journeys, nine final gates, known dependencies, and an acyclic graph.
- The repository has no PR Cockpit skill, app, or instruction block. The program records the `gh`-only rule without claiming a deletion that did not occur.
- The change contains documentation and program records only. It does not deploy or revive PR 616.
