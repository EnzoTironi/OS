import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCompanionPresenceState,
  companionSessionIsReady,
  composeOutboundChatJid,
  createHttpCompanionSession,
  createRecordingCompanionSession,
  enrichInboundPersonRefs,
  enrichPersonAltRef,
  normalizeCompanionInbound,
  type CompanionInbound,
} from "./companion-session.js";

const speakerPhone = "5531888888888@s.whatsapp.net";
const speakerLid = "123456789012345@lid";
const groupJid = "120363000000000000@g.us";

function textInbound(
  overrides: Partial<CompanionInbound> = {},
): CompanionInbound {
  return {
    body: "oi",
    chatJid: speakerPhone,
    fromMe: false,
    isGroup: false,
    messageId: "wamid.1",
    observedAt: "2026-08-24T12:00:00.000Z",
    senderAltJid: speakerPhone,
    senderJid: speakerPhone,
    ...overrides,
  };
}

test("recording companion open ready inbound send", async () => {
  const session = createRecordingCompanionSession();
  await session.open();
  assert.equal(companionSessionIsReady(await session.ready()), false);

  session.setReady({ connected: true, loggedIn: true, paired: true });
  assert.equal(companionSessionIsReady(await session.ready()), true);

  const inboundSeen: string[] = [];
  session.subscribeInbound((event) => {
    inboundSeen.push(event.messageId);
  });
  const delivered = await session.injectInbound(textInbound());
  assert.equal(delivered, "delivered");
  assert.equal(inboundSeen.join(), "wamid.1");

  const receipt = await session.send({
    chatJid: speakerPhone,
    clientDeliveryId: "spd_1",
    shape: { kind: "text", text: "resposta" },
  });
  assert.equal(receipt.status, "accepted");
  assert.equal(session.sent()[0]?.chatJid, speakerPhone);
  await session.close();
});

test("FromMe inbound is dropped", async () => {
  const session = createRecordingCompanionSession();
  await session.open();
  const result = await session.injectInbound(textInbound({ fromMe: true }));
  assert.equal(result, "dropped");
  assert.equal(session.delivered().length, 0);
});

test("group JID is the chat and speaker is the person", async () => {
  const session = createRecordingCompanionSession();
  await session.open();
  const result = await session.injectInbound(
    textInbound({
      chatJid: groupJid,
      isGroup: true,
      senderAltJid: speakerPhone,
      senderJid: speakerLid,
    }),
  );
  assert.equal(result, "delivered");
  const inbound = session.delivered()[0];
  assert.ok(inbound);
  assert.equal(inbound.chatJid, groupJid);
  assert.equal(inbound.senderJid, speakerLid);
  assert.equal(inbound.senderAltJid, speakerPhone);
});

test("group JID as speaker fails closed", () => {
  assert.throws(
    () =>
      normalizeCompanionInbound(
        textInbound({ senderJid: groupJid, isGroup: true, chatJid: groupJid }),
        undefined,
      ),
    /group JID is not a speaker/,
  );
});

test("LID map hit remaps 1:1 chat to phone", () => {
  const mapped = enrichInboundPersonRefs(
    textInbound({
      chatJid: speakerLid,
      senderAltJid: "",
      senderJid: speakerLid,
    }),
    (lid) => (lid === speakerLid ? speakerPhone : undefined),
  );
  assert.equal(mapped.chatJid, speakerPhone);
  assert.equal(mapped.senderAltJid, speakerPhone);
});

test("LID map miss does not invent a phone", () => {
  const mapped = enrichPersonAltRef(speakerLid, "", () => undefined);
  assert.equal(mapped, "");
  const inbound = enrichInboundPersonRefs(
    textInbound({
      chatJid: speakerLid,
      senderAltJid: "",
      senderJid: speakerLid,
    }),
    () => undefined,
  );
  assert.equal(inbound.senderAltJid, "");
  assert.equal(inbound.chatJid, speakerLid);
});

test("outbound dest is the chat JID including groups", () => {
  assert.equal(composeOutboundChatJid(groupJid), groupJid);
  assert.equal(composeOutboundChatJid(speakerPhone), speakerPhone);
  assert.throws(
    () => composeOutboundChatJid("status@broadcast"),
    /unsupported outbound session server/,
  );
});

test("recording presence rejects broadcast the same way send does", async () => {
  const session = createRecordingCompanionSession();
  await session.open();
  await assert.rejects(
    () => session.presence("status@broadcast", "composing"),
    /unsupported outbound session server/,
  );
  assert.deepEqual(session.presences(), []);
  await session.close();
});

test("recording presence records composing then paused", async () => {
  const session = createRecordingCompanionSession();
  await session.open();
  await session.presence(speakerPhone, "composing");
  await session.send({
    chatJid: speakerPhone,
    clientDeliveryId: "spd_presence",
    shape: { kind: "text", text: "ok" },
  });
  await session.presence(speakerPhone, "paused");
  assert.deepEqual(
    session.presences().map((row) => row.state),
    ["composing", "paused"],
  );
  assert.deepEqual(
    session.trace().map((event) =>
      event.kind === "presence" ? event.state : event.kind,
    ),
    ["composing", "send", "paused"],
  );
  await session.close();
});

test("HTTP companion posts /presence and rejects broadcast locally", async () => {
  const seen: string[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    seen.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    if (url.endsWith("/presence")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        chatJid?: unknown;
        state?: unknown;
      };
      assert.equal(body.chatJid, speakerPhone);
      assert.equal(body.state, "composing");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
  try {
    const session = createHttpCompanionSession("http://companion.test");
    await session.presence(speakerPhone, "composing");
    await assert.rejects(
      () => session.presence("status@broadcast", "paused"),
      /unsupported outbound session server/,
    );
    assert.deepEqual(seen, ["POST http://companion.test/presence"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("presence state is composing or paused", () => {
  assert.equal(assertCompanionPresenceState("composing"), "composing");
  assert.equal(assertCompanionPresenceState("paused"), "paused");
  assert.throws(() => assertCompanionPresenceState("recording"), /paused/);
});
