import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import {
  conditionIdentityDigest,
  materialFingerprint,
  semanticCutDigest,
  type ConditionIdentityDigest,
  type MaterialFingerprint,
  type SemanticCutDigest,
} from "./brands.js";
import type { AttentionSubject, ConditionIdentity } from "./types.js";

export type ConditionIdentityParts = Omit<ConditionIdentity, "digest">;

/** Sole Attention dedupe key. Text/copy is intentionally absent. */
export function digestConditionIdentity(
  parts: ConditionIdentityParts,
): ConditionIdentityDigest {
  const payload = {
    definitionId: String(parts.definitionId),
    definitionVersion: String(parts.definitionVersion),
    semanticCutDigest: String(parts.semanticCutDigest),
    subject: subjectCanonical(parts.subject),
    tenantId: String(parts.tenantId),
  };
  const jcs = canonicalize(payload);
  if (jcs === undefined) {
    throw new Error("failed to canonicalize condition identity");
  }
  return conditionIdentityDigest(
    createHash("sha256").update(jcs).digest("hex"),
  );
}

export function buildConditionIdentity(
  parts: ConditionIdentityParts,
): ConditionIdentity {
  return {
    ...parts,
    digest: digestConditionIdentity(parts),
  };
}

export function digestSemanticCut(fields: Record<string, unknown>): SemanticCutDigest {
  const jcs = canonicalize(fields);
  if (jcs === undefined) {
    throw new Error("failed to canonicalize semantic cut");
  }
  return semanticCutDigest(createHash("sha256").update(jcs).digest("hex"));
}

export function digestMaterialFields(
  fields: Record<string, unknown>,
): MaterialFingerprint {
  const jcs = canonicalize(fields);
  if (jcs === undefined) {
    throw new Error("failed to canonicalize material fields");
  }
  return materialFingerprint(createHash("sha256").update(jcs).digest("hex"));
}

function subjectCanonical(subject: AttentionSubject): Record<string, string> {
  if (subject.kind === "resource") {
    return { kind: "resource", resourceId: subject.resourceId };
  }
  if (subject.kind === "entity") {
    return { kind: "entity", entityId: subject.entityId };
  }
  return { kind: "operation", operationId: subject.operationId };
}

/** Reject text-hash identity attempts at the API boundary. */
export function assertNoTextIdentityKey(candidate: unknown): void {
  if (candidate === null || typeof candidate !== "object") {
    return;
  }
  const record = candidate as Record<string, unknown>;
  for (const key of [
    "textHash",
    "messageHash",
    "renderedCopyHash",
    "notificationText",
    "bodyHash",
  ]) {
    if (key in record) {
      throw new Error(
        `text-only attention identity forbidden: field ${key} is not allowed`,
      );
    }
  }
}
