# Generic versus Brazil boundary map

**Kind:** mixed matrix  
**Decision:** per row  
**Retrieved:** 2026-08-16

This file is a lookup table. It is not a schema.

Marks:

- G = candidate generic distinction
- B = Brazil domain extension
- X = must not become an engine special case
- ? = undetermined

Source marks:

- Y = distinction present
- N = distinction absent or collapsed
- P = present as an implementation mapping
- U = not inspected this session

## Boundary map

| Concept | Layer | Engine special case? | Decision | Why |
| --- | --- | --- | --- | --- |
| Taxable situation versus commercial commitment | G | no | supported | LC 214 art. 4 and CTN arts. 114 to 118. A sale, lease, gift with consideration, or invalid act can still be a supply. |
| Accessory documentary duty versus principal tax | G | no | supported | CTN art. 113. Emission and filing can exist without incidence. |
| Time of supply versus time of payment versus time of document | G | no | supported | LC 214 art. 10 and art. 10, § 4º. |
| Authority-authorized fiscal document | G | no | hypothesis | Brazil makes authorization constitutive. Other countries may use taxpayer self-billing. The generic need is "external authority can mint documentary legal facts". |
| Auxiliary print versus the document | G | no | supported | DANFE, DANFE-NFC-e, DACTE. |
| Commercial fatura or credit title | G | no | supported as distinct from the fiscal document | Lei 5.474/1968. OS type cut undetermined. |
| Recipient confirmation or contradiction | G | no | supported | Manifestação do destinatário. |
| Cancellation versus correction versus compensating document | G | no | supported | Ajuste SINIEF 07/05 and 13/24. |
| Effective-dated legal rules | G | no | supported | vigência on CFOP, TIPI, EFD layouts, LC 214 art. 17. |
| Tax determination as Function over facts and dated rules | G | no | hypothesis | Official texts define incidence. They do not name Function. |
| Policy as who may emit, cancel, or appropriate credit | G | no | hypothesis | Credenciamento, regime, and credit bans look like authority rules. |
| Filing as projection versus separate ledger | G | no | undetermined | Separate SPED obligations are supported. OS projection law is not. |
| Accounting journal versus fiscal credit position | G | no | supported as distinct legal objects. OS linkage undetermined | ECD versus EFD versus LC 214 arts. 47 to 57. |
| Establishment as a tax place | G | no | hypothesis | NF-e numbering is per establishment. LC 214 art. 6, II, treats establishments of one taxpayer. Whether Establishment is generic or Brazil-shaped is open. |
| NF-e modelo 55 | B | X | supported | Ajuste SINIEF 07/05. |
| NFC-e modelo 65 | B | X | supported | Ajuste SINIEF 19/16. |
| NFS-e nacional | B | X | supported | Portal NFS-e and LC 214 art. 62. |
| CT-e modelo 57 | B | X | supported | Ajuste SINIEF 09/07. |
| MDF-e modelo 58 | B | X | supported | Ajuste SINIEF 21/10. |
| Chave de acesso, série, protocolo | B | X | supported | MOC and Ajuste SINIEF 07/05 cláusula terceira. |
| CFOP | B | X | supported | Convênio s/nº 1970, Ajuste SINIEF 03/24. |
| CST, CSOSN, CRT | B | X | supported | Convênio s/nº 1970. |
| CEST | B | X | supported | Convênio ICMS 92/15. |
| NCM and TIPI | B | X | supported | ADE RFB nº 1/2026. |
| IBS, CBS, IS | B | X | supported | EC 132/2023, LC 214/2025. |
| ICMS, ISS, IPI, PIS, COFINS during transition | B | X | supported | EC 132 transition, EFD 3.2.2 dual-document rule. |
| Simples Nacional | B | X | supported | LC 123 cited by official NFS-e notice. |
| Substituição tributária | B | X | supported | CEST convention. |
| Split payment and payment-service withholding | B | X | hypothesis as Brazil mechanism, generic as "collection at settlement" | LC 214 arts. 32 ff. and LC 227 additions. |
| Inscrição Estadual, municipal service inscription | B | X | supported | Credenciamento in Ajuste SINIEF 07/05 cláusula segunda. |
| SUFRAMA internment events | B | X | supported | Ajuste SINIEF 07/05 cláusula 15-A. |
| EFD, ECD, ECF, EFD-Contribuições layouts | B | X | supported | SPED portals. |

