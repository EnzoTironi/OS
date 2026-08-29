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
proof="/workspace/ship/s1-door-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
none_jar="${work}/none.cookies"
active_jar="${work}/active.cookies"
zoend_pg_name="zoen-s1-door-pg-$$"
zoend_pid=""
auth_started=0

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

session_token_from_jar() {
  python3 - "$1" <<'PY'
import sys
path = sys.argv[1]
for raw in open(path, encoding="utf-8"):
    line = raw.rstrip("\n")
    if not line.strip():
        continue
    if line.startswith("#") and not line.startswith("#HttpOnly_"):
        continue
    if line.startswith("#HttpOnly_"):
        line = line[len("#HttpOnly_"):]
    parts = line.split("\t")
    if len(parts) >= 7 and parts[5].endswith("session_token"):
        print(parts[6])
        raise SystemExit(0)
raise SystemExit("session_token cookie missing")
PY
}

membership_count() {
  docker exec "$zoend_pg_name" psql -U postgres -d zoen -tAc \
    "SELECT count(*) FROM memberships"
}

binding_count() {
  docker exec "$zoend_pg_name" psql -U postgres -d zoen -tAc \
    "SELECT count(*) FROM external_bindings WHERE provider = 'auth_door'"
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
  printf '# s1-door proof\n\n'
  printf 'Source: `apps/auth/scripts/prove-s1-door.sh`\n'
  printf 'Auth host: `%s`\n' "$base"
  printf 'zoend host: `%s`\n\n' "$zoend_base"
} > "$draft"

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

policies="${work}/policies.json"
printf '%s\n' '{"policies":[]}' > "$policies"

zoend_bin="${repo}/target/debug/zoend"
(
  cd "$repo"
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  cargo build --locked --package zoend
)
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

none_email="s1-door-none-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s1-door-1","name":"s1 none"}))' "$none_email")"
url="${base}/api/auth/sign-up/email"
command="curl -sS -c none.jar -o body -w %{http_code} -H content-type:application/json -H Origin:${base} -d {email,password,name} ${url}"
body="${work}/none-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$none_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "$url"
)"
ts="$(stamp)"
excerpt="signed_up_status=${status}"
record "POST /api/auth/sign-up/email (no membership)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || {
  cat "$body" >&2
  fail "none sign-up status ${status}"
}
none_token="$(session_token_from_jar "$none_jar")"
[[ -n "$none_token" ]] || fail "none session cookie missing"

before_memberships="$(membership_count)"
before_bindings="$(binding_count)"
url="${zoend_base}/identity/admin/resolve-context?tenant=tenant.none"
command="curl -sS -o body -w %{http_code} -H Authorization:Bearer <planted-session> ${url}"
body="${work}/none-resolve"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${none_token}" \
    "$url"
)"
ts="$(stamp)"
after_memberships="$(membership_count)"
after_bindings="$(binding_count)"
excerpt="memberships_before=${before_memberships} memberships_after=${after_memberships} bindings_before=${before_bindings} bindings_after=${after_bindings} body=$(tr -d '\n' < "$body")"
record "GET /identity/admin/resolve-context (no membership)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "403" ]] || {
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "no membership status ${status}, want 403"
}
[[ "$after_memberships" == "$before_memberships" ]] || fail "resolve INSERT memberships ${before_memberships} -> ${after_memberships}"
[[ "$after_bindings" == "$before_bindings" ]] || fail "resolve INSERT bindings ${before_bindings} -> ${after_bindings}"

active_email="s1-door-active-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s1-door-1","name":"s1 active"}))' "$active_email")"
url="${base}/api/auth/sign-up/email"
command="curl -sS -c active.jar -o body -w %{http_code} -H content-type:application/json -H Origin:${base} -d {email,password,name} ${url}"
body="${work}/active-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$active_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "$url"
)"
ts="$(stamp)"
excerpt="signed_up_status=${status}"
record "POST /api/auth/sign-up/email (active)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || {
  cat "$body" >&2
  fail "active sign-up status ${status}"
}
active_token="$(session_token_from_jar "$active_jar")"
[[ -n "$active_token" ]] || fail "active session cookie missing"

