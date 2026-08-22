import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [
  drill,
  metadataPath,
  semanticStatePath,
  mutantsPath,
  recoveryPath,
  outputDirectory,
] = process.argv.slice(2);
if (
  drill === undefined ||
  metadataPath === undefined ||
  semanticStatePath === undefined ||
  mutantsPath === undefined ||
  recoveryPath === undefined ||
  outputDirectory === undefined
) {
  throw new Error("finalize-evidence.mjs received incomplete arguments");
}

const metadataText = await readFile(metadataPath, "utf8");
const metadata = JSON.parse(metadataText);
const semantic = JSON.parse(await readFile(semanticStatePath, "utf8"));
const mutants = parseRows(await readFile(mutantsPath, "utf8"));
const recovery = parseRows(await readFile(recoveryPath, "utf8"));
const startedAt = process.env.ZOEN_RELIABILITY_STARTED_AT;
if (startedAt === undefined) {
  throw new Error("ZOEN_RELIABILITY_STARTED_AT is required");
}

const rpoRtoPath = path.join(outputDirectory, "rpo-rto.json");
let rpoRto;
try {
  rpoRto = JSON.parse(await readFile(rpoRtoPath, "utf8"));
} catch {
  rpoRto = null;
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
    walG: "v3.0.7",
  },
  drill,
  finishedAt: new Date().toISOString(),
  mutants,
  overlay: "deploy/helm/zoen/overlays/reliability.yaml",
  profile: "dedicated",
  recovery,
  rpoRto,
  scenario: drill,
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
