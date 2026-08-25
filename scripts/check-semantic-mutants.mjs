import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const LAWS = [
  "foreign namespace/operation commit",
  "intent mismatch replay",
  "stale-basis omission",
  "child delegation escalation",
  "partial multi-record commit",
  "live mutation of published executable definition material",
  "missing rival/computational lineage",
  "unsafe retry after ambiguous external effect",
  "tenant-crossing query/cache key",
  "projection served below requested freshness cut",
  "direct agent/UI bypass of Action authority",
];

const repositoryRoot = process.cwd();
const inventoryPath = path.join(repositoryRoot, "testdata/semantic-mutants.json");
const adrPath = path.join(
  repositoryRoot,
  "docs/adr/0021-v1-end-to-end-verification-and-release-gates.md",
);
const workflowPath = path.join(repositoryRoot, ".github/workflows/verify.yml");
const runShPath = path.join(repositoryRoot, "e2e/run.sh");

const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const adr = await readFile(adrPath, "utf8");
const workflow = parseYaml(await readFile(workflowPath, "utf8"));
const runSh = await readFile(runShPath, "utf8");
const errors = [];
const sourceCache = new Map();

const matrixScenarios = workflow?.jobs?.e2e?.strategy?.matrix?.scenario;
if (!Array.isArray(matrixScenarios) || matrixScenarios.length === 0) {
  errors.push("missing jobs.e2e.strategy.matrix.scenario");
}
const defaultCi = new Set((matrixScenarios ?? []).map(String));

const tableMatch = runSh.match(/scenario_table=\(([\s\S]*?)\n\)/);
if (tableMatch === null) {
  errors.push("missing scenario_table in e2e/run.sh");
}
const liveScenarios = new Set();
for (const line of (tableMatch?.[1] ?? "").split("\n")) {
  const match = line.match(/^\s*"([^"]+)"/);
  if (match === null) {
    continue;
  }
  const fields = match[1].split(":");
  const name = fields[0];
  const klass = fields[3] ?? "";
  if (name !== undefined && name !== "" && klass === "live") {
    liveScenarios.add(name);
  }
}

if (!Array.isArray(inventory.mutants) || inventory.mutants.length !== LAWS.length) {
  errors.push(`inventory must list exactly ${LAWS.length} mutants`);
}

for (const [index, law] of LAWS.entries()) {
  if (!adr.includes(law)) {
    errors.push(`ADR-0021 omitted law: ${law}`);
  }
  const mutant = inventory.mutants?.[index];
  if (mutant === undefined) {
    continue;
  }
  if (mutant.id !== index + 1) {
    errors.push(`mutant ${index + 1} has id ${String(mutant.id)}`);
  }
  if (mutant.law !== law) {
    errors.push(`mutant ${index + 1} law drifted: ${String(mutant.law)}`);
  }
  const proof = mutant.proof;
  if (proof === null || typeof proof !== "object") {
    errors.push(`mutant ${index + 1} missing proof`);
    continue;
  }
  const needles = proofNeedles(proof, index);
  if (needles.length === 0) {
    continue;
  }
  switch (proof.kind) {
    case "e2e": {
      await checkE2eProof({ index, needles, proof });
      break;
    }
    case "cargo-test": {
      await checkCargoProof({ index, needles, proof });
      break;
    }
    default: {
      errors.push(`mutant ${index + 1} unknown proof.kind: ${String(proof.kind)}`);
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`${JSON.stringify({ rule: "semantic-mutants", errors }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      rule: "semantic-mutants",
      mutants: LAWS.length,
      defaultCiProofs: inventory.mutants.filter((mutant) => mutant.proof.kind === "e2e").length,
      cargoTestProofs: inventory.mutants.filter((mutant) => mutant.proof.kind === "cargo-test")
        .length,
    })}\n`,
  );
}

function proofNeedles(proof, index) {
  if ("needle" in proof) {
    errors.push(`mutant ${index + 1} uses needle; use a non-empty needles array`);
    return [];
  }
  if (!Array.isArray(proof.needles) || proof.needles.length === 0) {
    errors.push(`mutant ${index + 1} proof needs a non-empty needles array`);
    return [];
  }
  const needles = [];
  for (const [needleIndex, needle] of proof.needles.entries()) {
    if (typeof needle !== "string" || needle.trim() === "") {
      errors.push(`mutant ${index + 1} needles[${needleIndex}] is empty`);
      continue;
    }
    needles.push(needle);
  }
  return needles;
}

async function checkE2eProof({ index, needles, proof }) {
  if (typeof proof.scenario !== "string" || proof.scenario.trim() === "") {
    errors.push(`mutant ${index + 1} e2e proof needs scenario`);
    return;
  }
  if (proof.scenario.includes("v1-company") || proof.entrypoint?.includes("v1-company")) {
    errors.push(`mutant ${index + 1} cites v1-company; that scenario is not default CI`);
  }
  if (!defaultCi.has(proof.scenario)) {
    errors.push(`mutant ${index + 1} scenario ${proof.scenario} is not in default CI`);
  }
  if (!liveScenarios.has(proof.scenario)) {
    errors.push(`mutant ${index + 1} scenario ${proof.scenario} is not live`);
  }
  const expectedEntrypoint = `e2e/${proof.scenario}.ts`;
  if (typeof proof.entrypoint !== "string" || proof.entrypoint.trim() === "") {
    errors.push(`mutant ${index + 1} e2e proof needs entrypoint`);
    return;
  }
  if (proof.entrypoint !== expectedEntrypoint) {
    errors.push(
      `mutant ${index + 1} entrypoint must be the executed runner ${expectedEntrypoint}`,
    );
  }
  const source = await readSource(proof.entrypoint, index);
  requireNeedles({ index, needles, source, target: proof.entrypoint });
}

async function checkCargoProof({ index, needles, proof }) {
  if (typeof proof.file !== "string" || proof.file.trim() === "") {
    errors.push(`mutant ${index + 1} cargo-test proof needs file`);
    return;
  }
  if (!runSh.includes("cargo test --locked --workspace")) {
    errors.push("run_lint no longer runs cargo test --locked --workspace");
  }
  const source = await readSource(proof.file, index);
  requireNeedles({ index, needles, source, target: proof.file });
}

async function readSource(relativePath, index) {
  if (sourceCache.has(relativePath)) {
    return sourceCache.get(relativePath);
  }
  const source = await readFile(path.join(repositoryRoot, relativePath), "utf8").catch(() => {
    errors.push(`mutant ${index + 1} missing file ${relativePath}`);
    return "";
  });
  sourceCache.set(relativePath, source);
  return source;
}

function requireNeedles({ index, needles, source, target }) {
  if (source.trim() === "") {
    errors.push(`mutant ${index + 1} ${target} is empty`);
    return;
  }
  for (const needle of needles) {
    if (!containsToken(source, needle)) {
      errors.push(`mutant ${index + 1} needle missing from ${target}: ${needle}`);
    }
  }
}

function containsToken(source, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`).test(source);
}
