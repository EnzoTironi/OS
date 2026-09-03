#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
const isContainedPath = (repositoryRoot, candidate) => {
  const relativePath = relative(repositoryRoot, candidate);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`))
  );
};
const resolveContainedPath = async (
  repositoryRoot,
  baseDirectory,
  target,
  label
) => {
  assert(
    !isAbsolute(target),
    `${label} must be repository-relative: ${target}`
  );
  const candidate = resolve(repositoryRoot, baseDirectory, target);
  assert(
    isContainedPath(repositoryRoot, candidate),
    `${label} escapes the repository: ${target}`
  );
  const [canonicalRoot, canonicalCandidate] = await Promise.all([
    realpath(repositoryRoot),
    realpath(candidate).catch(() => undefined),
  ]);
  assert(canonicalCandidate, `${label} links to missing path ${target}`);
  assert(
    isContainedPath(canonicalRoot, canonicalCandidate),
    `${label} follows a symlink outside the repository: ${target}`
  );
  return canonicalCandidate;
};
const expectPathRejection = async (candidate, expectedMessage) => {
  let message = "";
  try {
    await candidate;
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(
    message.includes(expectedMessage),
    `path containment self-check did not reject ${expectedMessage}`
  );
};
const verifyPathContainment = async () => {
  const fixture = await mkdtemp(join(tmpdir(), "zoen-path-containment-"));
  const repository = join(fixture, "repo");
  const sibling = join(fixture, "repo-sibling");
  try {
    await Promise.all([
      mkdir(join(repository, "docs/product"), { recursive: true }),
      mkdir(sibling, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(repository, "docs/product/inside.md"), "inside\n"),
      writeFile(join(sibling, "outside.md"), "outside\n"),
      writeFile(join(fixture, "outside-visual.html"), "outside\n"),
    ]);
    await symlink(
      join(sibling, "outside.md"),
      join(repository, "symlink-escape.md")
    );
    await resolveContainedPath(
      repository,
      "docs/product",
      "inside.md",
      "inside self-check"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        ".",
        "/etc/hosts",
        "absolute self-check"
      ),
      "must be repository-relative"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        ".",
        "../repo-sibling/outside.md",
        "sibling self-check"
      ),
      "escapes the repository"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        ".",
        "symlink-escape.md",
        "symlink self-check"
      ),
      "follows a symlink outside the repository"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        "docs/product",
        "../../../outside-visual.html",
        "visual self-check"
      ),
      "escapes the repository"
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
};

await verifyPathContainment();

const program = JSON.parse(await read("orchestrate/zoen-final/program.json"));
const frontier = JSON.parse(await read("orchestrate/zoen-final/frontier.json"));
const spec = await read("docs/product/zoen-governed-data-extension-spec.md");
const architecture = await read("docs/product/zoen-final-architecture.md");
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
const journeyEvidenceFields = [
  "actors",
  "path",
  "negativeProof",
  "replayProof",
  "isolationProof",
  "recoveryProof",
];
for (const journey of program.journeys) {
  assert(
    !("proof" in journey) &&
      journeyEvidenceFields.every(
        (field) =>
          typeof journey[field] === "string" && journey[field].trim().length > 0
      ),
    `${journey.id} must define actors, path, negative, replay, isolation, and recovery proof`
  );
}
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
const expectedInitialPullRequests = [
  "601|Replace",
  "600|Drop",
  "598|Replace",
  "597|Keep and restack",
  "593|Regenerate",
  "533|Coordinate",
  "532|Coordinate",
  "531|Safe cohort",
  "530|Blocked pair",
  "529|Blocked pair",
  "528|Blocked pair",
  "527|Blocked pair",
  "526|Safe cohort",
  "525|Safe cohort",
  "524|Defer",
  "523|Regenerate",
  "522|Safe cohort",
  "521|Regenerate",
  "520|Defer",
  "519|Safe cohort",
];
const initialPullRequestDispositions =
  frontier.initialPullRequestDispositions ?? [];
assert(
  initialPullRequestDispositions
    .map(({ number, classification }) => `${number}|${classification}`)
    .join("\n") === expectedInitialPullRequests.join("\n"),
  "frontier must preserve all 20 authoritative initial PR classifications"
);
for (const item of initialPullRequestDispositions) {
  assert(
    [item.disposition, item.reason].every(
      (value) => typeof value === "string" && value.trim().length > 0
    ),
    `PR #${item.number} has an incomplete initial disposition`
  );
}
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
const rustFieldName = (line) => {
  const separator = line.indexOf(":");
  assert(separator > 0, `invalid Rust field line: ${line}`);
  return line.slice(0, separator).trim();
};
const worldReleaseFields = worldReleaseContent
  .trim()
  .split("\n")
  .map(rustFieldName);
