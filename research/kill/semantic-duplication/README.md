# Semantic duplication kill test

- Artifact ID: `issue-0072-semantic-duplication`
- Issue: <https://github.com/EnzoTironi/OS/issues/72>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Research angle: attempt to falsify OS from the integration boundary
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This folder does not edit `rfcs/0001-metamodel-hypothesis.md`. It does not invent answers into `docs/open-questions.md`. It does not propose a target schema.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is never `accepted`.

## Question

Assume companies keep external ERPs, marketplaces, banks, fiscal systems, machines, spreadsheets, and SaaS. Does a new ontology engine reduce semantic duplication, or does it add mappings and stale replicas?

Compare four placements of state.

1. Virtual or federated ontology. Query or write through to the source. Do not keep a second row.
2. Materialized ontology. Index or copy source rows into ontology objects.
3. Source-of-truth replacement. Users stop writing the source for that grain.
4. Hybrid. Choose per grain.

Test lifecycle ownership on Product creation, Sales Order ownership, the moment OS becomes system of record, source users who bypass OS, and write-conflict rules.

## Verdict

**Folder decision state.** The reading of the thesis as one executable ontology that becomes the organization's system of record for Product, Sales Order, inventory, cash, and fiscal documents, while those external writers remain, is `rejected`.

A mapping is not a deleted model. A replica that anyone else can still write is a second fact. Microsoft ships that product as dual-write. SAP shipped it as Customer/Vendor Integration around Business Partner. Palantir ships it as Funnel plus user-edit overlays. All three keep the source model and add a sync office.

The reading that survives is `hypothesis`. One shared metamodel may still earn its keep if it virtualizes foreign state, owns only grains where OS is the only writer, and refuses the rest. That is not a smaller ERP. It is a typed boundary.

Whether that hybrid's mapping cost outweighs the ontology benefit is `undetermined` for a refuse-by-default design, and `supported` as a kill for blanket materialization. Blanket materialization creates more semantic duplication than it removes.

Success for this issue is a change to the thesis if evidence warrants it. The evidence warrants a change to the *scope* of "external systems" in the thesis diagram. Those boxes are not surfaces over one store. Many of them remain systems of record. Open question 3 stays open. This folder does not answer it.

## Strongest argument against a materialized ontology

The standing assumption in issue 72 is the real world. Companies will keep the ERP, the marketplace, the bank, the SEFAZ authorization service, the machine, the spreadsheet, and the SaaS. A new ontology that copies Product, Customer, and Sales Order into itself has not removed those models. It has added a fourth writer and a merge rule.

Microsoft's own training says the choice is data ownership. Dual-write when you want a replicated dataset. Virtual tables when the row must stay in finance and operations. Palantir's own docs say the Ontology "sits on top of" datasets and virtual tables and is defined "by mapping existing datasources". Mapping is the product. The indexed object is still a copy. Virtual tables reduce dataset storage. Objects backed by those tables still reindex.

Writeback is not two-phase commit. Palantir says the external request may succeed and the Ontology change may fail. Microsoft says dual-write does not support distributed transactions and may create a product receipt in Dataverse that Supply Chain Management never posted. SAP keeps a Postprocessing Office because Business Partner and Customer/Vendor drift.

Bypass is not an edge case. Dual-write is not triggered by `doInsert`, `doUpdate`, or `doDelete`. Shop-floor MES, bank portals, marketplace seller consoles, SEFAZ contingency emission, and spreadsheets write the source without asking OS. If those paths stay open, OS is a stale replica with a nicer type system.

SEFAZ/MS states the legal point without metaphor. NF-e validity comes from a qualified electronic signature and from authorization of use granted by the state finance secretariat, before the taxable event. OS cannot own that document by storing a copy of the XML.

## Candidate placement model

This is a research sketch, not a schema and not an RFC.

```text
Per grain (specification, SKU, offer, commitment, fiscal document, bank posting):

  refuse
    legally issued identity
    grain OS would collapse
    source remains a writer and 2PC is required for correctness

  virtualize
    source remains system of record
    reads or light writes that must run source logic
    no offline replica requirement

  materialize a projection
    derived, not independently edited
    named valid time and knowledge time
    stale-tolerant search or join
    merge rule published, loser kept

  own
    OS is the only writer
    OS has legal capacity if the grain is a legal act
    bypass of OS is a defect, not a supported path
```

A query that treats a virtualized Sales Order as an OS-owned object is incomplete. A write that copies a SEFAZ-authorized NF-e into an editable ontology object is a second fiscal document.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Versioned locators used this session |
| `evidence.md` | reference | Evidence cards E-001 through E-028 |
| `approaches.md` | explanation | The four placements and what each actually duplicates |
| `lifecycle.md` | explanation | Product, Sales Order, system of record, bypass, conflict |
| `matrix.md` | reference | Convergence, divergence, source-artifact map |
| `candidate-laws.md` | explanation | Laws L-001 through L-012 |
| `counterexamples.md` | reference | Scenario cards X-001 through X-016 |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

Cited via `git show` on the named branch. This folder does not copy those trees.

- Palantir corpus, `origin/cursor/issue-35-corpus-cfd8` at `a2bb627d9929d9bdd332958cf4b482b0ba9d61af`, `research/notes/issue-0035-palantir-ontology-primitives.md`
- Standards, `origin/cursor/issue-38-corpus-cfd8` at `f49621af098d28ae6132ac9378d2371c90ee0a88`, `research/standards/`
- Unified ontology kill, `origin/cursor/issue-55-kill-cfd8` at `5f4233579cf3057783775126afa64c39ed631353`, `research/kill/unified-ontology/`
- Authority kill, `origin/cursor/issue-60-kill-cfd8` at `0a8551c04f25c0feefd8ed616d14e3ff605ed047`, `research/kill/authority/`
- Multi-entity, `origin/cursor/issue-31-domain-cfd8` at `59a5c79f939518f5cacccced8ace26e93be4a91b`, `research/domain/multi-entity/`
- Product, `origin/cursor/issue-15-domain-cfd8` at `80637d0ecadb9e123afc773a10e16c055ceeb2eb`, `research/domain/product/`
- Order-to-cash, `origin/cursor/issue-16-domain-cfd8` at `9d82f27e9cea2a8d2d71ed77de9eaa553121e6b5`, `research/domain/o2c/`

`cursor/issue-68-kill-cfd8` was not on the remote.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `counterexamples.md`.
9. **Runtime pressure.** Each law names a runtime consequence without selecting a runtime.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Default `hypothesis`. Never `accepted`.

## How to read this

Start with the verdict above and L-001, L-002, L-005, and L-011. Use `approaches.md` when a later issue asks which of the four placements to pick. Use `lifecycle.md` when a later issue asks who creates a Product or who owns a Sales Order. Use `matrix.md` when a later issue asks what Palantir, Microsoft, SAP, Salesforce, SPARQL, GraphQL federation, EPCIS, or SEFAZ actually said.

Do not treat Dual-write, Funnel, CVI, External Object, or `SERVICE` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. ERPNext, Odoo, and Moqui appear only through sibling notes and public documentation already cited there. No product tree was cloned.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. The pressure is on the thesis diagram's "external systems" box and on open questions 3, 5, 15, and 21. The candidate laws below are evidence, not a primitive list.
