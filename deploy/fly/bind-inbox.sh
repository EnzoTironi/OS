#!/bin/sh
# Bind a person WhatsApp JID via identity admin on this VM.
# Never bind the door. Uses ZOEN_IDENTITY_ADMIN_TOKEN, not e2e bound-bait.
set -eu
zoend_url="${ZOEN_IDENTITY_BASE_URL:-http://127.0.0.1:58701}"
token="${ZOEN_IDENTITY_ADMIN_TOKEN:?ZOEN_IDENTITY_ADMIN_TOKEN required}"
door_e164="${ZOEN_WHATSAPP_DOOR_E164:-+553798136141}"
person_subject="${ZOEN_WHATSAPP_PERSON_SUBJECT:-5531999941160@s.whatsapp.net}"
live_tenant="${ZOEN_WHATSAPP_TENANT:-tenant.a}"
door_digits="$(printf '%s' "$door_e164" | tr -d '+')"
case "$person_subject" in
  *"$door_digits"*) echo "refusing to bind the door JID ${person_subject}" >&2; exit 1 ;;
esac
case "$person_subject" in
  *@s.whatsapp.net) ;;
  *) echo "WhatsApp bind subject must be a person phone JID" >&2; exit 1 ;;
esac
auth="authorization: Bearer ${token}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsS -X POST "${zoend_url}/identity/admin/bootstrap-bound" -H "$auth" >"$tmp/bootstrap.json"
account_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' <"$tmp/bootstrap.json")"
bind_code="$(curl -sS -o "$tmp/bind.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/bind-verified" \
  -H 'content-type: application/json' -H "$auth" \
  -d "{\"accountId\":\"${account_id}\",\"provider\":\"whatsapp\",\"subjectKey\":\"${person_subject}\"}")"
if [ "$bind_code" != "200" ] && [ "$bind_code" != "409" ]; then
  echo "bind-verified HTTP ${bind_code}" >&2
  cat "$tmp/bind.json" >&2
  exit 1
fi
expires_at="$(python3 -c 'import time; print(int(time.time() * 1_000_000) + 3_600_000_000_000)')"
invite_token="invite.whatsapp.live.${account_id}"
invite_code="$(curl -sS -o "$tmp/invite.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/invites" \
  -H 'content-type: application/json' -H "$auth" \
  -d "{\"tenantId\":\"${live_tenant}\",\"principalId\":\"principal.live.whatsapp\",\"token\":\"${invite_token}\",\"expiresAtMicros\":${expires_at},\"workloadId\":\"workload.admin.a\",\"actorId\":\"actor.admin.a\",\"actionIds\":[\"commercial.changeCommitment\",\"zoen.definition.activate\",\"personal.writeMemory\",\"personal.createReminder\"],\"resourceIds\":[\"personal.memory\",\"commercial.sales\",\"commercial.order-line.dirty-quote\"]}")"
if [ "$invite_code" != "200" ] && [ "$invite_code" != "409" ]; then
  echo "create invite HTTP ${invite_code}" >&2
  cat "$tmp/invite.json" >&2
  exit 1
fi
accept_code="$(curl -sS -o "$tmp/accept.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/accept-invite" \
  -H 'content-type: application/json' -H "$auth" \
  -d "{\"accountId\":\"${account_id}\",\"token\":\"${invite_token}\"}")"
if [ "$accept_code" != "200" ] && [ "$accept_code" != "409" ]; then
  echo "accept-invite HTTP ${accept_code}" >&2
  cat "$tmp/accept.json" >&2
  exit 1
fi
echo "bound ${person_subject} on ${live_tenant} (door ${door_e164} unbound)"
