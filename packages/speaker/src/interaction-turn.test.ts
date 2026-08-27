import assert from "node:assert/strict";
import test from "node:test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import type { ClaimRead } from "../../osdk/src/index.js";
import { LineageRole } from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  WAIT_TOOL_DESCRIPTION,
  createInteractionScratch,
  createInteractionTools,
} from "./interaction-tools.js";
import type { SpeakerActionClient } from "./osdk-action-client.js";
import {
  firstContactAddendum,
  firstContactInstructions,
  interactionInstructions,
  outboundBubbles,
  reasoningPrompt,
  runFirstContactTurn,
  runInteractionTurn,
  type InteractionInbound,
  type OutboundTurn,
  type ReasonTurnGenerate,
  type ReasonTurnPath,
} from "./interaction-turn.js";
import {
  conversationKeyFrom,
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
} from "./brands.js";
import type { ConversationContextAssembler } from "./context-assembler.js";
import { createMemoryTurnStore } from "./turn-store.js";
import type { TrustedInteractionContext } from "./types.js";
import {
  snapshotFromClaims,
  type WorldQueryClient,
} from "./world-query.js";

function membership(suffix: string): TrustedInteractionContext {
  return {
    accountId: "account.wa.enzo",
    actorId: "actor.personal",
    bindingId: "binding.wa.enzo",
    channel: {
      provider: providerKey("whatsapp"),
      providerUser: providerUserRef("553199941160@s.whatsapp.net"),
      receivedAt: "2026-08-25T02:28:12.000Z",
      thread: providerThreadRef(`553199941160@s.whatsapp.net:${suffix}`),
    },
    membershipId: "membership.wa.enzo",
    principalId: principalIdString("principal.wa.enzo"),
    tenantId: tenantIdString("tenant.wa.enzo"),
    workloadId: "workload.personal",
  };
}

function groupMembership(suffix: string): TrustedInteractionContext {
  const thread = providerThreadRef(`120363-group@g.us:${suffix}`);
  return {
    ...membership(suffix),
    channel: {
      ...membership(suffix).channel,
      group: { thread },
      thread,
    },
  };
}

function textInbound(text: string): InteractionInbound {
  return { kind: "text", text };
}

function usage() {
  return {
    inputTokens: {
      cacheRead: 0,
      cacheWrite: 0,
      noCache: 1,
      total: 1,
    },
    outputTokens: { reasoning: 0, text: 1, total: 1 },
  };
}

test("PT inbound does not contain Recebi", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("Oi"),
    membership: membership("oi"),
  });
  assert.ok(result.bubbles.length >= 1);
  assert.equal(result.href, null);
  for (const bubble of result.bubbles) {
    assert.doesNotMatch(bubble, /Recebi/i);
    assert.doesNotMatch(bubble, /membership\.wa\.enzo/);
  }
  assert.equal(outboundBubbles(result).join("\n").includes("Recebi"), false);
  assert.deepEqual(result.bubbles, ["não consegui consultar agora"]);
  assertReasonTurn(result, "noModel", 0, "ok");
});

test("empty inbound does not dump entity ids", async () => {
  const world: WorldQueryClient = {
    async semanticQuery() {
      return {
        entityIds: ["commercial.order-line.dirty-quote", "entity.hidden.1"],
        notes: ["commercial.order-line.dirty-quote"],
        rivals: [{ label: "commercial.order-line.dirty-quote" }],
      };
    },
  };
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound(""),
    membership: membership("empty"),
    world,
  });
  const text = outboundBubbles(result).join("\n");
  assert.doesNotMatch(text, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(text, /entity\.hidden\.1/);
  assert.doesNotMatch(text, /membership\.wa\.enzo/);
  assert.doesNotMatch(text, /Recebi/i);
  assert.equal(result.href, null);
  assert.deepEqual(result.bubbles, ["não consegui consultar agora"]);
  assertReasonTurn(result, "noModel", 1, "ok");
});

