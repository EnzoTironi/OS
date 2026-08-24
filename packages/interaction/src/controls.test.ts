import assert from "node:assert/strict";
import test from "node:test";
import {
  createInteractionControlRegistry,
  createMemoryControlStore,
  createStepUpRegistry,
  principalIdString,
  tenantIdString,
} from "./index.js";

test("createInteractionControlRegistry requires an explicit store", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const ref = await controls.issue({
    actionBindingId: "binding.1",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    kind: "approval",
    principalId: principalIdString("principal.a"),
    proposalRef: "proposal.1",
    tenantId: tenantIdString("tenant.a"),
  });
  const live = await controls.resolve(ref);
  assert.equal(live.principalId, "principal.a");
});

test("createStepUpRegistry requires an explicit store", async () => {
  const store = createMemoryControlStore();
  const stepUps = createStepUpRegistry({ store });
  assert.equal(typeof stepUps.open, "function");
});