## Convergence matrix

The goal is semantic convergence, not feature comparison.

| Distinction | CTN | LC 214 | CONFAZ DFe | SPED | Lei 5.474 | ERPNext BR artifact | Odoo BR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Principal versus accessory obligation | Y | Y | Y | Y | N | N | U |
| Supply time ≠ document time | Y | Y | Y, authorize before fato gerador | P | N | N | U |
| Fiscal document ≠ commercial fatura | N | Y, documento fiscal eletrônico | Y | P | Y, fatura and duplicata | P, Sales Invoice launches NF-e | U |
| DANFE is not the document | N | N | Y | N | N | P, download DANFE after auth | U |
| Same-entity transfer documented without incidence | N | Y | P | P | N | U | U |
| Recipient can contradict emitter | N | P | Y | P | N | U | U |
| Cancel is an event with preconditions | N | Y, cancel path on failed supply | Y | P | P, duplicata blocks cancel | P | U |
| CC-e cannot change tax variables | N | N | Y | N | N | P | U |
| Credits depend on debit extinction | N | Y | N | P | N | U | U |
| Dated classifiers | N | Y, rates at dated document or payment | Y, CFOP and CEST | Y, yearly layouts | N | P | U |
| Separate bookkeeping deliveries | N | P, apuração constitutes credit | N | Y | N | P, forum treats SPED as extra | U |
| MDF-e is not a sale | N | N | Y | N | N | U | U |

Odoo Brazil file-level inspection was not done. Those cells stay U.

## Temporal and legal-rule requirements

These are requirements on any later model. They are not a schema.

1. Every tax classifier and layout used in a decision must carry a validity interval. CFOP 2024-06-01, TIPI 2026-02-01, EFD layout 020 for calendar 2026.
2. Reconstruction of a past decision must pin the rule revision used then. LC 214 art. 17 freezes the original rate on cancel or return.
3. Advance payment can create a tax anticipation under one rate and a definitive supply under another. Both facts must remain.
4. Authorization time, emission time, exit time, supply time, payment time, and knowledge time are different questions. Constitution items 7 and 8 remain open. Brazil forces at least emission, authorization, supply, and payment.
5. Contingency creates a period where a document may be in transit without a normal protocol. Reconciliation is mandatory after the outage.
6. Inbound manifestation can arrive up to about 90 days later. The compiled text also shows 180 days in one redaction. The live window is undetermined.
7. Reform transition through 2033 keeps old and new consumption taxes on overlapping documents. EFD 3.2.2 already splits reform-only documents from ICMS or IPI documents.

## Examples that must stay extensions

These Brazil facts would become engine rot if hard-coded.

1. CFOP 5.102 versus 6.102 is intra-state versus inter-state resale. The generic fact is destination jurisdiction and operation purpose. The four-digit table is Brazil.
2. CST 60 versus CSOSN 500 is a regime-specific ICMS situation. The generic fact is "tax already collected under substitution". The codes are Brazil.
3. CEST on a listed NCM even when the operation is not under ST. The generic fact is "this item is on a substitution-candidate list". The seven-digit code is Brazil.
4. Chave de acesso composition from UF, emission date, CNPJ, model, series, number, and emission type. The generic fact is a public identifier minted with the authorizer. The 44-digit key is Brazil.
5. Modelo 55 versus 65 versus 57 versus 58 versus NFS-e. The generic fact is document family and covered operation. The model numbers are Brazil.
6. IBS and CBS split payment at the payment service. The generic fact is collection at settlement. The Brazilian payment-system duties are Brazil.
7. EFD registro C100 exception 11 excluding reform-only documents. The generic fact is "a filing obligation has a scoped document set". The C100 rule is Brazil.

## Rejected promotions

| Promotion | Decision | Why |
| --- | --- | --- |
| CFOP as an OS kernel primitive | rejected | Brazil classifier. Generic layer is operation purpose plus jurisdictions. |
| CST as an OS kernel primitive | rejected | Brazil tax-situation code. |
| Sales Invoice equals NF-e | rejected as a domain law | Source-system mapping only. |
| DANFE equals fiscal document | rejected | Ajuste SINIEF 07/05 cláusula nona. |
| One engine `if Brazil` tax branch | rejected | Constitution rule 12. |
