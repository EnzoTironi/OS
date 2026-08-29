#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$repo"

proof="/workspace/ship/drop-keycloak-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
stub_pid=""
fail=0

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
}

cleanup() {
  if [[ -n "${stub_pid}" ]] && kill -0 "$stub_pid" 2>/dev/null; then
    kill "$stub_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
}

record() {
  local heading="$1" command="$2" url="$3" status="$4" excerpt="$5"
  {
    printf '## %s\n\n' "$heading"
    printf 'command: %s\n' "$command"
    printf 'url: %s\n' "$url"
    printf 'status: %s\n' "$status"
    printf 'excerpt: %s\n' "$excerpt"
    printf 'timestamp: %s\n\n' "$(stamp)"
  } >> "$draft"
}

check() {
  local heading="$1" command="$2" excerpt="$3"
  local status="pass"
  if ! eval "$command" >/dev/null 2>&1; then
    status="fail"
    fail=1
  fi
  record "$heading" "$command" "n/a" "$status" "$excerpt"
}

mkdir -p "$(dirname "$proof")"

{
  printf '# Drop Keycloak from the Fly image\n\n'
  printf 'Source: `apps/auth/scripts/prove-drop-keycloak.sh`\n'
  printf 'Worktree: `%s`\n' "$repo"
  printf 'This run is local inventory plus a leftover-env wait. Live remount is not this proof.\n\n'
} > "$draft"

fly_hits="$(rg -n -F -e '[program:keycloak]' -e 'zoen-start-keycloak' deploy/fly || true)"
if [[ -n "$fly_hits" ]]; then
  fail=1
  excerpt="hits"
else
  excerpt="empty"
fi
record "rg [program:keycloak]|zoen-start-keycloak under deploy/fly" "rg -n -F -e '[program:keycloak]' -e 'zoen-start-keycloak' deploy/fly" "deploy/fly" "$excerpt" "${fly_hits:-empty}"

if grep -q 'ZOEN_OIDC_MACHINE_ISSUER' deploy/fly/fly.toml; then
  fail=1
  machine_status="present"
else
  machine_status="absent"
fi
record "fly.toml has no ZOEN_OIDC_MACHINE_ISSUER" "grep ZOEN_OIDC_MACHINE_ISSUER deploy/fly/fly.toml" "deploy/fly/fly.toml" "$machine_status" "ZOEN_OIDC_MACHINE_ISSUER ${machine_status}"

if grep -E '^[[:space:]]*KC_' deploy/fly/fly.toml; then
  fail=1
  kc_status="present"
else
  kc_status="absent"
fi
record "fly.toml has no KC_* boot env" "grep -E '^[[:space:]]*KC_' deploy/fly/fly.toml" "deploy/fly/fly.toml" "$kc_status" "KC_* ${kc_status}"

if grep -q 'ZOEN_OIDC_MACHINE_ISSUER' apps/zoend/src/config.rs; then
  fail=1
  zoend_status="present"
else
  zoend_status="absent"
fi
record "zoend config has no second Keycloak source" "grep ZOEN_OIDC_MACHINE_ISSUER apps/zoend/src/config.rs" "apps/zoend/src/config.rs" "$zoend_status" "MACHINE_ISSUER ${zoend_status}"

if grep -q 'ZOEN_OIDC_MACHINE_ISSUER' deploy/fly/zoen-wait-for-oidc; then
  fail=1
  wait_status="present"
else
  wait_status="absent"
fi
record "wait-for-oidc does not wait on MACHINE_ISSUER" "grep ZOEN_OIDC_MACHINE_ISSUER deploy/fly/zoen-wait-for-oidc" "deploy/fly/zoen-wait-for-oidc" "$wait_status" "MACHINE_ISSUER ${wait_status}"

if grep -q '8080' deploy/fly/zoen-wait-for-oidc; then
  fail=1
  wait8080="present"
else
  wait8080="absent"
