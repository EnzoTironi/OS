#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$repo"

proof="/workspace/ship/eve-just-bash-proof.md"
work="$(mktemp -d)"
eve_pid=""
cleanup() {
  if [[ -n "${eve_pid:-}" ]] && kill -0 "$eve_pid" 2>/dev/null; then
    kill "$eve_pid" 2>/dev/null || true
    wait "$eve_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT
draft="${work}/proof.md"
fail=0
start_log="${work}/eve-start.log"
build_log="${work}/eve-build.log"
ci_log="${work}/npm-ci-omit-dev.log"
health_body="${work}/health.body"

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

snippet() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    printf 'empty'
    return 0
  fi
  set +o pipefail
  tr '\n' ' ' < "$file" | head -c 240
  set -o pipefail
  printf '\n'
}

mkdir -p "$(dirname "$proof")"

{
  printf '# Eve start without just-bash in production\n\n'
  printf 'Source: `apps/conversation/scripts/prove-eve-just-bash.sh`\n'
  printf 'Worktree: `%s`\n' "$repo"
  printf 'Node: `%s`\n' "$(node -v 2>/dev/null || printf missing)"
  printf 'Production `npm ci --omit=dev` must not install `just-bash`. `eve start` must listen on the authored `zoen-membership-workbench` backend without `Cannot find package '"'"'just-bash'"'"'`.\n\n'
} > "$draft"

node_ver="$(node -v 2>/dev/null || printf missing)"
major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf 0)"
if [[ "$major" -ge 24 ]]; then
  record "Node >= 24" "node -v" "n/a" "pass" "$node_ver"
else
  record "Node >= 24" "node -v" "n/a" "fail" "$node_ver"
  fail=1
fi

check "package.json dependencies does not list just-bash" "node -e 'const p=require(\"./apps/conversation/package.json\"); process.exit(p.dependencies&&p.dependencies[\"just-bash\"]?1:0)'" "absent"
check "package.json devDependencies does not list just-bash" "node -e 'const p=require(\"./apps/conversation/package.json\"); process.exit(p.devDependencies&&p.devDependencies[\"just-bash\"]?1:0)'" "absent"
check "package-lock has no node_modules/just-bash" "node -e 'const p=require(\"./apps/conversation/package-lock.json\"); process.exit(p.packages&&p.packages[\"node_modules/just-bash\"]?1:0)'" "packages[node_modules/just-bash] absent"
check "sandbox.ts uses workbenchBackend" "grep -q 'workbenchBackend' apps/conversation/agent/sandbox/sandbox.ts" "workbenchBackend"
check "agent sources do not import just-bash" "! grep -R --include='*.ts' -F 'just-bash' apps/conversation/agent" "absent"

ci_dir="${work}/prod-ci"
mkdir -p "$ci_dir"
cp apps/conversation/package.json apps/conversation/package-lock.json "$ci_dir/"
set +e
(cd "$ci_dir" && npm ci --omit=dev) >"$ci_log" 2>&1
ci_exit="$?"
set -e
if [[ "$ci_exit" -eq 0 && ! -d "$ci_dir/node_modules/just-bash" && -d "$ci_dir/node_modules/eve" ]]; then
  record "production npm ci --omit=dev omits just-bash" "npm ci --omit=dev" "$ci_dir" "pass" "node_modules/just-bash absent, eve present"
else
  if [[ "$ci_exit" -ne 0 ]]; then
    ci_excerpt="exit ${ci_exit} $(snippet "$ci_log")"
  elif [[ -d "$ci_dir/node_modules/just-bash" ]]; then
    ci_excerpt="node_modules/just-bash present"
  else
    ci_excerpt="node_modules/eve missing"
  fi
  record "production npm ci --omit=dev omits just-bash" "npm ci --omit=dev" "$ci_dir" "fail" "$ci_excerpt"
  fail=1
fi

cd "$root"
unset KAPSO_API_KEY KAPSO_PHONE_NUMBER_ID KAPSO_WEBHOOK_SECRET KAPSO_BASE_URL KAPSO_BOT_USERNAME WHATSAPP_ACCESS_TOKEN EVE_DEV
export ZOEN_MODEL=openai-compatible/hy3-free

if [[ -n "${KAPSO_API_KEY:-}" || -n "${WHATSAPP_ACCESS_TOKEN:-}" || -n "${EVE_DEV:-}" ]]; then
  record "KAPSO_* WHATSAPP_ACCESS_TOKEN EVE_DEV unset" "unset KAPSO_* WHATSAPP_ACCESS_TOKEN EVE_DEV" "n/a" "fail" "still set"
  fail=1
else
  record "KAPSO_* WHATSAPP_ACCESS_TOKEN EVE_DEV unset" "unset KAPSO_* WHATSAPP_ACCESS_TOKEN EVE_DEV" "n/a" "pass" "empty"
fi

if [[ -d "$root/node_modules/just-bash" ]]; then
  record "conversation node_modules has no just-bash" "test ! -d apps/conversation/node_modules/just-bash" "apps/conversation/node_modules" "fail" "present"
  fail=1
else
  record "conversation node_modules has no just-bash" "test ! -d apps/conversation/node_modules/just-bash" "apps/conversation/node_modules" "pass" "absent"
fi

set +e
(cd "$root" && node --input-type=module -e 'try { await import("just-bash"); process.exit(2) } catch (error) { process.exit(error && error.code === "ERR_MODULE_NOT_FOUND" ? 0 : 1) }')
resolve_exit="$?"
set -e
if [[ "$resolve_exit" -eq 0 ]]; then
  record "just-bash is not resolvable from conversation" "node -e import('just-bash')" "apps/conversation" "pass" "ERR_MODULE_NOT_FOUND"
