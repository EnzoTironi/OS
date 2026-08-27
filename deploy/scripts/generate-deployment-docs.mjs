import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";

const chartPath = "deploy/helm/zoen/Chart.yaml";
const valuesPath = "deploy/helm/zoen/values.yaml";
const outputPath = "deploy/helm/zoen/README.md";
const profileNames = ["shared-saas", "dedicated", "self-hosted"];
const chart = parse(await readFile(chartPath, "utf8"));
const defaults = parse(await readFile(valuesPath, "utf8"));
const profiles = await Promise.all(
  profileNames.map(async (name) => {
    const path = `deploy/helm/zoen/profiles/${name}.yaml`;
    return {
      name,
      path,
      values: merge(defaults, parse(await readFile(path, "utf8"))),
    };
  }),
);

const rows = profiles
  .map(
    ({ name, values }) =>
      `| \`${name}\` | ${values.tenants.length} | ${values.reference.enabled ? "in release" : `external in \`${values.global.durableNamespace}\``} | \`${values.postgres.host}\` | ${values.restate.topology.productionReplicas} nodes, replication ${values.restate.topology.replicationFactor} | ${values.telemetry.enabled ? "enabled" : "disabled"} | ${values.networkPolicy.enabled ? "deny undeclared egress" : "platform policy"} |`,
  )
  .join("\n");

const installs = profiles
  .map(
    ({ name, path }) => `### Install \`${name}\`

\`\`\`sh
helm upgrade --install zoen oci://REGISTRY/zoen/charts/zoen \\
  --version ${chart.version} \\
  --namespace zoen-${name} \\
  --create-namespace \\
  --values ${path} \\
  --set-string definitionDigest=DEFINITION_SHA256 \\
  --set-string images.rust.repository=RUST_REPOSITORY \\
  --set-string images.rust.digest=RUST_SHA256 \\
  --set-string images.node.repository=NODE_REPOSITORY \\
  --set-string images.node.digest=NODE_SHA256
\`\`\``,
  )
  .join("\n\n");

const content = `# Install and upgrade Zoen

This reference is generated from \`values.yaml\` and the three profile files that the deployment E2E commands install. Run \`node deploy/scripts/generate-deployment-docs.mjs\` after a tested value changes.

## Profile contract

| Profile | Tenants | Dependencies | PostgreSQL authority | Supported Restate production shape | Telemetry | Egress |
| --- | ---: | --- | --- | --- | --- | --- |
${rows}

Every profile keeps \`tenantAwareness: true\`, \`configVersion: zoen.config.v1\`, and the same Rust and Node image digests. The values schema rejects unknown keys, mutable image tags for Zoen applications, unsupported config versions, incompatible migration preflight states, and deployment-specific semantic flags.

## Create the runtime secret

Create \`zoen-runtime\` in each application namespace before installation. The chart reads these keys:

- \`databaseUrl\`
- \`projectionDatabaseUrl\` for the projection worker
- \`databaseUrlTenantA\`, and \`databaseUrlTenantB\` for the shared profile
- \`postgresAdminPassword\` and \`postgresApplicationPassword\` for reference PostgreSQL
- \`s3AccessKeyId\` and \`s3SecretAccessKey\`
- \`harnessBindingKey\`, \`harnessClientSecretA\`, and \`harnessClientSecretB\`
- \`connectorCallerToken\`, \`connectorCredentials\`, and \`workerCredentialRefs\`
- \`effectOidcClients\`
- \`restateRequestIdentityKeys\` and \`restateRequestIdentityPrivateKey\` for Restate request identity

Use customer-controlled secret management in production. Do not commit the values of these keys.

## Install reference dependencies

Dedicated and self-hosted application releases consume durable external endpoints. To install the customer-controlled reference stack from the same signed chart, use a separate durable namespace:

\`\`\`sh
helm upgrade --install zoen-dependencies oci://REGISTRY/zoen/charts/zoen \\
  --version ${chart.version} \\
  --namespace zoen-self-hosted-durable \\
  --create-namespace \\
  --values deploy/helm/zoen/profiles/self-hosted.yaml \\
  --set applications.enabled=false \\
  --set reference.enabled=true \\
  --set networkPolicy.enabled=false \\
  --set-file keycloak.realmJson=realm.json
\`\`\`

The reference release runs PostgreSQL 18 with pgvector, MinIO, Keycloak, Restate with persistent state, and an OpenTelemetry collector. The profile records the supported three-node Restate production topology with replication factor two. Dedicated and self-hosted deployment E2E still install the reference one-node PostgreSQL and Restate topology and do not claim the reliability drill.

## Reliability overlay

High availability is a topology overlay, not a fourth commercial profile. Apply \`deploy/helm/zoen/overlays/reliability.yaml\` on top of \`dedicated\` for the V1-21 drills. That overlay selects PostgreSQL HA (primary plus streaming replica), WAL archive to the \`zoen-wal\` bucket, three-node Restate with replication factor two, and \`zoend.replicas >= 2\`. Restore is into a fresh cluster; Restate is rebuildable orchestration and PostgreSQL \`effect_*\` tables remain authority.

## Install an application profile

${installs}

## Upgrade

Use the next signed chart and explicit tested values. Do not use \`--reuse-values\`.

\`\`\`sh
helm upgrade zoen oci://REGISTRY/zoen/charts/zoen \\
  --version NEXT_CHART_VERSION \\
  --namespace APPLICATION_NAMESPACE \\
  --values PROFILE_PATH \\
  --set-string definitionDigest=DEFINITION_SHA256 \\
  --set-string images.rust.repository=RUST_REPOSITORY \\
  --set-string images.rust.digest=RUST_SHA256 \\
  --set-string images.node.repository=NODE_REPOSITORY \\
  --set-string images.node.digest=NODE_SHA256
\`\`\`

Keep \`migration.compatibility\` at \`current\` or \`previous\`. Any other value fails before Helm changes the release.

## Reinstall the application namespace

Keep the durable dependency release running. Delete only the application release and namespace. Create \`zoen-runtime\` in a new namespace, then run the profile install command against the same dependency endpoints and signed artifact digests. The deployment E2E suite verifies the definition, Action, query, effect, explanation, UI result, and authority digest after this procedure.
`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8");
  if (current !== content) {
    throw new Error(`${outputPath} is stale`);
  }
} else {
  await writeFile(outputPath, content);
}

function merge(base, override) {
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }
  return Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(override)])].map(
      (key) => [
        key,
        key in override ? merge(base[key], override[key]) : base[key],
      ],
    ),
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
