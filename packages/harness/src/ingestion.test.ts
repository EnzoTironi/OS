import assert from "node:assert/strict";
import test from "node:test";
import {
  companyBrainIngestCommandSchema,
  companyBrainIngestObjectKey,
  signCompanyBrainIngestCommand,
} from "./ingestion.js";

const command = companyBrainIngestCommandSchema.parse({
  ingestId: "ingest.shared",
  source: {
    filename: "message.json",
    kind: "message",
    message: {
      channel: "operations",
      messageId: "message.shared",
      sender: "operator@example.test",
      sentAt: "2026-08-20T08:00:00.000Z",
      subject: "Shared source",
      text: "Tenant-bound company evidence.",
    },
    sourceId: "source.shared",
  },
  tenantId: "tenant.a",
});

test("ingest signatures bind the tenant identity", () => {
  const otherTenant = companyBrainIngestCommandSchema.parse({
    ...command,
    tenantId: "tenant.b",
  });

  assert.notEqual(
    signCompanyBrainIngestCommand("binding-key", command),
    signCompanyBrainIngestCommand("binding-key", otherTenant),
  );
});

test("Restate ingest keys include unambiguous tenant identity", () => {
  assert.equal(
    companyBrainIngestObjectKey(command),
    "tenant.a:ingest.shared",
  );
  assert.notEqual(
    companyBrainIngestObjectKey(command),
    companyBrainIngestObjectKey({
      ingestId: command.ingestId,
      tenantId: "tenant.b",
    }),
  );
  assert.notEqual(
    companyBrainIngestObjectKey({
      ingestId: "b:c",
      tenantId: "tenant.a",
    }),
    companyBrainIngestObjectKey({
      ingestId: "c",
      tenantId: "tenant.a:b",
    }),
  );
});
