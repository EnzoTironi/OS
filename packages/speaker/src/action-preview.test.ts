import assert from "node:assert/strict";
import test from "node:test";
import { speakerPreviewLeaksInternalIds } from "./action-preview.js";

test("speaker treats resource ids as leaks and keeps ordinary speech", () => {
  assert.equal(
    speakerPreviewLeaksInternalIds(
      "Vou executar requestStock em inventory.item.1.",
    ),
    true,
  );
  assert.equal(
    speakerPreviewLeaksInternalIds("Vou executar requestStock."),
    false,
  );
  assert.equal(speakerPreviewLeaksInternalIds("Vou guardar esta nota: comprar pão"), false);
});
