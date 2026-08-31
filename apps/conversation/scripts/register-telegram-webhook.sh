#!/usr/bin/env bash
# Register Eve Telegram webhook on the live origin.
# Requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN.
set -euo pipefail

token="${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
secret="${TELEGRAM_WEBHOOK_SECRET_TOKEN:?TELEGRAM_WEBHOOK_SECRET_TOKEN is required}"
origin="${ZOEN_PUBLIC_ORIGIN:-https://zoen.tironi.xyz}"
url="${origin%/}/eve/v1/telegram"

payload="$(URL="$url" SECRET="$secret" python3 -c 'import json,os; print(json.dumps({
  "url": os.environ["URL"],
  "secret_token": os.environ["SECRET"],
  "allowed_updates": ["message", "callback_query"],
  "drop_pending_updates": True,
}))')"

curl -sS -X POST "https://api.telegram.org/bot${token}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "$payload"
echo
curl -sS "https://api.telegram.org/bot${token}/getWebhookInfo"
echo
curl -sS "https://api.telegram.org/bot${token}/getMe"
echo
