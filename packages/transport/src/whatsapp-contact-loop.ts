import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  deliveryIntentId,
  deliveryObservationId,
  providerKey,
} from "./brands.js";
import type {
  DeliveryObservation,
  InboundInteraction,
} from "./channel.js";
import {
  ChannelSubjectResolveError,
  type IdentityDirectory,
} from "./identity-directory.js";
import { resolvePublicOrigin } from "./public-origin.js";
import type { PostgresQueryClient } from "./postgres-query.js";
import { rejectWhatsAppMediaFields } from "./media-ingress.js";
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

type LedgerRecord =
  | { readonly kind: "accepted"; readonly inbound: InboundInteraction }
  | StoredReply;

export interface ReplyLedger {
  get(idempotencyKey: string): Promise<LedgerRecord | undefined>;
  claim(idempotencyKey: string, inbound: InboundInteraction): Promise<boolean>;
  put(idempotencyKey: string, disposition: StoredReply): Promise<void>;
}

export interface WhatsAppContactLoop {
  readonly gateway: MessagingGateway;
  handleRaw(raw: unknown): Promise<WhatsAppContactDisposition>;
  acknowledgeRaw(raw: unknown): Promise<WhatsAppContactDisposition>;
  waitUntilIdle(): Promise<void>;
}

export interface WhatsAppContactLoopOptions {
  readonly session: CompanionSession;
  readonly identity: IdentityDirectory;
  readonly ledger?: ReplyLedger;
  readonly doorE164?: string;
  readonly publicWebOrigin?: string;
  readonly now?: () => Date;
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
  client: PostgresQueryClient,
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
  const provider = createLiveWhatsAppProvider({ session: options.session });
  const gateway = createMessagingGateway({
    now,
    publicWebOrigin: resolvePublicOrigin(options.publicWebOrigin),
    providers: { whatsapp: provider },
    resolvePresentation: async () => {
      throw new Error("whatsapp contact loop does not deliver leftover chat");
    },
  });

  async function dispatchRaw(
    raw: unknown,
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
    try {
      return await admitAndClaim(inbound);
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
      return admitAndClaim(inbound);
    }
  }

  async function admitAndClaim(
    inbound: InboundInteraction,
  ): Promise<WhatsAppContactDisposition> {
    await options.identity.resolveChannelSubject({
      provider: inbound.channel.provider,
      subjectKey: String(inbound.channel.providerUser),
    });
    const claimed = await ledger.claim(inbound.idempotencyKey, inbound);
    if (!claimed) {
      const raced = await ledger.get(inbound.idempotencyKey);
      return {
        inbound,
        kind: "duplicate",
        observation: observationFromLedger(raced, inbound.idempotencyKey),
      };
    }
    const observation = idleObservation(inbound.idempotencyKey);
    const bound: StoredReply = { inbound, kind: "bound", observation };
    await ledger.put(inbound.idempotencyKey, bound);
    return bound;
  }

  return {
    gateway,
    acknowledgeRaw: dispatchRaw,
    handleRaw: dispatchRaw,
    async waitUntilIdle() {
      return;
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

function isDoorJid(jid: string, doorE164: string): boolean {
  const doorDigits = doorE164.replace(/\D/g, "");
  if (doorDigits.length === 0 || jid.trim().length === 0) {
    return false;
  }
  const at = jid.indexOf("@");
  const user = at === -1 ? jid : jid.slice(0, at);
  return user.replace(/\D/g, "") === doorDigits;
}

function idleObservation(key: string): DeliveryObservation {
  const clipped = key.slice(0, 180);
  return {
    id: deliveryObservationId(`do_idle_${clipped}`),
    intentId: deliveryIntentId(`di_idle_${clipped}`),
    observedAt: new Date().toISOString(),
    outcome: { kind: "unknown" },
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
  return idleObservation(fallbackKey);
}

function isLedgerRecord(value: unknown): value is LedgerRecord {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "accepted" || kind === "unbound" || kind === "bound";
}
