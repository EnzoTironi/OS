# Architecture Decision Records

This directory is the durable architectural memory of Zoen OS.

The research scaffolding that preceded Architecture v0 is intentionally not kept in the active source tree. Git history, issues and pull requests preserve the experiments; these ADRs preserve only the decisions and laws worth carrying into the Rust implementation.

## Status language

`Accepted for Architecture v0` means the implementation should assume the decision unless a listed revisit condition occurs. It does not claim the decision is eternal.

## Records

- [ADR-0001 — Executable ontology and a generic semantic kernel](0001-executable-ontology-and-generic-kernel.md)
- [ADR-0002 — Governed Actions are the business mutation seam](0002-governed-actions-business-mutation.md)
- [ADR-0003 — Evidence, claims and organizational belief remain distinct](0003-evidence-claims-organizational-belief.md)
- [ADR-0004 — Temporal semantics and dependency-based StateBasis](0004-temporal-semantics-state-basis.md)
- [ADR-0005 — Trusted execution context and delegated authority](0005-trusted-context-delegated-authority.md)
- [ADR-0006 — Operation identity, idempotency and atomic durable commit](0006-operation-identity-durable-commit.md)
- [ADR-0007 — External effects remain uncertain until reconciled](0007-external-effects-reconciliation.md)
- [ADR-0008 — Published ontology revisions are immutable and historically pinned](0008-immutable-versioned-definitions.md)
- [ADR-0009 — Semantic query and causal explanation require complete lineage](0009-semantic-query-causal-explanation.md)
- [ADR-0010 — Rust owns semantic authority; PostgreSQL owns initial durability](0010-rust-postgres-authority-boundary.md)
- [ADR-0011 — Company Brain and agent harness live outside semantic authority](0011-company-brain-agent-harness.md)
- [ADR-0012 — Surfaces derive from semantics through a replaceable Surface IR](0012-surface-ir-replaceable-renderers.md)
- [ADR-0013 — Architecture laws become executable conformance properties](0013-conformance-laws.md)
