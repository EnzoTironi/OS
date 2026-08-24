import assert from "node:assert/strict";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import { ActionInputSchema } from "../../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { ExactValueSchema } from "../../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { resourceId, textInput } from "../../governed-action/support.js";
import {
  commitHumanEffect,
  encodeContract,
  expectConnectCode,
  humanExecutorActionId,
  projectPacket,
  sha256,
  type HumanScenario,
} from "../scenario.js";

export async function verifyPacketMinimal(scenario: HumanScenario): Promise<{
  effectRequestId: string;
  requestDigest: string;
}> {
  const committed = await commitHumanEffect(
    scenario.actionA,
    scenario.effectA,
    scenario.fixture,
    "packet-minimal",
  );
  const claim = await scenario.effectHumanA.claimAttempt({
    adapterExecutionId: `human-claim.packet.${committed.effectRequestId}`,
    effectRequestId: committed.effectRequestId,
  });
  assert.ok(claim.claim?.request);
  assert.equal(claim.claim.request.requestDigest, committed.requestDigest);
  const packet = projectPacket({
    attemptId: claim.claim.attemptId,
    contract: committed.contract,
    effectRequestId: committed.effectRequestId,
    requestDigest: committed.requestDigest,
  });
  scenario.recorder.packetDigests.push(packet.requestDigest);
  scenario.recorder.observe(
    "packetDigestMatchesFrozenRequest",
    packet.requestDigest === committed.requestDigest &&
      packet.instruction === committed.contract.instruction &&
      packet.structuredInputs.order_id?.kind === "text",
  );
  scenario.recorder.observe(
    "packetOmitsBrainChatAndCredentials",
    !JSON.stringify(packet).toLowerCase().includes("brain") &&
      !JSON.stringify(packet).toLowerCase().includes("chat_transcript") &&
      !JSON.stringify(packet).toLowerCase().includes("postgres://") &&
      !JSON.stringify(packet).includes("provider-secret"),
  );
  scenario.recorder.observe(
    "commitMintedHumanTaskContract",
    committed.contract.executorClass === "human_executor" &&
      committed.payload.length > 0 &&
      committed.requestDigest.length === 64,
  );

  const expanded = {
    ...committed.contract,
    instruction: `${committed.contract.instruction} plus leaked postgres://user:pass@db/zoen`,
  };
  scenario.recorder.kill(
    "packetIncludesFullTenantContext",
    sha256(encodeContract(expanded)) !== committed.requestDigest,
  );

  const operationId = "operation.human.packet-forbidden";
  const proposalId = "proposal.human.packet-forbidden";
  const proposed = await scenario.actionA.propose({
    actionId: humanExecutorActionId,
    definition: scenario.fixture.definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      create(ActionInputSchema, {
        inputId: "quantity",
        value: create(ExactValueSchema, {
          value: { case: "integerValue", value: "1" },
        }),
      }),
      textInput(
        "instruction",
        "Collect wet signature plus leaked postgres://user:pass@db/zoen",
      ),
      textInput("order_id", "order.forbidden"),
    ],
    operationId,
    proposalId,
    resourceId,
    validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
  });
  assert.ok(proposed.proposal);
  await expectConnectCode(
    () => scenario.actionA.commit({ operationId, proposalId }),
    Code.FailedPrecondition,
  );
  scenario.recorder.observe("forbiddenCredentialPayloadRejected", true);

  return {
    effectRequestId: committed.effectRequestId,
    requestDigest: committed.requestDigest,
  };
}
