# Evidence

**Kind:** mixed cards  
**Decision:** per card  
**Retrieved:** 2026-08-16

Each card is one distinction. Sources use IDs from `sources.md`.

## E-001. Principal obligation is not accessory obligation

- Kind: domain evidence
- Decision: supported
- Question: Is the duty to pay tax the same kind of fact as the duty to emit a document or keep books?
- Observed: CTN art. 113 splits obrigação principal from obrigação acessória. Art. 114 defines fato gerador of the principal obligation as the situation defined in law as necessary and sufficient. Art. 115 defines the accessory fato gerador as a legal duty to do or not do an act that is not the principal obligation.
- Sources: S-CTN
- Interpretation: Payment of IBS, CBS, ICMS, or IPI is one kind of truth. Emission of NF-e, manifestation, and SPED delivery are another kind.
- Alternative: Some ERPs collapse both into one "invoice posted" flag. That is a source-system artifact.
- Counterexample needed: a jurisdiction where emitting the document is itself the taxable event and no further supply exists.
- Candidate implication: OS may need a generic split between a taxable situation and a documentary or filing duty. Brazil codes do not have to be the split.

## E-002. Legal form of the commercial act is irrelevant to incidence

- Kind: domain evidence
- Decision: supported
- Question: Does the commercial contract type decide whether a tax arises?
- Observed: LC 214/2025 art. 4, § 3º, says title of possession, legal form, validity, profit, and fulfillment of administrative requirements are irrelevant to characterizing onerous operations with goods or services. CTN art. 118 interprets the legal definition of fato gerador while abstracting from the validity of the acts practiced.
- Sources: S-LC214, S-CTN
- Interpretation: A sale, lease, license, barter, or invalid contract can still be a taxable supply. Commercial event typing is not tax typing.
- Alternative: Tax follows the invoice document type in an ERP.
- Counterexample needed: a statutory rule that incidence exists only after a valid civil contract and a commercial invoice.

## E-003. Fato gerador timing is supply, not document issuance

- Kind: domain evidence
- Decision: supported
- Question: When does IBS or CBS arise relative to the electronic document?
- Observed: LC 214/2025 art. 10 places occurrence at fornecimento. Transport started in Brazil occurs at the start of transport. Other services occur at the end of supply. Goods found without proper documentation trigger occurrence at discovery. Continuous supplies use the earlier of the installment becoming due or payment, after LC 227/2026. Advance payment creates anticipation at payment, then a definitive calculation at supply. Rates on advances follow the electronic document date or the payment date, whichever is first.
- Sources: S-LC214, S-LC227
- Interpretation: Document issuance, authorization, payment, and physical supply are different times. Ajuste SINIEF 07/05 cláusula primeira, § 1º, requires authorization before the fato gerador. The document is supposed to exist before the taxable situation, not as the taxable situation.
- Alternative: "Invoice date" is the tax date.
- Counterexample needed: a rule that IBS or CBS occurs only when the XML is authorized, even if supply never happens.

## E-004. Same-taxpayer transfer needs a fiscal document without IBS or CBS

- Kind: domain evidence
- Decision: supported
- Question: Can a fiscal document exist without a commercial sale and without tax incidence?
- Observed: LC 214/2025 art. 6, II, says IBS and CBS do not apply to transfers of goods between establishments of the same taxpayer, while keeping the duty to emit an electronic fiscal document under art. 60, § 2º, II. Art. 60 also requires documents for immune, exempt, zero-rate, and suspended operations.
- Sources: S-LC214
- Interpretation: Documento fiscal eletrônico is not a synonym for taxable sale and not a synonym for commercial invoice.
- Alternative: Every NF-e is a sales invoice.
- This card supports the legal distinction. It does not decide the OS type cut. See OQ-001.

## E-005. Authorized XML is the fiscal document. DANFE is auxiliary.

- Kind: domain evidence
- Decision: supported
- Question: What object has legal existence as the NF-e?
- Observed: Ajuste SINIEF 07/05 cláusula primeira, § 1º, defines NF-e as a document emitted and stored electronically, of digital existence only, whose legal validity is guaranteed by a qualified electronic signature and authorization of use by the tax administration of the emitter's state, before the fato gerador. Cláusula terceira requires an XML file, sequential numbering per establishment and series, and an access key. Cláusula nona institutes DANFE to accompany transit or to help consultation. DANFE may be used for transit only after authorization, except contingency.
- Sources: S-AJ00705
- Interpretation: Printing a DANFE does not create the fiscal document. An ERP "Sales Invoice" record does not create it either.
- Alternative: The PDF is the invoice.
- Runtime consequence: authorization protocol and signed XML are evidence. A local draft is not.

