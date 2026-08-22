import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const [classificationPath] = process.argv.slice(2);
if (classificationPath === undefined) {
  throw new Error("usage: verify-classification.mjs <state-classification.yaml>");
}

const classification = parse(await readFile(classificationPath, "utf8"));
const authority = classification.authority?.postgresTables ?? [];
const reference = classification.authority?.referenceTables ?? [];
const rebuildable = classification.rebuildable?.postgresTables ?? [];
const orchestration = classification.rebuildable?.orchestration ?? [];

assert.ok(authority.includes("definition_revisions"));
assert.ok(authority.includes("effect_requests"));
assert.ok(authority.includes("semantic_claims"));
assert.ok(reference.includes("company_sources"));
assert.ok(reference.includes("company_surface_sessions"));
assert.ok(rebuildable.includes("projection_manifests"));
assert.ok(rebuildable.includes("projection_watermarks"));
assert.ok(orchestration.includes("restate"));
assert.ok(!authority.includes("projection_watermarks"));
assert.ok(!authority.includes("projection_manifests"));
assert.ok(!authority.includes("company_sources"));
for (const table of rebuildable) {
  assert.ok(!authority.includes(table), `${table} treated as authority`);
  assert.ok(!reference.includes(table), `${table} treated as authority`);
}
