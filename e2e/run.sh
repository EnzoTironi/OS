#!/usr/bin/env bash
set -euo pipefail

# Ticket command stays `just e2e <scenario>` (check + build + run).
# `just verify` runs check and build once, then each scenario runner.
# `just e2e-run` executes a built workspace against Compose and does not lint.

scenarios=(
  definition-publication
  domain-quality
  durable-commit
  effects
  evolution-breaking
  evolution-compatible
  explain
  governed-action
  semantic-query
)

scenario=""
compose_file=""
project=""
runner=""
generated_directory=""
prepare=""

usage() {
  echo "usage: just check" >&2
  echo "       just build [scenario|all]" >&2
  echo "       just e2e-run <scenario>" >&2
  echo "       just e2e <scenario>" >&2
  echo "       just verify" >&2
  echo "scenarios: ${scenarios[*]}" >&2
  exit 2
}

is_scenario() {
  local candidate="$1"
  local name
  for name in "${scenarios[@]}"; do
    if [[ "$name" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

resolve_scenario() {
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
    evolution-compatible)
      compose_file="e2e/evolution-compatible/compose.yaml"
      generated_directory="e2e/evolution-compatible/.generated"
      prepare="e2e/evolution-compatible/prepare-realm.mjs"
      project="zoen-evolution-compatible"
      runner="dist/e2e/evolution-compatible.js"
      ;;
    evolution-breaking)
      compose_file="e2e/evolution-breaking/compose.yaml"
      generated_directory="e2e/evolution-breaking/.generated"
      prepare="e2e/evolution-breaking/prepare-realm.mjs"
      project="zoen-evolution-breaking"
      runner="dist/e2e/evolution-breaking.js"
      ;;
    *)
      usage
      ;;
  esac
}

run_check() {
  npm ci
  npm run buf:lint
  npm run buf:breaking
  npm run buf:generate
  npm exec -- buf build --as-file-descriptor-set -o proto/definition_descriptor.binpb
  git diff --exit-code -- packages/sdk/src/gen proto/definition_descriptor.binpb
  npm run check
  npm test
  cargo fmt --all --check
  cargo clippy --locked --workspace --all-targets -- -D warnings
  cargo test --locked --workspace
  test "$(cargo tree --package zoen-core --depth 1 | wc -l)" -eq 1
}

run_build() {
  local target="${1:-}"
  npm run buf:generate
  npm run build
  cargo build --locked --workspace
  if [[ "$target" == "durable-commit" || "$target" == "all" ]]; then
    CARGO_TARGET_DIR=target/failpoints cargo build --locked --package zoend --features failpoints
  fi
}

require_built() {
  if [[ ! -x target/debug/zoend ]]; then
    echo "missing target/debug/zoend; run \`just build\` or \`just e2e ${scenario}\`" >&2
    exit 1
  fi
  if [[ ! -f "$runner" ]]; then
    echo "missing ${runner}; run \`just build\` or \`just e2e ${scenario}\`" >&2
    exit 1
  fi
}

cleanup_scenario() {
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
  if [[ -n "$generated_directory" ]]; then
    rm -rf "$generated_directory"
  fi
}

run_scenario() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "e2e-run requires docker; check/build do not" >&2
    exit 1
  fi
  require_built
  trap cleanup_scenario EXIT
  cleanup_scenario
  mkdir -p artifacts
  if [[ -n "$prepare" ]]; then
    node "$prepare"
  fi
  if [[ "$scenario" == "durable-commit" && ! -x target/failpoints/debug/zoend ]]; then
    echo "missing failpoints zoend; run \`just build durable-commit\`" >&2
    exit 1
  fi
  docker compose --project-name "$project" --file "$compose_file" up --detach --wait
  node "$runner"
}

run_e2e() {
  resolve_scenario "$1"
  run_check
  run_build "$scenario"
  run_scenario
}

run_verify() {
  run_check
  run_build all
  local name
  for name in "${scenarios[@]}"; do
    resolve_scenario "$name"
    run_scenario
  done
}

command="${1:-}"
case "$command" in
  check)
    run_check
    ;;
  build)
    run_build "${2:-}"
    ;;
  run | e2e-run)
    resolve_scenario "${2:-}"
    run_scenario
    ;;
  e2e)
    run_e2e "${2:-}"
    ;;
  verify)
    run_verify
    ;;
  -h | --help | help | "")
    usage
    ;;
  *)
    if is_scenario "$command"; then
      run_e2e "$command"
    else
      usage
    fi
    ;;
esac
