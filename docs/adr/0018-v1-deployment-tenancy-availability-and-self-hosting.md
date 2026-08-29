# ADR-0018: V1 supports shared SaaS, dedicated and self-hosted deployments from one production architecture

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen must support three commercial/operational modes without maintaining three products: shared multi-tenant SaaS, dedicated Zoen-hosted deployments and customer-controlled/self-hosted deployments. Self-hosting is a product requirement, not a developer convenience. The system must also meet a practical V1 availability target without introducing active-active multi-region complexity before it is needed.

## Decision

Production is one Fly app (`deploy/fly`). Shared, dedicated, and self-hosted Helm profiles are gone. The same zoend, Restate, Postgres, MinIO, and Keycloak image is the deployment unit.

```text
Fly app zoen
  deploy/fly/Dockerfile
  volume /data = pgdata + Restate + MinIO
```

No semantic/runtime capability may require a Zoen-operated control plane to function. Zoen-hosted services may improve operations, licensing or observability later, but V1 core can run entirely within customer-controlled infrastructure using documented dependencies.

## Production dependency set

The reference self-hosted V1 stack contains:

- `zoend` Rust service replicas;
- TypeScript web/intelligence service(s);
- PostgreSQL 18 transactional authority cluster;
- Restate self-hosted cluster;
- S3-compatible object storage for projections and knowledge blobs;
- OIDC/OAuth2-compatible external identity provider;
- OpenTelemetry-compatible collector/backend integration;
- TLS on the Fly edge.

DataFusion, Cedar and Wasmtime are embedded runtime dependencies inside Zoen processes rather than independently operated data services.

A reference self-host test environment uses self-hostable implementations (for example Keycloak-compatible OIDC and S3-compatible object storage) but production customers may supply conformant equivalents.

## Tenancy

`TenantId` is a first-class trusted execution/storage boundary from the first commit.

Shared SaaS requirements:

- all authority identities/unique constraints are tenant-scoped unless explicitly globally scoped;
- PostgreSQL row-level security provides defense in depth in addition to application-layer trusted tenant context;
- object-store keys/prefixes and projection manifests are tenant-scoped;
- Restate invocation/object/service keys include tenant isolation;
- knowledge retrieval indexes and LLM context assembly cannot cross tenant scope;
- quotas/rate limits/budgets are tenant-aware;
- caches include tenant in every authority-sensitive key.

Dedicated/self-hosted deployments may operate a single tenant, but use the same tenant-aware code path rather than a separate simplified architecture.

## Identity

Zoen is not an identity provider. V1 trusts OIDC/OAuth2 identity from configured providers, validates issuer/audience/signature/session policy at the edge and derives internal Actor/Principal/Workload context. Identity-provider claims are evidence for authentication; Zoen-owned delegation and Action authority remain semantic concerns.

## Availability and recovery target

V1 target:

- single-region high availability;
- deployment across failure domains/AZs where the platform provides them;
- availability objective >= 99.9% for the managed production architecture;
- RPO < 5 minutes;
- RTO < 30 minutes.

Reference shape:

- stateless `zoend` replicas behind health-checked ingress;
- highly available PostgreSQL with continuous WAL archival/backup to object storage and tested point-in-time recovery;
- Restate deployed in a supported HA configuration;
- durable replicated/object storage according to the chosen platform;
- rolling deployments with schema/protocol compatibility gates;
- automated backup verification and scheduled restore drills.

Active-active multi-region semantic authority is not part of V1. Disaster recovery may restore the production stack in another region/site, but there is one active authority region at a time.

## Deployment profiles

Helm shared-saas, dedicated, and self-hosted profiles are gone. Production is one Fly app. Compose remains the live `just verify` matrix, not a second cluster path.

## Observability

OpenTelemetry traces/metrics/log correlation is a V1 contract at process boundaries. Every semantic operation exposes correlation for tenant, operation, Action/definition revision and effect/orchestration IDs subject to privacy/redaction. Observability data is not semantic authority and cannot contain unrestricted secrets or model context by default.

## E2E verification

Release gates prove the live Compose matrix (`just verify`). Production deploy is Fly. KIND/Helm drills are not a release path.
4. kill/restart `zoend` replicas during requests and recover durable operation status;
5. restart Postgres/Restate/object-store components according to supported failure scenarios without semantic corruption;
6. perform backup + fresh-cluster restore and prove exact definition/operation/history/effect recovery;
7. measure and enforce RPO/RTO drills against the V1 target;
8. prove rolling upgrade compatibility for protocol and database migrations;
9. prove tenant data cannot be retrieved by substituting wire-level tenant identifiers.

## Invariants

- Deployment mode never changes business semantics.
- Self-hosting does not require source-code forks.
- Trusted tenant identity is derived from deployment/auth context, not accepted from ordinary request payloads.
- No mandatory SaaS-only dependency is hidden in an adapter.
- Availability mechanisms cannot invent or rewrite semantic history during recovery.

## Revisit if

A customer requires active-active multi-region writes or regulatory isolation stronger than the current tenancy model. Such a change requires a new authority/distribution ADR, not an infrastructure-only patch.
