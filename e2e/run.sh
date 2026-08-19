#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-}"
if [[ "$scenario" != "definition-publication" ]]; then
  echo "usage: just e2e definition-publication" >&2
  exit 2
fi

compose_file="e2e/definition-publication/compose.yaml"
project="zoen-definition-publication"

cleanup() {
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
}

trap cleanup EXIT
cleanup
rm -rf artifacts
mkdir -p artifacts

npm ci
npm run buf:lint
npm run buf:breaking
npm run buf:generate
npm exec -- buf build --as-file-descriptor-set -o proto/definition_descriptor.binpb
git diff --exit-code -- packages/sdk/src/gen proto/definition_descriptor.binpb
npm run build

cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo build --locked --workspace
cargo test --locked --workspace
test "$(cargo tree --package zoen-core --depth 1 | wc -l)" -eq 1

docker compose --project-name "$project" --file "$compose_file" up --detach --wait
node dist/e2e/definition-publication.js
