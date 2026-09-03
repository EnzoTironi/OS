#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const programDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(programDirectory, "../..");
const externalLink = /^(?:https?:|mailto:)/;
const read = (path) => readFile(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) {
    fail(message);
  }
};

const program = JSON.parse(await read("orchestrate/zoen-final/program.json"));
const frontier = JSON.parse(await read("orchestrate/zoen-final/frontier.json"));
const spec = await read("docs/product/zoen-governed-data-extension-spec.md");
const visual = await read(
  "docs/product/show-me-zoen-governed-data-extension.html"
);
const preferences = await read("orchestrate/zoen-final/preferences.md");
const agents = await read("AGENTS.md");

assert(program.units.length === 52, "program.json must contain 52 units");
assert(
  program.journeys.length === 8,
  "program.json must contain eight canonical journeys"
);
assert(
  program.finalGates.length === 9,
  "program.json must contain nine final gates"
);
assert(
  program.journeys.map(({ id }) => id).join("|") === "J1|J2|J3|J4|J5|J6|J7|J8",
  "canonical journey IDs changed"
);
assert(
  program.finalGates.map(({ id }) => id).join("|") ===
    "FIN-01|FIN-02|FIN-03|FIN-04|FIN-05|FIN-06|FIN-07|FIN-08|FIN-09",
  "final gate IDs changed"
);
assert(
  program.products.join("|") === "Ontology|Eve|Better Auth",
  "product set changed"
);
assert(
  program.verbs.join("|") ===
    "Discover|Query|Propose|Decide|Commit|Explain|Execute",
  "public verb set changed"
);
assert(
  program.worldReleaseCatalogs.join("|") ===
    "ontology|policy|executors|components",
  "WorldRelease catalog set changed"
);
assert(
  frontier.main.sha === program.base.sha,
  "frontier and program main SHAs differ"
);
assert(
  frontier.landingOrder.join("|") === "W1-03|W1-04|W2-01",
  "landing order changed"
);
assert(
  frontier.dispositions.some(
    (item) =>
      item.number === 616 &&
      item.state === "closed" &&
      item.disposition === "retired"
  ),
  "PR 616 must remain retired"
);
assert(
  !program.units.some((unit) => unit.id === "W1-H1"),
  "PR 616 runtime must not appear as a unit"
);

const worldReleaseContent =
  spec.match(/struct WorldReleaseContent \{([\s\S]*?)\n\}/)?.[1] ?? "";
const datasetVersionContent =
  spec.match(/struct DatasetVersionContent \{([\s\S]*?)\n\}/)?.[1] ?? "";
