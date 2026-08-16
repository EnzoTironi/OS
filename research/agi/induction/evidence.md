---
issue: 50
kind: reference
fetched: 2026-08-16
decision_state: per block
---

# Evidence

Each block names a **kind**. Source IDs live in [sources.md](sources.md). Decision state is never `accepted`.

## Question

What independent sources actually do when they claim to learn an ontology, debate a claim, or encode reservation, production, and commercial roles?

## Method evidence

### E1. The ontology-learning layer cake extracts terms, then taxonomies, then rules

**Kind.** domain evidence  
**Source.** S-OL-CAKE  
**Decision.** `supported` as a description of that literature

Buitelaar, Cimiano, and Magnini organize ontology development as a layer cake of increasing complexity. The layers they name are terms, synonyms, concepts, concept hierarchies, relations, and rules. The volume treats ontology learning as support for creating and maintaining an ontology from text.

**Interpretation.** That pipeline can list names that appear in ERP docs. It does not, by itself, decide whether a name is a Kind, a Role, a document, or a projection.

**Runtime consequence.** A later agent that stops after term extraction has summarized a corpus. It has not induced a domain law.

### E2. Classic ontology learning still assumes an ontology engineer

**Kind.** domain evidence  
**Source.** S-OL-SURVEY, S-SABOU  
**Decision.** `supported`

The CEUR survey describes Text2Onto as a tool that builds a probabilistic ontology model and still presents primitives to a human. Sabou extracts candidate service ontologies from software documentation and checks them against a hand-built ontology of the same domain.

**Interpretation.** First-party ontology-learning work treats automation as an aid. It does not claim the engineer can leave.

**Counterexample needed.** A first-party paper that reports unsupervised induction of enterprise invariants, with a human only as a reader of a finished law set, and with those laws surviving independent corpora. Not found this session.

### E3. Code-to-ontology tools often model the programming language, not the business

**Kind.** source-system artifact  
**Source.** S-CODEONT  
**Decision.** `supported` as a warning

CodeOntology defines an ontology of object-oriented programming constructs and serializes Java into RDF. The published use is expressive queries over source code.

**Interpretation.** Mapping `WorkOrder` class fields into OWL classes is this pattern. It is not the job in issue 50.

**Counterexample.** Sabou's API-doc extraction aims at the domain of the software, not the AST. That is closer. It still needed a hand-built gold ontology.

### E4. Palantir's public ontology maps existing datasources into objects and actions

**Kind.** source-system artifact  
**Source.** S-PAL, S-PAL-IF  
**Decision.** `supported` as a product description. `rejected` as an OS kernel

Palantir describes the Ontology as an operational layer on datasets, tables, and models. Object types and link types are the semantic elements. Action types and functions are the kinetic elements. An interface "describes the shape of an object type and its capabilities."

**Interpretation.** That is a way to operate on already-chosen types. It is not a protocol for inferring which distinctions belong to the domain.

**Runtime consequence.** Wave B must not pick this vendor stack as the OS kernel. Standing order 7.

### E5. OS already states an evidence extraction loop

**Kind.** source-system artifact  
**Source.** S-PROGRAM, S-README, S-CONST  
**Decision.** `supported` as project rule. `hypothesis` as a complete protocol

`docs/research-program.md` already lists identify the question, inspect several systems, extract concepts and behavior, extract invariants, inspect historical fixes, record disagreements, propose the smallest distinction, generate counterexamples, revise or reject. `research/README.md` forbids one-line feature summaries. Constitution rule 2 says model the world, not the source schema. Rule 4 says independent convergence raises confidence. Rule 16 forbids pasting copyleft implementation.

**Interpretation.** Issue 50 asks to design and test that loop, not to declare the current swarm finished.

### E6. Multi-agent debate can change answers. It is not a truth procedure

**Kind.** domain evidence  
**Source.** S-DEBATE, S-HUANG  
**Decision.** `supported` for both the gain and the limit

