#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$root"

if [[ -z "${DOCKER_HOST:-}" && ! -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

base="http://127.0.0.1:58704"
ok_url="${base}/api/auth/ok"
zoend_base="http://127.0.0.1:58705"
proof="/workspace/ship/remint-ba-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
cookie_jar="${work}/cookies.txt"
token_file="${work}/agent.token"
zoend_pg_name="zoen-remint-ba-pg-$$"
zoend_pid=""
auth_started=0
agent_email=""
agent_password=""
admin_token=""

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

kill_tree() {
  local parent="$1" child
  for child in $(ps -o pid= --ppid "$parent" 2>/dev/null || true); do
    child="${child// /}"
    if [[ "$child" =~ ^[0-9]+$ ]]; then
      kill_tree "$child"
    fi
  done
  kill "$parent" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${zoend_pid}" ]] && kill -0 "$zoend_pid" 2>/dev/null; then
    kill_tree "$zoend_pid"
    for _ in $(seq 1 50); do
      if ! kill -0 "$zoend_pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
  fi
  docker rm -f "$zoend_pg_name" >/dev/null 2>&1 || true
  if [[ "$auth_started" -eq 1 && -f .auth.pid ]]; then
    recorded="$(tr -d ' \n' < .auth.pid || true)"
    if [[ "$recorded" =~ ^[0-9]+$ ]] && kill -0 "$recorded" 2>/dev/null; then
      kill_tree "$recorded"
      for _ in $(seq 1 50); do
        if ! kill -0 "$recorded" 2>/dev/null; then
          break
        fi
        sleep 0.1
      done
    fi
    rm -f .auth.pid
  fi
  rm -rf "$work"
}

record() {
  local heading="$1" command="$2" url="$3" status="$4" excerpt="$5" ts="$6"
  {
    printf '## %s\n\n' "$heading"
    printf 'command: %s\n' "$command"
    printf 'url: %s\n' "$url"
    printf 'status: %s\n' "$status"
    printf 'excerpt: %s\n' "$excerpt"
    printf 'timestamp: %s\n\n' "$ts"
  } >> "$draft"
}

get_url() {
  local url="$1"
  local body="$2"
  curl -sS -o "$body" -w '%{http_code}' "$url"
}

write_proof() {
  mkdir -p "$(dirname "$proof")"
  cp "$draft" "$proof"
  printf 'wrote %s\n' "$proof"
}

if [[ ! -d node_modules ]]; then
  npm ci
fi

if [[ ! -f .env ]]; then
  umask 077
  {
    printf 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55404/zoen_auth\n'
    printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)"
    printf 'BETTER_AUTH_URL=http://127.0.0.1:58704\n'
    printf 'GOOGLE_CLIENT_ID=\n'
    printf 'GOOGLE_CLIENT_SECRET=\n'
  } > .env
fi

docker compose up -d --wait

set -a
# shellcheck disable=SC1091
. ./.env
set +a

export BETTER_AUTH_URL='http://127.0.0.1:58704'
agent_email="remint-ba-$(date +%s)@example.invalid"
agent_password="$(openssl rand -base64 24)"
admin_token="$(openssl rand -hex 24)"
export ZOEN_BA_AGENT_EMAIL="$agent_email"
export ZOEN_BA_AGENT_PASSWORD="$agent_password"
export ZOEN_BA_DOOR_URL="$base"
export ZOEN_AGENT_BEARER_TOKEN_FILE="$token_file"
export ZOEN_IDENTITY_ADMIN_TOKEN="$admin_token"
export ZOEN_ZOEND="$zoend_base"

npx --yes auth@1.7.2 migrate --config src/auth.ts --yes

if [[ -f .auth.pid ]]; then
  recorded="$(tr -d ' \n' < .auth.pid || true)"
  if [[ "$recorded" =~ ^[0-9]+$ ]] && kill -0 "$recorded" 2>/dev/null; then
    kill_tree "$recorded"
    for _ in $(seq 1 50); do
      if ! kill -0 "$recorded" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
  fi
  rm -f .auth.pid
fi

fuser -k 58704/tcp >/dev/null 2>&1 || true

for _ in $(seq 1 50); do
  if ! curl -sf --connect-timeout 1 "$ok_url" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

for _ in $(seq 1 50); do
  if ! ss -ltn 2>/dev/null | grep -q ':58704'; then
    break
  fi
  fuser -k 58704/tcp >/dev/null 2>&1 || true
  sleep 0.1
done

npx tsx src/server.ts >.auth.log 2>&1 &
printf '%s\n' "$!" > .auth.pid
auth_started=1

ready=0
for _ in $(seq 1 40); do
  if curl -sf "$ok_url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if [[ "$ready" -ne 1 ]]; then
  cat .auth.log >&2
  fail "auth door did not become ready"
fi

{
  printf '# remint Better Auth session mint proof\n\n'
  printf 'Source: `apps/auth/scripts/prove-remint-ba.sh`\n'
  printf 'Auth host: `%s`\n' "$base"
  printf 'zoend host: `%s`\n\n' "$zoend_base"
  printf '## 1. How remint mints\n\n'
  printf 'Remint curls loopback door `%s` (never the public origin).\n' "$base"
  printf 'Steps: `deploy/fly/zoen-remint-agent` signs in on loopback, then writes the `session_token` cookie to `ZOEN_AGENT_BEARER_TOKEN_FILE`.\n'
  printf 'Origin header is `BETTER_AUTH_URL` with trailing slash stripped. Opaque session lands in `ZOEN_AGENT_BEARER_TOKEN_FILE`.\n\n'
} > "$draft"

url="${base}/api/auth/oauth2/token"
command="curl -sS -o body -w %{http_code} -X POST -d grant_type=client_credentials ${url}"
body="${work}/oauth2-token"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=client_credentials' \
    --data-urlencode 'client_id=probe' \
    --data-urlencode 'client_secret=probe' \
    "$url"
)"
ts="$(stamp)"
excerpt="not_a_machine_mint"
record "POST /api/auth/oauth2/token client_credentials" "$command" "$url" "$status" "$excerpt" "$ts"
if [[ "$status" == "200" ]]; then
  fail "oauth2/token returned 200; unexpected machine mint on door"
