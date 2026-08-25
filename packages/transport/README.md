# @zoen/transport

Sole Chat SDK / provider-adapter site for Zoen.

Zoen contracts live in `@zoen/speaker`. This package maps provider events to
those contracts and lowers `DeliveryIntent` back to provider sends.

`createLiveLinqProvider` talks to `api.linqapp.com` with Standard Webhooks
verify, outbound allowlist, and env-gated fail-closed advertise.
`createLiveWhatsAppProvider` wraps CompanionSession (whatsmeow Go process).
Advertise fails closed without `ZOEN_WHATSAPP_DOOR_E164` and a ready session.
Never `@chat-adapter/whatsapp`. Cloud API envelopes are rejected.

`createLiveTelegramProvider` is the live Bot API adapter. Official
`@chat-adapter/telegram` is imported here only. Advertise fails closed without
`TELEGRAM_BOT_TOKEN` (or `ZOEN_TELEGRAM_BOT_TOKEN`). Webhook is the production
path. Polling is local-dev only (`TELEGRAM_INGRESS_MODE=polling`).
`createFakeTelegramProvider` does not return.

Chat SDK types stay in this package only.
