# Candidate laws

**Kind:** candidate law  
**Decision:** per claim  
**Reviewed against current law:** 2026-08-16  
**Current-law correction:** [`current-law-2026-review.md`](current-law-2026-review.md)

These claims are domain hypotheses/evidence, not a target schema. Brazil-specific legal mechanics must be bound to the effective rule revision and document family.

## CL-001. Taxable situation is not a commercial document

- **Decision:** `supported` as a domain distinction.
- **Claim:** the legally relevant situation for a principal tax obligation is defined by law and cannot be inferred solely from an ERP/commercial document type.
- **Pressure:** tax determination consumes legally relevant operation facts and classifications, not `SalesInvoice`/`PurchaseInvoice` labels as authority.

## CL-002. Accessory documentary duty and tax incidence are distinct

- **Decision:** `supported` as a distinction.
- **Claim:** a jurisdiction can require a fiscal/electronic document for an operation even when the corresponding tax due is zero, exempt, immune, suspended, informational or otherwise subject to a special rule.
- **Pressure:** document issuance/filing cannot be gated only by `tax_amount > 0`.

## CL-003. Fiscal electronic document is not the ERP record or auxiliary rendering

- **Decision:** `supported` for the inspected Brazilian document families; lifecycle generalization is `undetermined`.
- **Claim:** for NF-e/NFC-e/CT-e-like models inspected here, the regulated electronic payload and its legally required authorization/protocol/evidence are distinct from the internal ERP record and from auxiliary human-readable renderings such as DANFE/DACTE.
- **Scope warning:** do **not** infer one universal `DF-e` signature/authorization lifecycle. Each family has model-specific rules, authorizers, contingencies, schemas and event sets.
- **Pressure:** preserve regulated document identity, payload/evidence, protocol/authority and model/version; PDFs are surfaces/evidence, not authorization.

## CL-004. Commercial payment instruments and fiscal documents are distinct

- **Decision:** `supported` as a legal distinction; OS type cut `undetermined`.
- **Claim:** commercial instruments such as fatura/duplicata and fiscal documents have different legal jobs even when one transaction links them.
- **Pressure:** do not collapse `invoice`, receivable claim, duplicata and NF-e into one universal object because a source ERP uses one screen.

## CL-005. External authorization outcome is not the local attempt

- **Decision:** `supported` for document families whose legal path requires an external authorizer; generic status representation `hypothesis`.
- **Claim:** generating/signing/sending a payload locally is different from the externally recognized authorization outcome. Contingency paths are explicit alternatives that can require later transmission/reconciliation.
- **Pressure:** model request/attempt separately from observed external outcome/evidence; ambiguous transport may need an `unknown/pending-reconciliation` runtime outcome without asserting legal success/failure.
- **Non-law:** `authorized/rejected/unknown` is **not** asserted as the universal legal enum for every DF-e family.

## CL-006. Post-authorization corrections preserve prior legal evidence

- **Decision:** `supported` for the inspected NF-e family; broader DF-e generalization `hypothesis`.
- **Claim:** recognized correction/cancellation/complement mechanisms produce governed events/new evidence rather than silently rewriting the previously authorized payload as though it had never existed.
- **Pressure:** preserve causality and the prior authorized evidence where the applicable law requires it.

## CL-007. Cancellation, correction, complement, return and unused-number handling are not one generic `void`

- **Decision:** `supported` for NF-e-family behavior; exact operation set is model/version-specific.
- **Claim:** different legal defects and operational histories require different procedures. A document before circulation, a value/tax correction after a real operation, an unused number and a recipient manifestation are not interchangeable transitions.
- **Pressure:** Brazil definitions expose legally scoped operations; generic engine should not hard-code one `cancel()` semantic for all fiscal objects.

## CL-008. Recipient and issuer can create distinct official assertions/events about one operation

- **Decision:** `supported` for NF-e manifestation mechanics.
- **Claim:** issuer authorization does not eliminate later recipient manifestations such as confirmation, unknown operation or operation not carried out.
- **Pressure:** preserve multiple official statements/evidence about the same commercial/fiscal situation instead of overwriting one with another.

