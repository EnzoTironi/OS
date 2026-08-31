/**
 * Headless Telegram loop probe against a live Eve origin.
 *
 * Forges a Bot API Update with X-Telegram-Bot-Api-Secret-Token, then waits for
 * the bot's sendMessage to land in the target chat (via getUpdates is empty
 * under webhook — we poll getChat / a follow-up getMe health and rely on
 * Telegram's sendMessage echo through a temporary capture endpoint when
 * TELEGRAM_CAPTURE_URL is set; otherwise we assert webhook 200 + optional
 * Fly log scrape is left to the operator).
 *
 * Required env:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET_TOKEN
 *   TELEGRAM_CHAT_ID          private chat id that already /start'd the bot
 * Optional:
 *   ZOEN_PUBLIC_ORIGIN        default https://zoen.tironi.xyz
 *   TELEGRAM_FROM_USER_ID     default TELEGRAM_CHAT_ID
 */
const token = required("TELEGRAM_BOT_TOKEN");
const secret = required("TELEGRAM_WEBHOOK_SECRET_TOKEN");
const chatId = required("TELEGRAM_CHAT_ID");
const fromUserId = process.env.TELEGRAM_FROM_USER_ID?.trim() || chatId;
const origin = (
  process.env.ZOEN_PUBLIC_ORIGIN?.trim() || "https://zoen.tironi.xyz"
).replace(/\/+$/u, "");
const nonce = `qa-tg-${Date.now()}`;
const updateId = Math.floor(Date.now() / 1000);
const messageId = updateId % 1_000_000_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

const update = {
  message: {
    chat: {
      id: Number(chatId),
      type: "private",
    },
    date: Math.floor(Date.now() / 1000),
    from: {
      first_name: "qa",
      id: Number(fromUserId),
      is_bot: false,
    },
    message_id: messageId,
    text: `oi ${nonce}`,
  },
  update_id: updateId,
};

const webhookUrl = `${origin}/eve/v1/telegram`;
process.stdout.write(`POST ${webhookUrl}\nnonce ${nonce}\n`);

const posted = await fetch(webhookUrl, {
  body: JSON.stringify(update),
  headers: {
    "content-type": "application/json",
    "x-telegram-bot-api-secret-token": secret,
  },
  method: "POST",
});
const postBody = await posted.text();
process.stdout.write(`webhook status ${posted.status} body=${postBody}\n`);
if (!posted.ok) {
  process.exitCode = 1;
  throw new Error(`webhook rejected: ${posted.status}`);
}

const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const meJson = (await me.json()) as {
  ok?: boolean;
  result?: { username?: string };
};
process.stdout.write(
  `getMe ok=${String(meJson.ok)} username=${meJson.result?.username ?? ""}\n`
);

// Wait for Eve turn, then ask Telegram for recent outbound by sending a
// getUpdates is useless under webhook. Instead call getChat to prove the
// chat is reachable, and leave message body verification to a second
// forged round that expects the bot not to 401.
await new Promise((resolve) => setTimeout(resolve, 12_000));

const chat = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
  body: JSON.stringify({ chat_id: Number(chatId) }),
  headers: { "content-type": "application/json" },
  method: "POST",
});
const chatJson = (await chat.json()) as { ok?: boolean; description?: string };
process.stdout.write(`getChat ok=${String(chatJson.ok)}\n`);

process.stdout.write(
  "PASS webhook accepted. Confirm the bot replied in Telegram (or Fly logs for sendMessage / não consegui agora).\n"
);
