#!/usr/bin/env bash
set -euo pipefail

# Ticket command stays `just e2e <scenario>` (check + native build + run).
# `just verify` runs check and native build once, then each scenario runner.
# `just e2e-run` executes a built workspace and does not lint.
# Each scenario loads `e2e/<scenario>/.env` so Compose, zoend, and artifacts
# never share host ports or generated files with another scenario.

scenario_table=(
  "agent-capabilities-live:agent-capabilities-live:"
  "backup-restore::"
  "company-brain-live:company-brain-live:"
  "definition-publication::"
  "deploy-dedicated::"
  "deploy-self-hosted-isolated::"
  "ha-chaos::"
  "domain-commercial:domain-commercial:"
  "domain-inventory-procurement:domain-inventory-procurement:"
  "domain-manufacturing-accounting:domain-manufacturing-accounting:"
  "domain-quality:domain-quality:"
  "durable-commit:governed-action:failpoints"
  "effects:governed-action:"
  "evolution-breaking:evolution-breaking:"
  "evolution-compatible:evolution-compatible:"
  "explain:governed-action:"
  "fiscal-fault-matrix:fiscal-fault-matrix:"
  "fiscal-systax-live:fiscal-systax-live:"
  "fiscal-plugnotas-live:fiscal-plugnotas-live:"
  "fiscal-protheus-live:fiscal-protheus-live:"
  "governed-action:governed-action:"
  "rolling-upgrade::"
  "rpo-rto::"
  "scale-actions-v1::"
  "scale-mixed-v1::"
  "scale-query-v1::"
  "scale-seed-v1::"
  "semantic-query::"
  "shared-tenancy::"
  "v1-company::"
  "wasm-code-mode:wasm-code-mode:"
  "web-adaptive-live:web-adaptive-live:"
  "web-deterministic:web-deterministic:"
)

scenario=""
compose_file=""
project=""
runner=""
generated_directory=""
prepare=""

usage() {
  local row
  local names=()
  for row in "${scenario_table[@]}"; do
    names+=("${row%%:*}")
  done
  echo "usage: just lint" >&2
  echo "       just clippy" >&2
  echo "       just check" >&2
  echo "       just build [scenario|all]" >&2
  echo "       just e2e-run <scenario>" >&2
  echo "       just e2e <scenario>" >&2
  echo "       just release-drill rpo-rto" >&2
  echo "       just scale seed-v1|query-v1|actions-v1|mixed-v1" >&2
  echo "       just verify" >&2
  echo "scenarios: ${names[*]}" >&2
  exit 2
}

load_scenario_env() {
  local env_file="e2e/${scenario}/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "missing ${env_file}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  export ZOEN_E2E_ARTIFACTS_DIR="artifacts/${scenario}"
  export ZOEN_E2E_GENERATED_DIR="e2e/${scenario}/.generated"
  generated_directory="${ZOEN_E2E_GENERATED_DIR}"
}

resolve_scenario() {
  local candidate="${1:-}"
  local row
  local name
  local realm
  for row in "${scenario_table[@]}"; do
    IFS=: read -r name realm _ <<< "$row"
    if [[ "$name" == "$candidate" ]]; then
      scenario="$name"
      compose_file="e2e/${scenario}/compose.yaml"
      project="zoen-${scenario}"
      runner="dist/e2e/${scenario}.js"
      prepare=""
      if [[ "$scenario" == "shared-tenancy" || "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" || "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" || "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" || "$scenario" == "v1-company" ]]; then
        compose_file=""
        project=""
      elif [[ -n "$realm" ]]; then
        prepare="e2e/${realm}/prepare-realm.mjs"
      fi
      if [[ "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" ]]; then
        runner="dist/e2e/deployment-portability.js"
      fi
      if [[ "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" ]]; then
        runner="dist/e2e/reliability.js"
      fi
      if [[ "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" ]]; then
        runner="dist/e2e/scale.js"
      fi
      load_scenario_env
      return
    fi
  done
  usage
}

build_needs_failpoints() {
  local target="$1"
  local row
  local name
  local variant
  for row in "${scenario_table[@]}"; do
    IFS=: read -r name _ variant <<< "$row"
    if [[ "$variant" == "failpoints" && ( "$target" == "all" || "$target" == "$name" ) ]]; then
      return 0
    fi
  done
  return 1
}

run_lint() {
  npm ci
  npm run buf:lint
  npm run buf:breaking
  npm run buf:generate
  npm exec -- buf build --as-file-descriptor-set -o proto/definition_descriptor.binpb
  git diff --exit-code -- packages/sdk/src/gen proto/definition_descriptor.binpb
  npm run build
  npm run deployment-docs:check
  npm test
  cargo fmt --all --check
  cargo test --locked --workspace
  test "$(cargo tree --package zoen-core --depth 1 | wc -l)" -eq 1
  ./e2e/assert-unique-ports.sh
}

