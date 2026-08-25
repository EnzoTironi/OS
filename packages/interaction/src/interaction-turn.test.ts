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
  createInteractionScratch,
  createInteractionTools,
} from "./interaction-tools.js";
import {
  interactionInstructions,
  outboundBubbles,
  reasoningPrompt,
  runInteractionTurn,
  type InteractionInbound,
} from "./interaction-turn.js";
import {
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
} from "./brands.js";
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
  assert.ok(text.trim().length > 0);
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
    inbound: { kind: "media", mediaRef: "wa-media-1", mime: "image/jpeg" },
    membership: membership("media"),
    world,
  });
  const text = outboundBubbles(result).join("\n");
  assert.ok(result.bubbles.length >= 1);
  assert.equal(result.href, null);
  assert.doesNotMatch(text, /Recebi/i);
  assert.doesNotMatch(text, /commercial\.order-line\.dirty-quote/);
  assert.match(text, /texto|arquivo/i);
});

test("two ClaimRead rows without RIVAL speak fail-closed PT rivals", async () => {
  const snapshot = snapshotFromClaims(supportingQuantityClaims());
  assert.ok(snapshot.rivals.length >= 2);
  const world: WorldQueryClient = {
    async semanticQuery() {
      return snapshot;
    },
  };
  const result = await runInteractionTurn({
    inbound: textInbound("Quanto ficou?"),
    membership: membership("supporting-rivals"),
    world,
  });
  const text = outboundBubbles(result).join("\n");
  assert.equal(
    result.bubbles[0],
    "Tem mais de uma leitura e as duas ficam de pé.",
  );
  assert.ok(result.bubbles.includes("source.sheet"));
  assert.ok(result.bubbles.includes("source.erp"));
  assert.doesNotMatch(text, /Recebi/i);
  assert.doesNotMatch(text, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(text, /Não consegui consultar agora/);
});

test("PT instructions ban helpdesk greetings and keep speak_to_user as the only voice", () => {
  const instructions = interactionInstructions("pt");
  assert.match(instructions, /speak_to_user/);
  assert.match(instructions, /Execution nunca fala/);
  assert.match(instructions, /Como posso te auxiliar/);
  assert.match(instructions, /Estou por aqui e pronto para ajudar/);
  assert.match(instructions, /Recebi/);
  assert.doesNotMatch(instructions, /Mastra|LangGraph/);
});

test("reasoningPrompt frames World rivals as the subject, not optional JSON", () => {
  const snapshot = snapshotFromClaims(supportingQuantityClaims());
  const prompt = reasoningPrompt(
    textInbound("Oi"),
    "Oi",
    snapshot,
    "pt",
  );
  assert.match(prompt, /O World abaixo é o assunto/);
  assert.doesNotMatch(prompt, /^\s*\{/u);
  assert.match(prompt, /source\.sheet/);
  assert.match(prompt, /source\.erp/);
  assert.match(prompt, /10 each/);
  assert.match(prompt, /12 each/);
  assert.match(prompt, /Duas leituras ficam de pé/);
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
        assert.match(blob, /O World abaixo é o assunto|The World below is the subject/);
        assert.match(blob, /source\.sheet/);
        assert.match(blob, /source\.erp/);
        const text = /O World abaixo é o assunto|The World below is the subject/i.test(
          blob,
        )
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
});

test("empty inbound with a silent model waits (empty bubbles)", async () => {
  const result = await runInteractionTurn({
    inbound: textInbound(""),
    membership: membership("wait"),
    model: silentStopModel(),
    world: emptyWorld(),
  });
  assert.deepEqual(result.bubbles, []);
  assert.equal(result.href, null);
  assert.deepEqual(outboundBubbles(result), []);
});

test("silent model with two World rivals speaks both readings, not Recebi or a greeting", async () => {
  const world: WorldQueryClient = {
    async semanticQuery() {
      return {
        entityIds: ["commercial.order-line.dirty-quote"],
        notes: ["10 each", "12 each"],
        rivals: [{ label: "10 each" }, { label: "12 each" }],
      };
    },
  };
  const result = await runInteractionTurn({
    inbound: textInbound("quanto ficou a cotacao"),
    membership: membership("silent-rivals"),
    model: silentStopModel(),
    world,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(
    result.bubbles[0],
    "Tem mais de uma leitura e as duas ficam de pé.",
  );
  assert.ok(result.bubbles.includes("10 each"));
  assert.ok(result.bubbles.includes("12 each"));
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|How can I help/i);
  assert.doesNotMatch(sent, /commercial\.order-line\.dirty-quote/);
});

test("silent model with ClaimRead two-rival snapshot speaks Poke lines, not Recebi", async () => {
  const snapshot = snapshotFromClaims(supportingQuantityClaims());
  const world: WorldQueryClient = {
    async semanticQuery() {
      return snapshot;
    },
  };
  const result = await runInteractionTurn({
    inbound: textInbound("quanto ficou a cotacao"),
    membership: membership("silent-claim-rivals"),
    model: silentStopModel(),
    world,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(
    result.bubbles[0],
    "Tem mais de uma leitura e as duas ficam de pé.",
  );
  assert.ok(result.bubbles.includes("source.sheet"));
  assert.ok(result.bubbles.includes("source.erp"));
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|How can I help/i);
  assert.doesNotMatch(sent, /commercial\.order-line\.dirty-quote/);
});

test("silent model with two World notes and no rivals speaks both readings", async () => {
  const world: WorldQueryClient = {
    async semanticQuery() {
      return {
        entityIds: [],
        notes: ["10 each", "12 each"],
        rivals: [],
      };
    },
  };
  const result = await runInteractionTurn({
    inbound: textInbound("how much is the quote"),
    membership: membership("silent-notes"),
    model: silentStopModel(),
    world,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(
    result.bubbles[0],
    "There is more than one reading, and both still stand.",
  );
  assert.ok(result.bubbles.includes("10 each"));
  assert.ok(result.bubbles.includes("12 each"));
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar|How can I help/i);
});

test("silent model with empty World fail-closes PT for non-empty inbound", async () => {
  const result = await runInteractionTurn({
    inbound: textInbound("quanto ficou a cotacao"),
    membership: membership("silent-empty-world"),
    model: silentStopModel(),
    world: emptyWorld(),
  });
  const sent = outboundBubbles(result).join("\n");
  assert.match(sent, /Não consegui consultar agora/);
  assert.doesNotMatch(sent, /Recebi/i);
  assert.doesNotMatch(sent, /auxiliar|pronto para ajudar/i);
  assert.notEqual(result.bubbles.length, 0);
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
              input: JSON.stringify({ url: "https://app.zoen.local/a" }),
              toolCallId: "call_href_1",
              toolName: "mint_href",
              type: "tool-call",
            },
            {
              input: JSON.stringify({ url: "https://app.zoen.local/b" }),
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
    inbound: textInbound("Oi"),
    membership: membership("href"),
    model,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(sent.split("https://").length - 1, 1);
  assert.ok(result.href instanceof URL);
  assert.equal(result.href.href, "https://app.zoen.local/a");
  assert.match(sent, /Segue o resumo/);
  assert.doesNotMatch(sent, /Recebi/i);
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

function emptyWorld(): WorldQueryClient {
  return {
    async semanticQuery() {
      return undefined;
    },
  };
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
