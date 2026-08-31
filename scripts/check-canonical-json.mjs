import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const skip = new Set(["node_modules", "target", "dist", ".git"]);
const roots = ["testdata", "e2e"];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skip.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

const files = [];
for (const root of roots) {
  files.push(...(await walk(root)));
}
files.sort();
const canonical = files.filter((file) => file.endsWith(".canonical.json"));
const errors = [];

for (const file of canonical) {
  const raw = await readFile(file);
  if (
    raw.length === 0 ||
    raw[raw.length - 1] === 0x0a ||
    raw[raw.length - 1] === 0x0d
  ) {
    errors.push(
      `${file}: dest RFC 8785 bytes must not end with a newline`,
    );
  }
  const digestPath = file.replace(/\.canonical\.json$/, ".sha256");
  try {
    const pinned = (await readFile(digestPath, "utf8")).trim();
    const digest = createHash("sha256").update(raw).digest("hex");
    if (pinned !== digest) {
      errors.push(
        `${digestPath}: digest is over dest file bytes, got ${digest}`,
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
