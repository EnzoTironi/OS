import type { ObservationRecord } from "./types.js";

/** Keys that must never appear on analytics / observation payloads. */
export const CONTENT_PAYLOAD_DENYLIST = [
  "message",
  "messageBody",
  "body",
  "prompt",
  "chat",
  "transcript",
  "actionArgs",
  "actionBody",
  "sourceBlob",
  "sourceText",
  "conversation",
  "rawContent",
] as const;

const denySet = new Set<string>(CONTENT_PAYLOAD_DENYLIST);

const ALLOWED_KEYS = new Set([
  "eventId",
  "contractId",
  "declaredContractId",
  "status",
  "observedAtMicros",
  "tenantId",
  "accountId",
  "sessionId",
  "productId",
  "buildId",
  "outcomeRef",
  "reasonCategory",
]);

export function assertNoContentPayload(
  record: ObservationRecord | Record<string, unknown>,
): void {
  for (const key of Object.keys(record)) {
    if (denySet.has(key)) {
      throw new Error(`content payload key forbidden: ${key}`);
    }
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`unknown observation attribute: ${key}`);
    }
  }
}

export function sanitizeExportBatch(
  records: readonly ObservationRecord[],
): readonly ObservationRecord[] {
  for (const record of records) {
    assertNoContentPayload(record);
  }
  return records;
}
