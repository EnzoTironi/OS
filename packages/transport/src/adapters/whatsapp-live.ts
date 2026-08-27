import {
  createCapabilityProbes,
  type CapabilityProbes,
  type ProbeAnswer,
} from "../capability-probes.js";
import type {
  ChatSdkDeliveryReceipt,
  ChatSdkMessage,
  ChatSdkOutbound,
  ChatSdkShapedAdapter,
} from "../chat-sdk-shape.js";
import {
  companionSessionIsReady,
  composeOutboundChatJid,
  createHttpCompanionSession,
  isGroupJid,
  isPersonPhoneJid,
  type CompanionInbound,
  type CompanionReady,
  type CompanionSession,
  type WhatsAppWireShape,
} from "../companion-session.js";

const NATIVE: ProbeAnswer = { status: "native" };
const TEXT: ProbeAnswer = { status: "unsupported", degradeTo: "text" };
const LINK: ProbeAnswer = { status: "unsupported", degradeTo: "link" };

const WHATSAPP_TABLE = {
  dm: NATIVE,
  ephemeral: NATIVE,
  group: NATIVE,
  image_file: TEXT,
  native_button: TEXT,
  native_card: TEXT,
  native_link: LINK,
  proactive_outbound: NATIVE,
  reactions: NATIVE,
  read_receipts: NATIVE,
  reply_thread: NATIVE,
  text: NATIVE,
  // Chat SDK typing stays text-degrade. Live composing is companion /presence.
  typing: TEXT,
  voice_audio: TEXT,
} as const;

export const PERSONAL_WHATSAPP_DOOR_E164 = "+5531999941160";

/** Personal inbox JID. Bind this. Never bind the Vivo door. */
export const PERSON_WHATSAPP_SUBJECT_JID = "553199941160@s.whatsapp.net";

const ITU_E164 = /^\+[1-9]\d{6,14}$/;
const PERSONAL_DOOR_SUFFIXES = ["3199941160", "31999941160"] as const;

export class LiveWhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveWhatsAppConfigError";
  }
}

export class WhatsAppEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppEnvelopeError";
  }
}

export class WhatsAppSurfaceUrlError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`whatsapp surfaceUrl rejected: ${url}`);
    this.name = "WhatsAppSurfaceUrlError";
    this.url = url;
  }
}

export interface LiveWhatsAppProvider extends ChatSdkShapedAdapter {
  readonly kind: "live";
  readonly session: CompanionSession;
}

export function parseWhatsAppDoorE164(
  raw: string | undefined,
): string {
  if (raw === undefined || raw.trim().length === 0) {
    throw new LiveWhatsAppConfigError(
      "ZOEN_WHATSAPP_DOOR_E164 required (fail closed)",
    );
  }
  const value = raw.trim();
  const digits = value.replace(/\D/g, "");
  if (PERSONAL_DOOR_SUFFIXES.some((suffix) => digits.endsWith(suffix))) {
    throw new LiveWhatsAppConfigError(
      "personal inbox is not the Zoen door (fail closed)",
    );
  }
  if (!ITU_E164.test(value)) {
    throw new LiveWhatsAppConfigError(
      "ZOEN_WHATSAPP_DOOR_E164 must be E.164 (+ then 7 to 15 digits)",
    );
  }
  return value;
}

/**
 * Bind the person inbox JID. Fail closed on the Vivo door or a non-person JID.
 */
export function assertWhatsAppPersonSubject(
  subjectKey: string,
  doorE164: string,
): string {
  const subject = subjectKey.trim();
  if (!isPersonPhoneJid(subject)) {
    throw new LiveWhatsAppConfigError(
      "WhatsApp bind subject must be a person phone JID",
    );
  }
  const doorDigits = parseWhatsAppDoorE164(doorE164).replace(/\D/g, "");
  const at = subject.indexOf("@");
  const user = at === -1 ? subject : subject.slice(0, at);
  if (user.replace(/\D/g, "") === doorDigits) {
    throw new LiveWhatsAppConfigError(
      "door JID is not a person subject (fail closed)",
    );
  }
  return subject;
}

/**
 * Fail closed when live WhatsApp is advertised without the door E.164
 * and a ready CompanionSession. Other suites must not call this.
 */
export function assertLiveWhatsAppAdvertisement(
  ready?: CompanionReady,
): void {
  if (process.env.ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP !== "1") {
    return;
  }
  parseWhatsAppDoorE164(process.env.ZOEN_WHATSAPP_DOOR_E164);
  if (ready !== undefined && !companionSessionIsReady(ready)) {
    throw new LiveWhatsAppConfigError(
      "CompanionSession is not ready (paired+connected+loggedIn)",
    );
  }
}

export function selectWhatsAppShape(
  outbound: ChatSdkOutbound,
): WhatsAppWireShape {
  const url = outbound.surfaceUrl?.trim();
  if (url === undefined || url.length === 0) {
    return { kind: "text", text: outbound.text };
  }
  if (
    url.toLowerCase().startsWith("zoen-rich:") ||
    !/^https:\/\//i.test(url)
  ) {
    throw new WhatsAppSurfaceUrlError(url);
  }
  const body = outbound.text.trim();
  if (body.length === 0) {
    return { kind: "text", text: url };
  }
  if (body.includes(url)) {
    return { kind: "text", text: body };
  }
  return { kind: "text", text: `${body}\n${url}` };
}

