import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const FORBIDDEN_ROOTS = [
  "crates",
  "apps/zoend",
] as const;

const FORBIDDEN_PATTERNS = [
  /vercel\/chat/,
  /@chat-sdk\b/,
  /@chat-adapter\//,
  /from\s+["']vercel\/chat/,
  /from\s+["']@chat-adapter\//,
] as const;

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".rs",
  ".json",
]);

export async function assertImportGraphLaw(
  repositoryRoot: string,
): Promise<void> {
  const transportPackage = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "packages/transport/package.json"),
      "utf8",
    ),
  ) as { dependencies?: Record<string, string>; name?: string };
  for (const root of FORBIDDEN_ROOTS) {
    const absolute = path.join(repositoryRoot, root);
    const hits = await scanDirectory(absolute, repositoryRoot);
    assert.equal(
      hits.length,
      0,
      `forbidden Chat SDK import in ${root}: ${hits.join("; ")}`,
    );
  }

  // packages/transport is the sole allowed Chat SDK / shaped-adapter site.
  assert.equal(transportPackage.name, "@zoen/transport");
}

async function scanDirectory(
  directory: string,
  repositoryRoot: string,
): Promise<string[]> {
  const hits: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return hits;
    }
    throw error;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "target" || entry.name === "dist") {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      hits.push(...(await scanDirectory(full, repositoryRoot)));
      continue;
    }
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) {
      continue;
    }
    // Skip package.json dependency declarations outside transport — already checked.
    if (entry.name === "package.json" && !full.includes(`${path.sep}transport${path.sep}`)) {
      const text = await readFile(full, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          hits.push(path.relative(repositoryRoot, full));
        }
      }
      continue;
    }
    if (ext === ".json") {
      continue;
    }
    const text = await readFile(full, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        hits.push(path.relative(repositoryRoot, full));
        break;
      }
    }
  }
  return hits;
}
