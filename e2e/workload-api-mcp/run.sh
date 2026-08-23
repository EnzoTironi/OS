#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

scenario="workload-api-mcp"
compose_file="e2e/${scenario}/compose.yaml"
project="zoen-${scenario}"
runner="dist/e2e/${scenario}.js"
prepare="e2e/${scenario}/prepare-realm.mjs"

set -a
# shellcheck disable=SC1090
source "e2e/${scenario}/.env"
set +a
export ZOEN_E2E_ARTIFACTS_DIR="artifacts/${scenario}"
export ZOEN_E2E_GENERATED_DIR="e2e/${scenario}/.generated"

cleanup() {
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans || true
  rm -rf "${ZOEN_E2E_GENERATED_DIR}"
}
trap cleanup EXIT

cleanup
mkdir -p "${ZOEN_E2E_ARTIFACTS_DIR}" "${ZOEN_E2E_GENERATED_DIR}"
./e2e/assert-unique-ports.sh
node "$prepare"
docker compose --project-name "$project" --file "$compose_file" up --detach --wait
node "$runner"
cleanup
trap - EXIT