fi
record "wait-for-oidc does not name :8080" "grep 8080 deploy/fly/zoen-wait-for-oidc" "deploy/fly/zoen-wait-for-oidc" "$wait8080" "8080 ${wait8080}"

ready_src="$(rg -n -A 14 'async fn ready' apps/zoend/src/main.rs || true)"
if printf '%s\n' "$ready_src" | grep -q '8080'; then
  fail=1
  ready_status="mentions_8080"
else
  ready_status="postgres_integrity_only"
fi
record "GET /ready does not wait on :8080" "rg -n -A 14 'async fn ready' apps/zoend/src/main.rs" "apps/zoend/src/main.rs" "$ready_status" "verify_integrity"

check "remint still session-mints on loopback" "grep -q '127.0.0.1:58704' deploy/fly/zoen-remint-agent && grep -q 'api/auth/sign-in/email' deploy/fly/zoen-remint-agent && grep -q 'api/auth/token' deploy/fly/zoen-remint-agent" "sign-in/email plus GET /api/auth/token on 127.0.0.1:58704"

check "remint does not read MACHINE_ISSUER" "! grep -q ZOEN_OIDC_MACHINE_ISSUER deploy/fly/zoen-remint-agent" "absent"

check "supervisord keeps auth" "grep -q '^\\[program:auth\\]' deploy/fly/supervisord.conf" "[program:auth]"
check "supervisord keeps remint" "grep -q '^\\[program:remint\\]' deploy/fly/supervisord.conf" "[program:remint]"
check "supervisord keeps agent-binding" "grep -q '^\\[program:agent-binding\\]' deploy/fly/supervisord.conf" "[program:agent-binding]"
check "Dockerfile still COPYs zoen-start-auth" "grep -q 'zoen-start-auth' deploy/fly/Dockerfile" "COPY zoen-start-auth"
check "Dockerfile has no Keycloak image" "! grep -q keycloak deploy/fly/Dockerfile" "absent"
check "Dockerfile has no openjdk" "! grep -q openjdk deploy/fly/Dockerfile" "absent"
check "zoen-start-keycloak file is gone" "! test -e deploy/fly/zoen-start-keycloak" "deleted"
check "realm.template.json is gone" "! test -e deploy/fly/realm.template.json" "deleted"
check "local e2e Keycloak compose stays" "grep -q 'image: quay.io/keycloak/keycloak:26.0.7' e2e/governed-action/compose.yaml" "e2e/governed-action/compose.yaml"
check "local e2e prepare-realm stays" "test -f e2e/governed-action/prepare-realm.mjs" "e2e/governed-action/prepare-realm.mjs"
check "fly.toml keeps BA issuer" "grep -q 'ZOEN_OIDC_ISSUER = \"https://zoen.tironi.xyz\"' deploy/fly/fly.toml" "https://zoen.tironi.xyz"
check "fly.toml keeps loopback discovery" "grep -q 'ZOEN_OIDC_DISCOVERY_URL = \"http://127.0.0.1:58704\"' deploy/fly/fly.toml" "http://127.0.0.1:58704"
check "fly.toml keeps audience zoend" "grep -q 'ZOEN_OIDC_AUDIENCE = \"zoend\"' deploy/fly/fly.toml" "zoend"

export STUB_DIR="$work"
python3 - <<'PY' &
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

