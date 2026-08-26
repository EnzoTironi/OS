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
} from "../../speaker/src/index.js";
import {
  createRecordingCompanionSession,
  type RecordingCompanionSession,
} from "./companion-session.js";
import { generateWhsecSecret, signStandardWebhook } from "./standard-webhooks.js";
import {
  createWhatsAppMessagingIngress,
} from "./whatsapp-ingress.js";
import { resetWhatsAppIngressReplay } from "./whatsapp-ingress-auth.js";
import {
  classifyWhatsAppContactInbound,
  createFileReplyLedger,
  createMemoryReplyLedger,
  createWhatsAppContactLoop,
} from "./whatsapp-contact-loop.js";

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

const onboardHref = "https://zoen.tironi.xyz/onboard/testtok";

function unboundIdentity(calls: string[]): IdentityDirectory {
  return {
    async mintOnboardToken() {
      return { href: onboardHref, token: "testtok" };
    },
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
    debounceMs: 0,
    doorE164,
    identity: unboundIdentity(calls),
    publicWebOrigin: "https://zoen.tironi.xyz",
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
  const generated = "oi, entra quando quiser";
  const generateCalls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    methods.push(`${method} ${String(input)}`);
    assert.doesNotMatch(
      String(input),
      /\/provisional|\/verify-binding|\/bind-verified|\/personal$/,
    );
    if (method === "POST" && String(input).includes("/identity/admin/onboard-tokens")) {
      return new Response(
        JSON.stringify({
          href: onboardHref,
          token: "testtok",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ error: "OIDC subject has no verified binding" }),
      { headers: { "content-type": "application/json" }, status: 404 },
    );
  };
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    generateFirstContact: async (inboundText) => {
      generateCalls.push(inboundText);
      return generated;
    },
    identity: createIdentityDirectoryClient({
      adminToken: "identity-admin",
      baseUrl: "http://zoend.test",
      fetchImpl,
    }),
    publicWebOrigin: "https://zoen.tironi.xyz",
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
    assert.equal(sent.shape.text.includes(generated), true);
    assert.equal(sent.shape.text.includes(onboardHref), true);
    assert.equal(sent.shape.text.split("https://").length - 1, 1);
    assert.deepEqual(generateCalls, ["Oi"]);
    assert.doesNotMatch(
      sent.shape.text,
      /Este WhatsApp ainda não está vinculado|unbound|unlinked|unregistered/i,
    );
    assert.doesNotMatch(sent.shape.text, /app\.zoen\.local|workshop\.example/);
  }
  assert.deepEqual(methods, [
    "GET http://zoend.test/identity/admin/resolve-subject?provider=whatsapp&subjectKey=553199941160%40s.whatsapp.net",
    "POST http://zoend.test/identity/admin/onboard-tokens",
  ]);
  await session.close();
});

test("acknowledge rearms debounce without waiting for generate", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 80,
    doorE164,
    identity: boundIdentity(speaker),
    session,
  });
  const first = await loop.acknowledgeRaw(
    inbound({ body: "um", messageId: "wamid.ack1" }),
  );
  assert.equal(first.kind, "queued");
  assert.equal(session.sent().length, 0);
  const second = await loop.acknowledgeRaw(
    inbound({ body: "dois", messageId: "wamid.ack2" }),
  );
  assert.equal(second.kind, "queued");
  assert.equal(session.sent().length, 0);
  await loop.waitUntilIdle();
  assert.equal(session.sent().length, 1);
  await session.close();
});

test("bound 1:1 runs the turn coordinator and replies in the same thread", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
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
    assert.doesNotMatch(sent.shape.text, /Recebi/i);
    assert.ok(sent.shape.text.trim().length > 0);
    assert.doesNotMatch(sent.shape.text, /cta_url|quick_reply/);
  }
  await session.close();
});

