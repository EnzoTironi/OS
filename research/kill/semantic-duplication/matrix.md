# Convergence and divergence

**Kind.** reference
**Fetched.** 2026-08-16
**Decision.** per row. Never `accepted`.

## Convergence

Independent sources that make the same distinction.

| Distinction | Palantir | Microsoft | SAP | Salesforce | Standards | OS docs | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mapping is not replacement | Ontology sits on datasources (E-001) | Dual-write maps two apps (E-009) | CVI links BP to Customer/Vendor (E-015) | External Object is a schema projection (E-017) | SPARQL views RDF via middleware (E-018) | Constitution item 2 (E-027) | `supported` |
| Virtualize keeps one row | Virtual table is a pointer (E-002) | Virtual tables and F&O VE (E-006, E-008) | not retrieved as a virtual-table product | External Objects hold no rows (E-017) | SPARQL `SERVICE` (E-018) | not decided | `supported` |
| Replica plus second writer drifts | Funnel merge, user edits win (E-004) | Dual-write pause, no 2PC (E-011, E-013) | PPO backlog (E-016) | Architect guide says replicas are delayed | EPCIS repository is beside enterprise apps (E-020) | S-004, S-011 | `supported` |
| Writeback is not atomic | Webhook may succeed remotely and fail locally (E-003) | Product receipt on one side (E-011) | PPO after BP save (E-016) | not retrieved | Capturing app asserts, enterprise consumes (E-020) | S-004 | `supported` |
| Bypass writes the SoR | Pipeline refresh ignored on edited properties (E-004) | `doInsert` skips dual-write (E-012) | Documents still use Customer numbers (E-015) | Source RLS still applies (E-017) | SEFAZ contingency (E-021) | Constitution item 9 | `supported` |
| Shared name, different type, fail closed | Cardinality not enforced, but primary key owns edits | Schema mutated to force parity (E-010) | Field mapping required for CVI | Dual governance, two security models | Apollo `Event.timestamp` Int vs String (E-019) | Open question 3 `delivery_date` caution | `supported` that fail-closed is safer than silent pick |
| Legal issuer is not the operational store | not retrieved | not retrieved | not retrieved | not retrieved | SEFAZ authorization (E-021). EPCIS assertion (E-020) | Issue 72 standing assumption | `supported` for NF-e |
| Ownership is per grain | Object type analogized to a dataset | Dual-write vs virtual tables by ownership (E-014) | BP entry point, Customer still on documents | Projection versus replica | Federation 2, no single Product owner | Issue 15, 16, 31, 55 siblings | `supported` |

## Divergence

Sources that disagree, and a plausible reason.

### D-001 What "virtual" names

- Kind: source-system artifact
- Decision state: `supported` that the word is overloaded
- Dataverse virtual tables and Salesforce External Objects store no row.
- Palantir virtual tables store no Foundry dataset, then ontology objects created from them are stored (E-002).
- Reason: "virtual" describes the table pointer, not the operational object. OS must not import the word without saying which.

### D-002 Who wins a conflict

- Kind: source-system artifact
- Decision state: `rejected` that there is one vendor rule
- Palantir default, user edits win. Palantir option, recency versus datasource timestamp.
- Microsoft dual-write, abort both sides on timeout, or accept one side (E-011, E-013).
- F&O virtual entities, source logic wins (E-008).
- Apollo, composition fails and no runtime winner is chosen (E-019).
- Reason: each product optimized a different failure. None is a domain law. L-008 and L-004 constrain OS. They do not pick Palantir's default.

### D-003 Whether a second schema must be mutated

- Kind: source-system artifact
- Decision state: `supported` that vendors disagree
- Dual-write adds company, party, and date effectivity to Dataverse (E-010).
- Virtual tables and External Objects leave the source schema in place and accept a capability tax (E-007, E-017).
- Reason: replicas need parity. Projections need less.

### D-004 Whether "unified product" is one master

- Kind: domain evidence
- Decision state: `rejected` as a single type. `undetermined` as a correspondence
- Dual-write markets unified product mastering (E-009).
- Issue 15 splits specification, SKU, lot, serial.
- Apollo lets many subgraphs contribute `Product` fields and says neither owns the type.
- Reason: the English word is doing too much work. Same as issue 55 L-001.

### D-005 Whether offline requires a replica

- Kind: source-system artifact
- Decision state: `undetermined` for OS
- Microsoft says use dual-write when you need offline (E-014). Virtual tables do not cache (E-007).
- Palantir indexes objects so interactive tools stay fast (E-002 drawbacks of virtual tables).
- Reason: offline is a surface constraint. It may justify a projection (L-004). It does not by itself move SoR (L-009).

## Source-artifact map

Do not import these as OS types.

| Source term | Domain distinction | Source-specific form |
| --- | --- | --- |
| Dual-write table map | Bidirectional replica | Dataverse solutions, company, party |
| Virtual table / virtual entity / External Object | Schema projection, one row | Provider plug-in, OData, SQL adapter |
| Funnel merged dataset | Index of datasource plus user edits | OSv2 queue, 6-hour flush |
| Writeback webhook vs side effect | External effect before or after local commit | Single writeback, unordered side effects |
| CVI / MDS_LOAD_COCKPIT / PPO | New master plus old replicas plus drift office | BP, Customer, Vendor, link tables |
| SPARQL `SERVICE` | Federated read | Remote endpoint, optional `SILENT` |
| `@shareable` / composition failure | Fail closed on type conflict | GraphQL subgraph SDL |
| EPCIS Capturing Application | Assertion about an occurrence | Capture Interface, repository |
| NF-e chave / protocolo | Legally issued identity | SEFAZ authorization of use |
| `doInsert` | Bypass of the hooked write | X++ |