export function parseCompanionInboundEnvelope(raw: unknown): ChatSdkMessage {
  if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (record.object === "whatsapp_business_account") {
      throw new WhatsAppEnvelopeError(
        "Cloud API envelope is not the Brazil WhatsApp path",
      );
    }
  }
  const inbound = asCompanionInbound(raw);
  const fromId =
    inbound.senderAltJid.length > 0 && isPersonPhoneJid(inbound.senderAltJid)
      ? inbound.senderAltJid
      : inbound.senderJid;
  return {
    callbackData: inbound.callbackData,
    from: { id: fromId },
    id: inbound.messageId,
    mediaRef: inbound.mediaRef,
    mime: inbound.mime,
    receivedAt: inbound.observedAt,
    text: inbound.body.length > 0 ? inbound.body : undefined,
    thread: { id: inbound.chatJid, kind: "chat" },
  };
}

export function createLiveWhatsAppProviderFromEnv(
  session: CompanionSession = createHttpCompanionSession(
    requireCompanionUrl(),
  ),
): LiveWhatsAppProvider {
  assertLiveWhatsAppAdvertisement();
  return createLiveWhatsAppProvider({ session });
}

export function createLiveWhatsAppProvider(options: {
  readonly session: CompanionSession;
}): LiveWhatsAppProvider {
  const probes: CapabilityProbes = createCapabilityProbes(
    "whatsapp",
    WHATSAPP_TABLE,
  );
  const delivered = new Map<string, ChatSdkDeliveryReceipt>();

  const provider: LiveWhatsAppProvider = {
    kind: "live",
    parseInbound(raw) {
      return parseCompanionInboundEnvelope(raw);
    },
    probes,
    providerId: "whatsapp",
    session: options.session,
    async send(outbound) {
      const existing = delivered.get(outbound.clientDeliveryId);
      if (existing !== undefined) {
        return existing;
      }
      const chatJid = outboundChatJid(outbound);
      const shape = selectWhatsAppShape(outbound);
      const receipt = await options.session.send({
        chatJid,
        clientDeliveryId: outbound.clientDeliveryId,
        shape,
      });
      const mapped: ChatSdkDeliveryReceipt = {
        messageId: receipt.messageId,
        status: receipt.status,
      };
      delivered.set(outbound.clientDeliveryId, mapped);
      return mapped;
    },
    simulateRestart() {
      delivered.clear();
    },
    threadKind: "chat",
  };
  return provider;
}

function outboundChatJid(outbound: ChatSdkOutbound): string {
  if (outbound.thread?.id !== undefined && outbound.thread.id.length > 0) {
    return composeOutboundChatJid(outbound.thread.id);
  }
  if (outbound.toUser?.id !== undefined && outbound.toUser.id.length > 0) {
    return composeOutboundChatJid(outbound.toUser.id);
  }
  throw new LiveWhatsAppConfigError(
    "whatsapp send requires ChatSdkOutbound.thread (chat JID)",
  );
}

function requireCompanionUrl(): string {
  const url = process.env.ZOEN_WHATSAPP_COMPANION_URL;
  if (url === undefined || url.trim().length === 0) {
    throw new LiveWhatsAppConfigError(
      "ZOEN_WHATSAPP_COMPANION_URL required for live WhatsApp provider",
    );
  }
  return url.trim();
}

function asCompanionInbound(raw: unknown): CompanionInbound {
  if (raw === null || typeof raw !== "object") {
    throw new WhatsAppEnvelopeError("companion inbound must be an object");
  }
  const record = raw as Record<string, unknown>;
  const messageId = requiredString(record, "messageId");
  const chatJid = requiredString(record, "chatJid");
  const senderJid = requiredString(record, "senderJid");
  if (isGroupJid(senderJid)) {
    throw new WhatsAppEnvelopeError("group JID is not a speaker");
  }
  const mediaKindRaw = optionalString(record.mediaKind);
  const mediaKind =
    mediaKindRaw === "document" || mediaKindRaw === "audio"
      ? mediaKindRaw
      : undefined;
  return {
    body: optionalString(record.body),
    callbackData:
      typeof record.callbackData === "string" ? record.callbackData : undefined,
    chatJid,
    filename:
      typeof record.filename === "string" ? record.filename : undefined,
    fromMe: record.fromMe === true,
    isGroup: record.isGroup === true || isGroupJid(chatJid),
    mediaKind,
    mediaRef: typeof record.mediaRef === "string" ? record.mediaRef : undefined,
    messageId,
    mime: typeof record.mime === "string" ? record.mime : undefined,
    observedAt: requiredString(record, "observedAt"),
    senderAltJid: optionalString(record.senderAltJid),
    senderJid,
  };
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WhatsAppEnvelopeError(`companion inbound missing ${key}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
