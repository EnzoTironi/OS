# Sources

**Kind:** source-system artifact catalog  
**Fetched:** 2026-08-15  
**Decision:** none. This file lists what was read. It does not promote any source into OS.

Pages below were fetched this session. Secondary search snippets were not treated as evidence unless the page itself was fetched.

## Palantir Foundry, first-party docs

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| P1 | Ontology overview | https://palantir.com/docs/foundry/ontology/overview/ | Semantic versus kinetic elements |
| P2 | Save changes to the Ontology | https://palantir.com/docs/foundry/ontology-manager/save-changes/ | WIP save, merge conflicts, destructive-save confirmation |
| P3 | Branching the ontology | https://palantir.com/docs/foundry/ontologies/branching-ontology/ | Isolated branch, rebase, proposal, merge into `main` |
| P4 | Review ontology proposals | https://palantir.com/docs/foundry/ontologies/review-ontology-proposals/ | Proposal as pull-request analog, changelog tab |
| P5 | Review and restore changes | https://palantir.com/docs/foundry/ontology-manager/restore-changes/ | History of saves, restore into working state |
| P6 | Edit object types | https://palantir.com/docs/foundry/object-link-types/edit-object-type/ | Breaking edits, writeback history deletion |
| P7 | Migrate OSv1 to OSv2 | https://palantir.com/docs/foundry/object-backend/osv1-osv2-migration/ | Dual-index soak, optional history preserve, irreversible after soak |
| P8 | Action log | https://palantir.com/docs/foundry/action-types/action-log/ | Action-type version on each submission |
| P9 | Function versioning | https://palantir.com/docs/foundry/functions/functions-versioning/ | Immutable SemVer tags, incomplete compat checks |

## ObjectStack, first-party ADRs

Fetched from `https://github.com/objectstack-ai/objectstack` on branch `main`.

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| O1 | ADR-0008 Metadata repository and change log | https://github.com/objectstack-ai/objectstack/blob/main/docs/adr/0008-metadata-repository-and-change-log.md | Stored Zod version, in-flight codemod, explicit `migrate` |
| O2 | ADR-0027 Metadata authoring lifecycle | https://github.com/objectstack-ai/objectstack/blob/main/docs/adr/0027-metadata-authoring-lifecycle.md | Draft, seal, checksum, pointer-swap activate, rollback |
| O3 | ADR-0087 Metadata protocol upgrade contract | https://github.com/objectstack-ai/objectstack/blob/main/docs/adr/0087-metadata-protocol-upgrade-contract.md | Conversion layer, replayable chain, AI-consumer assumption |

ADR-0027 status on the fetched page is **Proposed**. ADR-0087 status is **Accepted**. Treat O2 as design intent, not proven production behavior.

## Database schema migration

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| D1 | Fowler, Parallel Change | https://martinfowler.com/bliki/ParallelChange.html | Expand, migrate, contract |
| D2 | Alembic autogenerate | https://alembic.sqlalchemy.org/en/latest/autogenerate.html | Candidate diffs, rename detected as drop plus add |
| D3 | Flyway undo migrations | https://documentation.red-gate.com/flyway/flyway-concepts/migrations/undo-migrations | Schema undo versus data undo |

## Event-sourced upcasting

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| E1 | Axon Framework 5.3 Event versioning | https://docs.axoniq.io/axon-framework-reference/5.3/events/event-versioning/ | Store original bytes, convert at handling time |

## API compatibility models

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| A1 | Semantic Versioning 2.0.0 | https://semver.org/spec/v2.0.0.html | Released contents immutable, major for incompatible API |
| A2 | Protocol Buffers proto3, Updating a message type | https://protobuf.dev/programming-guides/proto3/ | Field-number identity, reserved, wire-safe versus wire-compatible |
| A3 | GraphQL schema change management | https://graphql.org/learn/governance-versioning/ | Evolution over versioning, breaking list, deprecation lifecycle |
| A4 | OpenAPI Specification 3.2.0, Versions and deprecation | https://spec.openapis.org/oas/v3.2.0.html | Spec versioning is not SemVer. `info.version` is the document's version |

## Temporal query, related but not ontology revision

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| T1 | Time in XTDB | https://docs.xtdb.com/about/time-in-xtdb.html | `SYSTEM_TIME` as known then versus `VALID_TIME` as best known |

## In-repo context, not fetched as external evidence

| ID | Path | Used for |
| --- | --- | --- |
| R1 | `docs/thesis.md` | Explainable current state, ontology revision in the causal chain |
| R2 | `docs/constitution.md` | Time, provenance, adversarial schema evolution |
| R3 | `docs/open-questions.md` sections 19 and 20 | Questions this issue must not invent answers for |
| R4 | `rfcs/0001-metamodel-hypothesis.md` | Working hypothesis that historical actions pin definitions |
| R5 | `scenarios/README.md` S-012 | Auditor asks why a discount was allowed under an old policy |
| R6 | `docs/swarm-research-backlog.md` | Agent output contract |

## Licensing

OS is MIT. Palantir docs are proprietary product documentation. ObjectStack ADRs were read as design text. Alembic is MIT. Flyway docs are Redgate copyright. Protobuf, GraphQL, SemVer, Fowler, Axon, and XTDB pages were used for documented behavior only.

No implementation was copied into this repo. Concepts and failure modes only.
