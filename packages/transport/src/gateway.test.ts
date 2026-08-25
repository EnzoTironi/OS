import assert from "node:assert/strict";
import test from "node:test";
import {
  deliveryIntentId,
  interactionId,
  presentationIntentRef,
  providerKey,
  providerThreadRef,
  providerUserRef,
} from "../../speaker/src/index.js";
import {
  presentationSchema,
  type PresentationIntent,
} from "./presentation-intent.js";
import {
  CAPABILITY_IDS,
  createCapabilityProbes,
  type ProbeAnswer,
} from "./capability-probes.js";
import type {
  ChatSdkOutbound,
  ChatSdkShapedAdapter,
  ChatSdkThreadRef,
} from "./chat-sdk-shape.js";
import {
  createMessagingGateway,
  type ResolvedPresentation,
} from "./gateway.js";

const NATIVE: ProbeAnswer = { status: "native" };

function allNativeTable(): Readonly<
  Record<(typeof CAPABILITY_IDS)[number], ProbeAnswer>
> {
  const table = {} as Record<(typeof CAPABILITY_IDS)[number], ProbeAnswer>;
  for (const id of CAPABILITY_IDS) {
    table[id] = NATIVE;
  }
  return table;
}

function stubAdapter(
  providerId: string,
  threadKind: ChatSdkThreadRef["kind"] = "chat",
  send?: (outbound: ChatSdkOutbound) => Promise<{
    messageId: string;
    status: "accepted" | "rejected" | "unknown";
  }>,
): ChatSdkShapedAdapter {
  return {
    parseInbound(raw) {
      const record = raw as {
        id?: string;
        from?: string;
        text?: string;
        thread?: string;
      };
      return {
        from: { id: record.from ?? "user_1" },
        id: record.id ?? "msg_1",
        receivedAt: "2026-08-24T12:00:00.000Z",
        text: record.text ?? "hi",
        thread: { id: record.thread ?? "thread_1", kind: threadKind },
      };
    },
    probes: createCapabilityProbes(providerId, allNativeTable()),
    providerId,
    async send(outbound) {
      if (send !== undefined) {
        return send(outbound);
      }
      return { messageId: "out_1", status: "accepted" };
    },
    threadKind,
  };
}

function unusedResolve(): (
  intent: { presentation: unknown },
) => Promise<ResolvedPresentation> {
  return async (intent) => {
    throw new Error(`resolvePresentation unused for ${String(intent.presentation)}`);
  };
}

function textPresentation(ref: string, body: string): PresentationIntent {
  return {
    blocks: [{ body, kind: "text" }],
    createdAt: "2026-08-24T12:00:00.000Z",
    fullBodyText: body,
    ref: presentationIntentRef(ref),
    schema: presentationSchema,
    surfaceDigest: "digest",
    surfaceId: "surface_1",
  };
}

function resolvedText(body: string): ResolvedPresentation {
  return {
    disclosedBody: body,
    disclosure: { kind: "deliver_full" },
    includesConfidentialBody: true,
    intent: textPresentation("pres_ok", body),
  };
}

test("acceptProviderEvent uses Linq event_id for idempotency and group audience", async () => {
  const gateway = createMessagingGateway({
    providers: { linq: stubAdapter("linq", "guid") },
    resolvePresentation: unusedResolve(),
  });
  const inbound = await gateway.acceptProviderEvent(providerKey("linq"), {
    event_id: "evt_99",
    from: "+1555",
    id: "msg_linq",
    participants: ["a", "b", "c"],
    text: "hello",
    thread: "guid_1",
  });
  assert.equal(inbound.idempotencyKey, "linq:webhook:evt_99");
  assert.equal(inbound.audienceObservation.kind, "group");
  assert.equal(inbound.audienceObservation.observedParticipantCount, 3);
});

test("acceptProviderEvent ignores Telegram Bot update_id and chat.type", async () => {
  const gateway = createMessagingGateway({
    providers: { telegram: stubAdapter("telegram") },
    resolvePresentation: unusedResolve(),
  });
  const inbound = await gateway.acceptProviderEvent(providerKey("telegram"), {
    from: "42",
    id: "tg_msg",
    message: { chat: { type: "supergroup" } },
    text: "hi",
    thread: "9900001",
    update_id: 777,
  });
  assert.equal(inbound.idempotencyKey, "telegram:message:tg_msg");
  assert.equal(inbound.audienceObservation.kind, "dm");
});

