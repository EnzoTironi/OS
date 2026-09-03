#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAndValidateImplementationLedger,
  validateLedgerEvidence,
} from "./ledger-validation.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const write = process.argv.includes("--write");

const readJson = async (name) =>
  JSON.parse(await readFile(join(directory, name), "utf8"));
const program = await readJson("program.json");
const frontier = await readJson("frontier.json");
const ledgerText = await readFile(join(directory, "ledger.tsv"), "utf8");

const expectedJourneyIds = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"];
const expectedFinalGateIds = [
  "FIN-01",
  "FIN-02",
  "FIN-03",
  "FIN-04",
  "FIN-05",
  "FIN-06",
  "FIN-07",
  "FIN-08",
  "FIN-09",
];
const journeyEvidenceFields = [
  "actors",
  "path",
  "negativeProof",
  "replayProof",
  "isolationProof",
  "recoveryProof",
];
const expectedInitialPullRequestNumbers = [
  601, 600, 598, 597, 593, 533, 532, 531, 530, 529, 528, 527, 526, 525, 524,
  523, 522, 521, 520, 519,
];
const allowedInitialPullRequestClassifications = new Set([
  "Replace",
  "Drop",
  "Keep and restack",
  "Regenerate",
  "Coordinate",
  "Safe cohort",
  "Blocked pair",
  "Defer",
]);
const initialPullRequestDispositionsDigest =
  "sha256:6ffc3492284f65b32c62cd69f53d539cd538bd623a17a6bd3a20cd965eb48b38";
const expectedDependencyCount = 112;

const fail = (message) => {
  throw new Error(message);
};

const unique = (values, label) => {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index
  );
  if (duplicates.length > 0) {
    fail(
      `${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`
    );
  }
};
const expectFailure = (action, expectedMessage, label) => {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (!message.includes(expectedMessage)) {
    fail(`${label} did not reject the invalid fixture`);
  }
};
const dispositionDigest = (items) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        items.map(({ number, classification, disposition, reason }) => [
          number,
          classification,
          disposition,
          reason,
        ])
      )
    )
    .digest("hex");

if (program.units.length !== 52) {
  fail(`program must contain 52 units, found ${program.units.length}`);
}
if (program.products.join("|") !== "Ontology|Eve|Better Auth") {
  fail("program must contain exactly Ontology, Eve, and Better Auth");
}
if (program.verbs.length !== 7) {
  fail(`program must contain seven verbs, found ${program.verbs.length}`);
}
if (
  program.worldReleaseCatalogs.join("|") !==
  "ontology|policy|executors|components"
) {
  fail("WorldRelease catalog set changed");
}
if (program.base.sha !== frontier.main.sha) {
  fail("program and frontier main SHAs differ");
}

const unitIds = program.units.map(({ id }) => id);
const journeyIds = program.journeys.map(({ id }) => id);
const finalGateIds = program.finalGates.map(({ id }) => id);
unique(unitIds, "unit IDs");
unique(journeyIds, "journey IDs");
unique(finalGateIds, "final gate IDs");
if (journeyIds.join("|") !== expectedJourneyIds.join("|")) {
  fail("journey catalog must contain exactly J1-J8 in order");
}
for (const journey of program.journeys) {
  if (
    "proof" in journey ||
    journeyEvidenceFields.some(
      (field) =>
        typeof journey[field] !== "string" || journey[field].trim().length === 0
    )
  ) {
    fail(`${journey.id} must define every canonical journey proof dimension`);
  }
}
const validateBootstrapCeremony = (ceremony) => {
  if (
    ceremony?.decision !== "RAT-04" ||
    ceremony.scope !== "first release for one World" ||
    ceremony.ownerAuthentication !== "Better Auth" ||
    ceremony.transactionalArtifacts?.join("|") !==
      "World|owner Membership|candidate release|publication record|active-release pointer" ||
    ceremony.refusesWhenAnyExists?.join("|") !==
      "release|active-release pointer|Membership|completed bootstrap record" ||
    ceremony.completedBootstrapRecordBindings?.join("|") !==
      "owner|World|release digest|policy evidence used by the ceremony" ||
    ceremony.capabilityAfterCommit !== "removed" ||
    ceremony.superuser !== "forbidden" ||
    ceremony.laterBypass !== "forbidden" ||
    ceremony.laterPublicationAndActivationPath !== "seven-verb governed path"
  ) {
    fail("J1 must encode every RAT-04 bootstrap constraint");
  }
};
const bootstrapCeremony = program.journeys.find(
  ({ id }) => id === "J1"
)?.bootstrapCeremony;
for (const field of [
  "ownerAuthentication",
  "completedBootstrapRecordBindings",
  "laterPublicationAndActivationPath",
]) {
  expectFailure(
    () =>
      validateBootstrapCeremony({ ...bootstrapCeremony, [field]: undefined }),
    "every RAT-04 bootstrap constraint",
    `missing ${field} bootstrap self-check`
  );
}
validateBootstrapCeremony(bootstrapCeremony);
const expectedSharedAuthorityReplay =
  "Repeated Decide returns the original decision and deduplication result; repeated Commit returns the original CommitReceipt. Neither replay creates a second invite or Membership.";
