/**
 * CompanionSession is WhatsApp-only layer 2. It talks to the consumer
 * multi-device protocol. It does not resolve Membership or mint TenantId.
 */

export type CompanionReady = {
  readonly paired: boolean;
  readonly connected: boolean;
  readonly loggedIn: boolean;
};

export function companionSessionIsReady(ready: CompanionReady): boolean {
  return ready.paired && ready.connected && ready.loggedIn;
}

export type CompanionInbound = {
  readonly messageId: string;
  readonly chatJid: string;
  readonly senderJid: string;
  readonly senderAltJid: string;
  readonly isGroup: boolean;
  readonly fromMe: boolean;
  readonly body: string;
  readonly observedAt: string;
  readonly callbackData?: string;
  readonly mediaKind?: "document" | "audio";
  readonly mime?: string;
  readonly filename?: string;
  readonly mediaRef?: string;
};

export type WhatsAppWireShape =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "quick_reply";
      readonly text: string;
      readonly buttons: readonly {
        readonly label: string;
        readonly callbackData: string;
      }[];
    }
  | {
      readonly kind: "list";
      readonly text: string;
      readonly rows: readonly { readonly id: string; readonly title: string }[];
    }
  | { readonly kind: "carousel"; readonly text: string }
  | { readonly kind: "cta_url"; readonly text: string; readonly url: string };

export type CompanionOutbound = {
  readonly chatJid: string;
  readonly clientDeliveryId: string;
  readonly shape: WhatsAppWireShape;
};

export type CompanionSendReceipt = {
  readonly messageId: string;
  readonly status: "accepted" | "rejected" | "unknown";
  readonly shape: WhatsAppWireShape;
};

export type PairingEvent =
  | { readonly kind: "code"; readonly timeoutMs: number }
  | { readonly kind: "success" }
  | { readonly kind: "timeout" }
  | { readonly kind: "error"; readonly message: string };

export type LidPnLookup = (lidJid: string) => string | undefined;

export interface CompanionSession {
  open(): Promise<void>;
  beginPairing(): AsyncIterable<PairingEvent>;
  ready(): Promise<CompanionReady>;
  send(outbound: CompanionOutbound): Promise<CompanionSendReceipt>;
  subscribeInbound(
    handler: (event: CompanionInbound) => void | Promise<void>,
  ): () => void;
  close(): Promise<void>;
}

export class CompanionSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanionSessionError";
  }
}

const GROUP_MARKER = "@g.us";
const PHONE_SERVERS = new Set(["s.whatsapp.net", "c.us"]);
const LID_SERVER = "lid";
const ALLOWED_SEND_SERVERS = new Set([
  "s.whatsapp.net",
  "c.us",
  "lid",
  "g.us",
]);

export function jidServer(jid: string): string {
  const at = jid.indexOf("@");
  if (at <= 0) {
    return "";
  }
  return jid.slice(at + 1).toLowerCase();
}

export function isGroupJid(jid: string): boolean {
  return jidServer(jid) === "g.us" || jid.includes(GROUP_MARKER);
}

export function isPersonPhoneJid(jid: string): boolean {
  const server = jidServer(jid);
  return server.length > 0 && PHONE_SERVERS.has(server);
}

export function isLidJid(jid: string): boolean {
  return jidServer(jid) === LID_SERVER;
}

export function composeOutboundChatJid(chatJid: string): string {
  const trimmed = chatJid.trim();
  if (trimmed.length === 0) {
    throw new CompanionSessionError("outbound chat JID required");
  }
  const server = jidServer(trimmed);
  if (!ALLOWED_SEND_SERVERS.has(server)) {
    throw new CompanionSessionError(
      `unsupported outbound session server ${server}`,
    );
  }
  return trimmed;
}

export function enrichPersonAltRef(
  senderJid: string,
  senderAltJid: string,
  lookup: LidPnLookup | undefined,
): string {
  if (isPersonPhoneJid(senderAltJid.trim())) {
    return senderAltJid.trim();
  }
  if (!isLidJid(senderJid) || lookup === undefined) {
    return "";
  }
  const mapped = lookup(senderJid.trim());
  if (mapped === undefined || !isPersonPhoneJid(mapped)) {
    return "";
  }
  return mapped;
}

export function enrichInboundPersonRefs(
  inbound: CompanionInbound,
  lookup: LidPnLookup | undefined,
): CompanionInbound {
  const senderAltJid = enrichPersonAltRef(
    inbound.senderJid,
    inbound.senderAltJid,
    lookup,
  );
  if (inbound.isGroup || isGroupJid(inbound.chatJid)) {
    return { ...inbound, senderAltJid };
  }
  if (isPersonPhoneJid(inbound.chatJid)) {
    return { ...inbound, senderAltJid };
  }
  if (senderAltJid.length > 0 && (isLidJid(inbound.chatJid) || inbound.chatJid.trim() === "s.whatsapp.net")) {
    return { ...inbound, chatJid: senderAltJid, senderAltJid };
  }
  const chatMapped = isLidJid(inbound.chatJid)
    ? enrichPersonAltRef(inbound.chatJid, "", lookup)
    : "";
  if (chatMapped.length > 0) {
    return {
      ...inbound,
      chatJid: chatMapped,
      senderAltJid: senderAltJid.length > 0 ? senderAltJid : chatMapped,
    };
  }
  return { ...inbound, senderAltJid };
}

