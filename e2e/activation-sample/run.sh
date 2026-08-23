#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

set -a
# shellcheck disable=SC1091
source e2e/activation-sample/.env
set +a

export ZOEN_E2E_GENERATED_DIR="${ZOEN_E2E_GENERATED_DIR:-e2e/activation-sample/.generated}"
export ZOEN_E2E_ARTIFACTS_DIR="${ZOEN_E2E_ARTIFACTS_DIR:-artifacts/activation-sample}"

if [[ ! -f dist/e2e/activation-sample.js ]]; then
  echo "missing dist/e2e/activation-sample.js; run \`just build\` or \`npm run build\`" >&2
  exit 1
fi
if [[ ! -x target/debug/zoend ]]; then
  echo "missing target/debug/zoend; run \`just build\`" >&2
  exit 1
fi
if [[ ! -f apps/web/.output/server/index.mjs ]]; then
  echo "missing apps/web/.output/server/index.mjs; run \`npm run build\`" >&2
  exit 1
fi

cleanup() {
  node dist/e2e/activation-sample/cli.js stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

node dist/e2e/activation-sample/cli.js prove
trap - EXIT
cleanup
