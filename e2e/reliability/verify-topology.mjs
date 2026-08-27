import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAllDocuments } from "yaml";

const [overlayPath, referencePath, applicationPath] = process.argv.slice(2);
if (
  overlayPath === undefined ||
  referencePath === undefined ||
  applicationPath === undefined
) {
  throw new Error(
    "usage: verify-topology.mjs <overlay-deps> <reference-deps> <application>",
  );
}

const overlay = parseManifest(await readFile(overlayPath, "utf8"));
const reference = parseManifest(await readFile(referencePath, "utf8"));
const application = parseManifest(await readFile(applicationPath, "utf8"));

const overlayPostgres = statefulSets(overlay, "postgres");
const overlayReplica = statefulSets(overlay, "postgres-replica");
const overlayRestate = statefulSets(overlay, "restate");
assert.equal(overlayPostgres.length, 1);
assert.equal(overlayPostgres[0]?.spec?.replicas, 1);
assert.equal(overlayReplica.length, 1);
assert.equal(overlayReplica[0]?.spec?.replicas, 1);
assert.equal(overlayRestate.length, 1);
assert.equal(overlayRestate[0]?.spec?.replicas, 3);
assert.equal(
  serviceSelector(overlay, "postgres")?.["zoen.dev/postgres-role"],
  "primary",
);
assertUniqueEnvNames(overlayPostgres[0], "postgres");
assertUniqueEnvNames(overlayReplica[0], "postgres");
assertSecretEnv(
  overlayPostgres[0],
  "postgres",
  "POSTGRES_APPLICATION_PASSWORD",
  "postgresApplicationPassword",
);
assertSecretEnv(
  overlayPostgres[0],
  "postgres",
  "POSTGRES_PROJECTION_PASSWORD",
  "postgresProjectionPassword",
);
assertSecretEnv(
  overlayPostgres[0],
  "postgres",
  "POSTGRES_REPLICATION_PASSWORD",
  "postgresReplicationPassword",
);
assertSecretEnv(
  overlayReplica[0],
  "postgres",
  "POSTGRES_REPLICATION_PASSWORD",
  "postgresReplicationPassword",
);
const replicaCommand = containerCommand(overlayReplica[0], "postgres");
assert.match(replicaCommand, /max_wal_senders=16/u);
assert.match(replicaCommand, /max_replication_slots=16/u);
assert.match(replicaCommand, /wal_level=replica/u);
assert.doesNotMatch(replicaCommand, /restore_command/u);
assert.doesNotMatch(replicaCommand, /wal-g/u);

const referencePostgres = statefulSets(reference, "postgres");
const referenceReplica = statefulSets(reference, "postgres-replica");
const referenceRestate = statefulSets(reference, "restate");
assert.equal(referencePostgres.length, 1);
assert.equal(referencePostgres[0]?.spec?.replicas, 1);
assert.equal(referenceReplica.length, 0);
assert.equal(referenceRestate.length, 1);
assert.equal(referenceRestate[0]?.spec?.replicas, 1);
const referenceContainer =
  referencePostgres[0]?.spec?.template?.spec?.containers?.[0];
assert.equal(referenceContainer?.command, undefined);
assert.equal(referenceContainer?.args, undefined);
assertSecretEnv(
  referencePostgres[0],
  "postgres",
  "POSTGRES_APPLICATION_PASSWORD",
  "postgresApplicationPassword",
);
assertSecretEnv(
  referencePostgres[0],
  "postgres",
  "POSTGRES_PROJECTION_PASSWORD",
  "postgresProjectionPassword",
);
assert.equal(
  containerEnv(referencePostgres[0], "postgres").find(
    (item) => item.name === "POSTGRES_REPLICATION_PASSWORD",
  ),
  undefined,
);
const overlayInit = configMap(overlay, "zoen-postgres-init")?.data ?? {};
const referenceInit = configMap(reference, "zoen-postgres-init")?.data ?? {};
assert.ok(overlayInit["001-roles.sh"]);
assert.equal(overlayInit["001-roles.sql"], undefined);
assert.equal(overlayInit["001-projection-role.sh"], undefined);
assert.equal(overlayInit["004-replication.sh"], undefined);
assert.equal(overlayInit["004-replication.sql"], undefined);
assert.match(
  overlayInit["001-roles.sh"],
  /POSTGRES_APPLICATION_PASSWORD is required/u,
);
assert.match(
  overlayInit["001-roles.sh"],
  /POSTGRES_PROJECTION_PASSWORD is required/u,
);
assert.match(
  overlayInit["001-roles.sh"],
  /POSTGRES_REPLICATION_PASSWORD is required/u,
);
assert.match(overlayInit["001-roles.sh"], /CREATE ROLE replicator/u);
assertNoLiteralPassword(overlayInit["001-roles.sh"], "overlay 001-roles.sh");
assert.ok(referenceInit["001-roles.sh"]);
assert.equal(referenceInit["001-projection-role.sh"], undefined);
assert.equal(referenceInit["004-replication.sh"], undefined);
assert.equal(referenceInit["004-replication.sql"], undefined);
assertNoLiteralPassword(referenceInit["001-roles.sh"], "reference 001-roles.sh");
assert.equal(configMap(reference, "zoen-postgres-start"), undefined);
const projectionJob = job(application, "zoen-projection-role");
assert.ok(projectionJob);
assertSecretEnv(
  projectionJob,
  "create-role",
  "POSTGRES_PROJECTION_PASSWORD",
  "postgresProjectionPassword",
);
const projectionCommand = containerCommand(projectionJob, "create-role");
assert.match(projectionCommand, /POSTGRES_PROJECTION_PASSWORD is required/u);
assert.match(projectionCommand, /ALTER ROLE/u);
assertNoLiteralPassword(projectionCommand, "projection-role Job");

