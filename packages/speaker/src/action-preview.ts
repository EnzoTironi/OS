const INTERNAL_ID =
  /\b(?:proposal|operation|approval|claim|principal|tenant|actor|workload)\.[A-Za-z0-9._-]+|\b(?:inventory|personal|commercial)\.[A-Za-z0-9._-]+|\bicr_[0-9a-f]+\b|\b[0-9a-f]{64}\b|zoen-engine|zoen-core|packages\/|crates\//i;

/**
 * Spoken text must not leak kernel identifiers.
 * Speaker does not import or render ontology ActionPreviewDocument.
 */
export function speakerPreviewLeaksInternalIds(text: string): boolean {
  return INTERNAL_ID.test(text);
}
