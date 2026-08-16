# Unified ontology kill test

- Artifact ID: `issue-0055-unified-ontology`
- Issue: <https://github.com/EnzoTironi/OS/issues/55>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Research angle: attempt to falsify the thesis that one executable ontology should model an organization
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This folder does not edit `rfcs/0001-metamodel-hypothesis.md`. It does not invent answers into `docs/open-questions.md`. It does not propose a target schema.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is never `accepted`.

## Question

Can one executable ontology preserve contextual meaning for an organization without becoming a global god-model? If not, should OS host multiple context ontologies with explicit mappings, and what then is cross-context identity?

The thesis in `docs/thesis.md` currently says the primary artifact should be an executable ontology of the organization, and it draws commerce, inventory, manufacturing, accounting, logistics, fiscal, CRM, and HR under one box. Issue 55 asks whether that box is the wrong abstraction.

## Verdict

**Folder decision state.** The reading of the thesis as one enterprise vocabulary, one type named Product, one Customer, and one Inventory quantity is `rejected`. The reading as one shared metamodel that executes many context ontologies is `hypothesis`. Whether that surviving reading still deserves the name "one executable ontology" is `undetermined` and belongs to synthesis, not to an RFC edit.

Success for this issue is a change to the thesis if evidence warrants it. The evidence warrants a change to the *scope* of "one ontology." It does not yet warrant throwing away a shared Action, Event, Fact, Constraint vocabulary.

## Strongest argument against a unified ontology

A useful term inside one context is a false cognate across contexts.

Commerce Product is a sellable offer. Manufacturing Product is a resource specification plus a process. Accounting Product is often a valuation class or a revenue account mapping. Those three facts can name the same pallet and still refuse to share one type, one identity key, and one set of invariants.

Evans states the failure mode directly. Multiple models are inevitable. Combining code based on distinct models makes software buggy, unreliable, and hard to understand. Model expressions only have meaning in context. The prescribed response is an explicit bounded context, not a larger shared language.

Sibling Wave A notes, written independently of this kill test, already refuse the collapses the thesis diagram invites.

- Party L1 rejects Customer as a Kind.
- Product R-01 rejects Item or Product as a single OS type.
- Inventory L-INV-01 and L-INV-10 split ownership from custody and quantity from valuation.
- Manufacturing L1 splits specification, authorization, and execution, and records that ERPNext and Odoo use "Work Order" for different layers.
- Accounting L11 says a stock quantity change is not automatically a ledger event.
- HR L1 rejects Employee as a Kind of Person. L13 splits employment grant from login principal.
- Multi-entity L1 splits legal person, operating unit, site, and brand. L3 requires two legal events for intercompany trade.

A single axiom closure cannot host those laws without either dropping local meaning or growing a god-model that no team can keep consistent. OWL 2 imports make this concrete. Import is modularization of documents. The axiom closure is still one set of axioms. GraphQL federation makes the same point from the other side. Two subgraphs that both declare `Event.timestamp` with incompatible types fail composition. That failure is the feature. A unified ontology that silently picks one type is the bug.

`owl:sameAs` is the usual escape hatch for "it is the same thing." Halpin, Hayes, and colleagues showed that treating sameAs as substitutive identity across independently minted identifiers produces incorrect entailments. Cross-context identity is correspondence with grain, provenance, and a named mapping, not substitution.

Data mesh states the organizational form of the same attack. Traditional governance tries to get value through a global canonical representation of data with minimal support for change. Federated computational governance embraces multiple interpretive contexts.

## Candidate federation model

This is a research sketch, not a schema and not an RFC.

```text
Shared metamodel (hypothesis)
  Type, Action, Event, Fact, Function, Constraint, Policy,
  time, provenance, identity correspondence

Context ontologies (supported as necessary)
  commerce, manufacturing, inventory, accounting,
  party, hr, iam, multi-entity, ...
  each with a local ubiquitous language

Mappings (hypothesis)
  published language at the boundary
  anticorruption translation into the consumer context
  shared kernel only for kinds that survive every consumer
  composition fails closed on type or invariant conflict

Cross-context identity (hypothesis)
  dated correspondence, not one key
  grain named (legal person, offer, specification, lot, serial, principal)
  provenance required
  substitution forbidden unless the mapping says the grains match
```

A query that does not name a context is incomplete when the term is a known homonym.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Versioned locators used this session |
| `evidence.md` | reference | Evidence cards E-001 through E-028 |
| `attacks.md` | explanation | Attack cards A-001 through A-016 |
| `matrix.md` | reference | Convergence, divergence, source-artifact map |
| `candidate-laws.md` | explanation | Laws L-001 through L-012 |
| `scenarios.md` | reference | Scenario cards S-001 through S-024 |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

Attack plus scenario cards total 40. That meets the brief's floor of 20.

## Sibling notes, read only

Cited via `git show` on the named branch. This folder does not copy those trees.

- Party, `origin/cursor/issue-14-domain-cfd8` at `c64346995f62c6ac3d768c4c010f6b8bcb718fb8`, `research/domain/party/`
- Product, `origin/cursor/issue-15-domain-cfd8` at `80637d0ecadb9e123afc773a10e16c055ceeb2eb`, `research/domain/product/`
- Inventory, `origin/cursor/issue-18-domain-cfd8` at `de2bbe3ff71dcabb9ead699854a1b934496affbc`, `research/domain/inventory/`
- Manufacturing, `origin/cursor/issue-19-domain-cfd8` at `2de0548d5e971bb03283891358cc57283904122b`, `research/domain/manufacturing/`
- Accounting, `origin/cursor/issue-21-domain-cfd8` at `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc`, `research/domain/accounting/`
- HR, `origin/cursor/issue-28-domain-cfd8` at `8856f901462c69ae706615b7d70e668043f9053b`, `research/domain/hr/`
- Multi-entity, `origin/cursor/issue-31-domain-cfd8` at `59a5c79f939518f5cacccced8ace26e93be4a91b`, `research/domain/multi-entity/`

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md` and `attacks.md`.
9. **Runtime pressure.** Each law and attack names a runtime consequence without selecting a runtime.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Default `hypothesis`. Never `accepted`.

## How to read this

Start with the verdict above and L-001 through L-004. Use `attacks.md` when a later issue asks why one Product type dies. Use `scenarios.md` when a later issue asks what would change the answer. Use `matrix.md` when a later issue asks what Evans, Dehghani, OWL, GraphQL federation, or a sibling domain note actually said.

Do not treat Bounded Context, subgraph, or `owl:imports` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. ERPNext, Odoo, and Moqui appear only through sibling notes and public documentation already cited there.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. The pressure is on the thesis diagram and on open question 1 and open question 16. The candidate laws below are evidence, not a primitive list.