const zoend = deployments(application, "zoend");
assert.equal(zoend.length, 1);
assert.ok((zoend[0]?.spec?.replicas ?? 0) >= 2);
const spec = zoend[0]?.spec;
const container = spec?.template?.spec?.containers?.[0];
assert.equal(Number(spec?.strategy?.rollingUpdate?.maxUnavailable), 0);
assert.equal(container?.readinessProbe?.httpGet?.path, "/ready");
assert.equal(container?.startupProbe?.httpGet?.path, "/ready");
assert.equal(container?.livenessProbe?.httpGet?.path, "/ready");
assert.equal(container?.lifecycle?.preStop?.exec?.command?.[0], "/bin/sleep");
assert.equal(container?.readinessProbe?.tcpSocket, undefined);
assert.equal(container?.startupProbe?.tcpSocket, undefined);
assert.equal(container?.livenessProbe?.tcpSocket, undefined);

function parseManifest(text) {
  return parseAllDocuments(text)
    .map((document) => document.toJSON())
    .filter((value) => value !== null && typeof value === "object");
}

function statefulSets(documents, name) {
  return documents.filter(
    (document) =>
      document.kind === "StatefulSet" && document.metadata?.name === name,
  );
}

function configMap(documents, name) {
  return documents.find(
    (document) =>
      document.kind === "ConfigMap" && document.metadata?.name === name,
  );
}

function deployments(documents, name) {
  return documents.filter(
    (document) =>
      document.kind === "Deployment" && document.metadata?.name === name,
  );
}

function job(documents, name) {
  return documents.find(
    (document) => document.kind === "Job" && document.metadata?.name === name,
  );
}

function containerEnv(resource, containerName) {
  const container = resource?.spec?.template?.spec?.containers?.find(
    (item) => item.name === containerName,
  );
  return container?.env ?? [];
}

function assertNoLiteralPassword(text, label) {
  assert.doesNotMatch(
    text ?? "",
    /PASSWORD '/u,
    `${label} must not contain PASSWORD 'literal'`,
  );
}

function assertSecretEnv(resource, containerName, envName, secretKey) {
  const entry = containerEnv(resource, containerName).find(
    (item) => item.name === envName,
  );
  assert.equal(entry?.value, undefined, `${envName} must not be a literal`);
  assert.equal(entry?.valueFrom?.secretKeyRef?.name, "zoen-runtime");
  assert.equal(entry?.valueFrom?.secretKeyRef?.key, secretKey);
}

function containerCommand(statefulSet, containerName) {
  const container = statefulSet?.spec?.template?.spec?.containers?.find(
    (item) => item.name === containerName,
  );
  return [...(container?.command ?? []), ...(container?.args ?? [])].join(" ");
}

function assertUniqueEnvNames(statefulSet, containerName) {
  const container = statefulSet?.spec?.template?.spec?.containers?.find(
    (item) => item.name === containerName,
  );
  const names = (container?.env ?? []).map((entry) => entry.name);
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(
        `${statefulSet?.metadata?.name} container ${containerName} has duplicate env ${name}`,
      );
    }
    seen.add(name);
  }
}

function serviceSelector(documents, name) {
  const service = documents.find(
    (document) => document.kind === "Service" && document.metadata?.name === name,
  );
  return service?.spec?.selector;
}
