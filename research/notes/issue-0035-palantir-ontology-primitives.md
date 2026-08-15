# Palantir Ontology primitives, mutation, identity, time, and agent access

- Artifact ID: `issue-0035-palantir-ontology-primitives`
- Issue: `https://github.com/EnzoTironi/OS/issues/35`
- Parent: `https://github.com/EnzoTironi/OS/issues/2`
- Research angle: Official Palantir Foundry Ontology documentation as a production operational-ontology benchmark, focused on primitives, Actions-only mutation, object-backed links, interfaces, entity versus observation, multi-source identity, temporal history, and agent access.
- Decision states present: `hypothesis`, `supported`, `undetermined`

## Question

Does Palantir's production Ontology treat Object Types, Links, Interfaces, Actions, Functions, Object Sets, and security as one semantic core, or as a product stack that mixes domain meaning with pipeline, UI, and compatibility mechanics?

A surviving answer must say, for each primitive, what problem it solves, what it actually enforces, which limits look like product tradeoffs, and what a greenfield OS would keep or reject. It must also produce kill-tests that could falsify RFC-0001 claims about Action-only mutation, Relator-like links, Interface capabilities, Event-nature, multi-source identity, and time.

## Source scope

Official Palantir Foundry documentation examined on 2026-08-15:

- Ontology overview
- Object types overview and create-object-type
- Create a link type, including object-backed links
- Interfaces overview
- Action types overview, submission criteria, and webhooks
- Ontology architecture / object backend
- Ontology design structural guidance
- Ontology design anti-patterns
- Managing object security
- Operational applications
- Ontology system architecture-center page

Not examined in this pass:

- Runtime source of Phonograph, Funnel, or OMS
- Marketplace packaging, SuperRepo ontology-as-code beyond the create-object-type mention
- Shared-property manager pages beyond the interface overview
- Lineage, data-health, and Upgrade Assistant pages
- AIP Agent Studio tool-binding pages
- Workshop widget reference beyond Action Log Timeline search hits
- Customer production ontologies

No Palantir implementation was copied. Claims below are `official-doc` or `inference` from those pages.

## Evidence

### E-001 `ontology sits on datasources`

- Grade: `official-doc`
- Claim supported: Palantir Ontology is an operational layer mapped onto existing Foundry datasources, not a standalone system of record.
- Citation: Palantir, Overview, Ontology building, accessed 2026-08-15, section "Ontology building", https://palantir.com/docs/foundry/ontology/overview/
- Observation: The page says the Ontology "sits on top of the digital assets integrated into the Palantir platform (datasets, virtual tables, and models)" and that semantics are defined "by mapping existing datasources into objects, properties, and links".
- Limits: Marketing-adjacent overview. Does not prove every customer uses pipeline-backed objects.

### E-002 `semantic plus kinetic split`

- Grade: `official-doc`
- Claim supported: Palantir names a semantic set (objects, properties, links) and a kinetic set (actions, functions, dynamic security).
- Citation: Palantir, Overview, Ontology building, accessed 2026-08-15, section "Ontology building", https://palantir.com/docs/foundry/ontology/overview/
- Observation: The Ontology "contain[s] both the semantic elements (objects, properties, links) and kinetic elements (actions, functions, dynamic security)". Action types "capture data from operators" or "orchestrate decision-making processes that connect to your existing systems". Functions "author and evolve business logic with arbitrary complexity".
- Limits: "Dynamic security" is listed as kinetic here and treated as a separate permissioning subsystem elsewhere.

### E-003 `object type is entity or event`

- Grade: `official-doc`
- Claim supported: One Object Type primitive covers both enduring entities and events.
- Citation: Palantir, Object types, Overview, accessed 2026-08-15, section "Object types", https://palantir.com/docs/foundry/object-link-types/object-types-overview/
- Observation: "An object type is the schema definition of a real-world entity or event." Examples include `Employee` and `Flight`. An object set is "a collection of multiple object instances".
- Limits: Does not define Event as a nature, interface, or immutability rule.

### E-004 `dataset analogy`

- Grade: `official-doc`
- Claim supported: Palantir teaches Object Type, object, and object set as dataset, row, and filtered rows.
- Citation: Palantir, Object types, Overview, accessed 2026-08-15, section "Object types", https://palantir.com/docs/foundry/object-link-types/object-types-overview/
- Observation: "The definition of an object type in the Ontology is analogous to that of a dataset, while the definition of an object is analogous to that of a row in the dataset. The definition of an object set is analogous to a filtered set of rows in a dataset."
- Limits: Teaching analogy. Later pages add Actions, interfaces, and security that a raw dataset does not have.

### E-005 `primary key owns edits`

- Grade: `official-doc`
- Claim supported: Object identity is a unique, deterministic primary-key property. Edits and links attach to that key.
- Citation: Palantir, Create an object type, accessed 2026-08-15, sections "Configure the primary key and title key" and "Create a new object type manually", https://palantir.com/docs/foundry/object-link-types/create-object-type/
- Observation: Every object type needs a primary key. Each backing-datasource row must have a different value. Duplicate keys fail Funnel on Object Storage v2 and cause "unexpected changes" on v1. Non-deterministic keys lose edits and drop links because "ontology edits are associated with the primary key of the object". Changing the primary key prompts deletion of all existing edits. A datasource may back only one object type.
- Limits: Describes Foundry indexing, not a general theory of identity reconciliation.

