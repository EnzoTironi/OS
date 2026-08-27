import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LanguageModel } from "ai";
import {
  ChannelSubjectResolveError,
  classifyStatusIntent,
  conversationKeyFromChannel,
  createConversationTurnCoordinator,
  createInteractionBoundary,
  createInteractionControlRegistry,
  createInteractionScratch,
  createLiveConversationAssembler,
  createMemoryControlStore,
  createMemoryTurnStore,
  createPostgresTurnStore,
  deliveryIntentId,
  deliveryObservationId,
  detectInboundLocale,
  dropLeadingStatusPhrase,
  finalDeliveryId,
  outboundBubbles,
  pickStatusPhrase,
  presentationIntentRef,
  providerKey,
  raceWithStatusGate,
  resolvePublicOrigin,
  runInteractionTurn,
  statusDeliveryId,
  toInteractionInbound,
  TURN_DEBOUNCE_MS,
  TURN_STATUS_AFTER_MS,
  type ClaimResult,
  type ConversationContextAssembler,
  type ConversationKey,
  type DeliveryIntent,
  type DeliveryObservation,
  type IdentityDirectory,
  type InboundInteraction,
  type PostgresTurnStoreClient,
  type ScheduleFn,
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

type LedgerRecord =
  | { readonly kind: "accepted"; readonly inbound: InboundInteraction }
  | StoredReply;

export interface ReplyLedger {
  get(idempotencyKey: string): Promise<LedgerRecord | undefined>;
  /**
   * Insert an accepted claim. Returns true when this process owns the inbound.
   * Companion restart posts a new webhook-id; the claim is keyed by message id.
   */
  claim(idempotencyKey: string, inbound: InboundInteraction): Promise<boolean>;
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
  /** Tier 2 model override, mainly for tests. Production reads ZOEN_MODEL. */
  readonly model?: LanguageModel;
  /** Status gate threshold in ms. Default TURN_STATUS_AFTER_MS (2000). */
  readonly statusAfterMs?: number;
  /** Injectable timer for the status gate, mainly for tests. */
  readonly schedule?: ScheduleFn;
  /**
   * Bound-turn assembler. Default is store + World/memory/History from env.
   * Unset World env keeps the store-only path.
   */
  readonly assembler?: ConversationContextAssembler;
}

export function createMemoryReplyLedger(): ReplyLedger {
  const rows = new Map<string, LedgerRecord>();
  return {
    async get(idempotencyKey) {
      return rows.get(idempotencyKey);
    },
    async claim(idempotencyKey, inbound) {
      if (rows.has(idempotencyKey)) {
        return false;
      }
      rows.set(idempotencyKey, { inbound, kind: "accepted" });
      return true;
    },
    async put(idempotencyKey, disposition) {
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
      return isLedgerRecord(parsed) ? parsed : undefined;
    },
    async claim(idempotencyKey, inbound) {
      const result = await client.query(
        `INSERT INTO reply_ledger (idempotency_key, disposition)
         VALUES ($1, $2)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, JSON.stringify({ inbound, kind: "accepted" })],
      );
      return result.rows[0] !== undefined;
    },
    async put(idempotencyKey, disposition) {
      await client.query(
        `INSERT INTO reply_ledger (idempotency_key, disposition)
         VALUES ($1, $2)
         ON CONFLICT (idempotency_key) DO UPDATE
         SET disposition = EXCLUDED.disposition`,
        [idempotencyKey, JSON.stringify(disposition)],
      );
    },
  };
}

export function createFileReplyLedger(filePath: string): ReplyLedger {
  const rows = new Map<string, LedgerRecord>();
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
      if (isLedgerRecord(record.disposition)) {
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
    async claim(idempotencyKey, inbound) {
      await load();
      if (rows.has(idempotencyKey)) {
        return false;
      }
      rows.set(idempotencyKey, { inbound, kind: "accepted" });
      writeChain = writeChain.then(persist);
      await writeChain;
      return true;
    },
    async put(idempotencyKey, disposition) {
      await load();
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
    publicWebOrigin: resolvePublicOrigin(options.publicWebOrigin),
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
  const assembler =
    options.assembler ??
    createLiveConversationAssembler({
      now,
      store,
    });
  const outboundByAttempt = new Map<string, Map<string, string>>();
  const coordinator = createConversationTurnCoordinator({
    assembler,
    debounceMs: options.debounceMs ?? TURN_DEBOUNCE_MS,
    deliver: async (intent: DeliveryIntent) => {
      const attemptId = intent.turnAttemptId;
      const bubbles =
        attemptId === undefined ? undefined : outboundByAttempt.get(attemptId);
      const text = bubbles?.get(intent.stableProviderDeliveryId);
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
      const inbound = toInteractionInbound(record.inbound);
      const inboundText = inbound.kind === "text" ? inbound.text : "";
      const locale = detectInboundLocale(inboundText);
      const intent = classifyStatusIntent(inboundText);
      const scratch = createInteractionScratch();
      const statusId = statusDeliveryId(primaryId);
      const raced = await raceWithStatusGate({
        gateMs: options.statusAfterMs ?? TURN_STATUS_AFTER_MS,
        onGate: async () => {
          if (scratch.waited || !scratch.startedWork) {
            return;
          }
          setOutboundBubble(
            outboundByAttempt,
            claimed.attempt.id,
            statusId,
            pickStatusPhrase(locale, intent),
          );
          const sent = await coordinator.deliverStatusLine({
            attemptId: claimed.attempt.id,
            presentation: `turn:${claimed.turn.id}:status`,
          });
          if (sent === undefined) {
            throw new Error("status line not delivered");
          }
        },
        schedule: options.schedule,
        work: runInteractionTurn({
          assembler,
          attemptId: claimed.attempt.id,
          channelAssurance: "whatsapp_phone",
          coordinator,
          debounceMs: options.debounceMs ?? TURN_DEBOUNCE_MS,
          executeWork: options.executeWork,
          inbound,
          membership,
          model: options.model,
          now,
          publicWebOrigin: options.publicWebOrigin,
          scratch,
          store,
        }),
      });
      let bubbles = outboundBubbles(raced.value);
      if (raced.gated) {
        bubbles = dropLeadingStatusPhrase(bubbles, locale);
      }
      bubbles.forEach((text, index) =>
        setOutboundBubble(
          outboundByAttempt,
          claimed.attempt.id,
          finalDeliveryId(primaryId, index),
          text,
        ),
      );
      const delivered =
        bubbles.length === 0
          ? await coordinator.acknowledgeSilentClose(claimed.attempt.id)
          : await coordinator.planAndDeliver({
              attemptId: claimed.attempt.id,
              presentation: `turn:${claimed.turn.id}`,
              sequenceCount: bubbles.length,
            });
      return delivered[delivered.length - 1] ?? waitObservation(claimed.attempt.id);
    } catch (error) {
      const attempt = await coordinator.getAttempt(claimed.attempt.id);
      if (attempt?.phase.kind === "superseded") {
        return waitObservation(claimed.attempt.id);
      }
      throw error;
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
    const claimed = await ledger.claim(inbound.idempotencyKey, inbound);
    if (!claimed) {
      const existing = await ledger.get(inbound.idempotencyKey);
      return {
        inbound,
        kind: "duplicate",
        observation: observationFromLedger(existing, inbound.idempotencyKey),
      };
    }
    const record = await boundary.accept(inbound, ctx);
    const conversationKey = conversationKeyFromChannel({
      accountId: ctx.accountId,
      channel: inbound.channel,
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
        observation: observationFromLedger(existing, inbound.idempotencyKey),
      };
    }
    const pending = inflight.get(inbound.idempotencyKey);
    if (pending !== undefined) {
      return pending;
    }
    const work = (async (): Promise<WhatsAppContactDisposition> => {
      try {
        return await enqueueAndMaybeWait(inbound, wait);
      } catch (error) {
        if (
          !(error instanceof ChannelSubjectResolveError) ||
          error.kind !== "unbound"
        ) {
          throw error;
        }
        if (options.identity.admitWhatsAppSubject === undefined) {
          throw error;
        }
        await options.identity.admitWhatsAppSubject({
          provider: inbound.channel.provider,
          subjectKey: String(inbound.channel.providerUser),
        });
        return enqueueAndMaybeWait(inbound, wait);
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

  async function enqueueAndMaybeWait(
    inbound: InboundInteraction,
    wait: boolean,
  ): Promise<WhatsAppContactDisposition> {
    const queued = await enqueueBound(inbound);
    if (!wait || queued.kind === "duplicate") {
      return queued;
    }
    await waitUntilIdle();
    const stored = await ledger.get(inbound.idempotencyKey);
    if (stored === undefined || stored.kind === "accepted") {
      throw new Error("bound whatsapp turn claimed no inbound");
    }
    return stored;
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
  const mediaKind = stringField(record.mediaKind);
  const mediaRef = stringField(record.mediaRef);
  if (
    body.length === 0 &&
    callback.length === 0 &&
    mediaKind.length === 0 &&
    mediaRef.length === 0
  ) {
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

function setOutboundBubble(
  map: Map<string, Map<string, string>>,
  attemptId: string,
  stableProviderDeliveryId: string,
  text: string,
): void {
  const existing = map.get(attemptId) ?? new Map<string, string>();
  existing.set(stableProviderDeliveryId, text);
  map.set(attemptId, existing);
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

function observationFromLedger(
  record: LedgerRecord | undefined,
  fallbackKey: string,
): DeliveryObservation {
  if (record !== undefined && (record.kind === "bound" || record.kind === "unbound")) {
    return record.observation;
  }
  return waitObservation(fallbackKey);
}

function isLedgerRecord(value: unknown): value is LedgerRecord {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "accepted" || kind === "unbound" || kind === "bound";
}
