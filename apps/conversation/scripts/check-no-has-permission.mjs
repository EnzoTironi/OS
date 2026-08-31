import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const roots = [
  "apps/conversation",
  "apps/zoend",
  "crates/zoen-core",
  "crates/zoen-engine",
];

const forbidden = [/hasPermission/];

const skip = new Set(["node_modules", "target", "dist", ".git"]);
const source = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".rs", ".json"]);

async function hitsForEntry(directory, entry) {
  if (skip.has(entry.name)) {
    return [];
  }
  const full = path.join(directory, entry.name);
  if (entry.isDirectory()) {
    return scan(full);
  }
  if (!source.has(path.extname(entry.name))) {
    return [];
  }
  if (entry.name === "check-no-has-permission.mjs") {
    return [];
  }
  const text = await readFile(full, "utf8");
  return forbidden
    .filter((pattern) => pattern.test(text))
    .map(() => path.relative(repo, full));
}

async function scan(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) => hitsForEntry(directory, entry))
  );
  return nested.flat();
}

const hits = (
  await Promise.all(roots.map((root) => scan(path.join(repo, root))))
).flat();
if (hits.length > 0) {
  console.error(
    `BA hasPermission import-graph lock failed:\n${hits.join("\n")}`
  );
  process.exit(1);
}
console.log("no BA hasPermission lock ok");
