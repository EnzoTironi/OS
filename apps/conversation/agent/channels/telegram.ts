import { telegramChannel } from "eve/channels/telegram";

import { flattenInputRequests, flattenOutbound } from "../outbound-text";

function trimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

const botUsername = trimmedEnv("TELEGRAM_BOT_USERNAME");

export default telegramChannel({
  ...(botUsername === undefined ? {} : { botUsername }),
  events: {
    async "input.requested"(event, channel) {
      if (event.requests.length === 0) {
        return;
      }
      const body = flattenInputRequests(event.requests);
      if (body.length === 0) {
        return;
      }
      await channel.telegram.post(body);
    },
    async "message.completed"(event, channel) {
      if (event.finishReason === "tool-calls" || event.message === null) {
        return;
      }
      const body = flattenOutbound(event.message);
      if (body.length === 0) {
        return;
      }
      await channel.telegram.post(body);
    },
    async "session.failed"(_event, channel) {
      await channel.telegram.post("não consegui agora");
    },
    async "turn.failed"(_event, channel) {
      await channel.telegram.post("não consegui agora");
    },
  },
});