work = Path(os.environ["STUB_DIR"])


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path != "/.well-known/openid-configuration":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps({"issuer": f"http://127.0.0.1:{self.server.server_address[1]}"}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


httpd = HTTPServer(("127.0.0.1", 0), Handler)
port = httpd.server_address[1]
(work / "stub.port").write_text(str(port))
httpd.serve_forever()
PY
stub_pid="$!"

stub_ready=0
for _ in $(seq 1 50); do
  if [[ -s "${work}/stub.port" ]]; then
    stub_port="$(tr -d ' \n' < "${work}/stub.port")"
    if curl -sf "http://127.0.0.1:${stub_port}/.well-known/openid-configuration" >/dev/null 2>&1; then
      stub_ready=1
      break
    fi
  fi
  sleep 0.1
done
if [[ "$stub_ready" -ne 1 ]]; then
  fail=1
  record "leftover MACHINE_ISSUER must not hang wait-for-oidc" "timeout 8 deploy/fly/zoen-wait-for-oidc" "n/a" "fail" "discovery stub did not start"
else
  stub_port="$(tr -d ' \n' < "${work}/stub.port")"
  wait_out="${work}/wait.out"
  set +e
  ZOEN_OIDC_DISCOVERY_URL="http://127.0.0.1:${stub_port}" \
    ZOEN_OIDC_MACHINE_ISSUER="http://127.0.0.1:1/realms/zoen" \
    timeout 8 deploy/fly/zoen-wait-for-oidc sh -c 'printf "%s\n" exec_ok' >"$wait_out" 2>"${work}/wait.err"
  wait_exit="$?"
  set -e
  wait_body="$(tr '\n' ' ' < "$wait_out" || true)"
  if [[ "$wait_exit" -eq 0 && "$wait_body" == *exec_ok* ]]; then
    wait_status="pass"
  else
    wait_status="fail"
    fail=1
  fi
  record "leftover MACHINE_ISSUER must not hang wait-for-oidc" "ZOEN_OIDC_DISCOVERY_URL=stub ZOEN_OIDC_MACHINE_ISSUER=http://127.0.0.1:1/realms/zoen timeout 8 deploy/fly/zoen-wait-for-oidc sh -c printf exec_ok" "http://127.0.0.1:${stub_port}" "$wait_status" "exit=${wait_exit} body=${wait_body:-empty}"
fi

live_body="${work}/live-ready"
set +e
live_status="$(curl -sS -o "$live_body" -w '%{http_code}' --connect-timeout 5 https://zoen.tironi.xyz/ready)"
live_exit="$?"
set -e
live_excerpt="$(tr '\n' ' ' < "$live_body" | head -c 80)"
record "live GET https://zoen.tironi.xyz/ready (pre-remount)" "curl -sS -o body -w %{http_code} https://zoen.tironi.xyz/ready" "https://zoen.tironi.xyz/ready" "${live_status:-000}" "exit=${live_exit} excerpt=${live_excerpt:-empty}"

{
  printf '## Kept\n\n'
  printf '%s\n' '- Better Auth `[program:auth]` and `zoen-start-auth`'
  printf '%s\n' '- remint session mint on `127.0.0.1:58704`'
  printf '%s\n' '- `ZOEN_OIDC_ISSUER=https://zoen.tironi.xyz`'
  printf '%s\n' '- `ZOEN_OIDC_DISCOVERY_URL=http://127.0.0.1:58704`'
  printf '%s\n' '- audience `zoend`'
  printf '%s\n' '- local e2e Keycloak (`e2e/*/compose.yaml`, `prepare-realm.mjs`)'
  printf '\n## Out of this PR\n\n'
  printf '%s\n' '- Live Fly remount. Coder remounts after squash. Missing remount is not a fail.'
  printf '%s\n' '- Unset Fly secrets `KC_*` / `ZOEN_OIDC_CLIENT_SECRET`'
  printf '%s\n' '- `deploy/fly/compose.yaml` still has a local Keycloak service. Fly deploy does not use that file.'
  printf '%s\n' '- Eve on Fly. Kapso point. Companion `/send`.'
  printf '\n'
} >> "$draft"

if [[ "$fail" -ne 0 ]]; then
  printf '## Verdict\n\nfail\n' >> "$draft"
  cp "$draft" "$proof"
  printf 'wrote %s\n' "$proof" >&2
  exit 1
fi

printf '## Verdict\n\npass. Keycloak is off the Fly image. zoend waits on Better Auth discovery only. leftover MACHINE_ISSUER does not hang boot. remint still session-mints on loopback.\n' >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