const validateSharedAuthorityReplay = (replayProof) => {
  if (replayProof !== expectedSharedAuthorityReplay) {
    fail("J3 must keep Decide replay separate from CommitReceipt replay");
  }
};
expectFailure(
  () =>
    validateSharedAuthorityReplay(
      "Repeated Decide or Commit returns the original receipt and creates no second invite or Membership."
    ),
  "Decide replay separate from CommitReceipt replay",
  "J3 Decide receipt self-check"
);
validateSharedAuthorityReplay(
  program.journeys.find(({ id }) => id === "J3")?.replayProof
);
if (finalGateIds.join("|") !== expectedFinalGateIds.join("|")) {
  fail("final gate catalog must contain exactly FIN-01-FIN-09 in order");
}
const initialPullRequestDispositions =
  frontier.initialPullRequestDispositions ?? [];
const initialPullRequestNumbers = initialPullRequestDispositions.map(
  ({ number }) => number
);
unique(initialPullRequestNumbers, "initial pull request disposition numbers");
if (
  initialPullRequestNumbers.join("|") !==
  expectedInitialPullRequestNumbers.join("|")
) {
  fail("frontier must preserve the authoritative 20 initial PR dispositions");
}
for (const item of initialPullRequestDispositions) {
  if (
    !allowedInitialPullRequestClassifications.has(item.classification) ||
    [item.classification, item.disposition, item.reason].some(
      (value) => typeof value !== "string" || value.trim().length === 0
    )
  ) {
    fail(`PR #${item.number} has an incomplete initial disposition`);
  }
}
if (
  `sha256:${dispositionDigest(initialPullRequestDispositions)}` !==
    initialPullRequestDispositionsDigest ||
  frontier.initialPullRequestDispositionsDigest !==
    initialPullRequestDispositionsDigest
) {
  fail("initial pull request dispositions differ from the ratified snapshot");
}
const journeyInfrastructure = frontier.journeyInfrastructure ?? [];
const [infrastructureSnapshot] = journeyInfrastructure;
if (
  journeyInfrastructure.length !== 1 ||
  infrastructureSnapshot.number !== 619 ||
  infrastructureSnapshot.snapshotKind !== "immutable-audit-evidence" ||
  infrastructureSnapshot.headShaAtAudit !==
    "93c800c9de09f43a8b0b145037ac989da7e6782f" ||
  !(infrastructureSnapshot.observedAt && infrastructureSnapshot.provenance) ||
  "state" in infrastructureSnapshot ||
  "head" in infrastructureSnapshot ||
  "branch" in infrastructureSnapshot
) {
  fail("PR #619 must remain immutable audit evidence, not a live candidate");
}
if (unitIds.includes("W1-H1")) {
  fail("the retired PR 616 runtime must not be a canonical unit");
}

