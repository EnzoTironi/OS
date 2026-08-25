import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import canonicalize from "canonicalize";

const checkOnly = process.argv.includes("--check");
const root = path.join(process.cwd(), "testdata", "jcs");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(root);
const inputs = files.filter(
  (file) => file.endsWith(".json") && !file.includes(`${path.sep}errors${path.sep}`),
);

for (const inputPath of inputs) {
  const raw = await readFile(inputPath);
  if (raw.includes(0)) {
    throw new Error(`NUL in ${inputPath}`);
  }
  const text = raw.toString("utf8");
  const document = JSON.parse(text);
  const jcs = canonicalize(document);
  if (jcs === undefined) {
    throw new Error(`canonicalize failed for ${inputPath}`);
  }
  const expectedPath = inputPath.replace(/\.json$/, ".jcs");
  const digestPath = inputPath.replace(/\.json$/, ".sha256");
  const expected = (await readFile(expectedPath, "utf8")).replace(/\n$/, "");
  if (expected !== jcs) {
    throw new Error(
      `${path.relative(process.cwd(), inputPath)} JCS mismatch\nexpected ${expected}\nactual   ${jcs}`,
    );
  }
  const digest = createHash("sha256").update(jcs).digest("hex");
  const pinnedDigest = (await readFile(digestPath, "utf8")).trim();
  if (pinnedDigest !== digest) {
    throw new Error(
      `${path.relative(process.cwd(), digestPath)} digest mismatch\nexpected ${pinnedDigest}\nactual   ${digest}`,
    );
  }
  if (checkOnly) {
    continue;
  }
  await writeFile(expectedPath, jcs);
  await writeFile(digestPath, `${digest}\n`);
}
