# Candidate laws

Each law is the smallest claim this watch can state. None is accepted. A later unit should try the counterexamples on the evidence cards.

## LAW-001. Some operational occurrences have many qualified participants and no case

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-001, EV-002
- Falsify if: every multi-object occurrence in order-to-cash, procure-to-pay, inventory, and manufacturing can be an Event plus ordinary Links, and changing the viewpoint never requires a second extract or a hidden case id
- Runtime consequence: if this survives, Event-to-object cardinality and role qualifiers are enforcement, not documentation. No schema is proposed

OCEL 2.0 exists because case-centric logs distort ERP reality. That is domain evidence. It is not a vote to add `Case` or `E2O` as kernel nodes.

## LAW-002. Policy meaning and Policy interchange are different artifacts

- Kind: candidate law
- Decision state: supported for the split. hypothesis for adopting AuthZEN at the OS boundary
- Evidence: EV-003
- Falsify if: a later Wave A unit shows that Policy as Function to Bool cannot be exposed through Subject, Action, Resource, Context, and boolean Decision without losing search, stale-world revalidation, or duty
- Runtime consequence: Wave B may speak AuthZEN at the PEP and PDP cut without making XACML, Cedar, or OpenFGA into ontology

SIB-61 already allows Cedar as a later worker. This law only adds a vendor-neutral cut. It does not pick Cedar.

## LAW-003. Boolean Decision is not Obligation

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-003, and the locator `origin/cursor/issue-73-ops-cfd8` @ `9203bfce522cf9c93b64500dc2b04819c6963599` `research/ops/unknown-unknowns/candidate-laws.md` LAW-004
- Falsify if: every AuthZEN optional context "obligation" and every LegalRuleML Obligation compile to Policy and Constraint and Action with no leftover duty clock
- Runtime consequence: if this survives, a denied Action and an unperformed duty remain different records

AuthZEN puts advice and obligations in unstructured response context. That is a hole, not a solution.

## LAW-004. A grounding graph over an incumbent ERP is not an executable ontology

- Kind: candidate law
- Decision state: supported for the negative claim. undetermined for Q21
- Evidence: EV-004
- Falsify if: first-party SAP material shows the Knowledge Graph as write authority with competing observations, stale-approval revalidation, unknown external effects, and known-then history, without falling back to S/4 documents as the source of meaning
- Runtime consequence: do not treat SAP Joule as a do-not-build for greenfield OS. Do treat it as the default path for companies that already run SAP

SIB-61 A6 already rejected ontology-over-ERPNext as the greenfield core. EV-004 is production evidence that the incumbent path is that architecture.

## LAW-005. Some organizations now keep Agent as a workforce master

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-005
- Falsify if: register, configure, activate, deactivate, cost, and as-versus-on-behalf-of can live as ordinary Actions and Interfaces on a SoftwareAgent, with no leftover meaning that Employment or Principal cannot carry
- Runtime consequence: undetermined. Do not add Agent to RFC-0001 from this watch alone

RFC-0001's refusal of Agent as a primitive is still the working claim. Workday is the adversarial production case, not an override.

## LAW-006. A claim can name a proposition without accepting it

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-006
- Falsify if: Fact plus provenance plus a not-accepted status already express S-011, and a triple term adds no enforcement
- Runtime consequence: if this survives, interchange may use RDF 1.2 Full reifiers. The OS store still must not become an RDF engine by default

`research/reference-landscape.md` already rejected RDF stacks as the whole thesis. That rejection stands. The new term is only the unasserted proposition.

## LAW-007. Agent-to-agent Task is a surface, not a business Action

- Kind: candidate law
- Decision state: supported
- Evidence: EV-008, SIB-36 steal-improve-reject MCP refusal
- Falsify if: an A2A Task carries business invariants that cannot be expressed as an OS Action invoked by one SoftwareAgent on behalf of a Principal
- Runtime consequence: MCP and A2A remain emitters. Missing fields in those emitters mean the tool-contract IR is incomplete, as SIB-36 already said for MCP

## Rejected as laws from this watch

### REJ-001. The 2026-08-15 reference note is already complete

- Kind: candidate law
- Decision state: rejected
- Evidence: EV-001 through EV-007

The earlier note named the right operational-ontology products. It missed OCEL, AuthZEN Final, RDF 1.2 triple terms, IOF, Workday ASOR, and SAP's grounding-graph path.

### REJ-002. A new agent protocol is a new ontology primitive

- Kind: candidate law
- Decision state: rejected
- Evidence: EV-008, SIB-36

A2A and MCP change how agents talk. They do not change what a shipment or a journal entry is.

### REJ-003. IOF or OCEL should be imported as RFC-0001 vocabulary

- Kind: candidate law
- Decision state: rejected
- Evidence: EV-001, EV-007, constitution §2

Both are evidence. Mapping their classes into the metamodel would freeze a process-mining log or a BFO industrial suite as the kernel.