## E-006. NFC-e, CT-e, and MDF-e repeat the digital-existence pattern with different models

- Kind: domain evidence
- Decision: supported
- Question: Is NF-e a unique engine object, or one family member?
- Observed: Ajuste SINIEF 19/16 cláusula primeira, § 1º, uses the same digital-existence and pre-fato-gerador authorization formula for NFC-e modelo 65. Ajuste SINIEF 09/07 does the same for CT-e modelo 57. Ajuste SINIEF 21/10 cláusula segunda defines MDF-e as a digital fiscal document whose validity comes from signature and authorization. MDF-e binds already issued fiscal documents to a cargo unit and is emitted after loading and before transport starts.
- Sources: S-AJ1916, S-AJ0907, S-AJ2110, S-CTE-PORTAL, S-MDFE-FAQ
- Interpretation: Model number, authorizing environment, and what the document covers change. The pattern "digitally existing authorized document" repeats. MDF-e is not a sale document. It is a link between documents and a transport unit.
- Alternative: One generic Invoice type with a Brazil field for model.
- Counterexample needed: a model that is legally a commercial invoice and only incidentally authorized.

## E-007. Events on an NF-e are first-class occurrences

- Kind: domain evidence
- Decision: supported
- Question: Is post-authorization life a status field or a sequence of registered events?
- Observed: Ajuste SINIEF 07/05 cláusula décima quinta-A names "Evento da NF-e". The list includes cancellation, CC-e, electronic passage, ciência da emissão, confirmação da operação, operação não realizada, desconhecimento da operação, registro de saída, SUFRAMA events, EPEC, and references from other NF-e or CT-e. Cláusula décima quinta-C gives the recipient 90 days from authorization to register confirmation, unknown operation, or operation not carried out. Later redactions in the compiled text also show 180 days. The live deadline needs a current MOC check.
- Sources: S-AJ00705
- Interpretation: Authorization is not the last fact. Recipient manifestation can contradict the emitter's claim. That is constitution question 3 territory. It is not solved here.
- Decision on the 90 versus 180 day window: undetermined until the current compiled clause is confirmed against the latest Ajuste.

## E-008. Cancellation is a registered event with a short window and material preconditions

- Kind: domain evidence
- Decision: supported
- Question: What does cancel mean after authorization?
- Observed: Ajuste SINIEF 07/05 cláusula décima segunda, as altered by Ajuste SINIEF 44/20, allows a cancellation request within 24 hours of authorization if there was no circulation of goods, no service performance, and no vinculação à Duplicata Escritural. Cláusula décima terceira says cancellation is done by registering the corresponding event. Ajuste SINIEF 13/25 adds a 168-hour path when a contingency NF-e covered the same operation.
- Sources: S-AJ00705, S-AJ4420, S-AJ1325
- Interpretation: Cancellation is not deletion. Circulation, service performance, or commercial-title linkage can make cancellation illegal even inside the clock. Compensating documents then become the path.
- Alternative: ERP cancel button voids the invoice and the tax.

## E-009. Carta de Correção cannot change tax variables, parties, or dates

- Kind: domain evidence
- Decision: supported
- Question: What may be repaired in place after authorization?
- Observed: Ajuste SINIEF 07/05 cláusula décima quarta-A allows CC-e for specific field errors after authorization, except variables that determine tax value, cadastral data that change sender or recipient, and date of emission or exit. Ajuste SINIEF 13/24 adds a 168-hour delivery-time correction path when complementary NF, credit note, and CC-e are all unavailable, and no further goods circulation follows from that correction.
- Sources: S-AJ00705, S-AJ1324
- Interpretation: Correction, complementary document, credit or return document, and cancellation are different operations. Value errors are not CC-e material.
- Alternative: Edit the authorized XML.

## E-010. Fatura and duplicata are commercial instruments, not the NF-e

- Kind: domain evidence
- Decision: supported
- Question: Is the commercial invoice the fiscal document?
- Observed: Lei nº 5.474/1968 art. 1 requires a fatura on mercantile sales with a term of at least 30 days. The fatura may list goods or list numbers and values of partial notes issued at sale, dispatch, or delivery. Art. 2 allows extraction of a duplicata from the fatura as a commercial credit instrument. Ajuste SINIEF 07/05 uses vinculação à Duplicata Escritural as a bar on NF-e cancellation. LC 214/2025 art. 60, § 1º, says information on the electronic fiscal document is a confession of IBS and CBS due.
- Sources: S-L5474, S-AJ00705, S-LC214
- Interpretation: Independent official texts treat fatura or duplicata and documento fiscal eletrônico as different instruments that can refer to the same supply. That legal distinction is supported.
- What stays undetermined: whether OS models them as one type, two types, or a type plus a role. See OQ-001.
- Alternative: ERP Sales Invoice is both.

