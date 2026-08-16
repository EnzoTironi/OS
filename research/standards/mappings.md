# Mappings

Mappings are hypotheses unless marked `supported` or `rejected`. They point at RFC-0001 candidate forms and at `docs/open-questions.md` without writing answers into that file.

## Convergence

Independent sources that make the same distinction.

| Distinction | EPCIS and CBV | ISA-95 and IEC 62264 | ISA-88 | Ossie | RFC-0001 and OS docs | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Attempted intervention versus occurrence | Events are assertions about what a capturing app says happened. No Action-as-intent type. | Part 5 exchanges required and actual activities. Schedule versus performance. | Recipe and procedure versus batch production record | None. Metrics are calculations. | Action != Event. Thesis and constitution item 8. | `supported` |
| Occurrence time versus recorded time | eventTime versus recordTime | Not retrieved in full. Capability has current versus future capacity in 2003 figures. | Batch records timestamp execution | Date versus DateTime versus DateTimeTz as column types | Open question 7, bitemporality | `supported` that the split exists in EPCIS. `undetermined` whether ISA-95 has a matching pair. |
| Observation location versus subsequent location | readPoint versus bizLocation | Operational Location model named in Part 5 | Physical model (site, area, cell, unit) on landing page | Dimension "Where" on warehouse columns | Locatable mentioned as a possible Interface | `supported` that location is not one field |
| Specification versus execution | ILMD on commissioning or transformation outputs. Master data versus events. | Product definition and operations definition versus operations performance. Spec versus requirement versus actual in Part 4 TOC. | General and site recipe versus master and control recipe. Part 4 production records. | Dataset `source` is a table, not a process spec | Open question 14 | `supported` |
| Identity of a thing versus identity of a class or quantity | EPC versus QuantityElement | Material model distinct from process segment. BOM versus bill of resources. | Formula quantities on recipes | primary_key on a dataset row | Identity section in RFC-0001 | `supported` |
| Containment versus transformation | Aggregation and Association versus Transformation. CBV assembling versus transforming. | Material actual versus process segment. Not a full transform model in retrieved text. | Recipe consumes formula materials to make a batch | Joins between datasets | Scenario S-008, S-009 | `supported` for the EPCIS and CBV split. `undetermined` for ISA-95 transform semantics. |
| Correction without rewrite | ErrorDeclaration plus ordinary compensating bizSteps such as void_shipping | Not retrieved | Production records for audit | Round-trip extensions, not corrections | Scenario S-007, S-010. Constitution item 9. | `supported` in EPCIS. `undetermined` in ISA-95. |
| Role versus asset | Not modeled. Locations and parties are user vocabulary. | Equipment model and Physical Asset model both named in Part 5 | Equipment capability versus a specific unit | None | Open question 12, roles | `hypothesis` |
| Capability versus committed work | Not modeled | Capability, available capacity, schedule, performance | Equipment capabilities versus a control recipe instance | Metric is a query, not a capability | Open question 14 capability | `supported` as a manufacturing split |

## Divergence

Sources that disagree, and a plausible reason.

### D-001 What "Action" names

- Kind: source-system artifact
- Decision state: `rejected` that the words match
- EPCIS Action is ADD, OBSERVE, DELETE on the lifecycle of the event's entity.
- RFC-0001 Action is an attempted, authorized intervention.
- ISA-95 Part 5 uses "verbs" on exchange nouns. Those verbs are message operations such as get, process, change. They are not domain actions either.
- Reason: three communities overloaded a short English word for three jobs.

### D-002 What "semantic model" names

- Kind: source-system artifact
- Decision state: `supported` that the phrase is overloaded
- Ossie semantic_model is datasets, joins, and KPI expressions over warehouse tables.
- Palantir-style operational ontology (in-repo `research/reference-landscape.md`) is objects, links, and governed actions.
- EPCIS has a UML "ontology focus" diagram but the normative content is event fields and vocabularies.
- Reason: analytics portability and operational truth are different products.

### D-003 How fine process steps should be

- Kind: domain evidence
- Decision state: `undetermined`
- CBV offers both coarse `shipping` and a mutually exclusive fine chain (staging_outbound, loading, departing).
- UNTP collapses many CBV steps into Make, Move, Modify.
- ISA-95 Part 3 models MOM activities. ISA-88 models procedure, operation, and phase.
- Reason: interchange wants a small shared list. Control wants a decomposable recipe. OS has not chosen a granularity law.

### D-004 How much lineage a transformation must retain

- Kind: domain evidence
- Decision state: `supported` that the standards accept lossy lineage. `undetermined` whether OS may.
- EPCIS TransformationEvent says any input may have contributed to each output. That is an explicit refusal of exact genealogy.
- Scenario S-008 wants customer-level recall of affected output lots.
- ISA-95 material actuals and ISA-88 batch records are the usual place plants store weighed inputs. Those full texts were not retrieved.
- Reason: visibility standards optimize shared recall lists. Plant records optimize mass balance. They are not the same requirement.

### D-005 Whether identifier birth is a production process

