import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { goalDigest, type GoalDigest } from "./brands.js";
import type { GoalContractPayload, GoalOutcomeSlots } from "./types.js";

/** Mechanical NFC + trim. Never paraphrases intent. */
export function normalizeWording(wording: string): string {
  return wording.normalize("NFC").trim();
}

export function canonicalizeSlots(slots: GoalOutcomeSlots): GoalOutcomeSlots {
  return {
    outcomeKind: slots.outcomeKind,
    ...(slots.domainHints === undefined
      ? {}
      : { domainHints: [...slots.domainHints].map((h) => h.normalize("NFC").trim()).sort() }),
    ...(slots.firstSuccessContractId === undefined
      ? {}
      : { firstSuccessContractId: slots.firstSuccessContractId }),
    ...(slots.workspaceClass === undefined
      ? {}
      : { workspaceClass: slots.workspaceClass }),
  };
}

export function computeGoalDigest(payload: GoalContractPayload): GoalDigest {
  const normalized: GoalContractPayload = {
    wording: normalizeWording(payload.wording),
    slots: canonicalizeSlots(payload.slots),
  };
  const canonical = canonicalize(normalized);
  if (canonical === undefined) {
    throw new Error("GoalContractPayload is not canonicalizable");
  }
  return goalDigest(createHash("sha256").update(canonical).digest("hex"));
}
