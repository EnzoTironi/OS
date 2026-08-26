import assert from "node:assert/strict";
import test from "node:test";
import {
  permissionForFeature,
  type ChannelAssurance,
  type ExternalBoundary,
} from "./permission.js";

const boundaries: readonly ExternalBoundary[] = [
  "web_report",
  "bank_access",
  "fiscal_issuance",
];

const assurances: readonly ChannelAssurance[] = ["whatsapp_phone", "oidc_bound"];

test("in_lake never escalates", () => {
  for (const channelAssurance of assurances) {
    const decision = permissionForFeature({
      channelAssurance,
      feature: { kind: "in_lake" },
    });
    assert.deepEqual(decision, { assurance: "channel_inline", kind: "allow" });
  }
});

test("external boundary with WhatsApp phone asks for OIDC", () => {
  for (const boundary of boundaries) {
    const decision = permissionForFeature({
      channelAssurance: "whatsapp_phone",
      feature: { boundary, kind: "external" },
    });
    assert.deepEqual(decision, {
      assurance: "oidc_step_up",
      boundary,
      kind: "escalate",
    });
  }
});

test("external boundary with OIDC binding does not prompt login", () => {
  for (const boundary of boundaries) {
    const decision = permissionForFeature({
      channelAssurance: "oidc_bound",
      feature: { boundary, kind: "external" },
    });
    assert.deepEqual(decision, { assurance: "channel_inline", kind: "allow" });
  }
});
