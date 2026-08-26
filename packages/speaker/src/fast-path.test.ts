import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyStatusIntent,
  dropLeadingStatusPhrase,
  isStatusPhrase,
  pickStatusPhrase,
} from "./fast-path.js";

test("acknowledgments continue as generic so Tier 2 still runs", () => {
  for (const text of [
    "valeu",
    "Valeu!",
    "ok",
    "okay",
    "show",
    "thanks",
    "obrigado",
  ]) {
    assert.equal(classifyStatusIntent(text), "generic", text);
  }
});

test("empty and unmatched text is generic", () => {
  assert.equal(classifyStatusIntent(""), "generic");
  assert.equal(classifyStatusIntent("   "), "generic");
  assert.equal(classifyStatusIntent("oi"), "generic");
});

test("note, remind, and lookup keywords name the coarse intent", () => {
  assert.equal(classifyStatusIntent("anota que o pão acabou"), "note");
  assert.equal(classifyStatusIntent("me lembra do dentista amanhã"), "remind");
  assert.equal(classifyStatusIntent("quanto ficou a cotação"), "lookup");
  assert.equal(classifyStatusIntent("remind me to call back"), "remind");
  assert.equal(classifyStatusIntent("how much is the order"), "lookup");
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

test("dropLeadingStatusPhrase removes only an exact leading phrase", () => {
  assert.deepEqual(dropLeadingStatusPhrase(["vendo", "ficou 12"], "pt"), [
    "ficou 12",
  ]);
  assert.deepEqual(dropLeadingStatusPhrase(["vendo, ficou 12"], "pt"), [
    "vendo, ficou 12",
  ]);
  assert.deepEqual(dropLeadingStatusPhrase(["ficou 12"], "pt"), ["ficou 12"]);
});

test("classification is a synchronous, sub-millisecond path", () => {
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
      classifyStatusIntent(sample);
    }
  }
  const elapsedMs = performance.now() - startedAt;
  assert.ok(
    elapsedMs < 500,
    `50k classifications took ${elapsedMs}ms, expected a deterministic path well under 500ms`,
  );
});
