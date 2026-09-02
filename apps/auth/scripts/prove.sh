#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
work="$(mktemp -d)"
auth_pid=""

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
  if [[ -n "$auth_pid" ]] && kill -0 "$auth_pid" 2>/dev/null; then
    kill_tree "$auth_pid"
  fi
  rm -rf "$work"
}
trap cleanup EXIT

if [[ ! -d node_modules ]]; then
  npm ci
fi

if [[ ! -f .env ]]; then
  umask 077
  {
    printf 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55404/zoen_auth\n'
    printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)"
    printf 'BETTER_AUTH_URL=http://127.0.0.1:58704\n'
  } > .env
fi

docker compose up -d --wait

set -a
# shellcheck disable=SC1091
. ./.env
set +a

npx --yes auth@1.7.2 migrate --config src/auth.ts --yes

url="http://127.0.0.1:58704/api/auth/ok"
command="curl -sS -o body -w %{http_code} ${url}"

if curl -sf --connect-timeout 1 "$url" >/dev/null 2>&1; then
  printf 'auth door port 58704 is already owned; refusing to adopt or kill it\n' >&2
  exit 1
fi
npx tsx src/server.ts >"${work}/auth.log" 2>&1 &
auth_pid="$!"
ready=0
for _ in $(seq 1 40); do
  if curl -sf "$url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if [[ "$ready" -ne 1 ]]; then
  cat "${work}/auth.log" >&2
  exit 1
fi

body_file="$(mktemp)"
status="$(curl -sS -o "$body_file" -w '%{http_code}' "$url")"
body="$(cat "$body_file")"
rm -f "$body_file"
timestamp="$(TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z')"

printf 'command: %s\n' "$command"
printf 'url: %s\n' "$url"
printf 'status: %s\n' "$status"
printf 'body: %s\n' "$body"
printf 'timestamp: %s\n' "$timestamp"

if [[ "$status" != "200" ]]; then
  exit 1
fi
