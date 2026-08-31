import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  "agent/sandbox/run-zoen.ts",
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

const hits = (
  await Promise.all(
    files.map(async (relative) => {
      const text = await readFile(path.join(root, relative), "utf8");
      return forbidden
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relative} matches ${pattern}`);
    })
  )
).flat();

if (hits.length > 0) {
  console.error(hits.join("\n"));
  process.exit(1);
}

console.log("isolate cannot commit lock ok");
