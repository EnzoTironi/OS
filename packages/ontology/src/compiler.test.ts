import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { compileDefinition } from "./compiler.js";

const execFileAsync = promisify(execFile);
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

test("host ICU locale cannot change canonical identity", async () => {
  const source = await readFile(
    path.join(fixtureDirectory, "inventory.zoen.ts"),
    "utf8",
  );
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "zoen-compiler-locale-"),
  );
  const fixturePath = path.join(temporaryDirectory, "locale-order.zoen.ts");
  await writeFile(
    fixturePath,
    source.replaceAll("inventory.Warehouse", "inventory.item"),
  );

  const english = await compileWithLocale(fixturePath, "en");
  const danish = await compileWithLocale(fixturePath, "da");

  assert.equal(english, danish);
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

test("entity input compiles to the existing value type", async () => {
  const compiled = await compileDefinition(
    path.join(fixtureDirectory, "entity-input.zoen.ts"),
  );
  const document = JSON.parse(compiled.canonicalJson) as {
    readonly actions: readonly {
      readonly id: string;
      readonly inputs: readonly {
        readonly id: string;
        readonly valueType: { readonly kind: string; readonly typeId?: string };
      }[];
    }[];
  };
  const assignLocation = document.actions.find(
    (action) => action.id === "inventory.assignLocation",
  );
  assert.ok(assignLocation);
  assert.deepEqual(assignLocation.inputs, [
    {
      id: "location",
      valueType: { kind: "entity", typeId: "inventory.Location" },
    },
  ]);
});

test("personal.zoen.ts compileDefinition succeeds with all four families", async () => {
  const compiled = await compileDefinition(
    path.join(fixtureDirectory, "personal.zoen.ts"),
  );
  const document = JSON.parse(compiled.canonicalJson) as {
    readonly actions: readonly { readonly id: string }[];
    readonly computations: readonly { readonly id: string }[];
    readonly id: string;
    readonly relations: readonly { readonly id: string }[];
    readonly types: readonly { readonly id: string }[];
  };
  assert.equal(document.id, "personal.memory");
  assert.notEqual(document.id, "commercial.sales");
  assert.ok(document.types.length > 0);
  assert.ok(document.relations.length > 0);
  assert.ok(document.computations.length > 0);
  assert.ok(document.actions.length > 0);
  assert.ok(document.types.some((entry) => entry.id === "personal.Note"));
  assert.ok(document.relations.some((entry) => entry.id === "personal.body"));
  assert.ok(document.computations.some((entry) => entry.id === "personal.alwaysTrue"));
  assert.deepEqual(
    document.actions.map((action) => action.id).sort(),
    ["personal.createReminder", "personal.writeMemory"],
  );
  assert.doesNotMatch(compiled.canonicalJson, /datetime/);
});

test("entity input rejects an unknown type id", async () => {
  const source = await readFile(
    path.join(fixtureDirectory, "entity-input.zoen.ts"),
    "utf8",
  );
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "zoen-compiler-entity-"),
  );
  const mutatedPath = path.join(temporaryDirectory, "unknown-type.zoen.ts");
  await writeFile(
    mutatedPath,
    source.replace(
      'valueType: { kind: "entity", typeId: "inventory.Location" }',
      'valueType: { kind: "entity", typeId: "inventory.Missing" }',
    ),
  );
  await assert.rejects(
    compileDefinition(mutatedPath),
    /inventory.assignLocation input location references unknown type inventory.Missing/,
  );
});

async function compileWithLocale(
  sourcePath: string,
  locale: string,
): Promise<string> {
  const cliPath = path.join(
    process.cwd(),
    "dist",
    "packages",
    "ontology",
    "src",
    "cli.js",
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "compile", sourcePath],
    {
      cwd: process.cwd(),
      env: { ...process.env, LANG: locale, LC_ALL: locale },
    },
  );
  return stdout;
}
