# Sources

**Status:** session inventory, 2026-08-15.  
**Kind:** source-system artifact.  
**Decision:** none.

Only first-party pages and repository files fetched this session are listed. A name that could not be resolved to inspectable code is recorded with the search that failed.

## Search commands actually run

```text
gh search repos "open foundry ontology"
gh search repos "openfoundry"
gh search repos "ontologiq"
gh search repos "objectstack"
gh search repos "openbkn"
gh search repos "xpert uose"
gh search repos "data xpert"
gh search repos "arkhe ontology"
gh search repos "open-ontologies"
gh search repos "opencrab"
gh search repos "xpert-ai"
gh search repos "UOSE"
gh search repos "arkhe"
gh search repos "ontology-db"
gh search repos "open ontology"
gh search repos "ontologyruntime"
gh search code "UOSE" --repo xpert-ai/xpert
```

Web searches also used the phrases "Open Foundry Palantir ontology", "Arkhe operational ontology", and "Xpert UOSE ontology".

## Named projects

| Project as named in issue 36 | Inspected repo | HEAD this session | License as reported | Maturity from first-party text |
| --- | --- | --- | --- | --- |
| Open Foundry | [syzygyhack/open-foundry](https://github.com/syzygyhack/open-foundry) | `f29bcb9ed819` 2026-08-08 | Apache-2.0 | public platform with domain packs. not claimed production-complete |
| Open Foundry (name collision) | [u485349-coder/OpenFoundry](https://github.com/u485349-coder/OpenFoundry) | `37cf492b2cc8` 2026-04-23 | LICENSE file is 0 bytes | early Rust services. empty license file |
| Open Foundry (name collision) | [Przyval/openfoundry](https://github.com/Przyval/openfoundry) | `580410bb35d5` 2026-03-26 | Apache-2.0 | local Foundry API emulator. in-memory store |
| Open Foundry (name collision) | [Shadowfax-Data/OpenFoundry](https://github.com/Shadowfax-Data/OpenFoundry) | `c6a580773dc3` 2025-08-12 | Apache-2.0 | agent and notebook tools. not an object-link-action runtime |
| Ontologiq | [ontologiq/ontologiq](https://github.com/ontologiq/ontologiq) | `5a087250f5ee` 2026-08-07 | Apache-2.0 | alpha. one-person project. DuckDB proven |
| ObjectStack | [objectstack-ai/objectstack](https://github.com/objectstack-ai/objectstack) | `716ac9bf8f74` 2026-08-15 | Apache-2.0 | active product. large metadata runtime |
| OpenBKN | [openbkn-ai/bkn-foundry](https://github.com/openbkn-ai/bkn-foundry) | `ebec618d2108` 2026-08-15 | multi-license. Apache-2.0 upstream plus OpenBKN additional conditions | active. 207 stars. backend-only |
| Xpert / UOSE | [xpert-ai/xpert](https://github.com/xpert-ai/xpert) | `8980047c48ce` 2026-08-11 | AGPL-3.0 Community Edition | mature agent and workflow platform |
| Xpert / UOSE docs | [xpert-ai/docs](https://github.com/xpert-ai/docs) | `2f38fe1ad46a` 2026-08-15 | MIT docs repo | product documentation |
| Arkhe | [arkhelang/arkhelang](https://github.com/arkhelang/arkhelang) | `aed2eaa8645b` 2026-07-23 | Apache-2.0 | early language and compiler. not a runtime |
| open-ontologies | [fabio-rovai/open-ontologies](https://github.com/fabio-rovai/open-ontologies) | `26a7572c9479` 2026-08-15 | MIT | RDF and OWL MCP engine. 415 stars |
| OpenCrab | [AlexAI-MCP/OpenCrab](https://github.com/AlexAI-MCP/OpenCrab) | `d34352cec9d9` 2026-06-03 | README says MIT. no LICENSE file in the tree | local ontology factory. hosted SaaS is not in this repo |

## Discovered during execution

| Project | Repo or site | Why it was opened | Inspection depth |
| --- | --- | --- | --- |
| operational-ontology reference | [gura105/operational-ontology](https://github.com/gura105/operational-ontology) `c79aa88c1f5d` 2026-08-01 | MIT reference implementation of the Palantir pattern. write-back-first | code read |
| Open Ontology / Ontology Runtime | [ontologyruntime.com](https://ontologyruntime.com/) and [open-ontology.com](https://open-ontology.com/) | Arkhe README names "Open Ontology (ontology-db)" | marketing and docs pages only. no confirmed public Git tree this session |
| foundry-ontology-open | [cloudbadal007/foundry-ontology-open](https://github.com/cloudbadal007/foundry-ontology-open) | search hit for open Foundry ontology | undetermined. not opened |
| dataelement/OpenOntology | [dataelement/OpenOntology](https://github.com/dataelement/OpenOntology) | search hit "Open-Source Palantir Ontology" | empty Git repository. HTTP 409 on tree |
| ekyx/OpenFoundry | [ekyx/OpenFoundry](https://github.com/ekyx/OpenFoundry) | AGPL Foundry-alternative README | 0 stars. not opened beyond metadata |
| opensourcepalantir/openfoundry | [opensourcepalantir/openfoundry](https://github.com/opensourcepalantir/openfoundry) | name match | empty default branch |
| vynazevedo/ARKHE | [vynazevedo/ARKHE](https://github.com/vynazevedo/ARKHE) | name match | architecture portal, not an operational ontology. not scored |

## Files read for enforcement

### syzygyhack/open-foundry

- `README.md`
- `packages/actions/src/executor/action-executor.ts`
- `packages/actions/src/sideeffects/side-effect-executor.ts`
- `domain-packs/supply-chain/actions/ship-order.yaml`

### ontologiq/ontologiq

- `README.md`
- `docs/concepts.md`
- `docs/security.md`
- `packages/core/src/ontologiq/schema/action.py`
- `packages/core/src/ontologiq/serve/actions.py`
- `packages/core/src/ontologiq/serve/effects.py`

### u485349-coder/OpenFoundry

- `services/ontology-service/src/models/action_type.rs`
- `services/ontology-service/src/handlers/actions.rs`
- `LICENSE` (size 0)

### Przyval/openfoundry

- `README.md`
- `services/svc-actions/src/routes/v2/actions.ts`

### objectstack-ai/objectstack

- `content/docs/automation/approvals.mdx`
- `content/docs/ai/actions-as-tools.mdx`
- `content/docs/permissions/system-context.mdx`

### openbkn-ai/bkn-foundry

- `README.md`
- `LICENSE`
- `LICENSE-OPENBKN.txt`
- `adp/bkn/bkn-backend/server/bkn-specification/examples/k8s-network/action_types/restart_pod.bkn`
- `adp/bkn/bkn-backend/server/drivenadapters/permission/permission_access.go`

### xpert-ai

- `xpert-ai/xpert/README.md`
- `xpert-ai/docs/en/data/overview/uose-theory.mdx`
- `docs.xpertai.cn/en/data/overview/uose-theory` timed out. GitHub raw copy was used.

### arkhelang/arkhelang

- `README.md`
- `docs/adr/0003-tool-contract-ir-protocols-are-emitters.md`

### fabio-rovai/open-ontologies

- `README.md`

### AlexAI-MCP/OpenCrab

- `README.md`
- `opencrab/execution/approvals.py`
- `opencrab/execution/action_registry.py`

### gura105/operational-ontology

- `IMPLEMENTATION.md`
- `src/core.ts`

## Searches that stayed undetermined

| Target | What was tried | Result |
| --- | --- | --- |
| Arkhe as a business runtime | `gh search repos "arkhe ontology"` and `gh search repos "arkhe"` | The matching operational project is `arkhelang/arkhelang`, a compiler. Other Arkhe repos are unrelated |
| UOSE implementation in `xpert-ai/xpert` | `gh search code "UOSE" --repo xpert-ai/xpert` | hits were test fixture type names such as `uose.mdx.metric_snapshot`. No `simulateAction` function was reached before rate limit |
| Open Ontology Lisp runtime | `gh search repos "ontology-db"`, `ontologyruntime`, `open ontology` | product sites exist. no confirmed public source tree was opened |
| OpenCrab hosted SaaS | README states the SaaS is not in the public repo | hosted mutation, marketplace, and MCP behavior remain undetermined |
| `docs/swarm-result-contract.md` | standing order 19 | file is not on `origin/main`. this folder follows the Wave A contract in `docs/swarm-research-backlog.md` |
