import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const indexNames = new Set(["index.ts", "index.tsx", "index.js", "index.mjs"]);
const banned = /\bexport\s+\{[^}]*\bcreateFake|\bexport\s+\{[^}]*\bcreateMock|\bexport\s+\*\s+from\s+["'][^"']*fake/;

const files = (
  await Promise.all(
    ["packages", "apps"].map((root) =>
      walk(path.join(repositoryRoot, root)),
    ),
  )
).flat();

const hits = [];
for (const file of files) {
  if (!indexNames.has(path.basename(file))) {
    continue;
  }
  const source = await readFile(file, "utf8");
  if (banned.test(source) || source.includes("createFake") && /export[\s\S]*createFake/.test(source)) {
    hits.push(path.relative(repositoryRoot, file));
  }
}

if (hits.length > 0) {
  process.stderr.write(
    `${JSON.stringify({ rule: "no-fake-exports", hits }, null, 2)}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({ rule: "no-fake-exports", filesScanned: files.length, hits: [] })}\n`,
  );
}

async function walk(root) {
  let info;
  try {
    info = await stat(root);
  } catch {
    return [];
  }
  if (!info.isDirectory()) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "gen") {
          return [];
        }
        return walk(full);
      }
      return [full];
    }),
  );
  return nested.flat();
}