else
  record "just-bash is not resolvable from conversation" "node -e import('just-bash')" "apps/conversation" "fail" "exit ${resolve_exit}"
  fail=1
fi

if [[ ! -d "$root/.output" ]]; then
  set +e
  node ./node_modules/eve/bin/eve.js build >"$build_log" 2>&1
  build_exit="$?"
  set -e
  if [[ "$build_exit" -eq 0 && -d "$root/.output" ]]; then
    record "eve build before start" "node ./node_modules/eve/bin/eve.js build" "apps/conversation" "pass" "exit 0"
  else
    record "eve build before start" "node ./node_modules/eve/bin/eve.js build" "apps/conversation" "fail" "exit ${build_exit}"
    fail=1
  fi
else
  record "eve build before start" "test -d apps/conversation/.output" "apps/conversation/.output" "pass" "present"
fi

port="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port)); s.close()})')"
start_cmd="node ./node_modules/eve/bin/eve.js start --host 127.0.0.1 --port ${port}"
health_url="http://127.0.0.1:${port}/eve/v1/health"
start_status="fail"
start_excerpt="did not run"
health_code="000"

if [[ "$major" -lt 24 ]]; then
  start_excerpt="skipped, node ${node_ver}"
  record "eve start root sandbox" "$start_cmd" "apps/conversation" "fail" "$start_excerpt"
  record "GET /eve/v1/health" "curl -sS -o body -w %{http_code} $health_url" "$health_url" "$health_code" "skipped"
else
  set +e
  ZOEN_ZOEND=http://127.0.0.1:58701 \
    node ./node_modules/eve/bin/eve.js start --host 127.0.0.1 --port "$port" >"$start_log" 2>&1 &
  eve_pid="$!"
  set -e
  deadline=$((SECONDS + 120))
  while [[ "$SECONDS" -lt "$deadline" ]]; do
    if grep -q "Cannot find package 'just-bash'" "$start_log" 2>/dev/null \
      || grep -q "failed to initialize sandbox template" "$start_log" 2>/dev/null \
      || grep -q 'on backend "just-bash"' "$start_log" 2>/dev/null \
      || grep -qE 'eve: initialized [0-9]+ sandbox' "$start_log" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$eve_pid" 2>/dev/null; then
      wait "$eve_pid" 2>/dev/null || true
      break
    fi
    sleep 0.2
  done

  set +o pipefail
  start_excerpt="$(grep -E "sandbox|just-bash|Cannot find package|server listening|Listening on" "$start_log" | tr '\n' ' ' | head -c 280)"
  set -o pipefail
  if [[ -z "$start_excerpt" ]]; then
    start_excerpt="$(snippet "$start_log")"
  fi

  if grep -q "Cannot find package 'just-bash'" "$start_log" \
    || grep -q "failed to initialize sandbox template" "$start_log" \
    || grep -q 'on backend "just-bash"' "$start_log"; then
    start_status="fail"
    fail=1
  elif grep -qE 'eve: initialized [0-9]+ sandbox' "$start_log"; then
    start_status="pass"
  else
    start_status="fail"
    fail=1
  fi
  record "eve start root sandbox" "$start_cmd" "apps/conversation" "$start_status" "$start_excerpt"

  if kill -0 "$eve_pid" 2>/dev/null; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      set +e
      health_code="$(curl -sS -o "$health_body" -w '%{http_code}' --connect-timeout 2 --max-time 5 "$health_url")"
      set -e
      health_code="${health_code:-000}"
      if [[ "$health_code" == "200" ]]; then
        break
      fi
      sleep 0.5
    done
  else
    health_code="000"
  fi
  health_excerpt="http ${health_code}"
  if [[ -s "$health_body" ]]; then
    health_excerpt="${health_excerpt} $(snippet "$health_body")"
  fi
  if [[ "$start_status" == "pass" && "$health_code" != "200" ]]; then
    fail=1
  fi
  record "GET /eve/v1/health" "curl -sS -o body -w %{http_code} $health_url" "$health_url" "$health_code" "$health_excerpt"

  if [[ -n "${eve_pid:-}" ]] && kill -0 "$eve_pid" 2>/dev/null; then
    kill "$eve_pid" 2>/dev/null || true
    wait "$eve_pid" 2>/dev/null || true
  fi
  eve_pid=""
fi

cd "$repo"

{
  printf '## Kept\n\n'
  printf '%s\n' '- Authored sandbox backend `zoen-membership-workbench` (`@rivet-dev/agentos-core`)'
  printf '%s\n' '- Eve 0.47.3 optional peer `just-bash` in Eve metadata (not installed)'
  printf '\n## Out of this PR\n\n'
  printf '%s\n' '- Vendoring Eve'
  printf '%s\n' '- `apps/conversation/scripts/prove-eve-on-fly.sh`'
  printf '%s\n' '- Switching the sandbox backend away from agentos-core'
  printf '\n'
} >> "$draft"

if [[ "$fail" -ne 0 ]]; then
  printf '## Verdict\n\nfail\n' >> "$draft"
  cp "$draft" "$proof"
  printf 'wrote %s\n' "$proof" >&2
  exit 1
fi

printf '## Verdict\n\npass. Production `npm ci --omit=dev` omits `just-bash`. `eve start` initializes the root sandbox without loading `just-bash`. `GET /eve/v1/health` is 200.\n' >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