test("media inbound stays PT and does not dump entity ids", async () => {
  const world: WorldQueryClient = {
    async semanticQuery() {
      return {
        entityIds: ["commercial.order-line.dirty-quote"],
        notes: ["commercial.order-line.dirty-quote"],
        rivals: [],
      };
    },
  };
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: { kind: "media", mediaRef: "wa-media-1", mime: "image/jpeg" },
    membership: membership("media"),
    world,
  });
  const text = outboundBubbles(result).join("\n");
  assert.ok(result.bubbles.length >= 1);
  assert.equal(result.href, null);
  assert.doesNotMatch(text, /Recebi/i);
  assert.doesNotMatch(text, /commercial\.order-line\.dirty-quote/);
  assert.deepEqual(result.bubbles, ["não consegui consultar agora"]);
  assertReasonTurn(result, "noModel", 0, "ok");
});

test("no model with two World rivals is fail copy, not host rival speech", async () => {
  const snapshot = snapshotFromClaims(supportingQuantityClaims());
  assert.ok(snapshot.rivals.length >= 2);
  const world: WorldQueryClient = {
    async semanticQuery() {
      return snapshot;
    },
  };
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("Quanto ficou?"),
    membership: membership("supporting-rivals"),
    world,
  });
  const text = outboundBubbles(result).join("\n");
  assert.deepEqual(result.bubbles, ["não consegui consultar agora"]);
  assert.doesNotMatch(text, /Tem mais de uma leitura/);
  assert.doesNotMatch(text, /source\.sheet|source\.erp/);
  assert.doesNotMatch(text, /Recebi/i);
  assert.doesNotMatch(text, /commercial\.order-line\.dirty-quote/);
  assertReasonTurn(result, "noModel", snapshot.rivals.length, "ok");
});

test("PT instructions ban helpdesk greetings and keep speak_to_user as the only voice", () => {
  const instructions = interactionInstructions("pt");
  assert.match(instructions, /speak_to_user/);
  assert.match(instructions, /execution nunca fala/i);
  assert.match(instructions, /Como posso te auxiliar/);
  assert.match(instructions, /Estou por aqui e pronto para ajudar/);
  assert.match(instructions, /Recebi/);
  assert.match(instructions, /\bwait\b/);
  assert.match(instructions, /nunca fale proposal/);
  assert.doesNotMatch(instructions, /Mastra|LangGraph/);
  assert.doesNotMatch(instructions, /ficar quieto|stay quiet/i);
  assert.doesNotMatch(instructions, /—/);
  assert.doesNotMatch(interactionInstructions("en"), /ficar quieto|stay quiet/i);
  assert.doesNotMatch(interactionInstructions("en"), /—/);
  assert.doesNotMatch(interactionInstructions("en"), /Mastra|LangGraph/);
  assert.doesNotMatch(instructions, /vendo|anotando|agendando|um seg/);
  assert.doesNotMatch(interactionInstructions("en"), /looking|noting|scheduling|one sec/);
});

