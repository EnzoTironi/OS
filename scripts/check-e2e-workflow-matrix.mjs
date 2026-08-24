import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const repositoryRoot = process.cwd();
const workflowPath = path.join(repositoryRoot, ".github/workflows/verify.yml");
const runShPath = path.join(repositoryRoot, "e2e/run.sh");

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

const scenarioTableNames = new Set();
for (const line of tableMatch[1].split("\n")) {
  const match = line.match(/^\s*"([^":]+):/);
  if (match !== null) {
    scenarioTableNames.add(match[1]);
  }
}

const missing = matrixScenarios
  .map(String)
  .filter((name) => !scenarioTableNames.has(name))
  .sort();

if (missing.length > 0) {
  process.stderr.write(
    `${JSON.stringify({ rule: "e2e-workflow-matrix", missing }, null, 2)}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      rule: "e2e-workflow-matrix",
      matrixCount: matrixScenarios.length,
      scenarioTableCount: scenarioTableNames.size,
      missing: [],
    })}\n`,
  );
}