## E-011. CFOP classifies fiscal operations, not commercial product identity

- Kind: domain evidence
- Decision: supported
- Question: Is CFOP a product attribute or an operation classifier?
- Observed: Convênio s/nº 1970 and Ajuste SINIEF 03/24 Anexo II group CFOP as entries and exits by intra-state, inter-state, and foreign, then by purpose such as purchase for industrialization, purchase for resale, transfer, return, communication, transport, fixed asset, and use or consumption. The same physical item can take 1.102, 2.102, or 5.102 depending on direction and purpose.
- Sources: S-CVSN70, S-AJ0324
- Interpretation: CFOP is a dated Brazil classifier of the fiscal operation. It is not SKU identity and not a kernel enum.
- Source-system artifact: ERP item masters that store a default CFOP as if it were a product property.

## E-012. CST, CSOSN, CRT, and CEST are Brazil tax-situation codes

- Kind: domain evidence
- Decision: supported
- Question: Do these codes belong in a generic tax engine?
- Observed: Convênio s/nº 1970 institutes CST, CRT, and CSOSN to group operations for IPI and ICMS documents and books. Convênio ICMS 92/15 cláusula terceira institutes CEST as a 7-digit identifier of goods that may be subject to substitution or anticipation. The contributor must mention CEST on the fiscal document for listed goods even when the specific operation is not under substitution.
- Sources: S-CVSN70, S-CEST
- Interpretation: These codes are Brazil extensions. An engine branch `if cst == "60"` would violate constitution rule 12.
- Alternative: Treat CST as a universal tax status primitive.

## E-013. NCM and TIPI are dated classification tables

- Kind: domain evidence
- Decision: supported
- Question: Is product tax class a stable property?
- Observed: Receita Federal publishes TIPI. ADE RFB nº 1/2026 adapts TIPI, approved by Decreto nº 11.158/2022, to NCM changes internalized by Resolução Gecex nº 812/2025, keeping IPI rates, with effects from 2026-02-01. Codes were split and some former codes were suppressed.
- Sources: S-TIPI, S-ADE1-2026
- Interpretation: Classification is versioned. A historical NF-e must keep the NCM that was valid at emission. Replaying today's TIPI onto yesterday's document is a falsifier of naive current-state tax.
- IBPT was not used as a legal source this session.

## E-014. Credit appropriation is not accounting recognition

- Kind: domain evidence
- Decision: supported
- Question: Does posting a purchase invoice create an IBS or CBS credit?
- Observed: LC 214/2025 art. 47 allows a regular-regime taxpayer to appropriate IBS and CBS credits when the supplier's debits are extinguished by a modality in art. 27, except personal use or consumption under art. 57. Art. 49 denies credit on immune, exempt, zero-rate, deferred, or suspended acquisitions. Art. 51 says immunity and exemption cancel prior credits. Art. 52 keeps prior credits on zero-rate operations. Art. 54 extinguishes unused credits after five years.
- Sources: S-LC214
- Interpretation: Credit is a legal position that depends on the other party's debit extinction, the use of the good or service, and the regime. It is not the same fact as an accounting payable or an inventory receipt.
- Alternative: Debit input tax at goods receipt.
- The accounting-linkage OS law stays undetermined. See OQ-003.

## E-015. Electronic fiscal document information is a confession of tax

- Kind: domain evidence
- Decision: supported
- Question: Is the authorized XML only evidence, or does it constitute the tax claim?
- Observed: LC 214/2025 art. 60, § 1º, says information provided on the electronic fiscal document has declaratory character and constitutes confession of the IBS and CBS amounts on the document. Art. 43, § 4º, says the taxpayer's apuração is a confession of debt and constitutes the tax credit. Assisted apuração can also constitute the credit if confirmed or left unanswered.
- Sources: S-LC214
- Interpretation: The authorized document is both evidence of the operation and a constitutive declaration of tax. That dual role is why "authorized XML as evidence or event" cannot be collapsed to a mere attachment.
- What stays undetermined: whether OS stores that declaration as Fact, Event, or both. See OQ-002.

## E-016. SPED filings are separate accessory obligations with dated layouts

