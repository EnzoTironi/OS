# Install and upgrade Zoen

This reference is generated from `values.yaml` and the three profile files that the deployment E2E commands install. Run `node deploy/scripts/generate-deployment-docs.mjs` after a tested value changes.

## Profile contract

| Profile | Tenants | Dependencies | PostgreSQL authority | Supported Restate production shape | Telemetry | Egress |
| --- | ---: | --- | --- | --- | --- | --- |
| `shared-saas` | 2 | in release | `postgres` | 3 nodes, replication 2 | enabled | platform policy |
| `dedicated` | 1 | external in `zoen-dedicated-durable` | `postgres.zoen-dedicated-durable.svc.cluster.local` | 3 nodes, replication 2 | enabled | platform policy |
| `self-hosted` | 1 | external in `zoen-self-hosted-durable` | `postgres.zoen-self-hosted-durable.svc.cluster.local` | 3 nodes, replication 2 | disabled | deny undeclared egress |

Every profile keeps `tenantAwareness: true`, `configVersion: zoen.config.v1`, and the same Rust and Node image digests. The values schema rejects unknown keys, mutable image tags for Zoen applications, unsupported config versions, incompatible migration preflight states, and deployment-specific semantic flags.

## Create the runtime secret

Create `zoen-runtime` in each application namespace before installation. The chart reads these keys:

- `databaseUrl`
- `projectionDatabaseUrl` for the projection worker
- `databaseUrlTenantA`, and `databaseUrlTenantB` for the shared profile
- `postgresAdminPassword` and `postgresApplicationPassword` for reference PostgreSQL
- `s3AccessKeyId` and `s3SecretAccessKey`
- `harnessBindingKey`, `harnessClientSecretA`, and `harnessClientSecretB`
- `connectorCallerToken`, `connectorCredentials`, and `workerCredentialRefs`
- `effectOidcClients`

Use customer-controlled secret management in production. Do not commit the values of these keys.

## Install reference dependencies

Dedicated and self-hosted application releases consume durable external endpoints. To install the customer-controlled reference stack from the same signed chart, use a separate durable namespace:

```sh
helm upgrade --install zoen-dependencies oci://REGISTRY/zoen/charts/zoen \
  --version 0.3.0 \
  --namespace zoen-self-hosted-durable \
  --create-namespace \
  --values deploy/helm/zoen/profiles/self-hosted.yaml \
  --set applications.enabled=false \
  --set reference.enabled=true \
  --set networkPolicy.enabled=false \
  --set-file keycloak.realmJson=realm.json
```

The reference release runs PostgreSQL 18 with pgvector, MinIO, Keycloak, Restate with persistent state, and an OpenTelemetry collector. The profile records the supported three-node Restate production topology with replication factor two. Dedicated and self-hosted deployment E2E still install the reference one-node PostgreSQL and Restate topology and do not claim the reliability drill.

## Reliability overlay

High availability is a topology overlay, not a fourth commercial profile. Apply `deploy/helm/zoen/overlays/reliability.yaml` on top of `dedicated` for the V1-21 drills. That overlay selects PostgreSQL HA (primary plus streaming replica), WAL archive to the `zoen-wal` bucket, three-node Restate with replication factor two, and `zoend.replicas >= 2`. Restore is into a fresh cluster; Restate is rebuildable orchestration and PostgreSQL `effect_*` tables remain authority.

## Install an application profile

### Install `shared-saas`

```sh
helm upgrade --install zoen oci://REGISTRY/zoen/charts/zoen \
  --version 0.3.0 \
  --namespace zoen-shared-saas \
  --create-namespace \
  --values deploy/helm/zoen/profiles/shared-saas.yaml \
  --set-string definitionDigest=DEFINITION_SHA256 \
  --set-string images.rust.repository=RUST_REPOSITORY \
  --set-string images.rust.digest=RUST_SHA256 \
  --set-string images.node.repository=NODE_REPOSITORY \
  --set-string images.node.digest=NODE_SHA256
```

### Install `dedicated`

```sh
helm upgrade --install zoen oci://REGISTRY/zoen/charts/zoen \
  --version 0.3.0 \
  --namespace zoen-dedicated \
  --create-namespace \
  --values deploy/helm/zoen/profiles/dedicated.yaml \
  --set-string definitionDigest=DEFINITION_SHA256 \
  --set-string images.rust.repository=RUST_REPOSITORY \
  --set-string images.rust.digest=RUST_SHA256 \
  --set-string images.node.repository=NODE_REPOSITORY \
  --set-string images.node.digest=NODE_SHA256
```

### Install `self-hosted`

```sh
helm upgrade --install zoen oci://REGISTRY/zoen/charts/zoen \
  --version 0.3.0 \
  --namespace zoen-self-hosted \
  --create-namespace \
  --values deploy/helm/zoen/profiles/self-hosted.yaml \
  --set-string definitionDigest=DEFINITION_SHA256 \
  --set-string images.rust.repository=RUST_REPOSITORY \
  --set-string images.rust.digest=RUST_SHA256 \
  --set-string images.node.repository=NODE_REPOSITORY \
  --set-string images.node.digest=NODE_SHA256
```

## Upgrade

Use the next signed chart and explicit tested values. Do not use `--reuse-values`.

```sh
helm upgrade zoen oci://REGISTRY/zoen/charts/zoen \
  --version NEXT_CHART_VERSION \
  --namespace APPLICATION_NAMESPACE \
  --values PROFILE_PATH \
  --set-string definitionDigest=DEFINITION_SHA256 \
  --set-string images.rust.repository=RUST_REPOSITORY \
  --set-string images.rust.digest=RUST_SHA256 \
  --set-string images.node.repository=NODE_REPOSITORY \
  --set-string images.node.digest=NODE_SHA256
```

Keep `migration.compatibility` at `current` or `previous`. Any other value fails before Helm changes the release.

## Reinstall the application namespace

Keep the durable dependency release running. Delete only the application release and namespace. Create `zoen-runtime` in a new namespace, then run the profile install command against the same dependency endpoints and signed artifact digests. The deployment E2E suite verifies the definition, Action, query, effect, explanation, UI result, and authority digest after this procedure.
