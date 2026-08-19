#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-}"
case "$scenario" in
  definition-publication)
    compose_file="e2e/definition-publication/compose.yaml"
    project="zoen-definition-publication"
    runner="dist/e2e/definition-publication.js"
    ;;
  semantic-query)
    compose_file="e2e/semantic-query/compose.yaml"
    project="zoen-semantic-query"
    runner="dist/e2e/semantic-query.js"
    ;;
  *)
    echo "usage: just e2e <definition-publication|semantic-query>" >&2
    exit 2
    ;;
esac

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
node "$runner"
