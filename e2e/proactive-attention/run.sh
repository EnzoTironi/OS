#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

scenario="proactive-attention"
export ZOEN_E2E_ARTIFACTS_DIR="artifacts/${scenario}"
export ZOEN_E2E_GENERATED_DIR="e2e/${scenario}/.generated"
set -a
# shellcheck disable=SC1091
source "e2e/${scenario}/.env"
set +a

./e2e/assert-unique-ports.sh

project="zoen-${scenario}"
compose_file="e2e/${scenario}/compose.yaml"
runner="dist/e2e/${scenario}.js"

cleanup() {
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
  rm -rf "${ZOEN_E2E_GENERATED_DIR}"
}
trap cleanup EXIT

cleanup
mkdir -p "${ZOEN_E2E_ARTIFACTS_DIR}"
npx tsc -p tsconfig.json
node "e2e/${scenario}/prepare-realm.mjs"
docker compose --project-name "$project" --file "$compose_file" up --detach --wait
node "$runner"
cleanup
trap - EXIT