test("bound 1:1 records composing then paused around the turn", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: boundIdentity(speaker),
    session,
  });
  const result = await loop.handleRaw(
    inbound({ body: "Oi", messageId: "wamid.typing" }),
  );
  assert.equal(result.kind, "bound");
  assert.deepEqual(
    session.presences().map((row) => row.state),
    ["composing", "paused"],
  );
  assert.deepEqual(
    session.presences().map((row) => row.chatJid),
    [speaker, speaker],
  );
  assert.deepEqual(
    session.trace().map((event) =>
      event.kind === "presence" ? event.state : event.kind,
    ),
    ["composing", "send", "paused"],
  );
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.doesNotMatch(sent.shape.text, /Recebi/i);
    assert.doesNotMatch(sent.shape.text, /auxiliar|pronto para ajudar/i);
  }
  await session.close();
});

test("unbound 1:1 does not send composing presence", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: unboundIdentity([]),
    session,
  });
  const result = await loop.handleRaw(
    inbound({ messageId: "wamid.unbound.presence" }),
  );
  assert.equal(result.kind, "unbound");
  assert.deepEqual(session.presences(), []);
  await session.close();
});

test("restart with the same ledger does not send a second reply", async () => {
  const ledger = createMemoryReplyLedger();
  const first = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
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
    debounceMs: 0,
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
    debounceMs: 0,
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
      debounceMs: 0,
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
    debounceMs: 0,
    doorE164,
    identity: unboundIdentity([]),
    session,
  });
  resetWhatsAppIngressReplay();
  const secret = generateWhsecSecret();
  const ingress = await createWhatsAppMessagingIngress({
    gateway: loop.gateway,
    ingressSecret: secret,
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
    const rawBody = JSON.stringify(inbound({ messageId: "wamid.http" }));
    const signed = signStandardWebhook({
      rawBody,
      secret,
      timestampSeconds: Math.floor(Date.now() / 1000),
      webhookId: "msg_http",
    });
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/inbound`,
      {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          ...signed,
        },
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

test("bound 1:1 live send is the turn, not a minute callback", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: boundIdentity(speaker),
    session,
  });
  const result = await loop.handleRaw(
    inbound({ body: "oi", messageId: "wamid.live-turn" }),
  );
  assert.equal(result.kind, "bound");
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.doesNotMatch(sent.shape.text, /Recebi/i);
    assert.ok(sent.shape.text.trim().length > 0);
    assert.equal(sent.shape.text.includes("cta_url"), false);
    assert.ok(sent.shape.text.split("https://").length - 1 <= 1);
  }
  await session.close();
});

test("bound 1:1 with executeWork stays Recebi-free when ZOEN_MODEL is unset", async () => {
  const previous = process.env.ZOEN_MODEL;
  delete process.env.ZOEN_MODEL;
  const session = await readySession();
  let handed = 0;
  try {
    const loop = createWhatsAppContactLoop({
    debounceMs: 0,
      doorE164,
      executeWork: async () => {
        handed += 1;
        return "status: workbench counted rivals";
      },
      identity: boundIdentity(speaker),
      session,
    });
    const result = await loop.handleRaw(
      inbound({ body: "Oi", messageId: "wamid.exec-closed" }),
    );
    assert.equal(result.kind, "bound");
    assert.equal(handed, 0);
    const sent = session.sent()[0];
    assert.ok(sent);
    assert.equal(sent.shape.kind, "text");
    if (sent.shape.kind === "text") {
      assert.doesNotMatch(sent.shape.text, /Recebi/i);
      assert.doesNotMatch(sent.shape.text, /status: workbench/);
      assert.ok(sent.shape.text.trim().length > 0);
    }
  } finally {
    await session.close();
    if (previous === undefined) {
      delete process.env.ZOEN_MODEL;
    } else {
      process.env.ZOEN_MODEL = previous;
    }
  }
});

test("provider key stays unofficial whatsapp", () => {
  assert.equal(String(providerKey("whatsapp")), "whatsapp");
});