test("acceptProviderEvent does not parse WABA wamid envelopes", async () => {
  const gateway = createMessagingGateway({
    providers: { whatsapp: stubAdapter("whatsapp") },
    resolvePresentation: unusedResolve(),
  });
  const inbound = await gateway.acceptProviderEvent(providerKey("whatsapp"), {
    entry: [
      {
        changes: [
          {
            value: {
              group_id: "group_abc",
              messages: [{ id: "wamid.HBg" }],
            },
          },
        ],
      },
    ],
    from: "15551234567",
    id: "wa_msg",
    object: "whatsapp_business_account",
    text: "hi",
    thread: "wa_thread",
  });
  assert.equal(inbound.idempotencyKey, "whatsapp:message:wa_msg");
  assert.equal(inbound.audienceObservation.kind, "dm");
});

test("deliver lowers only through resolvePresentation Surface IR", async () => {
  const sent: ChatSdkOutbound[] = [];
  const gateway = createMessagingGateway({
    providers: {
      telegram: stubAdapter("telegram", "chat", async (outbound) => {
        sent.push(outbound);
        return { messageId: "out_surface", status: "accepted" };
      }),
    },
    resolvePresentation: async () => resolvedText("hello from surface"),
  });

  const observation = await gateway.deliver({
    controlRefs: [],
    id: deliveryIntentId("di_1"),
    presentation: presentationIntentRef("pres_ok"),
    provider: providerKey("telegram"),
    recordId: interactionId("ir_1"),
    stableProviderDeliveryId: "spd_1",
    target: { kind: "dm", providerUser: providerUserRef("user_9") },
  });

  assert.equal(observation.outcome.kind, "accepted");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.text, "hello from surface");
  assert.equal(sent[0]?.toUser?.id, "user_9");
  assert.equal(sent[0]?.card, undefined);
  assert.equal(sent[0]?.typing, undefined);
});

test("deliver does not treat card:/rich:/typing: presentation refs as live prefixes", async () => {
  const sent: ChatSdkOutbound[] = [];
  const gateway = createMessagingGateway({
    providers: {
      telegram: stubAdapter("telegram", "chat", async (outbound) => {
        sent.push(outbound);
        return { messageId: "out_prefix", status: "accepted" };
      }),
    },
    resolvePresentation: async (intent) => {
      const ref = String(intent.presentation);
      assert.equal(ref.slice(0, 5), "card:");
      return resolvedText(`resolved:${ref}`);
    },
  });

  await gateway.deliver({
    controlRefs: [],
    id: deliveryIntentId("di_prefix"),
    presentation: presentationIntentRef("card:legacy"),
    provider: providerKey("telegram"),
    recordId: interactionId("ir_prefix"),
    stableProviderDeliveryId: "spd_prefix",
    target: { kind: "dm", providerUser: providerUserRef("user_1") },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.text, "resolved:card:legacy");
  assert.notEqual(sent[0]?.text, "presentation:card:legacy");
  assert.equal(sent[0]?.card, undefined);
  assert.equal(sent[0]?.typing, undefined);
});

test("deliver thread kind comes from adapter.threadKind, not provider id", async () => {
  const sent: ChatSdkOutbound[] = [];
  const gateway = createMessagingGateway({
    providers: {
      linq: stubAdapter("linq", "guid", async (outbound) => {
        sent.push(outbound);
        return { messageId: "out_guid", status: "accepted" };
      }),
      telegram: stubAdapter("telegram", "chat", async (outbound) => {
        sent.push(outbound);
        return { messageId: "out_chat", status: "accepted" };
      }),
    },
    resolvePresentation: async () => resolvedText("thread kind body"),
  });

  await gateway.deliver({
    controlRefs: [],
    id: deliveryIntentId("di_linq"),
    presentation: presentationIntentRef("pres_thread"),
    provider: providerKey("linq"),
    recordId: interactionId("ir_linq"),
    stableProviderDeliveryId: "spd_linq",
    target: { kind: "same_thread", thread: providerThreadRef("guid.abc") },
  });
  await gateway.deliver({
    controlRefs: [],
    id: deliveryIntentId("di_tg"),
    presentation: presentationIntentRef("pres_thread"),
    provider: providerKey("telegram"),
    recordId: interactionId("ir_tg"),
    stableProviderDeliveryId: "spd_tg",
    target: { kind: "same_thread", thread: providerThreadRef("99001") },
  });

  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.thread?.kind, "guid");
  assert.equal(sent[1]?.thread?.kind, "chat");
});
