import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ChannelSubjectResolveError,
  conversationKeyFrom,
  createConversationTurnCoordinator,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createMemoryControlStore,
  createMemoryTurnStore,
  createPostgresTurnStore,
  deliveryIntentId,
  deliveryObservationId,
  interactionId,
  outboundBubbles,
  presentationIntentRef,
  providerKey,
  runFirstContactTurn,
  runInteractionTurn,
  toInteractionInbound,
  TURN_DEBOUNCE_MS,
  type ClaimResult,
  type ConversationKey,
  type DeliveryIntent,
  type DeliveryObservation,
  type IdentityDirectory,
  type InboundInteraction,
  type PostgresTurnStoreClient,
  type TrustedInteractionContext,
  type TurnStore,
} from "../../speaker/src/index.js";
import { rejectWhatsAppMediaFields } from "./media-ingress.js";
import {
  presentationSchema,
  type PresentationIntent,
} from "./presentation-intent.js";
import {
  parseCompanionInboundEnvelope,
  parseWhatsAppDoorE164,
  WhatsAppEnvelopeError,
  createLiveWhatsAppProvider,
} from "./adapters/whatsapp-live.js";
import {
  isGroupJid,
  isPersonPhoneJid,
  type CompanionPresenceState,
  type CompanionSession,
} from "./companion-session.js";
import {
  createMessagingGateway,
  type MessagingGateway,
} from "./gateway.js";

export type WhatsAppContactDropReason =
  | "from_me"
  | "door_is_person"
  | "group"
  | "empty";

export type WhatsAppContactDisposition =
  | {
      readonly kind: "dropped";
      readonly reason: WhatsAppContactDropReason;
    }
  | {
      readonly kind: "duplicate";
      readonly inbound: InboundInteraction;
      readonly observation: DeliveryObservation;
    }
  | {
      readonly kind: "unbound";
      readonly inbound: InboundInteraction;
      readonly observation: DeliveryObservation;
    }
  | {
      readonly kind: "bound";
      readonly inbound: InboundInteraction;
      readonly observation: DeliveryObservation;
    }
  | {
      readonly kind: "queued";
      readonly inbound: InboundInteraction;
    };

type StoredReply = Extract<
  WhatsAppContactDisposition,
  { kind: "unbound" | "bound" }
>;

export interface ReplyLedger {
  get(idempotencyKey: string): Promise<StoredReply | undefined>;
  put(idempotencyKey: string, disposition: StoredReply): Promise<void>;
}

export interface WhatsAppContactLoop {
  readonly gateway: MessagingGateway;
  handleRaw(raw: unknown): Promise<WhatsAppContactDisposition>;
  /** Enqueue and rearm debounce. HTTP hops should call this, not handleRaw. */
  acknowledgeRaw(raw: unknown): Promise<WhatsAppContactDisposition>;
  waitUntilIdle(): Promise<void>;
}

export interface WhatsAppContactLoopOptions {
  readonly session: CompanionSession;
  readonly identity: IdentityDirectory;
  readonly ledger?: ReplyLedger;
  readonly store?: TurnStore;
  readonly debounceMs?: number;
  readonly doorE164?: string;
  readonly publicWebOrigin?: string;
  readonly now?: () => Date;
  readonly executeWork?: (task: string) => Promise<string>;
  readonly generateFirstContact?: (inboundText: string) => Promise<string>;
}

export function createMemoryReplyLedger(): ReplyLedger {
  const rows = new Map<string, StoredReply>();
  return {
    async get(idempotencyKey) {
      return rows.get(idempotencyKey);
    },
    async put(idempotencyKey, disposition) {
      if (rows.has(idempotencyKey)) {
        return;
      }
      rows.set(idempotencyKey, disposition);
    },
  };
}

export function createPostgresReplyLedger(
  client: PostgresTurnStoreClient,
): ReplyLedger {
  return {
    async get(idempotencyKey) {
      const result = await client.query(
        `SELECT disposition FROM reply_ledger WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return undefined;
      }
      const value = row.disposition;
      const parsed =
        typeof value === "string" ? (JSON.parse(value) as unknown) : value;
      return isStoredReply(parsed) ? parsed : undefined;
    },
    async put(idempotencyKey, disposition) {
      await client.query(
        `INSERT INTO reply_ledger (idempotency_key, disposition)
         VALUES ($1, $2)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [idempotencyKey, JSON.stringify(disposition)],
      );
    },
  };
}

