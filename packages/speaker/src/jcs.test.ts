import assert from "node:assert/strict";
import test from "node:test";
import {
  listJcsSuccessCases,
  readJcsFixture,
} from "../../ontology/src/jcs.js";
import { canonicalizeJsonBytes, sha256Hex } from "./jcs.js";

test("speaker JCS matches shared testdata/jcs fixtures", () => {
  for (const group of ["rfc8785", "zoen"] as const) {
    for (const name of listJcsSuccessCases(group)) {
      const actual = canonicalizeJsonBytes(readJcsFixture(group, name, "json"));
      const expected = readJcsFixture(group, name, "jcs").toString("utf8");
      const digest = readJcsFixture(group, name, "sha256")
        .toString("utf8")
        .trim();
      assert.equal(actual, expected, `${group}/${name}`);
      assert.equal(sha256Hex(actual), digest);
    }
  }
});
