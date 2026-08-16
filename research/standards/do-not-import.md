# Do not import

Interchange standards encode operational distinctions and also encode message shapes. This file lists the second kind. Importing them would make OS a GS1, ISA, or Ossie runtime.

**Kind:** source-system artifact, unless a row says otherwise.

## Closed rejections

### X-001 EPCIS document schema and bindings

- Decision state: `rejected`
- What: EPCIS XML, JSON, JSON-LD, SOAP, WSDL, REST capture and query, SimpleEventQuery parameters, Standard Business Document Header UML.
- Why: Constitution item 6. Syntax and transport are not domain meaning.
- Cite: S-EPCIS-20 changelog. S-GS1-LANDING.

### X-002 EPCIS Action as RFC-0001 Action

- Decision state: `rejected`
- What: The closed enumeration ADD, OBSERVE, DELETE.
- Why: It answers "did this event create, merely see, or destroy the entity the event is about?" It does not answer "who attempted which intervention under which policy?"
- Cite: S-EPCIS-20 section 7.3.2. See SA-001.

### X-003 CBV URI lists as kernel enums

- Decision state: `rejected`
- What: Shipping, receiving, commissioning, and the rest of the Standard Vocabulary as the only legal process steps or dispositions.
- Why: CBV itself defines User Vocabulary for locations, parties, and transaction IDs, and tells industries to extend Standard Vocabulary through a ratification process. UNTP already mints sector bizStep URIs. A kernel enum would freeze one supply-chain dialect.
- Cite: S-CBV-20 sections 3.3.1 and 3.3.2. S-UNTP-DTE.

### X-004 GS1 identifier syntax as the identity system

- Decision state: `rejected`
- What: SGTIN, SGLN, PGLN, GS1 Digital Link URI, EPC Pure Identity URI as the only way to name objects and places.
- Why: Identity of instances and places is domain-real. The GS1 URI grammar is one issuing system. EPCIS already accepts either EPC URN or Digital Link syntax and lets the responder pick.
- Cite: S-EPCIS-20 sections 7.3.1 and 7.3.3.1.2.

### X-005 Purdue Levels 0 to 4 as kinds

- Decision state: `rejected`
- What: Physical process, sensor, PLC, MES, ERP as ontology categories.
- Why: IEC 62264 uses the hierarchy to place an interface. ISA's current page says the model is activity-based and technology-agnostic, and that Industry 4.0 flows are more distributed than the original pyramid. Treating MES as a kind would bake a 1990s system cut into the kernel.
- Cite: S-ISA95-LANDING. S-IEC-62264-1-2003 scope. SA-003.

### X-006 B2MML and BatchML schemas

- Decision state: `rejected`
- What: MESA XSD types for Personnel, Equipment, ProductionPerformance, and the rest.
- Why: MESA states they implement ISA-95 for integration projects. They are an encoding. Copying XSD into an MIT core would also be a licensing and clean-room problem even though B2MML is royalty-free with credit.
- Cite: S-B2MML. Standing order 6.

### X-007 ISA-95 Part 5 verbs as domain Actions

- Decision state: `rejected`
- What: Message verbs over nouns (the OAGIS-like get, process, change pattern named in the preview).
- Why: Part 5 says it defines information exchanges between applications. Other transaction protocols remain valid. These verbs move documents. They do not name business interventions.
- Cite: S-ISA95-P5-2018 introduction and scope.

### X-008 ISA-95 Part 6 messaging service and Part 8 profiles

- Decision state: `rejected` as kernel forms. `undetermined` as optional interchange adapters later.
- What: Messaging services across Level 3 and 4. Information-exchange profiles that specify which verbs and nouns a community uses.
- Why: Official landing page describes them as interface and profile machinery.
- Cite: S-ISA95-LANDING Part 6 and Part 8.

### X-009 Ossie semantic_model, metrics, dialects, custom_extensions

- Decision state: `rejected`
- What: YAML semantic models whose datasets point at warehouse tables and whose metrics are SQL dialect expressions.
- Why: This standard solves KPI drift across BI tools. It does not model occurrence, authority, or custody. Treating it as the OS ontology would replace operational meaning with a portable cube.
- Cite: S-OSSIE-HOME. S-OSSIE-SPEC. E-022.

### X-010 UNTP Make, Move, Modify as the occurrence taxonomy

- Decision state: `rejected`
- What: A three-way grouping used to profile EPCIS.
- Why: Useful as a teaching collapse. Too coarse for transformation versus aggregation versus association, which CBV and EPCIS bother to split.
- Cite: S-UNTP-DTE. E-004. E-009.

## Do not treat as kernel even when the distinction is real

These rows keep a domain distinction and throw away the interchange costume.

| Keep the distinction | Leave behind |
| --- | --- |
| Observation versus later expected state | The pair of fields called retrospective and prospective |
| Occurrence time versus repository time | The names eventTime and recordTime |
| Observation place versus subsequent place | The names readPoint and bizLocation |
| Instance versus class quantity | EPC and QuantityElement encodings |
| Temporary containment versus durable composition | AggregationEvent versus AssociationEvent class names |
| Lossy transformation participation | The TransformationEvent schema and transformationID URI rules |
| Immutable history plus compensating or error events | The ErrorDeclaration XML shape |
| Capability versus schedule versus performance | B2MML element names and Part 5 nouns |
| Recipe versus running batch | ISA-88 document part numbers |
| Equipment role versus serialized asset | The two ISA-95 class names, until Part 2 definitions are read |

## What Wave B must wait for

Standing order 7. Runtime and toolchain recommendations wait for Wave A semantic pressure.

Do not, from this folder alone, pick:

- an event store
- JSON-LD as the language
- a GS1 Digital Link resolver
- an MES product
- Ossie converters
- B2MML as the integration bus

Those are reversible later. They are not semantic findings.
