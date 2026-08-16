# Scenarios

**Kind:** counterexample and domain-evidence cards  
**Decision:** per card  
**Retrieved:** 2026-08-16

These cards attack the candidate laws. Happy paths are not evidence. Thirty cards.

## S-FISC-001. Order exists, supply never happens, NF-e authorized then cancelled

- Kind: counterexample
- Decision: supported as a required distinction
- Setup: A sales order is accepted. An NF-e is authorized. The truck never leaves. Cancellation is requested inside 24 hours. No duplicata was linked.
- Attacks: CL-001, CL-007
- Questions: Which facts remain? Does the order survive? Does tax arise under LC 214 art. 10 if supply never started?
- Expected pressure: commercial commitment, authorized document, cancel event, and absent supply are four things.

## S-FISC-002. Authorization timeout, goods already on the road

- Kind: counterexample
- Decision: supported as a required unknown state
- Setup: The emitter signs and sends the NF-e. The connection drops. Drivers leave with a contingency DANFE. Two days later both a normal authorization and a contingency NF-e exist for the same load.
- Attacks: CL-005, E-020
- Questions: Which document acoberta the transit? Ajuste SINIEF 13/25 168-hour cancel of the unused authorized twin is in play.
- Expected pressure: Action outcome unknown is not failure. Duplicate minting is a reconciliation problem.

## S-FISC-003. Same-taxpayer transfer between SP and MG

- Kind: domain evidence
- Decision: supported
- Setup: Company A moves finished goods from its São Paulo plant to its Minas Gerais warehouse. No customer. No price.
- Attacks: CL-002, CL-010
- Questions: LC 214 art. 6, II, says no IBS or CBS. Art. 60 still requires an electronic document. CFOP transfer codes apply. Inter-state ICMS treatment during transition is a Brazil extension.
- Expected pressure: a generic "invoice required iff sale" rule fails.

## S-FISC-004. Sale of the same SKU, three CFOPs

- Kind: counterexample
- Decision: supported
- Setup: One product ships to a customer in the same state, then to a customer in another state, then returns.
- Attacks: CL-010
- Questions: If CFOP is stored on the item, which value is true? Anexo II uses 5.102, 6.102, and a return group.
- Expected pressure: CFOP is an operation classifier. Promoting it to a product property is a source-system artifact.

## S-FISC-005. NCM split after the NF-e was authorized

- Kind: counterexample
- Decision: supported
- Setup: An NF-e of 2026-01-20 uses NCM 5903.90.00. ADE RFB nº 1/2026 suppresses that code from 2026-02-01. An auditor in 2027 asks why the code was accepted.
- Attacks: CL-009, E-013
- Questions: Can the system explain the classification under the TIPI revision valid on 2026-01-20?
- Expected pressure: current-table determination rewrites history.

## S-FISC-006. Advance payment in December, supply in March, rate change

- Kind: counterexample
- Decision: supported
- Setup: The customer pays 40 percent in December. The electronic document for the advance is authorized that day. Supply happens in March after a statutory rate change. LC 214 art. 10, § 4º, as redacted by LC 227, uses the earlier of document date and payment date for the advance rate, then recalculates at supply.
- Attacks: CL-009, E-003
- Questions: How many tax facts exist? Which rate binds the anticipation? Which rate binds the remainder?
- Expected pressure: one tax-date field on the invoice is false.

## S-FISC-007. CC-e used to cut the price after authorization

- Kind: counterexample
- Decision: supported as illegal in the official path
- Setup: After authorization the seller tries a CC-e that lowers quantity and ICMS base.
- Attacks: CL-007, E-009
- Questions: Ajuste SINIEF 07/05 cláusula 14-A forbids tax-variable changes. The legal path is a complementary or credit document.
- Expected pressure: "edit invoice" is not a fiscal operation.

## S-FISC-008. Cancel after the goods circulated