const unitsById = new Map(program.units.map((unit) => [unit.id, unit]));
const knownJourneys = new Set(journeyIds);
const knownFinalGates = new Set(finalGateIds);
for (const unit of program.units) {
  if (!program.tracks.includes(unit.track)) {
    fail(`${unit.id} has unknown track ${unit.track}`);
  }
  if (!program.states.includes(unit.status)) {
    fail(`${unit.id} has unknown status ${unit.status}`);
  }
  for (const dependency of unit.dependencies) {
    if (!unitsById.has(dependency)) {
      fail(`${unit.id} depends on unknown unit ${dependency}`);
    }
    if (unitsById.get(dependency).wave > unit.wave) {
      fail(`${unit.id} depends on later-wave unit ${dependency}`);
    }
  }
  for (const journey of unit.journeys) {
    if (!knownJourneys.has(journey)) {
      fail(`${unit.id} names unknown journey ${journey}`);
    }
  }
  for (const finalGate of unit.finalGates ?? []) {
    if (!knownFinalGates.has(finalGate)) {
      fail(`${unit.id} names unknown final gate ${finalGate}`);
    }
  }
}
for (const journey of journeyIds) {
  if (!program.units.some((unit) => unit.journeys.includes(journey))) {
    fail(`${journey} is not assigned to a unit`);
  }
}
for (const finalGate of finalGateIds) {
  if (
    !program.units.some((unit) => (unit.finalGates ?? []).includes(finalGate))
  ) {
    fail(`${finalGate} is not assigned to a unit`);
  }
}

const visiting = new Set();
const visited = new Set();
const visit = (id) => {
  if (visiting.has(id)) {
    fail(`dependency cycle contains ${id}`);
  }
  if (visited.has(id)) {
    return;
  }
  visiting.add(id);
  for (const dependency of unitsById.get(id).dependencies) {
    visit(dependency);
  }
  visiting.delete(id);
  visited.add(id);
};
for (const id of unitIds) {
  visit(id);
}

const ledgerRows = parseAndValidateImplementationLedger(
  program.units,
  ledgerText
);
await Promise.all(
  ledgerRows.map(async (row) => {
    const evidence = await readFile(
      join(directory, "../..", row.evidence),
      "utf8"
    ).catch(() => fail(`${row.unitId} ledger evidence is missing`));
    validateLedgerEvidence(row, evidence);
  })
);

const escapeCell = (value) =>
  String(value ?? "")
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ");
const tsvCell = (value) =>
  String(value ?? "")
    .replaceAll("\t", " ")
    .replaceAll("\n", " ");
const withFinalNewline = (rows) => `${rows.join("\n")}\n`;
const pullRequestCell = (pullRequest) =>
  pullRequest ? `#${pullRequest}` : "not open";

const unitsTsv = withFinalNewline([
  [
    "id",
    "title",
    "track",
    "wave",
    "size",
    "status",
    "dependencies",
    "journeys",
    "final_gates",
    "branch",
    "pr",
    "head_sha",
  ].join("\t"),
  ...program.units.map((unit) =>
    [
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
    ]
      .map(tsvCell)
      .join("\t")
  ),
]);

const dependencyRows = program.units.flatMap((unit) =>
  unit.dependencies.map((dependency) => [unit.id, dependency])
);
const validateDependencyRows = (rows) => {
  if (rows.length !== expectedDependencyCount) {
    fail(
      `program must contain ${expectedDependencyCount} dependency rows, found ${rows.length}`
    );
  }
  unique(
    rows.map(([unit, dependency]) => `${unit}\u0000${dependency}`),
    "dependency pairs"
  );
};
expectFailure(
  () => {
    const validFixture = Array.from(
      { length: expectedDependencyCount },
      (_, index) => [`W${index}`, `W${index + 1}`]
    );
    validateDependencyRows([...validFixture.slice(0, -1), validFixture[0]]);
  },
  "dependency pairs contains duplicates",
  "duplicate dependency pair self-check"
);
validateDependencyRows(dependencyRows);
const dependenciesTsv = withFinalNewline([
  "unit_id\tdependency_id",
  ...dependencyRows.map((row) => row.join("\t")),
]);

const journeysTsv = withFinalNewline([
  "id\tname\tactors\tpath\tnegative_proof\treplay_proof\tisolation_proof\trecovery_proof",
  ...program.journeys.map((journey) =>
    [
      journey.id,
      journey.name,
      journey.actors,
      journey.path,
      journey.negativeProof,
      journey.replayProof,
      journey.isolationProof,
      journey.recoveryProof,
    ]
      .map(tsvCell)
      .join("\t")
  ),
]);

