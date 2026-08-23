#!/usr/bin/env bash
# Local runner until AD-09 registers `just e2e activation-metrics`.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

set -a
# shellcheck disable=SC1091
source e2e/activation-metrics/.env
set +a

export ZOEN_E2E_ARTIFACTS_DIR="artifacts/activation-metrics"
export ZOEN_E2E_GENERATED_DIR="e2e/activation-metrics/.generated"

project="zoen-activation-metrics"
compose_file="e2e/activation-metrics/compose.yaml"
runner="dist/e2e/activation-metrics.js"

cleanup() {
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans || true
  rm -rf "$ZOEN_E2E_GENERATED_DIR"
}
trap cleanup EXIT

cleanup
mkdir -p "$ZOEN_E2E_ARTIFACTS_DIR"

if [[ ! -x target/debug/zoend ]]; then
  cargo build --locked --package zoend
fi

npm exec -- tsc -p tsconfig.json --pretty false

node e2e/activation-metrics/prepare-realm.mjs
docker compose --project-name "$project" --file "$compose_file" up --detach --wait
node "$runner"

# Port uniqueness includes this scenario's .env
./e2e/assert-unique-ports.sh
