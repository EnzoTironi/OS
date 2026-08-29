#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$root"

if [[ -z "${DOCKER_HOST:-}" && ! -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

listen="http://127.0.0.1:58704"
issuer="http://127.0.0.1:58799"
machine_issuer="http://127.0.0.1:58798"
machine_jwks_lie="http://127.0.0.1:1/jwks"
ok_url="${listen}/api/auth/ok"
zoend_base="http://127.0.0.1:58705"
proof="/workspace/ship/issuer-cutover-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
cookie_jar="${work}/cookies.txt"
zoend_pg_name="zoen-issuer-cutover-pg-$$"
zoend_pid=""
auth_started=0
stub_pid=""

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
  if [[ -n "${stub_pid}" ]] && kill -0 "$stub_pid" 2>/dev/null; then
    kill_tree "$stub_pid"
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
export BETTER_AUTH_URL="$issuer"

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
fuser -k 58798/tcp >/dev/null 2>&1 || true
fuser -k 58705/tcp >/dev/null 2>&1 || true

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

STUB_DIR="$work" STUB_ISSUER="$machine_issuer" STUB_JWKS_LIE="$machine_jwks_lie" STUB_PORT=58798 python3 - <<'PY' &
import base64
import json
import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

work = Path(os.environ["STUB_DIR"])
key = work / "machine.pem"
subprocess.check_call(
    ["openssl", "genrsa", "-out", str(key), "2048"],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
mod = subprocess.check_output(
    ["openssl", "rsa", "-in", str(key), "-noout", "-modulus"],
    text=True,
)
n_hex = mod.strip().split("=", 1)[1]
n = b64url(bytes.fromhex(n_hex))
e = b64url((65537).to_bytes(3, "big"))
kid = "cutover-machine"
jwks = {
    "keys": [
        {"kty": "RSA", "alg": "RS256", "use": "sig", "kid": kid, "n": n, "e": e}
    ]
}
issuer = os.environ["STUB_ISSUER"]
jwks_lie = os.environ["STUB_JWKS_LIE"]
now = int(time.time())
header = {"alg": "RS256", "typ": "JWT", "kid": kid}
payload = {
    "iss": issuer,
    "aud": "zoend",
    "sub": "machine-cutover",
    "exp": now + 3600,
    "iat": now,
}
signing_input = (
    b64url(json.dumps(header, separators=(",", ":")).encode())
    + "."
    + b64url(json.dumps(payload, separators=(",", ":")).encode())
)
sig = subprocess.check_output(
    ["openssl", "dgst", "-sha256", "-sign", str(key)],
    input=signing_input.encode(),
)
(work / "machine.token").write_text(f"{signing_input}.{b64url(sig)}")
(work / "machine.token").chmod(0o600)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/.well-known/openid-configuration":
            body = json.dumps({"issuer": issuer, "jwks_uri": jwks_lie}).encode()
        elif path == "/jwks":
            body = json.dumps(jwks).encode()
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("127.0.0.1", int(os.environ["STUB_PORT"])), Handler).serve_forever()
PY
stub_pid="$!"

stub_ready=0
for _ in $(seq 1 40); do
  if curl -sf "${machine_issuer}/.well-known/openid-configuration" >/dev/null 2>&1; then
    stub_ready=1
    break
  fi
  sleep 0.1
done
if [[ "$stub_ready" -ne 1 ]]; then
  fail "machine discovery stub did not become ready"
fi
[[ -s "${work}/machine.token" ]] || fail "machine token missing"

{
  printf '# zoend issuer cutover proof\n\n'
  printf 'Source: `apps/auth/scripts/prove-issuer-cutover.sh`\n'
  printf 'Auth listen: `%s`\n' "$listen"
  printf 'Token issuer: `%s`\n' "$issuer"
  printf 'Machine issuer: `%s`\n' "$machine_issuer"
  printf 'zoend host: `%s`\n\n' "$zoend_base"
  printf 'This run is local. Live Fly is recorded separately and is not this remount.\n\n'
  printf '## Boot discovery\n\n'
  printf 'zoend loads `ZOEN_OIDC_ISSUER` as the token `iss` and fetches `/.well-known/openid-configuration` from `ZOEN_OIDC_DISCOVERY_URL`. JWKS is fetched at the discovery origin plus the advertised `jwks_uri` path, so a public `jwks_uri` does not hairpin the Fly HTTPS listener. If the issuer host is not loopback, discovery must be loopback or boot refuses to start.\n\n'
  printf 'This script sets issuer `%s` (nothing listens) and discovery `%s`. zoend still reached `/ready`.\n\n' "$issuer" "$listen"
  printf '## remint and agent.token\n\n'
  printf '`deploy/fly/zoen-remint-agent` session-mints on loopback door `http://127.0.0.1:58704`. It signs in with email, then `GET /api/auth/token`, and writes `ZOEN_AGENT_BEARER_TOKEN_FILE` (`/data/zoen/agent.token` on Fly). Origin is `BETTER_AUTH_URL`. Remint does not POST Keycloak and does not read `ZOEN_OIDC_MACHINE_ISSUER`. Keycloak stays in supervisord. zoend may still load `ZOEN_OIDC_MACHINE_ISSUER` JWKS this week.\n\n'
  printf 'The machine Bearer below is a local JWKS stand-in, not a signer inside zoend.\n\n'
  printf '## Local prove\n\n'
} > "$draft"

url="${listen}/.well-known/openid-configuration"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/oidc"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
disc_issuer="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["issuer"])' < "$body")"
jwks_uri="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jwks_uri"])' < "$body")"
excerpt="issuer=${disc_issuer} jwks_uri=${jwks_uri}"
record "GET loopback /.well-known/openid-configuration" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "openid-configuration status ${status}"
[[ "$disc_issuer" == "$issuer" ]] || fail "unexpected issuer ${disc_issuer}"
[[ "$jwks_uri" == "${issuer}/api/auth/jwks" ]] || fail "unexpected jwks_uri ${jwks_uri}"

