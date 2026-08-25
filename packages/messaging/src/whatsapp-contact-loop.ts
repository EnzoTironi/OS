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
  deliveryIntentId,
  deliveryObservationId,
  interactionId,
  outboundBubbles,
  presentationIntentRef,
  providerKey,
  runInteractionTurn,
  type DeliveryIntent,
  type DeliveryObservation,
  type IdentityDirectory,
  type InboundInteraction,
  type TrustedInteractionContext,
} from "../../interaction/src/index.js";
import {
  presentationSchema,
  type PresentationIntent,
} from "../../surface/src/presentation-intent.js";
import {
  parseCompanionInboundEnvelope,
  parseWhatsAppDoorE164,
  WhatsAppEnvelopeError,
  createLiveWhatsAppProvider,
} from "./adapters/whatsapp-live.js";
import {
  isGroupJid,
  isPersonPhoneJid,
  type CompanionSession,
} from "./companion-session.js";
import {
  createMessagingGateway,
  type MessagingGateway,
} from "./gateway.js";

export const UNBOUND_WHATSAPP_POKE_TEXT =
  "Este WhatsApp ainda não está vinculado a uma conta Zoen.";

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
}

export interface BoundWhatsAppReply {
  readonly text: string;
}

export interface WhatsAppContactLoopOptions {
  readonly session: CompanionSession;
  readonly identity: IdentityDirectory;
  readonly ledger?: ReplyLedger;
  readonly doorE164?: string;
  readonly publicWebOrigin?: string;
  readonly now?: () => Date;
  readonly boundReply?: (input: {
    readonly inbound: InboundInteraction;
    readonly ctx: TrustedInteractionContext;
  }) => Promise<BoundWhatsAppReply>;
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
  const store = createMemoryTurnStore();
  const outboundByAttempt = new Map<string, string[]>();
  const coordinator = createConversationTurnCoordinator({
    debounceMs: 30_000,
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

  async function settleInbound(
    inbound: InboundInteraction,
  ): Promise<WhatsAppContactDisposition> {
    let stored: StoredReply;
    try {
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
      const claimed = await coordinator.claimBurst(conversationKey);
      if (claimed === undefined) {
        throw new Error("bound whatsapp turn claimed no inbound");
      }
      const reply =
        options.boundReply === undefined
          ? await runInteractionTurn({
              attemptId: claimed.attempt.id,
              coordinator,
              inbound: record.inbound,
              membership: ctx,
              now,
              store,
            })
          : {
              bubbles: [
                (
                  await options.boundReply({
                    ctx: record.ctx,
                    inbound: record.inbound,
                  })
                ).text,
              ],
            };
      const bubbles = outboundBubbles(reply);
      outboundByAttempt.set(claimed.attempt.id, bubbles);
      const delivered =
        bubbles.length === 0
          ? []
          : await coordinator.planAndDeliver({
              attemptId: claimed.attempt.id,
              presentation: `turn:${claimed.turn.id}`,
              sequenceCount: bubbles.length,
            });
      const observation =
        delivered[delivered.length - 1] ??
        waitObservation(claimed.attempt.id);
      stored = { inbound, kind: "bound", observation };
    } catch (error) {
      if (
        !(error instanceof ChannelSubjectResolveError) ||
        error.kind !== "unbound"
      ) {
        throw error;
      }
      stored = {
        inbound,
        kind: "unbound",
        observation: await deliverPoke(inbound),
      };
    }
    await ledger.put(inbound.idempotencyKey, stored);
    return stored;
  }

  async function deliverPoke(
    inbound: InboundInteraction,
  ): Promise<DeliveryObservation> {
    const stableProviderDeliveryId = inbound.idempotencyKey;
    bodies.set(stableProviderDeliveryId, UNBOUND_WHATSAPP_POKE_TEXT);
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

  return {
    gateway,

    async handleRaw(raw) {
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
      const work = settleInbound(inbound);
      inflight.set(inbound.idempotencyKey, work);
      try {
        return await work;
      } finally {
        inflight.delete(inbound.idempotencyKey);
      }
    },
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
