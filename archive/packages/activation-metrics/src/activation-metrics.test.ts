import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { opaqueId } from "./brands.js";
import { createActivationMetrics, createNullExporter, exportPending } from "./export.js";
import { appendFriction } from "./friction.js";
import {
  createMemoryFrictionStore,
  createMemoryObservationStore,
} from "./memory-store.js";
import { metricDuration } from "./metrics.js";
import { observeContract, observePackFirstSuccess } from "./observe.js";
import { assertNoContentPayload } from "./privacy.js";

const tenantA = opaqueId("tenant.a");
const tenantB = opaqueId("tenant.b");
const session = opaqueId("session.1");
const buildId = "activation-metrics.test";

describe("activation-metrics", () => {
  it("maps pack FirstSuccess Matched only from AD-08 eval", async () => {
    const store = createMemoryObservationStore();
    const connect = await observePackFirstSuccess({
      tenantId: tenantA,
      sessionId: session,
      installId: "install.1",
      eventId: "evt.connect",
      buildId,
      store,
      evaluate: async () => ({ status: "not_matched" }),
    });
    assert.equal(connect.status, "not_matched");
    assert.equal(connect.contractId, "pack_first_success");

    const matched = await observePackFirstSuccess({
      tenantId: tenantA,
      sessionId: session,
      installId: "install.1",
      eventId: "evt.matched",
      buildId,
      store,
      evaluate: async () => ({
        status: "matched",
        outcomeRef: "op.1",
        firedAtMicros: 1_000_000,
      }),
    });
    assert.equal(matched.status, "matched");
    assert.equal(matched.outcomeRef, "op.1");
    assert.equal(matched.declaredContractId, "sample.first_governed_commitment");
  });

  it("rejects content payload keys", () => {
    assert.throws(() =>
      assertNoContentPayload({
        eventId: "e",
        contractId: "ontology_ready",
        status: "matched",
        observedAtMicros: 1,
        tenantId: tenantA,
        sessionId: session,
        buildId,
        message: "secret chat",
      } as never),
    );
  });

  it("derives duration only from Matched observations", async () => {
    const store = createMemoryObservationStore();
    await observeContract({
      contractId: "ontology_ready",
      tenantId: tenantA,
      sessionId: session,
      eventId: "evt.ready",
      buildId,
      store,
      nowMicros: () => 100,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched" }),
      },
    });
    await observeContract({
      contractId: "first_approved_action",
      tenantId: tenantA,
      sessionId: session,
      eventId: "evt.action",
      buildId,
      store,
      nowMicros: () => 250,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({
          status: "matched",
          outcomeRef: "op.sample",
        }),
      },
    });
    const observations = await store.listBySession(tenantA, session);
    const result = metricDuration({
      sessionId: session,
      from: "ontology_ready",
      to: "first_approved_action",
      observations,
      metricId: "time_to_sample_first_action",
    });
    assert.equal(result.kind, "duration");
    if (result.kind === "duration") {
      assert.equal(result.durationMicros, 150);
    }
  });

  it("keeps not_ready slots from claiming Matched", async () => {
    const store = createMemoryObservationStore();
    const second = await observeContract({
      contractId: "second_process",
      tenantId: tenantA,
      sessionId: session,
      eventId: "evt.second",
      buildId,
      store,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched", outcomeRef: "fake" }),
      },
    });
    assert.equal(second.status, "not_ready");
  });

  it("isolates exporters from observe and supports disabled export", async () => {
    const store = createMemoryObservationStore();
    const frictionStore = createMemoryFrictionStore();
    let calls = 0;
    const faulty = {
      id: "fault",
      async exportBatch() {
        calls += 1;
        throw new Error("exporter down");
      },
    };
    const metrics = createActivationMetrics({
      store,
      frictionStore,
      exporters: [faulty],
      exportEnabled: true,
    });

    const observation = await observePackFirstSuccess({
      tenantId: tenantA,
      sessionId: session,
      installId: "i",
      eventId: "evt.export",
      buildId,
      store,
      evaluate: async () => ({
        status: "matched",
        outcomeRef: "op",
        firedAtMicros: 1,
      }),
    });
    assert.equal(observation.status, "matched");

    const failed = await metrics.exportPending(tenantA);
    assert.equal(calls, 1);
    assert.equal(failed.exporterErrors.length, 1);
    assert.equal(failed.exportedEventIds.length, 0);

    const disabled = await exportPending({
      store,
      tenantId: tenantA,
      exporters: [],
      exportEnabled: false,
    });
    assert.equal(disabled.attempted, 0);

    const nullExport = await exportPending({
      store,
      tenantId: tenantA,
      exporters: [createNullExporter()],
      exportEnabled: true,
    });
    assert.ok(nullExport.exportedEventIds.includes("evt.export"));

    const again = await exportPending({
      store,
      tenantId: tenantA,
      exporters: [createNullExporter()],
      exportEnabled: true,
    });
    assert.equal(again.attempted, 0);
  });

  it("scopes observations by tenant", async () => {
    const store = createMemoryObservationStore();
    await observeContract({
      contractId: "integration_connected",
      tenantId: tenantA,
      sessionId: session,
      eventId: "evt.a",
      buildId,
      store,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched" }),
      },
    });
    const cross = await store.listBySession(tenantB, session);
    assert.equal(cross.length, 0);
  });

  it("records friction with build and contract", async () => {
    const frictionStore = createMemoryFrictionStore();
    const entry = await appendFriction({
      frictionId: "fr.1",
      contractId: "source_inspected",
      sessionId: session,
      elapsedMicros: 42,
      category: "confusion",
      userVisibleMessageCode: "source.inspect.help",
      recoveryPath: "retry_inspect",
      manualHelpNeeded: false,
      buildId,
      store: frictionStore,
    });
    assert.equal(entry.buildId, buildId);
    assert.equal(entry.contractId, "source_inspected");
  });
});