### E-006 `cardinality is not enforced`

- Grade: `official-doc`
- Claim supported: One-to-one link cardinality is an intended-relationship hint, not an invariant the engine enforces.
- Citation: Palantir, Create a link type, accessed 2026-08-15, section "Choose the relationship type", https://palantir.com/docs/foundry/object-link-types/create-link-type/
- Observation: "The one-to-one cardinality serves as an indicator of the intended relationship, but the one-to-one cardinality is not enforced." Foreign-key links support one-to-one and many-to-one. Many-to-many uses a join-table dataset. "A many-to-many cardinality, which requires a backing datasource, is required to enable users to edit or write back to the link type."
- Limits: Does not say whether application-level Actions can still reject extra links.

### E-007 `object-backed links carry metadata`

- Grade: `official-doc`
- Claim supported: When a relationship needs its own properties, Palantir stores the link as an intermediary object type.
- Citation: Palantir, Create a link type, accessed 2026-08-15, section "Object-backed links", https://palantir.com/docs/foundry/object-link-types/create-link-type/
- Observation: Object-backed link types "allow for the inclusion of additional metadata on the link and support restricted views." The `Flight Manifest` example sits between `Aircraft` and `Flight` and can hold `Pilot` and `First Mate`. Creation requires two many-to-one links into the backing object.
- Limits: Product surface is limited. The same page says object-backed links can be viewed in Object Explorer, Vertex, and Workshop.

### E-008 `structural guidance prefers object-backed links for attributed relations`

- Grade: `official-doc`
- Claim supported: Official design guidance treats attributed relationships as object-backed links, not as properties on either endpoint.
- Citation: Palantir, Ontology design: Structural guidance, accessed 2026-08-15, section "Links and object-backed link types", https://palantir.com/docs/foundry/ontology/ontology-structural-guidance/
- Observation: Use a direct link when the relationship "carries no metadata of its own". Use an object-backed link when it carries dates, roles, status, or allocation. The `Employee` to `Venture` example uses `VentureStaffing` with `role`, `startDate`, `allocationPercentage`, and `status`. Putting `ventureRole` on `Employee` becomes ambiguous under multiple assignments.
- Limits: Guidance, not a compiler check.

### E-009 `interfaces are abstract capability contracts`

- Grade: `official-doc`
- Claim supported: An interface declares shared properties, link constraints, and action constraints. It cannot be instantiated or dataset-backed.
- Citation: Palantir, Interfaces, Overview, accessed 2026-08-15, sections "Interfaces", "Interface features", "Differences between interfaces and object types", and "Current levels of support", https://palantir.com/docs/foundry/interfaces/interface-overview/
- Observation: An interface "describes the shape of an object type and its capabilities". It is composed of interface properties, link type constraints, action type constraints, and metadata. Interfaces are "not backed by datasets, and cannot be instantiated directly". Object types may implement multiple interfaces. Interface action constraints are in beta. Interface link types and aggregations are "in development". Workshop and TypeScript v1 / Python functions do not yet support interfaces.
- Limits: Support matrix is dated to the access day. Enforcement strength of constraints is not specified beyond "expected action capabilities".

### E-010 `actions are governed property-and-link transactions`

- Grade: `official-doc`
- Claim supported: User-facing Ontology mutation is defined as an Action, a single transaction that edits objects, properties, and links.
- Citation: Palantir, Action types, Overview, accessed 2026-08-15, section "Action types", https://palantir.com/docs/foundry/action-types/overview/
- Observation: "Users can make changes to objects, properties, and links by applying actions. An action is a single transaction that changes the properties of one or more objects, based on a user-defined logic." The same action logic and validations are "available across all user-facing applications". Edits appear in a writeback dataset.
- Limits: Does not say pipelines, Funnel, or generated CRUD actions are forbidden.

### E-011 `generated crud actions exist`

- Grade: `official-doc`
- Claim supported: Object-type creation can generate a standard set of edit actions.
- Citation: Palantir, Create an object type, accessed 2026-08-15, section "Generate actions", https://palantir.com/docs/foundry/object-link-types/create-object-type/
- Observation: The helper can "optionally generate a standard set of actions to edit objects of this type and assign a specific user or group that can run them." The step is unavailable on Object Storage v1.
- Limits: Does not list the generated action names or whether they are single-property updates.

### E-012 `submission criteria gate commit`

- Grade: `official-doc`
- Claim supported: An Action commits only when every submission criterion passes. Criteria can read the current user, parameters, and whether the run is inside a Scenario.
- Citation: Palantir, Action types, Submission criteria, accessed 2026-08-15, sections "Submission criteria", "Conditions", and "Execution context", https://palantir.com/docs/foundry/action-types/submission-criteria/
- Observation: "Actions can only be submitted if all the submission criteria are met." Criteria are independent of who can edit the action-type definition. Scenario execution context lets planners test assignments they could not commit live. Failure messages are shown in Object Explorer, Workshop, and Quiver. Attachment and object-set parameters are unsupported in criteria.
- Limits: Official docs do not say criteria re-read after a later approval step. Scenario is a fork, not a bound proposal hash.

### E-013 `webhook writeback is not two-phase commit`

