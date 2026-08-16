# Evidence

Each block names its kind, a first-party citation, what was observed, limits, and a decision state. Kind is one of: domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

## EPCIS event nature

### E-001 Visibility events are shared assertions about objects

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-ISO-19987 abstract. S-GS1-LANDING. S-EPCIS-20 section 7.2.
- Observation: ISO/IEC 19987:2024 says EPCIS exists so disparate applications can create and share visibility event data and gain a shared view of physical or digital objects in a business context. GS1's landing page calls EPCIS a traceability event messaging standard for status, location, movement, and chain of custody. The 2.0 core module defines ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent, and AssociationEvent as subclasses of EPCISEvent.
- Limits: The standard does not claim to be an organizational ontology or an action language.

### E-002 An ObjectEvent may record a failed observation

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.4.2
- Observation: "Most ObjectEvents are envisioned to represent actual observations of objects, but strictly speaking it can be used for any event a Capturing Application wants to assert about objects, including for example capturing the fact that an expected observation failed to occur."
- Limits: The capturing application is the authority of the assertion. The spec does not define accepted operational truth versus competing claims.

### E-003 Retrospective semantics versus prospective semantics

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.1.3
- Observation: Each event encodes assertions that were true at capture time and assertions expected to remain true until a later event invalidates them. Example. Widget 23 observed at door 6 at 11:23pm is retrospective. Widget 23 is in building 5 is prospective and lasts until another capture says it left.
- Limits: Prospective state is a convention over later events, not a stored current-state kernel form.

## Event types and identity

### E-004 Five event types differ by the shape of "what"

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 sections 7.2 and 7.4.2 to 7.4.6
- Observation:
  - ObjectEvent. One or more objects. No implied relationship among them.
  - AggregationEvent. Physically aggregated objects constrained to the same place at the same time.
  - TransactionEvent. Objects associated or disassociated with identified business transactions.
  - TransformationEvent. Inputs fully or partially consumed and outputs produced, such that any input may have contributed to all outputs.
  - AssociationEvent. Like aggregation, but can associate objects with physical locations and is suited to parent-child links that persist after temporary children leave.
- Limits: These are interchange event shapes. They are not a closed list of real-world occurrence kinds.

### E-005 Instance identity versus class-plus-quantity

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.3.3
- Observation: Instance-level identifiers (EPC or GS1 Digital Link URI) name specific objects. Class-level `QuantityElement` names an `epcClass` plus optional `quantity` and `uom`. Quantity may be omitted to mean unknown. Fixed-measure classes are counted. Variable-measure classes use UN/CEFACT Rec 20 units for length, area, volume, or mass.
- Limits: Identifier syntax is GS1-specific. The count-versus-measure split is domain-level.

### E-006 Trade-item instances are not master data

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported` as an EPCIS design choice. `hypothesis` as an OS storage law.
- Citation: S-EPCIS-20 section 7.3.1 non-normative explanation
- Observation: Individual trade-item EPCs are treated as a primitive identifier type, not Vocabulary Elements with master data, because new instances are commissioned constantly. Master data is defined to exclude data that grows as more business is transacted.
- Limits: This is a repository-design argument inside EPCIS. It does not prove OS must store instance facts differently from catalog facts.

### E-007 Commissioning is identifier birth, and CBV also uses it for production

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported` that identifier assignment is a real step. `undetermined` whether CBV's sector collapse is correct for OS.
- Citation: S-EPCIS-20 section 7.4.2 Action ADD. S-CBV-20 commissioning and creating_class_instance.
- Observation: ObjectEvent Action ADD means instance EPCs were issued and associated with objects for the first time, or the named class quantities were created. CBV `commissioning` is "associating an instance-level identifier with a specific object" and "encompasses" catching, harvesting, picking, producing, and slaughtering. `creating_class_instance` does not claim first use of the class identifier. `decommissioning` disassociates an identifier. A later recommission must use a new instance identifier. `destroying` terminates the object.
- Limits: CBV packs several production processes into identifier assignment. That is a vocabulary convenience, not proof they are one domain concept.

## Transformation, aggregation, association

