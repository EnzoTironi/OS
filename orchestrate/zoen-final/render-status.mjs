#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const write = process.argv.includes("--write");

const readJson = async (name) => JSON.parse(await readFile(join(directory, name), "utf8"));
const program = await readJson("program.json");
const frontier = await readJson("frontier.json");
const ledgerText = await readFile(join(directory, "ledger.tsv"), "utf8");

const expectedJourneyIds = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"];
const expectedFinalGateIds = [
  "FIN-01", "FIN-02", "FIN-03", "FIN-04", "FIN-05", "FIN-06", "FIN-07", "FIN-08", "FIN-09",
];

const fail = (message) => {
  throw new Error(message);
};

const unique = (values, label) => {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) fail(`${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`);
};

if (program.units.length !== 52) fail(`program must contain 52 units, found ${program.units.length}`);
if (program.products.join("|") !== "Ontology|Eve|Better Auth") fail("program must contain exactly Ontology, Eve, and Better Auth");
if (program.verbs.length !== 7) fail(`program must contain seven verbs, found ${program.verbs.length}`);
if (program.worldReleaseCatalogs.join("|") !== "ontology|policy|executors|components") fail("WorldRelease catalog set changed");
if (program.base.sha !== frontier.main.sha) fail("program and frontier main SHAs differ");

const unitIds = program.units.map(({ id }) => id);
const journeyIds = program.journeys.map(({ id }) => id);
const finalGateIds = program.finalGates.map(({ id }) => id);
unique(unitIds, "unit IDs");
unique(journeyIds, "journey IDs");
unique(finalGateIds, "final gate IDs");
if (journeyIds.join("|") !== expectedJourneyIds.join("|")) fail("journey catalog must contain exactly J1-J8 in order");
if (finalGateIds.join("|") !== expectedFinalGateIds.join("|")) fail("final gate catalog must contain exactly FIN-01-FIN-09 in order");
if (unitIds.includes("W1-H1")) fail("the retired PR 616 runtime must not be a canonical unit");

const unitsById = new Map(program.units.map((unit) => [unit.id, unit]));
const knownJourneys = new Set(journeyIds);
const knownFinalGates = new Set(finalGateIds);
for (const unit of program.units) {
  if (!program.tracks.includes(unit.track)) fail(`${unit.id} has unknown track ${unit.track}`);
  if (!program.states.includes(unit.status)) fail(`${unit.id} has unknown status ${unit.status}`);
  for (const dependency of unit.dependencies) {
    if (!unitsById.has(dependency)) fail(`${unit.id} depends on unknown unit ${dependency}`);
    if (unitsById.get(dependency).wave > unit.wave) fail(`${unit.id} depends on later-wave unit ${dependency}`);
  }
  for (const journey of unit.journeys) {
    if (!knownJourneys.has(journey)) fail(`${unit.id} names unknown journey ${journey}`);
  }
  for (const finalGate of unit.finalGates ?? []) {
    if (!knownFinalGates.has(finalGate)) fail(`${unit.id} names unknown final gate ${finalGate}`);
  }
  if (unit.status === "done" && unit.id.startsWith("W1-") && (!unit.pr || !unit.headSha || !unit.mergeSha)) {
    fail(`${unit.id} is done but lacks exact merge facts`);
  }
}
for (const journey of journeyIds) {
  if (!program.units.some((unit) => unit.journeys.includes(journey))) fail(`${journey} is not assigned to a unit`);
}
for (const finalGate of finalGateIds) {
  if (!program.units.some((unit) => (unit.finalGates ?? []).includes(finalGate))) fail(`${finalGate} is not assigned to a unit`);
}