run_clippy() {
  cargo clippy --locked --workspace --all-targets -- -D warnings
}

run_check() {
  run_lint
  run_clippy
}

run_native_build() {
  local target="${1:-}"
  cargo build --locked --workspace
  if build_needs_failpoints "$target"; then
    CARGO_TARGET_DIR=target/failpoints cargo build --locked --package zoend --features failpoints
  fi
}

run_build() {
  local target="${1:-}"
  npm run buf:generate
  npm run build
  run_native_build "$target"
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
  if [[ ( "$scenario" == "web-deterministic" || "$scenario" == "web-adaptive-live" ) && ! -f apps/web/.output/server/index.mjs ]]; then
    echo "missing apps/web/.output/server/index.mjs; run \`just build\` or \`just e2e ${scenario}\`" >&2
    exit 1
  fi
}

require_fiscal_live_environment() {
  local required=()
  case "$scenario" in
    fiscal-systax-live)
      required=(
        ZOEN_FISCAL_LIVE_CONTEXT_PATH
        ZOEN_SYSTAX_BASE_URL
        ZOEN_SYSTAX_API_TOKEN
      )
      ;;
    fiscal-plugnotas-live)
      required=(
        ZOEN_FISCAL_LIVE_CONTEXT_PATH
        ZOEN_PLUGNOTAS_BASE_URL
        ZOEN_PLUGNOTAS_API_KEY
      )
      ;;
    fiscal-protheus-live)
      required=(
        ZOEN_FISCAL_LIVE_CONTEXT_PATH
        ZOEN_PROTHEUS_BASE_URL
        ZOEN_PROTHEUS_API_TOKEN
      )
      ;;
    *)
      return
      ;;
  esac
  local name
  for name in "${required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      echo "${scenario} requires ${name}; no live provider evidence was produced" >&2
      exit 1
    fi
  done
}

cleanup_scenario() {
  if [[ "$scenario" == "shared-tenancy" || "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" || "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" || "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" || "$scenario" == "v1-company" ]]; then
    return
  fi
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
  if [[ -n "$generated_directory" ]]; then
    rm -rf "$generated_directory"
  fi
}

run_scenario() {
  require_fiscal_live_environment
  if ! command -v docker >/dev/null 2>&1; then
    echo "e2e-run requires docker; check/build do not" >&2
    exit 1
  fi
  require_built
  trap cleanup_scenario EXIT
  cleanup_scenario
  mkdir -p "${ZOEN_E2E_ARTIFACTS_DIR}"
  if [[ "$scenario" == "shared-tenancy" ]]; then
    e2e/shared-tenancy/run.sh
    trap - EXIT
    return
  fi
  if [[ "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" || "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" || "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" || "$scenario" == "v1-company" ]]; then
    "e2e/${scenario}/run.sh"
    trap - EXIT
    return
  fi
  if [[ -n "$prepare" ]]; then
    node "$prepare"
  fi
  if build_needs_failpoints "$scenario" && [[ ! -x target/failpoints/debug/zoend ]]; then
    echo "missing failpoints zoend; run \`just build ${scenario}\`" >&2
    exit 1
  fi
  docker compose --project-name "$project" --file "$compose_file" up --detach --wait
  node "$runner"
  cleanup_scenario
  trap - EXIT
}

run_e2e() {
  resolve_scenario "$1"
  require_fiscal_live_environment
  rm -rf "${ZOEN_E2E_ARTIFACTS_DIR}"
  run_check
  run_native_build "$scenario"
  run_scenario
}

run_verify() {
  rm -rf artifacts
  run_check
  run_native_build all
  local row
  local name
  for row in "${scenario_table[@]}"; do
    IFS=: read -r name _ <<< "$row"
    if [[ "$name" == fiscal-systax-live || "$name" == fiscal-plugnotas-live || "$name" == fiscal-protheus-live || "$name" == ha-chaos || "$name" == backup-restore || "$name" == rolling-upgrade || "$name" == rpo-rto || "$name" == scale-seed-v1 || "$name" == scale-query-v1 || "$name" == scale-actions-v1 || "$name" == scale-mixed-v1 ]]; then
      continue
    fi
    resolve_scenario "$name"
    run_scenario
  done
}

command="${1:-}"
case "$command" in
  lint)
    run_lint
    ;;
  clippy)
    run_clippy
    ;;
  check)
    run_check
    ;;
  build)
    run_build "${2:-}"
    ;;
  run | e2e-run)
    resolve_scenario "${2:-}"
    rm -rf "${ZOEN_E2E_ARTIFACTS_DIR}"
    run_scenario
    ;;
  e2e)
    run_e2e "${2:-}"
    ;;
  release-drill)
    run_e2e "${2:-}"
    ;;
  scale)
    run_e2e "scale-${2:-}"
    ;;
  verify)
    run_verify
    ;;
  -h | --help | help | "")
    usage
    ;;
  *)
    run_e2e "$command"
    ;;
esac