### E-008 Transformation contribution is many-to-many and may span events

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.4.5
- Observation: Inputs are fully or partially consumed. Outputs are produced. Any input may have contributed in some way to each output. A `transformationID` shared across events means any input of any linked event may have contributed to any output of any linked event. A long process should be several events. With a `transformationID`, a single event may add only inputs or only outputs.
- Limits: The standard refuses exact input-to-output fractions. Scenario S-008 (lot recall) can list candidate lots. It cannot compute a unique contribution graph from conforming events alone.

### E-009 Assembling is not transforming

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-CBV-20 assembling, installing, packing, disassembling
- Observation: `assembling` combines objects into a finished product where originals stay recognizable or the process is reversible. CBV says assembling belongs on AssociationEvent or AggregationEvent, not TransformationEvent. `installing` puts an object into a composite that already exists. `packing` puts objects into a larger container, usually for shipping. `disassembling` breaks an object into uniquely identified parts.
- Limits: Recognizable and reversible are informal tests. Rework and scrap (scenario S-009) are not fully classified here.

### E-010 Aggregation parent may be unknown on observe

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.4.3 non-normative explanation
- Observation: Parent ID is used on ADD so later DELETE can name the aggregation. Parent ID is optional on OBSERVE because a receiving process may read case tags and fail to read the pallet tag.
- Limits: This is a capture-failure pattern. It pressures unknown parent identity, not a new event type.

## Time, location, state

### E-011 eventTime is distinct from recordTime

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.4.1
- Observation: `eventTime` is the date and time the capturing application asserts the event occurred. `recordTime` is when an EPCIS repository recorded the event. `recordTime` "does not describe anything about the real-world event" and is a bookkeeping field for standing queries. `eventTimeZoneOffset` records the local offset in effect at the place of capture, even when `eventTime` is stored in UTC.
- Limits: The spec treats recordTime as repository bookkeeping, weaker than a full knowledge-time theory. Sensor `time`, `startTime`, and `endTime` are a third clock. They must be earlier than or equal to `eventTime`, because `eventTime` marks completion of the business step, not the sensor sample.

### E-012 Read point versus business location

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 sections 7.3.5 and 7.3.4 commentary
- Observation: Events carry both `readPoint` and `bizLocation`. The spec says the distinction tracks retrospective versus prospective semantics. Read point participates in "was observed here." Business location participates in "may now be found here until contradicted."
- Limits: Both are user vocabulary identifiers, often SGLN. Hierarchy of site, building, door is left to master data.

### E-013 Disposition is transient. Persistent disposition is sticky.

- Kind: domain evidence
- Grade: official-doc
- Decision state: `hypothesis` as an OS form. `supported` as an EPCIS distinction.
- Citation: S-EPCIS-20 section 7.3.6.2. S-CBV-20 2.0 changelog.
- Observation: `disposition` is the business condition after the event and holds until another event names a new disposition. Intervening events without disposition do not change it. `persistentDisposition` sets or unsets conditions that remain until explicitly unset. The spec warns to use persistent disposition only on ObjectEvent OBSERVE to avoid inheritance ambiguity onto children, inputs, or outputs. CBV 2.0 added persistent disposition and values such as `available`, `conformant`, `non_conformant`, `recalled`.
- Limits: Two fields over one vocabulary is an interchange encoding. OS might use one state fact with different validity rules.

### E-014 Shipping is not consigning. Void shipping is a compensating step.

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-CBV-20 shipping, consigning, receiving, void_shipping
- Observation: `shipping` is the outbound process and is mutually exclusive with the finer steps staging_outbound, loading, departing. `consigning` is similar but includes a change of possession or ownership at the outbound side. `receiving` adds the object to the receiver's inventory and is mutually exclusive with arriving and accepting. `void_shipping` declares that objects in a prior shipping, departing, or consigning event were not shipped as previously indicated.
- Limits: Possession and ownership are named in prose, not modeled as distinct resources.

## Correction

