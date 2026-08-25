import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliveryIntentId,
  interactionId,
  presentationIntentRef,
  providerKey,
  providerThreadRef,
} from "../../../speaker/src/index.js";
import {
  presentationSchema,
  type PresentationIntent,
} from "../../../surface/src/presentation-intent.js";
import { createMessagingGateway } from "../gateway.js";
import { createRecordingCompanionSession } from "../companion-session.js";
import {
  assertLiveWhatsAppAdvertisement,
  createLiveWhatsAppProvider,
  LiveWhatsAppConfigError,
  parseCompanionInboundEnvelope,
  parseWhatsAppDoorE164,
  PERSONAL_WHATSAPP_DOOR_E164,
  PERSON_WHATSAPP_SUBJECT_JID,
  assertWhatsAppPersonSubject,
  selectWhatsAppShape,
  WhatsAppEnvelopeError,
  WhatsAppSurfaceUrlError,
} from "./whatsapp-live.js";

const speaker = "5531888888888@s.whatsapp.net";
const group = "120363000000000000@g.us";

test("parseCompanionInbound maps chat JID and speaker", () => {
  const message = parseCompanionInboundEnvelope({
    body: "oi",
    chatJid: group,
    fromMe: false,
    isGroup: true,
    messageId: "wamid.9",
    observedAt: "2026-08-24T12:00:00.000Z",
    senderAltJid: speaker,
    senderJid: "123@lid",
  });
  assert.equal(message.thread.kind, "chat");
  assert.equal(message.thread.id, group);
  assert.equal(message.from.id, speaker);
  assert.equal(message.text, "oi");
});

test("Cloud API envelopes fail closed", () => {
  assert.throws(
    () =>
      parseCompanionInboundEnvelope({
        object: "whatsapp_business_account",
        entry: [],
      }),
    (error: unknown) => error instanceof WhatsAppEnvelopeError,
  );
});

test("door E.164 is ITU-ish and rejects empty, personal, username, and JID", () => {
  assert.throws(
    () => parseWhatsAppDoorE164(undefined),
    (error: unknown) => error instanceof LiveWhatsAppConfigError,
  );
  assert.throws(() => parseWhatsAppDoorE164("   "), /required/);
  assert.throws(
    () => parseWhatsAppDoorE164(PERSONAL_WHATSAPP_DOOR_E164),
    /personal/,
  );
  assert.throws(() => parseWhatsAppDoorE164("5531999941160"), /personal/);
  assert.throws(() => parseWhatsAppDoorE164("553199941160"), /personal/);
  assert.throws(() => parseWhatsAppDoorE164("+553199941160"), /personal/);
  assert.throws(() => parseWhatsAppDoorE164("@enzo"), /E\.164/);
  assert.throws(
    () => parseWhatsAppDoorE164("553798136141@s.whatsapp.net"),
    /E\.164/,
  );
  assert.throws(() => parseWhatsAppDoorE164("123456789012345@lid"), /E\.164/);
  assert.throws(() => parseWhatsAppDoorE164("553798136141"), /E\.164/);
  assert.equal(parseWhatsAppDoorE164("+553798136141"), "+553798136141");
  assert.equal(parseWhatsAppDoorE164("+15551234567"), "+15551234567");
  assert.equal(parseWhatsAppDoorE164("+5537911111111"), "+5537911111111");
});

test("person subject is the inbox JID and never the door", () => {
  const door = "+553798136141";
  assert.equal(
    assertWhatsAppPersonSubject(PERSON_WHATSAPP_SUBJECT_JID, door),
    PERSON_WHATSAPP_SUBJECT_JID,
  );
  assert.throws(
    () =>
      assertWhatsAppPersonSubject("553798136141@s.whatsapp.net", door),
    /door JID/,
  );
  assert.throws(
    () => assertWhatsAppPersonSubject("120363000000000000@g.us", door),
    /person phone/,
  );
  assert.throws(
    () => assertWhatsAppPersonSubject("146454777753827@lid", door),
    /person phone/,
  );
});

test("advertise without door fails closed", () => {
  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = "1";
    delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    assert.throws(
      () => assertLiveWhatsAppAdvertisement(),
      (error: unknown) => error instanceof LiveWhatsAppConfigError,
    );
  } finally {
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = previousAdvertise;
    }
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    } else {
      process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
    }
  }
});

test("advertise with door but unpaired session fails closed", () => {
  const previousAdvertise = process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  try {
    process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = "1";
    process.env.ZOEN_WHATSAPP_DOOR_E164 = "+5537911111111";
    assert.throws(
      () =>
        assertLiveWhatsAppAdvertisement({
          connected: false,
          loggedIn: false,
          paired: false,
        }),
      /not ready/,
    );
  } finally {
    if (previousAdvertise === undefined) {
      delete process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP;
    } else {
      process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP = previousAdvertise;
    }
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    } else {
      process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
    }
  }
});

