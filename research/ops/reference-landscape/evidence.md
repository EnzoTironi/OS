# Evidence

Each card is one keep. Kind and decision state are required. Inference is labeled. Speculation is refused.

## EV-001. An event can bind many typed objects without a case id

- Kind: domain evidence
- Decision state: supported for the published metamodel. undetermined as an OS primitive
- Sources: SRC-OCEL-20, SRC-OCEL-HOME
- Keep reason: unconsidered model
- Pressures: RFC-0001 Event, `docs/open-questions.md` Q5 and Q14, `scenarios/README.md` S-002 and S-008

SRC-OCEL-20 says traditional process mining assumes each event refers to precisely one case. Real ERP, CRM, and MES stores are mostly one-to-many or many-to-many. Flattening those stores onto a case id produces misleading analysis and forces a new extract when the viewpoint changes.

OCEL 2.0 keeps events and objects as separate typed populations. An event has a timestamp and may have attributes. An event is atomic. It does not take time. An event relates to one or more objects through qualified event-to-object links. Two objects may relate through a qualified object-to-object link that does not require a shared event. Object attribute values may change over time.

The 16 October 2023 spec is older than this watch. It is still absent from `research/reference-landscape.md` and from the opened #37, #38, and #73 folders. Those folders treat UFO events, EPCIS visibility events, and CMMN cases. They do not treat a multi-object event log with qualified E2O and O2O and timed object attributes.

**Source artifact.** OCEL is an exchange format for process-mining tools. XML, JSON, and SQLite are storage bindings. They are not OS kernel forms.

**Inference, not fact.** A Ship event that names an order, a shipment, a lot, and a carrier as qualified participants is closer to S-002 and S-008 than a case-centric XES trace. That does not prove Event must become a native many-to-many relator.

**Counterexample needed.** Show that every multi-object occurrence in the first four research domains can be an Event plus ordinary Links, with no leftover qualifier or case-flattening failure.

## EV-002. OCEL 2.1 records timed object-attribute change as its own row kind

- Kind: source artifact
- Decision state: supported for the fetched format page. undetermined for the unpublished-to-this-session 2.1 PDF
- Sources: SRC-OCEL-21-CSV, SRC-OCEL-21-OVER
- Keep reason: unconsidered model, and a possible scenario-log format
- Pressures: Q6, Q7, S-007

The fetched 2.1 CSV page distinguishes four row types in one table. Event rows carry activity, timestamp, and object references. Rows with activity `o2o` record object-to-object links. Rows with only a timestamp record timed object-attribute assignments. JSON attributes on an event-to-object reference are timed assignments at the event timestamp.

That is a published split between occurrence, standing relation, and attribute change. RFC-0001 still treats property history as an open question. The format is not a bitemporal store. It has one timestamp column. It does not separate valid time from knowledge time.

**Runtime consequence if later adopted as a research log, not as a store.** Adversarial scenarios could be exchanged as `.ocel.csv` without inventing an OS schema. Wave B storage advice still waits.

## EV-003. Policy evaluation now has a Final OpenID PEP and PDP API

- Kind: source artifact
- Decision state: supported
- Sources: SRC-AUTHZEN-VOTE, SRC-AUTHZEN-SPEC
- Keep reason: changed external standard
- Pressures: Q9, Q11, constitution §15

OpenID membership approved Authorization API 1.0 as a Final Specification on 11 January 2026. A Final Specification is not subject to further revision of the 1.0 API. The vote is recorded in SRC-AUTHZEN-VOTE.

SRC-AUTHZEN-SPEC defines the information model as Subject, Action, Resource, Context, and Decision. Subject and Resource each require `type` and `id`. Action requires `name`. Context is an attribute bag for the environment. Decision requires a boolean `decision`. `true` permits the request. `false` denies it and MUST NOT be permitted to go forward. Optional response `context` may carry reasons, advice, or obligations. The semantics of that object are an implementation concern.

The spec says the policy language, architecture, and state management of a PDP are out of scope. Search endpoints list subjects, resources, or actions that would be allowed. Clients of those endpoints are still called PEPs.