### E-015 Prior events are not deleted. Error declarations copy them.

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.4.1.2
- Observation: When a prior event is wrong, earlier events are never deleted or modified. The preferred remediation is another ordinary event that models the business process of fixing the mistake. Example. A missed serial is shipped by a new shipping event. A serial that never left is voided with `void_shipping`. ErrorDeclaration is only for cases where ordinary events cannot or should not rewrite the trace. Example. An ObjectEvent DELETE said a serial was destroyed, so later ordinary events are forbidden by DELETE semantics. An error declaration is a second event identical to the first except for ErrorDeclaration and recordTime. Queries return both. `declarationTime` is when the error is asserted. `correctiveEventIDs` may point at replacements.
- Limits: This is an interchange immutability rule. It supports constitution item 8 and scenario S-007. It does not choose Fact versus Event as the OS storage unit.

## ISA-95 and ISA-88

### E-016 ISA-95 is an interface standard between Level 3 and Level 4

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Citation: S-IEC-62264-1-2003 scope and introduction. S-ISA95-LANDING.
- Observation: IEC 62264-1:2003 "describes the interface content between manufacturing control functions and other enterprise functions." The interfaces in scope are between Levels 3 and 4. The standard is not intended to suggest there is only one way to implement integration, force users to abandon current methods, or restrict development. ISA's current landing page still describes an abstract, technology-agnostic communication model whose primary deal is the Level 3 to Level 4 interface. Levels 0 to 4 are activity layers from the Purdue model.
- Limits: 2003 edition. ISA now sells a 2025 Part 1. The integration purpose is stable across the landing page and the 2003 scope.

### E-017 Capability is not capacity. BOM is not bill of resources.

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported`
- Citation: S-IEC-62264-1-2003 clause 3 terms
- Observation: Capability is the ability to perform actions, including qualifications and measures of that ability as capacity. Capacity is a measure of the ability to take action and a subset of capability. Examples are production rates and flow rates. Available capacity is attainable capacity not committed to current or future production. BOM lists subassemblies, parts, or materials and quantities used to make a product. Bill of resources lists resources and when they are needed, often as production segments, and is used to predict schedule impact on resource supply.
- Limits: Terms only. Object models in clause 7 were visible as figure titles (personnel, equipment, material, process segment, production capability, product definition, production schedule, production performance) but not as full attribute tables in the sample.

### E-018 ISA-95 exchange nouns split resources, capability, definition, schedule, and performance

- Kind: domain evidence
- Grade: official-doc
- Decision state: `supported` as a domain split. `undetermined` as kernel forms.
- Citation: S-ISA95-P5-2018 clause 1. S-ISA95-P4-TOC. S-ISA95-LANDING Part 3 and Part 4 blurbs.
- Observation: Part 5 lists exchange models for Personnel, Equipment, Physical Asset, Material, Process Segment, Operational Location, Operations Event, Operations Capability, Operations Definition, Operations Schedule, Operations Performance, then a parallel Work Capability, Work Definition, Work Schedule, Job List, Work Performance, plus Workflow Specification, Work Calendar, Work Record, and Work Alert. Part 4's TOC shows specification, requirement, and actual rows for personnel, equipment, physical asset, and material. Part 3 is activity models of manufacturing operations management.
- Limits: Preview and TOC, not the full normative attribute tables. Equipment versus Physical Asset is named but not defined in the retrieved pages.

### E-019 Part 5 transactions are verbs over those nouns

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Citation: S-ISA95-P5-2018 foreword, introduction, scope
- Observation: Part 5 combines Part 2 and Part 4 abstract models with verbs to define a transaction model. Technology-specific implementations are out of scope. Other non-Part-5 protocols are not deemed invalid. Some work is based on OAGi OAGIS BODs. Focus is Level 4 to Level 3 and within Level 3.
- Limits: Verb catalog was not in the preview pages retrieved.

### E-020 B2MML is an XML encoding of ISA-95

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Citation: S-B2MML. S-B2MML-GH
- Observation: MESA states B2MML is a set of XSD schemas that implement ISA-95 data models for integrating ERP and supply-chain systems with control and MES. Use is royalty-free with credit. GitHub schema headers cite ISA-95 Part 2 (2018) and Part 5 (2018).
- Limits: Schemas were not copied and not treated as OS types.

### E-021 ISA-88 separates recipe from equipment and defines recipe tiers

- Kind: domain evidence
- Grade: official-doc
- Decision state: `hypothesis` (landing-page plus catalog evidence, full Part 1 not retrieved)
- Citation: S-ISA88-LANDING. S-IEC-61512. S-IEC-62264-1-2003 normative reference to IEC 61512-1:1997. S-ISA95-P4-TOC annex on Part 2, Part 4, and ISA-88.
- Observation: ISA's Part 1 is models and terminology for batch control and is technology-agnostic. Part 2 organizes and exchanges recipes, equipment capabilities, and control procedures. Part 3 defines general and site-level recipe models for use across locations. Part 4 models batch production records for compliance and traceability. TR88.95.01 is official guidance for using ISA-88 and ISA-95 together. IEC 62264-1:2003 already treated IEC 61512-1 as a normative reference.
- Limits: The procedure, unit procedure, operation, and phase hierarchy is widely reported. It was not quoted from the 2010 PDF in this session.

## Ossie and profiles

### E-022 Ossie exchanges analytics semantic models, not operational events

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported`
- Citation: S-OSSIE-HOME. S-OSSIE-SPEC
- Observation: The home page says Ossie standardizes exchange of semantic metadata across analytics, AI, and BI platforms. Core classes are Semantic Model, Datasets, Fields, Metrics, Dimensions, Relationships. The draft spec's datasets point at `database.schema.table`. Metrics are aggregate expressions with SQL dialects (ANSI_SQL, SNOWFLAKE, MDX, TABLEAU, DATABRICKS, MAQL, BIGQUERY). `custom_extensions` carry vendor JSON. Version is draft 0.2.0.dev0.
- Limits: Incubating. Schema may change. A later ontology chapter is mentioned. It was not retrieved as a separate operational-event model.