const worldReleaseFields = [
  ...worldReleaseContent.matchAll(/^\s+(\w+):/gm),
].map((match) => match[1]);
assert(spec.includes("Status: Ratified by W0-05"), "spec is not ratified");
assert(
  spec.includes("zoen.world-release.v1"),
  "WorldRelease domain tag is missing"
);
assert(
  spec.includes("RFC 8785 JSON Canonicalization Scheme"),
  "RFC 8785 JCS rule is missing"
);
assert(
  worldReleaseFields.join("|") ===
    "world|parent|ontology|policy|executors|components",
  "WorldReleaseContent field set changed"
);
assert(
  !worldReleaseContent.includes("id:"),
  "WorldReleaseContent must not accept an ID"
);
assert(
  !worldReleaseContent.includes("published_"),
  "WorldReleaseContent contains publication metadata"
);
assert(
  worldReleaseContent.match(/CatalogDigest/g)?.length === 4,
  "WorldReleaseContent must contain four catalog digests"
);
assert(
  spec.includes(
    "Every field in `WorldReleaseContent` and `WorldRelease` MUST remain private"
  ),
  "private WorldRelease fields rule is missing"
);
assert(
  !(
    datasetVersionContent.includes("accepted_") ||
    datasetVersionContent.includes("commit:")
  ),
  "DatasetVersionContent contains acceptance metadata"
);
assert(
  spec.includes(
    "The acceptance record MUST remain outside the dataset-version digest"
  ),
  "DatasetVersion acceptance separation rule is missing"
);
assert(
  spec.includes(
    "A caller with matching lineage rights MUST be able to retrieve the record by `ResolutionDecisionDigest`"
  ),
  "ResolutionDecision retrieval rule is missing"
);
assert(
  spec.includes("A `ResolutionDecision` is a durable derived-read artifact") &&
    spec.includes("A `ResolutionDecision` is not a `CommitReceipt`"),
  "ResolutionDecision authority boundary is missing"
);
assert(
  spec.includes(
    "The first release for a World MUST use a one-time owner ceremony"
  ) && spec.includes("The ceremony MUST NOT create a superuser"),
  "World owner bootstrap rule is missing"
);
assert(
  spec.includes(
    "At most one `WorldRelease` MAY be active for a World at one time"
  ),
  "one-active-release rule is missing"
);
assert(
  spec.includes(
    "Both assignments MUST cover the complete `LinkAssertion.valid_time` interval"
  ),
  "typed-link interval rule is missing"
);
assert(
  spec.includes(
    "`TypeAssignment` is the only term for evidence that a domain object has a type"
  ),
  "TypeAssignment wording rule is missing"
);
assert(
  spec.includes("struct ObjectKey") &&
    spec.includes("struct TypedObjectRef<T>"),
  "typed object references are missing"
);
assert(
  spec.includes("That evaluation MUST produce a `ResolutionDecision`"),
  "KnowledgeBasisDefinition output rule is missing"
);
assert(
  spec.includes(
    "before any semantic table, observation manifest, segment, index, cache, or provider endpoint is inspected"
  ),
  "pre-scan authorization rule is missing"
);
assert(
  spec.includes("Denied and absent resources MUST use the same public status"),
  "non-disclosing denial rule is missing"
);
assert(
  spec.includes(
    "OpenBB and the institutional standards in the research record are informative sources"
  ) &&
    spec.includes(
      "Any later AGPL code reuse requires a separate written license decision"
    ),
  "informative-source or clean-room license rule is missing"
);
assert(
  spec.includes("The architecture MUST NOT add Redis"),
  "Redis prohibition is missing"
);
assert(
  spec.includes("Restate provides durability only for `ZoenEffect`") &&
    spec.includes("The initial deployment remains one Fly application"),
  "runtime ownership rule is missing"
);
assert(
  preferences.includes(
    "Do not add compatibility aliases, dual reads, dual writes, or preservation work"
  ),
  "pre-launch compatibility rule is missing"
);
assert(
  !/\bproposed\b|decisão proposta|extensão proposta/i.test(spec),
  "spec still contains proposed status text"
);

