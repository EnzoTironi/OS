# Industry standards corpus (issue 38)

- Artifact ID: `issue-0038-industry-standards-synthesis`
- Issue: https://github.com/EnzoTironi/OS/issues/38
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Track: corpus
- Research angle: What GS1 EPCIS, CBV, ISA-95 (IEC 62264), ISA-88 (IEC 61512), Apache Ossie, and nearby interchange standards reveal about events, identity, hierarchy, process, traceability, transformation, location, capability, and interoperability, and which of those findings must not become OS kernel forms.
- Decision states used: `hypothesis`, `supported`, `rejected`, `undetermined`
- Contract used: Agent output contract in `docs/swarm-research-backlog.md` at `dc918a5`. `docs/swarm-result-contract.md` is not on `origin/main`.
- Accessed: 2026-08-16
- Branch: `cursor/issue-38-corpus-cfd8`

This folder is Wave A evidence. It does not edit RFC-0001. It does not answer `docs/open-questions.md` except by pointing at a note or marking a question `undetermined`.

## Question

Which distinctions in public industry standards encode operational reality independently of one ERP schema, which of those distinctions pressure RFC-0001, and which are interchange machinery that OS must not treat as kernel meaning?

A later synthesis agent should be able to query this folder without rereading the specs.

## How to read this folder

| File | Contract sections |
| --- | --- |
| [sources.md](sources.md) | Sources |
| [evidence.md](evidence.md) | Evidence, source artifacts |
| [mappings.md](mappings.md) | Convergence, divergence, mappings into OS candidate forms |
| [do-not-import.md](do-not-import.md) | Interchange-oriented material that must not define OS semantics |
| [candidate-laws.md](candidate-laws.md) | Candidate laws, counterexamples, runtime pressure |
| [open-questions.md](open-questions.md) | Open questions, decision-state table |

Every evidence block is labeled as one of: domain evidence, source-system artifact, candidate law, counterexample, runtime consequence. Decision state is never silently accepted.

## Overview

GS1 EPCIS 2.0 is a visibility-event interchange language. A capturing application asserts what, when, where, why, and how about physical or digital objects. ISO/IEC 19987:2024 states the goal as sharing visibility event data so users gain a shared view of objects in a business context. That is a shared observation language, not an executable ontology.

ISA-95, also published as IEC 62264, is an enterprise-to-control integration standard. IEC 62264-1:2003 limits itself to interface content between Level 3 manufacturing operations and Level 4 business planning. The 2018 Part 5 preview lists personnel, equipment, physical asset, material, process segment, capability, definition, schedule, and performance models as exchange nouns. Those splits look like domain laws. The verb-and-noun transaction wrappers, B2MML schemas, and Purdue levels look like integration architecture.

Apache Ossie (incubating), formerly Open Semantic Interchange, is a YAML and JSON format for analytics semantic models. Datasets, metrics, dimensions, joins, SQL dialects, and `custom_extensions` move BI meaning between tools. That is a different "semantic" problem from operational identity, action, and event.

## Key concepts that survived first-party reading

1. An EPCIS event is an assertion about an occurrence, including the assertion that an expected observation failed. It is not an attempted intervention.
2. EPCIS `Action` (`ADD`, `OBSERVE`, `DELETE`) is a lifecycle flag on the event's entity. It is not RFC-0001 Action.
3. Transformation is many-to-many and may be incomplete. Any input may have contributed to every output. A shared `transformationID` widens that uncertainty across a series of events.
4. Aggregation is temporary physical containment. Association is a parent-child link that can outlast temporary children and can attach objects to locations.
5. Instance identity and class-plus-quantity identity are both first-class. Quantity may be unknown.
6. `eventTime` is when the capturing application says the occurrence happened. `recordTime` is when a repository stored the event.
7. Read point is where the observation happened. Business location is where the objects are expected to be afterward.
8. ISA-95 separates capability, definition, schedule, and performance, and later parts separate role-based equipment from physical asset.
9. ISA-88 separates recipe from equipment capability, and general or site recipes from master or control recipes.
10. Ossie standardizes metric portability. It does not standardize operational occurrence.

## Where the standards live relative to OS

| Standard family | Lives at | OS use |
| --- | --- | --- |
| GS1 EPCIS and CBV | Cross-enterprise visibility messages | Mine event, identity, location, and correction distinctions. Do not adopt the schema. |
| ISA-95 and IEC 62264 | Level 3 to Level 4 integration | Mine resource, capability, plan, and actual distinctions. Do not adopt Purdue layers or B2MML. |
| ISA-88 and IEC 61512 | Batch recipe and equipment control | Mine recipe versus capability versus execution. Do not adopt SFC presentation. |
| Apache Ossie | Analytics and BI semantic-model exchange | Evidence that "semantic model" is overloaded. Do not import metrics YAML. |
| UNTP Digital Traceability Events | Profile over EPCIS | Shows Make, Move, Modify collapsing onto EPCIS types. Interchange profile, not kernel. |
| OAGIS | Verb and noun business-object documents | Cited by ISA-95 Part 5 as a related transaction pattern. Interchange. |

## Gotchas

- The word Action appears in EPCIS and in RFC-0001 with incompatible meanings.
- The word Event in EPCIS includes failed observations and error declarations. It is not "something that happened in the world" without further qualification.
- ISA-95 Level 3 versus Level 4 is a system-boundary story. Treating MES and ERP as ontological kinds would freeze a 1990s integration cut into the kernel.
- CBV `commissioning` names identifier birth and also covers catching, harvesting, and slaughtering. The vocabulary collapses identity assignment and production.
- Transformation contribution is intentionally lossy. A recall query that needs exact input-to-output fractions will not get them from a conforming TransformationEvent.

## Decision snapshot

| Claim | State |
| --- | --- |
| Visibility events are observations or assertions, not OS Actions | `supported` |
| EPCIS `Action` must not be imported as RFC-0001 Action | `rejected` as import |
| Instance identity is distinct from class-plus-quantity | `supported` |
| Transformation contribution may be many-to-many and uncertain | `supported` |
| Aggregation is distinct from association | `supported` |
| Occurrence time is distinct from repository record time | `supported` |
| Capability, definition, schedule, and performance are distinct | `supported` as domain split. `undetermined` as kernel forms |
| Role-based equipment is distinct from physical asset | `hypothesis` (2018 Part 5 names both; full Part 2 text not retrieved) |
| Purdue Levels 0 to 4 are OS kinds | `rejected` |
| Ossie semantic_model is an OS ontology | `rejected` |
| Whether Event is a primitive or an interface | `undetermined` |
| Whether RFC-0001 should change from this corpus alone | `undetermined`. Independent sources have not yet been synthesized. |

## Licensing

OS is MIT. This folder extracts concepts and published behavior from public standards pages and spec text fetched on 2026-08-16. No standard schema, XML, JSON-LD, YAML dialect, or converter was copied into the repo.