test("reasoningPrompt is labeled projection data, not a World wrapper", () => {
  const data = [
    "trustClass: world",
    "attribution: query",
    "rivals:",
    "- source.sheet",
    "- source.erp",
    "notes:",
    "- 10 each",
    "- 12 each",
  ].join("\n");
  const prompt = reasoningPrompt(data);
  assert.equal(prompt, data);
  assert.doesNotMatch(prompt, /O World abaixo é o assunto/);
  assert.doesNotMatch(prompt, /^\s*\{/u);
  assert.match(prompt, /source\.sheet/);
  assert.match(prompt, /source\.erp/);
  assert.match(prompt, /10 each/);
  assert.match(prompt, /12 each/);
});

test("empty-world prompt answers greetings; wait description forbids greetings", () => {
  const data = "trustClass: interaction\nkind: text\ntext: oi";
  assert.equal(reasoningPrompt(data), data);
  assert.doesNotMatch(data, /Não cumprimente no lugar de responder/);
  assert.doesNotMatch(data, /Nunca wait/);

  const pt = interactionInstructions("pt");
  const en = interactionInstructions("en");
  assert.match(pt, /speak_to_user/);
  assert.match(pt, /nunca wait/);
  assert.match(en, /speak_to_user/);
  assert.match(en, /never wait/);
  assert.match(pt, /oi, e aí, fala, hi, hey: speak_to_user\. nunca wait/);
  assert.match(en, /oi, e aí, fala, hi, hey: speak_to_user\. never wait/);

  assert.match(
    WAIT_TOOL_DESCRIPTION,
    /Use only for thanks, ok, show, valeu, or obrigado/,
  );
  assert.match(
    WAIT_TOOL_DESCRIPTION,
    /Never for greetings \(oi, e aí, hi, hey, fala\)/,
  );
  assert.doesNotMatch(WAIT_TOOL_DESCRIPTION, /other closing inbound/);
  const tools = createInteractionTools(createInteractionScratch());
  assert.equal(tools.wait?.description, WAIT_TOOL_DESCRIPTION);
});

test("mocked turn with two World rivals speaks the readings, not a helpdesk greeting", async () => {
  const snapshot = snapshotFromClaims(supportingQuantityClaims());
  const world: WorldQueryClient = {
    async semanticQuery() {
      return snapshot;
    },
  };
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      step += 1;
      if (step === 1) {
        const blob = flattenPrompt(options.prompt);
        assert.match(blob, /trustClass: world/);
        assert.match(blob, /source\.sheet/);
        assert.match(blob, /source\.erp/);
        const text = /trustClass: world/i.test(blob)
          ? "Tem duas leituras: 10 each e 12 each. As duas ficam de pé."
          : "Olá! Estou por aqui e pronto para ajudar. Como posso te auxiliar hoje?";
        return {
          content: [
            {
              input: JSON.stringify({ text }),
              toolCallId: "call_speak",
              toolName: "speak_to_user",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        } satisfies LanguageModelV3GenerateResult;
      }
      return {
        content: [],
        finishReason: { raw: "stop", unified: "stop" },
        usage: usage(),
        warnings: [],
      } satisfies LanguageModelV3GenerateResult;
    },
  });
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("Oi"),
    membership: membership("rivals-model"),
    model,
    world,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.match(sent, /10 each/);
  assert.match(sent, /12 each/);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|Recebi/i);
  assert.doesNotMatch(sent, /commercial\.order-line\.dirty-quote/);
  assertReasonTurn(result, "spoke", snapshot.rivals.length, "ok");
});

test("empty inbound with a silent model waits (empty bubbles)", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound(""),
    membership: membership("wait"),
    model: silentStopModel(),
    world: twoRivalWorld(),
  });
  assert.deepEqual(result.bubbles, []);
  assert.equal(result.href, null);
  assert.deepEqual(outboundBubbles(result), []);
  assertReasonTurn(result, "wait", 2, "ok");
});

test("silent model with two World rivals fail-closes lookup copy, not rival speech", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("quanto ficou a cotacao"),
    membership: membership("silent-rivals"),
    model: silentStopModel(),
    world: twoRivalWorld(),
  });
  const sent = outboundBubbles(result).join("\n");
  assert.deepEqual(result.bubbles, ["não consegui consultar agora"]);
  assert.doesNotMatch(sent, /Tem mais de uma leitura/);
  assert.doesNotMatch(sent, /10 each|12 each/);
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|How can I help/i);
  assert.doesNotMatch(sent, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(sent, /Tenta de novo/i);
  assertReasonTurn(result, "lookupFail", 2, "ok");
});