test("selectWhatsAppShape is text only and appends https surfaceUrl", () => {
  const shape = selectWhatsAppShape({
    clientDeliveryId: "spd_cta",
    surfaceUrl: "https://example.com/s",
    text: "continue",
  });
  assert.equal(shape.kind, "text");
  assert.equal(shape.text.includes("https://example.com/s"), true);
  assert.equal(shape.text.includes("continue"), true);
  assert.throws(
    () =>
      selectWhatsAppShape({
        clientDeliveryId: "spd_bad",
        surfaceUrl: "zoen-rich://nope",
        text: "x",
      }),
    (error: unknown) => error instanceof WhatsAppSurfaceUrlError,
  );
  assert.throws(
    () =>
      selectWhatsAppShape({
        clientDeliveryId: "spd_http",
        surfaceUrl: "http://example.com/s",
        text: "x",
      }),
    (error: unknown) => error instanceof WhatsAppSurfaceUrlError,
  );
});

test("selectWhatsAppShape ignores buttons and cards", () => {
  const quick = selectWhatsAppShape({
    buttons: [
      { callbackData: "a", label: "A" },
      { callbackData: "b", label: "B" },
    ],
    clientDeliveryId: "spd_q",
    text: "pick",
  });
  assert.equal(quick.kind, "text");
  assert.equal(quick.text, "pick");
  const list = selectWhatsAppShape({
    buttons: [
      { callbackData: "1", label: "1" },
      { callbackData: "2", label: "2" },
      { callbackData: "3", label: "3" },
      { callbackData: "4", label: "4" },
    ],
    clientDeliveryId: "spd_l",
    text: "pick",
  });
  assert.equal(list.kind, "text");
  const card = selectWhatsAppShape({
    card: true,
    clientDeliveryId: "spd_c",
    text: "card",
  });
  assert.equal(card.kind, "text");
  assert.equal(card.text, "card");
});

test("whatsapp native widgets degrade to text or link", () => {
  const session = createRecordingCompanionSession();
  const provider = createLiveWhatsAppProvider({ session });
  assert.equal(provider.probes.canNativeButton().status, "unsupported");
  assert.equal(provider.probes.canNativeCard().status, "unsupported");
  const link = provider.probes.canNativeLink();
  assert.equal(link.status, "unsupported");
  if (link.status === "unsupported") {
    assert.equal(link.degradeTo, "link");
  }
  const typing = provider.probes.canType();
  assert.equal(typing.status, "unsupported");
  if (typing.status === "unsupported") {
    assert.equal(typing.degradeTo, "text");
  }
});

test("recording companion drops from_me", async () => {
  const session = createRecordingCompanionSession();
  await session.open();
  const result = await session.injectInbound({
    body: "oi",
    chatJid: speaker,
    fromMe: true,
    isGroup: false,
    messageId: "wamid.me",
    observedAt: "2026-08-24T12:00:00.000Z",
    senderAltJid: speaker,
    senderJid: speaker,
  });
  assert.equal(result, "dropped");
  assert.equal(session.delivered().length, 0);
});

test("adapter send dest is chat JID not speaker", async () => {
  const session = createRecordingCompanionSession({
    ready: { connected: true, loggedIn: true, paired: true },
  });
  await session.open();
  const provider = createLiveWhatsAppProvider({ session });
  await provider.send({
    clientDeliveryId: "spd_group",
    text: "hello group",
    thread: { id: group, kind: "chat" },
    toUser: { id: speaker },
  });
  assert.equal(session.sent()[0]?.chatJid, group);
});

test("gateway accept and deliver wrap CompanionSession", async () => {
  const session = createRecordingCompanionSession({
    ready: { connected: true, loggedIn: true, paired: true },
  });
  await session.open();
  const provider = createLiveWhatsAppProvider({ session });
  const intent: PresentationIntent = {
    blocks: [{ body: "pong", kind: "text" }],
    createdAt: "2026-08-24T12:00:00.000Z",
    fullBodyText: "pong",
    ref: presentationIntentRef("pres.whatsapp.test"),
    schema: presentationSchema,
    surfaceDigest: "digest",
    surfaceId: "surface_wa",
  };
  const gateway = createMessagingGateway({
    providers: { whatsapp: provider },
    resolvePresentation: async () => ({
      disclosedBody: "pong",
      disclosure: { kind: "deliver_full" },
      includesConfidentialBody: false,
      intent,
    }),
  });
  const inbound = await gateway.acceptProviderEvent(providerKey("whatsapp"), {
    body: "ping",
    chatJid: group,
    fromMe: false,
    isGroup: true,
    messageId: "wamid.gate",
    observedAt: "2026-08-24T12:00:00.000Z",
    senderAltJid: speaker,
    senderJid: speaker,
  });
  assert.equal(inbound.channel.thread, group);
  assert.equal(inbound.channel.providerUser, speaker);
  assert.equal(inbound.audienceObservation.kind, "group");
  assert.equal(inbound.body.kind, "text");

  const observation = await gateway.deliver({
    controlRefs: [],
    id: deliveryIntentId("di_wa_1"),
    presentation: presentationIntentRef("pres.whatsapp.test"),
    provider: providerKey("whatsapp"),
    recordId: interactionId("ir_wa_1"),
    stableProviderDeliveryId: "spd_gate_1",
    target: {
      kind: "same_thread",
      thread: providerThreadRef(group),
    },
  });
  assert.equal(observation.outcome.kind, "accepted");
  assert.equal(session.sent()[0]?.chatJid, group);
  assert.equal(session.sent()[0]?.shape.kind, "text");
});