- Grade: `official-doc`
- Claim supported: External effects can run before or after Ontology edits. Neither mode is a true distributed transaction.
- Citation: Palantir, Action types, Side effects, Webhooks, accessed 2026-08-15, section "Webhooks: Writeback vs. side effect", https://palantir.com/docs/foundry/action-types/webhooks/
- Observation: A writeback webhook runs before object changes. If it fails, no Ontology changes are made. "It is still possible that the external request may succeed but Ontology changes could fail." A side-effect webhook runs after object changes. The user can see success before side effects run. Side effects have no guaranteed order.
- Limits: Timeout and `unknown` are not named. Retry and idempotency are not specified on this page.

### E-014 `funnel merges pipeline data and action edits`

- Grade: `official-doc`
- Claim supported: Object Storage v2 has two write paths into the same objects. Funnel indexes datasource updates and Action edits together.
- Citation: Palantir, Ontology architecture, accessed 2026-08-15, sections "Actions", "Object Data Funnel", and "Object Storage v2 architecture", https://palantir.com/docs/foundry/object-backend/overview/
- Observation: Funnel "reads data from Foundry datasources ... and user edits (from Actions) and indexes these data into object databases." The Actions service "appl[ies] user edits to object databases" and can "create a historical action log". OSv2 allows up to 10,000 objects in one Action, 2000 properties per object type, and a default Search Around limit of 100,000 objects.
- Limits: Conflict rules when a pipeline row and an Action edit disagree are not stated on this page.

### E-015 `object sets are saved queries or key lists`

- Grade: `official-doc`
- Claim supported: An object set is a reusable collection, either a static primary-key list or a dynamic filter.
- Citation: Palantir, Ontology architecture, accessed 2026-08-15, section "Object sets", https://palantir.com/docs/foundry/object-backend/overview/
- Observation: Static sets "are saved as a list of primary keys, and will stay the same regardless of any changes to the input data." Dynamic sets "are saved as a representation of the filters" and update when new data matches. Temporary sets expire within 24 hours and are user-scoped. Permanent sets are stored for reuse.
- Limits: Does not define object sets as a domain kind. Interface search is partial per E-009.

### E-016 `security is cell-level and ontology-scoped`

- Grade: `official-doc`
- Claim supported: Object and property policies grant row, column, and cell visibility on the object type, independent of backing-dataset ACLs.
- Citation: Palantir, Manage object security, accessed 2026-08-15, sections "Manage object security" and "Object and property security policies", https://palantir.com/docs/foundry/object-permissioning/managing-object-security/
- Observation: Object policy governs instance visibility. Property policy governs property-value visibility. Policies are "independent of the permissions on the backing data sources." Media-reference properties do not automatically protect the media set. Restricted views and multi-datasource object types remain for dataset-scoped or per-source markings. MDOs map columns from different sources onto one object type so `PHI` markings can hide some properties on the same instance.
- Limits: This is view security, not Action authorization. Submission criteria are a separate gate.

### E-017 `do not split types for security or source system`

- Grade: `official-doc`
- Claim supported: Official anti-patterns reject source-system types, department-owned copies, and security-driven type splits.
- Citation: Palantir, Ontology design: Anti-patterns, accessed 2026-08-15, sections "System Silos", "Department Silos", and Palantir, Ontology design: Structural guidance, accessed 2026-08-15, section "Security design", https://palantir.com/docs/foundry/ontology/ontology-anti-patterns and https://palantir.com/docs/foundry/ontology/ontology-structural-guidance/
- Observation: System Silos (`HR System Employee`, `Badge System Employee`) are resolved by merging sources in a pipeline, picking a cross-system primary key, and defining "clear precedence rules for conflicting values". Department copies of Customer are rejected. Security guidance says "Avoid duplicating object types for security" and to use row and column policy on one `Patient` type.
- Limits: Precedence rules collapse disagreement at ingest. Competing claims are not first-class.

### E-018 `actions are for human decisions, not all mutation`

- Grade: `official-doc`
- Claim supported: Palantir tells builders not to use Actions for batch, scheduled, or event-driven mutation that needs no human input.
- Citation: Palantir, Ontology design: Anti-patterns, accessed 2026-08-15, sections "The Golden Hammer" and "Action Sprawl", https://palantir.com/docs/foundry/ontology/ontology-anti-patterns
- Observation: Action types are "best for" human decisions and "user-initiated edits to one or a few objects". They are "not ideal for" batch calculations, scheduled updates, or event-driven reactions. Inventory status from quantity thresholds should be a pipeline write. Alert assignment should be an Automation that triggers an Action. Action Sprawl rejects `Set [Property]` CRUD in favor of `Transfer Employee` and `Onboard New Employee`.
- Limits: Guidance. Generated CRUD actions in E-011 still exist as a product convenience.

### E-019 `history is current object plus amendments`

- Grade: `official-doc`
- Claim supported: Palantir treats "one object per real-world entity, current-state properties, linked history" as the temporal pattern.
- Citation: Palantir, Ontology design: Anti-patterns, accessed 2026-08-15, section "The Time Machine", https://palantir.com/docs/foundry/ontology/ontology-anti-patterns
- Observation: Modeling `Contract v1` / `v2` or yearly contract types is an anti-pattern. Preferred model is one `Contract` with current properties, plus linked `Contract Amendments` (`amendmentDate`, `previousValue`, `newValue`, `changeReason`), time-series properties, or edits history / backing-dataset audit.
- Limits: No valid-time versus knowledge-time pair. No statement that every property is a fact with two times.

