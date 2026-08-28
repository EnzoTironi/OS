import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeEntityId } from "./world-query.js";

test("looksLikeEntityId hides dotted ids and keeps source labels speakable", () => {
  assert.equal(looksLikeEntityId("commercial.order-line.dirty-quote"), true);
  assert.equal(looksLikeEntityId("membership.wa.enzo"), true);
  assert.equal(looksLikeEntityId("source.sheet"), false);
  assert.equal(looksLikeEntityId("10 each"), false);
  assert.equal(looksLikeEntityId(""), false);
});