url="${issuer}/.well-known/openid-configuration"
command="curl -sS -o body -w %{http_code} --connect-timeout 1 ${url}"
body="${work}/oidc-hairpin"
set +e
status="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 1 "$url" 2>"${work}/hairpin.err")"
hairpin_exit="$?"
set -e
ts="$(stamp)"
if [[ "$hairpin_exit" -eq 0 ]]; then
  excerpt="issuer_fetch_status=${status}"
  record "GET token-iss /.well-known/openid-configuration (must fail)" "$command" "$url" "$status" "$excerpt" "$ts"
  fail "token issuer unexpectedly answered discovery"
fi
excerpt="connect_failed"
record "GET token-iss /.well-known/openid-configuration (must fail)" "$command" "$url" "000" "$excerpt" "$ts"

url="${listen}/api/auth/jwks"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/jwks"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
key_count="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("keys", [])))' < "$body")"
alg="$(python3 -c 'import json,sys; keys=json.load(sys.stdin).get("keys", []); print(keys[0].get("alg","") if keys else "")' < "$body")"
excerpt="keys=${key_count} alg=${alg}"
record "GET loopback /api/auth/jwks" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "jwks status ${status}"
[[ "$key_count" -ge 1 ]] || fail "jwks has no keys"
[[ "$alg" == "RS256" ]] || fail "jwks alg is ${alg}, want RS256"

email="issuer-cutover-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-issuer-cutover-1","name":"cutover"}))' "$email")"
url="${issuer}/api/auth/sign-up/email"
command="curl -sS --connect-to 127.0.0.1:58799:127.0.0.1:58704 -c jar -o body -w %{http_code} -H content-type:application/json -H Origin:${issuer} -d {email,password,name} ${url}"
body="${work}/signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    --connect-to 127.0.0.1:58799:127.0.0.1:58704 \
    -c "$cookie_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${issuer}" \
    -d "$signup_json" \
    "$url"
)"
ts="$(stamp)"
excerpt="signed_up=yes cookie_jar=set"
record "POST /api/auth/sign-up/email via connect-to" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || {
  cat "$body" >&2
  fail "sign-up status ${status}"
}

url="${issuer}/api/auth/token"
command="curl -sS --connect-to 127.0.0.1:58799:127.0.0.1:58704 -b jar -o body -w %{http_code} ${url}"
body="${work}/token"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    --connect-to 127.0.0.1:58799:127.0.0.1:58704 \
    -b "$cookie_jar" \
    -H "Origin: ${issuer}" \
    "$url"
)"
ts="$(stamp)"
if [[ "$status" != "200" ]]; then
  cat .auth.log >&2 || true
  fail "token status ${status}"
fi
token="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' < "$body")"
[[ -n "$token" ]] || fail "token response missing token"
excerpt="token=minted"
record "GET /api/auth/token" "$command" "$url" "$status" "$excerpt" "$ts"

machine_token="$(cat "${work}/machine.token")"
[[ -n "$machine_token" ]] || fail "machine token empty"

url="${machine_issuer}/.well-known/openid-configuration"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/machine-oidc"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
machine_jwks_uri="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jwks_uri"])' < "$body")"
excerpt="jwks_uri=${machine_jwks_uri}"
record "GET machine discovery (jwks_uri is a dead origin)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "machine discovery status ${status}"
[[ "$machine_jwks_uri" == "$machine_jwks_lie" ]] || fail "unexpected machine jwks_uri ${machine_jwks_uri}"

