import assert from "node:assert/strict";
import test from "node:test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  outboundBubbles,
  runInteractionTurn,
} from "./interaction-turn.js";
import {
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
} from "./brands.js";
import type { InboundInteraction, ResolvedChannelIdentity } from "./types.js";
import type { WorldQueryClient } from "./world-query.js";

const membership: ResolvedChannelIdentity = {
  accountId: "account.wa.enzo",
  actorId: "actor.personal",
  bindingId: "binding.wa.enzo",
  membershipId: "membership.wa.enzo",
  principalId: principalIdString("principal.wa.enzo"),
  tenantId: tenantIdString("tenant.wa.enzo"),
  workloadId: "workload.personal",
};

function inbound(text: string, suffix = "t"): InboundInteraction {
  return {
    audienceObservation: { kind: "dm" },
    body: { kind: "text", text },
    channel: {
      provider: providerKey("whatsapp"),
      providerUser: providerUserRef("553199941160@s.whatsapp.net"),
      receivedAt: "2026-08-25T02:28:12.000Z",
      thread: providerThreadRef(`553199941160@s.whatsapp.net:${suffix}`),
    },
    idempotencyKey: `wa.turn.${suffix}`,
  };
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
    inbound: inbound("Oi", "oi"),
    membership,
  });
  assert.ok(result.bubbles.length >= 1);
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
    inbound: inbound("", "empty"),
    membership,
    world,
  });
  const text = outboundBubbles(result).join("\n");
  assert.doesNotMatch(text, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(text, /entity\.hidden\.1/);
  assert.doesNotMatch(text, /membership\.wa\.enzo/);
  assert.doesNotMatch(text, /Recebi/i);
  assert.ok(text.trim().length > 0);
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
    inbound: inbound("Oi", "href"),
    membership,
    model,
  });
  const sent = outboundBubbles(result).join("\n");
  assert.equal(sent.split("https://").length - 1, 1);
  assert.equal(result.href, "https://app.zoen.local/a");
  assert.match(sent, /Segue o resumo/);
  assert.doesNotMatch(sent, /Recebi/i);
});
