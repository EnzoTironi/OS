import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { AuthorityFacts } from "./types.js";

/** Content digest of authority fields only (excludes presentation copy). */
export function authorityDigest(authority: AuthorityFacts): string {
  const canonical = canonicalize({
    capabilities: authority.capabilities,
    firstSuccess: authority.firstSuccess,
    ontology: authority.ontology.map((dependency) => ({
      definitionId: dependency.definitionId,
      digest: dependency.digest,
    })),
    packId: authority.packId,
    publisher: authority.publisher,
    version: authority.version,
  });
  if (canonical === undefined) {
    throw new Error("failed to canonicalize authority facts");
  }
  return createHash("sha256").update(canonical).digest("hex");
}
