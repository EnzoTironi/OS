# Candidate laws

**Kind:** candidate law  
**Decision:** per claim  
**Retrieved:** 2026-08-16

Each claim is the smallest statement that explains the evidence. Each claim names what would kill it. None of these is a schema.

## CL-001. A taxable situation is not a commercial document

- Kind: candidate law
- Decision: supported
- Claim: The situation that gives rise to a principal tax obligation is defined in law and can exist without a commercial invoice, a valid civil contract, or a profitable deal.
- Evidence: E-001, E-002, E-003, E-004
- Falsifier: a first-party rule that IBS, CBS, or ICMS arises only when a commercial invoice is issued and a valid contract exists.
- Runtime consequence: determination reads operation facts, not document type labels.

## CL-002. An accessory documentary duty can exist without incidence

- Kind: candidate law
- Decision: supported
- Claim: Law can require an electronic fiscal document for a movement that is not a taxable supply, including same-taxpayer establishment transfers and immune or exempt operations.
- Evidence: E-001, E-004, LC 214 arts. 6 and 60
- Falsifier: a first-party rule that a fiscal document may be emitted only when tax is due.
- Runtime consequence: document-minting actions are not gated on a non-zero tax amount.

## CL-003. The authorized digital document is the fiscal document

- Kind: candidate law
- Decision: supported
- Claim: For Brazilian electronic models, legal existence is the signed XML plus authorization of use. An auxiliary print is not that document. An ERP sales record is not that document.
- Evidence: E-005, E-006, E-018
- Falsifier: a first-party rule that DANFE or an internal invoice number is the legally sufficient document without authorization.
- Runtime consequence: store protocol, access key, and signed payload as evidence. Do not treat PDF generation as authorization.

## CL-004. Commercial fatura or duplicata is a different instrument

- Kind: candidate law
- Decision: supported as a legal distinction. Undetermined as an OS type cut.
- Claim: Brazilian law extracts a fatura and optional duplicata from a mercantile sale. Those instruments can block NF-e cancellation when linked, and they are not defined as the NF-e.
- Evidence: E-010, E-008
- Falsifier: a first-party text that defines NF-e as the fatura, or fatura as the sole fiscal document.
- What this does not decide: one OS type versus two. See OQ-001.

## CL-005. Authorization is an external authority event

- Kind: candidate law
- Decision: supported
- Claim: Legal validity of the digital document requires an authorizer decision. Local signature without authorization is not enough in the ordinary path. Contingency is an explicit exception that still reconciles later.
- Evidence: E-005, E-020
- Falsifier: a first-party rule that taxpayer signature alone creates the NF-e without any authorizer role, including contingency.
- Runtime consequence: Action to request authorization can finish as authorized, rejected, or unknown.

## CL-006. Post-authorization life is a sequence of events, not an edit

- Kind: candidate law
- Decision: supported
- Claim: After authorization, legally recognized changes are registered events or new documents. The authorized XML is not rewritten in place except through those events.
- Evidence: E-007, E-008, E-009
- Falsifier: a first-party procedure that lets the emitter replace the authorized XML and keep the same protocol.
- Runtime consequence: cancel, CC-e, manifestation, and complementary documents are new facts.

## CL-007. Cancel, correct, and compensate are different operations

- Kind: candidate law
- Decision: supported
- Claim: Cancellation extinguishes an authorized document that never became a real circulation or service, inside a short clock, and not after duplicata linkage. Correction of non-tax fields uses CC-e. Value and tax errors use complementary or return documents. Unused numbers use inutilização.
- Evidence: E-008, E-009
- Falsifier: a single official "void" that covers circulated goods, tax-variable errors, and unused numbers.
- Runtime consequence: one generic mutate-status is the wrong model.

## CL-008. Inbound manifestation can contradict the emitter

