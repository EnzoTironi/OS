#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$repo"

proof="/workspace/ship/eve-on-fly-proof.md"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
draft="${work}/proof.md"
fail=0

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
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

live_get() {
  local heading="$1" url="$2"
  local body status exitc excerpt
  body="${work}/live.body"
  set +e
  status="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 5 --max-time 20 "$url")"
  exitc="$?"
  set -e
  excerpt="$(tr '\n' ' ' < "$body" | head -c 80)"
  record "$heading" "curl -sS -o body -w %{http_code} $url" "$url" "${status:-000}" "exit=${exitc} excerpt=${excerpt:-empty}"
  printf '%s' "${status:-000}"
}

mkdir -p "$(dirname "$proof")"

{
  printf '# Eve on the Fly image\n\n'
  printf 'Source: `apps/conversation/scripts/prove-eve-on-fly.sh`\n'
  printf 'Worktree: `%s`\n' "$repo"
  printf 'Tree checks fail the run. Live remount missing is recorded, not a fail.\n\n'
} > "$draft"

check "supervisord has [program:eve]" "grep -q '^\\[program:eve\\]' deploy/fly/supervisord.conf" "[program:eve]"
check "supervisord has no [program:keycloak]" "! grep -q '^\\[program:keycloak\\]' deploy/fly/supervisord.conf" "absent"
check "supervisord keeps auth" "grep -q '^\\[program:auth\\]' deploy/fly/supervisord.conf" "[program:auth]"
check "supervisord keeps remint" "grep -q '^\\[program:remint\\]' deploy/fly/supervisord.conf" "[program:remint]"
check "Eve root instructions exist" "test -s apps/conversation/agent/instructions.md" "apps/conversation/agent/instructions.md"
check "dockerignore excludes nested node_modules" "grep -q '^\\*\\*/node_modules$' .dockerignore" "**/node_modules"
check "dockerignore excludes Eve output" "grep -q '^\\*\\*/\\.eve$' .dockerignore && grep -q '^\\*\\*/\\.output$' .dockerignore" "**/.eve **/.output"
check "Dockerfile conversation stage is node:24" "grep -q 'FROM node:24.20.0-bookworm-slim AS conversation' deploy/fly/Dockerfile && ! grep 'AS conversation' deploy/fly/Dockerfile | grep -q 'node:22'" "node:24.20.0-bookworm-slim AS conversation"
check "Dockerfile still copies auth Node 22 from personal-lake" "grep -q 'COPY --from=personal-lake /usr/local/bin/node /usr/local/bin/node' deploy/fly/Dockerfile" "COPY --from=personal-lake /usr/local/bin/node"
check "Dockerfile COPY zoen-start-eve" "grep -q 'COPY deploy/fly/zoen-start-eve /usr/local/bin/zoen-start-eve' deploy/fly/Dockerfile" "COPY zoen-start-eve"
check "eve_proxy.rs loopback :3000" "grep -q '127.0.0.1:3000' apps/zoend/src/eve_proxy.rs" "http://127.0.0.1:3000"
check "eve_proxy.rs /eve/v1" "grep -q '/eve/v1' apps/zoend/src/eve_proxy.rs" "/eve/v1"
check "main.rs mods eve_proxy" "grep -q '^mod eve_proxy;' apps/zoend/src/main.rs" "mod eve_proxy;"
check "main.rs merges eve_proxy" "grep -q 'eve_proxy::router()' apps/zoend/src/main.rs" "eve_proxy::router()"
check "fly.toml internal_port 58701" "grep -q 'internal_port = 58701' deploy/fly/fly.toml" "58701"
check "fly.toml canonical internal Ontology URL" "grep -q 'ZOEN_ZOEND = \"http://127.0.0.1:58701\"' deploy/fly/fly.toml" "ZOEN_ZOEND=http://127.0.0.1:58701"
check "fly.toml ZOEN_AUTH_BASE_URL loopback 58704" "grep -q 'ZOEN_AUTH_BASE_URL = \"http://127.0.0.1:58704\"' deploy/fly/fly.toml" "http://127.0.0.1:58704"
check "zoen-start-eve requires canonical internal Ontology URL" "grep -q 'require_nonblank ZOEN_ZOEND' deploy/fly/zoen-start-eve" "ZOEN_ZOEND required"
legacy_zoend_alias='ZOEN_ZOEND_BASE''_URL'
check "Eve has no legacy zoend URL alias" \
  "! grep -R \"${legacy_zoend_alias}\" apps/conversation deploy/fly --exclude='package-lock.json' --exclude-dir='node_modules' --exclude-dir='.output' --exclude-dir='.eve'" \
  "alias absent"