const visiting = new Set();
const visited = new Set();
const visit = (id) => {
  if (visiting.has(id)) fail(`dependency cycle contains ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of unitsById.get(id).dependencies) visit(dependency);
  visiting.delete(id);
  visited.add(id);
};
for (const id of unitIds) visit(id);

const ledgerLines = ledgerText.trimEnd().split("\n");
const ledgerHeader = "unit_id\tpr\thead_sha\tmerge_sha\tverdict\tevidence\tverifier\tverified_at\tmerged_at";
if (ledgerLines[0] !== ledgerHeader) fail("ledger.tsv header does not match ledger-schema.md");
for (const [index, line] of ledgerLines.slice(1).entries()) {
  const fields = line.split("\t");
  if (fields.length !== 9) fail(`ledger row ${index + 2} has ${fields.length} fields`);
  const unit = unitsById.get(fields[0]);
  if (!unit) fail(`ledger row ${index + 2} names unknown unit ${fields[0]}`);
  if (String(unit.pr) !== fields[1]) fail(`ledger row ${index + 2} PR differs from program.json`);
  if (unit.headSha !== fields[2] || unit.mergeSha !== fields[3]) fail(`ledger row ${index + 2} SHA differs from program.json`);
}

const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const tsvCell = (value) => String(value ?? "").replaceAll("\t", " ").replaceAll("\n", " ");

const unitsTsv = [
  ["id", "title", "track", "wave", "size", "status", "dependencies", "journeys", "final_gates", "branch", "pr", "head_sha"].join("\t"),
  ...program.units.map((unit) => [
    unit.id,
    unit.title,
    unit.track,
    unit.wave,
    unit.size,
    unit.status,
    unit.dependencies.join(","),
    unit.journeys.join(","),
    (unit.finalGates ?? []).join(","),
    unit.branch ?? "",
    unit.pr ?? "",
    unit.headSha ?? unit.sourceHeadSha ?? "",
  ].map(tsvCell).join("\t")),
].join("\n") + "\n";

const dependencyRows = program.units.flatMap((unit) => unit.dependencies.map((dependency) => [unit.id, dependency]));
const dependenciesTsv = [
  "unit_id\tdependency_id",
  ...dependencyRows.map((row) => row.join("\t")),
].join("\n") + "\n";

const journeysTsv = [
  "id\tname\tproof",
  ...program.journeys.map((journey) => [journey.id, journey.name, journey.proof].map(tsvCell).join("\t")),
].join("\n") + "\n";

const finalGatesTsv = [
  "id\tname\tproof",
  ...program.finalGates.map((gate) => [gate.id, gate.name, gate.proof].map(tsvCell).join("\t")),
].join("\n") + "\n";

const counts = Object.fromEntries(program.states.map((state) => [state, program.units.filter((unit) => unit.status === state).length]));
const activeUnits = program.units.filter((unit) => unit.status === "active");
const merged = frontier.mergedPullRequests;
const status = `# Zoen final program status

Generated from \`program.json\`, \`frontier.json\`, and \`ledger.tsv\`.

- Repository: \`${program.repository}\`
- Base: \`${program.base.branch}@${program.base.sha}\`
- Units: ${program.units.length} total, ${counts.done} done, ${counts.active} active, ${counts.queued} queued
- Canonical journeys: ${program.journeys.length}, J1 through J8
- Final gates: ${program.finalGates.length}, FIN-01 through FIN-09
- Products: ${program.products.join(", ")}
- Public verbs: ${program.verbs.join(", ")}
- WorldRelease catalogs: ${program.worldReleaseCatalogs.join(", ")}

## Active units

| Unit | Branch | Head or source | Pull request |
| --- | --- | --- | --- |
${activeUnits.map((unit) => `| ${unit.id} | ${escapeCell(unit.branch ?? "not assigned")} | ${escapeCell(unit.headSha ?? unit.sourceHeadSha ?? "not recorded")} | ${unit.pr ? `#${unit.pr}` : "not open"} |`).join("\n")}

## Merged pull requests

| Pull request | Unit | Head | Merge | Merged at |
| --- | --- | --- | --- | --- |
${merged.map((item) => `| #${item.number} | ${item.unit ?? "toolchain"} | ${item.head} | ${item.merge} | ${item.mergedAt} |`).join("\n")}

PR 611 produced the current \`main\` commit and activated Rust 1.98 with Kache.

## Non-landing records

| Pull request | State | Disposition | Reason |
| --- | --- | --- | --- |
${frontier.dispositions.map((item) => `| #${item.number} | ${item.state} | ${item.disposition} | ${escapeCell(item.reason)} |`).join("\n")}

PR 616 stays closed. Its journey-runtime experiment is not part of the 52-unit program.
`;

const generated = new Map([
  ["units.tsv", unitsTsv],
  ["dependencies.tsv", dependenciesTsv],
  ["journeys.tsv", journeysTsv],
  ["final-gates.tsv", finalGatesTsv],
  ["status.md", status],
]);

let stale = false;
for (const [name, content] of generated) {
  const path = join(directory, name);
  if (write) {
    await writeFile(path, content);
    continue;
  }
  const current = await readFile(path, "utf8").catch(() => "");
  if (current !== content) {
    console.error(`${name} is stale; run node orchestrate/zoen-final/render-status.mjs --write`);
    stale = true;
  }
}

if (stale) process.exitCode = 1;
else console.log(`program valid: ${program.units.length} units, ${program.journeys.length} journeys, ${program.finalGates.length} final gates, ${dependencyRows.length} dependencies`);
