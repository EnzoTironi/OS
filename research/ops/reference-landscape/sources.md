# Sources

**Kind:** source artifact
**Decision state:** supported for the fetch list. undetermined for unpaid or unopened full texts.

Fetched or opened on 2026-08-16 unless a source carries its own date.

## In-repo context

Read at `dc918a50e550d384d1e18a6f24424e6ed4595b9c` on `origin/main`:

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/open-questions.md`
- `docs/research-program.md`
- `docs/swarm-research-backlog.md`
- `rfcs/0001-metamodel-hypothesis.md`
- `scenarios/README.md`
- `research/README.md`
- `research/reference-landscape.md`

`docs/swarm-result-contract.md` is absent on that commit.

Issue text: <https://github.com/EnzoTironi/OS/issues/78>

## Sibling notes, git show only

Cite these paths. This folder is not a reprint.

| ID | Branch @ SHA | Path | Why it was opened |
| --- | --- | --- | --- |
| SIB-36 | `origin/cursor/issue-36-corpus-cfd8` @ `0d83a5f72b97e754db12f67441ca9bf01e1a6211` | `research/operational-runtimes/README.md`, `steal-improve-reject.md`, `sources.md` | Already-inspected runtimes and the MCP-as-surface refusal |
| SIB-37 | `origin/cursor/issue-37-corpus-cfd8` @ `8d9d798d1f93169090c44f6f4a66ad7a96642cfe` | `research/comparative/issue-0037-formal-ontology-synthesis.md` | UFO, REA, PROV-O, FIBO already treated |
| SIB-38 | `origin/cursor/issue-38-corpus-cfd8` @ `f49621af098d28ae6132ac9378d2371c90ee0a88` | `research/standards/README.md`, `sources.md` | EPCIS, ISA-95, ISA-88, Ossie already treated |
| SIB-55 | `origin/cursor/issue-55-kill-cfd8` @ `5f4233579cf3057783775126afa64c39ed631353` | `research/kill/unified-ontology/attacks.md` | Unified-ontology kill already running |
| SIB-61 | `origin/cursor/issue-61-kill-cfd8` @ `d22e3a24b62483ce5274019db0aa9d3aba268d18` | `research/kill/build-vs-reuse/alternatives.md`, `sources.md` | Temporal, Cedar, OpenFGA, XTDB, TigerBeetle already ranked |
| SIB-68 | `origin/cursor/issue-68-kill-cfd8` @ `10314410ed1fddc252360ac9abff04b1b4c16956` | `research/kill/existing-platform/replace-os-report.md`, `sources.md` | Replace-OS refusal already written |
| SIB-73 | `origin/cursor/issue-73-ops-cfd8` @ `9203bfce522cf9c93b64500dc2b04819c6963599` | `research/ops/unknown-unknowns/README.md`, `candidates.md`, `candidate-laws.md`, `sources.md` | IFRS, FHIR, CMMN, LegalRuleML already parked |

`cursor/issue-78-ops-cfd8` was absent on the remote before this branch was created.

## First-party fetches this session

| ID | Source | Retrieved | What was used |
| --- | --- | --- | --- |
| SRC-OCEL-20 | Berti et al. *OCEL (Object-Centric Event Log) 2.0 Specification*. 16 October 2023. https://www.ocel-standard.org/2.0/ocel20_specification.pdf and https://arxiv.org/abs/2403.01975 | 2026-08-16 | Metamodel. Events, objects, E2O, O2O, qualifiers, time-varying object attributes. Atomic events. XES IEEE 1849-2023 as the case-centric predecessor |
| SRC-OCEL-HOME | https://ocel-standard.org/ | 2026-08-16 | Public element list matching the 2.0 spec |
| SRC-OCEL-21-CSV | https://www.ocel-standard.org/specification/formats/csv/ | 2026-08-16 | OCEL 2.1 single-table CSV. Event rows, `o2o` rows, timed object-attribute rows |
| SRC-OCEL-21-OVER | https://www.ocel-standard.org/specification/overview/ | 2026-08-16 | States that the 2.1 revision adds compact CSV and bundled CSV or Parquet ZIP. No publication date on that page |
| SRC-AUTHZEN-VOTE | OpenID Foundation. *Authorization API 1.0 Final Specification Approved*. 12 January 2026. https://openid.net/authorization-api-1-0-final-specification-approved/ | 2026-08-16 | Final-spec vote. 81 approve, 1 object, 25 abstain |
| SRC-AUTHZEN-SPEC | OpenID AuthZEN. *Authorization API 1.0*. 11 January 2026. Status Final. https://openid.net/specs/authorization-api-1_0.html | 2026-08-16 | Subject, Action, Resource, Context, Decision. Boolean decision. Search APIs. Policy language out of scope |
| SRC-SAP-JOULE | SAP News Center. *How SAP Uniquely Delivers AI Agents with Joule*. 13 February 2025. https://news.sap.com/2025/02/joule-sap-uniquely-delivers-ai-agents/ | 2026-08-16 | Knowledge Graph as semantic bridge. Joule agents announced available in finance, service, and sales |
| SRC-SAP-KG | https://www.sap.com/products/artificial-intelligence/knowledge-graph.html | 2026-08-16 | Product page. Pre-populated graphs. Agents access SAP data to execute tasks. Grounding, not a write protocol |
| SRC-WD-ASOR | https://www.workday.com/en-us/artificial-intelligence/agent-system-of-record.html | 2026-08-16 | Agent lifecycle register, configure, activate, deactivate. Third-party agents via Agent Gateway |
| SRC-WD-GA | Workday blog. *The Workday Agent System of Record Is Now Generally Available*. https://blog.workday.com/en-us/managing-ai-powered-future-of-work.html | 2026-08-16 | GA claim. Acting on behalf of a user or as themselves. MCP and A2A named |
| SRC-WD-ADMIN | Workday admin guide. *Set Up Agent System of Record*. Last updated 2026-03-13. https://doc.workday.com/admin-guide/en-us/workday-ai/agents/agent-system-of-record/agent-management/set-up-agent-system-of-record.html | 2026-08-16 | Tenant setup. ASOR functional area and security domains exist in product docs |
| SRC-WD-API | https://doc.workday.com/admin-guide/en-us/workday-ai/agents/agent-system-of-record/external-agents/register-and-define-your-agent-through-an-api.html | 2026-08-16 | External agents register through `POST .../asor/v1/agentDefinition` |
| SRC-RDF12 | W3C. *RDF 1.2 Concepts and Abstract Data Model*. Candidate Recommendation Snapshot 07 April 2026. https://www.w3.org/TR/2026/CR-rdf12-concepts-20260407/ and https://www.w3.org/TR/rdf12-concepts/ | 2026-08-16 | Triple terms. `rdf:reifies`. Unasserted propositions. Full versus Basic conformance |
| SRC-IOF-README | https://raw.githubusercontent.com/iofoundry/ontology/Release_202602/README.md | 2026-08-16 | IOF Core released. BFO 2020 as top-level ontology. Supply chain and maintenance provisional |
| SRC-IOF-202602 | https://github.com/iofoundry/ontology/releases/tag/Release_202602 | 2026-08-16 | Published 2026-05-28. Allen-like constraints between plan specifications. Recipe process occurrence utilities. Material Trade Item |
| SRC-A2A-HOME | https://a2a-protocol.org/latest/ | 2026-08-16 | MCP is agent-to-tool. A2A is agent-to-agent. Explicit non-goals |
| SRC-A2A-LF | Linux Foundation. *A2A Protocol Surpasses 150 Organizations...*. 9 April 2026. https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year | 2026-08-16 | Claims v1.0 stable spec and production use. Press, not a protocol proof |

## Searches actually run

Web searches used the phrases "OCEL 2.0 object-centric event log standard 2025 2026", "OpenID AuthZEN 1.0 authorization standard 2025 2026", "Linux Foundation Agent2Agent A2A protocol specification 2026", "SAP Knowledge Graph Joule agents GA 2025 2026 operational ontology", "Workday Agent System of Record 2025 2026", "RDF 1.2 W3C recommendation quoted triples 2025 2026", "Industrial Ontologies Foundry IOF Core release 2025 2026", and "OCEL 2.1 revision date 2025 2026 compact CSV".

Git commands used to locate siblings are listed in the worker report, not here.

## Not opened

- OCEL 2.1 full specification PDF. The 2.1 date is therefore undetermined. Metamodel claims rest on SRC-OCEL-20
- A2A protobuf or JSON-RPC normative pages beyond SRC-A2A-HOME
- SAP Knowledge Graph runtime, CDS mappings, or write APIs
- Workday ASOR security-model source
- IOF Core OWL files. Concepts only
- BFO 2020 ISO 21838-2 full text
- Feldera, DBSP, Restate, DBOS, Celonis Process Intelligence Graph, Salesforce Agentforce internals
- LinkedIn or analyst recaps of SAP Sapphire 2026. Those are not first-party evidence