- Kind: candidate law
- Decision: supported
- Claim: The recipient can register confirmation, unknown operation, or operation not carried out against an authorized NF-e. Those events are official and time-bounded.
- Evidence: E-007
- Falsifier: a first-party rule that only the emitter's authorized XML counts and recipient silence or contradiction has no legal event form.
- Runtime consequence: two claims about one operation can be first-class. Constitution question 3 stays open.

## CL-009. Tax determination is a dated function of facts and published rules

- Kind: candidate law
- Decision: hypothesis
- Claim: Amounts due are a deterministic function of the operation facts plus the legal rule revision valid at the legally relevant time. Brazil publishes those rules as versioned tables and complementary-law articles. The function is not a kernel list of CFOP or CST values.
- Evidence: E-011, E-012, E-013, E-019
- Falsifier: official determination that requires an unbound human or model judgment for ordinary goods operations, or a rule that current tables rewrite historical tax.
- Why hypothesis: official texts define incidence and rates. They do not say "Function". Policy may still gate who may apply a regime.
- Runtime consequence: pin rule revisions on historical determinations.

## CL-010. Brazil classifiers are domain extensions

- Kind: candidate law
- Decision: supported
- Claim: CFOP, CST, CSOSN, CRT, CEST, NCM or TIPI, model numbers, and access-key format are Brazil-specific encodings of generic facts such as purpose, direction, regime, item class, and public identifier. They must not be engine primitives.
- Evidence: E-011, E-012, E-013, matrix rejected promotions
- Falsifier: a cross-domain need for CFOP outside Brazil that cannot be expressed as purpose plus jurisdictions.
- Runtime consequence: constitution rule 12. No `if cfop == "5102"` in the generic engine.

## CL-011. Fiscal credit is not accounting recognition

- Kind: candidate law
- Decision: supported as a distinction. Undetermined as a linkage law.
- Claim: IBS and CBS credit appropriation depends on extinction of the supplier's debit, use or consumption tests, and regime. Accounting books are a different accessory obligation.
- Evidence: E-014, E-016
- Falsifier: a first-party rule that the accounting journal entry is the credit-appropriation fact.
- What this does not decide: how OS links the two. See OQ-003.

## CL-012. Regulatory filings are distinct accessory obligations

- Kind: candidate law
- Decision: supported as distinct obligations. Undetermined as projection versus ledger.
- Claim: ECD, ECF, EFD ICMS IPI, EFD-Contribuições, and IBS or CBS apuração are different deliveries with different scopes and dated layouts. During 2026, some authorized documents are in scope for one filing and out of scope for another.
- Evidence: E-016, E-015
- Falsifier: a first-party rule that one SPED file is the unique book of all tax and accounting truth.
- What this does not decide: whether OS computes each filing as a projection. See OQ-004.

## CL-013. One operation can carry multiple tax families at once

- Kind: candidate law
- Decision: supported
- Claim: During the EC 132 transition, a single documented operation can carry ICMS or IPI together with IBS or CBS, or only the new taxes. Determination and filing must not assume a single consumption tax.
- Evidence: E-016, LC 214 art. 62, EFD 3.2.2
- Falsifier: a first-party rule that a 2026 goods NF-e may carry only one consumption tax family.
- Runtime consequence: tax lines are a set, not a single code.

## CL-014. MDF-e is a document-to-transport binder, not a sale

- Kind: candidate law
- Decision: supported
- Claim: Some fiscal documents exist to bind other fiscal documents to a cargo unit. They are not commercial invoices and not tax determinations of a sale.
- Evidence: E-006, S-AJ2110
- Falsifier: a first-party definition of MDF-e as a sales invoice or as the CT-e itself.
- Runtime consequence: a generic "invoice" type cannot absorb MDF-e without lying.

## Claims not made

These were tempting and are refused.

- Tax determination is Policy. Undetermined. Policy may gate authority. Amounts look functional.
- Authorized XML is an Event and not a Fact, or the reverse. Undetermined. See OQ-002.
- Filing is a projection. Undetermined. See OQ-004.
- RFC-0001 primitives are confirmed. Rejected as a move. This folder does not edit the RFC.
