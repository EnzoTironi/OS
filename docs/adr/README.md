# Architecture Decision Records

This directory is the durable architectural memory of Zoen OS.

The two-day research scaffolding is intentionally absent from the active source tree. Git history, closed issues and closed pull requests preserve experiments; ADRs preserve the decisions and laws that implementation must obey.

## Status language

- `Accepted for Architecture v0` on ADR-0001 through ADR-0013 means a semantic law discovered before the V1 synthesis. These decisions are **inherited by V1** unless explicitly superseded by a later ADR.
- `Accepted for V1` means the production implementation and release verification must assume the decision. A listed revisit condition requires a new ADR; an implementation agent cannot silently choose a different architecture.

When a later ADR narrows an earlier one, the later ADR controls. ADR-0016 promotes DataFusion from an Architecture-v0 candidate to the selected V1 read/compute engine. ADR-0021 strengthens conformance into a no-stub production E2E release law. ADR-0022 supersedes ADR-0020’s “V1 ships enterprise libraries” clause, keeps pre-modeled ERP/web/pack trees on `archive/pre-modeled-erp`, and removes those proofs from default `verify-v1` / `verify-activation` slots.

## Semantic constitution

- [ADR-0001 — Executable ontology and a generic semantic kernel](0001-executable-ontology-and-generic-kernel.md)
- [ADR-0002 — Governed Actions are the business mutation seam](0002-governed-actions-business-mutation.md)
- [ADR-0003 — Evidence, claims and organizational belief remain distinct](0003-evidence-claims-organizational-belief.md)
- [ADR-0004 — Temporal semantics and dependency-based StateBasis](0004-temporal-semantics-state-basis.md)
- [ADR-0005 — Trusted execution context and delegated authority](0005-trusted-context-delegated-authority.md)
- [ADR-0006 — Operation identity, idempotency and atomic durable commit](0006-operation-identity-durable-commit.md)
- [ADR-0007 — External effects remain uncertain until reconciled](0007-external-effects-reconciliation.md)
- [ADR-0008 — Published ontology revisions are immutable and historically pinned](0008-immutable-versioned-definitions.md)
- [ADR-0009 — Semantic query and causal explanation require complete lineage](0009-semantic-query-causal-explanation.md)
- [ADR-0010 — Rust semantic authority; transactional and read/compute planes are separate](0010-rust-postgres-authority-boundary.md)
- [ADR-0011 — Company Brain and agent harness live outside semantic authority](0011-company-brain-agent-harness.md)
- [ADR-0012 — Surfaces derive from semantics through a replaceable Surface IR](0012-surface-ir-replaceable-renderers.md)
- [ADR-0013 — Architecture laws become executable conformance properties](0013-conformance-laws.md)

## V1 production shape

- [ADR-0014 — V1 system shape uses a few deep responsibility-owned modules](0014-v1-system-shape-and-module-topology.md)
- [ADR-0015 — Canonical semantic identity and public wire protocol are separate contracts](0015-canonical-ir-and-public-protocol.md)
- [ADR-0016 — DataFusion is the V1 semantic read/compute engine](0016-v1-query-materialization-and-datafusion.md)
- [ADR-0017 — Cedar, Wasmtime and Restate implement mechanisms under Zoen authority](0017-v1-policy-sandbox-and-durable-orchestration.md)
- [ADR-0018 — Shared SaaS, dedicated and self-hosted are one production architecture](0018-v1-deployment-tenancy-availability-and-self-hosting.md)
- [ADR-0019 — TypeScript owns authoring, intelligence and experience](0019-v1-authoring-intelligence-and-surfaces.md)
- [ADR-0020 — Enterprise domain libraries and the Brazilian fiscal provider boundary](0020-v1-domain-libraries-and-brazil-fiscal-boundary.md)
- [ADR-0021 — Every V1 capability requires a production-shaped E2E proof](0021-v1-end-to-end-verification-and-release-gates.md)
- [ADR-0022 — Each company brings its own world; pre-modeled ERP packs leave the default product](0022-company-worlds-and-archived-erp-packs.md)

## Implementation discipline

Implementation must follow `/architect` reasoning: caller usage first, at least two structurally distinct designs for significant new shapes, deep interfaces, no information leakage, no temporal decomposition and no pass-through architecture. Repeated same-shape deviations are a redesign signal, not permission to add escape hatches.