- Kind: domain evidence
- Decision state: `undetermined`
- CBV commissioning includes catching and slaughtering.
- ObjectEvent ADD is identifier issuance.
- ISA-95 would likely treat slaughter as an operations performance against a process segment, and the serial as material identity.
- Reason: CBV optimized a single bizStep for "this identifier now exists in the chain."

## Mappings into OS candidate forms

Each row is a candidate mapping, not an import.

| Standard concept | Maps toward | Must not become | Decision |
| --- | --- | --- | --- |
| EPCISEvent | Event or Event-nature, or a typed object that implements Event | The XML or JSON schema | `hypothesis` |
| Capturing Application assertion | Observation or Claim with provenance | Immediate Accepted Fact | `hypothesis`. Open question 3 stays open. |
| EPCIS Action ADD/OBSERVE/DELETE | A property of an occurrence's relation to an entity lifecycle | RFC-0001 Action | `rejected` as Action |
| bizStep | A typed process-step vocabulary or a Function input | A closed kernel enum | `hypothesis` |
| disposition and persistentDisposition | Facts about business condition with different invalidation rules | Two mandatory fields on every Event | `hypothesis` |
| eventTime | Valid or occurrence time | The only timestamp | `supported` as a needed dimension |
| recordTime | System or knowledge time | Proof that every Fact needs both clocks | `hypothesis` |
| readPoint | Observation location | The object's home location | `supported` as a distinction |
| bizLocation | Prospective location fact | A warehouse table | `supported` as a distinction |
| sourceList and destinationList | Custody or ownership transfer context | Hidden inside location | `hypothesis` |
| epcList | Instance identity | GS1 URI syntax | `supported` that instance identity exists |
| QuantityElement | Class identity plus quantity plus unit, quantity optional | A floating stock field with no class | `supported` |
| AggregationEvent | Temporary containment relator or event | The only composition form | `supported` as a distinction |
| AssociationEvent | Longer-lived composition or location attachment | The same form as aggregation | `supported` as a distinction |
| TransactionEvent | Link from occurrences to a business transaction identity | Proof that Purchase Order is a kernel type | `hypothesis` |
| TransformationEvent | Transformation occurrence with lossy input-output participation | Exact genealogy | `supported` |
| transformationID | Identity of a long-running transformation process | A workflow kernel form | `hypothesis` |
| errorDeclaration | Superseding occurrence plus corrective pointers | Row delete | `supported` as a behavior |
| ILMD | Properties born with an instance or lot | Event-level extensions | `hypothesis` |
| certificationInfo | Provenance or evidence | Policy | `undetermined` |
| SensorElement | Observation of a condition, clock not equal to bizStep time | A How kernel form | `hypothesis` |
| ISA-95 Personnel, Equipment, Physical Asset, Material | Resource kinds or roles | Four mandatory kernel types | `hypothesis` |
| Equipment versus Physical Asset | Role or capability bearer versus serialized asset | One "machine" type | `hypothesis` |
| Operations Capability | Capability | Capacity number | `supported` as a distinction |
| Operations Definition | Process or product specification | Work Order | `hypothesis` |
| Operations Schedule | Plan or commitment | Event | `hypothesis` |
| Operations Performance | Actual execution record | Status field on the schedule | `supported` as a distinction |
| Spec versus requirement versus actual | Plan versus need versus observation | One quantity column | `supported` |
| Process segment | A segment of work independent of one product | Routing table | `hypothesis` |
| ISA-95 Part 7 alias (not retrieved in full) | Identity reconciliation across systems | A second identifier kernel form | `undetermined` |
| ISA-88 general, site, master, control recipe | Specification tiers from product intent to running batch | Four kernel types | `hypothesis` |
| ISA-88 batch production record | Evidence of execution | The process itself | `hypothesis` |
| Ossie metric | Function over a projection | ObjectType | `rejected` as a kernel form |
| Ossie dataset | A query surface over stored facts | The object | `rejected` as a kernel form |
| UNTP Make, Move, Modify | A presentation grouping of occurrence kinds | Replacing EPCIS or RFC-0001 | `rejected` as kernel |

## Missing forms the standards pressure

These are gaps relative to RFC-0001, not proposals to add a 13th kernel form tonight.

1. Observation that can be false, late, or about a non-occurrence (E-002, E-015). Open question 3 and 5.
2. Lossy many-to-many transformation participation (E-008). Scenario S-008.
3. Temporary containment versus durable composition (E-004, E-009).
4. Class-level quantity with unknown amount and a unit (E-005).
5. Custody or ownership change distinct from location change (E-014 consigning).
6. Role-based equipment versus physical asset (E-018).
7. Capability versus available capacity versus schedule versus performance (E-017, E-018).
8. Identifier commissioning distinct from the production process that created the thing (E-007).
9. Sensor-condition time distinct from business-step completion time (E-011).

## Cross-links

Domain issues that should consume this folder when they exist on main:

- Manufacturing, open question 14
- Inventory identity and transformation
- Time and provenance, open questions 7 and 8
- Action versus Event versus Effect, open question 5
- Formal ontologies, issue 37, for endurant versus perdurant comparison
- ERPNext, Odoo, Moqui corpora for whether Work Order is definition, schedule, or performance