fi

url="${base}/api/auth/token"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/token-nocookie"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="leftover_route_not_required"
record "GET /api/auth/token without cookie" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" != "200" ]] || fail "GET /api/auth/token without cookie returned 200"

signup_json="$(ZOEN_BA_AGENT_EMAIL="$agent_email" ZOEN_BA_AGENT_PASSWORD="$agent_password" python3 -c 'import json,os; print(json.dumps({"email":os.environ["ZOEN_BA_AGENT_EMAIL"],"password":os.environ["ZOEN_BA_AGENT_PASSWORD"],"name":"zoen agent"}))')"
signin_json="$(ZOEN_BA_AGENT_EMAIL="$agent_email" ZOEN_BA_AGENT_PASSWORD="$agent_password" python3 -c 'import json,os; print(json.dumps({"email":os.environ["ZOEN_BA_AGENT_EMAIL"],"password":os.environ["ZOEN_BA_AGENT_PASSWORD"]}))')"

url="${base}/api/auth/sign-up/email"
command="curl -sS -c jar -o body -w %{http_code} -H content-type:application/json -H Origin:${base} -d {email,password,name} ${url}"
body="${work}/signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$cookie_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "$url"
)"
ts="$(stamp)"
excerpt="signed_up_or_exists"
record "POST /api/auth/sign-up/email" "$command" "$url" "$status" "$excerpt" "$ts"

url="${base}/api/auth/sign-in/email"
command="curl -sS -c jar -b jar -o body -w %{http_code} -H content-type:application/json -H Origin:${base} -d {email,password} ${url}"
body="${work}/signin"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$cookie_jar" \
    -b "$cookie_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signin_json" \
    "$url"
)"
ts="$(stamp)"
excerpt="session_cookie"
record "POST /api/auth/sign-in/email" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || {
  cat "$body" >&2
  fail "sign-in status ${status}"
}

