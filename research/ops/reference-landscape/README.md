# Continuous literature and project watch

**Issue:** [#78](https://github.com/EnzoTironi/OS/issues/78)
**Track:** ops
**Watch date:** 2026-08-16
**Decision:** none. This folder is a dated watch, not a news digest and not a metamodel.

`docs/swarm-result-contract.md` is not on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. This folder follows the Agent output contract in `docs/swarm-research-backlog.md`.

## Question

Which current papers, standards, open-source projects, or major platform releases introduce a model OS has not considered, give production evidence against an OS hypothesis, solve a hard runtime problem substantially better, create a credible do-not-build alternative, or change a standard that research already depends on?

The 2026-08-15 note `research/reference-landscape.md` already names Palantir, Open Foundry, Ontologiq, ObjectStack, OpenBKN, Xpert, Moqui, REA and ValueFlows, ERPNext, Odoo, UFO, PROV-O, EPCIS, ISA-95, FIBO, and XTDB. Sibling Wave A folders already opened Temporal, Cedar, OpenFGA, TigerBeetle, IFRS, FHIR, CMMN, LegalRuleML, ODRL, and ISA-88. Repeating those names is not a watch finding.

## How to read this folder

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs, specs, and sibling locators opened this session |
| `evidence.md` | reference | Kept items as labeled cards |
| `candidate-laws.md` | explanation | Smallest claims the watch can state |
| `discarded.md` | reference | Items opened and dropped, with the keep-bar reason |
| `discovery.md` | explanation | Parked candidate discovery. No GitHub issue was filed |
| `open-questions.md` | explanation | Unresolved questions. Answers stay undetermined unless a card cites evidence |

Every card names a **kind** and a **decision state**.

Kinds used here:

- domain evidence
- source artifact
- candidate law
- counterexample
- runtime consequence

Decision states used here:

- hypothesis
- supported
- rejected
- undetermined

Nothing in this folder is silently accepted. RFC-0001 was not edited. `docs/open-questions.md` was not answered.

## Keep bar

An item stays only if at least one of these is true after a first-party fetch:

1. It introduces a primitive or model the 2026-08-15 note and the opened sibling folders do not already treat.
2. It gives production evidence against an OS hypothesis.
3. It solves a hard runtime problem substantially better than the mechanisms already named.
4. It is a credible do-not-build alternative for some part of OS.
5. It changes an external standard that research already uses or must now use.

Marketing feature lists fail the bar. A rename of Objects, Links, and Actions fails the bar.

## What this watch did not do

- It did not rewrite `research/reference-landscape.md`.
- It did not file GitHub issues.
- It did not comment on #78.
- It did not copy sibling Wave A folders. Those notes were opened with `git show` and are cited by branch, SHA, and path.
- It did not mine copyleft implementations. Notes extract published concepts and behavior only.
- It did not pick a store, a policy engine, or a workflow runtime.

## Relation to nearby issues

[#36](https://github.com/EnzoTironi/OS/issues/36) already owns inspectable operational-ontology runtimes. This watch does not re-audit Open Foundry, Ontologiq, or ObjectStack.

[#38](https://github.com/EnzoTironi/OS/issues/38) already owns GS1 EPCIS and ISA-95. IOF is parked for that corpus, not substituted for it.

[#61](https://github.com/EnzoTironi/OS/issues/61) already ranked Temporal, Cedar, OpenFGA, XTDB, and TigerBeetle as workers, not cores. This watch does not re-rank them.

[#68](https://github.com/EnzoTironi/OS/issues/68) already refused Palantir, Open Foundry, Ontologiq, ObjectStack, Moqui, and ERPNext as a replace-OS core.

[#73](https://github.com/EnzoTironi/OS/issues/73) already parked IFRS, FHIR, CMMN, LegalRuleML, and ODRL as unknown-unknowns. Those are not new this week.

## Licensing

OS is MIT. OpenID, W3C, IEEE-adjacent process-mining specs, OAGi IOF, SAP, Workday, and Linux Foundation texts were read as public conceptual evidence. Do not paste or translate schemas, OWL, or product code into the MIT core.