### E-020 `store each fact once`

- Grade: `official-doc`
- Claim supported: Copied properties across types are an anti-pattern. Derived properties should recompute from links when Actions change the graph.
- Citation: Palantir, Ontology design: Structural guidance, accessed 2026-08-15, section "Normalization and derived properties", https://palantir.com/docs/foundry/ontology/ontology-structural-guidance/
- Observation: "Store each fact once." If a value depends on Actions, "every action that could affect the value must also update the value" unless it is a derived property. Derived properties are recommended below about 10k objects per query. Above that, denormalization is a documented performance tradeoff.
- Limits: "Fact" here means a stored value, not RFC-0001 Fact.

### E-021 `structs carry observation metadata`

- Grade: `official-doc`
- Claim supported: Palantir groups source, confidence, and reasoning onto the value as struct fields, especially for LLM outputs.
- Citation: Palantir, Ontology design: Structural guidance, accessed 2026-08-15, section "Structs", https://palantir.com/docs/foundry/ontology/ontology-structural-guidance/
- Observation: An address struct can hold `datasource`, `llmConfidence`, and `llmReasoning` beside street and city. Reducers pick a primary value from a struct array. This is recommended for "AI-generated outputs with confidence scores, source references, and reasoning".
- Limits: Observation is a property encoding, not a separate claim object.

### E-022 `operational loop is decision, scenario, action, shared state`

- Grade: `official-doc`
- Claim supported: An operational application writes a decision back through an Action. Scenarios fork the Ontology to preview. The action log stores the decision as objects.
- Citation: Palantir, What is an operational application?, accessed 2026-08-15, sections "Beyond the dashboard", "Close the loop", and "Extending the loop with agents", https://palantir.com/docs/foundry/app-building/operational-apps/
- Observation: "Action submission criteria ensure that the Ontology changes only in accordance with your organization's rules." Scenarios "fork the Ontology, apply one or more actions, and see how the world would look ... without writing anything back to the live system." Automate runs effects on conditions. "Actions can trigger agents ... or route an agent's proposed changes to a person for approval." The action log "records every action submission as an object type".
- Limits: Does not specify that approval binds ontology revision, function revision, and parameter hash.

### E-023 `agents inherit human or project security`

- Grade: `official-doc`
- Claim supported: Palantir states that AI agents must inherit a human user's security scope or a project's permissions, reconciled at interaction time with Action and Function scopes.
- Citation: Palantir, The Ontology system, accessed 2026-08-15, section "Ontology example: Medical manufacturing", https://palantir.com/docs/foundry/architecture-center/ontology-system/
- Observation: "As these different teams build AI-powered agents, they must have security scopes that either inherit from a human user, or from the permissions structure of a defined project." Triggering a purchase order, running a scenario, and calling LLM functions "might have altogether different security scopes" reconciled "at the time of interaction, across tens of thousands of humans and agents."
- Limits: Architecture-center prose. No formal `as` versus `on behalf of` vocabulary.

### E-024 `nouns plus verbs plus four-fold integration`

- Grade: `official-doc`
- Claim supported: Palantir's stated model is data, logic, action, and security together. Surfaces consume that model.
- Citation: Palantir, The Ontology system, accessed 2026-08-15, sections "How the Ontology models decisions" and "The Ontology Language, Ontology Engine, and Ontology Toolchain", https://palantir.com/docs/foundry/architecture-center/ontology-system/
- Observation: "The data objects, or 'nouns', however, must be complemented by 'verbs' in order to model decisions." Language covers objects, links, properties, actions, automations, and logic. Engine covers reads, subscriptions, atomic updates, batch mutations, streams, and CDC. Toolchain is OSDK and DevOps. Workshop, Object Explorer, Quiver, and OSDK are named as consumers in E-001 and E-022.
- Limits: "Language / Engine / Toolchain" is Palantir product architecture, not a domain ontology.

### E-025 `god object versus interface`

- Grade: `official-doc`
- Claim supported: Palantir rejects one type that stands for many kinds. Shared shape goes on an interface.
- Citation: Palantir, Ontology design: Anti-patterns, accessed 2026-08-15, section "The God Object", https://palantir.com/docs/foundry/ontology/ontology-anti-patterns
- Observation: An `Asset` type holding equipment, licenses, real estate, instruments, and employees is rejected because property meaning changes with a type flag and most fields are null. The fix is distinct types plus an `Depreciable Asset` interface.
- Limits: Does not decide whether roles and phases are interfaces, types, or relations.

## Domain evidence

Palantir is solving a real operational problem. Organizations already have ERP, CRM, badge, sensor, and document systems. People and agents need one shared picture of plants, orders, patients, and flights, plus a governed way to change that picture.

The real-world distinctions that survive this corpus are:

- A thing with identity is not a filtered collection of those things.
- A relationship with its own role, interval, and status is not a foreign key.
- A shared capability across kinds is not a god type and not a copied property list.
- An attempted, authorized decision is not a pipeline refresh and not a raw column write.
- A previewed scenario is not a committed world.
- A current contract value is not the amendment that produced it.
- A source-system record is not the employee or customer.
- Visibility of a row or cell is not the same as permission to submit a named operation.