check "fly.toml has no ZOEN_OIDC_ISSUER" "! grep -q 'ZOEN_OIDC_ISSUER' deploy/fly/fly.toml" "absent"
check "fly.toml has no ZOEN_OIDC_AUDIENCE" "! grep -q 'ZOEN_OIDC_AUDIENCE' deploy/fly/fly.toml" "absent"
check "fly.toml has no ZOEN_OIDC_DISCOVERY_URL" "! grep -q 'ZOEN_OIDC_DISCOVERY_URL' deploy/fly/fly.toml" "absent"
check "fly-deploy.yml watches apps/conversation" "grep -q 'apps/conversation/\\*\\*' .github/workflows/fly-deploy.yml" "apps/conversation/**"
check "Dockerfile has no keycloak" "! grep -qi keycloak deploy/fly/Dockerfile" "absent"
check "sandbox.ts does not write JWT/token" "! grep -Ei 'jwt|agent\\.token|bearer' apps/conversation/agent/sandbox/sandbox.ts && grep -q 'path: \"membership\"' apps/conversation/agent/sandbox/sandbox.ts" "membership only"

secret_cmd='! grep -E "BETTER_AUTH_SECRET[[:space:]]*=" deploy/fly/fly.toml deploy/fly/Dockerfile deploy/fly/zoen-start-eve && ! grep -E "OPENAI_API_KEY[[:space:]]*=" deploy/fly/fly.toml deploy/fly/Dockerfile deploy/fly/zoen-start-eve && ! grep -E "KAPSO_[A-Z0-9_]*[[:space:]]*=" deploy/fly/fly.toml deploy/fly/Dockerfile deploy/fly/zoen-start-eve'
if eval "$secret_cmd" >/dev/null 2>&1; then
  secret_status="pass"
  secret_excerpt="absent"
else
  secret_status="fail"
  secret_excerpt="present"
  fail=1
fi
record "no BETTER_AUTH_SECRET / OPENAI_API_KEY / KAPSO_ assignment in fly.toml Dockerfile zoen-start-eve" "$secret_cmd" "deploy/fly" "$secret_status" "$secret_excerpt"

ready_code="$(live_get "live GET https://zoen.tironi.xyz/ready" "https://zoen.tironi.xyz/ready")"
auth_ok_code="$(live_get "live GET https://zoen.tironi.xyz/api/auth/ok" "https://zoen.tironi.xyz/api/auth/ok")"
health_code="$(live_get "live GET https://zoen.tironi.xyz/eve/v1/health" "https://zoen.tironi.xyz/eve/v1/health")"

kapso_body="${work}/kapso.body"
set +e
kapso_code="$(curl -sS -o "$kapso_body" -w '%{http_code}' --connect-timeout 5 --max-time 20 \
  -X POST https://zoen.tironi.xyz/eve/v1/kapso \
  -H 'content-type: application/json' \
  --data-binary '{}')"
kapso_exit="$?"
set -e
kapso_excerpt="$(tr '\n' ' ' < "$kapso_body" | head -c 80)"
if [[ "$ready_code" != "200" ]]; then
  fail=1
fi
if [[ "$auth_ok_code" != "200" ]]; then
  fail=1
fi
if [[ "$health_code" == "200" ]]; then
  health_note="eve_up"
else
  health_note="remount_pending"
fi
if [[ "$kapso_code" == "401" ]]; then
  kapso_note="eve_up_unsigned"
elif [[ "$health_code" == "200" ]]; then
  kapso_note="eve_up_expected_401"
  fail=1
else
  kapso_note="remount_pending"
fi
record "live POST https://zoen.tironi.xyz/eve/v1/kapso unsigned" "curl -sS -o body -w %{http_code} -X POST -H content-type:application/json --data-binary {} https://zoen.tironi.xyz/eve/v1/kapso" "https://zoen.tironi.xyz/eve/v1/kapso" "${kapso_code:-000}" "exit=${kapso_exit} excerpt=${kapso_excerpt:-empty} note=${kapso_note}"

{
  printf '## Live summary\n\n'
  printf 'ready: %s\n' "${ready_code:-000}"
  printf 'api/auth/ok: %s\n' "${auth_ok_code:-000}"
  printf 'eve/v1/health: %s (%s)\n' "${health_code:-000}" "$health_note"
  printf 'eve/v1/kapso unsigned POST: %s (%s)\n' "${kapso_code:-000}" "$kapso_note"
  printf 'Live remount missing is not a fail.\n\n'
  printf '## Kept\n\n'
  printf '%s\n' '- Public HTTPS on zoend `:58701`'
  printf '%s\n' '- Better Auth `[program:auth]` and remint'
  printf '%s\n' '- Auth Node 22 at `/usr/local/bin/node`'
  printf '%s\n' '- `ZOEN_AUTH_BASE_URL=http://127.0.0.1:58704`'
  printf '%s\n' '- door_proxy forwards `/api/auth` and `/device`; zoend owns `/link`'
  printf '\n## Out of this PR\n\n'
  printf '%s\n' '- Live Fly remount. Missing remount is not a fail.'
  printf '%s\n' '- Pointing Kapso webhooks'
  printf '%s\n' '- Streaming `/eve/v1/session/*/stream` through the buffered proxy'
  printf '\n'
} >> "$draft"

if [[ "$fail" -ne 0 ]]; then
  printf '## Verdict\n\nfail\n' >> "$draft"
  cp "$draft" "$proof"
  printf 'wrote %s\n' "$proof" >&2
  exit 1
fi

printf '## Verdict\n\npass. Tree plants Eve beside zoend on loopback :3000. Live remount is recorded, not required.\n' >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
