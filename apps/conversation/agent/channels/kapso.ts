import { createMemoryState } from "@chat-adapter/state-memory";
import { createKapsoAdapter, type KapsoAdapter } from "@kapso/chat-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

import { flattenInputRequests, flattenOutbound } from "../outbound-text";
import {
  hostCredentialFromRaw,
  putHostCredential,
} from "../sandbox/credentials";

let loadedKapsoAdapter: KapsoAdapter | undefined;

function loadKapsoAdapter(): KapsoAdapter {
  loadedKapsoAdapter ??= createKapsoAdapter({
    kapsoApiKey: process.env.KAPSO_API_KEY,
    phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
    webhookSecret: process.env.KAPSO_WEBHOOK_SECRET,
  });
  return loadedKapsoAdapter;
}

const adapter: KapsoAdapter = new Proxy({} as KapsoAdapter, {
  get(_target, property) {
    const real = loadKapsoAdapter();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

function skipDefaultErrorPost(): Promise<void> {
  return Promise.resolve();
}

export const { bot, channel, send } = chatSdkChannel({
  adapters: {
    kapso: adapter,
  },
  events: {
    async "input.requested"(event, ctx) {
      if (ctx.thread === null || event.requests.length === 0) {
        return;
      }
      const body = flattenInputRequests(event.requests);
      if (body.length === 0) {
        return;
      }
      await ctx.thread.post(body);
    },
    async "message.completed"(event, ctx) {
      if (event.finishReason === "tool-calls" || event.message === null) {
        return;
      }
      if (ctx.thread === null) {
        return;
      }
      const body = flattenOutbound(event.message);
      if (body.length === 0) {
        return;
      }
      await ctx.thread.post(body);
    },
    "session.failed": skipDefaultErrorPost,
    "turn.failed": skipDefaultErrorPost,
  },
  state: createMemoryState(),
  streaming: false,
  userName: "zoen",
});

const TRAILING_SLASHES = /\/+$/u;

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * Channel credential wire format (`chx.`): the machine secret authenticates
 * the gateway, the provider-native subject carries the sender identity, and
 * zoend resolves it to the converged personal membership. Both parts are
 * base64url-encoded so `.`/`@` in either survive the single-header slot.
 */
function channelBearer(machineToken: string, subjectKey: string): string {
  return `chx.${base64url(machineToken)}.${base64url(`whatsapp:${subjectKey}`)}`;
}

interface ChannelMembership {
  readonly membershipId: string;
  readonly principalId: string;
  readonly tenantId: string;
}

async function resolveChannelMembership(
  zoendBaseUrl: string,
  machineToken: string,
  subjectKey: string
): Promise<ChannelMembership | undefined> {
  const url = `${zoendBaseUrl.replace(TRAILING_SLASHES, "")}/identity/admin/resolve-channel-membership?provider=whatsapp&subjectKey=${encodeURIComponent(subjectKey)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${machineToken}` },
    });
  } catch {
    return undefined;
  }
  if (!response.ok) {
    return undefined;
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { membershipId, principalId, tenantId } = body as Record<
    string,
    unknown
  >;
  if (
    typeof membershipId !== "string" ||
    membershipId.length === 0 ||
    typeof tenantId !== "string" ||
    tenantId.length === 0
  ) {
    return undefined;
  }
  return {
    membershipId,
    principalId: typeof principalId === "string" ? principalId : "",
    tenantId,
  };
}

bot.onDirectMessage(async (thread: Thread, message: Message) => {
  const text = message.text.trim();
  if (text.length === 0) {
    return;
  }
  const decoded = adapter.decodeThreadId(thread.id);
  const subjectKey = `${decoded.waId}@s.whatsapp.net`;
  const attributes: Record<string, string> = { tenant: decoded.phoneNumberId };
  const zoendBaseUrl = process.env.ZOEN_ZOEND_BASE_URL?.trim();
  const machineToken = process.env.ZOEN_IDENTITY_ADMIN_TOKEN?.trim();
  if (zoendBaseUrl !== undefined && machineToken !== undefined) {
    const resolved = await resolveChannelMembership(
      zoendBaseUrl,
      machineToken,
      subjectKey
    );
    if (resolved !== undefined) {
      attributes.membershipId = resolved.membershipId;
      attributes.tenantId = resolved.tenantId;
      putHostCredential(
        hostCredentialFromRaw({
          definitionDigest:
            process.env.ZOEN_WORKBENCH_DEFINITION_DIGEST?.trim() ?? "",
          definitionId: process.env.ZOEN_WORKBENCH_DEFINITION_ID?.trim() ?? "",
          doorToken: channelBearer(machineToken, subjectKey),
          membershipId: resolved.membershipId,
          tenantId: resolved.tenantId,
          validAt: process.env.ZOEN_WORKBENCH_VALID_AT?.trim() ?? "",
        })
      );
    }
  }
  await send(text, {
    auth: {
      attributes,
      authenticator: "kapso",
      principalId: subjectKey,
      principalType: "user",
    },
    thread,
  });
});

export default channel;
