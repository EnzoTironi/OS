# Brazilian fiscal domain notes

**Issue:** [#30](https://github.com/EnzoTironi/OS/issues/30)  
**Track:** domain  
**Retrieved:** 2026-08-16  
**Decision:** none. Cards below carry their own state.  
**Mode:** explanation for a later synthesis agent. Not a schema and not an RFC edit.

## Question

Where does generic business reality end and Brazil-specific fiscal or regulatory reality begin?

The issue asks for a boundary map, candidate fiscal concepts, temporal and legal-rule requirements, and examples that keep Brazil codes out of the engine.

## How to read this folder

Start with `matrix.md` for the generic-versus-Brazil cut. Use `evidence.md` and `sources.md` to check a claim. Use `lifecycle.md` for authorization, cancellation, correction, inbound manifestation, and filing. Use `candidate-laws.md` for the smallest claims that survive the evidence. Use `scenarios.md` to attack those claims. Use `open-questions.md` for forks that stay unresolved.

Every card names one kind and one decision state.

Kinds:

- domain evidence
- source-system artifact
- candidate law
- counterexample
- runtime consequence

Decision states:

- hypothesis
- supported
- rejected
- undetermined

Never treat a card as silently accepted.

## What official sources already force

Independent first-party texts agree on several distinctions.

The taxable event is a legal situation defined in law. It is not the posting of an ERP invoice. Código Tributário Nacional arts. 113 to 118 separate principal obligation, accessory obligation, and fato gerador. Lei Complementar nº 214/2025 art. 10 places IBS and CBS occurrence at supply, with special timing for transport, continuous supply, public-sector payment, and advance payment.

A Brazilian electronic fiscal document is a digitally existing document whose legal validity comes from a qualified signature and authorization of use by the tax administration, before the fato gerador. That wording appears in Ajuste SINIEF 07/05 for NF-e modelo 55, Ajuste SINIEF 19/16 for NFC-e modelo 65, and Ajuste SINIEF 09/07 for CT-e modelo 57. MDF-e modelo 58 is a digital fiscal document that binds already issued fiscal documents to a cargo unit. DANFE is an auxiliary print for transit and consultation, not the fiscal document.

Lei nº 5.474/1968 extracts a fatura from a mercantile sale and may extract a duplicata as a commercial credit instrument. Ajuste SINIEF 07/05 cláusula décima segunda blocks NF-e cancellation after vinculação à Duplicata Escritural. Those two instruments therefore meet in procedure without becoming one legal object.

LC 214/2025 art. 6, II, excludes same-taxpayer establishment transfers from IBS and CBS incidence and still requires an electronic fiscal document under art. 60, § 2º, II. Fiscal documentation can exist without a taxable supply and without a sale.

CFOP, CST, CSOSN, CEST, and NCM or TIPI are dated classification tables published by CONFAZ or Receita Federal. They are Brazil extensions. They are not engine primitives.

## What stays undetermined

Two issue forks stay undetermined at the OS layer.

Whether OS should treat a commercial invoice and a fiscal document as one type, two types, or a type plus a role is not settled by the legal distinction. The legal distinction itself is supported.

Whether a regulatory filing is a projection over operational facts or a separate ledger is not settled. SPED publishes ECD, ECF, EFD ICMS IPI, and EFD-Contribuições as separate obligations with separate validators and dated layouts. That is domain evidence of distinct accessory obligations. It is not yet a storage or projection law for OS.

Tax determination as Function, Policy, or both is a hypothesis. Official texts define incidence, rates, credits, and accessory duties. They do not name OS primitives.

## What this folder must not become

Do not read these notes as a target schema.

Do not promote CFOP, CST, CSOSN, CEST, NCM, chave de acesso, or SEFAZ protocol into kernel primitives.

Do not copy ERPNext, Odoo, or other copyleft localization code. Those systems appear only as source-system artifacts.

Do not edit `rfcs/0001-metamodel-hypothesis.md` from this research.

Sibling notes for order-to-cash, accounting, and finance were not present on `origin/main` at retrieval. They are cite-only if they appear later.

## File index

- `sources.md` lists first-party pages, retrieval status, and artifact class.
- `evidence.md` records observed legal and operational distinctions.
- `matrix.md` maps generic concepts to Brazil extensions and source convergence.
- `lifecycle.md` records authorization, events, cancellation, correction, inbound documents, rule versions, and filings.
- `candidate-laws.md` states falsifiable claims.
- `scenarios.md` holds 30 adversarial cards.
- `open-questions.md` holds unresolved semantic questions.

## Licensing

OS is MIT. These notes extract concepts and behavior from official law and from public ERP localizations. They do not paste or translate implementation.
