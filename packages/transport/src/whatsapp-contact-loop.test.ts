import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type {
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  ChannelSubjectResolveError,
  createIdentityDirectoryClient,
  principalIdString,
  providerKey,
  REASON_TURN_LOG_KEYS,
  tenantIdString,
  type IdentityDirectory,
  type ReasonTurnLog,
  type ScheduleHandle,
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

function membershipFor() {
  return {
    accountId: "account.wa.enzo",
    actorId: "actor.personal",
    bindingId: "binding.wa.enzo",
    membershipId: "membership.wa.enzo",
    principalId: principalIdString("principal.wa.enzo"),
    tenantId: tenantIdString("tenant.wa.enzo"),
    workloadId: "workload.personal",
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

function admittingIdentity(subjectKey: string): IdentityDirectory {
  let admitted = false;
  const membership = membershipFor();
  return {
    async admitWhatsAppSubject(input) {
      assert.equal(input.subjectKey, subjectKey);
      assert.notEqual(String(membership.principalId), subjectKey);
      assert.notEqual(String(membership.tenantId), subjectKey);
      admitted = true;
      return membershipFor();
    },
    async resolveChannelSubject(input) {
      if (!admitted || input.subjectKey !== subjectKey) {
        throw new ChannelSubjectResolveError({
          kind: "unbound",
          message: "unresolved channel subject: no verified binding",
        });
      }
      return membership;
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
      return membershipFor();
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

test("first unbound 1:1 admits then runs a bound turn without login", async () => {
  const methods: string[] = [];
  const snapshot = {
    account: { accountId: "account.wa.enzo", status: "verified" },
    bindings: [
      {
        accountId: "account.wa.enzo",
        bindingId: "binding.wa.enzo",
        provider: "whatsapp",
        status: "verified",
        subjectKey: speaker,
      },
    ],
    memberships: [
      {
        accountId: "account.wa.enzo",
        actorId: "actor.personal",
        kind: "personal",
        membershipId: "membership.wa.enzo",
        principalId: "principal.wa.enzo",
        status: "active",
        tenantId: "tenant.wa.enzo",
        workloadId: "workload.personal",
      },
    ],
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    methods.push(`${method} ${String(input)}`);
    assert.doesNotMatch(String(input), /\/onboard-tokens/);
    if (method === "GET" && String(input).includes("/resolve-subject")) {
      if (methods.filter((row) => row.startsWith("POST ")).length === 0) {
        return new Response(
          JSON.stringify({ error: "OIDC subject has no verified binding" }),
          { headers: { "content-type": "application/json" }, status: 404 },
        );
      }
      return new Response(JSON.stringify(snapshot), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    if (method === "POST" && String(input).includes("/identity/admin/admit-whatsapp")) {
      return new Response(JSON.stringify(snapshot), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    throw new Error(`unexpected ${method} ${String(input)}`);
  };
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: createIdentityDirectoryClient({
      adminToken: "identity-admin",
      baseUrl: "http://zoend.test",
      fetchImpl,
    }),
    publicWebOrigin: "https://zoen.tironi.xyz",
    session,
  });
  const result = await loop.handleRaw(inbound());
  assert.equal(result.kind, "bound");
  assert.equal(session.sent().length, 1);
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.chatJid, speaker);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.doesNotMatch(sent.shape.text, /\/onboard\//);
    assert.doesNotMatch(
      sent.shape.text,
      /Este WhatsApp ainda não está vinculado|unbound|unlinked|unregistered/i,
    );
    assert.ok(sent.shape.text.trim().length > 0);
  }
  assert.deepEqual(methods, [
    "GET http://zoend.test/identity/admin/resolve-subject?provider=whatsapp&subjectKey=553199941160%40s.whatsapp.net",
    "POST http://zoend.test/identity/admin/admit-whatsapp",
    "GET http://zoend.test/identity/admin/resolve-subject?provider=whatsapp&subjectKey=553199941160%40s.whatsapp.net",
  ]);
  await session.close();
});

test("first real input is accepted without an onboard URL", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: admittingIdentity(speaker),
    session,
  });
  const result = await loop.handleRaw(
    inbound({ body: "anota o leite", messageId: "wamid.note" }),
  );
  assert.equal(result.kind, "bound");
  const sent = session.sent()[0];
  assert.ok(sent);
  assert.equal(sent.shape.kind, "text");
  if (sent.shape.kind === "text") {
    assert.doesNotMatch(sent.shape.text, /\/onboard\/|\/approve\/external\./);
  }
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

test("unbound without admit fails closed and does not send", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: unboundIdentity([]),
    session,
  });
  await assert.rejects(
    () => loop.handleRaw(inbound({ messageId: "wamid.unbound.presence" })),
    (error: unknown) =>
      error instanceof ChannelSubjectResolveError && error.kind === "unbound",
  );
  assert.equal(session.sent().length, 0);
  assert.deepEqual(session.presences(), []);
  await session.close();
});

test("verified ExternalBinding resolves person JID without admit or invented membership", async () => {
  const methods: string[] = [];
  const snapshot = {
    account: { accountId: "account.wa.enzo", status: "verified" },
    bindings: [
      {
        accountId: "account.wa.enzo",
        bindingId: "binding.wa.enzo",
        provider: "whatsapp",
        status: "verified",
        subjectKey: speaker,
      },
    ],
    memberships: [
      {
        accountId: "account.wa.enzo",
        actorId: "actor.personal",
        kind: "personal",
        membershipId: "membership.wa.enzo",
        principalId: "principal.wa.enzo",
        status: "active",
        tenantId: "tenant.wa.enzo",
        workloadId: "workload.personal",
      },
    ],
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    methods.push(`${method} ${String(input)}`);
    if (method === "GET" && String(input).includes("subjectKey=553199941160")) {
      return new Response(JSON.stringify(snapshot), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    if (method === "GET" && String(input).includes("553798136141")) {
      return new Response(JSON.stringify({ error: "OIDC subject has no verified binding" }), {
        headers: { "content-type": "application/json" },
        status: 404,
      });
    }
    throw new Error(`unexpected ${method} ${String(input)}`);
  };
  const identity = createIdentityDirectoryClient({
    adminToken: "identity-admin",
    baseUrl: "http://zoend.test",
    fetchImpl,
  });
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity,
    session,
  });
  const result = await loop.handleRaw(inbound({ messageId: "wamid.bind-verified" }));
  assert.equal(result.kind, "bound");
  assert.equal(session.sent().length, 1);
  assert.equal(session.sent()[0]?.chatJid, speaker);
  assert.deepEqual(methods, [
    "GET http://zoend.test/identity/admin/resolve-subject?provider=whatsapp&subjectKey=553199941160%40s.whatsapp.net",
  ]);
  await assert.rejects(
    () =>
      identity.resolveChannelSubject({
        provider: providerKey("whatsapp"),
        subjectKey: doorJid,
      }),
    (error: unknown) =>
      error instanceof ChannelSubjectResolveError && error.kind === "unbound",
  );
  await session.close();
});

test("acknowledge claim survives companion-shaped restart before the turn replies", async () => {
  const ledger = createMemoryReplyLedger();
  const first = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 80,
    doorE164,
    identity: boundIdentity(speaker),
    ledger,
    session: first,
  });
  const firstResult = await loop.acknowledgeRaw(
    inbound({ messageId: "wamid.restart-claim" }),
  );
  assert.equal(firstResult.kind, "queued");
  assert.equal(first.sent().length, 0);

  const second = await readySession();
  const restarted = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: unboundIdentity([]),
    ledger,
    session: second,
  });
  const afterRestart = await restarted.handleRaw(
    inbound({ messageId: "wamid.restart-claim" }),
  );
  assert.equal(afterRestart.kind, "duplicate");
  assert.equal(second.sent().length, 0);
  await restarted.waitUntilIdle();
  assert.equal(second.sent().length, 0);
  await second.close();

  await loop.waitUntilIdle();
  assert.equal(first.sent().length, 1);
  await first.close();
});

