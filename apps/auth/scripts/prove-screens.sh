#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

base="http://127.0.0.1:58704"
ok_url="${base}/api/auth/ok"
proof="/workspace/ship/better-auth-screens-proof.md"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
draft="${work}/proof.md"

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

# npx tsx leaves a grandchild node on :58704 if only the pid-file process is killed.
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

for _ in $(seq 1 50); do
  if ! curl -sf --connect-timeout 1 "$ok_url" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

npx tsx src/server.ts >.auth.log 2>&1 &
printf '%s\n' "$!" > .auth.pid

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
  exit 1
fi

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

html_excerpt() {
  python3 -c '
import re, sys
html = sys.stdin.read()
match = re.search(r"<p>(.*?)</p>", html, re.I | re.S)
text = re.sub(r"<[^>]+>", "", match.group(1) if match else html)
print(" ".join(text.split())[:120])
'
}

device_fields() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    body = json.loads(raw)
except json.JSONDecodeError:
    raise SystemExit("device/code body is not JSON")
if not isinstance(body, dict):
    raise SystemExit("device/code body is not an object")
keys = list(body.keys())
if "device_code" not in keys or "user_code" not in keys:
    raise SystemExit("device/code missing device_code or user_code")
print(",".join(keys))
'
}

assert_device_html() {
  local file="$1"
  grep -qiE '<!doctype html|<html' "$file" || fail "GET /device is not HTML"
  grep -q 'name="user_code"' "$file" || fail "GET /device has no user_code field"
  grep -q 'id="device-approve"' "$file" || fail "GET /device has no explicit approve action"
  grep -q 'id="device-deny"' "$file" || fail "GET /device has no explicit deny action"
  if grep -Eq 'name="user_code"[^>]*value="[^"]+' "$file" || grep -Eq 'value="[^"]+"[^>]*name="user_code"' "$file"; then
    fail "GET /device invented a code"
  fi
  if grep -q 'id="device-google"' "$file"; then
    fail "GET /device rendered Google while provider is unset"
  fi
}

{
  printf '# Auth screens proof\n\n'
  printf 'Source: `apps/auth/scripts/prove-screens.sh`\n'
  printf 'Host: `%s`\n\n' "$base"
} > "$draft"

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

post_json() {
  local url="$1"
  local json="$2"
  local body="$3"
  curl -sS -o "$body" -w '%{http_code}' \
    -H 'content-type: application/json' \
    -d "$json" \
    "$url"
}

url="${base}/onboard/probe-token"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/onboard-probe"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(html_excerpt < "$body")"
record "GET /onboard/probe-token" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "404" ]] || fail "retired GET /onboard/probe-token status ${status}"

url="${base}/onboard/done"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/onboard-done"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(html_excerpt < "$body")"
record "GET /onboard/done" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "404" ]] || fail "retired GET /onboard/done status ${status}"

url="${base}/"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/home"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(html_excerpt < "$body")"
record "GET /" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "GET / status ${status}"
grep -qiE '<!doctype html|<html' "$body" || fail "GET / is not HTML"
grep -q "Zoen" "$body" || fail "GET / missing Zoen"
grep -q 'signInEmail\|/api/auth/sign-in' "$body" || fail "GET / missing sign-in"

url="${base}/login"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/login"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(html_excerpt < "$body")"
record "GET /login" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "GET /login status ${status}"
grep -qiE '<!doctype html|<html' "$body" || fail "GET /login is not HTML"

url="${base}/device"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/device"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(html_excerpt < "$body")"
record "GET /device" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "GET /device status ${status}"
assert_device_html "$body"

url="$ok_url"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/ok"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(tr -d '\n' < "$body")"
record "GET /api/auth/ok" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "GET /api/auth/ok status ${status}"
[[ "$excerpt" == '{"ok":true}' ]] || fail "GET /api/auth/ok body is not {\"ok\":true}"

google_msg="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set"

url="${base}/api/auth/sign-in/social"
command="curl -sS -o body -w %{http_code} -H content-type:application/json -d {\"provider\":\"google\"} ${url}"
body="${work}/social"
status="$(post_json "$url" '{"provider":"google"}' "$body")"
ts="$(stamp)"
excerpt="$(tr -d '\n' < "$body")"
record "POST /api/auth/sign-in/social" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "503" ]] || fail "POST /api/auth/sign-in/social status ${status}"
[[ "$excerpt" == "$google_msg" ]] || fail "POST /api/auth/sign-in/social missing Google unset sentence"

url="${base}/api/auth/callback/google"
command="curl -sS -o body -w %{http_code} ${url}"
body="${work}/callback"
status="$(get_url "$url" "$body")"
ts="$(stamp)"
excerpt="$(tr -d '\n' < "$body")"
record "GET /api/auth/callback/google" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "503" ]] || fail "GET /api/auth/callback/google status ${status}"
[[ "$excerpt" == "$google_msg" ]] || fail "GET /api/auth/callback/google missing Google unset sentence"

url="${base}/api/auth/device/code"
command="curl -sS -o body -w %{http_code} -H content-type:application/json -d {\"client_id\":\"zoen\"} ${url}"
body="${work}/device-code"
status="$(post_json "$url" '{"client_id":"zoen"}' "$body")"
ts="$(stamp)"
keys="$(device_fields < "$body")" || fail "POST /api/auth/device/code ${keys:-bad body}"
: > "$body"
excerpt="fields: ${keys}"
record "POST /api/auth/device/code" "$command" "$url" "$status" "$excerpt" "$ts"
[[ "$status" == "200" ]] || fail "POST /api/auth/device/code status ${status}"

mkdir -p "$(dirname "$proof")"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
