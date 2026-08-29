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
verdict="pass"
fail_open_reason=""

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
export ZOEN_IDENTITY_BASE_URL="$zoend_base"

npx --yes auth@1.7.2 migrate --config src/auth.ts --yes
docker compose exec -T postgres psql -U postgres -d zoen_auth -c 'TRUNCATE TABLE jwks;' >/dev/null

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
  printf 'Remint curls loopback door `%s` (never the public origin). Grant name: `session`.\n' "$base"
  printf 'Steps: optional `POST /api/auth/sign-up/email`, then `POST /api/auth/sign-in/email`, then `GET /api/auth/token`.\n'
  printf 'Origin header is `BETTER_AUTH_URL` with trailing slash stripped. JWT lands in `ZOEN_AGENT_BEARER_TOKEN_FILE`.\n\n'
} > "$draft"

url="${base}/.well-known/openid-configuration"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/oidc"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
issuer="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["issuer"])' < "$body")"
jwks_uri="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jwks_uri"])' < "$body")"
excerpt="issuer=${issuer} jwks_uri=${jwks_uri}"
record "GET /.well-known/openid-configuration" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "openid-configuration status ${status}"
[[ "$issuer" == "http://127.0.0.1:58704" ]] || fail "unexpected issuer ${issuer}"

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
excerpt="session_required"
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
[[ "$status" == "200" ]] || {
  cat "$body" >&2
  fail "token status ${status}"
}
python3 -c 'import json,sys; open(sys.argv[1],"w").write(json.load(open(sys.argv[2]))["token"])' "$token_file" "$body"
chmod 600 "$token_file"
token_iss="$(python3 -c '
import base64, json, sys
token = open(sys.argv[1]).read().strip()
part = token.split(".")[1]
part += "=" * (-len(part) % 4)
payload = json.loads(base64.urlsafe_b64decode(part.encode()))
if "principal_id" in payload:
    raise SystemExit("principal_id present in JWT")
print(payload.get("iss", ""))
' "$token_file")"
excerpt="iss_checked principal_id_absent"
record "GET /api/auth/token (session grant)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$token_iss" == "$BETTER_AUTH_URL" ]] || fail "token iss ${token_iss} != ${BETTER_AUTH_URL}"
{
  printf '## 2. Token iss is BA issuer\n\n'
  printf 'Decoded JWT `iss` equals `BETTER_AUTH_URL` (`%s`), not Keycloak. `principal_id` absent.\n\n' "$token_iss"
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
zoend_bin="${repo}/target/debug/zoend"
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
  export ZOEN_OIDC_ISSUER='http://127.0.0.1:58704'
  export ZOEN_OIDC_AUDIENCE='zoend'
  export ZOEN_LISTEN_ADDR='127.0.0.1:58705'
  export ZOEN_CEDAR_POLICY_MANIFEST="$policies"
  export ZOEN_IDENTITY_ADMIN_TOKEN="$admin_token"
  unset ZOEN_OIDC_MACHINE_ISSUER || true
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
  export ZOEN_IDENTITY_BASE_URL
  export ZOEN_IDENTITY_ADMIN_TOKEN
  timeout 90 "${repo}/deploy/fly/zoen-ensure-agent-binding"
) >"$bind_log" 2>&1; then
  cat "$bind_log" >&2 || true
  cat "$zoend_log" >&2 || true
  verdict="fail-open"
  fail_open_reason="agent binding did not converge without fake claims"
fi
ts="$(stamp)"
if [[ "$verdict" == "pass" ]]; then
  excerpt="bound_web_oidc_principal.admin.a"
  record "zoen-ensure-agent-binding" "deploy/fly/zoen-ensure-agent-binding" "$zoend_base" "0" "$excerpt" "$ts"
else
  excerpt="bind_failed"
  record "zoen-ensure-agent-binding" "deploy/fly/zoen-ensure-agent-binding" "$zoend_base" "failed" "$excerpt" "$ts"
fi

if [[ ! -d "${repo}/node_modules" ]]; then
  (cd "$repo" && npm ci)
fi

lake_ok=0
if [[ "$verdict" == "pass" ]]; then
  lake_log="${work}/lake.log"
  if (
    cd "$repo"
    export ZOEN_TENANT_ID='tenant.a'
    export ZOEN_AGENT_BEARER_TOKEN_FILE="$token_file"
    export ZOEN_PERSONAL_DEFINITION_PATH="${repo}/packages/ontology/fixtures/personal.zoen.ts"
    export ZOEN_WORLD_DEFINITION_PATH="${repo}/packages/ontology/fixtures/commercial.zoen.ts"
    export ZOEN_IDENTITY_BASE_URL="$zoend_base"
    export ZOEN_PERSONAL_LAKE_READY_FILE="${work}/personal.lake.ready"
    export ZOEN_COMMERCIAL_LAKE_READY_FILE="${work}/commercial.lake.ready"
    npx --yes tsx deploy/fly/ensure-personal-lake.ts
  ) >"$lake_log" 2>&1; then
    lake_ok=1
    excerpt="lake_publish_activate_ok"
    record "ensure-personal-lake publish/activate" "npx tsx deploy/fly/ensure-personal-lake.ts" "$zoend_base" "0" "$excerpt" "$(stamp)"
  else
    cat "$lake_log" >&2 || true
    cat "$zoend_log" >&2 || true
    verdict="fail-open"
    fail_open_reason="lake publish/activate failed without fake claims"
    excerpt="lake_failed"
    record "ensure-personal-lake publish/activate" "npx tsx deploy/fly/ensure-personal-lake.ts" "$zoend_base" "failed" "$excerpt" "$(stamp)"
  fi
fi

garbage_status="skipped"
if [[ "$verdict" == "pass" ]]; then
  garbage_log="${work}/garbage.log"
  if (
    cd "$repo"
    export ZOEN_TENANT_ID='tenant.a'
    export ZOEN_PUBLISH_BEARER='not-a-jwt'
    export ZOEN_PERSONAL_DEFINITION_PATH="${repo}/packages/ontology/fixtures/personal.zoen.ts"
    export ZOEN_IDENTITY_BASE_URL="$zoend_base"
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
  printf '## 3. Lake publish\n\n'
  if [[ "$verdict" == "pass" && "$lake_ok" -eq 1 ]]; then
    printf 'Lake publish/activate accepted the BA session Bearer for `tenant.a`. Garbage Bearer returned 401.\n\n'
  else
    printf 'Lake publish/activate did not succeed with a BA session JWT and WebOidc bind. No fake claims were injected.\n\n'
  fi
  printf '## 4. Keycloak program\n\n'
  printf '`[program:keycloak]` is gone from `deploy/fly/supervisord.conf`. `[program:auth]` and `[program:remint]` stay.\n\n'
  printf '## 5. Inventory: no official client_credentials on the door\n\n'
  printf 'Discovery is issuer + jwks_uri only. `POST /api/auth/oauth2/token` with `grant_type=client_credentials` is not a machine mint. `GET /api/auth/token` without a session is not 200. Remint uses grant `session`.\n\n'
} >> "$draft"

if [[ "$verdict" != "pass" ]]; then
  {
    printf '## Verdict\n\n'
    printf 'fail-open. %s. Remint was not rewritten.\n' "$fail_open_reason"
  } >> "$draft"
  write_proof
  fail "fail-open: ${fail_open_reason}"
fi

{
  printf '## Verdict\n\n'
  printf 'pass. remint session-mints on loopback door. bind plus lake publish work without fake claims. Keycloak is off the Fly image.\n'
} >> "$draft"
write_proof