### E-023 UNTP profiles Make, Move, Modify onto EPCIS

- Kind: source-system artifact
- Grade: official-doc
- Decision state: `supported` as a profile. `rejected` as a kernel taxonomy.
- Citation: S-UNTP-DTE
- Observation: UNTP maps MakeEvent to TransformationEvent or AggregationEvent, MoveEvent to ObjectEvent OBSERVE with shipping or receiving, and ModifyEvent to ObjectEvent with inspecting, repairing, or decommissioning. It extends CBV with sector URIs when CBV lacks a step.
- Limits: This is a mapping convention over EPCIS. It shows the five EPCIS types are already treated as too fine or too coarse by neighboring standards.

## Source artifacts that must stay labeled as such

### SA-001 EPCIS Action enumeration

- Kind: source-system artifact
- Decision state: `rejected` as an OS Action import
- Citation: S-EPCIS-20 section 7.3.2
- Observation: `ADD`, `OBSERVE`, `DELETE` say how the event relates to the lifecycle of the entity the event describes. The values are closed. Industry groups shall not extend them. The field is independent of `bizStep`.
- Why it is an artifact: RFC-0001 Action is an attempted intervention. Reusing the name would collapse attempt into occurrence-lifecycle.

### SA-002 JSON, REST, SOAP, and XML bindings

- Kind: source-system artifact
- Decision state: `rejected` as kernel forms
- Citation: S-EPCIS-20 2.0 changelog. S-GS1-LANDING
- Observation: 2.0 added JSON and JSON-LD beside XML, and REST beside SOAP and WSDL. Master-data query and EPCIS Master Data Document were removed.
- Why it is an artifact: Transport and syntax.

### SA-003 Purdue Levels 0 to 4

- Kind: source-system artifact
- Decision state: `rejected` as OS kinds
- Citation: S-ISA95-LANDING. S-IEC-62264-1-2003 clause 5
- Observation: Level 0 physical process, Level 1 sense and manipulate, Level 2 supervise, Level 3 manufacturing operations management, Level 4 business planning and logistics.
- Why it is an artifact: A control-system segmentation used to place an interface. ISA itself now says Industry 4.0 data flows are more distributed than the original hierarchy.

### SA-004 Ossie dialects and custom_extensions

- Kind: source-system artifact
- Decision state: `rejected` as OS forms
- Citation: S-OSSIE-SPEC. S-OSSIE-DOCS
- Observation: Portable meaning is recovered by mapping vendor models through a hub format and parking leftovers in `custom_extensions` for round-trip.
- Why it is an artifact: Converter architecture for BI tools.