Palantir also shows a domain pressure it does not fully name. Pipeline writes, Action edits, webhook effects, and observations with confidence can all change what the organization believes, and they are not the same kind of change.

## Source-system artifacts

These names and mechanics look local to Foundry and should not be copied as OS primitives:

- Backing dataset, writeback dataset, Funnel, OMS, OSS, Phonograph, Object Storage v1/v2
- Restricted views, Multipass markings, Marketplace, Workshop, Quiver, Vertex, Slate, OSDK, SuperRepo
- Generated CRUD actions, join-table datasets, Search Around limits, 2000-property cap, 10k-objects-per-Action cap
- Groups as Ontology Manager labels
- Title key, API name, RID, temporary object-set expiry
- Webhook classified as writeback versus side effect
- Interface support matrix with beta and "in development" cells
- Denormalization above ~10k objects per query

The dataset-to-object teaching analogy is a source artifact. It explains the product. It does not prove that an operational ontology is a row store with verbs.

## Concepts

### C-001 `identifiable object`

- Source term: Object type / object instance
- Domain distinction: A real-world entity or occurrence that can be addressed and queried
- Evidence: `E-003`, `E-004`, `E-005`
- Source-specific form: One primary-key property on a dataset-backed type. Entity and event share the type.
- Alternative interpretations: Event-nature objects should be a different category. Primary key may be a storage key, not worldly identity.
- Decision state: `supported` as Palantir's model. `undetermined` as an OS primitive.

### C-002 `attributed relationship`

- Source term: Object-backed link type / backing object
- Domain distinction: A relationship that itself has role, time, status, or allocation
- Evidence: `E-007`, `E-008`
- Source-specific form: Intermediary object plus two many-to-one links, optionally re-exposed as one link type
- Alternative interpretations: Native Relator. Ordinary object with two constrained relationships and no link-type sugar.
- Decision state: `supported` as a needed distinction. `hypothesis` that a native Relator is required.

### C-003 `shared capability interface`

- Source term: Interface
- Domain distinction: A contract of properties, links, and actions that several kinds implement
- Evidence: `E-009`, `E-025`
- Source-specific form: Abstract, not instantiable, partial platform support, local interface properties preferred over shared properties
- Alternative interpretations: Role, phase, or mixin. Structural typing without action constraints.
- Decision state: `supported` that shared shape-plus-capability is useful. `undetermined` whether Interface is a base primitive.

### C-004 `governed action`

- Source term: Action type / action
- Domain distinction: A named, parameterized, permissioned attempt to change operational state
- Evidence: `E-010`, `E-012`, `E-018`, `E-022`
- Source-specific form: Transactional property and link edits, optional generated CRUD, optional webhooks, Scenario fork
- Alternative interpretations: Command, intent, decision, or capability with separate stages
- Decision state: `supported` that named governed verbs exist in production. `undetermined` that every mutation must be one.

### C-005 `object set`

- Source term: Object set
- Domain distinction: A saved collection of identifiable things, either enumerated or defined by a predicate
- Evidence: `E-003`, `E-015`
- Source-specific form: OSS resource with static keys or dynamic filters, temporary or permanent
- Alternative interpretations: Query result. First-class set type in the language.
- Decision state: `hypothesis` that OS needs a language-level set. `supported` that production apps need reusable collections.

### C-006 `pipeline-authored current state`

- Source term: Backing datasource / Funnel / writeback
- Domain distinction: Operational objects whose values are projected from external systems and then overlaid with user edits
- Evidence: `E-001`, `E-005`, `E-014`, `E-017`
- Source-specific form: Merge-in-pipeline plus precedence rules plus Action edit log keyed by primary key
- Alternative interpretations: Ontology owns truth and sources are observations. Competing claims remain first-class.
- Decision state: `supported` as Palantir's brownfield design. `hypothesis` that it is a compatibility tradeoff.

### C-007 `current-state plus amendment history`

- Source term: Time Machine anti-pattern / Contract Amendment / edits history / time series property
- Domain distinction: The living entity stays one object. Prior values become linked records or a changelog.
- Evidence: `E-019`, `E-014`
- Source-specific form: Amendment object type, time-series property, or storage edit history
- Alternative interpretations: Bitemporal facts. Event objects that generate facts. Immutable snapshots.
- Decision state: `supported` as Palantir guidance. `undetermined` for OS time.

### C-008 `observation-on-value`

- Source term: Struct with datasource, confidence, reasoning
- Domain distinction: A value may carry how it was produced
- Evidence: `E-021`
- Source-specific form: Struct fields on a property, especially LLM output
- Alternative interpretations: Separate Observation or Claim objects with provenance edges
- Decision state: `hypothesis`

### C-009 `agent as scoped actor`

- Source term: AI agent / agent swarm
- Domain distinction: Software actors that propose or apply Actions under inherited or project security
- Evidence: `E-022`, `E-023`
- Source-specific form: Agent inherits human or project scope. Approval can sit in the same operational app.
- Alternative interpretations: Agent as a first-class Principal with explicit delegation, purpose, and revocation
- Decision state: `supported` that agents use the same Action and security model. `undetermined` for `as` versus `on behalf of`.

## Invariants

### I-001 `user edits attach to primary key`