export function normalizeCompanionInbound(
  raw: CompanionInbound,
  lookup: LidPnLookup | undefined,
): { accept: true; inbound: CompanionInbound } | { accept: false; reason: "from_me" | "empty" } {
  if (raw.fromMe) {
    return { accept: false, reason: "from_me" };
  }
  if (
    raw.messageId.trim() === "" ||
    raw.chatJid.trim() === "" ||
    raw.senderJid.trim() === "" ||
    raw.observedAt.trim() === ""
  ) {
    throw new CompanionSessionError(
      "inbound missing message id, chat JID, sender JID, or timestamp",
    );
  }
  if (raw.body.trim() === "" && raw.callbackData === undefined) {
    return { accept: false, reason: "empty" };
  }
  if (isGroupJid(raw.senderJid)) {
    throw new CompanionSessionError("group JID is not a speaker");
  }
  return {
    accept: true,
    inbound: enrichInboundPersonRefs(
      {
        ...raw,
        body: raw.body.trim(),
        chatJid: raw.chatJid.trim(),
        messageId: raw.messageId.trim(),
        senderAltJid: raw.senderAltJid.trim(),
        senderJid: raw.senderJid.trim(),
      },
      lookup,
    ),
  };
}

export interface RecordingCompanionSession extends CompanionSession {
  readonly kind: "recording";
  injectInbound(
    raw: CompanionInbound,
  ): Promise<"delivered" | "dropped">;
  sent(): readonly CompanionOutbound[];
  delivered(): readonly CompanionInbound[];
  setReady(ready: CompanionReady): void;
}

export function createRecordingCompanionSession(options: {
  lidMap?: Readonly<Record<string, string>>;
  ready?: CompanionReady;
} = {}): RecordingCompanionSession {
  let opened = false;
  let closed = false;
  let ready: CompanionReady = options.ready ?? {
    connected: false,
    loggedIn: false,
    paired: false,
  };
  const sent: CompanionOutbound[] = [];
  const delivered: CompanionInbound[] = [];
  const handlers = new Set<
    (event: CompanionInbound) => void | Promise<void>
  >();
  const lookup: LidPnLookup | undefined =
    options.lidMap === undefined
      ? undefined
      : (lid) => options.lidMap?.[lid];

  const session: RecordingCompanionSession = {
    kind: "recording",

    async open() {
      if (closed) {
        throw new CompanionSessionError("companion session is closed");
      }
      opened = true;
    },

    async *beginPairing() {
      if (!opened) {
        throw new CompanionSessionError("companion session is not open");
      }
      if (ready.paired) {
        throw new CompanionSessionError("device already paired");
      }
      yield { kind: "code", timeoutMs: 20_000 };
    },

    async ready() {
      return ready;
    },

    setReady(next) {
      ready = next;
    },

    async send(outbound) {
      if (!opened || closed) {
        throw new CompanionSessionError("companion session is not open");
      }
      const chatJid = composeOutboundChatJid(outbound.chatJid);
      const recorded: CompanionOutbound = { ...outbound, chatJid };
      sent.push(recorded);
      return {
        messageId: `rec_${outbound.clientDeliveryId}`,
        shape: outbound.shape,
        status: "accepted",
      };
    },

    subscribeInbound(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async injectInbound(raw) {
      if (!opened || closed) {
        throw new CompanionSessionError("companion session is not open");
      }
      const normalized = normalizeCompanionInbound(raw, lookup);
      if (!normalized.accept) {
        return "dropped";
      }
      delivered.push(normalized.inbound);
      for (const handler of handlers) {
        await handler(normalized.inbound);
      }
      return "delivered";
    },

    sent() {
      return sent;
    },

    delivered() {
      return delivered;
    },

    async close() {
      opened = false;
      closed = true;
      handlers.clear();
    },
  };
  return session;
}

export function createHttpCompanionSession(baseUrl: string): CompanionSession {
  const root = baseUrl.replace(/\/$/, "");

  async function readReady(): Promise<CompanionReady> {
    const response = await fetch(`${root}/ready`);
    if (!response.ok) {
      throw new CompanionSessionError(
        `companion /ready HTTP ${String(response.status)}`,
      );
    }
    const body = (await response.json()) as {
      paired?: unknown;
      connected?: unknown;
      loggedIn?: unknown;
    };
    return {
      connected: body.connected === true,
      loggedIn: body.loggedIn === true,
      paired: body.paired === true,
    };
  }

  return {
    async open() {
      await readReady();
    },

    async *beginPairing() {
      throw new CompanionSessionError(
        "HTTP companion does not pair; run zoen-whatsapp-companion pair",
      );
    },

    async ready() {
      return readReady();
    },

    async send(outbound) {
      const chatJid = composeOutboundChatJid(outbound.chatJid);
      const response = await fetch(`${root}/send`, {
        body: JSON.stringify({ ...outbound, chatJid }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        return {
          messageId: `wa_reject_${outbound.clientDeliveryId}`,
          shape: outbound.shape,
          status: "rejected",
        };
      }
      const body = (await response.json()) as { messageId?: unknown };
      return {
        messageId:
          typeof body.messageId === "string"
            ? body.messageId
            : `wa_${outbound.clientDeliveryId}`,
        shape: outbound.shape,
        status: "accepted",
      };
    },

    subscribeInbound() {
      return () => undefined;
    },

    async close() {
      return;
    },
  };
}
