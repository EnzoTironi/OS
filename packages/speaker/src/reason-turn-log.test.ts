import assert from "node:assert/strict";
import test from "node:test";
import {
  emitReasonTurnLog,
  REASON_TURN_LOG_KEYS,
  type ReasonTurnFacts,
  type ReasonTurnLog,
} from "./reason-turn-log.js";

const facts: ReasonTurnFacts = {
  attemptId: "ck:att",
  bubbleCount: 1,
  errorClass: null,
  generate: "ok",
  generateMs: 4,
  hasMemory: false,
  hasWorld: false,
  hrefHost: "zoen.tironi.xyz",
  hrefPath: "/approve/e",
  hrefPresent: true,
  hrefSource: "mint",
  model: "hy3-free",
  path: "spoke",
  recordCount: 2,
  rivals: 0,
  tools: ["mint_href"],
};

test("emitReasonTurnLog spreads facts and statusFired without hand-copied keys", () => {
  const chunks: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof original;
  try {
    emitReasonTurnLog({ ...facts, statusFired: true });
  } finally {
    process.stderr.write = original;
  }
  const parsed = JSON.parse(chunks.join("").trim()) as ReasonTurnLog;
  assert.deepEqual(Object.keys(parsed).sort(), [...REASON_TURN_LOG_KEYS].sort());
  assert.equal(parsed.event, "reasonTurn");
  assert.equal(parsed.attemptId, "ck:att");
  assert.equal(parsed.statusFired, true);
  assert.equal(parsed.model, "hy3-free");
  assert.deepEqual(parsed.tools, ["mint_href"]);
  assert.equal(parsed.hrefPath, "/approve/e");
  assert.equal(JSON.stringify(parsed).includes("token"), false);
});

test("REASON_TURN_LOG_KEYS is the stable emitted contract", () => {
  assert.deepEqual([...REASON_TURN_LOG_KEYS].sort(), [
    "attemptId",
    "bubbleCount",
    "errorClass",
    "event",
    "generate",
    "generateMs",
    "hasMemory",
    "hasWorld",
    "hrefHost",
    "hrefPath",
    "hrefPresent",
    "hrefSource",
    "model",
    "path",
    "recordCount",
    "rivals",
    "statusFired",
    "tools",
  ]);
});
