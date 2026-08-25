import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { canonicalizeJson, sha256Hex } from "./jcs.js";
import {
  actionPreviewHash,
  buildActionPreviewDocument,
  toWireDocument,
} from "./action-preview.js";

const fixtureRoot = path.join(
  process.cwd(),
  "testdata",
  "action-preview",
);

test("preview hash is SHA-256 of RFC 8785 JCS bytes", () => {
  const document = buildActionPreviewDocument({
    actionId: "inventory.requestStock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "2" } }],
    resourceId: "inventory.item.1",
  });
  const canonical = canonicalizeJson(JSON.stringify(toWireDocument(document)));
  assert.equal(actionPreviewHash(document), sha256Hex(canonical));
  assert.equal(
    document.canonicalPreviewText,
    "Vou executar requestStock com quantidade 2.",
  );
  assert.doesNotMatch(document.canonicalPreviewText, /inventory\.item\.1/);
});

test("preview hash is stable across JSON key order", () => {
  const document = buildActionPreviewDocument({
    actionId: "inventory.requestStock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "2" } }],
    resourceId: "inventory.item.1",
  });
  const left = actionPreviewHash(document);
  const shuffled = JSON.stringify({
    schema: document.schema,
    resource: document.resource,
    locale: document.locale,
    inputs: [{ value: "2", kind: "integer", id: "quantity" }],
    canonical_preview_text: document.canonicalPreviewText,
    action: document.action,
  });
  assert.equal(
    canonicalizeJson(JSON.stringify(toWireDocument(document))),
    canonicalizeJson(shuffled),
  );
  assert.equal(left.length, 64);
});

test("changed inputs or preview text change the hash", () => {
  const two = buildActionPreviewDocument({
    actionId: "inventory.requestStock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "2" } }],
    resourceId: "inventory.item.1",
  });
  const three = buildActionPreviewDocument({
    actionId: "inventory.requestStock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "3" } }],
    resourceId: "inventory.item.1",
  });
  assert.notEqual(actionPreviewHash(two), actionPreviewHash(three));
  const tweaked = {
    ...two,
    canonicalPreviewText: `${two.canonicalPreviewText}!`,
  };
  assert.notEqual(actionPreviewHash(two), actionPreviewHash(tweaked));
});

test("preview hash matches published fixtures", async () => {
  const cases = [
    {
      document: buildActionPreviewDocument({
        actionId: "inventory.requestStock",
        inputs: [{ id: "quantity", value: { kind: "integer", value: "2" } }],
        resourceId: "inventory.item.1",
      }),
      name: "request-stock",
    },
    {
      document: buildActionPreviewDocument({
        actionId: "personal.writeMemory",
        inputs: [{ id: "body", value: { kind: "text", value: "comprar pão" } }],
        resourceId: "personal.note.1",
      }),
      name: "write-memory",
    },
  ];
  for (const { document, name } of cases) {
    const canonical = canonicalizeJson(JSON.stringify(toWireDocument(document)));
    const expectedJcs = (await readFile(path.join(fixtureRoot, `${name}.jcs`), "utf8")).replace(
      /\n$/u,
      "",
    );
    const expectedHash = (
      await readFile(path.join(fixtureRoot, `${name}.sha256`), "utf8")
    ).trim();
    assert.equal(canonical, expectedJcs, `${name} jcs`);
    assert.equal(actionPreviewHash(document), expectedHash, `${name} hash`);
  }
});

test("personal write preview stays in Portuguese", () => {
  const note = buildActionPreviewDocument({
    actionId: "personal.writeMemory",
    inputs: [{ id: "body", value: { kind: "text", value: "comprar pão" } }],
    resourceId: "personal.note.1",
  });
  assert.equal(note.canonicalPreviewText, "Vou guardar esta nota: comprar pão");
  assert.doesNotMatch(note.canonicalPreviewText, /personal\.note\.1|proposal/);
});
