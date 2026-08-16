# Current-law review — 2026-08-16

This note was added during adversarial review because Brazilian fiscal rules are temporally unstable. It narrows the original Wave A candidate laws against current first-party sources.

## Primary sources rechecked

- **LC 214/2025, compiled text including LC 227/2026:** <https://planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm>
- **Receita Federal — Orientações da Reforma Tributária para 2026:** <https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026>
- **Receita Federal / Ministério da Fazenda — July 2026 DF-e implementation updates:** current 2026 communications on the gradual obligation schedule and compliance program.
- **Ato Conjunto RFB/CGIBS nº 1/2025**, published through the national DF-e/NF-e portal, governing 2026 accessory obligations.
- **Decreto nº 13.075/2026 / Receita communication:** certain CNPJ/document obligations for individual CBS taxpayers were postponed to 2027. This is a concrete example of why temporal rule binding is mandatory.

## Corrections that synthesis must apply

### 1. `DF-e` is a family, not one lifecycle

The original research correctly separates ERP/commercial records from legally recognized electronic fiscal documents, but `DF-e` cannot be assigned one universal signature/authorization/cancellation state machine.

NF-e/NFC-e/CT-e and other models have model-specific technical notes, authorizers, schemas, contingencies and event sets. The 2026 IBS/CBS rollout itself uses different dates/layout maturity by document family.

**Use:** model a common concept such as regulated electronic fiscal evidence/document only if the domain proves common semantics; keep each model's legal lifecycle in Brazil-specific definitions.

### 2. Authorization request, legal outcome and local record are different

For models that require authorization of use, a local signed/generated payload and an authorization request are not the final externally recognized outcome. Contingency can create different temporal/legal paths and later reconciliation obligations.

`authorized / rejected / unknown` is therefore a useful **runtime external-effect hypothesis**, not a universal legal status enum for all DF-e.

### 3. Tax determination is conditionally deterministic

Once the legally relevant facts, classifications, jurisdiction, regime, legal interpretation and rule revision are bound, arithmetic/rule evaluation should be deterministic and reproducible. The **classification/interpretation step itself is not universally a pure function**: borderline NCM classification, place-of-supply, special regimes and contested legal interpretation can require evidence and professional/legal judgment.

Strong law: historical tax determinations must identify the rule/classification basis used.  
Open question: how much of classification and interpretation is executable Function vs governed Decision/Policy.

### 4. IBS/CBS credit appropriation — current compiled rule

LC 214 art. 47 currently conditions regular-regime credit appropriation on extinction of the IBS/CBS debits relating to the acquisition by one of the statutory modes, plus proof of the operation through an eligible electronic fiscal document, subject to statutory exceptions and specific regimes. Art. 48 provides an exception to the extinction prerequisite when specified payment mechanisms have not been implemented, conditioned on correct tax highlighting in the electronic document.

Do **not** reduce this to `supplier debit paid` or to an accounting posting. The legally relevant state belongs to the tax obligation/payment regime and documentary evidence, with exceptions.

### 5. 2026 is an exceptional transition/test year

Receita's current guidance identifies 2026 as a CBS/IBS test year. Accessory documents carry CBS/IBS fields under model-specific rules, while contributors complying with the applicable accessory obligations can be dispensed from collection in 2026. Current July 2026 communications also reflect staged implementation and revised dates for some taxpayer/document obligations.

Therefore:

- `fields/tax lines present on a 2026 DF-e` is **not equivalent** to normal economic cash collection of the new taxes;
- legacy and new tax families can coexist in the data model during transition;
- the exact legal/economic effect must be bound to date, taxpayer category, document family and then-current rule.

### 6. Temporal regulatory evidence is first-class pressure

The 2026 changes themselves demonstrate that a generic engine cannot hard-code today's Brazil tables or schedules. Brazil-specific definitions need effective dates, source provenance and supersession/revision history. This is domain pressure for temporal rule versioning; it is not evidence that the generic engine knows CFOP/NCM/IBS/CBS by name.

## Decision state

These corrections are **current legal/source observations as of 2026-08-16** plus bounded architecture implications. They do not accept a fiscal ontology or tax engine architecture. Future regulatory changes can supersede the observations and should append a new dated review rather than silently rewrite this one.
