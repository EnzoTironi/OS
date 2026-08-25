#!/usr/bin/env bash
set -euo pipefail

# Operator bind: person inbox JID onto a membership account.
# Never bind the Vivo door. Inbound never calls verify-binding / HarnessVerified.

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

pair_dir="${ZOEN_WA_PAIR_DIR:-/tmp/zoen-wa-pair}"
mkdir -p "$pair_dir"

e2e_env="e2e/channel-whatsapp-live/.env"
if [[ -f "$e2e_env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$e2e_env"
  set +a
fi

zoend_port="${ZOEN_E2E_ZOEND_PORT:-58701}"
keycloak_port="${ZOEN_E2E_KEYCLOAK_PORT:-58700}"
zoend_url="http://127.0.0.1:${zoend_port}"
issuer="http://127.0.0.1:${keycloak_port}/realms/zoen"
door_e164="${ZOEN_WHATSAPP_DOOR_E164:-+553798136141}"
person_subject="${ZOEN_WHATSAPP_PERSON_SUBJECT:-553199941160@s.whatsapp.net}"

door_digits="$(echo "$door_e164" | tr -d '+')"
if [[ "$person_subject" == *"$door_digits"* ]]; then
  echo "refusing to bind the door JID ${person_subject}" >&2
  exit 1
fi
if [[ "$person_subject" != *@s.whatsapp.net ]]; then
  echo "WhatsApp bind subject must be a person phone JID" >&2
  exit 1
fi

token_json="$(curl -fsS -X POST "${issuer}/protocol/openid-connect/token" \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'client_id=bound-bait&client_secret=bound-bait-secret&grant_type=client_credentials')"
printf '%s' "$token_json" >"$pair_dir/oidc-token.json"
token="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$token_json")"

curl -fsS -X POST "${zoend_url}/identity/admin/bootstrap-bound" \
  -H "authorization: Bearer ${token}" \
  >"$pair_dir/bootstrap.json"
account_id="$(python3 -c 'import json; print(json.load(open("'"$pair_dir"'/bootstrap.json"))["accountId"])')"

bind_code="$(curl -sS -o "$pair_dir/bind-response.json" -w '%{http_code}' \
  -X POST "${zoend_url}/identity/admin/bind-verified" \
  -H 'content-type: application/json' \
  -d "{\"accountId\":\"${account_id}\",\"provider\":\"whatsapp\",\"subjectKey\":\"${person_subject}\"}")"
if [[ "$bind_code" != "200" && "$bind_code" != "409" ]]; then
  echo "bind-verified HTTP ${bind_code}" >&2
  cat "$pair_dir/bind-response.json" >&2
  exit 1
fi

person_code="$(curl -sS -o "$pair_dir/person-resolve.json" -w '%{http_code}' \
  --get "${zoend_url}/identity/admin/resolve-subject" \
  --data-urlencode "provider=whatsapp" \
  --data-urlencode "subjectKey=${person_subject}")"
if [[ "$person_code" != "200" ]]; then
  echo "person subject did not resolve after bind HTTP ${person_code}" >&2
  cat "$pair_dir/person-resolve.json" >&2
  exit 1
fi

door_jid="${door_digits}@s.whatsapp.net"
door_code="$(curl -sS -o "$pair_dir/door-resolve.json" -w '%{http_code}' \
  --get "${zoend_url}/identity/admin/resolve-subject" \
  --data-urlencode "provider=whatsapp" \
  --data-urlencode "subjectKey=${door_jid}")"
if [[ "$door_code" != "401" ]]; then
  echo "door JID must stay unbound, got HTTP ${door_code}" >&2
  cat "$pair_dir/door-resolve.json" >&2
  exit 1
fi

python3 - <<PY
import json
from pathlib import Path
pair = Path("$pair_dir")
bootstrap = json.loads((pair / "bootstrap.json").read_text())
bind = {}
bind_path = pair / "bind-response.json"
if bind_path.exists() and bind_path.read_text().strip():
    try:
        bind = json.loads(bind_path.read_text())
    except json.JSONDecodeError:
        bind = {}
resolve = json.loads((pair / "person-resolve.json").read_text())
whatsapp = next(
    (
        row
        for row in resolve.get("bindings", [])
        if row.get("provider") == "whatsapp"
        and row.get("subjectKey") == "$person_subject"
        and row.get("status") == "verified"
    ),
    {},
)
payload = {
    "accountId": bootstrap["accountId"],
    "membershipId": bootstrap["membershipId"],
    "tenantId": bootstrap["tenantId"],
    "principalId": bootstrap["principalId"],
    "provider": "whatsapp",
    "subjectKey": "$person_subject",
    "bindingId": bind.get("bindingId") or whatsapp.get("bindingId"),
    "status": bind.get("status") or whatsapp.get("status") or "verified",
    "doorE164": "$door_e164",
    "doorBound": False,
}
(pair / "binding.json").write_text(json.dumps(payload, indent=2) + "\n")
print(json.dumps(payload, indent=2))
PY
