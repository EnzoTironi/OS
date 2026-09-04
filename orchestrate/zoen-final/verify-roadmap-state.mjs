#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const UNIT_TITLE = /^(W\d+-\d+):/;
const fail = (message) => {
  throw new Error(message);
};
const unique = (values, label) => {
  if (new Set(values).size !== values.length) {
    fail(`${label} contains duplicates`);
  }
};
const sameNumbers = (actual, expected, label) => {
  const left = [...actual].sort((a, b) => a - b).join("|");
  const right = [...expected].sort((a, b) => a - b).join("|");
  if (left !== right) {
    fail(
      `${label} differ: GitHub=${left || "none"}; recorded=${right || "none"}`
    );
  }
};

const [program, frontier] = await Promise.all(
  ["program.json", "frontier.json"].map(async (name) =>
    JSON.parse(await readFile(join(directory, name), "utf8"))
  )
);
const audit = frontier.roadmapAudit;
const range = /^#(?<first>\d+)-#(?<last>\d+)$/.exec(audit?.issueRange ?? "");
if (!range?.groups) {
  fail("roadmapAudit.issueRange must be formatted as #first-#last");
}
const first = Number(range.groups.first);
const last = Number(range.groups.last);
const issues = JSON.parse(
  execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--repo",
      frontier.repository,
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,title,state,labels",
    ],
    { encoding: "utf8" }
  )
)
  .filter(({ number }) => number >= first && number <= last)
  .sort((left, right) => left.number - right.number);

if (issues.length !== audit.totalIssues || issues.length !== last - first + 1) {
  fail(
    `roadmap range expected ${audit.totalIssues} issues, found ${issues.length}`
  );
}
for (let index = 0; index < issues.length; index += 1) {
  if (issues[index].number !== first + index) {
    fail(`roadmap range is missing issue #${first + index}`);
  }
}

const unitsById = new Map(program.units.map((unit) => [unit.id, unit]));
const issueUnits = issues.map((issue) => {
  const unitId = UNIT_TITLE.exec(issue.title)?.[1];
  if (!(unitId && unitsById.has(unitId))) {
    fail(`issue #${issue.number} does not name a canonical unit`);
  }
  return unitId;
});
unique(issueUnits, "roadmap issue units");

const open = issues.filter(({ state }) => state === "OPEN");
const closed = issues.filter(({ state }) => state === "CLOSED");
if (open.length !== audit.openIssues) {
  fail(
    `GitHub has ${open.length} open roadmap issues; recorded ${audit.openIssues}`
  );
}
sameNumbers(
  closed.map(({ number }) => number),
  audit.verifiedClosedIssues,
  "verified closed issues"
);
const openNumbers = new Set(open.map(({ number }) => number));
for (const number of audit.reopenedIssues) {
  if (!openNumbers.has(number)) {
    fail(`reopened issue #${number} is not open on GitHub`);
  }
}

for (const [index, issue] of issues.entries()) {
  const unit = unitsById.get(issueUnits[index]);
  const expectedState = unit.status === "done" ? "CLOSED" : "OPEN";
  if (issue.state !== expectedState) {
    fail(
      `issue #${issue.number} is ${issue.state}, but ${unit.id} is ${unit.status}`
    );
  }
  if (
    issue.state === "OPEN" &&
    !issue.labels.some(({ name }) =>
      ["blocked", "bug", "ready-for-agent"].includes(name)
    )
  ) {
    fail(`open issue #${issue.number} has no roadmap execution label`);
  }
}

console.log(
  `roadmap state valid: ${issues.length} issues, ${open.length} open, ${closed.length} verified closed`
);
