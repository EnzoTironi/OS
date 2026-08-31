import { createMemoryState } from "@chat-adapter/state-memory";
import { createKapsoAdapter, type KapsoAdapter } from "@kapso/chat-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

import { flattenInputRequests, flattenOutbound } from "../outbound-text";

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

bot.onDirectMessage(async (thread: Thread, message: Message) => {
  const text = message.text.trim();
  if (text.length === 0) {
    return;
  }
  const decoded = adapter.decodeThreadId(thread.id);
  await send(text, {
    auth: {
      attributes: { tenant: decoded.phoneNumberId },
      authenticator: "kapso",
      principalId: `${decoded.waId}@s.whatsapp.net`,
      principalType: "user",
    },
    thread,
  });
});

export default channel;