test("restart with the same ledger does not send a second reply", async () => {
  const ledger = createMemoryReplyLedger();
  const first = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: admittingIdentity(speaker),
    ledger,
    session: first,
  });
  const once = await loop.handleRaw(inbound());
  assert.equal(once.kind, "bound");
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
      identity: admittingIdentity(speaker),
      ledger,
      session: first,
    });
    assert.equal((await loop.handleRaw(inbound())).kind, "bound");
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

test("spreadsheet inbound is not dropped as empty", async () => {
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: boundIdentity(speaker),
    session,
  });
  const payload = inbound({
    body: "",
    filename: "quote.xlsx",
    mediaKind: "document",
    mediaRef: "/tmp/quote.xlsx",
    messageId: "wamid.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assert.equal(classifyWhatsAppContactInbound(payload, doorE164).drop, false);
  const result = await loop.handleRaw(payload);
  assert.notEqual(result.kind, "dropped");
  await session.close();
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

test("HTTP inbound with a verified binding never calls admit-whatsapp", async () => {
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  process.env.ZOEN_WHATSAPP_DOOR_E164 = doorE164;
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: boundIdentity(speaker),
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
    const rawBody = JSON.stringify(inbound({ messageId: "wamid.bound-http" }));
    const signed = signStandardWebhook({
      rawBody,
      secret,
      timestampSeconds: Math.floor(Date.now() / 1000),
      webhookId: "msg_bound_http",
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
    assert.equal(body.kind, "bound");
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

test("zoend inbound with processInbound replies through the recording session", async () => {
  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  process.env.ZOEN_WHATSAPP_DOOR_E164 = doorE164;
  const session = await readySession();
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: admittingIdentity(speaker),
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
    assert.equal(body.kind, "bound");
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

function usage() {
  return {
    inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
    outputTokens: { reasoning: 0, text: 1, total: 1 },
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

function createManualClock() {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];
  return {
    pendingCount(): number {
      return timers.filter((timer) => !timer.cancelled).length;
    },
    schedule(fn: () => void, ms: number): ScheduleHandle {
      const timer = { at: now + ms, cancelled: false, fn };
      timers.push(timer);
      return {
        cancel() {
          timer.cancelled = true;
        },
      };
    },
    async advance(ms: number): Promise<void> {
      now += ms;
      const due = timers.filter((timer) => !timer.cancelled && timer.at <= now);
      for (const timer of due) {
        timer.cancelled = true;
        timer.fn();
      }
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

async function waitUntilGateArmed(gate: { pendingCount(): number }): Promise<void> {
  for (let i = 0; i < 50 && gate.pendingCount() === 0; i++) {
    await tick();
  }
  assert.equal(gate.pendingCount(), 1, "status gate never armed");
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !predicate(); i++) {
    await tick();
  }
  assert.equal(predicate(), true, "condition never became true");
}

const STATUS_PHRASE_PT = /^(vendo|anotando|agendando|um seg)$/;

test("bound 1:1 fast model reply sends only the final bubble, no status", async () => {
  const session = await readySession();
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      return step === 1 ? speakCall("ficou 10 each") : stopCall();
    },
  });
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: boundIdentity(speaker),
    model,
    session,
    statusAfterMs: 2000,
  });
  const result = await loop.handleRaw(
    inbound({ body: "quanto ficou", messageId: "wamid.fast-model" }),
  );
  assert.equal(result.kind, "bound");
  assert.equal(session.sent().length, 1);
  const sent = session.sent()[0];
  assert.ok(sent);
  if (sent.shape.kind === "text") {
    assert.equal(sent.shape.text, "ficou 10 each");
  }
  await session.close();
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("bound 1:1 slow model sends exactly one status bubble, then the final answer, in order", async () => {
  const session = await readySession();
  const clock = createManualClock();
  let releaseGenerate: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseGenerate = resolve;
  });
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ task: "consultar" }),
              toolCallId: "call_spawn",
              toolName: "spawn_execution",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool-calls", unified: "tool-calls" },
          usage: usage(),
          warnings: [],
        };
      }
      if (step === 2) {
        await held;
        return speakCall("vendo\nficou 12 each");
      }
      return stopCall();
    },
  });
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    executeWork: async () => "status: ok",
    identity: boundIdentity(speaker),
    model,
    schedule: clock.schedule,
    session,
    statusAfterMs: 2000,
  });
  const chunks: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof original;
  let result: Awaited<ReturnType<typeof loop.handleRaw>>;
  try {
    const turn = loop.handleRaw(
      inbound({ body: "quanto ficou o pedido", messageId: "wamid.slow-model" }),
    );

    await waitUntil(() => step >= 2);
    await waitUntilGateArmed(clock);
    await clock.advance(1999);
    assert.equal(session.sent().length, 0, "no status before the gate elapses");

    await clock.advance(1);
    await tick();
    assert.equal(session.sent().length, 1, "exactly one status bubble at the gate");
    const status = session.sent()[0];
    assert.ok(status);
    if (status.shape.kind === "text") {
      assert.equal(status.shape.text, "vendo");
    }

    releaseGenerate?.();
    result = await turn;
  } finally {
    process.stderr.write = original;
  }
  assert.equal(result.kind, "bound");
  assert.equal(session.sent().length, 2, "status then final, never a duplicate status");
  const final = session.sent()[1];
  assert.ok(final);
  if (final.shape.kind === "text") {
    assert.equal(final.shape.text, "ficou 12 each");
    assert.doesNotMatch(final.shape.text, STATUS_PHRASE_PT);
  }
  const parsed = chunks
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes('"event":"reasonTurn"'))
    .map((line) => JSON.parse(line) as ReasonTurnLog);
  assert.equal(parsed.length, 1);
  assert.deepEqual(Object.keys(parsed[0] ?? {}).sort(), [...REASON_TURN_LOG_KEYS].sort());
  assert.equal(parsed[0]?.statusFired, true);
  assert.ok(parsed[0]?.tools.includes("spawn_execution"));
  assert.ok(parsed[0]?.tools.includes("speak_to_user"));
  await session.close();
});

test("bound 1:1 slow wait sends zero WhatsApp messages", async () => {
  const session = await readySession();
  const clock = createManualClock();
  let releaseGenerate: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseGenerate = resolve;
  });
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        await held;
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
      return stopCall();
    },
  });
  const loop = createWhatsAppContactLoop({
    debounceMs: 0,
    doorE164,
    identity: boundIdentity(speaker),
    model,
    schedule: clock.schedule,
    session,
    statusAfterMs: 2000,
  });
  const turn = loop.handleRaw(
    inbound({ body: "obrigado pela ajuda", messageId: "wamid.slow-wait" }),
  );
  await waitUntilGateArmed(clock);
  await clock.advance(2000);
  await tick();
  assert.equal(session.sent().length, 0, "slow wait must not emit a status bubble");
  releaseGenerate?.();
  const result = await turn;
  assert.equal(result.kind, "bound");
  assert.equal(session.sent().length, 0);
  await session.close();
});

test("provider key stays unofficial whatsapp", () => {
  assert.equal(String(providerKey("whatsapp")), "whatsapp");
});
