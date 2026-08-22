import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
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

const backupSequencePath = path.join(
  outputDirectory,
  "backup-commit-sequence.txt",
);
let backupCommitSequence = null;
try {
  const raw = (await readFile(backupSequencePath, "utf8")).trim();
  if (raw.length > 0) {
    backupCommitSequence = Number(raw);
  }
} catch {
  backupCommitSequence = null;
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
  backupCommitSequence,
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

const evidencePath = path.join(outputDirectory, "evidence.json");
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
await assertNoSecrets(outputDirectory);
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

async function assertNoSecrets(directory) {
  const forbidden = [
    "postgres:postgres",
    "zoen_app:zoen_app",
    "zoen-secret",
    "zoen-access",
    "harness-a-secret",
    "harness-b-secret",
    "effect-worker-a-secret",
    "effect-worker-b-secret",
    "agent-a-secret",
    "BEGIN COSIGN PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN EC PRIVATE KEY",
    "COSIGN_PRIVATE_KEY",
  ];
  const hits = [];
  for (const file of await listEvidenceFiles(directory)) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const secret of forbidden) {
      if (text.includes(secret)) {
        hits.push(`${path.relative(directory, file)}:${secret}`);
      }
    }
  }
  if (hits.length > 0) {
    throw new Error(`evidence contains secrets: ${hits.join(", ")}`);
  }
}

async function listEvidenceFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "wal") {
        continue;
      }
      files.push(...(await listEvidenceFiles(fullPath)));
      continue;
    }
    if (entry.name.endsWith(".key")) {
      throw new Error(`evidence contains private key file ${entry.name}`);
    }
    if (entry.name.endsWith(".tgz")) {
      continue;
    }
    const info = await stat(fullPath);
    if (info.size > 2_000_000) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}