url="${zoend_base}/identity/admin/bootstrap-bound"
command="curl -sS -o body -w %{http_code} -X POST -H Authorization:Bearer <planted-session> ${url}"
body="${work}/bootstrap"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${active_token}" \
    "$url"
)"
ts="$(stamp)"
tenant_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["tenantId"])' < "$body")"
membership_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
[[ -n "$tenant_id" ]] || fail "bootstrap missing tenantId"
[[ -n "$membership_id" ]] || fail "bootstrap missing membershipId"
excerpt="bootstrap_write=yes tenant=${tenant_id} membership=${membership_id}"
record "POST /identity/admin/bootstrap-bound (Door, first Personal)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || {
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "bootstrap-bound status ${status}"
}
after_bootstrap="$(membership_count)"

url="${zoend_base}/identity/admin/resolve-context?tenant=${tenant_id}"
command="curl -sS -o body -w %{http_code} -H Authorization:Bearer <planted-session> ${url}"
body="${work}/active-resolve"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${active_token}" \
    "$url"
)"
ts="$(stamp)"
after_resolve="$(membership_count)"
resolved_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
resolved_clearance="$(python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)["clearance"]))' < "$body")"
excerpt="membershipId=${resolved_membership} clearance=${resolved_clearance} memberships_after_bootstrap=${after_bootstrap} memberships_after_resolve=${after_resolve}"
record "GET /identity/admin/resolve-context (Active membership)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || {
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "active resolve status ${status}"
}
[[ "$resolved_membership" == "$membership_id" ]] || fail "resolve membership ${resolved_membership} != bootstrap ${membership_id}"
[[ "$resolved_clearance" == "zoen.world.floor" ]] || fail "clearance ${resolved_clearance}, want zoen.world.floor"
[[ "$after_resolve" == "$after_bootstrap" ]] || fail "resolve INSERT after bootstrap ${after_bootstrap} -> ${after_resolve}"

url="${zoend_base}/identity/admin/resolve-context?tenant=tenant.none"
command="curl -sS -o body -w %{http_code} -H Authorization:Bearer not-a-jwt ${url}"
body="${work}/garbage"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -H 'Authorization: Bearer not-a-jwt' \
    "$url"
)"
ts="$(stamp)"
excerpt="garbage_bearer"
record "GET /identity/admin/resolve-context (garbage Bearer)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "401" ]] || fail "garbage Bearer status ${status}, want 401"

hatch="$(
  cd "$repo"
  rg -n 'into_unbound_execution_context' crates/zoen-core apps/zoend || true
)"
oidc="$(
  cd "$repo"
  rg -n 'ProcessAuth::Oidc' apps/zoend || true
)"
ba_types="$(
  cd "$repo"
  rg -n -i 'better-auth|BetterAuth' crates/zoen-core crates/zoen-engine apps/zoend/src || true
)"
record "rg into_unbound_execution_context dest paths" "rg -n into_unbound_execution_context crates/zoen-core apps/zoend" "(repo)" "empty" "hits=${hatch:-none}" "$(stamp)"
record "rg ProcessAuth::Oidc dest paths" "rg -n ProcessAuth::Oidc apps/zoend" "(repo)" "empty" "hits=${oidc:-none}" "$(stamp)"
record "rg Better Auth types in zoen-core zoen-engine zoend src" "rg -n -i better-auth|BetterAuth crates/zoen-core crates/zoen-engine apps/zoend/src" "(repo)" "empty" "hits=${ba_types:-none}" "$(stamp)"
[[ -z "$hatch" ]] || fail "into_unbound_execution_context still present"
[[ -z "$oidc" ]] || fail "ProcessAuth::Oidc still present"
[[ -z "$ba_types" ]] || fail "Better Auth types leaked into kernel/zoend src"

mkdir -p "$(dirname "$proof")"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
