#!/usr/bin/env bash
# Record the Sample Company five-minute web-user path on the production start stack.
# Rerun: ./docs/demo/record.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

set -a
# shellcheck disable=SC1091
source e2e/activation-sample/.env
set +a

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Users/enzotironi/Code/OS/target}"

if [[ ! -x target/debug/zoend ]]; then
  if [[ -x /Users/enzotironi/Code/OS/target/debug/zoend ]]; then
    mkdir -p target/debug
    ln -sfn /Users/enzotironi/Code/OS/target/debug/zoend target/debug/zoend
  else
    echo "missing target/debug/zoend; build on the main checkout or symlink it" >&2
    exit 1
  fi
fi

if [[ ! -d node_modules/playwright ]]; then
  echo "missing playwright; run npm ci at the repository root" >&2
  exit 1
fi

npm exec -- tsc -p tsconfig.json --pretty false

status_file="$(mktemp)"
cleanup() { rm -f "$status_file"; }
trap cleanup EXIT

# Invoke exported main() so a symlinked dist/ (realpath ≠ argv path) still runs.
cli_status() {
  node --input-type=module -e '
    import { main } from "./dist/e2e/activation-sample/cli.js";
    const code = await main(["status"]);
    process.exit(code);
  '
}

live_web_ok() {
  curl -fsS -o /dev/null "http://127.0.0.1:${ZOEN_E2E_WEB_PORT}/api/config"
}

live_oidc_ok() {
  curl -fsS -o /dev/null \
    "http://127.0.0.1:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/.well-known/openid-configuration"
}

cli_status >"$status_file" 2>&1 || true
if ! grep -q '^status: Ready$' "$status_file" || ! live_web_ok || ! live_oidc_ok; then
  echo "Sample Company stack is not Ready; starting with just start…"
  just start
fi

cli_status | tee "$status_file"
if ! grep -q '^status: Ready$' "$status_file"; then
  echo "stack must be Ready before recording" >&2
  exit 1
fi
if ! live_web_ok || ! live_oidc_ok; then
  echo "live web/Keycloak probes failed after Ready status" >&2
  exit 1
fi

mkdir -p docs/demo artifacts/activation-sample/demo-record
export ZOEN_DEMO_VIDEO_PATH="${ZOEN_DEMO_VIDEO_PATH:-docs/demo/sample-company-five-minute.webm}"
export ZOEN_DEMO_MANIFEST_PATH="${ZOEN_DEMO_MANIFEST_PATH:-docs/demo/sample-company-five-minute.json}"

# Prefer worktree-local compile of the recorder (may not exist in a shared dist symlink).
if [[ -f dist/e2e/activation-sample/record-demo.js ]]; then
  node --input-type=module -e '
    await import("./dist/e2e/activation-sample/record-demo.js");
  '
else
  echo "missing dist/e2e/activation-sample/record-demo.js after tsc" >&2
  exit 1
fi

video="$ZOEN_DEMO_VIDEO_PATH"
if [[ ! -s "$video" ]]; then
  echo "recording produced empty or missing video at $video" >&2
  exit 1
fi

bytes="$(wc -c <"$video" | tr -d ' ')"
echo "recorded $video ($bytes bytes)"
echo "manifest $ZOEN_DEMO_MANIFEST_PATH"
