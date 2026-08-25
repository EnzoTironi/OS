#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
pair_dir="${ZOEN_WA_PAIR_DIR:-/tmp/zoen-wa-pair}"
mkdir -p "$pair_dir"

set -a
# shellcheck disable=SC1091
source e2e/channel-whatsapp-live/.env
set +a
export ZOEN_E2E_GENERATED_DIR="${ZOEN_E2E_GENERATED_DIR:-e2e/channel-whatsapp-live/.generated}"
export ZOEN_WA_PAIR_DIR="$pair_dir"
export ZOEN_WHATSAPP_MINUTE_URL="${ZOEN_WHATSAPP_MINUTE_URL:-https://app.zoen.local/}"

npm exec -- tsc -p tsconfig.json --pretty false
node e2e/channel-whatsapp-live/prepare-realm.mjs
docker compose --project-name zoen-channel-whatsapp-live \
  --file e2e/channel-whatsapp-live/compose.yaml \
  up --detach --force-recreate --wait keycloak

zoend_port="${ZOEN_E2E_ZOEND_PORT:-58701}"
postgres_port="${ZOEN_E2E_POSTGRES_PORT:-55520}"
keycloak_port="${ZOEN_E2E_KEYCLOAK_PORT:-58700}"
policy_path="$pair_dir/policies.json"

node --input-type=module <<'EOF'
import { compileCommercial, writePolicyManifest } from "./dist/e2e/whatsapp-dirty-quote/support.js";
const commercial = await compileCommercial();
await writePolicyManifest(process.env.ZOEN_WA_PAIR_DIR + "/policies.json", commercial);
console.log("wrote", process.env.ZOEN_WA_PAIR_DIR + "/policies.json");
EOF

if [[ -f "$pair_dir/contact-loop.pids" ]]; then
  # shellcheck disable=SC1091
  source "$pair_dir/contact-loop.pids"
  if [[ -n "${ZOEND_PID:-}" ]]; then
    kill -TERM "$ZOEND_PID" 2>/dev/null || true
    for i in 1 2 3 4 5 6 7 8 10; do
      if ! kill -0 "$ZOEND_PID" 2>/dev/null; then
        break
      fi
      sleep 0.3
    done
  fi
fi

export DATABASE_URL="postgres://zoen_app:zoen_app@127.0.0.1:${postgres_port}/zoen"
export ZOEN_CEDAR_POLICY_MANIFEST="$policy_path"
export ZOEN_LISTEN_ADDR="127.0.0.1:${zoend_port}"
export ZOEN_OIDC_AUDIENCE=zoend
export ZOEN_OIDC_ISSUER="http://127.0.0.1:${keycloak_port}/realms/zoen"
export ZOEN_MESSAGING_GATEWAY_URL="http://127.0.0.1:${ZOEN_MESSAGING_INGRESS_PORT:-18082}"

target/debug/zoend >>"$pair_dir/zoend.log" 2>&1 &
new_zoend=$!
for i in $(seq 1 80); do
  if curl -fsS -m 1 "http://127.0.0.1:${zoend_port}/ready" >/dev/null 2>&1; then
    echo zoend_ready
    break
  fi
  sleep 0.25
done

node dist/e2e/whatsapp-dirty-quote/live-seed.js

if [[ -f "$pair_dir/contact-loop.pids" ]]; then
  # shellcheck disable=SC1091
  source "$pair_dir/contact-loop.pids"
  cat >"$pair_dir/contact-loop.pids" <<EOF
CONTACT_SERVE_PID=${CONTACT_SERVE_PID:-}
ZOEND_PID=${new_zoend}
COMPANION_PID=${COMPANION_PID:-}
EOF
fi
