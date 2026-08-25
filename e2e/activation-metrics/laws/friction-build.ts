import assert from "node:assert/strict";
import {
  appendFriction,
  opaqueId,
  type FrictionStore,
} from "../../../archive/packages/activation-metrics/src/index.js";

export async function verifyFrictionBuild(args: {
  readonly frictionStore: FrictionStore;
  readonly sessionId: string;
  readonly buildId: string;
  readonly record: (name: string, observed: boolean) => void;
}): Promise<void> {
  const sessionId = opaqueId(args.sessionId);
  const entry = await appendFriction({
    frictionId: "friction.source.1",
    contractId: "source_inspected",
    sessionId,
    elapsedMicros: 12_000,
    category: "confusion",
    userVisibleMessageCode: "source.inspect.unclear",
    recoveryPath: "open_mapping_help",
    manualHelpNeeded: false,
    buildId: args.buildId,
    store: args.frictionStore,
  });
  assert.equal(entry.buildId, args.buildId);
  assert.equal(entry.contractId, "source_inspected");
  const listed = await args.frictionStore.listBySession(sessionId);
  args.record(
    "friction_points_to_build_session_contract",
    listed.some(
      (item) =>
        item.buildId === args.buildId &&
        item.contractId === "source_inspected" &&
        item.sessionId === sessionId,
    ),
  );
}
