import assert from "node:assert/strict";
import { Code } from "@connectrpc/connect";
import {
  commitEffect,
  encodeContract,
  expectConnectCode,
  freezeHumanPayload,
  humanTaskContract,
  projectPacket,
  sha256,
  type HumanScenario,
} from "../scenario.js";

export async function verifyPacketMinimal(scenario: HumanScenario): Promise<{
  effectRequestId: string;
  requestDigest: string;
}> {
  const committed = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "packet-minimal",
  );
  const contract = humanTaskContract();
  const frozen = await freezeHumanPayload(
    scenario.admin,
    committed.effectRequestId,
    contract,
  );
  const claim = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.packet.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.ok(claim.claim?.request);
  assert.equal(claim.claim.request.requestDigest, frozen.requestDigest);
  const packet = projectPacket({
    attemptId: claim.claim.attemptId,
    contract,
    effectRequestId: committed.effectRequestId,
    requestDigest: frozen.requestDigest,
  });
  scenario.recorder.packetDigests.push(packet.requestDigest);
  scenario.recorder.observe(
    "packetDigestMatchesFrozenRequest",
    packet.requestDigest === frozen.requestDigest &&
      packet.instruction === contract.instruction &&
      packet.structuredInputs.order_id?.kind === "text",
  );
  scenario.recorder.observe(
    "packetOmitsBrainChatAndCredentials",
    !JSON.stringify(packet).toLowerCase().includes("brain") &&
      !JSON.stringify(packet).toLowerCase().includes("chat_transcript") &&
      !JSON.stringify(packet).toLowerCase().includes("postgres://") &&
      !JSON.stringify(packet).includes("provider-secret"),
  );

  const expanded = humanTaskContract({
    instruction: `${contract.instruction} plus leaked postgres://user:pass@db/zoen`,
  });
  scenario.recorder.kill(
    "packetIncludesFullTenantContext",
    sha256(encodeContract(expanded)) !== frozen.requestDigest,
  );

  const forbidden = await commitEffect(
    scenario.actionA,
    scenario.fixture,
    "packet-forbidden",
  );
  await freezeHumanPayload(scenario.admin, forbidden.effectRequestId, {
    ...contract,
    structuredInputs: {
      database_url: { kind: "text", value: "postgres://secret" },
    },
  });
  await expectConnectCode(
    () =>
      scenario.effectHumanA.claimAttempt({
        adapterExecutionId: `human-claim.forbidden.${forbidden.effectRequestId}`,
        effectRequestId: forbidden.effectRequestId,
      }),
    Code.PermissionDenied,
  );
  scenario.recorder.observe("forbiddenCredentialPayloadRejected", true);

  return {
    effectRequestId: committed.effectRequestId,
    requestDigest: frozen.requestDigest,
  };
}
