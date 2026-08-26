import { z } from "zod";
import {
  conversationKeyFrom,
  type ConversationKey,
} from "./brands.js";
import type { ChannelObservation } from "./types.js";

const GROUP_MARKER = "@g.us";
const PERSON_JID_MARKERS = ["@s.whatsapp.net", "@c.us", "@lid"] as const;
const PERSON_JID_SERVERS = new Set(["s.whatsapp.net", "c.us", "lid"]);
const E164 = /^\+?[1-9]\d{6,14}$/;

export const conversationKindSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("one_to_one"),
      subject: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("group"),
      groupJid: z.string().min(1),
    })
    .strict(),
]);

export type ConversationKind = z.infer<typeof conversationKindSchema>;

export function conversationKind(input: unknown): ConversationKind {
  const parsed = conversationKindSchema.parse(input);
  switch (parsed.kind) {
    case "one_to_one":
      if (isGroupJid(parsed.subject)) {
        throw new Error("one_to_one must not accept a group JID");
      }
      return parsed;
    case "group":
      if (!isGroupJid(parsed.groupJid) || isPersonSubject(parsed.groupJid)) {
        throw new Error("group must not accept a person JID or E.164");
      }
      return parsed;
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}

export function conversationIdFromKind(kind: ConversationKind): string {
  const parsed = conversationKind(kind);
  switch (parsed.kind) {
    case "one_to_one":
      return parsed.subject;
    case "group":
      return parsed.groupJid;
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}

export function conversationKeyFromKind(input: {
  readonly accountId: string;
  readonly kind: ConversationKind;
  readonly provider: string;
  readonly tenantId: string;
  readonly workspaceId: string;
}): ConversationKey {
  const kind = conversationKind(input.kind);
  if (input.provider.length === 0) {
    throw new Error("conversationKeyFromKind requires provider");
  }
  return conversationKeyFrom({
    accountId: input.accountId,
    conversationId: `${input.provider}:${conversationIdFromKind(kind)}`,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });
}

export function conversationKeyFromChannel(input: {
  readonly accountId: string;
  readonly channel: ChannelObservation;
  readonly tenantId: string;
  readonly workspaceId: string;
}): ConversationKey {
  return conversationKeyFromKind({
    accountId: input.accountId,
    kind: conversationKindFromChannel(input.channel),
    provider: String(input.channel.provider),
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });
}

export function conversationKindFromChannel(
  channel: ChannelObservation,
): ConversationKind {
  if (channel.group !== undefined) {
    return conversationKind({
      groupJid: String(channel.thread),
      kind: "group",
    });
  }
  const thread = String(channel.thread).trim();
  const person = String(channel.providerUser).trim();
  return conversationKind({
    kind: "one_to_one",
    subject: thread.length > 0 ? thread : person,
  });
}

function jidServer(jid: string): string {
  const at = jid.indexOf("@");
  if (at <= 0) {
    return "";
  }
  return jid.slice(at + 1).toLowerCase();
}

function isGroupJid(jid: string): boolean {
  return jidServer(jid) === "g.us" || jid.includes(GROUP_MARKER);
}

function isPersonJid(jid: string): boolean {
  const server = jidServer(jid);
  if (PERSON_JID_SERVERS.has(server)) {
    return true;
  }
  return PERSON_JID_MARKERS.some((marker) => jid.includes(marker));
}

function isPersonSubject(value: string): boolean {
  return isPersonJid(value) || E164.test(value);
}