SIB-61 already treats Cedar and OpenFGA as later workers. It does not name this API. The new fact is the interchange, not a new policy language.

**Candidate implication.** If OS Policy remains a Function to Bool, the invoke boundary can still speak AuthZEN. Search is then a second Policy use, not only deny-at-commit.

**Counterexample needed.** A duty that must be performed later, as in SIB-73 LAW-004, cannot be expressed as `decision: false` plus unstructured context without leftover meaning.

## EV-004. SAP ships a knowledge graph as grounding over existing ERP data

- Kind: domain evidence
- Decision state: supported that SAP publishes this architecture. undetermined as a do-not-build proof against greenfield OS
- Sources: SRC-SAP-JOULE, SRC-SAP-KG
- Keep reason: production evidence, and a credible incumbent alternative
- Pressures: thesis "primary artifact", Q1, Q21, SIB-61 alternative A6

SRC-SAP-JOULE, 13 February 2025, says SAP Knowledge Graph is the semantic bridge between Joule agents and SAP Business Data Cloud. It "reveals the connections between data and processes" so agents can find relevant data. The same article announces ready-to-use Joule agents in finance, service, and sales, and a cash-collection agent planned for first-quarter preview.

SRC-SAP-KG says the product comes with pre-populated knowledge graphs for SAP solutions, grounds Joule answers in customer data, lets agents access data in SAP solutions to execute tasks, and is managed by SAP so customers do less data-science work.

This is not an inspectable write protocol. The pages do not show propose, revalidate, unknown external effects, or competing observations. They show ontology as an index and grounding layer over existing ABAP and CDS estates.

SIB-61 already rejected "compose an operational ontology over ERPNext" as the greenfield architecture and kept it as an integration architecture. SAP is the production form of that integration architecture at incumbent scale.

**Inference, not fact.** Companies that already run SAP will buy grounding-plus-agents before they replace S/4 with an executable ontology. That does not answer Q21 for a greenfield OS.

**What this does not show.** It does not show that Action, Event, and Fact collapse. It does not show that SAP owns operational truth in the graph. The graph is described as context for agents that then act through existing applications.

## EV-005. Workday made Agent a system-of-record kind with a workforce lifecycle

- Kind: domain evidence
- Decision state: supported that the product exists in Workday docs. undetermined whether Agent must be an OS Kind
- Sources: SRC-WD-ASOR, SRC-WD-GA, SRC-WD-ADMIN, SRC-WD-API
- Keep reason: production evidence against "Agent is only a type implementing interfaces" if that reading erases lifecycle and as-versus-on-behalf-of
- Pressures: Q11, RFC-0001 "Agent is not a primitive", S-003

SRC-WD-ASOR names the lifecycle as register, configure, activate, and deactivate, "just like you'd manage your people." Third-party agents register through the Agent Gateway.

SRC-WD-GA says ASOR is generally available, is the single source of truth for Workday, customer, and partner agents, and records whether an agent is acting on behalf of a user or as themselves. It names MCP and A2A as supported protocols.

SRC-WD-ADMIN, last updated 2026-03-13, is a tenant setup procedure. The ASOR functional area and domains such as Agent Management Hub, Manage Agents, and Setup: Agents exist in the admin guide. SRC-WD-API registers external agents at `/asor/v1/agentDefinition`.

RFC-0001 currently refuses Agent as a base primitive and suggests `SoftwareAgent` implementing `Actor` and `Principal`. Workday is treating Agent as a workforce master with hire-like and terminate-like verbs. That is production pressure on Q11. It is not yet proof that the metamodel needs a thirteenth primitive.

**Source artifact.** Workday security groups, Marketplace, and Flex Credits are product mechanics.

**Counterexample needed.** Represent ASOR register, activate, deactivate, and as-versus-on-behalf-of as ordinary Actions on a `SoftwareAgent` object plus a Principal interface, with no leftover HR meaning.

## EV-006. RDF 1.2 can name a proposition without asserting it