Du et al. have several model instances propose answers, then critique one another over rounds. They report better factuality and reasoning than single-agent chain-of-thought on their tasks. They also report cases where every agent starts wrong and later agrees on a correct answer. Huang et al. later compare debate to self-consistency at equal response count and find no advantage in their reasoning setup.

**Interpretation.** Debate is useful as a disagreement surface. Consensus is not evidence.

**Runtime consequence.** A protocol that promotes a law because agents agreed, without new pointers, is invalid.

### E7. Reflexion and Self-Refine need a feedback signal

**Kind.** domain evidence  
**Source.** S-REFLEX, S-REFINE  
**Decision.** `supported`

Reflexion stores a verbal summary of task feedback in episodic memory and retries. Self-Refine uses one model as generator, critic, and refiner and reports human preference gains on writing and similar tasks.

**Interpretation.** These loops improve drafts when a compiler, a unit test, or a human preference signal exists. Ontology induction does not yet have that oracle.

### E8. Intrinsic self-correction without external feedback can make reasoning worse

**Kind.** counterexample  
**Source.** S-HUANG  
**Decision.** `supported`

Huang et al. define intrinsic self-correction as an LLM revising itself with no external feedback. On reasoning benchmarks, performance often drops. They argue that earlier gains used oracle labels to decide when to stop, which is not self-correction.

**Interpretation.** A lone ontologist agent that "reviews its own law" is this setting. The protocol must feed it independent sources, tests, or a human gate.

**Runtime consequence.** Do not treat a second pass over the same prompt as a new evidence family.

## Domain evidence used only as a protocol benchmark

These blocks do not re-research the domains. They record the minimum first-party facts the protocol must be able to keep apart.

### E9. Reservation is documented as a purpose-tagged claim, not a stock movement

**Kind.** domain evidence  
**Source.** S-ERPN-RES, S-ERPN-WO-RES, S-ODOO-RES, S-ODOO-CONF, S-SIB-18 L-INV-04  
**Decision.** `supported` as a documented split. `undetermined` as the OS encoding

ERPNext v15 docs define stock reservation as setting aside quantity for a particular purpose or customer. The claim is a Stock Reservation Entry. Unreserve cancels that entry. Work-order reservation docs say reserved stock cannot be used in other transactions, and a material transfer to WIP moves the reservation from the source warehouse to the WIP warehouse.

Odoo 18 docs put reservation method on the operation type. At Confirmation, Manually, and Before scheduled date are the three methods. Receipt operations do not use reservation methods.

Sibling inventory law L-INV-04 states the same split and leaves ValueFlows encoding `undetermined`. ValueFlows resources expose accounting and on-hand quantity, not reserved quantity. See S-SIB-18 E-12.

**Source-system artifact.** Stock Reservation Entry. Odoo `reserved_quantity` on quants. Those names are not OS vocabulary.

### E10. ERPNext Work Order is an authorization. ERPNext Job Card is an execution record

**Kind.** domain evidence  
**Source.** S-ERPN-WO, S-ERPN-JC  
**Decision.** `supported` as ERPNext's documented split

ERPNext. "A Work Order is a document given to the manufacturing shop floor by the Production Planner as a signal to manufacture a certain quantity of a certain Item." Required, transferred, and consumed quantities are different fields. Planned operating cost comes from the BOM. Actual operating cost comes from Job Cards.

ERPNext. "A Job Card stores actual production information about a particular Operation performed on a particular Workstation." Job Cards are created from the Work Order. Completion of Job Cards updates Work Order progress. Version 16 adds Pending Qty so remaining quantity is not silently treated as process loss.

### E11. Odoo uses the words Work Order for an operation under a Manufacturing Order

**Kind.** source-system artifact  
**Source.** S-ODOO-WO, S-ODOO-MO13, S-SIB-19  
**Decision.** `supported` as a naming collision