test("spawn_execution with injected executeWork records executionNotes and does not leak them into bubbles", async () => {
  const status = "status: workbench counted rivals";
  const scratch = createInteractionScratch();
  const tools = createInteractionTools(scratch, {
    executeWork: async (task) => {
      assert.equal(task, "contar rivais");
      return status;
    },
  });
  const spawn = tools.spawn_execution;
  const speak = tools.speak_to_user;
  assert.ok(spawn?.execute !== undefined);
  assert.ok(speak?.execute !== undefined);
  await spawn.execute(
    { task: "contar rivais" },
    { context: undefined, messages: [], toolCallId: "call_spawn" },
  );
  await speak.execute(
    { text: "Tem duas leituras e as duas ficam de pé." },
    { context: undefined, messages: [], toolCallId: "call_speak" },
  );
  assert.deepEqual(scratch.executionNotes, [status]);
  assert.deepEqual(scratch.bubbles, [
    "Tem duas leituras e as duas ficam de pé.",
  ]);
  assert.equal(scratch.bubbles.join("\n").includes(status), false);

  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ task: "contar rivais" }),
              toolCallId: "call_spawn",
              toolName: "spawn_execution",
              type: "tool-call",
            },
            {
              input: JSON.stringify({
                text: `${status}\nTem duas leituras e as duas ficam de pé.`,
              }),
              toolCallId: "call_speak",
              toolName: "speak_to_user",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        } satisfies LanguageModelV3GenerateResult;
      }
      return {
        content: [],
        finishReason: { raw: "stop", unified: "stop" },
        usage: usage(),
        warnings: [],
      } satisfies LanguageModelV3GenerateResult;
    },
  });
  const result = await runInteractionTurn({
    debounceMs: 0,
    executeWork: async () => status,
    inbound: textInbound("Quanto ficou o pedido?"),
    membership: membership("spawn"),
    model,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.match(sent, /leituras/);
  assert.doesNotMatch(sent, /status: workbench/);
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /spawn_execution/);
  assert.doesNotMatch(sent, /membership\.wa\.enzo/);
  assert.equal(sent.split("https://").length - 1, 0);
});

test("at most one href survives a double mint", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ url: "https://example.com/a" }),
              toolCallId: "call_href_1",
              toolName: "mint_href",
              type: "tool-call",
            },
            {
              input: JSON.stringify({ url: "https://example.com/b" }),
              toolCallId: "call_href_2",
              toolName: "mint_href",
              type: "tool-call",
            },
            {
              input: JSON.stringify({ text: "Segue o resumo." }),
              toolCallId: "call_speak",
              toolName: "speak_to_user",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        } satisfies LanguageModelV3GenerateResult;
      }
      return {
        content: [],
        finishReason: { raw: "stop", unified: "stop" },
        usage: usage(),
        warnings: [],
      } satisfies LanguageModelV3GenerateResult;
    },
  });
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("Oi"),
    membership: membership("href"),
    model,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(sent.split("https://").length - 1, 1);
  assert.ok(result.href instanceof URL);
  assert.equal(result.href.href, "https://example.com/a");
  assert.match(sent, /Segue o resumo/);
  assert.doesNotMatch(sent, /Recebi/i);
});

test("mocked oi is a short greeting, not helpdesk", async () => {
  let generated = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      generated += 1;
      if (generated === 1) {
        const blob = flattenPrompt(options.prompt);
        assert.match(blob, /speak_to_user/);
        assert.match(blob, /\bwait\b/);
        assert.doesNotMatch(blob, /Mastra|LangGraph/);
        return speakCall("oi");
      }
      return stopCall();
    },
  });
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("oi"),
    membership: membership("mocked-oi"),
    model,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(generated >= 1, true);
  assert.match(sent, /^oi$/im);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|How can I help|Recebi/i);
  assert.doesNotMatch(sent, STATUS_PHRASE_PT);
  assertReasonTurn(result, "spoke", 0, "ok");
});

test("valeu via wait tool stays empty, not a host-classified ack", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("valeu"),
    membership: membership("mocked-valeu"),
    model: waitThenStopModel(),
  });
  assert.deepEqual(result.bubbles, []);
  assert.equal(result.href, null);
  assert.deepEqual(outboundBubbles(result), []);
  assertReasonTurn(result, "wait", 0, "ok");
});

test("valeu generate throw stays silent, not consult fail copy", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("valeu"),
    membership: membership("valeu-threw"),
    model: throwOnGenerateModel(),
  });
  assertSilentThrow(result, 0);
});

test("valeu wait then generate throw stays silent, not consult fail copy", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("valeu"),
    membership: membership("valeu-wait-threw"),
    model: waitThenThrowModel(),
  });
  assertSilentThrow(result, 0);
});

