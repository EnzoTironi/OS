import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFastPath,
  isStatusPhrase,
  pickStatusPhrase,
} from "./fast-path.js";

test("closing acknowledgments classify as simple_ack in pt and en", () => {
  for (const text of [
    "valeu",
    "Valeu!",
    "vlw",
    "obrigado",
    "obrigada",
    "de nada",
    "ok",
    "okay",
    "show",
    "thanks",
    "thank you",
    "ty",
  ]) {
    assert.deepEqual(classifyFastPath(text), { kind: "simple_ack" }, text);
  }
});

test("empty and non-ack text always continues to Tier 2", () => {
  assert.deepEqual(classifyFastPath(""), { intent: "generic", kind: "continue" });
  assert.deepEqual(classifyFastPath("   "), {
    intent: "generic",
    kind: "continue",
  });
  assert.deepEqual(classifyFastPath("oi"), {
    intent: "generic",
    kind: "continue",
  });
});

test("note, remind, and lookup keywords name the coarse intent", () => {
  assert.deepEqual(classifyFastPath("anota que o pão acabou"), {
    intent: "note",
    kind: "continue",
  });
  assert.deepEqual(classifyFastPath("me lembra do dentista amanhã"), {
    intent: "remind",
    kind: "continue",
  });
  assert.deepEqual(classifyFastPath("quanto ficou a cotação"), {
    intent: "lookup",
    kind: "continue",
  });
  assert.deepEqual(classifyFastPath("remind me to call back"), {
    intent: "remind",
    kind: "continue",
  });
  assert.deepEqual(classifyFastPath("how much is the order"), {
    intent: "lookup",
    kind: "continue",
  });
});

test("status phrases are deterministic and distinct per intent", () => {
  assert.equal(pickStatusPhrase("pt", "lookup"), "vendo");
  assert.equal(pickStatusPhrase("pt", "note"), "anotando");
  assert.equal(pickStatusPhrase("pt", "remind"), "agendando");
  assert.equal(pickStatusPhrase("pt", "generic"), "um seg");
  assert.equal(pickStatusPhrase("en", "lookup"), "looking");
  assert.equal(pickStatusPhrase("en", "note"), "noting");
  assert.equal(pickStatusPhrase("en", "remind"), "scheduling");
  assert.equal(pickStatusPhrase("en", "generic"), "one sec");
  assert.equal(pickStatusPhrase("pt", "lookup"), pickStatusPhrase("pt", "lookup"));
});

test("isStatusPhrase recognizes only the four phrases for a locale", () => {
  for (const phrase of ["vendo", "anotando", "agendando", "um seg"]) {
    assert.equal(isStatusPhrase(phrase, "pt"), true);
  }
  assert.equal(isStatusPhrase("looking", "pt"), false);
  assert.equal(isStatusPhrase("vendo", "en"), false);
  assert.equal(isStatusPhrase("qualquer coisa", "pt"), false);
});

test("classification is a synchronous, sub-millisecond fast path", () => {
  const samples = [
    "valeu",
    "quanto ficou a cotação",
    "me lembra do dentista amanhã",
    "anota que o pão acabou",
    "oi, bom dia, como vai você hoje",
  ];
  const startedAt = performance.now();
  for (let i = 0; i < 10_000; i++) {
    for (const sample of samples) {
      classifyFastPath(sample);
    }
  }
  const elapsedMs = performance.now() - startedAt;
  assert.ok(
    elapsedMs < 500,
    `50k classifications took ${elapsedMs}ms, expected a deterministic fast path well under 500ms`,
  );
});
