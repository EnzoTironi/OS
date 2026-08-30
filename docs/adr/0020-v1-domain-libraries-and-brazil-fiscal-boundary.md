# ADR-0020: Company worlds are published definitions; Brazilian tax determination and fiscal issuance stay behind external provider boundaries

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen V1 needs enough enterprise semantics to operate a real manufacturer/commerce company, but domain breadth must not leak into the generic kernel. Brazilian fiscal rules are especially unsuitable for hard-coding into core runtime: they are legally volatile, jurisdiction-dependent and already served by specialized tax/content engines and fiscal-document providers. At the same time, treating fiscal as an opaque ERP side effect would prevent explanation, evidence, reconciliation and future replacement of the ERP.

## Decision

### Company worlds

V1 does not ship Party, Product, Commercial, Inventory, Procurement, Manufacturing, or Accounting Foundation as dest product on default main. ADR-0022. Each company publishes canonical JSON through `DefinitionService.Publish`. The same generic runtime executes those definitions. No Rust kernel branch may identify an ERP package.

Organizations extend or override through explicit ontology revision and evolution. They do not fork kernel code.

### Company-world acceptance

Each company world is proved through real scenarios on that published definition, not schema completeness checklists. Pre-modeled ERP libraries live on `archive/pre-modeled-erp`. They are not dest.

### Brazilian fiscal architecture

Zoen V1 does **not** implement Brazilian tax legislation as a privileged kernel or proprietary tax-rule engine.

It defines two generic provider capabilities outside semantic authority:

```text
TaxDeterminationProvider
FiscalDocumentProvider
```

`TaxDeterminationProvider` accepts a typed fiscal/commercial context and returns versioned external determination evidence: applicable tax parameters/calculations, provider rule/version references, warnings/errors and request/response identity.

`FiscalDocumentProvider` submits/queries/cancels/rectifies fiscal-document intents and returns external evidence such as provider IDs, SEFAZ/prefeitura protocol/status, authorized XML/PDF references, rejection/cancellation events and timestamps.

Zoen semantics model concepts such as fiscal intent, tax determination evidence, fiscal document/evidence and reconciliation through ontology definitions. Provider responses do not directly mutate accepted business state; they re-enter through governed evidence/effect reconciliation.

### Reference V1 integrations

- **Systax** is the reference V1 tax-determination/parameterization adapter. Its current Tax Engine exposes REST/JSON integration, and Systax documents integrations/web services for ERPs including Protheus. The adapter remains replaceable behind `TaxDeterminationProvider`.
- **PlugNotas** is the reference V1 direct fiscal-document adapter because its documented API covers NF-e, NFC-e and NFS-e with sandbox and production endpoints. The adapter remains replaceable behind `FiscalDocumentProvider`.
- **Protheus fiscal issuance** is also a supported connector path where the customer keeps Protheus as the fiscal system of record/execution. Zoen can submit an intent/write-back and reconcile authorized fiscal evidence from Protheus instead of requiring PlugNotas.

Selecting Systax/PlugNotas as reference adapters does not make their data models canonical. Adapter code maps provider schemas into Zoen semantic evidence.

### Regulatory separation

Brazil-specific fiscal definitions live in a versioned domain extension, not in `zoen-core`. Effective dates and provider/legal provenance are mandatory. Regulatory updates can publish new definitions/provider mappings without changing the semantic kernel.

## E2E verification

Domain release gates use the same production runtime and prove a published company world requires no kernel code changes.

Live fiscal homologation is parked on #214. When it reopens, fiscal release gates require live sandbox or homologation credentials:

1. build a real taxable commercial scenario through Zoen domain definitions;
2. call the Systax reference adapter against its supported test/homologation interface and persist attributable determination evidence;
3. submit a fiscal intent through the PlugNotas sandbox **or** configured Protheus integration, receive asynchronous/remote status and reconcile authorization/rejection;
4. persist/download authorized XML/evidence by immutable digest where legally/contractually permitted;
5. execute cancellation/correction/rejection flows as new events/evidence, never in-place rewriting of the original business occurrence;
6. simulate lost local response around a real provider call and recover/reconcile by provider operation identity/status instead of blind duplicate issuance;
7. prove tax/fiscal provider outage does not corrupt the local Action commit and remains an explicit pending/unknown external effect;
8. run the same business scenario with a second provider/connector implementation where available to prove provider schema is not semantic authority.

CI without commercial secrets may run contract/schema and fault-injection suites, but a V1 release cannot claim the live fiscal integration complete without a real sandbox/homologation E2E run recorded as a release artifact.

## Invariants

- Company worlds are data and definitions, never kernel branches.
- Brazilian tax rules are not hard-coded into Rust runtime logic.
- Provider calculation/authorization output is attributable external evidence.
- Commercial invoice/order, accounting claim and fiscal document are distinct semantic concepts even when an ERP UI historically conflates them.
- Fiscal retries respect external operation identity and unknown-outcome semantics.
- Regulatory effective-date changes never silently reinterpret historical operations.

## Revisit if

A regulatory/customer requirement forces Zoen to become the certified/native issuer or tax-calculation authority for a document class. Even then, the implementation must fit the same provider/evidence interfaces unless evidence proves those interfaces insufficient.
