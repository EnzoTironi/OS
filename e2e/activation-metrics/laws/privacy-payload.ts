import assert from "node:assert/strict";
import {
  assertNoContentPayload,
  CONTENT_PAYLOAD_DENYLIST,
  sanitizeExportBatch,
  type ObservationRecord,
} from "../../../archive/packages/activation-metrics/src/index.js";

export function verifyPrivacyPayload(args: {
  readonly records: readonly ObservationRecord[];
  readonly record: (name: string, observed: boolean) => void;
  readonly killMutant: (name: string) => void;
}): void {
  const batch = sanitizeExportBatch(args.records);
  for (const item of batch) {
    assertNoContentPayload(item);
    const keys = Object.keys(item);
    for (const denied of CONTENT_PAYLOAD_DENYLIST) {
      assert.equal(keys.includes(denied), false, denied);
    }
    assert.equal("message" in item, false);
    assert.equal("actionArgs" in item, false);
    assert.equal("actionBody" in item, false);
  }
  args.record("default_analytics_payload_has_no_bodies", batch.length >= 0);
  args.killMutant("Raw message body exported");
  args.killMutant("Creator attribution receives Action payload");
}