test("wait tool produces no Recebi and no helpdesk", async () => {
  const scratch = createInteractionScratch();
  const tools = createInteractionTools(scratch);
  const wait = tools.wait;
  assert.ok(wait?.execute !== undefined);
  await wait.execute(
    {},
    { context: undefined, messages: [], toolCallId: "call_wait" },
  );
  assert.equal(scratch.waited, true);
  assert.equal(scratch.startedWork, false);
  assert.deepEqual(scratch.bubbles, []);
  assert.equal(scratch.href, undefined);
});

test("model-driven wait on a non-ack closing message stays empty, not a fast ack", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("pode fechar por aqui"),
    membership: membership("wait-tool"),
    model: waitThenStopModel(),
  });
  const sent = outboundBubbles(result).join("\n");
  assert.deepEqual(result.bubbles, []);
  assert.equal(sent, "");
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|How can I help/i);
  assertReasonTurn(result, "wait", 0, "ok");
});

test("reasonTurn writes one stderr JSON line from the turn result", async () => {
  const chunks: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
    );
    return true;
  }) as typeof original;
  let result: OutboundTurn;
  try {
    result = await runInteractionTurn({
      debounceMs: 0,
      inbound: textInbound("oi"),
      membership: membership("stderr-log"),
      model: speakThenStopModel("oi"),
    });
  } finally {
    process.stderr.write = original;
  }
  assertReasonTurn(result, "spoke", 0, "ok");
  const lines = chunks
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes('"event":"reasonTurn"'));
  assert.equal(lines.length, 1);
  assert.equal(
    lines[0],
    JSON.stringify({
      event: "reasonTurn",
      path: result.reasonTurn.path,
      rivals: result.reasonTurn.rivals,
      generate: result.reasonTurn.generate,
    }),
  );
});

test("slow wait stays silent", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("deixa que eu confirmo depois"),
    membership: membership("slow-wait"),
    model: delayedWaitModel(20),
  });
  assert.deepEqual(result.bubbles, []);
  assert.equal(result.href, null);
  assertReasonTurn(result, "wait", 0, "ok");
});

test("slow lookupFail does not prepend status", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("quanto ficou a cotacao"),
    membership: membership("slow-lookup"),
    model: delayedSilentModel(20),
    world: twoRivalWorld(),
  });
  assert.deepEqual(result.bubbles, ["não consegui consultar agora"]);
  assertReasonTurn(result, "lookupFail", 2, "ok");
});

test("speaker does not fold a status phrase into bubbles", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("oi"),
    membership: membership("no-status-fold"),
    model: delayedSpeakModel("ta aqui", 20),
  });
  assert.deepEqual(result.bubbles, ["ta aqui"]);
  assertReasonTurn(result, "spoke", 0, "ok");
});

