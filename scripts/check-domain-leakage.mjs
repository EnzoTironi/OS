import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const genericRoots = [
  "crates/zoen-core/src",
  "crates/zoen-engine/src",
  "crates/zoen-query/src",
  "crates/zoen-adapters/src",
  "apps/zoend/src",
];
const knownDomainLiteral =
  /"(?:[^"\\]|\\.)*(?:accounting(?:[-_.]?foundation)?|commercial|party|procurement|product|quality|inventory|manufacturing|fiscal|systax|plugnotas|protheus|erp|human[-_.]?factors|hf)[._:-](?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*(?:accounting(?:[-_.]?foundation)?|commercial|party|procurement|product|quality|inventory|manufacturing|fiscal|systax|plugnotas|protheus|erp|human[-_.]?factors|hf)[._:-](?:[^'\\]|\\.)*'/giu;
const knownActionLiteral =
  /"(?:action\.(?:complete[-_.]?work|post[-_.]?receivable|settle[-_.]?claim|purchase|return|reserve[-_.]?inventory|release[-_.]?lot|quarantine[-_.]?lot|replenish)|(?:accounting|commercial|party|procurement|product|quality|inventory|manufacturing|fiscal|systax|plugnotas|protheus|erp|hf)\.[a-z0-9._-]+)"|'(?:action\.(?:complete[-_.]?work|post[-_.]?receivable|settle[-_.]?claim|purchase|return|reserve[-_.]?inventory|release[-_.]?lot|quarantine[-_.]?lot|replenish)|(?:accounting|commercial|party|procurement|product|quality|inventory|manufacturing|fiscal|systax|plugnotas|protheus|erp|hf)\.[a-z0-9._-]+)'/giu;

const requestedPaths = process.argv.slice(2);
const roots = requestedPaths.length === 0 ? genericRoots : requestedPaths;
const files = (
  await Promise.all(roots.map((root) => rustFiles(path.resolve(repositoryRoot, root))))
)
  .flat()
  .sort();
const findings = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const production = productionSource(source, file);
  for (const pattern of [knownDomainLiteral, knownActionLiteral]) {
    pattern.lastIndex = 0;
    for (const match of production.matchAll(pattern)) {
      findings.push({
        literal: match[0],
        path: path.relative(repositoryRoot, file),
        line: lineNumber(production, match.index ?? 0),
      });
    }
  }
}

const uniqueFindings = findings.filter(
  (finding, index) =>
    findings.findIndex(
      (candidate) =>
        candidate.path === finding.path &&
        candidate.line === finding.line &&
        candidate.literal === finding.literal,
    ) === index,
);

if (uniqueFindings.length > 0) {
  process.stderr.write(`${JSON.stringify({ findings: uniqueFindings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({ filesScanned: files.length, findings: [] })}\n`,
  );
}

async function rustFiles(root) {
  const rootStat = await stat(root);
  if (rootStat.isFile()) {
    return root.endsWith(".rs") ? [root] : [];
  }
  const entry = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entry.map(async (item) => {
      const itemPath = path.join(root, item.name);
      if (item.isDirectory()) {
        return item.name === "tests" ? [] : rustFiles(itemPath);
      }
      return item.isFile() && item.name.endsWith(".rs") && item.name !== "tests.rs"
        ? [itemPath]
        : [];
    }),
  );
  return files.flat();
}

function productionSource(source, file) {
  const marker = source.indexOf("#[cfg(test)]");
  if (marker === -1) {
    return source;
  }
  const testModule = source.slice(marker);
  if (!/^#\[cfg\(test\)\]\s*mod\s+tests\s*(?:;|\{)/u.test(testModule)) {
    throw new Error(
      `${path.relative(repositoryRoot, file)} has an unsupported cfg(test) item`,
    );
  }
  return source.slice(0, marker);
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}
