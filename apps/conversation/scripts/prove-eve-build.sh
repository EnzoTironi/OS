#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$repo"

proof="/workspace/ship/eve-build-proof.md"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
draft="${work}/proof.md"
fail=0
build_log="${work}/eve-build.log"

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

mkdir -p "$(dirname "$proof")"

{
  printf '# Eve build without a Kapso secret\n\n'
  printf 'Source: `apps/conversation/scripts/prove-eve-build.sh`\n'
  printf 'Worktree: `%s`\n' "$repo"
  printf 'Node: `%s`\n' "$(node -v 2>/dev/null || printf missing)"
  printf 'Tree checks fail the run. `eve build` must exit 0 with KAPSO_* empty.\n\n'
} > "$draft"

check "kapso.ts uses createKapsoAdapter" "grep -q 'createKapsoAdapter' apps/conversation/agent/channels/kapso.ts" "createKapsoAdapter"
check "kapso.ts uses chatSdkChannel" "grep -q 'chatSdkChannel' apps/conversation/agent/channels/kapso.ts" "chatSdkChannel"
check "kapso.ts does not import defineChannel" "! grep -q 'defineChannel' apps/conversation/agent/channels/kapso.ts" "absent"
check "Dockerfile conversation stage still runs eve build" "grep -q 'RUN node ./node_modules/eve/bin/eve.js build' deploy/fly/Dockerfile" "eve.js build"
check "Dockerfile has no KAPSO assignment" "! grep -E 'KAPSO_[A-Z0-9_]*[[:space:]]*=' deploy/fly/Dockerfile" "absent"
check "fly.toml has no KAPSO assignment" "! grep -E 'KAPSO_[A-Z0-9_]*[[:space:]]*=' deploy/fly/fly.toml" "absent"
check "zoen-start-eve has no KAPSO assignment" "! grep -E 'KAPSO_[A-Z0-9_]*[[:space:]]*=' deploy/fly/zoen-start-eve" "absent"
check "Dockerfile does not set WHATSAPP_ACCESS_TOKEN" "! grep -q 'WHATSAPP_ACCESS_TOKEN' deploy/fly/Dockerfile" "absent"

cd "$root"
unset KAPSO_API_KEY KAPSO_PHONE_NUMBER_ID KAPSO_WEBHOOK_SECRET KAPSO_BASE_URL KAPSO_BOT_USERNAME WHATSAPP_ACCESS_TOKEN
export ZOEN_MODEL=openai-compatible/hy3-free

if [[ -n "${KAPSO_API_KEY:-}" || -n "${WHATSAPP_ACCESS_TOKEN:-}" ]]; then
  record "KAPSO_API_KEY unset before eve build" "unset KAPSO_API_KEY WHATSAPP_ACCESS_TOKEN" "n/a" "fail" "still set"
  fail=1
else
  record "KAPSO_API_KEY unset before eve build" "unset KAPSO_API_KEY KAPSO_PHONE_NUMBER_ID KAPSO_WEBHOOK_SECRET KAPSO_BASE_URL WHATSAPP_ACCESS_TOKEN" "n/a" "pass" "empty"
fi

set +e
node ./node_modules/eve/bin/eve.js build >"$build_log" 2>&1
build_exit="$?"
set -e

if [[ "$build_exit" -eq 0 ]]; then
  build_excerpt="exit 0"
  build_status="pass"
else
  build_excerpt="exit ${build_exit}"
  build_status="fail"
  fail=1
fi
if grep -q 'Failed to evaluate authored module' "$build_log"; then
  build_excerpt="${build_excerpt}; evaluate authored module failed"
  build_status="fail"
  fail=1
fi
record "eve build with KAPSO_API_KEY unset" "unset KAPSO_*; ZOEN_MODEL=openai-compatible/hy3-free; node ./node_modules/eve/bin/eve.js build" "apps/conversation" "$build_status" "$build_excerpt"

output="$root/.output"
if [[ ! -d "$output" ]]; then
  record "built output exists" "test -d apps/conversation/.output" "apps/conversation/.output" "fail" "missing"
  fail=1
else
  record "built output exists" "test -d apps/conversation/.output" "apps/conversation/.output" "pass" "present"

  if grep -R -q --binary-files=without-match 'createKapsoAdapter' "$output"; then
    record "output still calls createKapsoAdapter" "grep -R createKapsoAdapter apps/conversation/.output" "apps/conversation/.output" "pass" "present"
  else
    record "output still calls createKapsoAdapter" "grep -R createKapsoAdapter apps/conversation/.output" "apps/conversation/.output" "fail" "absent"
    fail=1
  fi

  if grep -R -q --binary-files=without-match 'process.env.KAPSO_API_KEY' "$output"; then
    record "output reads process.env.KAPSO_API_KEY at runtime" "grep -R process.env.KAPSO_API_KEY apps/conversation/.output" "apps/conversation/.output" "pass" "present"
  else
    record "output reads process.env.KAPSO_API_KEY at runtime" "grep -R process.env.KAPSO_API_KEY apps/conversation/.output" "apps/conversation/.output" "fail" "absent"
    fail=1
  fi

  if grep -R -E --binary-files=without-match 'kapsoApiKey[[:space:]]*:[[:space:]]*["'\'']' "$output"; then
    record "output has no kapsoApiKey string literal" "grep -R kapsoApiKey quoted literal apps/conversation/.output" "apps/conversation/.output" "fail" "literal present"
    fail=1
  else
    record "output has no kapsoApiKey string literal" "grep -R kapsoApiKey quoted literal apps/conversation/.output" "apps/conversation/.output" "pass" "absent"
  fi
fi

cd "$repo"

if docker info >/dev/null 2>&1; then
  set +e
  docker build --target conversation -f deploy/fly/Dockerfile "$repo" >"$work/docker-conversation.log" 2>&1
  docker_exit="$?"
  set -e
  if [[ "$docker_exit" -eq 0 ]]; then
    record "docker conversation stage eve build" "docker build --target conversation -f deploy/fly/Dockerfile ." "deploy/fly/Dockerfile" "pass" "exit 0"
  else
    record "docker conversation stage eve build" "docker build --target conversation -f deploy/fly/Dockerfile ." "deploy/fly/Dockerfile" "fail" "exit ${docker_exit}"
    fail=1
  fi
else
  record "docker conversation stage eve build" "docker build --target conversation -f deploy/fly/Dockerfile ." "deploy/fly/Dockerfile" "skipped" "daemon missing"
fi

{
  printf '## Kept\n\n'
  printf '%s\n' '- Official `chatSdkChannel` + `createKapsoAdapter`'
  printf '%s\n' '- WhatsApp path `POST /eve/v1/kapso`'
  printf '%s\n' '- No Kapso webhook pointed'
  printf '%s\n' '- Dockerfile conversation `RUN` still has no KAPSO env'
  printf '\n## Out of this PR\n\n'
  printf '%s\n' '- Pointing Kapso webhooks'
  printf '%s\n' '- Live Fly remount'
  printf '%s\n' '- Streaming eve_proxy'
  printf '\n'
} >> "$draft"

if [[ "$fail" -ne 0 ]]; then
  printf '## Verdict\n\nfail\n' >> "$draft"
  cp "$draft" "$proof"
  printf 'wrote %s\n' "$proof" >&2
  exit 1
fi

printf '## Verdict\n\npass. Host `eve build` exits 0 with KAPSO_* empty. The bundle still reads `process.env.KAPSO_API_KEY` at runtime. No Kapso secret is in the output tree.\n' >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