test("Speaker speaks one bubble after a successful commit and fail-copies when commit fails", async () => {
  const committed: SpeakerActionClient = {
    async commitCreateReminder() {
      return {
        kind: "committed",
        operationId: "operation.remind",
        previewText: "Vou criar este lembrete para amanhã: dentista",
        recordIds: ["record.1"],
      };
    },
    async commitWriteMemory() {
      return {
        kind: "committed",
        operationId: "operation.note",
        previewText: "Vou guardar esta nota: pão",
        recordIds: ["record.1"],
      };
    },
  };
  const denied: SpeakerActionClient = {
    async commitCreateReminder() {
      return { kind: "denied", message: "commit denied" };
    },
    async commitWriteMemory() {
      return { kind: "denied", message: "commit denied" };
    },
  };

  const store = createMemoryTurnStore();
  const successCtx = membership("remind-ok");
  const success = await runInteractionTurn({
    debounceMs: 0,
    actions: committed,
    inbound: textInbound("me lembra do dentista amanhã"),
    membership: successCtx,
    model: writeThenSpeakModel("remind", "agendei o dentista"),
    store,
  });
  assert.deepEqual(success.bubbles, ["agendei o dentista"]);
  assert.doesNotMatch(success.bubbles.join("\n"), /não consegui/);
  assertReasonTurn(success, "spoke", 0, "ok");
  const successKey = conversationKeyFrom({
    accountId: successCtx.accountId,
    conversationId: `${String(successCtx.channel.provider)}:${String(successCtx.channel.thread)}`,
    tenantId: String(successCtx.tenantId),
    workspaceId: successCtx.workloadId,
  });
  const attempts = await store.listAttempts(successKey);
  const hashed = attempts.at(-1);
  assert.ok(hashed?.contextHash);
  assert.match(hashed.contextHash, /^[0-9a-f]{64}$/);
  assert.equal(hashed.contextDigest, hashed.contextHash);
  assert.ok(hashed.contextRef);
  assert.equal(hashed.contextRef, `${successKey}:${hashed.id}`);
  assert.ok(
    hashed.observedCommitRefs.some(
      (ref) =>
        ref.kind === "action" && ref.actionId === "personal.createReminder",
    ),
  );

  const failedNote = await runInteractionTurn({
    debounceMs: 0,
    actions: denied,
    inbound: textInbound("anota que o pão acabou"),
    membership: membership("note-fail"),
    model: writeThenSpeakModel("note", "anotei o pão"),
  });
  assert.deepEqual(failedNote.bubbles, ["não consegui anotar agora"]);
  assert.doesNotMatch(failedNote.bubbles.join("\n"), /anotei/);
  assertReasonTurn(failedNote, "spoke", 0, "ok");

  const failedRemind = await runInteractionTurn({
    debounceMs: 0,
    actions: denied,
    inbound: textInbound("me lembra do dentista amanhã"),
    membership: membership("remind-fail"),
    model: writeThenSpeakModel("remind", "agendei o dentista"),
  });
  assert.deepEqual(failedRemind.bubbles, ["não consegui agendar agora"]);
  assert.doesNotMatch(failedRemind.bubbles.join("\n"), /agendei/);
  assertReasonTurn(failedRemind, "spoke", 0, "ok");
});

test("first contact addendum never says unbound and generate mock is the spoken text", async () => {
  const addendum = firstContactAddendum("pt");
  assert.match(addendum, /pessoa desconhecida/);
  assert.match(addendum, /amigo afiado/);
  assert.match(addendum, /se disseram oi, só cumprimente/);
  assert.match(addendum, /nunca diga que/);
  const instructions = firstContactInstructions("pt");
  assert.ok(instructions.includes(interactionInstructions("pt")));
  assert.ok(instructions.includes(addendum));
  const href = "https://zoen.tironi.xyz/onboard/tok";
  const spoken = await runFirstContactTurn({
    generate: async (inboundText) => {
      assert.equal(inboundText, "oi");
      return "oi, entra quando quiser";
    },
    href,
    inboundText: "oi",
  });
  assert.equal(spoken.includes("oi, entra quando quiser"), true);
  assert.equal(spoken.includes(href), true);
  assert.doesNotMatch(spoken, /Este WhatsApp ainda não está vinculado/i);
});

test("first contact uses unbound assemble and never calls the bound assembler", async () => {
  let bound = 0;
  let unbound = 0;
  const assembler: ConversationContextAssembler = {
    async assembleBound() {
      bound += 1;
      throw new Error("bound assembler must not run on first contact");
    },
    async assembleUnbound(input) {
      unbound += 1;
      assert.equal(input.inbound.kind, "text");
      if (input.inbound.kind === "text") {
        assert.equal(input.inbound.text, "oi");
      }
      return {
        contextDigest: "a".repeat(64),
        contextRef: "unbound:unbound",
        document: {
          audienceKind: "unknown",
          attemptId: "unbound",
          carryForwardInteractionIds: [],
          claimedInteractionIds: [],
          conversationKey: "unbound",
          dropped: [],
          failures: [],
          records: [],
          schema: "zoen.conversation.context.v1",
          validAt: "2026-08-26T15:00:00.000Z",
        },
        projection: { data: "inbound: oi", instructions: "first" },
      };
    },
  };
  const spoken = await runFirstContactTurn({
    assembler,
    generate: async () => "oi",
    inboundText: "oi",
  });
  assert.equal(spoken, "oi");
  assert.equal(bound, 0);
  assert.equal(unbound, 1);
});

