import assert from "node:assert/strict";
import test from "node:test";
import {
  createZoendCodeModeHost,
  usesCommercialLake,
} from "./zoend-code-mode-host.js";

const personalDefinition = {
  definitionId: "personal.memory",
  digest: "a".repeat(64),
  revision: 1,
};

test("quotedQuantity on dirty-quote uses the commercial lake", () => {
  assert.equal(
    usesCommercialLake({
      capabilityId: "world",
      entityId: "commercial.order-line.dirty-quote",
      selection: { id: "commercial.quotedQuantity", kind: "relation" },
    }),
    true,
  );
  assert.equal(
    usesCommercialLake({
      capabilityId: "personal.Note",
      entityId: "membership.wa.enzo",
      selection: { id: "personal.body", kind: "relation" },
    }),
    false,
  );
});

test("commercial query fails when the world definition is missing", async () => {
  const host = createZoendCodeModeHost({
    baseUrl: "http://127.0.0.1:9",
    bearerToken: "tok",
    definition: personalDefinition,
    readBearerToken: () => "tok",
    tenantId: "tenant.a",
  });
  await assert.rejects(
    () =>
      host.query({
        capabilityId: "world",
        entityId: "commercial.order-line.dirty-quote",
        selection: { id: "commercial.quotedQuantity", kind: "relation" },
      }),
    { message: "commercial lake definition unavailable" },
  );
});

test("personal query still uses the personal lake definition", async () => {
  const host = createZoendCodeModeHost({
    baseUrl: "http://127.0.0.1:9",
    definitionPath: undefined,
    readBearerToken: () => "tok",
    tenantId: "tenant.a",
  });
  await assert.rejects(
    () =>
      host.query({
        capabilityId: "personal.Note",
        entityId: "membership.wa.enzo",
        selection: { id: "personal.body", kind: "relation" },
      }),
    { message: "personal lake definition unavailable" },
  );
});
