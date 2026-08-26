import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canonicalizeJsonBytes, sha256Hex } from "./jcs.js";
import {
  conversationContextHash,
  createConversationContextRecord,
  sealConversationContextDocument,
  type ConversationContextDocument,
} from "./context-document.js";

const fixtureDir = path.join(
  process.cwd(),
  "testdata",
  "jcs",
  "zoen",
);

function sampleDocument(): ConversationContextDocument {
  const instruction = createConversationContextRecord({
    attribution: {
      kind: "onboard",
      tokenHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    payload: { kind: "interaction", locale: "pt", type: "instruction" },
    retention: "interaction",
    scope: { conversationKey: "ck_fixture", kind: "conversation" },
    trustClass: "instruction",
  });
  const inbound = createConversationContextRecord({
    attribution: { interactionId: "ixn_fixture", kind: "interaction" },
    payload: { kind: "text", text: "oi", type: "interaction" },
    retention: "interaction",
    scope: { conversationKey: "ck_fixture", kind: "conversation" },
    trustClass: "interaction",
  });
  return sealConversationContextDocument({
    audienceKind: "dm",
    attemptId: "att_fixture",
    carryForwardInteractionIds: [],
    claimedInteractionIds: ["ixn_fixture"],
    conversationKey: "ck_fixture",
    dropped: [],
    failures: [],
    records: [inbound, instruction],
    schema: "zoen.conversation.context.v1",
    validAt: "2026-08-26T15:00:00.000Z",
  });
}

test("conversation context hash is stable JCS SHA-256 and matches the shared fixture", () => {
  const document = sampleDocument();
  const hash = conversationContextHash(document);
  assert.match(hash, /^[0-9a-f]{64}$/);
  const raw = readFileSync(
    path.join(fixtureDir, "conversation-context.json"),
    "utf8",
  );
  const fixture = JSON.parse(raw) as ConversationContextDocument;
  assert.equal(conversationContextHash(fixture), hash);
  const pinned = readFileSync(
    path.join(fixtureDir, "conversation-context.sha256"),
    "utf8",
  ).trim();
  assert.equal(hash, pinned);
  const canonical = canonicalizeJsonBytes(Buffer.from(raw, "utf8"));
  assert.equal(
    readFileSync(path.join(fixtureDir, "conversation-context.jcs"), "utf8"),
    canonical,
  );
});

test("key permutation of a sealed document does not change contextHash", () => {
  const document = sampleDocument();
  const permuted = JSON.parse(
    JSON.stringify({
      validAt: document.validAt,
      schema: document.schema,
      records: document.records,
      failures: document.failures,
      dropped: document.dropped,
      conversationKey: document.conversationKey,
      claimedInteractionIds: document.claimedInteractionIds,
      carryForwardInteractionIds: document.carryForwardInteractionIds,
      attemptId: document.attemptId,
      audienceKind: document.audienceKind,
    }),
  ) as ConversationContextDocument;
  assert.equal(
    conversationContextHash(document),
    conversationContextHash(permuted),
  );
});

test("omitted fields are not the same as explicit null for contextHash", () => {
  const document = sampleDocument();
  const hash = conversationContextHash(document);
  const withNull = JSON.parse(
    JSON.stringify({ ...document, extra: null }),
  ) as ConversationContextDocument & { extra: null };
  assert.throws(() => conversationContextHash(withNull));
  const stringifyDigest = sha256Hex(JSON.stringify(document));
  assert.notEqual(hash, stringifyDigest);
});

test("memory_text is rejected on conversation context", () => {
  const document = sampleDocument();
  const mutant = {
    ...document,
    memory_text: "blob",
  };
  assert.throws(() => conversationContextHash(mutant));
});
