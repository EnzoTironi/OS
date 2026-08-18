import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compileDefinition } from "./compiler.js";

const fixtureDirectory = path.join(
  process.cwd(),
  "packages",
  "ontology",
  "fixtures",
);

test("canonical compilation is deterministic and order independent", async () => {
  const first = await compileDefinition(
    path.join(fixtureDirectory, "inventory.zoen.ts"),
  );
  const second = await compileDefinition(
    path.join(fixtureDirectory, "inventory.zoen.ts"),
  );
  const reordered = await compileDefinition(
    path.join(fixtureDirectory, "inventory-reordered.zoen.ts"),
  );

  assert.equal(first.canonicalJson, second.canonicalJson);
  assert.equal(first.digest, second.digest);
  assert.equal(first.canonicalJson, reordered.canonicalJson);
  assert.equal(first.digest, reordered.digest);
});

test("executable changes alter the digest", async () => {
  const fixturePath = path.join(fixtureDirectory, "inventory.zoen.ts");
  const source = await readFile(fixturePath, "utf8");
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "zoen-compiler-"),
  );
  const mutatedPath = path.join(temporaryDirectory, "mutated.zoen.ts");
  await writeFile(
    mutatedPath,
    source.replace('operator: "subtract"', 'operator: "add"'),
  );

  const original = await compileDefinition(fixturePath);
  const mutated = await compileDefinition(mutatedPath);

  assert.notEqual(original.digest, mutated.digest);
});

test("nondeterministic authoring syntax is rejected", async () => {
  await assert.rejects(
    compileDefinition(
      path.join(fixtureDirectory, "nondeterministic.zoen.ts"),
    ),
    /nondeterministic or unsupported syntax/,
  );
});
