#!/usr/bin/env bash
set -euo pipefail

# Live WhatsApp contact loop: companion (already paired on 8081) → zoend
# POST /channels/whatsapp/inbound → Chat SDK ingress → same-thread reply.
# Does not POST companion /send as the human. Does not merge.

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

pair_dir="${ZOEN_WA_PAIR_DIR:-/tmp/zoen-wa-pair}"
mkdir -p "$pair_dir"
pid_file="$pair_dir/contact-loop.pids"
log_dir="$pair_dir"
ingress_log="$log_dir/contact-serve.log"
zoend_log="$log_dir/zoend.log"
companion_log="$log_dir/companion.log"

e2e_env="e2e/channel-whatsapp-live/.env"
door_env="${ZOEN_WHATSAPP_DOOR_ENV:-$pair_dir/door.env}"

if [[ -f "$e2e_env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$e2e_env"
  set +a
fi
if [[ -f "$door_env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$door_env"
  set +a
fi

export ZOEN_E2E_ARTIFACTS_DIR="${ZOEN_E2E_ARTIFACTS_DIR:-artifacts/channel-whatsapp-live}"
export ZOEN_E2E_GENERATED_DIR="${ZOEN_E2E_GENERATED_DIR:-e2e/channel-whatsapp-live/.generated}"
export ZOEN_WHATSAPP_DOOR_E164="${ZOEN_WHATSAPP_DOOR_E164:-+553798136141}"
export ZOEN_WHATSAPP_COMPANION_URL="${ZOEN_WHATSAPP_COMPANION_URL:-http://127.0.0.1:8081}"
export ZOEN_WHATSAPP_LISTEN_ADDR="${ZOEN_WHATSAPP_LISTEN_ADDR:-127.0.0.1:8081}"
export ZOEN_WHATSAPP_DATABASE_URL="${ZOEN_WHATSAPP_DATABASE_URL:-postgres://zoen:zoen@127.0.0.1:55432/whatsapp?sslmode=disable}"
export ZOEN_MESSAGING_ADVERTISE_LIVE_WHATSAPP=1

zoend_port="${ZOEN_E2E_ZOEND_PORT:-58701}"
keycloak_port="${ZOEN_E2E_KEYCLOAK_PORT:-58700}"
postgres_port="${ZOEN_E2E_POSTGRES_PORT:-55520}"
ingress_port="${ZOEN_MESSAGING_INGRESS_PORT:-18082}"
zoend_url="http://127.0.0.1:${zoend_port}"
ingress_url="http://127.0.0.1:${ingress_port}"

usage() {
  echo "usage: $0 start|stop|status|advertise|bind" >&2
  exit 2
}

wait_listen() {
  local port="$1"
  local tries="${2:-90}"
  local i
  for i in $(seq 1 "$tries"); do
    if bash -c "echo >/dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "nothing listening on 127.0.0.1:${port}" >&2
  return 1
}

wait_http() {
  local url="$1"
  local tries="${2:-90}"
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "HTTP not ready: ${url}" >&2
  return 1
}

stop_pid() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 0
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -TERM "$pid" >/dev/null 2>&1 || true
    local i
    for i in 1 2 3 4 5 6 7 8 10; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        return 0
      fi
      sleep 0.3
    done
    kill -KILL "$pid" >/dev/null 2>&1 || true
  fi
}

cmd_stop() {
  if [[ -f "$pid_file" ]]; then
    # shellcheck disable=SC1090
    source "$pid_file"
    stop_pid "${CONTACT_SERVE_PID:-}"
    stop_pid "${ZOEND_PID:-}"
    rm -f "$pid_file"
  fi
  pkill -f 'dist/packages/messaging/src/whatsapp-contact-serve.js' >/dev/null 2>&1 || true
  pkill -f '/tmp/zoen-wa-pair/ingress.py' >/dev/null 2>&1 || true
}

cmd_status() {
  echo "companion /ready:"
  curl -sS -m 2 "${ZOEN_WHATSAPP_COMPANION_URL}/ready" || echo "down"
  echo
  echo "zoend /ready:"
  curl -sS -m 2 "${zoend_url}/ready" || echo "down"
  echo
  echo "advertise:"
  curl -sS -m 2 -D - -o /tmp/zoen-wa-advertise.body "${zoend_url}/channels/whatsapp/advertise" || true
  echo
  if [[ -f "$pair_dir/ingress.log" ]]; then
    echo "python sink last line (must stay stale):"
    tail -n 1 "$pair_dir/ingress.log" || true
  fi
}

cmd_advertise() {
  curl -sS -D - -o /tmp/zoen-wa-advertise.body "${zoend_url}/channels/whatsapp/advertise"
  echo
  cat /tmp/zoen-wa-advertise.body
  echo
}

cmd_bind() {
  "$root/scripts/whatsapp-contact-bind.sh"
}

cmd_start() {
  if [[ ! -x target/debug/zoend ]]; then
    echo "building zoend..." >&2
    cargo build --locked --package zoend
  fi
  npm exec -- tsc -p tsconfig.json --pretty false

  mkdir -p "$ZOEN_E2E_GENERATED_DIR"
  if [[ ! -f "$ZOEN_E2E_GENERATED_DIR/policies.json" ]]; then
    printf '%s\n' '{"policies":[]}' > "$ZOEN_E2E_GENERATED_DIR/policies.json"
  fi
  node e2e/channel-whatsapp-live/prepare-realm.mjs
  docker compose --project-name zoen-channel-whatsapp-live \
    --file e2e/channel-whatsapp-live/compose.yaml up --detach --wait

  wait_http "http://127.0.0.1:${keycloak_port}/realms/zoen/.well-known/openid-configuration" 180

  cmd_stop

  export ZOEN_IDENTITY_BASE_URL="$zoend_url"
  export ZOEN_MESSAGING_INGRESS_HOST=127.0.0.1
  export ZOEN_MESSAGING_INGRESS_PORT="$ingress_port"
  export ZOEN_WHATSAPP_REPLY_LEDGER="$pair_dir/reply-ledger.json"
  export ZOEN_MESSAGING_GATEWAY_URL="$ingress_url"
  export DATABASE_URL="postgres://zoen_app:zoen_app@127.0.0.1:${postgres_port}/zoen"
  export ZOEN_CEDAR_POLICY_MANIFEST="$ZOEN_E2E_GENERATED_DIR/policies.json"
  export ZOEN_LISTEN_ADDR="127.0.0.1:${zoend_port}"
  export ZOEN_OIDC_AUDIENCE=zoend
  export ZOEN_OIDC_ISSUER="http://127.0.0.1:${keycloak_port}/realms/zoen"

  node dist/packages/messaging/src/whatsapp-contact-serve.js \
    >"$ingress_log" 2>&1 &
  local serve_pid=$!
  wait_listen "$ingress_port" 40

  target/debug/zoend >"$zoend_log" 2>&1 &
  local zoend_pid=$!
  wait_http "${zoend_url}/ready" 80
  "$root/scripts/whatsapp-contact-bind.sh"

  # Retarget the paired companion at zoend. Same whatsmeow store. Not a new pair.
  pkill -f 'zoen-whatsapp-companion serve' >/dev/null 2>&1 || true
  local i
  for i in 1 2 3 4 5 6 7 8 10; do
    if ! bash -c "echo >/dev/tcp/127.0.0.1/8081" >/dev/null 2>&1; then
      break
    fi
    sleep 0.4
  done

  (
    unset DATABASE_URL ZOEN_DATABASE_URL ZOEN_WHATSAPP_QR_FILE
    export ZOEN_WHATSAPP_DATABASE_URL
    export ZOEN_WHATSAPP_LISTEN_ADDR
    export ZOEN_WHATSAPP_INGRESS_URL="${zoend_url}/channels/whatsapp/inbound"
    export GOTOOLCHAIN=auto
    export GOCACHE="${GOCACHE:-/tmp/zoen-wa-gocache}"
    export GOMODCACHE="${GOMODCACHE:-/tmp/zoen-wa-gomod}"
    cd "$root/apps/whatsapp-companion"
    go run ./cmd/zoen-whatsapp-companion serve
  ) >"$companion_log" 2>&1 &
  local companion_pid=$!
  wait_http "${ZOEN_WHATSAPP_COMPANION_URL}/ready" 180

  pkill -f '/tmp/zoen-wa-pair/ingress.py' >/dev/null 2>&1 || true

  cat >"$pid_file" <<EOF
CONTACT_SERVE_PID=${serve_pid}
ZOEND_PID=${zoend_pid}
COMPANION_PID=${companion_pid}
EOF

  echo "contact loop up"
  echo "  zoend      ${zoend_url}"
  echo "  ingress    ${ingress_url}"
  echo "  companion  ${ZOEN_WHATSAPP_COMPANION_URL}"
  echo "  door       ${ZOEN_WHATSAPP_DOOR_E164}"
  echo "  advertise  ${zoend_url}/channels/whatsapp/advertise"
  echo "  logs       ${log_dir}"
  cmd_advertise
}

command="${1:-}"
case "$command" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  advertise) cmd_advertise ;;
  bind) cmd_bind ;;
  *) usage ;;
esac
