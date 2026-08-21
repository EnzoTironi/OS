# Shared SaaS deployment and isolation proof

## Problem

The shared SaaS profile runs two tenants on one PostgreSQL, MinIO, Restate, and `zoend` deployment. The deployment must derive the tenant from OIDC, scope every durable identity, and prove that collisions do not cross a tenant boundary.

## Usage

Install the profile through the ticket command:

```sh
just e2e shared-tenancy
```

The command builds two application images, signs their registry digests, creates a kind cluster, installs the `shared-saas` Helm profile, runs the attack matrix, restarts the shared services, and writes `artifacts/shared-tenancy/evidence.json`.

## Shape

The Helm chart owns the production topology. The `shared-saas` values file selects replicas, storage, OIDC, and public service settings without changing semantic behavior.

Each harness process binds one verified OIDC principal to one tenant. The process derives Company Brain queries, object keys, ActionService calls, and Restate keys from that context. Request data cannot select another tenant.

The runner models each attack as a case with a boundary, an expected typed outcome, and redacted evidence. It runs each deliberate mutant by itself and requires the normal attack assertion to reject the mutant.

## Synthesis decision

The selected design installs the reference dependencies and Zoen services from one chart. It uses an external black-box runner as the client. This keeps deployment concerns in Helm and attack concerns in one typed matrix.

## Tradeoffs accepted

- The reference profile runs single-node PostgreSQL, MinIO, Keycloak, and Restate inside the ephemeral cluster. The ticket proves tenancy, not high availability.
- The profile publishes NodePort services for the ephemeral test. Production operators can replace that exposure with ingress without changing the workloads.
- The required run uses a local embedding model and no chat model. Agent requests fail closed when no planning provider is configured.

## Alternatives considered

An application-only chart plus separate test manifests would split the production topology across two owners. A Kubernetes Job runner would simplify cluster networking but would not exercise the browser from outside the cluster.

## Risks

The run depends on Docker registry, kind, Helm, and cosign startup in one process. The lifecycle script owns cleanup and records each artifact digest before Helm installation.

## Next implementation step

Add tenant-scoped projection and Restate session keys before the chart starts using those paths.