test("group audience refuses note and does not write personal memory", async () => {
  let writes = 0;
  const actions: SpeakerActionClient = {
    async commitCreateReminder() {
      writes += 1;
      return {
        kind: "committed",
        operationId: "operation.remind",
        previewText: "Vou criar este lembrete para amanhã: dentista",
        recordIds: ["record.1"],
      };
    },
    async commitWriteMemory() {
      writes += 1;
      return {
        kind: "committed",
        operationId: "operation.note",
        previewText: "Vou guardar esta nota: pão",
        recordIds: ["record.1"],
      };
    },
  };
  const result = await runInteractionTurn({
    actions,
    debounceMs: 0,
    inbound: textInbound("anota que o pão acabou"),
    membership: groupMembership("group-note"),
    model: writeThenSpeakModel("note", "anotei o pão"),
  });
  assert.equal(writes, 0);
  assert.deepEqual(result.bubbles, ["não consegui anotar agora"]);
  assert.doesNotMatch(result.bubbles.join("\n"), /anotei/);
});

test("request_external on WhatsApp phone mints an approve href, not onboard", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ boundary: "fiscal_issuance" }),
              toolCallId: "call_ext",
              toolName: "request_external",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        } satisfies LanguageModelV3GenerateResult;
      }
      if (step === 2) {
        return speakCall("abre o link pra confirmar");
      }
      return stopCall();
    },
  });
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("emite a nota"),
    membership: membership("fiscal"),
    model,
    publicWebOrigin: "https://zoen.tironi.xyz",
  });
  const sent = outboundBubbles(result).join("\n");
  assert.match(sent, /https:\/\/zoen\.tironi\.xyz\/approve\/external\.fiscal_issuance/);
  assert.doesNotMatch(sent, /\/onboard\//);
});

test("request_external with OIDC binding does not mint a login URL", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ boundary: "bank_access" }),
              toolCallId: "call_ext",
              toolName: "request_external",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        } satisfies LanguageModelV3GenerateResult;
      }
      if (step === 2) {
        return speakCall("vou olhar o banco");
      }
      return stopCall();
    },
  });
  const result = await runInteractionTurn({
    channelAssurance: "oidc_bound",
    debounceMs: 0,
    inbound: textInbound("abre o banco"),
    membership: membership("bank"),
    model,
    publicWebOrigin: "https://zoen.tironi.xyz",
  });
  const sent = outboundBubbles(result).join("\n");
  assert.doesNotMatch(sent, /\/onboard\/|\/approve\/external\./);
  assert.match(sent, /vou olhar o banco/);
});

test("note tool does not mint a login URL", async () => {
  const scratch = createInteractionScratch();
  const tools = createInteractionTools(scratch, {
    publicWebOrigin: "https://zoen.tironi.xyz",
  });
  const note = tools.note;
  assert.ok(note?.execute !== undefined);
  await note.execute(
    { body: "leite" },
    { context: undefined, messages: [], toolCallId: "call_note" },
  );
  assert.equal(scratch.href, undefined);
});

test("generate throw stays silent, not consult or rival speech", async () => {
  const result = await runInteractionTurn({
    debounceMs: 0,
    inbound: textInbound("quanto ficou a cotacao"),
    membership: membership("threw"),
    model: throwOnGenerateModel(),
    world: twoRivalWorld(),
  });
  const sent = outboundBubbles(result).join("\n");
  assertSilentThrow(result, 2);
  assert.doesNotMatch(sent, /Tem mais de uma leitura/);
  assert.doesNotMatch(sent, /10 each|12 each/);
});

function silentStopModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () =>
      ({
        content: [],
        finishReason: { raw: "stop", unified: "stop" },
        usage: usage(),
        warnings: [],
      }) satisfies LanguageModelV3GenerateResult,
  });
}

function twoRivalWorld(): WorldQueryClient {
  return {
    async semanticQuery() {
      return {
        entityIds: ["commercial.order-line.dirty-quote"],
        notes: ["10 each", "12 each"],
        rivals: [{ label: "10 each" }, { label: "12 each" }],
      };
    },
  };
}

function throwOnGenerateModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error("generate failed");
    },
  });
}

function waitThenThrowModel(): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return waitCall();
      }
      throw new Error("generate failed after wait");
    },
  });
}

