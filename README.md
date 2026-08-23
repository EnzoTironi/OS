# Zoen OS

Zoen is an executable semantic operating system for organizations.

The system models organizational meaning, evidence, authority, actions, history and external effects so humans, agents and software operate the same organization through the same governed capabilities.

## V1 architecture

V1 is planned as the production architecture, not as a disposable MVP. Implementation is decomposed into independently verifiable vertical slices, but every slice uses the real architectural path it claims to deliver.

The semantic center remains deliberately small:

- canonical semantic model: `Type + Relation + Computation + Action`;
- business-specific meaning lives in immutable/versioned definitions, not runtime branches;
- meaningful business mutation goes through governed Actions;
- evidence, organizational belief, approval, local commit and external outcome remain distinct;
- valid time, knowledge time, provenance, authority, causal history and uncertainty are explicit;
- human, API, automation and AI agents use the same semantic Query/Action contracts;
- Rust owns semantic authority;
- PostgreSQL 18 is the transactional authority/commit backend;
- DataFusion is the V1 semantic read/compute engine over authoritative and Arrow/Parquet materialized sources;
- Cedar evaluates policy, Wasmtime executes untrusted/custom components and Restate provides durable orchestration behind Zoen-owned semantic boundaries;
- TypeScript owns ontology authoring, Company Brain/agent intelligence and experience surfaces without becoming semantic authority;
- public machine protocol uses Protobuf + Buf + ConnectRPC; semantic definition identity uses canonical JSON/JCS + SHA-256 separately;
- shared SaaS, dedicated and fully self-hosted deployment are first-class from the same signed artifacts;
- every completed V1 capability requires a production-shaped E2E proof; mocks/stubs cannot satisfy release completion.

Architecture decisions live in [`docs/adr`](docs/adr/README.md). The prescriptive V1 Wayfinder, Specs and E2E build tickets live in GitHub Issues.

## V1 deployment and scale target

The reference production architecture targets single-region HA (>=99.9%), RPO <5 minutes and RTO <30 minutes, with a validation envelope around 100M semantic records per company, millions of knowledge fragments, roughly 1,000 users per tenant and peak hundreds of Action commits per second where the domain workload permits.

The same OCI/Helm release can run as shared multi-tenant SaaS, dedicated Zoen-hosted deployment or customer-controlled self-hosted/on-prem infrastructure. Core operation has no mandatory Zoen Cloud dependency.

## V1 enterprise scope

V1 ships versioned ontology libraries for Party, Product, Commercial, Inventory, Procurement, Manufacturing and an Accounting Foundation. Brazilian fiscal semantics remain a versioned domain extension: tax determination and fiscal-document issuance are provider capabilities (reference integrations include Systax plus PlugNotas/Protheus), never hard-coded tax law in the generic kernel.

## Research phase

The architecture was preceded by a two-day, agent-intensive research/falsification phase using disposable Python and PostgreSQL prototypes. That code is intentionally not the production foundation. Git history and closed GitHub issues/PRs preserve the experiments and counterexamples; surviving laws are condensed into ADRs and V1 conformance properties.

## V1 release gate

The official V1 release decision is:

```text
just verify-v1
```

`verify-v1` is an aggregate-only gate. It consumes typed scenario evidence under `artifacts/` (or `ZOEN_VERIFY_EVIDENCE_DIR`), validates schemas, source commits, signatures, semantic mutants, RPO/RTO targets, and advertised live-provider slots, runs verification-layer mutants in-process, and writes a signed `zoen.verify.v1` bundle to `artifacts/verify-v1/`. It does not rerun KIND or wipe existing evidence. Missing, stale, unsigned, wrong-digest, surviving-mutant, or live-absent evidence fails closed.

`just verify` remains the serial scenario runner (check + build + scenarios). It is not a substitute for `just verify-v1`.

## Development rules

> Meaning in definitions. Universal laws in the kernel. Infrastructure behind replaceable boundaries. Everything else is a surface.

> Small ticket does not mean partial architecture: each V1 ticket must prove a real vertical production path E2E.