const architectureWorldReleaseStart = architecture.indexOf(
  "struct WorldRelease {"
);
const architectureWorldReleaseEnd = architecture.indexOf(
  "\n}",
  architectureWorldReleaseStart
);
assert(
  architectureWorldReleaseStart >= 0 && architectureWorldReleaseEnd > 0,
  "architecture lacks WorldRelease"
);
const architectureWorldRelease = architecture.slice(
  architectureWorldReleaseStart,
  architectureWorldReleaseEnd
);
assert(
  architecture.includes("struct WorldReleaseContent {") &&
    architecture.includes("struct WorldReleasePublication {") &&
    architectureWorldRelease.includes("content: WorldReleaseContent") &&
    !architectureWorldRelease.includes("published_at"),
  "architecture does not separate release content from publication metadata"
);
assert(
  architecture.includes(
    "Their canonical constructor derives `ReleaseDigest`; callers cannot supply it. This is type encapsulation, not secrecy."
  ),
  "architecture does not state the private-field boundary"
);
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
const bootstrapRequirements = [
  "The first release for a World MUST use a one-time owner ceremony",
  "Create the initial World, owner Membership, candidate release, publication record, and active-release pointer in one transaction.",
  "Refuse to run if the World has any release, active-release pointer, Membership, or completed bootstrap record.",
  "Remove the bootstrap capability when the transaction commits.",
  "The ceremony MUST NOT create a superuser, a reusable bypass, or a policy-free path for a later release.",
];
assert(
  bootstrapRequirements.every((requirement) => spec.includes(requirement)),
  "World owner bootstrap transaction, refusal, or capability removal is missing"
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
    spec.includes("No OpenBB AGPL code reuse is authorized by W0-05") &&
    spec.includes("`LIC-01` records this no-reuse disposition") &&
    spec.includes(
      "a separate written license disposition MUST name the code, license, approval, and implementation boundary"
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
  visual.includes("SourceCapability é um contrato composto:") &&
    !visual.includes("ProviderCapability"),
  "visual does not use the ratified SourceCapability name"
);
assert(
  visual.includes(
    "O único bootstrap do primeiro owner é uma transação, recusa qualquer estado prévio, remove a capacidade no commit e não cria superuser nem bypass."
  ) &&
    visual.includes(
      "OpenBB clean-room; W0-05 não autoriza reuso AGPL; LIC-01 precede qualquer mudança"
    ),
  "visual does not show the executable bootstrap or AGPL disposition"
);
const visualNodeElements = visual
  .split("\n")
  .filter(
    (line) => line.includes('class="node ') || line.includes('class="node"')
  );
assert(
  visualNodeElements.length > 0 &&
    visualNodeElements.every((line) => line.trimStart().startsWith("<button ")),
  "every interactive architecture node must be a button"
);
for (const behavior of [
  ".node.dimmed { opacity: 0; visibility: hidden; pointer-events: none; }",
  "node.disabled = !active;",
  "node.tabIndex = active ? 0 : -1;",
  "node.setAttribute('aria-hidden', String(!active));",
]) {
  assert(
    visual.includes(behavior),
    `visual filter lacks accessible behavior: ${behavior}`
  );
}
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
  !(
    lowercaseVisual.includes(scriptOpen, scriptStart + scriptOpen.length) ||
    lowercaseVisual.includes(scriptClose, scriptEnd + scriptClose.length)
  ),
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
const decisionsById = new Map(decisions.map((row) => [row[0], row]));
const ratificationFour = decisionsById.get("RAT-04")?.[3] ?? "";
assert(
  [
    "in one transaction",
    "refuses a repeat",
    "removes the capability",
    "no superuser or later bypass exists",
  ].every((requirement) => ratificationFour.includes(requirement)),
  "RAT-04 does not encode the one-time bootstrap proof"
);
const ratificationSeven = decisionsById.get("RAT-07")?.[3] ?? "";
assert(
  ratificationSeven.includes("clean-room") &&
    ratificationSeven.includes("authorizes no OpenBB AGPL code reuse") &&
    ratificationSeven.includes("separate written license disposition"),
  "RAT-07 does not encode the clean-room and AGPL boundary"
);
const licenseDisposition = decisionsById.get("LIC-01") ?? [];
assert(
  licenseDisposition[2] === "no-reuse" &&
    licenseDisposition[3]?.includes(
      "code, license, approval, and implementation boundary"
    ),
  "LIC-01 must separately record that AGPL reuse is not authorized"
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
const markdownHeading = (line) => {
  let markerCount = 0;
  while (markerCount < 6 && line[markerCount] === "#") {
    markerCount += 1;
  }
  const separator = line[markerCount];
  if (!(markerCount > 0 && (separator === " " || separator === "\t"))) {
    return;
  }
  return line.slice(markerCount).trimStart();
};
const markdownAnchors = (text) =>
  new Set(
    text.split("\n").map(markdownHeading).filter(Boolean).map(markdownAnchor)
  );
const validateDecisionEvidence = async ([id, , , , , evidence]) => {
  const [target, fragment] = evidence.split("#", 2);
  const path = await resolveContainedPath(root, ".", target, `${id} evidence`);
  const targetText = await readFile(path, "utf8");
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
const markdownLinkTargets = (markdown) => {
  const targets = [];
  let cursor = 0;
  while (cursor < markdown.length) {
    const labelStart = markdown.indexOf("[", cursor);
    if (labelStart === -1) {
      break;
    }
    const targetStart = markdown.indexOf("](", labelStart + 1);
    if (targetStart === -1) {
      break;
    }
    const targetEnd = markdown.indexOf(")", targetStart + 2);
    if (targetEnd === -1) {
      break;
    }
    targets.push(markdown.slice(targetStart + 2, targetEnd));
    cursor = targetEnd + 1;
  }
  return targets;
};
const validateMarkdownFile = async (file) => {
  const markdown = await read(file);
  const links = markdownLinkTargets(markdown);
  await Promise.all(
    links.map(async (link) => {
      const [target, fragment] = link.split("#", 2);
      if (externalLink.test(target)) {
        return;
      }
      const path = await resolveContainedPath(
        root,
        target ? dirname(file) : ".",
        target || file,
        `${file} link`
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
    await resolveContainedPath(root, "docs/product", target, "visual link");
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
  "ratification valid: canonical path containment self-checks, links, HTML, JSON, TSV, research hashes, and product invariants passed"
);
