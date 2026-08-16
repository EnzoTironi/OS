# Capability and enforcement matrix

**Status:** partial audit, 2026-08-15.  
**Kind:** source-system artifact plus classification.  
**Decision:** none.

Cells are enforcement classes, not feature scores. License and maturity sit in their own columns so a young Apache project can outrank a marketed AGPL platform on a single semantic question.

Class values: `implemented`, `partial`, `declared-only`, `absent`, `undetermined`.

A thin cited row beats a guessed complete one. Empty-looking cells on later projects mean the session stopped, not that the capability is absent in nature.

## Grid

| Project | Object, link, type | Actions and mutation gates | Approvals and stale revalidation | Policy and security | Temporal and history | External effects and unknown | Agent and tool generation | UI and app generation | Ontology evolution | Source federation and CDC | Audit and provenance | License | Maturity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open Foundry (syzygyhack) | implemented. ODL object, link, action, permission in one schema | implemented. YAML actions, CEL preconditions, transactional local effects | absent in the inspected executor. no proposal object, no re-read after a later approval | implemented. OpenFGA check plus optional consent before effects | partial. README claims version history and temporal queries. not traced this session | partial. webhooks after commit. retries. `ROLLBACK_ALL` compensates local state. no `unknown` outcome | partial. tool registry package exists. not traced past file names | partial. GraphQL and REST generated from schema | partial. versioned schema registry and SAFE or BREAKING class claimed in README | declared-only for this session. README names Debezium CDC. connector code not opened | partial. audit writer after commit. audit failure does not fail the action | Apache-2.0 | active public platform |
| Open Foundry (u485349) | implemented. object, link, action type models and handlers | partial. execute updates, links, deletes, webhooks. `confirmation_required` stored, not checked | absent | partial. `permission_key` on the type. no policy re-check in `execute_action` | undetermined | partial. webhook and function invoke. HTTP error is failure. no `unknown` | absent in inspected handlers | partial. Svelte ontology UI | undetermined | undetermined. `domain/sync.rs` exists, not read | undetermined. separate audit service exists, not read | LICENSE file is empty | early |
| Open Foundry (Przyval) | partial. Palantir-shaped object, link, action types for an emulator | partial. apply runs a registered handler after param validation | absent | partial. `requirePermission("actions:execute")` middleware | absent. in-memory, re-seeds | absent. handler success or 500 | declared-only. AIP chat is a mock LLM | partial. Vite console | absent | absent | partial. action execution log | Apache-2.0 | emulator |
| Open Foundry (Shadowfax) | absent. no object-link-action engine in the tree | absent | absent | undetermined | undetermined | undetermined | partial. agent tool modules | undetermined | absent | absent | undetermined | Apache-2.0 | not the named ontology platform |
| Ontologiq | implemented. object, identity, properties, computed state, relations | implemented. propose is the only agent path. warehouse stays read-only | implemented. human approve in another process. hashed args. live precondition and ABAC re-check | implemented. roles, OIDC ABAC, fail-closed missing claims, no approve tool on MCP | absent in runtime. state is live SQL. history is deferred on the roadmap | implemented. `executed`, `effect_failed`, `unknown`. no retry after bytes leave | implemented. MCP tools compiled from YAML | partial. localhost workbench. not a generated ERP UI | partial. ontology digest pinned. approve across digest change is refused | absent as multi-source truth. one table per object | implemented. append-only SQLite audit. intent before effect | Apache-2.0 | alpha |
| ObjectStack | implemented. metadata objects, fields, actions, flows | implemented. named actions. REST and MCP share a dispatcher | partial. flow approval nodes. live field re-read at node entry. no Ontologiq-style argument digest on script actions | implemented and leaky. invoke-time permissions. `script` bodies trusted. `isSystem` elevates 80 sites | partial. history and temporal filter docs exist. not traced to storage | undetermined for webhook unknown. flow `runAs` is the documented risk | implemented. `list_actions` and `run_action`. `ai.exposed` opt-in | implemented. schema-driven UI is the product | partial. metadata commits and rollback ADRs exist | partial. ADR-0015 names external datasource federation. not opened | partial. audit service docs. `isSystem` can skip provenance stamping | Apache-2.0 | active product |
| OpenBKN | partial. Markdown `object_type` and `action_type` examples. relation types exist | partial. action types bind tools and impact contracts. executor factory declared | declared-only. README says approvable loop. no propose-revalidate path opened | partial. `CheckPermission` HTTP call to `/operation-check`. BKN Safe is a licensed module | undetermined | declared-only. README names simulation and risk types. example `restart_pod.bkn` has no unknown outcome | partial. SDK, CLI, MCP, Skills declared. not traced | absent in this repo. Studio is a separate frontend | undetermined | partial. VEGA data virtualization declared. not traced | partial. operation audit packages exist. evidence chain declared | mixed. Apache-2.0 plus OpenBKN extra conditions | active. reuse blocked for MIT core |
| Xpert / UOSE | declared-only in the main repo this session. docs define entity, relation, attribute, affordance, policy | declared-only for UOSE `simulateAction`. platform has workflow nodes | declared-only for UOSE. platform README names approval steps | declared-only for UOSE fail-closed. platform has RBAC | undetermined | declared-only. docs separate semantic layer from adapter execution | implemented at platform level. tools, MCP, Skills | implemented. workbenches and ChatKit | declared-only. ontology snapshots named in architecture docs | declared-only. adapters for SAP, semantic models, DBs | declared-only for UOSE audit evidence. platform has logs | AGPL-3.0 CE | mature agent platform. UOSE implementation undetermined |
| Arkhe | implemented as language. YAML entities, keys, properties, actions | implemented as contracts. guards, authority, audit obligation in IR | declared-only. IR carries approval escalation. no execute path | declared-only. emits to Cedar. does not evaluate policy | absent. no store | declared-only. effects are IR fields | implemented. tool-contract IR. emitters are serialization | absent | partial. content hashes in IR. git is the authority | absent | declared-only. audit is an obligation on the contract | Apache-2.0 | early compiler |
| open-ontologies | implemented as OWL and RDF types, not business objects | partial. `ActionSchema` and `onto_action_apply` are situation-calculus ticks on triples | absent as business approval | partial. `onto_policy_check` composes with certify | partial. versioning claimed | partial. non-deterministic outcomes with a seed. not an HTTP unknown | implemented. 70-plus MCP tools | partial. desktop Studio | implemented as ontology versioning and SHACL co-evolve tools | absent as CDC | partial. lineage viewer claimed | MIT | active KG engine |
| OpenCrab | partial. nine MetaOntology spaces including concept, claim, evidence, policy | partial. action YAML schemas. unregistered actions still validate | partial. three-state queue. no live revalidation on resolve | partial. ReBAC check tool. policy is a space name | absent | undetermined | implemented. MCP ontology tools | partial. local Next demo. SaaS UI not in repo | partial. promotion lifecycle and pack export | absent as CDC. crawl ingestion is not CDC | partial. evidence hashes and promotion receipts | README says MIT. no LICENSE file | local factory. SaaS closed |
| operational-ontology (gura105) | implemented. object types, link types, action types as data | implemented. `execute` is the only write door | absent | partial. visibility predicate. in-process callers can bypass the store | partial. snapshot overlay. no bitemporal query API | partial. write-back first. `WRITEBACK_FAILED` and `COMMIT_FAILED`. crash between them loses the audit | implemented. MCP tools from the schema | absent | partial. load refuses overlay keys the model no longer owns | partial. `load()` re-index from source. not CDC | implemented. every attempt audited, with a stated crash hole | MIT | readable reference, not a product |