rm -f "$token_file"
set +e
timeout 15 "${repo}/deploy/fly/zoen-remint-agent" >"${work}/remint.log" 2>&1
set -e
[[ -s "$token_file" ]] || {
  cat "${work}/remint.log" >&2
  fail "remint did not write token file"
}
python3 - "$token_file" <<'PY'
import sys
token = open(sys.argv[1], encoding="utf-8").read().strip()
if not token:
    raise SystemExit("token file empty")
if len(token.split(".")) == 3:
    raise SystemExit("token file looks like a JWT")
PY
chmod 600 "$token_file"

url="${base}/api/auth/token"
command="curl -sS -b jar -o body -w %{http_code} ${url}"
body="${work}/token"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -b "$cookie_jar" \
    -H "Origin: ${base}" \
    "$url"
)"
ts="$(stamp)"
excerpt="leftover_route_not_required"
record "GET /api/auth/token with session cookie" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" != "200" ]] || fail "GET /api/auth/token with session returned 200"
{
  printf '## 2. Opaque session_token is not a JWT\n\n'
  printf '`ZOEN_AGENT_BEARER_TOKEN_FILE` holds the `session_token` cookie. `split(".")` length is not 3. `GET /api/auth/token` is not 200.\n\n'
} >> "$draft"

docker rm -f "$zoend_pg_name" >/dev/null 2>&1 || true
if ! docker run -d --name "$zoend_pg_name" \
  -e POSTGRES_DB=zoen \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:55405:5432 \
  postgres:18 >/dev/null; then
  fail "docker run zoend postgres failed"
fi
pg_ready=0
for _ in $(seq 1 120); do
  if docker exec "$zoend_pg_name" pg_isready -U postgres -d zoen >/dev/null 2>&1 \
    && python3 - <<'PY'
import socket
import sys
try:
    s = socket.create_connection(("127.0.0.1", 55405), timeout=1)
    s.close()
except OSError:
    sys.exit(1)
PY
  then
    pg_ready=1
    break
  fi
  sleep 0.5
done
if [[ "$pg_ready" -ne 1 ]]; then
  docker logs "$zoend_pg_name" >&2 || true
  fail "zoend postgres not ready"
fi
sleep 1

policies="${repo}/deploy/fly/policies.json"
zoend_bin="${repo}/target/debug/zoen"
if [[ ! -x "$zoend_bin" ]]; then
  (
    cd "$repo"
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
    cargo build --locked --package zoend
  )
fi
[[ -x "$zoend_bin" ]] || fail "zoend binary missing after build"

zoend_log="${work}/zoend.log"
(
  cd "$repo"
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  export DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55405/zoen'
  export ZOEN_AUTH_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55404/zoen_auth'
  export ZOEN_LISTEN_ADDR='127.0.0.1:58705'
  export ZOEN_CEDAR_POLICY_MANIFEST="$policies"
  export ZOEN_IDENTITY_ADMIN_TOKEN="$admin_token"
  unset ZOEN_OIDC_ISSUER ZOEN_OIDC_AUDIENCE ZOEN_OIDC_DISCOVERY_URL || true
  exec "$zoend_bin"
) >"$zoend_log" 2>&1 &
zoend_pid="$!"

zoend_ready=0
for _ in $(seq 1 120); do
  if curl -sf --connect-timeout 1 "${zoend_base}/ready" >/dev/null 2>&1 \
    || curl -sf --connect-timeout 1 "${zoend_base}/health" >/dev/null 2>&1; then
    zoend_ready=1
    break
  fi
  if ! kill -0 "$zoend_pid" 2>/dev/null; then
    cat "$zoend_log" >&2
    fail "zoend exited before ready"
  fi
  sleep 0.25
done
if [[ "$zoend_ready" -ne 1 ]]; then
  cat "$zoend_log" >&2 || true
  fail "zoend /ready did not answer"
fi