function waitThenStopModel(): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return waitCall();
      }
      return stopCall();
    },
  });
}

function writeThenSpeakModel(
  kind: "note" | "remind",
  spoken: string,
): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input:
                kind === "note"
                  ? JSON.stringify({ body: "o pão acabou" })
                  : JSON.stringify({
                      body: "dentista",
                      dueAt: "amanhã 15h",
                    }),
              toolCallId: `call_${kind}`,
              toolName: kind,
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        } satisfies LanguageModelV3GenerateResult;
      }
      if (step === 2) {
        return speakCall(spoken);
      }
      return stopCall();
    },
  });
}

function speakThenStopModel(text: string): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return speakCall(text);
      }
      return stopCall();
    },
  });
}

function delayedWaitModel(ms: number): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        await delay(ms);
        return waitCall();
      }
      return stopCall();
    },
  });
}

function delayedSilentModel(ms: number): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      await delay(ms);
      return stopCall();
    },
  });
}

function delayedSpeakModel(text: string, ms: number): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        await delay(ms);
        return speakCall(text);
      }
      return stopCall();
    },
  });
}

function waitCall(): LanguageModelV3GenerateResult {
  return {
    content: [
      {
        input: JSON.stringify({}),
        toolCallId: "call_wait",
        toolName: "wait",
        type: "tool-call",
      },
    ],
    finishReason: { raw: "tool-calls", unified: "tool-calls" },
    usage: usage(),
    warnings: [],
  };
}

function speakCall(text: string): LanguageModelV3GenerateResult {
  return {
    content: [
      {
        input: JSON.stringify({ text }),
        toolCallId: "call_speak",
        toolName: "speak_to_user",
        type: "tool-call",
      },
    ],
    finishReason: { raw: "tool-calls", unified: "tool-calls" },
    usage: usage(),
    warnings: [],
  };
}

function stopCall(): LanguageModelV3GenerateResult {
  return {
    content: [],
    finishReason: { raw: "stop", unified: "stop" },
    usage: usage(),
    warnings: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const STATUS_PHRASE_PT = /^(vendo|anotando|agendando|um seg)$/;

function assertReasonTurn(
  result: OutboundTurn,
  path: ReasonTurnPath,
  rivals: number,
  generate: ReasonTurnGenerate,
): void {
  assert.equal(result.reasonTurn.path, path);
  assert.equal(result.reasonTurn.rivals, rivals);
  assert.equal(result.reasonTurn.generate, generate);
}

function assertSilentThrow(result: OutboundTurn, rivals: number): void {
  const sent = outboundBubbles(result).join("\n");
  assert.deepEqual(result.bubbles, []);
  assert.equal(result.href, null);
  assert.deepEqual(outboundBubbles(result), []);
  assert.doesNotMatch(sent, /não consegui consultar agora/);
  assert.doesNotMatch(sent, /couldn't look that up/);
  assert.doesNotMatch(sent, /\/approve\//);
  assertReasonTurn(result, "threw", rivals, "throw");
}

function flattenPrompt(prompt: LanguageModelV3CallOptions["prompt"]): string {
  return prompt
    .map((message) => {
      if (message.role === "system") {
        return message.content;
      }
      if (message.role === "user") {
        return message.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n");
      }
      return "";
    })
    .join("\n");
}

function supportingQuantityClaims(): readonly ClaimRead[] {
  const entityId = "commercial.order-line.dirty-quote";
  return [
    {
      entityId,
      lineage: [
        {
          claimId: "claim.quotedQuantity.sheet",
          commitSequence: 1n,
          entityId,
          relationId: "commercial.quotedQuantity",
          role: LineageRole.SUPPORTING,
          sourceId: "source.sheet",
        },
      ],
      value: { amount: "10", kind: "quantity", unit: "each" },
    },
    {
      entityId,
      lineage: [
        {
          claimId: "claim.quotedQuantity.erp",
          commitSequence: 2n,
          entityId,
          relationId: "commercial.quotedQuantity",
          role: LineageRole.UNSPECIFIED,
          sourceId: "source.erp",
        },
      ],
      value: { amount: "12", kind: "quantity", unit: "each" },
    },
  ];
}

