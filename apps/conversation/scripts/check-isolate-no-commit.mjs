import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  "agent/sandbox/planted-zoen.ts",
  "agent/sandbox/workbench.ts",
  "agent/sandbox/credentials.ts",
  "agent/sandbox/sandbox.ts",
];

const forbidden = [
  /ActionService\/Commit/,
  /zoen\.action\.v1\.ActionService\/Commit/,
  /from\s+["']eve\/channels/,
  /createKapsoAdapter/,
];

const hits = [];
for (const relative of files) {
  const text = await readFile(path.join(root, relative), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      hits.push(`${relative} matches ${pattern}`);
    }
  }
}

if (hits.length > 0) {
  console.error(hits.join("\n"));
  process.exit(1);
}

console.log("isolate cannot commit lock ok");