bind_log="${work}/bind.log"
if ! (
  export BETTER_AUTH_URL
  export ZOEN_BA_AGENT_EMAIL
  export ZOEN_BA_AGENT_PASSWORD
  export ZOEN_BA_DOOR_URL
  export ZOEN_ZOEND
  export ZOEN_IDENTITY_ADMIN_TOKEN
  timeout 90 "${repo}/deploy/fly/zoen-ensure-agent-binding"
) >"$bind_log" 2>&1; then
  cat "$bind_log" >&2 || true
  cat "$zoend_log" >&2 || true
  fail "agent binding did not converge"
fi
ts="$(stamp)"
excerpt="bound_auth_door_principal.admin.a"
record "zoen-ensure-agent-binding" "deploy/fly/zoen-ensure-agent-binding" "$zoend_base" "0" "$excerpt" "$ts"

remint_token="$(tr -d '\n' < "$token_file")"
url="${zoend_base}/identity/admin/resolve-context?tenant=tenant.a"
body="${work}/remint-resolve"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${remint_token}" \
    "$url"
)"
resolved_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("membershipId",""))' < "$body" 2>/dev/null || true)"
excerpt="membershipId=${resolved_membership:-empty}"
record "GET /identity/admin/resolve-context (remint opaque session)" "curl -sS -o body -w %{http_code} -H Authorization:Bearer <remint-session> ${url}" "$url" "$status" "$excerpt" "$(stamp)"
[[ "$status" == "200" ]] || {
  cat "$body" >&2 || true
  cat "$zoend_log" >&2 || true
  fail "remint resolve-context status ${status}, want 200"
}
[[ -n "$resolved_membership" ]] || fail "remint resolve-context missing membershipId"

garbage_log="${work}/garbage.log"
if (
  cd "$repo"
  export ZOEN_TENANT_ID='tenant.a'
  export ZOEN_PUBLISH_BEARER='not-a-jwt'
  export ZOEN_PERSONAL_DEFINITION_PATH="${repo}/testdata/lakes/personal.canonical.json"
  export ZOEN_ZOEND="$zoend_base"
  npx --yes tsx apps/auth/scripts/publish-with-bearer.ts
) >"$garbage_log" 2>&1; then
  garbage_status="$(grep -E '^status=' "$garbage_log" | tail -n1 | cut -d= -f2)"
else
  garbage_status="error"
  cat "$garbage_log" >&2 || true
fi
excerpt="garbage_bearer"
record "DefinitionService.publish garbage Bearer" "npx tsx apps/auth/scripts/publish-with-bearer.ts" "$zoend_base" "$garbage_status" "$excerpt" "$(stamp)"
if [[ "$garbage_status" != "401" ]]; then
  fail "garbage Bearer status ${garbage_status}, want 401"
fi

supervisord="${repo}/deploy/fly/supervisord.conf"
if grep -q '^\[program:keycloak\]' "$supervisord"; then
  fail "keycloak program still in supervisord"
fi
grep -q '^\[program:auth\]' "$supervisord" || fail "auth program missing"
grep -q '^\[program:remint\]' "$supervisord" || fail "remint program missing"
excerpt="keycloak_gone_auth_remint_present"
record "Keycloak gone, auth and remint stay" "grep program:auth deploy/fly/supervisord.conf" "$supervisord" "n/a" "$excerpt" "$(stamp)"

{
  printf '## 3. Remint Bearer mints TEC\n\n'
  printf '`deploy/fly/zoen-remint-agent` wrote the opaque `session_token`. `GET /identity/admin/resolve-context?tenant=tenant.a` with that Bearer returned 200. Garbage Bearer returned 401.\n\n'
  printf '## 4. Keycloak program\n\n'
  printf '`[program:keycloak]` is gone from `deploy/fly/supervisord.conf`. `[program:auth]` and `[program:remint]` stay.\n\n'
  printf '## 5. Inventory: no machine mint on the door\n\n'
  printf '`POST /api/auth/oauth2/token` with `grant_type=client_credentials` is not a machine mint. `GET /api/auth/token` is not 200. Remint writes the opaque `session_token` cookie.\n\n'
} >> "$draft"

{
  printf '## Verdict\n\n'
  printf 'pass. remint writes the opaque session cookie on the loopback door. auth_door bind plus resolve-context mint a TEC. Keycloak is off the Fly image.\n'
} >> "$draft"
write_proof
