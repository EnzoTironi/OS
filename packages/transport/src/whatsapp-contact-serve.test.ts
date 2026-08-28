import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("whatsapp-contact-serve asserts the model credential before companion or pg", () => {
  const source = readFileSync(
    path.join(process.cwd(), "packages/transport/src/whatsapp-contact-serve.ts"),
    "utf8",
  );
  const mainAt = source.indexOf("async function main");
  assert.notEqual(mainAt, -1);
  const body = source.slice(mainAt);
  const assertAt = body.indexOf("assertConfiguredModelCredential(");
  const companionAt = body.indexOf("createHttpCompanionSession");
  const pgAt = body.indexOf("new Client");
  assert.notEqual(assertAt, -1);
  assert.ok(assertAt < companionAt);
  assert.ok(assertAt < pgAt);
});
