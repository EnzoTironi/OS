# Evidence

Kind and decision state on every card. Metrics from vendor labs are claims.

## Papers to read first

### EV-P1. LOM-action: event, then sandbox graph, then decision

- Kind: source artifact
- Decision state: supported for the published architecture. undetermined for the numbers
- Source: P-LOM-ACT
- Pressures: Q4, Q5, Q10, Q20. The collar conversation

Yonyou AI Lab’s April 2026 paper states a failure mode we already named in prose. General agents answer from the unrestricted knowledge space. They do not first simulate how the active business scenario reshapes that space. Prompted rules are soft preferences. The model can still walk the full graph.

Their pipeline is ordered. Event arrives. Scenario conditions in the enterprise ontology parse into sandbox operations. A working copy of the graph mutates under a unique graph id. The authoritative ontology is not touched. Decisions derive only from the evolved graph. Dual mode: registered skill, or free reasoning. A frontier model may be invoked only as a skill node with an authorization contract. Output is re-grounded by “LOM-as-Judge” before a write to the session ontology. Every mutation is logged for replay.

They name **illusive accuracy**: high answer accuracy minus low tool-chain F1. Claimed contrast: LOM-action 93.82% accuracy and 98.74% tool-chain F1. Doubao-1.8 and DeepSeek-V3.2 about 80% accuracy and 24–36% F1. Treat the percentages as lab claims. Keep the metric. It is the right eval for “the model is smarter than the CEO.”

They also reframe long context. The problem is not window size. Raw history is semantically flat. They replace it with typed session-ontology deltas. Same event on the same ontological state should yield the same decision regardless of chat position.

**Not a steal of code.** No public engine. This is a competitor paper that formalizes the collar we have been talking about. Upside sits in the skill registry. Collar sits in sandbox mutation plus authorization on every delegation.

**Counterexample needed.** A real NF-e or inventory commit that cannot be expressed as a graph mutation in an isolated copy, or a timeout that the sandbox treats as a known Event.

### EV-P2. LOM: construct, align, reason

- Kind: source artifact
- Decision state: supported for the training recipe. undetermined for “deterministic enterprise reasoning”
- Source: P-LOM

The earlier paper (Feb 2026, arXiv:2602.00029) trains a 4B model on a dual-layer enterprise ontology (structured DB plus text), then three stages: ontology instruction fine-tune, text-ontology grounding, multi-task instruction tune. Claimed 89.47% on their graph-reasoning bench, above DeepSeek-V3.2.

Useful as an induction recipe for Q20. Dangerous if read as “the small model *is* the ontology.” Weights are not a pinned revision. Replay still needs the graph and the function versions, not the 4B checkpoint.

### EV-P3. Zep / Graphiti: bitemporal agent memory

- Kind: source artifact
- Decision state: supported for the published memory model
- Sources: P-ZEP, OSS-GRAPHITI

Graphiti (Apache-2.0) builds a temporal context graph from episodes. Facts have validity windows. Old facts are invalidated, not deleted. Provenance points back to the episode. Ontology may be prescribed (Pydantic types) or learned. Hybrid retrieval: embedding, BM25, traversal. Incremental updates. Zep the product sits on a proprietary graph engine. Graphiti the library brings your own Neo4j / FalkorDB / Kuzu / Neptune.

This is the strongest OSS hit on Q7 that Wave A did not open. It is **memory for an agent**, not a system of record. Do not store on-hand quantity here.

### EV-P4. SPIRES / OntoGPT: extract into a schema, do not invent the schema

- Kind: source artifact
- Decision state: supported for the extraction method
- Sources: P-SPIRES, OSS-ONTOGPT, OSS-LINKML

