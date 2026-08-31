#!/bin/sh
# Bind a person WhatsApp JID via machine-token identity admin.
set -eu
zoend_url="${ZOEN_ZOEND:-http://127.0.0.1:58701}"
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

http_ok() {
  case "$1" in
    200|409) return 0 ;;
    *) return 1 ;;
  esac
}

prov_code="$(curl -sS -o "$tmp/provisional.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/provisional" \
  -H "$auth" \
  -H 'content-type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"provider":"whatsapp","subjectKey":sys.argv[1]}))' "$person_subject")")"
if ! http_ok "$prov_code"; then
  echo "provisional HTTP ${prov_code}" >&2
  cat "$tmp/provisional.json" >&2
  exit 1
fi
account_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' <"$tmp/provisional.json")"
account_status="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' <"$tmp/provisional.json")"
if [ "$account_status" != "verified" ]; then
  verify_code="$(curl -sS -o "$tmp/verify.json" -w '%{http_code}' \
    -X POST "${zoend_url}/identity/admin/verify-binding" \
    -H "$auth" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"accountId":sys.argv[1]}))' "$account_id")")"
  if ! http_ok "$verify_code"; then
    echo "verify-binding HTTP ${verify_code}" >&2
    cat "$tmp/verify.json" >&2
    exit 1
  fi
fi

expires_at="$(python3 -c 'import time; print(int(time.time() * 1_000_000) + 3_600_000_000_000)')"
invite_token="invite.whatsapp.live.${account_id}"
invite_code="$(curl -sS -o "$tmp/invite.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/invites" \
  -H 'content-type: application/json' -H "$auth" \
  -d "{\"tenantId\":\"${live_tenant}\",\"principalId\":\"principal.live.whatsapp\",\"token\":\"${invite_token}\",\"expiresAtMicros\":${expires_at},\"workloadId\":\"workload.admin.a\",\"actorId\":\"actor.admin.a\",\"actionIds\":[\"commercial.changeCommitment\",\"zoen.definition.activate\",\"personal.writeMemory\",\"personal.createReminder\"],\"resourceIds\":[\"personal.memory\",\"personal.note\",\"personal.reminder\",\"commercial.sales\",\"commercial.order-line.dirty-quote\"]}")"
if ! http_ok "$invite_code"; then
  echo "create invite HTTP ${invite_code}" >&2
  cat "$tmp/invite.json" >&2
  exit 1
fi
accept_code="$(curl -sS -o "$tmp/accept.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/accept-invite" \
  -H 'content-type: application/json' -H "$auth" \
  -d "{\"accountId\":\"${account_id}\",\"token\":\"${invite_token}\"}")"
if ! http_ok "$accept_code"; then
  echo "accept-invite HTTP ${accept_code}" >&2
  cat "$tmp/accept.json" >&2
  exit 1
fi
echo "bound ${person_subject} on ${live_tenant} (door ${door_e164} unbound)"
