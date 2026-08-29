import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const roots = [
  "crates/zoen-core/src",
  "crates/zoen-query/src",
  "crates/zoen-adapters/src",
];

// Semantic PersonalRuntime / Family-as-special-case branches — not MembershipKind
// encoding and not ContextAudience discriminants from AD-06.
const branchPatterns = [
  {
    id: "if-personal-runtime",
    regex:
      /\bif\s*\(\s*(?:.*?\b(?:is_?personal|personal_?runtime|workspace_?class\s*==\s*["']personal["']|workspaceClass\s*===\s*["']personal["']))/giu,
  },
  {
    id: "if-family-runtime",
    regex:
      /\bif\s*\(\s*(?:.*?\b(?:is_?family|family_?runtime|workspace_?class\s*==\s*["']family["']|workspaceClass\s*===\s*["']family["']|kind\s*===\s*["']family["']))/giu,
  },
  {
    id: "personal-runtime-type",
    regex: /\bPersonalRuntime\b|\bFamilyRuntime\b|\bFamilyGroupPrincipal\b/g,
  },
];

const allowlist = new Set([
  "crates/zoen-adapters/src/identity_store.rs",
  "crates/zoen-core/src/identity.rs",
]);

const findings = [];

for (const root of roots) {
  const files = await walk(path.resolve(repositoryRoot, root));
  for (const file of files) {
    const relative = path.relative(repositoryRoot, file);
    if (allowlist.has(relative)) {
      continue;
    }
    if (relative.endsWith(".test.ts") || relative.endsWith("tests.rs")) {
      continue;
    }
    const source = await readFile(file, "utf8");
    for (const pattern of branchPatterns) {
      pattern.regex.lastIndex = 0;
      for (const match of source.matchAll(pattern.regex)) {
        findings.push({
          id: pattern.id,
          literal: match[0].slice(0, 120),
          path: relative,
          line: source.slice(0, match.index ?? 0).split("\n").length,
        });
      }
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ findings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({ findings: [], rootsScanned: roots }, null, 2)}\n`,
  );
}

async function walk(root) {
  const rootStat = await stat(root);
  if (rootStat.isFile()) {
    return root.endsWith(".rs") || root.endsWith(".ts") ? [root] : [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const itemPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "tests" || entry.name === "node_modules"
          ? []
          : walk(itemPath);
      }
      return entry.isFile() &&
        (entry.name.endsWith(".rs") || entry.name.endsWith(".ts"))
        ? [itemPath]
        : [];
    }),
  );
  return nested.flat();
}