OntoGPT fills a LinkML schema from text with recursive extraction and ontology grounding (OBO / OAK). The paper is biomedical. The mechanism is general. Schema first. Model second. That is the right direction for corpus induction (#50), not for commit.

LinkML (Apache-2.0) is YAML in, JSON Schema / RDF / Python out. Authoring toolchain. Not a business primitive. Constitution §6 still applies.

### EV-P5. GraphRAG and LightRAG are retrieval

- Kind: source artifact
- Decision state: supported
- Sources: P-GRAPHRAG, P-LIGHTRAG, OSS-MSGRAPHRAG, OSS-LIGHTRAG

Microsoft GraphRAG (MIT, research demo) extracts a graph from a corpus, clusters communities, summarizes, retrieves. LightRAG (MIT, EMNLP 2025) is the cheaper dual-level variant. Yonyou’s own March talk cited LightRAG as retrieval under LOM. Both improve Q&A. Neither mutates a ledger. Neither is an Action.

## OSS to inspect

### EV-O1. TrustGraph — OntologyRAG

- Kind: source artifact
- Decision state: hypothesis as a retrieval stack. rejected as a kernel
- Source: OSS-TRUSTGRAPH

Apache-2.0. Ontology plus holons (entity, relation, evidence) plus embeddings plus provenance plus retrieval policy. Three RAG modes: document, graph, ontology. OntologyRAG constrains extraction to OWL classes and properties. Workbench imports OWL/Turtle. Agent orchestration is ReAct / plan-then-execute / MCP.

Steal the cut: schema-free GraphRAG for discovery, OntologyRAG when type precision is a compliance requirement. Do not steal Cassandra-plus-everything as OS storage.

### EV-O2. Eclipse BaSyx — plant twin, not ERP

- Kind: source artifact
- Decision state: supported as Industry 4.0 middleware. undetermined as an OS surface
- Source: OSS-BASYX

Eclipse calls BaSyx an Industry 4.0 operating system. It implements Asset Administration Shell types 1 (static), 2 (live), 3 (active negotiation). OPC UA and MQTT. Registry, submodel server, MES-ish lot-size-1 hooks. Testimonials from SAP, ZF, IDTA.

This is the OSS twin of the COSMOPlat / Huawei industrial layer. IEC 63278 was parked unopened in the #78 watch. The product page is now enough to say: plant assets get a standard shell. That shell is not a journal and not a party model.

**Candidate implication.** Virtualize a machine through AAS. Own the goods event in OS. Do not import the AAS metamodel as RFC-0001.

### EV-O3. CCO and EMMO — mid-level formal stock

- Kind: source artifact
- Decision state: hypothesis as adversaries, same class as IOF
- Sources: OSS-CCO, OSS-EMMO. IOF already in #78 DISC-002

Common Core Ontologies sit on BFO. Mid-level: agent, time, geospatial, information, artifact. EMMO is a materials and manufacturing top/mid stack with mereocausality. Both are OWL you can clone. Neither executes a ShipOrder.

Use them as kill tests for Q2 and Q14. Do not import OWL into the MIT core.

### EV-O4. E2B — code sandbox, not business sandbox

- Kind: source artifact
- Decision state: supported as a physical evaluator for generated code
- Source: OSS-E2B

Firecracker microVMs for agents that run shell or Python. Pause/resume. This is the collar for *generated code*. LOM-action’s collar is a *graph copy*. Different blast radius. If OS generates a checker or a report script, E2B-class isolation is the worker. It does not authorize PostJournalEntry.

### EV-P6. FAOS paper, low trust

- Kind: source artifact
- Decision state: undetermined
- Source: P-FAOS

Neurosymbolic Role / Domain / Interaction ontologies. Claims 600 runs, 21 verticals, 650+ agents on a private platform. No public engine opened. Keep the “asymmetric coupling” phrase (ontology constrains inputs more than outputs) as a warning. Do not cite the headcount.

## What this does to the stack we already drew

```text
Papers / OSS that fit each layer

Plan, extract, retrieve
  OntoGPT, LinkML, GraphRAG, LightRAG, TrustGraph OntologyRAG, LOM training

Session memory (not truth)
  Graphiti / Zep paper

Scenario sandbox before commit
  LOM-action (paper only, no OSS)

Named Action + permission
  still AuthZEN / Cedar / OpenFGA from #78 and #8
  not NeMo, not E2B

Plant twin
  BaSyx AAS, EMMO, IOF, CCO

Ledger
  nothing new in this pass
```

The hole is still the same. Nobody open-sourced a refuse-closed executable ontology that owns inventory and tax. The papers that understand the hole are vendor preprints. The OSS that is good is memory, extraction, retrieval, or the plant shell.
