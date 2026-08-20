import assert from "node:assert/strict";
import test from "node:test";
import { receiptMatchesExpectedCommit } from "./zoen.js";

const command = {
  actionId: "inventory.requestStock",
  intentDigest: "a".repeat(64),
  operationId: "operation.1",
  proposalId: "proposal.1",
};

test("operation recovery accepts only the expected Action receipt", () => {
  assert.equal(receiptMatchesExpectedCommit(command, command), true);
  for (const receipt of [
    { ...command, actionId: "inventory.other" },
    { ...command, intentDigest: "b".repeat(64) },
    { ...command, operationId: "operation.other" },
    { ...command, proposalId: "proposal.other" },
  ]) {
    assert.equal(receiptMatchesExpectedCommit(receipt, command), false);
  }
});
