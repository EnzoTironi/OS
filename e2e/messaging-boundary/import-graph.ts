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
  for (const root of FORBIDDEN_ROOTS) {
    const absolute = path.join(repositoryRoot, root);
    const hits = await scanDirectory(absolute, repositoryRoot);
    assert.equal(
      hits.length,
      0,
      `forbidden Chat SDK import in ${root}: ${hits.join("; ")}`,
    );
  }
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
    if (entry.name === "package.json") {
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
