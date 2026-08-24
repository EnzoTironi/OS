import assert from "node:assert/strict";
import test from "node:test";
import { providerKey } from "../../interaction/src/index.js";
import {
  CAPABILITY_IDS,
  createCapabilityProbes,
  type ProbeAnswer,
} from "./capability-probes.js";
import type { ChatSdkShapedAdapter } from "./chat-sdk-shape.js";
import { createMessagingGateway } from "./gateway.js";

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

function stubAdapter(providerId: string): ChatSdkShapedAdapter {
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
        thread: { id: record.thread ?? "thread_1", kind: "chat" },
      };
    },
    probes: createCapabilityProbes(providerId, allNativeTable()),
    providerId,
    async send() {
      return { messageId: "out_1", status: "accepted" };
    },
  };
}

test("acceptProviderEvent uses Linq event_id for idempotency and group audience", async () => {
  const gateway = createMessagingGateway({
    providers: { linq: stubAdapter("linq") },
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
