import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, "packages/auth-workos");
const importSpecifier = /(?:from|import)\s+["']([^"']+)["']/gu;
const bannedFromThisPackage =
  /cedar|@zoen\/|zoend|world|membership|firecrawl|speaker|chat-adapter|chat-sdk|next\/|vite|stylex/iu;
const lockedTrees = [
  "apps/zoend",
  "crates",
  "packages/effect-worker",
  "packages/harness",
  "packages/mcp",
  "packages/ontology",
  "packages/osdk",
  "packages/sdk",
  "packages/speaker",
  "packages/transport",
];

async function walk(root: string, suffix: RegExp): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "target" ||
          entry.name === "gen"
        ) {
          return [];
        }
        return walk(full, suffix);
      }
      return suffix.test(entry.name) ? [full] : [];
    }),
  );
  return nested.flat();
}

test("auth-workos does not invent Google or Apple OAuth URLs", async () => {
  const sources = (await walk(path.join(packageRoot, "src"), /\.ts$/u)).filter(
    (file) => !file.endsWith(".test.ts"),
  );
  const bannedOauth =
    /accounts\.google\.com|appleid\.apple\.com|provider:\s*["']GoogleOAuth["']|provider:\s*["']AppleOAuth["']/u;
  assert.ok(sources.length > 0);
  for (const file of sources) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(
      text,
      bannedOauth,
      `${path.relative(repoRoot, file)} builds a second OAuth stack`,
    );
  }
});

test("auth-workos does not import Cedar, World, membership, or Zoen kernel", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const dependencyNames = Object.keys(manifest.dependencies ?? {});
  assert.ok(dependencyNames.includes("@workos-inc/node"));
  for (const name of dependencyNames) {
    assert.doesNotMatch(name, /@zoen\/|cedar|firecrawl/u);
  }

  const sources = await walk(path.join(packageRoot, "src"), /\.ts$/u);
  assert.ok(sources.length > 0);
  for (const file of sources) {
    const text = await readFile(file, "utf8");
    importSpecifier.lastIndex = 0;
    for (const match of text.matchAll(importSpecifier)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith("./") || specifier.startsWith("node:")) {
        continue;
      }
      assert.doesNotMatch(
        specifier,
        bannedFromThisPackage,
        `${path.relative(repoRoot, file)} imports ${specifier}`,
      );
    }
  }
});

test("kernel packages do not import WorkOS", async () => {
  const workosImport = /workos|@zoen\/auth-workos/iu;
  for (const tree of lockedTrees) {
    const files = await walk(
      path.join(repoRoot, tree),
      /\.(?:ts|rs|js)$/u,
    );
    for (const file of files) {
      const text = await readFile(file, "utf8");
      importSpecifier.lastIndex = 0;
      for (const match of text.matchAll(importSpecifier)) {
        assert.doesNotMatch(
          match[1] ?? "",
          workosImport,
          `${path.relative(repoRoot, file)} imports WorkOS`,
        );
      }
      if (file.endsWith(".rs")) {
        assert.doesNotMatch(
          text,
          /workos|authkit/iu,
          `${path.relative(repoRoot, file)} mentions WorkOS`,
        );
      }
    }
  }
});