Odoo 16. When a manufacturing order is created, work orders listed on the BoM Operations tab are created and assigned to a work center. The Work Orders feature is optional. Odoo 13. You can manufacture with only a manufacturing order, or divide that order into work orders defined by routings.

ERPNext uses "Work Order" for the authorization document. Odoo uses "Work Order" for one operation's execution. Same words. Different layers.

**Runtime consequence.** A term-matching inducer that merges those two Work Order types has failed the protocol.

### E12. ISA-95 and ValueFlows split request from report without using ERPNext names

**Kind.** domain evidence  
**Source.** S-ISA95, S-VF-PROC, S-SIB-19 L1  
**Decision.** `supported` for the layer split. `undetermined` for OS primitive names

OPC Foundation ISA-95 job-control text. A Job Order is a request for a unit of work. A Job Response is a report on work done for that Job Order. A Work Master is the procedure to follow.

ValueFlows. Process spans plan and observation. Commitments and economic events can attach to the same process instance. The pie example shows planned commitments and later events on one process, including a dropped pie that was not in the plan.

Sibling manufacturing L1. Specification is not authorization is not execution.

### E13. Customer and Supplier labels sit on relationships in ValueFlows and UFO

**Kind.** domain evidence  
**Source.** S-VF-EX, S-VF-AGENT, S-UFO, S-ONTOUML, S-SCEN S-005  
**Decision.** `supported` for "not a Kind." `hypothesis` for a native Role sort

ValueFlows agents are Person, Organization, or Ecological Agent. The published example defines `is supplier of` with inverse `is customer of` as an `AgentRelationshipRole` on an `AgentRelationship`. UFO treats Role as an anti-rigid sortal that instantiates in the scope of a relator. Customer is a textbook Role example in Guizzardi's CAiSE 2007 discussion of relational dependence.

Scenario S-005 asks whether organization B is two objects or one organization in two roles.

### E14. ERPNext still ships Customer and Supplier as two masters

**Kind.** source-system artifact  
**Source.** S-ERPN-CUST, S-SIB-14 E1 E2 E3  
**Decision.** `supported` as product encoding

ERPNext. A Customer is a person, business, or other organization that buys goods or services. Create a separate Customer for each independently billed party. Store people and locations as linked Contacts and Addresses. Disabled keeps history. Is Internal Customer marks one of your companies.

Sibling party notes record a second Supplier master and a Party Link that "does not merge the masters." That link is a workaround for one real party that buys and sells. It is not proof that Customer is a Kind.

**Interpretation.** A protocol that copies the two masters into OS types has summarized ERPNext. A protocol that records the two masters as evidence against "Supplier is a Kind" has induced.

### E15. Real-company messy data is not in this repository

**Kind.** counterexample  
**Source.** S-ISSUE-77, workspace scan 2026-08-16  
**Decision.** `undetermined` as an input class

Issue 77 asks whether candidate laws survive spreadsheets, ERP exports, marketplace data, messages, contradictory identifiers, and missing fields. No de-identified company corpus, spreadsheet, or export is in `/workspace` outside vendored skill trees.

**Runtime consequence.** Any law that claims to have been validated against real-company mess is false for this pass.

### E16. Homonyms, collapsed dates, and genuine conflicts are different contradiction types

**Kind.** candidate law  
**Source.** S-SCEN S-001 S-011, E11, S-CONST rule 3 caution in S-OQ item 3  
**Decision.** `hypothesis` as a typology. `supported` that the three cases exist in this repo's docs

S-001. Requested, promised, planned, and actual dates can share one field name and still be four facts. S-011. An ERP, a spreadsheet, and a chat can disagree about one promised date. E11. Two ERPs use one phrase for two layers.

**Interpretation.** A contradiction detector that only flags string inequality will miss homonyms and will over-flag collapsed modality.

**Runtime consequence.** The protocol must type disagreements before it asks a human to pick a winner.
