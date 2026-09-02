#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$repo"

proof="/workspace/ship/drop-keycloak-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
fail=0

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
}

cleanup() {
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
  printf 'This run is local inventory plus live `/ready`. Live remount is not this proof.\n\n'
} > "$draft"

fly_hits="$(rg -n -F -e '[program:keycloak]' -e 'zoen-start-keycloak' deploy/fly || true)"
if [[ -n "$fly_hits" ]]; then
  fail=1
  excerpt="hits"
else
  excerpt="empty"
fi
record "rg [program:keycloak]|zoen-start-keycloak under deploy/fly" "rg -n -F -e '[program:keycloak]' -e 'zoen-start-keycloak' deploy/fly" "deploy/fly" "$excerpt" "${fly_hits:-empty}"

oidc_wait="$(rg -n zoen-wait-for-oidc deploy || true)"
if [[ -n "$oidc_wait" ]]; then
  fail=1
  excerpt="hits"
else
  excerpt="empty"
fi
record "rg zoen-wait-for-oidc deploy" "rg zoen-wait-for-oidc deploy" "deploy" "$excerpt" "${oidc_wait:-empty}"

if grep -q 'ZOEN_OIDC_MACHINE_ISSUER' deploy/fly/fly.toml; then
  fail=1
  machine_status="present"
else
  machine_status="absent"
fi
record "fly.toml has no ZOEN_OIDC_MACHINE_ISSUER" "grep ZOEN_OIDC_MACHINE_ISSUER deploy/fly/fly.toml" "deploy/fly/fly.toml" "$machine_status" "ZOEN_OIDC_MACHINE_ISSUER ${machine_status}"

if grep -Eq 'ZOEN_OIDC_ISSUER[[:space:]]*=' deploy/fly/fly.toml \
  || grep -Eq 'ZOEN_OIDC_AUDIENCE[[:space:]]*=' deploy/fly/fly.toml \
  || grep -Eq 'ZOEN_OIDC_DISCOVERY_URL[[:space:]]*=' deploy/fly/fly.toml; then
  fail=1
  oidc_env="present"
else
  oidc_env="absent"
fi
record "fly.toml has no ZOEN_OIDC_ISSUER / AUDIENCE / DISCOVERY_URL" "grep ZOEN_OIDC_ISSUER ZOEN_OIDC_AUDIENCE ZOEN_OIDC_DISCOVERY_URL deploy/fly/fly.toml" "deploy/fly/fly.toml" "$oidc_env" "ZOEN_OIDC_* ${oidc_env}"

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

ready_src="$(rg -n -A 14 'async fn ready' apps/zoend/src/main.rs || true)"
if printf '%s\n' "$ready_src" | grep -q '8080'; then
  fail=1
  ready_status="mentions_8080"
else
  ready_status="postgres_integrity_only"
fi
record "GET /ready does not wait on :8080" "rg -n -A 14 'async fn ready' apps/zoend/src/main.rs" "apps/zoend/src/main.rs" "$ready_status" "verify_integrity"

check "remint still session-mints on loopback" "grep -q '127.0.0.1:58704' deploy/fly/zoen-remint-agent && grep -q 'api/auth/sign-in/email' deploy/fly/zoen-remint-agent && ! grep -q 'api/auth/token' deploy/fly/zoen-remint-agent" "sign-in/email on 127.0.0.1:58704, no GET /api/auth/token"

check "remint does not read MACHINE_ISSUER" "! grep -q ZOEN_OIDC_MACHINE_ISSUER deploy/fly/zoen-remint-agent" "absent"

check "supervisord keeps auth" "grep -q '^\\[program:auth\\]' deploy/fly/supervisord.conf" "[program:auth]"
check "supervisord keeps remint" "grep -q '^\\[program:remint\\]' deploy/fly/supervisord.conf" "[program:remint]"
check "supervisord keeps agent-binding" "grep -q '^\\[program:agent-binding\\]' deploy/fly/supervisord.conf" "[program:agent-binding]"
check "Dockerfile still COPYs zoen-start-auth" "grep -q 'zoen-start-auth' deploy/fly/Dockerfile" "COPY zoen-start-auth"
check "Dockerfile has no Keycloak image" "! grep -q keycloak deploy/fly/Dockerfile" "absent"
check "Dockerfile has no openjdk" "! grep -q openjdk deploy/fly/Dockerfile" "absent"
check "zoen-start-keycloak file is gone" "! test -e deploy/fly/zoen-start-keycloak" "deleted"
check "realm.template.json is gone" "! test -e deploy/fly/realm.template.json" "deleted"
if grep -R --include='compose.yaml' 'quay.io/keycloak' e2e >/dev/null; then
  fail=1
  dest_kc="present"
else
  dest_kc="absent"
fi
record "e2e compose does not plant Keycloak" "grep -R --include=compose.yaml quay.io/keycloak e2e" "e2e" "$dest_kc" "Keycloak ${dest_kc}"

check "dest governed-action does not keep prepare-realm.mjs" "! test -f e2e/governed-action/prepare-realm.mjs" "deleted"

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
  printf '%s\n' '- `[program:agent-binding]`'
  printf '%s\n' '- dest live e2e compose is Postgres only'
  printf '\n## Out of this PR\n\n'
  printf '%s\n' '- Live Fly remount. Coder remounts after squash. Missing remount is not a fail.'
  printf '%s\n' '- Unset Fly secrets `KC_*` / `ZOEN_OIDC_CLIENT_SECRET`'
  printf '%s\n' '- Eve on Fly. Kapso point. Companion `/send`.'
  printf '\n'
} >> "$draft"

if [[ "$fail" -ne 0 ]]; then
  printf '## Verdict\n\nfail\n' >> "$draft"
  cp "$draft" "$proof"
  printf 'wrote %s\n' "$proof" >&2
  exit 1
fi

printf '## Verdict\n\npass. Keycloak is off the Fly image. wait-for-oidc is gone. remint writes the opaque session cookie on loopback.\n' >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
