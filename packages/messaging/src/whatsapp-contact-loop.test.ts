import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ChannelSubjectResolveError,
  createIdentityDirectoryClient,
  principalIdString,
  providerKey,
  tenantIdString,
  type IdentityDirectory,
} from "../../interaction/src/index.js";
import {
  createRecordingCompanionSession,
  type RecordingCompanionSession,
} from "./companion-session.js";
import {
  createWhatsAppMessagingIngress,
} from "./whatsapp-ingress.js";
import {
  classifyWhatsAppContactInbound,
  createFileReplyLedger,
  createMemoryReplyLedger,
  createWhatsAppContactLoop,
  UNBOUND_WHATSAPP_POKE_TEXT,
} from "./whatsapp-contact-loop.js";
import { formatWhatsAppMinuteText } from "./whatsapp-minute.js";

const doorE164 = "+553798136141";
const doorJid = "553798136141@s.whatsapp.net";
const speaker = "553199941160@s.whatsapp.net";
const group = "120363000000000000@g.us";

function inbound(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    body: "Oi",
    chatJid: speaker,
    fromMe: false,
    isGroup: false,
    messageId: "wamid.enzo.oi",
    observedAt: "2026-08-25T02:28:12.000Z",
    senderAltJid: speaker,
    senderJid: "146454777753827@lid",
    ...overrides,
  };
}

function unboundIdentity(calls: string[]): IdentityDirectory {
  return {
    async resolveChannelSubject(input) {
      calls.push(`GET ${input.subjectKey}`);
      throw new ChannelSubjectResolveError({
        kind: "unbound",
        message: "unresolved channel subject: no verified binding",
      });
    },
  };
}

function boundIdentity(subjectKey: string): IdentityDirectory {
  return {
    async resolveChannelSubject(input) {
      if (input.subjectKey !== subjectKey) {
        throw new ChannelSubjectResolveError({
          kind: "unbound",
          message: "unresolved channel subject: no verified binding",
        });
      }
      return {
        accountId: "account.wa.enzo",
        actorId: "actor.personal",
        bindingId: "binding.wa.enzo",
        membershipId: "membership.wa.enzo",
        principalId: principalIdString("principal.wa.enzo"),
        tenantId: tenantIdString("tenant.wa.enzo"),
        workloadId: "workload.personal",
      };
    },
  };
}

async function readySession(): Promise<RecordingCompanionSession> {
  const session = createRecordingCompanionSession({
    ready: { connected: true, loggedIn: true, paired: true },
  });
  await session.open();
  return session;
}

test("fromMe, door, and group are dropped before IdentityDirectory", async () => {
  const calls: string[] = [];
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    doorE164,
    identity: unboundIdentity(calls),
    session,
  });
  const fromMe = await loop.handleRaw(inbound({ fromMe: true }));
  assert.deepEqual(fromMe, { kind: "dropped", reason: "from_me" });
  const door = await loop.handleRaw(
    inbound({
      chatJid: doorJid,
      messageId: "wamid.door",
      senderAltJid: doorJid,
      senderJid: doorJid,
    }),
  );
  assert.deepEqual(door, { kind: "dropped", reason: "door_is_person" });
  const grouped = await loop.handleRaw(
    inbound({
      chatJid: group,
      isGroup: true,
      messageId: "wamid.g",
    }),
  );
  assert.deepEqual(grouped, { kind: "dropped", reason: "group" });
  assert.deepEqual(calls, []);
  assert.equal(session.sent().length, 0);
  await session.close();
});

test("unbound 1:1 pokes the same thread and does not mint membership", async () => {
  const methods: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    methods.push(`${(init?.method ?? "GET").toUpperCase()} ${String(input)}`);
    assert.doesNotMatch(String(input), /\/provisional|\/verify-binding|\/bind-verified/);
    return new Response(
      JSON.stringify({ error: "OIDC subject has no verified binding" }),
      { headers: { "content-type": "application/json" }, status: 401 },
    );
  };
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    doorE164,
    identity: createIdentityDirectoryClient({
      baseUrl: "http://zoend.test",
      fetchImpl,
    }),
    session,
  });
  const result = await loop.handleRaw(inbound());
  assert.equal(result.kind, "unbound");
  assert.equal(session.sent().length, 1);
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.chatJid, speaker);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.equal(sent.shape.text, UNBOUND_WHATSAPP_POKE_TEXT);
    assert.equal(sent.shape.text.includes("https://"), false);
  }
  assert.deepEqual(methods, [
    "GET http://zoend.test/identity/admin/resolve-subject?provider=whatsapp&subjectKey=553199941160%40s.whatsapp.net",
  ]);
  await session.close();
});

