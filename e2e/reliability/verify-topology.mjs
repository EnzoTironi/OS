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

const referencePostgres = statefulSets(reference, "postgres");
const referenceReplica = statefulSets(reference, "postgres-replica");
const referenceRestate = statefulSets(reference, "restate");
assert.equal(referencePostgres.length, 1);
assert.equal(referencePostgres[0]?.spec?.replicas, 1);
assert.equal(referenceReplica.length, 0);
assert.equal(referenceRestate.length, 1);
assert.equal(referenceRestate[0]?.spec?.replicas, 1);

const zoend = deployments(application, "zoend");
assert.equal(zoend.length, 1);
assert.ok((zoend[0]?.spec?.replicas ?? 0) >= 2);
const container = zoend[0]?.spec?.template?.spec?.containers?.[0];
assert.equal(container?.readinessProbe?.httpGet?.path, "/ready");
assert.equal(container?.startupProbe?.httpGet?.path, "/ready");
assert.equal(container?.readinessProbe?.tcpSocket, undefined);
assert.equal(container?.startupProbe?.tcpSocket, undefined);

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

function deployments(documents, name) {
  return documents.filter(
    (document) =>
      document.kind === "Deployment" && document.metadata?.name === name,
  );
}

function serviceSelector(documents, name) {
  const service = documents.find(
    (document) => document.kind === "Service" && document.metadata?.name === name,
  );
  return service?.spec?.selector;
}
