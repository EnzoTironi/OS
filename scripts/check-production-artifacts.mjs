import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = [
  path.join(process.cwd(), "deploy", "helm"),
  path.join(process.cwd(), "deploy", "images"),
  path.join(process.cwd(), "deploy", "scripts"),
];

const forbidden = "dist/e2e";
const offenders = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    const text = await readFile(full, "utf8");
    if (text.includes(forbidden)) {
      offenders.push(path.relative(process.cwd(), full));
    }
  }
}

for (const root of roots) {
  await walk(root);
}

if (offenders.length > 0) {
  throw new Error(
    `production deploy paths must not reference ${forbidden}:\n${offenders.join("\n")}`,
  );
}
