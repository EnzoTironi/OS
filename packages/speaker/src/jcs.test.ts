import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canonicalizeJsonBytes, sha256Hex } from "./jcs.js";

function jcsRoot(cwd: string = process.cwd()): string {
  return path.join(cwd, "testdata", "jcs");
}

function listSuccessCases(group: "rfc8785" | "zoen"): readonly string[] {
  return readdirSync(path.join(jcsRoot(), group))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

function readFixture(
  group: "rfc8785" | "zoen",
  name: string,
  ext: "json" | "jcs" | "sha256",
): Buffer {
  return readFileSync(path.join(jcsRoot(), group, `${name}.${ext}`));
}

test("speaker JCS matches shared testdata/jcs fixtures without ontology imports", () => {
  for (const group of ["rfc8785", "zoen"] as const) {
    for (const name of listSuccessCases(group)) {
      const actual = canonicalizeJsonBytes(readFixture(group, name, "json"));
      const expected = readFixture(group, name, "jcs").toString("utf8");
      const digest = readFixture(group, name, "sha256").toString("utf8").trim();
      assert.equal(actual, expected, `${group}/${name}`);
      assert.equal(sha256Hex(actual), digest);
    }
  }
});