export function createFileReplyLedger(filePath: string): ReplyLedger {
  const rows = new Map<string, StoredReply>();
  let loaded = false;
  let writeChain = Promise.resolve();

  async function load(): Promise<void> {
    if (loaded) {
      return;
    }
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        loaded = true;
        return;
      }
      throw error;
    }
    const parsed: unknown = text.trim().length === 0 ? [] : JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("whatsapp reply ledger must be an array");
    }
    for (const row of parsed) {
      if (row === null || typeof row !== "object") {
        continue;
      }
      const record = row as {
        idempotencyKey?: unknown;
        disposition?: unknown;
      };
      if (typeof record.idempotencyKey !== "string") {
        continue;
      }
      if (isStoredReply(record.disposition)) {
        rows.set(record.idempotencyKey, record.disposition);
      }
    }
    loaded = true;
  }

  async function persist(): Promise<void> {
    const entries = [...rows.entries()].map(([idempotencyKey, disposition]) => ({
      disposition,
      idempotencyKey,
    }));
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${String(process.pid)}.tmp`;
    await writeFile(tmp, `${JSON.stringify(entries)}\n`);
    await rename(tmp, filePath);
  }

  return {
    async get(idempotencyKey) {
      await load();
      return rows.get(idempotencyKey);
    },
    async put(idempotencyKey, disposition) {
      await load();
      if (rows.has(idempotencyKey)) {
        return;
      }
      rows.set(idempotencyKey, disposition);
      writeChain = writeChain.then(persist);
      await writeChain;
    },
  };
}

export function createWhatsAppContactLoop(
  options: WhatsAppContactLoopOptions,
): WhatsAppContactLoop {
  const doorE164 = parseWhatsAppDoorE164(
    options.doorE164 ?? process.env.ZOEN_WHATSAPP_DOOR_E164,
  );
  const ledger = options.ledger ?? createMemoryReplyLedger();
  const now = options.now ?? (() => new Date());
  const bodies = new Map<string, string>();
  const inflight = new Map<string, Promise<WhatsAppContactDisposition>>();
  const pumps = new Map<string, Promise<void>>();
  const provider = createLiveWhatsAppProvider({ session: options.session });
  const gateway = createMessagingGateway({
    now,
    publicWebOrigin: options.publicWebOrigin ?? "https://app.zoen.local",
    providers: { whatsapp: provider },
    resolvePresentation: async (intent) => {
      const body = bodies.get(intent.stableProviderDeliveryId);
      if (body === undefined) {
        throw new Error("whatsapp contact loop missing presentation body");
      }
      return {
        disclosedBody: body,
        disclosure: { kind: "deliver_full" as const },
        includesConfidentialBody: false,
        intent: textPresentation(String(intent.presentation), body, now()),
      };
    },
  });
  const store = options.store ?? createMemoryTurnStore();
  const outboundByAttempt = new Map<string, string[]>();
  const coordinator = createConversationTurnCoordinator({
    debounceMs: options.debounceMs ?? TURN_DEBOUNCE_MS,
    deliver: async (intent: DeliveryIntent) => {
      const attemptId = intent.turnAttemptId;
      const bubbles =
        attemptId === undefined ? undefined : outboundByAttempt.get(attemptId);
      const text = bubbles?.[intent.sequenceIndex ?? 0];
      if (text === undefined) {
        throw new Error("bound whatsapp turn missing outbound bubble");
      }
      bodies.set(intent.stableProviderDeliveryId, text);
      const observation = await gateway.deliver(intent);
      return observation.outcome;
    },
    now,
    store,
  });
  const boundary = createInteractionBoundary({
    controls: createInteractionControlRegistry({
      store: createMemoryControlStore(),
    }),
    correlationNamespace: "whatsapp.contact.v1",
    identity: options.identity,
    now,
  });

  async function finishBoundTurn(
    claimed: ClaimResult,
    membership: TrustedInteractionContext,
  ): Promise<DeliveryObservation> {
    const primaryId =
      claimed.attempt.claimedInteractionIds[0] ??
      claimed.attempt.carryForwardInteractionIds[0];
    if (primaryId === undefined) {
      throw new Error("bound whatsapp turn claimed no inbound");
    }
    const record = await store.getRecord(primaryId);
    if (record === undefined) {
      throw new Error("bound whatsapp turn missing InteractionRecord");
    }
    const chatJid = String(record.inbound.channel.thread);
    await sendPresence(options.session, chatJid, "composing");
    try {
      const reply = await runInteractionTurn({
        attemptId: claimed.attempt.id,
        coordinator,
        debounceMs: options.debounceMs ?? TURN_DEBOUNCE_MS,
        executeWork: options.executeWork,
        inbound: toInteractionInbound(record.inbound),
        membership,
        now,
        store,
      });
      const bubbles = outboundBubbles(reply);
      outboundByAttempt.set(claimed.attempt.id, bubbles);
      const delivered =
        bubbles.length === 0
          ? await coordinator.acknowledgeSilentClose(claimed.attempt.id)
          : await coordinator.planAndDeliver({
              attemptId: claimed.attempt.id,
              presentation: `turn:${claimed.turn.id}`,
              sequenceCount: bubbles.length,
            });
      return delivered[delivered.length - 1] ?? waitObservation(claimed.attempt.id);
    } finally {
      await sendPresence(options.session, chatJid, "paused");
    }
  }

  function ensurePump(conversationKey: ConversationKey): Promise<void> {
    const existing = pumps.get(conversationKey);
    if (existing !== undefined) {
      return existing;
    }
    const run = (async () => {
      try {
        for (;;) {
          const claimed = await coordinator.awaitClaim(conversationKey);
          if (claimed === undefined) {
            const leftover = await store.selectUnclaimed(conversationKey);
            if (leftover.length === 0) {
              return;
            }
            continue;
          }
          const primaryId =
            claimed.attempt.claimedInteractionIds[0] ??
            claimed.attempt.carryForwardInteractionIds[0];
          if (primaryId === undefined) {
            continue;
          }
          const record = await store.getRecord(primaryId);
          if (record === undefined) {
            continue;
          }
          const observation = await finishBoundTurn(claimed, record.ctx);
          for (const interactionId of claimed.attempt.claimedInteractionIds) {
            const claimedRecord = await store.getRecord(interactionId);
            if (claimedRecord === undefined) {
              continue;
            }
            await ledger.put(claimedRecord.inbound.idempotencyKey, {
              inbound: claimedRecord.inbound,
              kind: "bound",
              observation,
            });
          }
        }
      } finally {
        pumps.delete(conversationKey);
      }
    })();
    pumps.set(conversationKey, run);
    return run;
  }

  async function enqueueBound(
    inbound: InboundInteraction,
  ): Promise<WhatsAppContactDisposition> {
    const ctx = await boundary.resolveTrustedContext(inbound);
    const record = await boundary.accept(inbound, ctx);
    const conversationKey = conversationKeyFrom({
      accountId: ctx.accountId,
      conversationId: `wa:${String(inbound.channel.thread)}`,
      tenantId: String(ctx.tenantId),
      workspaceId: ctx.workloadId,
    });
    await coordinator.signalInbound({
      conversationKey,
      record,
      workspaceId: ctx.workloadId,
    });
    ensurePump(conversationKey);
    return { inbound, kind: "queued" };
  }

  async function dispatchRaw(
    raw: unknown,
    wait: boolean,
  ): Promise<WhatsAppContactDisposition> {
    rejectWhatsAppMediaFields(raw);
    const dropped = classifyWhatsAppContactInbound(raw, doorE164);
    if (dropped.drop) {
      return { kind: "dropped", reason: dropped.reason };
    }
    const inbound = await gateway.acceptProviderEvent(
      providerKey("whatsapp"),
      raw,
    );
    const existing = await ledger.get(inbound.idempotencyKey);
    if (existing !== undefined) {
      return {
        inbound,
        kind: "duplicate",
        observation: existing.observation,
      };
    }
    const pending = inflight.get(inbound.idempotencyKey);
    if (pending !== undefined) {
      return pending;
    }
    const work = (async (): Promise<WhatsAppContactDisposition> => {
      try {
        const queued = await enqueueBound(inbound);
        if (!wait) {
          return queued;
        }
        await waitUntilIdle();
        const stored = await ledger.get(inbound.idempotencyKey);
        if (stored === undefined) {
          throw new Error("bound whatsapp turn claimed no inbound");
        }
        return stored;
      } catch (error) {
        if (
          !(error instanceof ChannelSubjectResolveError) ||
          error.kind !== "unbound"
        ) {
          throw error;
        }
        const stored: StoredReply = {
          inbound,
          kind: "unbound",
          observation: await deliverPoke(inbound),
        };
        await ledger.put(inbound.idempotencyKey, stored);
        return stored;
      }
    })();
    inflight.set(inbound.idempotencyKey, work);
    try {
      return await work;
    } finally {
      inflight.delete(inbound.idempotencyKey);
    }
  }

  async function waitUntilIdle(): Promise<void> {
    for (;;) {
      const running = [...pumps.values()];
      if (running.length === 0) {
        return;
      }
      await Promise.all(running);
    }
  }

  async function deliverPoke(
    inbound: InboundInteraction,
  ): Promise<DeliveryObservation> {
    const inboundText = inbound.body.kind === "text" ? inbound.body.text : "";
    const spoken = await runFirstContactTurn({
      generate: options.generateFirstContact,
      inboundText,
    });
    const stableProviderDeliveryId = inbound.idempotencyKey;
    bodies.set(stableProviderDeliveryId, spoken);
    return gateway.deliver({
      controlRefs: [],
      id: deliveryIntentId(deliveryIdFrom(inbound.idempotencyKey)),
      presentation: presentationIntentRef("whatsapp.unbound.poke"),
      provider: inbound.channel.provider,
      recordId: interactionId(recordIdFrom(inbound.idempotencyKey)),
      sequenceIndex: 0,
      stableProviderDeliveryId,
      target: {
        kind: "same_thread",
        thread: inbound.channel.thread,
      },
    });
  }

  void coordinator.recoverPending();

  return {
    gateway,

    acknowledgeRaw(raw) {
      return dispatchRaw(raw, false);
    },

    handleRaw(raw) {
      return dispatchRaw(raw, true);
    },

    waitUntilIdle,
  };
}

export function classifyWhatsAppContactInbound(
  raw: unknown,
  doorE164: string,
): { drop: true; reason: WhatsAppContactDropReason } | { drop: false } {
  if (raw === null || typeof raw !== "object") {
    throw new WhatsAppEnvelopeError("companion inbound must be an object");
  }
  const record = raw as Record<string, unknown>;
  if (record.object === "whatsapp_business_account") {
    throw new WhatsAppEnvelopeError(
      "Cloud API envelope is not the Brazil WhatsApp path",
    );
  }
  if (record.fromMe === true) {
    return { drop: true, reason: "from_me" };
  }
  const chatJid = stringField(record.chatJid);
  const senderJid = stringField(record.senderJid);
  const senderAltJid = stringField(record.senderAltJid);
  if (record.isGroup === true || isGroupJid(chatJid)) {
    return { drop: true, reason: "group" };
  }
  const body = stringField(record.body);
  const callback =
    typeof record.callbackData === "string" ? record.callbackData.trim() : "";
  if (body.length === 0 && callback.length === 0) {
    return { drop: true, reason: "empty" };
  }
  const person =
    senderAltJid.length > 0 && isPersonPhoneJid(senderAltJid)
      ? senderAltJid
      : senderJid;
  if (
    isDoorJid(person, doorE164) ||
    isDoorJid(chatJid, doorE164) ||
    isDoorJid(senderJid, doorE164)
  ) {
    return { drop: true, reason: "door_is_person" };
  }
  parseCompanionInboundEnvelope(raw);
  return { drop: false };
}

async function sendPresence(
  session: CompanionSession,
  chatJid: string,
  state: CompanionPresenceState,
): Promise<void> {
  try {
    await session.presence(chatJid, state);
  } catch {
    return;
  }
}

function isDoorJid(jid: string, doorE164: string): boolean {
  const doorDigits = doorE164.replace(/\D/g, "");
  if (doorDigits.length === 0 || jid.trim().length === 0) {
    return false;
  }
  const at = jid.indexOf("@");
  const user = at === -1 ? jid : jid.slice(0, at);
  return user.replace(/\D/g, "") === doorDigits;
}

function waitObservation(attemptId: string): DeliveryObservation {
  return {
    id: deliveryObservationId(`do_wait_${attemptId}`.slice(0, 200)),
    intentId: deliveryIntentId(`di_wait_${attemptId}`.slice(0, 200)),
    observedAt: new Date().toISOString(),
    outcome: { kind: "unknown" },
  };
}

function textPresentation(
  ref: string,
  body: string,
  createdAt: Date,
): PresentationIntent {
  return {
    blocks: [{ body, kind: "text" }],
    createdAt: createdAt.toISOString(),
    fullBodyText: body,
    ref: presentationIntentRef(ref),
    schema: presentationSchema,
    surfaceDigest: "whatsapp.contact.text",
    surfaceId: "whatsapp.contact",
  };
}

function deliveryIdFrom(idempotencyKey: string): string {
  return `di_${shortHash(idempotencyKey)}`;
}

function recordIdFrom(idempotencyKey: string): string {
  return `ixn_${shortHash(idempotencyKey)}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code === "ENOENT"
  );
}

function isStoredReply(value: unknown): value is StoredReply {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "unbound" || kind === "bound";
}
