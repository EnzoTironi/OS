# @zoen/messaging

Sole Chat SDK / provider-adapter site for Zoen.

Zoen contracts live in `@zoen/interaction`. This package maps provider events to
those contracts and lowers `DeliveryIntent` back to provider sends.

## Deviation: no `vercel/chat` npm dependency yet

`vercel/chat` and `@chat-adapter/*` are not present in the workspace lockfile.
AD-02.1 ships a Chat SDK-shaped adapter interface (`src/chat-sdk-shape.ts`) plus
in-process fakes (`telegram-fake`, `linq-fake`, `whatsapp-business-fake`).
AD-02.3 adds `createLiveLinqProvider` against `api.linqapp.com` with Standard
Webhooks verify, outbound allowlist, and env-gated fail-closed advertise.
Chat SDK types stay in this package only.