- Kind: domain evidence
- Decision: supported as distinct obligations. Undetermined as OS projection law.
- Question: Is regulatory filing a projection of operational facts or a second ledger?
- Observed: Receita Federal publishes separate validators for ECD, ECF, EFD-Contribuições, and EFD ICMS IPI. SPED manuals list EFD layouts by calendar-year windows. Nota Técnica 2025.001 layout 020 is valid 2026-01-01 to 2026-12-31. Guia Prático EFD ICMS IPI 3.2.2, in force from January 2026, says documents that carry only the new consumption-tax reform taxes and do not concern ICMS or IPI must not be booked in EFD. Documents under Ajuste SINIEF 49/25 that carry both reform taxes and ICMS or IPI must be booked in EFD for ICMS or IPI.
- Sources: S-SPED-HOME, S-SPED-MANUALS, S-EFD-322, S-SPED-DL
- Interpretation: Official administration treats accounting books, tax-accounting books, ICMS or IPI fiscal books, and contribution books as different deliveries. During 2026, reform-only documents are excluded from EFD ICMS IPI. That is evidence against one universal fiscal ledger.
- What stays undetermined: whether OS should compute each filing as a projection over shared facts. Official texts do not use that vocabulary. See OQ-004.

## E-017. NFS-e is a national service document with municipal residue

- Kind: domain evidence
- Decision: supported
- Question: Is a service fiscal document the same family as NF-e?
- Observed: The national NFS-e portal describes a digitally valid service note for the whole country. LC 214/2025 art. 62, § 1º, requires municipalities and the Federal District, from 2026-01-01, to authorize national NFS-e or to share their own emitter's documents into the national data environment. Resolução CGSN nº 189/2026, reported on the official NFS-e portal, makes the national emitter mandatory for Simples Nacional service notes from 2026-09-01 and says the NFS-e is enough to found and constitute the tax credit. The same notice forbids ME or EPP from using NFS-e on operations subject only to ICMS.
- Sources: S-NFSE, S-NFSE-SVC, S-NFSN, S-LC214
- Interpretation: Service documentation is federally standardized and still jurisdiction-sensitive. A goods NF-e and a service NFS-e are different models. An ICMS-only operation must not be forced into NFS-e.
- Municipal emitters that have not fully shared remain a live integration residue. Completeness of municipal adhesion is undetermined.

## E-018. ERPNext Brazil maps Sales Invoice onto NF-e

- Kind: source-system artifact
- Decision: supported as an implementation pattern. Rejected as a domain law.
- Question: Do mature ERPs treat the commercial invoice as the fiscal document?
- Observed: The public README of `erpnext_fiscal_br` tells the user to submit a Sales Invoice, then click Emitir NFe or Emitir NFCe, wait for SEFAZ authorization, and download DANFE. It also lists cancellation, CC-e, unused-number invalidation, and tax regimes. A Frappe Forum thread treats full SPED as a multi-year localization, not as XML generation alone.
- Sources: A-ERPNEXT-BR, A-FRAPPE-BR
- Interpretation: The ERP uses the commercial invoice as the launch pad because that is the record the user already has. The legal texts above do not make that identity true. The mapping is a source-system convenience.
- Licensing: concepts and behavior only. No code copied.
- SPEDIR as a named corpus was not independently located. That cell stays undetermined.

## E-019. Tax rules carry explicit vigência

- Kind: domain evidence
- Decision: supported
- Question: Are tax classifiers and layouts effective-dated?
- Observed: Ajuste SINIEF 03/24 CFOP table takes effect 2024-06-01. ADE RFB nº 1/2026 TIPI changes take effect 2026-02-01. EFD layout 020 is valid for calendar year 2026. Ajuste SINIEF 07/05 itself is a compiled stack of cláusulas with "efeitos a partir de" dates, including 2026 amendments. LC 214/2025 art. 17 says cancellation or return uses the original operation's rate.
- Sources: S-AJ0324, S-ADE1-2026, S-SPED-MANUALS, S-AJ00705, S-LC214
- Interpretation: Historical explanation requires the rule revision that was valid at the operation, not the current table.
- Runtime consequence: content-addressed or effective-dated rule versions. Not an engine special case for Brazil. Brazil supplies the tables.

## E-020. Contingency and unknown authorization are first-class

- Kind: domain evidence
- Decision: supported
- Question: What happens when the authorizer is unreachable?
- Observed: Ajuste SINIEF 07/05 cláusula décima primeira allows contingency emission when the NF-e cannot be transmitted or the authorization response cannot be obtained. Cláusula décima primeira-A requires later reconciliation of NF-e that were pending when contingency started. EPEC is a prior contingency event. Constitution rule 9 says a timeout is not proof of failure.
- Sources: S-AJ00705
- Interpretation: The request to authorize and the authorization fact can diverge. OS already suspects Action versus Event versus unknown Effect. Brazil gives a concrete external authorizer.
- Alternative: treat missing protocol as failed emission.