- Statement: An Action edit is stored against the object's primary-key value. If that value changes, the edit is no longer attached to the intended object.
- Scope: Foundry object types with user edits, as documented
- Evidence: `E-005`
- Failure case: Non-deterministic keys drop edits and links across pipeline rebuilds
- Falsifier: A documented identity layer that relocates edits across key changes without deletion
- Decision state: `supported` for Palantir. `hypothesis` as a general identity law.

### I-002 `action submit requires all criteria`

- Statement: An Action does not commit unless every submission criterion evaluates true at submit time.
- Scope: Foundry Action types
- Evidence: `E-012`
- Failure case: A planner commits a live aircraft change without being a flight controller and without Scenario context
- Falsifier: A documented path that commits Ontology edits while criteria fail
- Decision state: `supported`

### I-003 `one-to-one links may be violated`

- Statement: Declared one-to-one cardinality does not keep a second link from existing.
- Scope: Foreign-key link types
- Evidence: `E-006`
- Failure case: Two flights point at one aircraft under a one-to-one declaration and the engine accepts both
- Falsifier: A later page or runtime test showing engine-level rejection
- Decision state: `supported` as documented non-enforcement

### I-004 `external success does not imply ontology commit`

- Statement: A writeback webhook can succeed and the following Ontology write can still fail.
- Scope: Actions with writeback webhooks
- Evidence: `E-013`
- Failure case: SAP accepts a change, Foundry rolls back, the two worlds diverge
- Falsifier: A documented atomic protocol covering both sides
- Decision state: `supported`

### I-005 `side-effect success is not required for user-visible action success`

- Statement: Ontology object changes can be reported successful before side-effect webhooks run.
- Scope: Actions with side-effect webhooks
- Evidence: `E-013`
- Failure case: User sees success, notification or external write never happens
- Falsifier: Docs that block success until all side effects finish
- Decision state: `supported`

## Candidate laws

### L-001 `verbs are required for operational ontology`

- Statement: A shared object model without named, governed operations is a dashboard, not an operational ontology.
- Evidence: `E-002`, `E-010`, `E-022`, `E-024`
- Independent convergence: `research/reference-landscape.md` records the same lesson from Open Foundry, ObjectStack, and Moqui Services. Those notes are landscape summaries, not this issue's evidence records.
- Known limits: Palantir still mutates objects through pipelines and automations.
- Counterexamples: `X-001`
- Decision state: `hypothesis`

### L-002 `attributed relations need identity`

- Statement: If a relationship has role, interval, status, or its own actions, it is an identifiable thing, not an edge with no properties.
- Evidence: `E-007`, `E-008`
- Independent convergence: RFC-0001 states the same hypothesis. That is a design claim, not independent production evidence.
- Known limits: Palantir implements this as an object plus two links, then optional link-type sugar.
- Counterexamples: `X-002`
- Decision state: `hypothesis`

### L-003 `shared capability should be a contract, not a god type`

- Statement: When several kinds share properties, links, or actions, the shared shape is a contract those kinds implement.
- Evidence: `E-009`, `E-025`
- Independent convergence: none in this corpus
- Known limits: Palantir's contract is only partly executable across Workshop and some function languages.
- Counterexamples: `X-003`
- Decision state: `hypothesis`

### L-004 `action-only mutation is not Palantir's law`

- Statement: Palantir uses Actions for human and agent decisions. It uses pipelines, streams, and automations for other writes. Treating Action as the only write is a stronger claim than this corpus supports.
- Evidence: `E-014`, `E-018`, `E-011`
- Independent convergence: none
- Known limits: User-facing applications are told to go through Actions.
- Counterexamples: `X-001`
- Decision state: `supported` as a reading of Palantir. This does not reject RFC-0001. It narrows what Palantir can be cited as proving.

### L-005 `brownfield ontologies collapse source conflict at ingest`

- Statement: Palantir's recommended multi-source identity is merge-in-pipeline, one object, and precedence. It is not competing first-class claims.
- Evidence: `E-017`, `E-005`, `E-016`
- Independent convergence: none
- Known limits: MDOs keep per-source markings on properties. That is access control, not competing truth.
- Counterexamples: `X-004`
- Decision state: `supported` for Palantir. `undetermined` for OS.

### L-006 `palantir time is current state plus history objects`

- Statement: Palantir's documented temporal model is one living object plus amendments, time series, or edit logs, not bitemporal facts on every property.
- Evidence: `E-019`, `E-003`
- Independent convergence: none
- Known limits: Action log and edits history may be enough for some audits.
- Counterexamples: `X-005`
- Decision state: `supported` for Palantir. `undetermined` for OS.

## Counterexamples

### X-001 `pipeline inventory write without a business action`

- Targets: `L-001`, `L-004`, RFC-0001 Action-only mutation
- Setup: Quantity crosses a threshold. A pipeline sets `inventoryStatus` on the object. No user or agent submits an Action.
- Falsifying result: If RFC-0001 requires every meaningful mutation to be a named Action, Palantir production guidance already violates that reading.
- Observed result: `E-018` recommends the pipeline write. `E-014` says Funnel indexes it. not run against a live tenant.
- Consequence: Narrow RFC-0001. Either pipeline projection is not a "meaningful mutation", or Action-only mutation is not what Palantir proves.
- Decision state: `hypothesis`