for (const gate of program.finalGates) {
  assert(
    gate.proof.includes("IBM"),
    `${gate.id} does not name its IBM coverage`
  );
}
for (const id of Array.from(
  { length: 9 },
  (_, index) => `FIN-${String(index + 1).padStart(2, "0")}`
)) {
  assert(visual.includes(id), `visual is missing ${id}`);
}
assert(!/file:\/\//.test(visual), "visual contains a file URL");
assert(
  !/decisão proposta|extensão proposta|>proposto</i.test(visual),
  "visual still marks ratified contracts as proposed"
);
assert(
  visual.toLowerCase().startsWith("<!doctype html>"),
  "visual lacks an HTML doctype"
);
for (const tag of ["<html", "<head", "<body", "</body>", "</html>"]) {
  assert(visual.includes(tag), `visual lacks ${tag}`);
}

const ids = [...visual.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert(
  new Set(ids).size === ids.length,
  "visual contains duplicate element IDs"
);
for (const match of visual.matchAll(/href="#([^"]+)"/g)) {
  assert(ids.includes(match[1]), `visual link points to missing #${match[1]}`);
}
const lowercaseVisual = visual.toLowerCase();
const scriptOpen = "<script>";
const scriptClose = "</script>";
const scriptStart = lowercaseVisual.indexOf(scriptOpen);
const scriptEnd = lowercaseVisual.indexOf(
  scriptClose,
  scriptStart + scriptOpen.length
);
assert(
  scriptStart >= 0 && scriptEnd > scriptStart,
  "visual lacks its inline script"
);
assert(
  lowercaseVisual.indexOf(scriptOpen, scriptStart + scriptOpen.length) === -1 &&
    lowercaseVisual.indexOf(scriptClose, scriptEnd + scriptClose.length) === -1,
  "visual must contain exactly one inline script"
);
const visualScript = visual.slice(scriptStart + scriptOpen.length, scriptEnd);
const syntaxCheck = spawnSync(process.execPath, ["--check", "-"], {
  encoding: "utf8",
  input: visualScript,
});
assert(
  syntaxCheck.status === 0,
  `visual script has invalid JavaScript: ${syntaxCheck.stderr.trim()}`
);

const tsvFiles = [
  "units.tsv",
  "dependencies.tsv",
  "journeys.tsv",
  "final-gates.tsv",
  "ledger.tsv",
  "decisions.tsv",
];
const tsvContents = await Promise.all(
  tsvFiles.map(async (name) => [
    name,
    await read(`orchestrate/zoen-final/${name}`),
  ])
);
for (const [name, content] of tsvContents) {
  const lines = content.replace(/\n$/, "").split("\n");
  const width = lines[0].split("\t").length;
  for (const [index, line] of lines.entries()) {
    assert(
      line.split("\t").length === width,
      `${name}:${index + 1} has the wrong field count`
    );
  }
}
const decisions = (await read("orchestrate/zoen-final/decisions.tsv"))
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => line.split("\t"));
assert(
  decisions.filter(
    ([id, , status]) => id.startsWith("RAT-") && status === "ratified"
  ).length === 7,
  "decisions.tsv must contain seven ratified decisions"
);

const markdownAnchor = (heading) => {
  assert(
    !(heading.includes("<") || heading.includes(">")),
    "raw HTML is unsupported in checked Markdown headings"
  );
  return heading
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
};
const markdownAnchors = (text) =>
  new Set(
    [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
      markdownAnchor(heading)
    )
  );
const validateDecisionEvidence = async ([id, , , , , evidence]) => {
  const [target, fragment] = evidence.split("#", 2);
  const path = resolve(root, target);
  const targetText = await readFile(path, "utf8").catch(() =>
    fail(`${id} links to missing evidence ${target}`)
  );
  if (fragment && target.endsWith(".md")) {
    assert(
      markdownAnchors(targetText).has(fragment),
      `${id} links to missing anchor #${fragment}`
    );
  }
};
await Promise.all(decisions.map(validateDecisionEvidence));

const markdownFiles = [
  "docs/product/zoen-final-architecture.md",
  "docs/product/zoen-governed-data-extension-spec.md",
  "orchestrate/zoen-final/README.md",
  "orchestrate/zoen-final/overview.md",
  "orchestrate/zoen-final/ledger-schema.md",
  "orchestrate/zoen-final/status.md",
  "orchestrate/zoen-final/briefs/w0-05-governed-data-ratification.md",
  "orchestrate/zoen-final/briefs/w2-01-world-release-contract.md",
  "orchestrate/zoen-final/reports/w1-01-validation.md",
  "orchestrate/zoen-final/reports/w1-02-validation.md",
];
const validateMarkdownFile = async (file) => {
  const markdown = await read(file);
  const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
    ([, link]) => link
  );
  await Promise.all(
    links.map(async (link) => {
      const [target, fragment] = link.split("#", 2);
      if (externalLink.test(target)) {
        return;
      }
      const path = target
        ? resolve(root, dirname(file), target)
        : resolve(root, file);
      assert(
        path.startsWith(root),
        `${file} link escapes the repository: ${target}`
      );
      await stat(path).catch(() =>
        fail(`${file} links to missing path ${target}`)
      );
      if (fragment && path.endsWith(".md")) {
        const targetText = target ? await readFile(path, "utf8") : markdown;
        assert(
          markdownAnchors(targetText).has(fragment),
          `${file} links to missing anchor #${fragment}`
        );
      }
    })
  );
};
await Promise.all(markdownFiles.map(validateMarkdownFile));