## How to read a column

**Object, link, type.** Did the code distinguish typed identifiable things from typed relations, or only store documents?

**Actions and mutation gates.** Can a caller mutate business state without a named action?

**Approvals and stale revalidation.** Is there a durable proposal, and does commit re-read the world?

**Policy and security.** Is the check fail-closed, and does it still hold inside the effect?

**Temporal and history.** Can the system answer valid-then versus known-then, or only current rows?

**External effects and unknown.** After a timeout, does the model keep `unknown`?

**Agent and tool generation.** Are tools compiled from the same action definitions humans use?

**UI and app generation.** Are screens compiled from the same definitions, or is the UI a second authority?

**Ontology evolution.** Are historical decisions pinned to a digest or revision?

**Source federation and CDC.** Is there more than one live source, and is change captured as facts?

**Audit and provenance.** Is the attempt recorded before the effect, and can derivation change authority?

## Column-level verdict

| Column | Strongest inspected implementation | Common failure |
| --- | --- | --- |
| Object, link, type | Open Foundry (syzygyhack), Ontologiq, ObjectStack | name-only schemas with no identity uniqueness check |
| Actions and mutation gates | Ontologiq, gura105, Open Foundry (syzygyhack) | CRUD plus a decorative action catalog |
| Approvals and stale revalidation | Ontologiq | approve-and-hope, or a flag that is never read |
| Policy and security | Ontologiq for fail-closed claims. ObjectStack for documenting the leak | invoke-time gate with a trusted body |
| Temporal and history | none traced to a bitemporal store this session | live computed state, or current-row updates |
| External effects and unknown | Ontologiq | commit-then-webhook, retry after possible success |
| Agent and tool generation | Ontologiq, ObjectStack, Arkhe IR | generated tools over a different permission story |
| UI and app generation | ObjectStack | UI as a second workflow language |
| Ontology evolution | Ontologiq digest pin. Arkhe content hashes | unversioned YAML |
| Source federation and CDC | undetermined. README claims only | single warehouse view, or marketing CDC |
| Audit and provenance | Ontologiq intent-before-effect. gura105 every-attempt | post-commit audit that can be lost |
