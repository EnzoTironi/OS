import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const roots = [
  "apps/conversation",
  "apps/zoend",
  "crates/zoen-core",
  "crates/zoen-engine",
];

const forbidden = [/hasPermission/];

const skip = new Set(["node_modules", "target", "dist", ".git"]);
const source = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".rs", ".json"]);

async function scan(directory) {
  const hits = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return hits;
    }
    throw error;
  }
  for (const entry of entries) {
    if (skip.has(entry.name)) {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      hits.push(...(await scan(full)));
      continue;
    }
    if (!source.has(path.extname(entry.name))) {
      continue;
    }
    if (entry.name === "check-no-has-permission.mjs") {
      continue;
    }
    const text = await readFile(full, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        hits.push(path.relative(repo, full));
      }
    }
  }
  return hits;
}

const hits = [];
for (const root of roots) {
  hits.push(...(await scan(path.join(repo, root))));
}
if (hits.length > 0) {
  console.error(`BA hasPermission import-graph lock failed:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("no BA hasPermission lock ok");
