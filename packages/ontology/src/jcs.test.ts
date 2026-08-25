import assert from "node:assert/strict";
import test from "node:test";
import canonicalize from "canonicalize";
import {
  JcsError,
  canonicalizeJson,
  canonicalizeJsonBytes,
  isCanonicalDigestHex,
  listJcsSuccessCases,
  readJcsFixture,
  sha256Hex,
} from "./jcs.js";

for (const group of ["rfc8785", "zoen"] as const) {
  test(`JCS ${group} fixtures match bit-perfect output and digest`, () => {
    for (const name of listJcsSuccessCases(group)) {
      const input = readJcsFixture(group, name, "json");
      const expected = readJcsFixture(group, name, "jcs");
      const digest = readJcsFixture(group, name, "sha256")
        .toString("utf8")
        .trim();
      const actual = canonicalizeJsonBytes(input);
      assert.equal(actual, expected.toString("utf8"), `${group}/${name}`);
      assert.equal(sha256Hex(actual), digest, `${group}/${name} sha256`);
      assert.equal(
        canonicalize(JSON.parse(input.toString("utf8"))),
        actual,
        `${group}/${name} differential vs canonicalize`,
      );
    }
  });
}

test("JCS rejects duplicate keys and trailing junk", () => {
  assert.throws(
    () => canonicalizeJsonBytes(readJcsFixture("errors", "duplicate-keys", "json")),
    (error: unknown) => error instanceof JcsError && error.kind === "duplicate_key",
  );
  assert.throws(
    () => canonicalizeJsonBytes(readJcsFixture("errors", "trailing-junk", "json")),
    (error: unknown) => error instanceof JcsError && error.kind === "trailing_junk",
  );
});

test("JCS rejects invalid UTF-8", () => {
  assert.throws(
    () => canonicalizeJsonBytes(Buffer.from([0x7b, 0xff, 0x7d])),
    (error: unknown) => error instanceof JcsError && error.kind === "invalid_utf8",
  );
});

test("JCS digest encoding is lowercase hex", () => {
  assert.equal(
    isCanonicalDigestHex(
      "3007ba96dbc428d28d4791b10e2e35e6a42166cbcfa8643623dc7cd5e0b82037",
    ),
    true,
  );
  assert.equal(
    isCanonicalDigestHex(
      "3007BA96DBC428D28D4791B10E2E35E6A42166CBCFA8643623DC7CD5E0B82037",
    ),
    false,
  );
});

test("null is not an omitted field", () => {
  assert.equal(canonicalizeJson('{"keep":1}'), '{"keep":1}');
  assert.notEqual(
    canonicalizeJson('{"keep":1}'),
    canonicalizeJson('{"keep":1,"gone":null}'),
  );
});

test("property: object key permutation is JCS-stable", () => {
  const pairs: ReadonlyArray<readonly [string, unknown]> = [
    ["schema", 1],
    ["revision", true],
    ["definitionId", null],
    ["ζ", "x"],
    ["😀", 0.5],
    ["1", false],
    ["A", "z"],
  ];
  const permutations = [
    pairs,
    [...pairs].reverse(),
    [pairs[3], pairs[0], pairs[6], pairs[1], pairs[5], pairs[2], pairs[4]],
  ];
  const digests = new Set<string>();
  for (const order of permutations) {
    const object: Record<string, unknown> = {};
    for (const pair of order) {
      if (pair === undefined) {
        continue;
      }
      object[pair[0]] = pair[1];
    }
    const json = JSON.stringify(object);
    digests.add(sha256Hex(canonicalizeJson(json)));
  }
  assert.equal(digests.size, 1);
});
