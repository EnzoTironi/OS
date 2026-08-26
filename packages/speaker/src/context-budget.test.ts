import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConversationBudget,
  DEFAULT_DATA_TOKEN_BUDGET,
  estimateDataTokens,
} from "./context-budget.js";
import { createConversationContextRecord } from "./context-document.js";

function instruction() {
  return createConversationContextRecord({
    attribution: {
      kind: "onboard",
      tokenHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    payload: { kind: "interaction", locale: "pt", type: "instruction" },
    retention: "interaction",
    scope: { conversationKey: "ck_budget", kind: "conversation" },
    trustClass: "instruction",
  });
}

function interaction(id: string, text: string) {
  return createConversationContextRecord({
    attribution: { interactionId: id, kind: "interaction" },
    payload: { kind: "text", text, type: "interaction" },
    retention: "interaction",
    scope: { conversationKey: "ck_budget", kind: "conversation" },
    trustClass: "interaction",
  });
}

function knowledge(text: string) {
  return createConversationContextRecord({
    attribution: {
      actualCommitSequence: "1",
      definitionDigest: "c".repeat(64),
      kind: "query",
      resultDigest: "d".repeat(64),
    },
    payload: { admitted: false, text, type: "knowledge" },
    retention: "preference",
    scope: { kind: "tenant", tenantId: "tenant.a" },
    trustClass: "knowledge",
  });
}

function personal(body: string, sequence: string) {
  return createConversationContextRecord({
    attribution: {
      actualCommitSequence: sequence,
      definitionDigest: "e".repeat(64),
      kind: "query",
      resultDigest: "f".repeat(64),
    },
    payload: { body, type: "personal_memory" },
    retention: "preference",
    scope: {
      kind: "principal",
      principalId: "principal.a",
      tenantId: "tenant.a",
    },
    trustClass: "personal_memory",
  });
}

function world(notes: string[], rivals: string[]) {
  return createConversationContextRecord({
    attribution: {
      actualCommitSequence: "0",
      definitionDigest: "1".repeat(64),
      kind: "query",
      resultDigest: "2".repeat(64),
    },
    payload: {
      notes,
      rivals: rivals.map((label) => ({ label })),
      type: "world",
    },
    retention: "authority",
    scope: { kind: "tenant", tenantId: "tenant.a" },
    trustClass: "world",
  });
}

test("default data budget is 6000 and instructions are outside the quota", () => {
  assert.equal(DEFAULT_DATA_TOKEN_BUDGET, 6000);
  const hugeInstruction = instruction();
  const result = applyConversationBudget({
    budget: 0,
    carryForwardInteractionIds: [],
    claimedInteractionIds: ["ixn_now"],
    records: [hugeInstruction, interaction("ixn_now", "oi")],
  });
  assert.equal(
    result.records.some((record) => record.trustClass === "instruction"),
    true,
  );
  assert.equal(
    result.records.some(
      (record) =>
        record.attribution.kind === "interaction" &&
        record.attribution.interactionId === "ixn_now",
    ),
    true,
  );
});

test("budget drops knowledge, then carry-forward text, then personal memory, then world notes", () => {
  const carry = interaction("ixn_old", "x".repeat(80));
  const claimed = interaction("ixn_now", "claimed inbound stays");
  const result = applyConversationBudget({
    budget: 8,
    carryForwardInteractionIds: ["ixn_old"],
    claimedInteractionIds: ["ixn_now"],
    records: [
      instruction(),
      claimed,
      carry,
      knowledge("k".repeat(80)),
      personal("m".repeat(80), "1"),
      world(["n".repeat(80)], ["source.sheet", "source.erp"]),
    ],
  });
  assert.equal(
    result.records.some((record) => record.trustClass === "knowledge"),
    false,
  );
  const keptCarry = result.records.find(
    (record) =>
      record.attribution.kind === "interaction" &&
      record.attribution.interactionId === "ixn_old",
  );
  assert.ok(keptCarry);
  assert.equal(keptCarry.payload.type, "interaction");
  if (keptCarry.payload.type === "interaction") {
    assert.equal(keptCarry.payload.text, undefined);
  }
  assert.equal(
    result.records.some((record) => record.trustClass === "personal_memory"),
    false,
  );
  const keptWorld = result.records.find(
    (record) => record.trustClass === "world",
  );
  assert.ok(keptWorld);
  assert.equal(keptWorld.payload.type, "world");
  if (keptWorld.payload.type === "world") {
    assert.deepEqual(keptWorld.payload.notes, []);
    assert.deepEqual(
      keptWorld.payload.rivals.map((rival) => rival.label),
      ["source.sheet", "source.erp"],
    );
  }
  const keptClaimed = result.records.find(
    (record) =>
      record.attribution.kind === "interaction" &&
      record.attribution.interactionId === "ixn_now",
  );
  assert.ok(keptClaimed);
  assert.equal(keptClaimed.payload.type, "interaction");
  if (keptClaimed.payload.type === "interaction") {
    assert.equal(keptClaimed.payload.text, "claimed inbound stays");
  }
  assert.ok(result.dropped.every((drop) => drop.reason === "budget"));
});

test("token estimate is ceil(chars / 4)", () => {
  assert.equal(estimateDataTokens(0), 0);
  assert.equal(estimateDataTokens(1), 1);
  assert.equal(estimateDataTokens(4), 1);
  assert.equal(estimateDataTokens(5), 2);
});
