import assert from "node:assert/strict";
import test from "node:test";
import { buildActionPreviewDocument } from "../../ontology/src/action-preview.js";
import {
  renderSpeakerActionPreview,
  speakerActionPreview,
  speakerPreviewLeaksInternalIds,
} from "./action-preview.js";

test("speaker preview shows the kernel text and hides resource ids", () => {
  const rendered = speakerActionPreview({
    actionId: "personal.writeMemory",
    inputs: [{ id: "body", value: { kind: "text", value: "comprar pão" } }],
    resourceId: "personal.note.deadbeef",
  });
  assert.equal(rendered.previewText, "Vou guardar esta nota: comprar pão");
  assert.equal(
    speakerPreviewLeaksInternalIds(rendered.previewText),
    false,
  );
  assert.doesNotMatch(rendered.previewText, /personal\.note|proposal\.|deadbeef/);
  assert.match(rendered.previewHash, /^[0-9a-f]{64}$/);
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
