# Sources

**Kind.** source list  
**Fetched.** 2026-08-16  
**Decision.** none

Primary locators for pass 1. Sibling folders were read with `git show` only. They were not copied.

## This repository on origin/main

SHA `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.

| ID | Path | What was used |
| --- | --- | --- |
| S-THESIS | `docs/thesis.md` | engine rule at L159, domain diagram at L142-L157 |
| S-CONST | `docs/constitution.md` | §6 mechanism split, §12 company branch, §8 requested versus happened, §9 unknown |
| S-OQ | `docs/open-questions.md` | questions 3, 5, 7, 9, 15, 16, 21. Not answered |
| S-PROG | `docs/research-program.md` | evidence loop, exit criteria |
| S-BACKLOG | `docs/swarm-research-backlog.md` | Wave A output contract, issue 83 row |
| S-HIST | `docs/hypothesis-history.md` | H2 kernels and the weakening |
| S-RFC | `rfcs/0001-metamodel-hypothesis.md` | excluded Pack, Compiler, Deterministic Kernel. Target 12 |
| S-SCEN | `scenarios/README.md` | S-001 dates, S-003 stale approval, S-005 roles, S-010 cancel |
| S-RREADME | `research/README.md` | evidence note quality bar |
| S-ISSUE | https://github.com/EnzoTironi/OS/issues/83 | issue body, created 2026-08-15. No comments |

`docs/swarm-result-contract.md` is absent on this SHA. A draft lives only on `origin/cursor/swarm-result-contract-cfd8` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9`. That file was read. It was not copied into this tree.

## Sibling research, git show only

| ID | Branch | SHA | Path used |
| --- | --- | --- | --- |
| SIB-30 | `origin/cursor/issue-30-domain-cfd8` | `f29429685adc04f4e8b3787618ad2edce77f549b` | `research/domain/fiscal/README.md`, `candidate-laws.md`, `sources.md` |
| SIB-55 | `origin/cursor/issue-55-kill-cfd8` | `5f4233579cf3057783775126afa64c39ed631353` | `research/kill/unified-ontology/README.md`, `candidate-laws.md`, `attacks.md` |
| SIB-58 | `origin/cursor/issue-58-kill-cfd8` | `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef` | `research/kill/specialized-kernels/README.md`, `boundary.md`, `candidate-laws.md`, `evidence.md`, `sources.md` |
| SIB-61 | `origin/cursor/issue-61-kill-cfd8` | `d22e3a24b62483ce5274019db0aa9d3aba268d18` | `research/kill/build-vs-reuse/README.md` |
| SIB-72 | `origin/cursor/issue-72-kill-cfd8` | `190e4b9ac4aa97422df91a8579ab0e6b33539d34` | `research/kill/semantic-duplication/README.md`, `candidate-laws.md` |
| SIB-79 | `origin/cursor/issue-79-ops-cfd8` | `e6c8593c72a097695a1b3e0836356916e98ebd3b` | `research/ops/cross-industry/README.md`, `candidate-laws.md` |
| SIB-03 | `origin/cursor/issue-3-foundation-cfd8` | `8b9ce1ee5e5a09e556f5442de826e6062c55abfa` | `research/identity-kinds-roles/candidate-laws.md` |
| SIB-08 | `origin/cursor/issue-8-foundation-cfd8` | `d064a310579ac8bc78d744e089c7eb5076dfd585` | `research/foundation/logic/README.md`, `enforcement-loci.md`, `candidate-laws.md` |
| SIB-32 | `origin/cursor/issue-32-corpus-cfd8` | `d91c62dd9ee94a0639c2eba3b789b10c3d6c5715` | `research/erpnext/invariants.md` |
| SIB-36 | `origin/cursor/issue-36-corpus-cfd8` | `0d83a5f72b97e754db12f67441ca9bf01e1a6211` | `research/operational-runtimes/steal-improve-reject.md` |
| SIB-69 | `origin/cursor/issue-69-ops-cfd8` | `8d20528db606dc7702c2b74da4f11d224ee2768f` | tree listing only |

Useful remotes named in the brief and present: issue 30, 55, 58, 61, 72, 79. All were fetched and read.

## External pages cited only through siblings

This pass did not re-fetch these pages. Quote the sibling evidence card if you need the claim.

| Page | Sibling card |
| --- | --- |
| Palantir, The Ontology system, https://palantir.com/docs/foundry/architecture-center/ontology-system/ | SIB-58 E-005, retrieved there 2026-08-16 |
| Palantir, Functions overview, https://palantir.com/docs/foundry/functions/overview/ | SIB-58 S-PL-02 |
| Ajuste SINIEF 07/05, https://www.confaz.fazenda.gov.br/legislacao/ajustes/2005/AJ007_05 | SIB-30 S-AJ00705 |
| Lei Complementar nº 214/2025, https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm | SIB-30 S-LC214 |
| Código Tributário Nacional arts. 113 to 118 | SIB-30 S-CTN |
| IAS 2 paragraphs 25 and 27 | SIB-58 E-007 |

## Commands that rebuild the tree claim

```text
git fetch origin main
git ls-tree -r --name-only origin/main
git ls-tree -r --name-only HEAD -- research/ops/leakage-audit
```
