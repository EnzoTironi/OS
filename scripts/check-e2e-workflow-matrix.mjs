import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const CLASSES = new Set(["live", "archive", "kind", "scale", "credential"]);
const repositoryRoot = process.cwd();
const workflowPath = path.join(repositoryRoot, ".github/workflows/verify.yml");
const runShPath = path.join(repositoryRoot, "e2e/run.sh");
const roadmapPath = path.join(repositoryRoot, "docs/product/roadmap.json");

const workflow = parseYaml(await readFile(workflowPath, "utf8"));
const matrixScenarios = workflow?.jobs?.e2e?.strategy?.matrix?.scenario;
if (!Array.isArray(matrixScenarios) || matrixScenarios.length === 0) {
  process.stderr.write(
    `${JSON.stringify({ rule: "e2e-workflow-matrix", error: "missing jobs.e2e.strategy.matrix.scenario" }, null, 2)}\n`,
  );
  process.exitCode = 1;
  process.exit();
}

const runSh = await readFile(runShPath, "utf8");
const tableMatch = runSh.match(/scenario_table=\(([\s\S]*?)\n\)/);
if (tableMatch === null) {
  process.stderr.write(
    `${JSON.stringify({ rule: "e2e-workflow-matrix", error: "missing scenario_table in e2e/run.sh" }, null, 2)}\n`,
  );
  process.exitCode = 1;
  process.exit();
}

const rows = [];
for (const line of tableMatch[1].split("\n")) {
  const match = line.match(/^\s*"([^"]+)"/);
  if (match === null) {
    continue;
  }
  const fields = match[1].split(":");
  const name = fields[0];
  const klass = fields[3] ?? "";
  if (name === undefined || name === "") {
    continue;
  }
  rows.push({ name, klass });
}

const scenarioTableNames = new Set(rows.map((row) => row.name));
const classByName = new Map(rows.map((row) => [row.name, row.klass]));
const invalidClass = rows.filter((row) => !CLASSES.has(row.klass));
const missing = matrixScenarios
  .map(String)
  .filter((name) => !scenarioTableNames.has(name))
  .sort();
const nonLiveMatrix = matrixScenarios
  .map(String)
  .filter((name) => classByName.get(name) !== "live")
  .sort();

const roadmap = JSON.parse(await readFile(roadmapPath, "utf8"));
const producer = /(?:just e2e |\.\/e2e\/run\.sh run )([a-z0-9-]+)/g;
const dishonest = [];
for (const row of roadmap.rows ?? []) {
  if (row.product !== true || typeof row.proof !== "string") {
    continue;
  }
  producer.lastIndex = 0;
  for (const match of row.proof.matchAll(producer)) {
    const scenario = match[1];
    const klass = classByName.get(scenario);
    if (klass === undefined || klass === "live") {
      continue;
    }
    if (!/optional|skipped|archiv/i.test(row.proof)) {
      dishonest.push({ id: row.id, scenario, klass });
    }
  }
}

if (
  missing.length > 0 ||
  invalidClass.length > 0 ||
  nonLiveMatrix.length > 0 ||
  dishonest.length > 0
) {
  process.stderr.write(
    `${JSON.stringify(
      {
        rule: "e2e-workflow-matrix",
        missing,
        invalidClass,
        nonLiveMatrix,
        dishonestProductProofs: dishonest,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
} else {
  const classCounts = {};
  for (const row of rows) {
    classCounts[row.klass] = (classCounts[row.klass] ?? 0) + 1;
  }
  process.stdout.write(
    `${JSON.stringify({
      rule: "e2e-workflow-matrix",
      matrixCount: matrixScenarios.length,
      scenarioTableCount: scenarioTableNames.size,
      classCounts,
      missing: [],
    })}\n`,
  );
}