- Kind: counterexample
- Decision: supported as forbidden ordinary cancel
- Setup: Authorization at 09:00. Goods leave at 10:00. Cancel request at 11:00, still inside 24 hours.
- Attacks: CL-007, E-008
- Questions: Circulation has happened. Cancel is the wrong event. A return document may be required.
- Expected pressure: the clock is not the only precondition.

## S-FISC-009. Cancel blocked by duplicata escritural

- Kind: domain evidence
- Decision: supported
- Setup: NF-e authorized. Duplicata escritural is linked. Goods have not moved. Cancel is requested inside 24 hours.
- Attacks: CL-004, CL-007
- Questions: Ajuste SINIEF 44/20 adds this bar. The commercial title and the fiscal document interact without becoming one object.
- Expected pressure: OQ-001 cannot be solved by saying they are the same type.

## S-FISC-010. Buyer confirms an operation the warehouse never received

- Kind: counterexample
- Decision: supported as contradictory official events
- Setup: Supplier NF-e is authorized. Buyer registers Confirmação da Operação. The buyer's warehouse later proves the truck never arrived.
- Attacks: CL-008, constitution question 3
- Questions: Which event is operationally authoritative? Can both remain? What happens to IBS or CBS credit under art. 47?
- Expected pressure: accepted state is not automatic. Decision stays undetermined at the OS layer.

## S-FISC-011. Buyer marks desconhecimento, supplier already booked revenue

- Kind: counterexample
- Decision: undetermined outcome, supported as a required scenario
- Setup: Supplier recognized a commercial receivable from the fatura. Buyer registers Desconhecimento da Operação within the manifestation window.
- Attacks: CL-004, CL-008, CL-011
- Questions: Does the commercial claim survive the fiscal denial? Does accounting reverse? Does tax remain confessed on the XML under art. 60, § 1º?
- Expected pressure: three ledgers can disagree. Filing-as-projection stays undetermined.

## S-FISC-012. Inbound XML arrives, credit taken before supplier debit is extinct

- Kind: counterexample
- Decision: supported as a legal mismatch
- Setup: Buyer books IBS credit on goods receipt. Supplier has not paid or otherwise extinguished the debit. Art. 47 requires extinction except art. 48 relaxations.
- Attacks: CL-011
- Questions: Is the credit a fact, a claim, or a premature projection?
- Expected pressure: ERP "input tax at receipt" is a source-system artifact.

## S-FISC-013. Personal-use acquisition by a regular-regime company

- Kind: domain evidence
- Decision: supported
- Setup: The company buys appliances that LC 214 art. 57 treats as uso ou consumo pessoal.
- Attacks: CL-011
- Questions: The inbound document can be authorized and still confer no credit.
- Expected pressure: document existence does not imply credit.

## S-FISC-014. Immune supply still documented

- Kind: domain evidence
- Decision: supported
- Setup: A listed immune supply under LC 214 art. 8 or 9. Art. 60, § 2º, I, still requires an electronic document. Art. 51 can cancel prior credits.
- Attacks: CL-002, CL-013
- Questions: What tax lines appear? What credit side-effects occur?
- Expected pressure: zero tax is not "no fiscal document".

## S-FISC-015. One truck, many NF-e, one MDF-e, then a split load

- Kind: domain evidence
- Decision: supported
- Setup: A carrier issues MDF-e modelo 58 binding several NF-e. Mid-route part of the cargo is retained. Ajuste SINIEF 21/10 requires a new manifesto on transshipment or unexpected retention.
- Attacks: CL-014
- Questions: Does the original MDF-e remain? Which NF-e stay bound?
- Expected pressure: a sales-invoice type cannot represent this object.

## S-FISC-016. CT-e for the freight, NF-e for the goods, customer pays both

