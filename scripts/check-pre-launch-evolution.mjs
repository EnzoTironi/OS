import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const policyPath = path.join(repositoryRoot, "AGENTS.md");
const policyMarker = "## Pre-launch evolution";
const policyNeedles = [
  "There are no production users and no production data",
  "You do not add backward-compatibility shims",
  "dual-read or dual-write",
  "Internal interfaces are not public compatibility contracts",
  "Development and test data are disposable",
  "You do not rewrite an already-applied migration",
  "You consolidate the migration baseline only as an explicit, coordinated change",
];
const roots = [
  "apps/auth/src",
  "apps/conversation/agent",
  "apps/zoen/src",
  "apps/zoend/src",
  "packages/ontology/src",
  "crates/zoen-core/src",
  "crates/zoen-engine/src",
  "crates/zoen-query/src",
  "crates/zoen-adapters/src",
];
const banned = [
  {
    id: "legacy-sessions",
    pattern: /ZOEN_SESSION_TOKENS|ProcessAuth::(?:LegacySessions|Oidc)\b/g,
  },
  {
    id: "compat-shim",
    pattern: /compat(?:ibility)?\s+shim|backward[ -]?compat(?:ibility)?|legacy alias/gi,
  },
  {
    id: "dual-path",
    pattern: /\bdual[-_](?:read|write|path)s?\b/gi,
  },
];
const sourceName = /\.(?:rs|ts|tsx)$/;

const policy = await readFile(policyPath, "utf8");
const policyFindings = [];
const policyMarkerCount = policy.split(policyMarker).length - 1;
if (policyMarkerCount !== 1) {
  policyFindings.push({
    path: "AGENTS.md",
    id: "policy-heading-count",
    literal: `${String(policyMarkerCount)} ${policyMarker}`,
  });
}
for (const needle of policyNeedles) {
  if (!policy.includes(needle)) {
    policyFindings.push({ path: "AGENTS.md", id: "missing-policy-needle", literal: needle });
  }
}

const files = (
  await Promise.all(roots.map((root) => walk(path.join(repositoryRoot, root))))
).flat();
const findings = [...policyFindings];

for (const file of files) {
  const relative = path.relative(repositoryRoot, file);
  const raw = await readFile(file, "utf8");
  const source = file.endsWith(".rs") ? productionSource(raw) : raw;
  for (const rule of banned) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      findings.push({
        id: rule.id,
        literal: match[0],
        path: relative,
        line: lineNumber(source, match.index ?? 0),
      });
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ rule: "pre-launch-evolution", findings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      rule: "pre-launch-evolution",
      filesScanned: files.length,
      findings: [],
    })}\n`,
  );
}

async function walk(root) {
  let info;
  try {
    info = await stat(root);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (info.isFile()) {
    return sourceName.test(root) ? [root] : [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests") {
          return [];
        }
        return walk(full);
      }
      if (entry.isFile() && sourceName.test(entry.name) && entry.name !== "tests.rs") {
        return [full];
      }
      return [];
    }),
  );
  return nested.flat();
}

function productionSource(source) {
  const marker = source.indexOf("#[cfg(test)]");
  return marker === -1 ? source : source.slice(0, marker);
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}