### X-002 `employment as a direct link`

- Targets: `L-002`, RFC-0001 Relator question, scenario S-006
- Setup: Person P works for Organization O with start, end, position, suspension, and later termination, stored only as `worksFor`.
- Falsifying result: If workflows can query role, interval, and Suspend/Terminate without an employment object, attributed-relation identity is unnecessary.
- Observed result: not run. `E-008` predicts ambiguity and lost metadata.
- Consequence: Leave `L-002` as `hypothesis`. This is a kill-test, not a result.
- Decision state: `hypothesis`

### X-003 `interface without runtime support`

- Targets: `L-003`, RFC-0001 Interface
- Setup: Three types implement `Inspectable`. A Workshop app must schedule inspections. Workshop does not support interfaces.
- Falsifying result: If builders must duplicate actions per type, Interface is documentation, not an enforcement primitive.
- Observed result: `E-009` says Workshop support is not there. Structural guidance says define the interface anyway and duplicate temporarily.
- Consequence: Narrow Interface to "authoring contract" until enforcement is universal. Do not treat Palantir Interface as proof that OS Interface is already a closed primitive.
- Decision state: `supported` as a Palantir product gap. `undetermined` for OS.

### X-004 `two sources disagree on promised date`

- Targets: `L-005`, RFC-0001 Fact / observation, scenario S-011
- Setup: ERP says promised delivery 25 Aug. Spreadsheet says 27 Aug. Chat says 24 Aug. Palantir merge uses ERP precedence.
- Falsifying result: If operators still need all three claims and their provenance after the merge, precedence-at-ingest loses meaning.
- Observed result: not run. `E-017` tells builders to pick precedence. `E-021` can stash source on a struct, not as rival claims.
- Consequence: Palantir does not support first-class contradictory claims. OS cannot cite Palantir as having solved open question 3.
- Decision state: `hypothesis`

### X-005 `backdated stock movement`

- Targets: `L-006`, RFC-0001 time, scenario S-007
- Setup: On 10 Aug the system shows 100 units. On 12 Aug a document proves 20 units left on 8 Aug.
- Falsifying result: If current-state plus amendment objects cannot answer both "stock as known on 10 Aug" and "stock now believed for 10 Aug", Palantir time is insufficient for OS.
- Observed result: not run. `E-019` offers amendments and edits history, not two time axes.
- Consequence: Leave OS bitemporality `undetermined`. Palantir is not evidence that two time axes are unnecessary.
- Decision state: `hypothesis`

### X-006 `timeout after possible external success`

- Targets: `I-004`, `I-005`, RFC-0001 Action versus Event versus Effect, scenario S-004
- Setup: Writeback webhook is sent. The connection times out. The remote system may have applied the change.
- Falsifying result: If Palantir can only fail or succeed the Action, `unknown` is missing.
- Observed result: not run. `E-013` names success and failure, not timeout-as-unknown.
- Consequence: Kill-test for treating Action commit as proof of real-world effect.
- Decision state: `hypothesis`

### X-007 `stale scenario merge`

- Targets: `C-004`, `E-012`, RFC-0001 Action approval, scenario S-003
- Setup: A scenario is built at 10:01 on inventory 20. A receipt of 800 posts at 10:06. A human merges the scenario at 10:07.
- Falsifying result: If merge does not re-evaluate submission criteria against live objects, Palantir preview is not a safe approval protocol.
- Observed result: not run. `E-012` evaluates criteria at submit and special-cases Scenario context. Re-read-after-approve is not documented on the pages read.
- Consequence: Do not cite Palantir Scenario as the Ontologiq-style propose, approve, revalidate, execute pattern.
- Decision state: `undetermined`

## Disagreements

### D-001 `are actions the only user write?`

- Claim A: `issue-0035-palantir-ontology-primitives#E-010`
- Claim B: `issue-0035-palantir-ontology-primitives#E-018`
- Conflict: Overview language says users change objects by applying actions. Anti-pattern guidance says many object writes should be pipelines or automations, and object creation can generate CRUD actions.
- Evidence for A: `E-010`, `E-022`
- Evidence for B: `E-018`, `E-011`, `E-014`
- Possible explanation: "Users" means interactive operators. Batch and integration writes are a second authority. Generated CRUD is a bootstrap, not the intended modeling style.
- Resolution test: Trace a live tenant or implementation for any non-Action user edit path, including inline table edits and OSDK writes.
- Status: `open`
- Resolution: unresolved

### D-002 `is an event an object?`

- Claim A: `issue-0035-palantir-ontology-primitives#E-003`
- Claim B: `issue-0035-palantir-ontology-primitives#E-019`
- Conflict: Object Type is defined as entity or event. Time Machine says do not multiply objects for versions of one entity. It does not say how an occurrence differs from an enduring thing.
- Evidence for A: `E-003`
- Evidence for B: `E-019`
- Possible explanation: Palantir uses one storage primitive and leaves entity versus event as a modeling convention.
- Resolution test: Find official guidance that events are immutable, or that Flight is an event type with different edit rules than Employee.
- Status: `open`
- Resolution: unresolved

## Runtime consequences

### R-001 `named write gate`

- If claim survives: `L-001`
- Required property: Interactive humans and agents must share one authorized operation type. Surfaces must not each reimplement the verb.
- Evidence: `E-010`, `E-022`, `E-023`
- Non-requirement: Workshop, OSDK, or any particular UI compiler
- Decision state: `hypothesis`