url="$machine_jwks_lie"
command="curl -sS -o body -w %{http_code} --connect-timeout 1 ${url}"
body="${work}/machine-jwks-lie"
set +e
status="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 1 "$url" 2>"${work}/machine-jwks-lie.err")"
lie_exit="$?"
set -e
ts="$(stamp)"
if [[ "$lie_exit" -eq 0 ]]; then
  excerpt="dead_jwks_status=${status}"
  record "GET advertised machine jwks (must fail)" "$command" "$url" "$status" "$excerpt" "$ts"
  fail "advertised machine jwks unexpectedly answered"
fi
excerpt="connect_failed"
record "GET advertised machine jwks (must fail)" "$command" "$url" "000" "$excerpt" "$ts"

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
  export ZOEN_OIDC_ISSUER="$issuer"
  export ZOEN_OIDC_DISCOVERY_URL="$listen"
  export ZOEN_OIDC_MACHINE_ISSUER="$machine_issuer"
  export ZOEN_OIDC_AUDIENCE='zoend'
  export ZOEN_LISTEN_ADDR='127.0.0.1:58705'
  export ZOEN_CEDAR_POLICY_MANIFEST="$policies"
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

url="${zoend_base}/ready"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/ready"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="ready"
record "GET /ready" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "zoend /ready status ${status}"

url="${zoend_base}/identity/admin/bootstrap-bound"
command="curl -sS -o body -w %{http_code} -X POST -H Authorization:Bearer <ba> ${url}"
body="${work}/bootstrap-ba"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    "$url"
)"
ts="$(stamp)"
excerpt="ba_bearer"
record "POST /identity/admin/bootstrap-bound (Better Auth Bearer)" "$command" "$url" "$status" "$excerpt" "$ts"
if [[ "$status" == "401" ]]; then
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "Better Auth Bearer returned 401"
fi
[[ "$status" == "200" ]] || {
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "Better Auth Bearer status ${status}, want 200"
}

command="curl -sS -o body -w %{http_code} -X POST -H Authorization:Bearer <machine> ${url}"
body="${work}/bootstrap-machine"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${machine_token}" \
    "$url"
)"
ts="$(stamp)"
excerpt="machine_bearer"
record "POST /identity/admin/bootstrap-bound (machine issuer Bearer)" "$command" "$url" "$status" "$excerpt" "$ts"
if [[ "$status" == "401" ]]; then
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "machine Bearer returned 401"
fi
[[ "$status" == "200" ]] || {
  cat "$zoend_log" >&2 || true
  cat "$body" >&2 || true
  fail "machine Bearer status ${status}, want 200"
}

command="curl -sS -o body -w %{http_code} -X POST -H Authorization:Bearer not-a-jwt ${url}"
body="${work}/bootstrap-bad"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H 'Authorization: Bearer not-a-jwt' \
    "$url"
)"
ts="$(stamp)"
excerpt="garbage_bearer"
record "POST /identity/admin/bootstrap-bound (garbage Bearer)" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "401" ]] || fail "garbage Bearer status ${status}, want 401"

remint="${repo}/deploy/fly/zoen-remint-agent"
grep -q 'api/auth/sign-in/email' "$remint" || fail "remint missing BA sign-in"
grep -q 'api/auth/token' "$remint" || fail "remint missing BA token mint"
grep -q '127.0.0.1:58704' "$remint" || fail "remint default door is not loopback 58704"
grep -q 'BETTER_AUTH_URL' "$remint" || fail "remint does not read BETTER_AUTH_URL"
if grep -q 'ZOEN_OIDC_MACHINE_ISSUER' "$remint"; then
  fail "remint still reads ZOEN_OIDC_MACHINE_ISSUER"
fi
if grep -q 'protocol/openid-connect/token' "$remint"; then
  fail "remint still posts Keycloak token endpoint"
fi
if grep -F '${ZOEN_OIDC_ISSUER' "$remint"; then
  fail "remint still reads ZOEN_OIDC_ISSUER"
fi
excerpt="remint_session_mint_loopback_door"
record "remint session mint" "grep api/auth/token deploy/fly/zoen-remint-agent" "$remint" "n/a" "$excerpt" "$(stamp)"

supervisord="${repo}/deploy/fly/supervisord.conf"
grep -q '^\[program:keycloak\]' "$supervisord" || fail "keycloak program missing"
grep -q '^\[program:remint\]' "$supervisord" || fail "remint program missing"
grep -q '^\[program:agent-binding\]' "$supervisord" || fail "agent-binding program missing"
grep -q 'zoen-start-keycloak' "$supervisord" || fail "zoen-start-keycloak missing"
excerpt="keycloak_and_remint_present"
record "Keycloak program stays" "grep program:keycloak deploy/fly/supervisord.conf" "$supervisord" "n/a" "$excerpt" "$(stamp)"

mkdir -p "$(dirname "$proof")"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
