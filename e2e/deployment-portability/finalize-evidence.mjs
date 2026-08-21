import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [
  profile,
  sourceProfilePath,
  metadataPath,
  semanticStatePath,
  mutantsPath,
  recoveryPath,
  networkAuditPath,
  outputDirectory,
] = process.argv.slice(2);
if (
  profile === undefined ||
  sourceProfilePath === undefined ||
  metadataPath === undefined ||
  semanticStatePath === undefined ||
  mutantsPath === undefined ||
  recoveryPath === undefined ||
  networkAuditPath === undefined ||
  outputDirectory === undefined
) {
  throw new Error("finalize-evidence.mjs received incomplete arguments");
}

const metadataText = await readFile(metadataPath, "utf8");
const metadata = JSON.parse(metadataText);
const semantic = JSON.parse(await readFile(semanticStatePath, "utf8"));
const mutants = parseRows(await readFile(mutantsPath, "utf8"));
const recovery = parseRows(await readFile(recoveryPath, "utf8"));
const networkAudit = JSON.parse(await readFile(networkAuditPath, "utf8"));
const profileText = await readFile(sourceProfilePath, "utf8");
const startedAt = process.env.ZOEN_DEPLOYMENT_STARTED_AT;
if (startedAt === undefined) {
  throw new Error("ZOEN_DEPLOYMENT_STARTED_AT is required");
}

const evidence = {
  artifactSetDigest: sha256(metadataText.trim()),
  artifacts: {
    chart: {
      digest: metadata.chartDigest,
      packageDigest: metadata.chartPackageDigest,
      repository: metadata.chartRepository,
      sbomDigest: metadata.chartSbomDigest,
      signatureDigest: metadata.chartSignatureDigest,
      version: metadata.chartVersion,
    },
    node: {
      digest: metadata.nodeDigest,
      repository: metadata.nodeRepository,
      sbomDigest: metadata.nodeSbomDigest,
      signatureDigest: metadata.nodeSignatureDigest,
    },
    rust: {
      digest: metadata.rustDigest,
      repository: metadata.rustRepository,
      sbomDigest: metadata.rustSbomDigest,
      signatureDigest: metadata.rustSignatureDigest,
    },
    signingPublicKeyDigest: metadata.publicKeyDigest,
  },
  components: {
    kubernetes: "kind",
    objectStorage: "MinIO",
    oidc: "Keycloak",
    postgres: "18",
    restate: "1.7.2",
    telemetry: "OpenTelemetry Collector",
  },
  configDigest: sha256(profileText),
  configVersion: "zoen.config.v1",
  finishedAt: new Date().toISOString(),
  mutants,
  networkAudit,
  profile,
  recovery,
  scenario:
    profile === "dedicated"
      ? "deploy-dedicated"
      : "deploy-self-hosted-isolated",
  semantic,
  sourceSha: metadata.sourceSha,
  startedAt,
  verdict: "PASS",
};

await writeFile(
  path.join(outputDirectory, "evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

function parseRows(value) {
  return value
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [id, result, observation] = row.split("\t");
      if (id === undefined || result !== "PASS" || observation === undefined) {
        throw new Error(`invalid evidence row ${row}`);
      }
      return { id, observation, result };
    });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