- Kind: domain evidence
- Decision: supported
- Setup: Seller ships goods on NF-e. Carrier issues CT-e. Customer is billed a commercial freight surcharge on a fatura.
- Attacks: CL-003, CL-004, CL-014
- Questions: How many fiscal documents? How many commercial claims? LC 214 art. 10 starts some transport taxes at the beginning of transport.
- Expected pressure: one "shipment invoice" record collapses three legal objects.

## S-FISC-017. NFC-e at the register, later wholesale NF-e for the same stock

- Kind: counterexample
- Decision: supported as a double-documentation risk
- Setup: A store issues NFC-e modelo 65 to a consumer. Back office later issues NF-e modelo 55 for the same units to create a B2B receivable.
- Attacks: CL-003, CL-006
- Questions: Two authorized documents for one supply. Which acoberta the operation?
- Expected pressure: document model is not a print option. It is a legal family.

## S-FISC-018. Municipal service note versus national NFS-e

- Kind: domain evidence
- Decision: undetermined completeness of municipal adhesion, supported as a boundary
- Setup: A service firm in a municipality that still runs a local emitter in 2026. LC 214 art. 62 requires national NFS-e or sharing into the national environment. Simples Nacional becomes mandatory on the national emitter from 2026-09-01 per the official notice of Resolução CGSN nº 189/2026.
- Attacks: CL-003, E-017
- Questions: Which XML is the fiscal document? What if the municipality shares late?
- Expected pressure: service documentation is Brazil and jurisdiction-specific. Not an engine special case, still a domain extension.

## S-FISC-019. Service forced into NFS-e when the operation is ICMS-only

- Kind: counterexample
- Decision: supported as forbidden by the official NFS-e notice
- Setup: An ME tries to document an ICMS-only operation on national NFS-e.
- Attacks: E-017, CL-010
- Questions: The official notice forbids that use. The correct family is an ICMS document.
- Expected pressure: "service versus goods" is not enough. Tax family matters.

## S-FISC-020. Reform-only document excluded from EFD C100

- Kind: domain evidence
- Decision: supported
- Setup: In 2026 a document carries only IBS and CBS. Guia Prático EFD ICMS IPI 3.2.2 says it must not be booked in EFD. A mixed document under Ajuste SINIEF 49/25 must be booked for ICMS or IPI.
- Attacks: CL-012, CL-013
- Questions: If filing is one projection of all authorized XML, this rule fails. If filing is a scoped accessory obligation, the rule fits.
- Expected pressure: OQ-004 cannot be closed by "project every document into every book".

## S-FISC-021. ECD shows a sale, EFD omits the same XML

- Kind: counterexample
- Decision: undetermined as an OS law, supported as a possible official state
- Setup: Accounting books in ECD recognize revenue from the commercial sale. EFD ICMS IPI omits the XML because it is reform-only.
- Attacks: CL-011, CL-012
- Questions: Are the books contradictory, or are they answers to different accessory duties?
- Expected pressure: one operational fact store can feed two filings with different scopes. That possibility keeps projection undetermined rather than rejected.

## S-FISC-022. Assisted apuração silently constitutes the tax credit

- Kind: domain evidence
- Decision: supported
- Setup: The taxpayer ignores assisted IBS and CBS apuração. LC 214 art. 43, § 4º, treats silence as acceptance and constitutes the credit.
- Attacks: CL-012, E-015
- Questions: Is this a derived projection the taxpayer failed to override, or a new constitutive act by the administration?
- Expected pressure: filing is not only a report. It can create the tax credit.

## S-FISC-023. Platform supplies, seller forgets the document

- Kind: domain evidence
- Decision: supported as a statutory pattern
- Setup: A digital platform intermediates a supply. The seller does not emit the electronic document. LC 214 art. 22 and later LC 227 redactions assign platform responsibility in listed cases and discuss platform emission within 30 days.
- Attacks: CL-001, CL-005
- Questions: Who is the emitter? Who is the taxpayer? Does a late platform document confess tax for someone else?
- Expected pressure: emitter, supplier, and payer can be three parties. Brazil-specific, but the generic split of roles is reusable.