const finalGatesTsv = withFinalNewline([
  "id\tname\tproof",
  ...program.finalGates.map((gate) =>
    [gate.id, gate.name, gate.proof].map(tsvCell).join("\t")
  ),
]);

const counts = Object.fromEntries(
  program.states.map((state) => [
    state,
    program.units.filter((unit) => unit.status === state).length,
  ])
);
const currentUnits = program.units.filter(({ status: unitStatus }) =>
  ["active", "proof_pending"].includes(unitStatus)
);
const merged = frontier.mergedPullRequests;
const status = `# Zoen final program status

Generated from \`program.json\`, \`frontier.json\`, and \`ledger.tsv\`.

- Repository: \`${program.repository}\`
- Base: \`${program.base.branch}@${program.base.sha}\`
- Units: ${program.units.length} total, ${counts.done} done, ${counts.active} active, ${counts.proof_pending} proof pending, ${counts.queued} queued
- Canonical journeys: ${program.journeys.length}, J1 through J8
- Journey proof dimensions: actors, path, negative, replay, isolation, and recovery
- Final gates: ${program.finalGates.length}, FIN-01 through FIN-09
- Products: ${program.products.join(", ")}
- Public verbs: ${program.verbs.join(", ")}
- WorldRelease catalogs: ${program.worldReleaseCatalogs.join(", ")}
- Initial PR disposition digest: \`${initialPullRequestDispositionsDigest}\`

## Active and proof-pending units

| Unit | Status | Branch | Head or source | Pull request |
| --- | --- | --- | --- | --- |
${currentUnits.map((unit) => `| ${unit.id} | ${unit.status} | ${escapeCell(unit.branch ?? "not assigned")} | ${escapeCell(unit.headSha ?? unit.sourceHeadSha ?? "not recorded")} | ${pullRequestCell(unit.pr)} |`).join("\n")}

## Merged pull requests

| Pull request | Unit | Head | Merge | Merged at | Verification |
| --- | --- | --- | --- | --- | --- |
${merged.map((item) => `| #${item.number} | ${item.unit ?? item.scope ?? "toolchain"} | ${item.head} | ${item.merge} | ${item.mergedAt} | ${ledgerRows.find(({ unitId }) => unitId === item.unit)?.verdict ?? item.verification ?? "not applicable"} |`).join("\n")}

PR 611 activated Rust 1.98 with Kache. PR 620 completed W0-05. PR 621 implemented W1-05, but its two-account Telegram ceremony proof remains pending. PR 622 produced the recorded current main through a Better Auth device-flow repair without changing the W1-02 verdict. PR 619 landed the concurrent journey isolation barrier outside the 52-unit graph.

## Immutable journey-infrastructure audit evidence

This snapshot does not track the live PR or branch. It is evidence outside the 52-unit graph.

| Pull request | Record | State at audit | Branch at audit | Head at audit | Observed at | Provenance | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
${journeyInfrastructure.map((item) => `| #${item.number} | ${item.snapshotKind} | ${item.stateAtAudit} | ${item.branchAtAudit} | ${item.headShaAtAudit} | ${item.observedAt} | ${escapeCell(item.provenance)} | ${escapeCell(item.fact)} |`).join("\n")}

## Initial pull request dispositions

This is the complete 20-PR intake set that W8-03 must resolve.

| Pull request | Classification | Disposition | Reason |
| --- | --- | --- | --- |
${initialPullRequestDispositions.map((item) => `| #${item.number} | ${escapeCell(item.classification)} | ${escapeCell(item.disposition)} | ${escapeCell(item.reason)} |`).join("\n")}

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

const staleFiles = (
  await Promise.all(
    [...generated].map(async ([name, content]) => {
      const path = join(directory, name);
      if (write) {
        await writeFile(path, content);
        return;
      }
      const current = await readFile(path, "utf8").catch(() => "");
      return current === content ? undefined : name;
    })
  )
).filter(Boolean);

for (const name of staleFiles) {
  console.error(
    `${name} is stale; run node orchestrate/zoen-final/render-status.mjs --write`
  );
}

if (staleFiles.length > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `program valid: ${program.units.length} units, ${program.journeys.length} journeys, ${program.finalGates.length} final gates, ${dependencyRows.length} unique dependencies; duplicate-pair self-check passed`
  );
}