- Kind: source artifact
- Decision state: supported for the Candidate Recommendation text. rejected as an OS store
- Sources: SRC-RDF12
- Keep reason: changed external standard relevant to Q3 and Q8
- Pressures: Q3, Q8, S-011, SIB-37 PROV-O notes

W3C published RDF 1.2 Concepts as a Candidate Recommendation Snapshot on 7 April 2026. It is not expected to become a Recommendation earlier than 5 May 2026. It is not a Recommendation yet.

The new term is a triple term. An RDF triple used as the object of another triple denotes a proposition. A reifying triple uses predicate `rdf:reifies` and a triple term as object. The subject of that triple is a reifier. The proposition need not be asserted in the graph. The spec's own example is Bob claiming that Alice's family name is "Liddell" without the graph asserting that family name. The same section says one can make statements about unasserted statements, including statements that contradict other statements.

`research/reference-landscape.md` already warns that RDF engines are not an operational ontology. That warning still holds. The watch fact is narrower. The web data model now has a native way to talk about a statement without accepting it.

SIB-37 already treats PROV-O derivation. PROV talks about entities and activities. It does not give a first-class unasserted proposition term.

**Runtime consequence.** If later research needs competing claims, the interchange form may be RDF 1.2 Full. Basic conformance forbids triple terms. Mixing Full and Basic graphs is a documented interop hazard. That is a toolchain fact, not a primitive.

## EV-007. IOF is a BFO industrial suite that #37 and #38 did not open

- Kind: source artifact
- Decision state: supported that the suite exists and released Core. undetermined whether any IOF class belongs in RFC-0001
- Sources: SRC-IOF-README, SRC-IOF-202602
- Keep reason: unconsidered formal tradition
- Pressures: Q14, SIB-37 UFO versus BFO, SIB-38 ISA-95

SRC-IOF-README states that IOF chose Basic Formal Ontology as its single top-level ontology. Core is Released. Supply Chain and Maintenance are Provisional. The mission is cross-system integration inside the factory, across trading partners, and across product life cycle.

SRC-IOF-202602, published 28 May 2026, adds utility properties that "can serve to assert Allen like constrains between 'plan specifications'", plus recipe process and recipe procedural occurrence classification utilities, plus Material Trade Item in Supply Chain.

SIB-37 synthesized UFO, REA, PROV-O, and FIBO. It did not open BFO or IOF. SIB-38 opened ISA-95 and ISA-88. Those are integration and recipe standards, not a BFO mid-level industrial ontology.

**Parked discovery.** See `discovery.md`. Do not import OWL. Do not treat IOF Core as OS vocabulary.

## EV-008. A2A 1.0 is an agent-to-agent surface, not a business verb

- Kind: source artifact
- Decision state: supported as a relevant surface standard. rejected as a metamodel primitive
- Sources: SRC-A2A-HOME, SRC-A2A-LF, SRC-WD-GA, SIB-36
- Keep reason: changed external standard for agent surfaces
- Pressures: Q15, Q22, constitution §15

SRC-A2A-HOME says MCP standardizes agent-to-tool communication and A2A standardizes agent-to-agent communication. Explicit non-goals include being an agent development kit, a sub-agent or tool-call protocol, a replacement for MCP, or an interactive messaging app.

SRC-A2A-LF, 9 April 2026, claims a v1.0 stable specification, cloud-platform integration, and production use. That is press. The protocol page is the better source for meaning.

SIB-36 already rejected MCP as a metamodel primitive and treated it as a surface emitter. A2A is the sibling surface for agent-to-agent delegation. Workday names both in SRC-WD-GA.

**Candidate implication.** Delegation between SoftwareAgents may need an interchange Task. That Task is not RFC-0001 Action. Action remains the business verb. A2A Task is a message about work.

## Cards that are not evidence of OS primitives

These are reminders, not keepers.

- SAP skill counts, agent counts, and "Autonomous Suite" marketing from third-party recaps. Not fetched as first-party runtime evidence.
- AuthZEN optional obligation context. The spec leaves its meaning to implementations. It is not LegalRuleML Obligation.
- OCEL atomic events. That is a process-mining modeling choice. UFO-B perdurants can have duration. The clash is recorded, not resolved.
