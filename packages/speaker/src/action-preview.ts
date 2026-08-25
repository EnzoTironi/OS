import {
  actionPreviewHash,
  buildActionPreviewDocument,
  type ActionPreviewDocument,
  type ActionPreviewInput,
} from "../../ontology/src/action-preview.js";

const INTERNAL_ID =
  /\b(?:proposal|operation|approval|claim|principal|tenant|actor|workload)\.[A-Za-z0-9._-]+|\bicr_[0-9a-f]+\b|\b[0-9a-f]{64}\b|zoen-engine|zoen-core|packages\/|crates\//i;

/**
 * Context: Speaker renders the kernel preview, never invents one.
 * Inputs: Action preview document produced by the kernel/OSDK.
 * Outputs: PT-BR text the person can confirm.
 * Side effects: none. Rejects documents whose spoken text leaks internals.
 */
export function renderSpeakerActionPreview(
  document: ActionPreviewDocument,
): string {
  if (speakerPreviewLeaksInternalIds(document.canonicalPreviewText)) {
    throw new Error("preview text leaked an internal identifier");
  }
  return document.canonicalPreviewText;
}

export function speakerPreviewLeaksInternalIds(text: string): boolean {
  return INTERNAL_ID.test(text);
}

export function speakerActionPreview(input: {
  readonly actionId: string;
  readonly resourceId: string;
  readonly inputs: readonly ActionPreviewInput[];
}): {
  readonly document: ActionPreviewDocument;
  readonly previewHash: string;
  readonly previewText: string;
} {
  const document = buildActionPreviewDocument(input);
  return {
    document,
    previewHash: actionPreviewHash(document),
    previewText: renderSpeakerActionPreview(document),
  };
}