const visualLinks = [...visual.matchAll(/href="([^"#][^"]*)"/g)].map(
  ([, link]) => link
);
await Promise.all(
  visualLinks.map(async (target) => {
    if (externalLink.test(target)) {
      return;
    }
    const path = resolve(root, "docs/product", target);
    await stat(path).catch(() =>
      fail(`visual links to missing path ${target}`)
    );
  })
);

const researchRoot = resolve(root, "docs/research/2026-09-02-openbb-ontology");
const researchHashes = new Map([
  [
    "openbb-ontology-deep-research.html",
    "cde60767cafe1bbdef3d1d5dd145dbcf1a7ae101c18b04041c37ed2db8efc0db",
  ],
  [
    "report-source.md",
    "11b20699c40669cdce88524834f09738e04dd6104bb3055dca5cc6899852fe36",
  ],
  [
    "show-me-zoen-final-research-architecture.html",
    "893eaf8b77209ae965c9ae5bd1a01c8cfd4eaba3ce56bfeff99eb059ff95e2cb",
  ],
  [
    "subagent-reports/01-openbb-repository-forensics.md",
    "33f8e40cde9d79c5d5a5d66f09c8ac796d623990dbe8c30cca9c8cd34f1b39cc",
  ],
  [
    "subagent-reports/02-financial-semantics-ibm.md",
    "974f190ec144668d36fb9523bf251595399694484776b5d7422af04345ddcb49",
  ],
  [
    "subagent-reports/03-palantir-zoen-gap-audit.md",
    "e915eba9f0a3ba76c1ec88d40c2f59a14afa5ceb5118042a649e573b0293be8b",
  ],
  [
    "subagent-reports/04-institutional-standards-crosscheck.md",
    "f2332dcc6517090b1d63ab669cac863d3926004e66fae871fca31de2388c7d26",
  ],
  [
    "subagent-reports/README.md",
    "f8570baccebc408ae13a5542db6f676d528e09b11aaafb740cf22561ab4f9eb1",
  ],
  [
    "subagent-reports/SHA256SUMS.md",
    "c0a26343ddae1877376855d3f11124ed35c3eead4b5a603b93b20cffc294dfff",
  ],
]);
await Promise.all(
  [...researchHashes].map(async ([path, expected]) => {
    const content = await readFile(join(researchRoot, path));
    const actual = createHash("sha256").update(content).digest("hex");
    assert(actual === expected, `research hash differs for ${path}`);
  })
);

const cockpitName = /cockpit/i;
const ignoredDirectoryNames = new Set([".git", "node_modules", "target"]);
const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = await Promise.all(
    entries.map(async (entry) => {
      if (ignoredDirectoryNames.has(entry.name)) {
        return [];
      }
      const path = join(directory, entry.name);
      const nested = entry.isDirectory() ? await walk(path) : [];
      return cockpitName.test(entry.name) ? [path, ...nested] : nested;
    })
  );
  return matches.flat();
};
const cockpitPaths = await walk(root);
assert(
  !agents.includes("PR Cockpit") && cockpitPaths.length === 0,
  "repository still contains PR Cockpit instructions or wiring"
);

console.log(
  "ratification valid: links, HTML, JSON, TSV, research hashes, and product invariants passed"
);
