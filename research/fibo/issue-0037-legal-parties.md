# FIBO legal parties and agreements

- Artifact ID: `issue-0037-legal-parties`
- Issue: https://github.com/EnzoTironi/OS/issues/37
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Research angle: Which FIBO party and agreement cuts are domain vocabulary, and which repeat UFO role/relator laws.
- Decision states present: `supported`, `hypothesis`
- Primary synthesis: [`../comparative/issue-0037-formal-ontology-synthesis.md`](../comparative/issue-0037-formal-ontology-synthesis.md)

## Question

Do FIBO LegalPerson, PartyInRole, Agreement, and Contract change the OS metamodel, or do they belong in a finance and legal reference ontology?

## Source scope

- OMG FIBO Business Entities 1.1, section 9.2.1. https://www.omg.org/spec/EDMC-FIBO/BE/1.1/PDF
- OMG FIBO Foundations 1.0, Parties and Agreements modules. https://www.omg.org/spec/EDMC-FIBO/FND/1.0/PDF
- EDM Council Contracts ontology. https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/ accessed 2026-08-15
- Not examined: loans, derivatives, securities beyond the transferable-contract remark.

## Evidence

See comparative `E-019` through `E-023`.

LegalPerson is liability capacity recognized in a jurisdiction. LegalEntity is not a natural person. IndependentParty vs PartyInRole is the same cut as UFO kind vs role. Agreement and Contract are deliberately not subtypes of each other. ContractParty is a PartyInRole. ContractDocument is a legal document, not the contract. Signatory is a PartyInRole. BreachOfContract is an occurrence about a contractual commitment.

## Domain evidence

A firm can be party to many contracts without becoming many firms. A verbal bargain, a signed instrument, and a scan are different things. Signing authority is delegated capacity.

## Source-system artifacts

FIBO module IRIs, LEI / ISO 17442 ContractuallyCapableEntity, corporate-form taxonomy, transferable and novateable contracts, OWL annotation vocabulary.

## Candidate laws

Comparative `L-001`, `L-006`, `L-007`. Role is not kind. Legal personhood is domain vocabulary. Agreement is not the document.

## Counterexamples

Comparative `X-006` and `X-007`. Ecological agent versus legal counterparty. Verbal agreement versus written contract versus PDF.

## Runtime consequences

None that select a finance engine. Party-in-role must be representable so deleting a contract does not delete the organization. `hypothesis`.

## Open questions

Jurisdiction as a generic dimension versus a FIBO property is `undetermined`. Multi-entity research owns that question.

## Licensing

OMG and EDM Council published definitions. No OWL imported. No copyleft issue.

## Decision state

`supported` that these are domain types and that PartyInRole converges with UFO Role. `hypothesis` that OS should cite FIBO as a party/agreement reference ontology rather than reinvent the legal taxonomy.