## CL-009. Historical tax computation must bind facts, classifications and rule revision

- **Decision:** `supported` for rule-version binding; pure end-to-end determinism `hypothesis`.
- **Claim:** once legally relevant facts, jurisdiction, regime, classification/interpretation and effective rule revision are fixed, computation should be reproducible. The **selection/classification/interpretation** of those inputs can itself require governed human/legal judgment and evidence.
- **Pressure:** historical determinations identify the exact legal/table/classification basis used. A generic engine does not contain a timeless list of Brazilian tax codes.
- **Falsifier for stronger determinism:** ordinary legally material cases where two reasonable interpretations remain possible despite identical bound inputs.

## CL-010. Brazilian classifiers are localization/domain semantics, not generic-engine primitives

- **Decision:** `supported` as an engine-boundary claim.
- **Claim:** CFOP, CST, CSOSN, CRT, CEST, NCM/TIPI, access-key layouts and tax-regime codes carry real Brazilian legal semantics and belong in Brazil-specific definitions/data/rules, not hard-coded generic engine branches.
- **Important nuance:** they are not merely meaningless encodings of generic facts; their legal definitions and effective dates are themselves domain knowledge.

## CL-011. IBS/CBS credit appropriation is not an accounting journal entry

- **Decision:** `supported` as a distinction; detailed linking model `undetermined`.
- **Current-law claim:** under LC 214 art. 47, regular-regime credit appropriation generally depends on extinction of the IBS/CBS debits related to the acquisition by a statutory mode and proof through an eligible electronic fiscal document, with statutory exceptions/specific regimes. Art. 48 can dispense with the extinction prerequisite in the specified implementation circumstance, conditioned on correct highlighting in the electronic document.
- **Pressure:** model tax-obligation/payment/evidence state separately from accounting recognition. Do not shorthand this as `supplier debit paid` or `journal posted`.

## CL-012. Regulatory filings are distinct obligations with dated layouts/scopes

- **Decision:** `supported` as a distinction; projection architecture `undetermined`.
- **Claim:** ECD, ECF, EFD ICMS/IPI, EFD-Contribuições and IBS/CBS apuração/declarations are different regulated deliveries with different scopes, authorities and versioned layouts.
- **Pressure:** one generic `SPED file` cannot be the sole semantic object for all fiscal/accounting obligations.

## CL-013. Transition periods can require multiple tax families and different economic effects on one operation

- **Decision:** `supported`, explicitly time-scoped.
- **Claim:** during the constitutional transition, an operation/document can contain legacy and new tax-family information. **2026 is an exceptional test year**: current Receita guidance requires/model-enables CBS/IBS information under document-specific rules while compliant taxpayers can be dispensed from collection; implementation dates also changed during 2026 for some obligations/taxpayer classes.
- **Pressure:** tax components are a time-scoped set with rule provenance. `CBS/IBS fields present` must not be interpreted as `normal cash tax collected` without the effective 2026 rule context.

## CL-014. Transport aggregation/manifest documents are not sales invoices

- **Decision:** `supported` for the inspected MDF-e role.
- **Claim:** some regulated documents bind transport/cargo/documents and do not represent a sale or customer receivable.
- **Pressure:** a universal `Invoice` abstraction cannot absorb all Brazil DF-e without semantic loss.

## Claims intentionally not made

- `Tax determination is Policy.` — `undetermined`.
- `Tax determination is always a pure deterministic Function from raw transaction fields.` — **not established**; classification/interpretation may be governed decisions.
- `Every DF-e has the same signed-XML + authorization + cancellation lifecycle.` — **rejected as over-generalization**.
- `Authorized payload is definitely an Event rather than an Object/Fact/evidence object.` — `undetermined`.
- `Every filing is a Projection.` — `undetermined`.
- `2026 CBS/IBS fields imply normal economic collection.` — **rejected for the 2026 test-year context**.
- `Brazil-specific codes are generic engine primitives.` — rejected as an engine-boundary move, while preserving their real legal domain semantics.
- `RFC-0001 primitives are confirmed by fiscal research.` — not established.
