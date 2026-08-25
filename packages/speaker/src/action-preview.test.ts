import assert from "node:assert/strict";
import test from "node:test";
import { buildActionPreviewDocument } from "../../ontology/src/action-preview.js";
import {
  renderSpeakerActionPreview,
  speakerPreviewLeaksInternalIds,
} from "./action-preview.js";

test("speaker preview shows the kernel text and hides resource ids", () => {
  const document = buildActionPreviewDocument({
    actionId: "personal.writeMemory",
    inputs: [{ id: "body", value: { kind: "text", value: "comprar pão" } }],
    resourceId: "personal.note.deadbeef",
  });
  const previewText = renderSpeakerActionPreview(document);
  assert.equal(previewText, "Vou guardar esta nota: comprar pão");
  assert.equal(speakerPreviewLeaksInternalIds(previewText), false);
  assert.doesNotMatch(previewText, /personal\.note|proposal\.|deadbeef/);
});

test("speaker preview refuses spoken internal identifiers", () => {
  const document = buildActionPreviewDocument({
    actionId: "inventory.requestStock",
    inputs: [{ id: "quantity", value: { kind: "integer", value: "2" } }],
    resourceId: "inventory.item.1",
  });
  assert.throws(
    () =>
      renderSpeakerActionPreview({
        ...document,
        canonicalPreviewText:
          "Confirme proposal.direct e claim.action.operation.direct.0",
      }),
    /leaked an internal identifier/,
  );
});

test("speaker preview treats resource ids as leaks", () => {
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
});