### R-002 `external effect can diverge`

- If claim survives: `I-004`, `I-005`
- Required property: A runtime must represent local commit, remote accept, remote reject, and not-yet-known as different outcomes.
- Evidence: `E-013`
- Non-requirement: Webhooks, SAP, or a two-phase commit product
- Decision state: `hypothesis`

### R-003 `identity key stability`

- If claim survives: `I-001`
- Required property: Edits, links, and history must survive key correction or be explicitly migrated. Random or row-number keys are unsafe.
- Evidence: `E-005`
- Non-requirement: A single primary-key column
- Decision state: `hypothesis`

### R-004 `cardinality enforcement is optional in palantir`

- If claim survives: `I-003`
- Required property: If OS wants exclusive or one-to-one relations, it cannot inherit Palantir's advisory cardinality. Enforcement must be stated.
- Evidence: `E-006`
- Non-requirement: Graph database or join tables
- Decision state: `supported` as a Palantir limit. `hypothesis` that OS should enforce.

### R-005 `query collections are not the domain`

- If claim survives: `C-005`
- Required property: Saved sets, filters, and search limits may be runtime services. They should not be smuggled in as kinds of business thing.
- Evidence: `E-015`, `E-004`
- Non-requirement: OSS, Elasticsearch, or Spark aggregations
- Decision state: `hypothesis`

## Semantic map

```text
Palantir Language
  semantic
    ObjectType + Property + primary key
    LinkType (FK | join table | object-backed)
    Interface (properties, link constraints, action constraints)
  kinetic
    ActionType (params, rules, submission criteria, side effects)
    Function (logic, may back an Action)
    Automation (condition -> Action or notification)
  security
    object / property policies (view)
    submission criteria (write)
    markings / RVs / MDOs (source-shaped view)
  query
    ObjectSet (static keys | dynamic filter)
    Object Set Service
  history
    Action log objects
    edits history
    amendment / time-series objects
  surfaces
    Workshop, Object Explorer, Quiver, Vertex, OSDK, REST, agents

Write paths into the same object
  datasource / pipeline / stream -> Funnel
  Action edits                  -> Actions service -> Funnel
```

## Preserve, challenge, greenfield difference

Preserve if independent sources later converge:

- Named Actions as the human and agent write for decisions
- Action log as data, not only an audit file
- Object-backed / relator-like treatment of attributed relationships
- Interfaces as shared capability, not god types
- Security expressed on the ontology, aligned to domain boundaries
- One object per real-world entity, not one type per source system or department
- Store a fact once. Derive counts and copied names.
- Scenario or preview before live commit
- Agent access through the same Actions and policies, with inherited or project scope
- Names that a domain expert and an agent can both navigate

Challenge as compatibility or product tradeoffs:

- Ontology as a layer on datasets rather than an owner of operational truth
- Entity and event as one Object Type
- Advisory cardinality
- Pipeline precedence instead of competing claims
- Current-state object plus amendments instead of explicit valid and known time
- Observation stuffed into structs
- Generated CRUD Actions
- Interface contracts that Workshop cannot execute
- Webhook writeback that can accept remotely and fail locally
- Side effects after user-visible success
- Scale caps (properties, objects per Action, Search Around) treated as semantic limits
- Dataset/row teaching analogy becoming the metamodel

If OS starts without Foundry legacy, the docs push toward:

- Own commit-time truth, treat sources as observations
- Split enduring thing, occurrence, and claim
- Enforce cardinality and exclusivity where the domain requires it
- Keep attributed relationships as identifiable things
- Make Interface executable everywhere it is declared
- Keep Action for decisions, and say plainly what a projection write is
- Represent `unknown` external outcomes
- Re-validate at commit after preview or approval
- Do not answer OS time, Fact, or Relator from this corpus alone

## Dependent research

Consumes:

- `research/reference-landscape.md` Palantir section, as prior landscape only. Not used as evidence records.
- `rfcs/0001-metamodel-hypothesis.md` as the hypothesis under test. Not used as evidence.

Related issues that can consume these records without waiting for more Palantir pages:

- #4 Action
- #6 time
- #8 provenance
- #11 principals
- #12 query, object sets, interfaces
- #36 modern operational-ontology runtimes
- #55 Action-only mutation kill test
- scenarios S-003, S-004, S-006, S-007, S-011

## Open questions

These stay `undetermined`. They are not answers to `docs/open-questions.md`.

- Does Palantir ever treat Event objects as immutable? `undetermined`
- What is the exact Funnel merge rule when a pipeline row and an Action edit collide? `undetermined`
- Do submission criteria re-run on scenario merge after the world changed? `undetermined`
- Are shared properties a second reuse mechanism with different evolution rules than interface properties? `undetermined`
- How does ontology revision pin historical Action explanations? Interface edits are breaking, but content-addressed revision is not documented in the pages read. `undetermined`
- Is Automation a primitive or Action composition? `undetermined`
- Can an agent hold a purpose-scoped delegation that is not the full human or project grant? `undetermined`

## Licensing

Concepts and documented behavior only. Palantir documentation is proprietary. No Foundry code, schemas, or API payloads were pasted. No implementation reuse is proposed.