test("bound 1:1 runs the turn coordinator and replies in the same thread", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    doorE164,
    identity: boundIdentity(speaker),
    session,
  });
  const result = await loop.handleRaw(inbound({ body: "Oi", messageId: "wamid.bound" }));
  assert.equal(result.kind, "bound");
  assert.equal(session.sent().length, 1);
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.chatJid, speaker);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.equal(sent.shape.text, "Recebi: Oi");
    assert.doesNotMatch(sent.shape.text, /cta_url|quick_reply/);
  }
  await session.close();
});

test("restart with the same ledger does not send a second reply", async () => {
  const ledger = createMemoryReplyLedger();
  const first = await readySession();
  const loop = createWhatsAppContactLoop({
    doorE164,
    identity: unboundIdentity([]),
    ledger,
    session: first,
  });
  const once = await loop.handleRaw(inbound());
  assert.equal(once.kind, "unbound");
  const again = await loop.handleRaw(inbound());
  assert.equal(again.kind, "duplicate");
  assert.equal(first.sent().length, 1);
  await first.close();

  const second = await readySession();
  const restarted = createWhatsAppContactLoop({
    doorE164,
    identity: unboundIdentity([]),
    ledger,
    session: second,
  });
  const afterRestart = await restarted.handleRaw(inbound());
  assert.equal(afterRestart.kind, "duplicate");
  assert.equal(second.sent().length, 0);
  await second.close();
});

test("file ledger survives a new process-shaped loop", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "zoen-wa-ledger-"));
  const filePath = path.join(dir, "replies.json");
  try {
    const ledger = createFileReplyLedger(filePath);
    const first = await readySession();
    const loop = createWhatsAppContactLoop({
      doorE164,
      identity: unboundIdentity([]),
      ledger,
      session: first,
    });
    assert.equal((await loop.handleRaw(inbound())).kind, "unbound");
    await first.close();

    const reloaded = createFileReplyLedger(filePath);
    const second = await readySession();
    const restarted = createWhatsAppContactLoop({
      doorE164,
      identity: unboundIdentity([]),
      ledger: reloaded,
      session: second,
    });
    assert.equal((await restarted.handleRaw(inbound())).kind, "duplicate");
    assert.equal(second.sent().length, 0);
    await second.close();
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("classify rejects Cloud API envelopes and personal inbox is not the door", () => {
  assert.throws(
    () =>
      classifyWhatsAppContactInbound(
        { entry: [], object: "whatsapp_business_account" },
        doorE164,
      ),
    (error: unknown) =>
      error instanceof Error && error.name === "WhatsAppEnvelopeError",
  );
  const person = classifyWhatsAppContactInbound(inbound(), doorE164);
  assert.equal(person.drop, false);
});

test("zoend inbound with processInbound replies through the recording session", async () => {
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  process.env.ZOEN_WHATSAPP_DOOR_E164 = doorE164;
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    doorE164,
    identity: unboundIdentity([]),
    session,
  });
  const ingress = await createWhatsAppMessagingIngress({
    gateway: loop.gateway,
    port: 0,
    processInbound: (raw) => loop.handleRaw(raw),
    session,
  });
  const address = ingress.server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    const advertised = await fetch(
      `http://127.0.0.1:${String(address.port)}/advertise`,
    );
    assert.equal(advertised.status, 204);
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/inbound`,
      {
        body: JSON.stringify(inbound({ messageId: "wamid.http" })),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { kind?: unknown };
    assert.equal(body.kind, "unbound");
    assert.equal(session.sent().length, 1);
    assert.equal(session.sent()[0]?.chatJid, speaker);
  } finally {
    await ingress.close();
    await session.close();
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
    } else {
      process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
    }
  }
});

test("bound minute lists rivals and exactly one https URL", async () => {
  const session = await readySession();
  const minute = formatWhatsAppMinuteText({
    actionUrl: "https://app.zoen.local/",
    entityId: "commercial.order-line.dirty-quote",
    rivals: [
      { label: "10 each", sourceId: "source.sheet" },
      { label: "12 each", sourceId: "source.erp" },
    ],
  });
  assert.equal(minute.split("https://").length - 1, 1);
  const loop = createWhatsAppContactLoop({
    boundReply: async () => ({ text: minute }),
    doorE164,
    identity: boundIdentity(speaker),
    session,
  });
  const result = await loop.handleRaw(
    inbound({ body: "oi", messageId: "wamid.minute" }),
  );
  assert.equal(result.kind, "bound");
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.equal(sent.shape.text.includes("10 each"), true);
    assert.equal(sent.shape.text.includes("12 each"), true);
    assert.equal(sent.shape.text.includes("https://app.zoen.local/"), true);
    assert.equal(sent.shape.text.split("https://").length - 1, 1);
    assert.equal(sent.shape.text.includes("cta_url"), false);
  }
  await session.close();
});

test("provider key stays unofficial whatsapp", () => {
  assert.equal(String(providerKey("whatsapp")), "whatsapp");
});
