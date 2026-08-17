# Discarded or already opened

## Already in the corpus

Palantir, Open Foundry, Ontologiq, ObjectStack, OpenBKN, Xpert, Moqui, ERPNext, Odoo, REA, ValueFlows, UFO, PROV-O, FIBO, EPCIS, ISA-95, ISA-88, Temporal, Cedar, OpenFGA, XTDB, TigerBeetle, OCEL, AuthZEN, A2A, RDF 1.2, IOF README, SAP Knowledge Graph, Workday ASOR.

## Opened here and kept out of the kernel

| Item | Why it is not a foundation |
| --- | --- |
| Microsoft GraphRAG | Retrieval over a document corpus. Official repo says demo, not a product |
| LightRAG | Faster GraphRAG. Yonyou uses it as retrieval under LOM |
| NeMo Guardrails (not cloned) | Content and dialog rails. Does not know debit equals credit |
| E2B | Isolates generated code. Does not isolate a business Event |
| TrustGraph | Ontology-constrained RAG and an editor. Storage story is a kitchen sink |
| FAOS / P-FAOS | Platform paper, no inspectable tree |

## Not worth a first pass

Generic agent frameworks (CrewAI, AutoGen, LangGraph) as metamodel sources. They orchestrate tools. They do not define Action versus Event. Salesforce Agentforce and ServiceNow were already dropped in #78 for lack of a first-party mutation model.
