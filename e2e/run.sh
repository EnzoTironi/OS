#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-}"
generated_directory=""
prepare=""
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
  governed-action)
    compose_file="e2e/governed-action/compose.yaml"
    generated_directory="e2e/governed-action/.generated"
    prepare="e2e/governed-action/prepare-realm.mjs"
    project="zoen-governed-action"
    runner="dist/e2e/governed-action.js"
    ;;
  durable-commit)
    compose_file="e2e/durable-commit/compose.yaml"
    generated_directory="e2e/governed-action/.generated"
    prepare="e2e/governed-action/prepare-realm.mjs"
    project="zoen-durable-commit"
    runner="dist/e2e/durable-commit.js"
    ;;
  effects)
    compose_file="e2e/effects/compose.yaml"
    generated_directory="e2e/governed-action/.generated"
    prepare="e2e/governed-action/prepare-realm.mjs"
    project="zoen-effects"
    runner="dist/e2e/effects.js"
    ;;
  explain)
    compose_file="e2e/explain/compose.yaml"
    generated_directory="e2e/governed-action/.generated"
    prepare="e2e/governed-action/prepare-realm.mjs"
    project="zoen-explain"
    runner="dist/e2e/explain.js"
    ;;
  domain-quality)
    compose_file="e2e/domain-quality/compose.yaml"
    generated_directory="e2e/domain-quality/.generated"
    prepare="e2e/domain-quality/prepare-realm.mjs"
    project="zoen-domain-quality"
    runner="dist/e2e/domain-quality.js"
    ;;
  *)
    echo "usage: just e2e <definition-publication|domain-quality|durable-commit|effects|explain|governed-action|semantic-query>" >&2
    exit 2
    ;;
esac

cleanup() {
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
  if [[ -n "$generated_directory" ]]; then
    rm -rf "$generated_directory"
  fi
}

trap cleanup EXIT
cleanup
rm -rf artifacts
mkdir -p artifacts
if [[ -n "$prepare" ]]; then
  node "$prepare"
fi

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
if [[ "$scenario" == "durable-commit" ]]; then
  CARGO_TARGET_DIR=target/failpoints cargo build --locked --package zoend --features failpoints
fi

docker compose --project-name "$project" --file "$compose_file" up --detach --wait
node "$runner"
