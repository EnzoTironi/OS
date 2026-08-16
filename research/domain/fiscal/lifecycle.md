# Lifecycle

**Kind:** domain evidence  
**Decision:** supported for the Brazilian DFe path. OS primitive mapping undetermined.  
**Retrieved:** 2026-08-16

This is a state machine of official duties. It is not a target schema.

## Outbound electronic fiscal document

Happy path for NF-e, NFC-e, and CT-e.

```text
credenciado
    -> draft XML signed
    -> request Autorização de Uso
        -> authorized (protocol)
        -> rejected
        -> unknown (timeout or contingency)
    -> after authorized:
        optional Registro de Saída if exit data was omitted
        transit with DANFE, DACTE, or DANFE-NFC-e
        later events (see below)
```

Authorization is supposed to happen before the fato gerador. Ajuste SINIEF 07/05 cláusula primeira, § 1º. The commercial order can exist long before this path. The authorized document is not the order.

Rejection is not a business cancellation. It is a failed attempt to mint the documentary fact. The draft may be corrected and resent. Numbering rules still apply.

Unknown is a real state. Cláusula décima primeira. Constitution rule 9 applies. Retry is not safe until reconciliation of pending authorizations.

## Numbering

Numbers run 1 to 999.999.999 per establishment and series. Unused numbers in a broken sequence must be invalidated by Pedido de Inutilização by the 10th day of the next month. Ajuste SINIEF 07/05 cláusula décima quarta.

A number is not a surrogate for document identity. The access key identifies the NF-e.

## Events after authorization

Ajuste SINIEF 07/05 cláusula décima quinta-A.

Emitter-side:

- Cancelamento, if the window and preconditions hold
- Carta de Correção Eletrônica, if the field is CC-e material
- Registro de Saída
- EPEC and other contingency events
- Reference events when another NF-e or a CT-e points here

Recipient-side:

- Ciência da Emissão, awareness without a conclusive stance
- Confirmação da Operação
- Operação não Realizada
- Desconhecimento da Operação

Authority-side:

- Registro de Passagem Eletrônico
- SUFRAMA vistoria, internment, non-internment, de-internment

These are occurrences related to one NF-e. They are not edits of the authorized XML.

## Cancellation versus correction versus compensation

```text
authorized
    -> cancel event
         only if no circulation, no service, no duplicata escritural
         and inside the legal clock (24h ordinary, 168h some contingency)
    -> CC-e
         not tax variables, not party identity, not emission or exit date
    -> complementary NF or credit or return document
         value and tax repairs
    -> delivery-time correction under Ajuste SINIEF 13/24
         168h, no further circulation from the correction
    -> unused number inutilização
         no document existed
```

LC 214/2025 art. 17 keeps the original rate on cancel or return. Art. 12, § 7º, keeps the original base on return or cancel.

If goods already moved, cancel is the wrong operation. A return or complementary document is the compensating fact.

## Inbound documents

The buyer does not mint the supplier's NF-e. The buyer receives a distributed authorized XML and may register manifestation events.

Credit under LC 214/2025 art. 47 waits for extinction of the supplier's debit, except listed relaxations in art. 48. An inbound XML is evidence of the supplier's declaration. It is not yet the buyer's credit.

A buyer who confirms an operation that did not happen creates a contradictory official event. A buyer who marks desconhecimento denies participation. Both can coexist with the emitter's authorized document until administration resolves them. Constitution question 3 stays open.

## MDF-e lifecycle

```text
known originating documents (NF-e, CT-e, or allowed paper)
    -> MDF-e signed and authorized
    -> transport starts
    -> later inclusion of documents by event, where allowed
    -> encerramento
```

MDF-e is emitted after loading and before transport. It is not a sale. It is a binding of documents to a cargo unit. Closing the manifesto is a later event. Ajuste SINIEF 21/10.

## Tax-rule lifecycle

```text
published legal act
    -> stated produção de efeitos
    -> used by determination at a dated operation
    -> later act amends or replaces the table
    -> historical operations keep the old revision
```

Examples:

- CFOP Anexo II as rewritten by Ajuste SINIEF 03/24, effects 2024-06-01
- TIPI adaptations in ADE RFB nº 1/2026, effects 2026-02-01
- EFD layout 020, 2026-01-01 to 2026-12-31
- LC 214/2025 compiled with LC 227/2026 redactions on the same article

A determination function that reads only the current table cannot explain a 2025 NF-e after the 2026 TIPI split.

## Filing lifecycle

```text
operational facts and authorized documents
    -> period close
    -> ECD  (accounting books)
    -> ECF  (tax accounting)
    -> EFD ICMS IPI  (ICMS and IPI fiscal books)
    -> EFD-Contribuições  (PIS and COFINS)
    -> IBS and CBS apuração  (LC 214 arts. 43 ff.)
```

Each delivery has its own validator and dated layout. EFD 3.2.2 excludes reform-only documents from C100. Apuração under LC 214 can constitute the tax credit even when assisted and unanswered.

Whether these filings are projections over one fact store is undetermined. The official world treats them as separate accessory obligations.

## Reform coexistence

From 2026, authorizing systems must accept IBS and CBS fields on existing electronic documents. LC 214/2025 art. 62. ICMS, ISS, IPI, PIS, and COFINS remain during transition. A document can carry old and new taxes. A document can carry only new taxes. EFD cares about that difference.

Any later OS model that assumes one consumption tax per operation will fail Brazil from 2026 through 2033.

## Mapping pressure on RFC-0001

This section is pressure, not an RFC edit.

Action fits the request to authorize. Event or Fact fits authorization, manifestation, passage, and cancel. Function fits determination against dated rules. Policy fits who may emit or appropriate credit. Constraint fits "CC-e must not change tax variables".

None of that promotes CFOP into the kernel. None of that decides Event versus Fact. RFC-0001 stays a hypothesis.