## S-FISC-024. Goods found without documentation

- Kind: domain evidence
- Decision: supported
- Setup: Fiscal authorities find goods in transit without an idôneo document. LC 214 art. 10, § 1º, IV, says the fato gerador occurs when the goods are found.
- Attacks: CL-001, CL-003
- Questions: The taxable situation happens at discovery, not at a missing invoice date. A later document would be late evidence, not the original time of supply.
- Expected pressure: backdated emission cannot move the legally defined occurrence.

## S-FISC-025. Continuous electricity supply, payment due before meter close

- Kind: domain evidence
- Decision: supported
- Setup: LC 214 art. 10, § 3º, as redacted by LC 227, uses the earlier of the installment becoming due or payment for continuous supplies.
- Attacks: CL-009, E-003
- Questions: What is the operation identity across monthly documents? Is each month a new supply fact?
- Expected pressure: document-per-month is a documentary convention over a continuous supply.

## S-FISC-026. CEST printed on a sale that is not under substitution

- Kind: domain evidence
- Decision: supported
- Setup: The NCM is listed in Convênio ICMS 92/15 annexes. The specific inter-state protocol does not put this operation under ST. The convention still requires CEST on the document.
- Attacks: CL-010
- Questions: Does storing CEST mean the tax was collected? No. It means the item is on a candidate list.
- Expected pressure: CEST is not a tax-paid flag.

## S-FISC-027. Unused number gap at month end

- Kind: domain evidence
- Decision: supported
- Setup: Series 1 jumps from 1044 to 1046. Number 1045 was never authorized. Inutilização is due by the 10th of the next month.
- Attacks: CL-007
- Questions: There is no document to cancel. There is a numbering duty.
- Expected pressure: identity of unborn documents is an accessory problem.

## S-FISC-028. Delivery-time identity error, CC-e forbidden

- Kind: domain evidence
- Decision: supported
- Setup: At unload the recipient CNPJ on the NF-e is the holding company, not the branch that received the goods. CC-e cannot change recipient identity. Complementary NF does not fit. Ajuste SINIEF 13/24 gives a 168-hour path if no further circulation follows.
- Attacks: CL-007
- Questions: What new facts are registered? Does the original XML remain the authorized document?
- Expected pressure: party identity errors are not field edits.

## S-FISC-029. Historical discount decision after a tax-rule revision

- Kind: counterexample
- Decision: supported as a required explanation
- Setup: Mirrors seed scenario S-012. A 2026 NF-e used a dated IBS reduced rate. In 2029 the reduction is gone. An auditor asks why the 2026 amount was allowed.
- Attacks: CL-009
- Questions: Can the system show the LC article, the rate table, and the document date that pinned them?
- Expected pressure: this is constitution question 19 with a Brazil table. No RFC edit.

## S-FISC-030. ERP Sales Invoice posted, SEFAZ rejected, stock already shipped

- Kind: source-system artifact plus counterexample
- Decision: supported as a failure mode
- Setup: ERPNext-style flow posts Sales Invoice, decrements stock, then Emitir NFe. SEFAZ rejects the XML. Goods are already gone.
- Attacks: CL-003, CL-005, E-018
- Questions: Which record is the commercial shipment? Which record is the fiscal document? Constitution Action versus Event versus unknown Effect applies.
- Expected pressure: launching NF-e from Sales Invoice is an artifact. Treating the posted invoice as authorized is false.

## Scenario families still thin

These were not built as full cards in the timebox.

- Intercompany IBS and CBS between related parties under LC 214 art. 5
- SUFRAMA internment failure after authorization
- Split payment mismatch between the document and the payment service
- NFC-e contingency at a dead network store
- Foreign platform with no Brazilian establishment
- Partial return of a mixed ICMS plus IBS document

They belong in a later wave, not as invented answers.
