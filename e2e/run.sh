#!/usr/bin/env bash
set -euo pipefail

# Ticket command stays `just e2e <scenario>` (check + native build + run).
# `just verify` runs check and native build once, then each scenario runner.
# scenario_table fields: name:realm:variant:class
# class is live | credential.
# dest live leaves realm empty. Credential fiscal realm still runs prepare-realm.mjs.
# just verify runs only class=live. Credential fiscal stays optional.
# `just verify-v1` aggregates typed artifacts into a signed zoen.verify.v1 bundle.
# `just verify-activation` aggregates AD artifacts into a signed zoen.activation.v1 bundle.
# `just e2e-run` executes a built workspace and does not lint.
# Each scenario loads `e2e/<scenario>/.env` so Compose, zoend, and artifacts
# never share host ports or generated files with another scenario.

scenario_table=(
  "activation-identity:::live"
  "messaging-boundary:::live"
  "definition-publication:::live"
  "cedar-object-projection:::live"
  "commercial-identity:::live"
  "dirty-quote:::live"
  "durable-commit:::live"
  "evolution-breaking:::live"
  "evolution-compatible:::live"
  "explain:::live"
  "fiscal-systax-live:fiscal-systax-live::credential"
  "fiscal-plugnotas-live:fiscal-plugnotas-live::credential"
  "fiscal-protheus-live:fiscal-protheus-live::credential"
  "governed-action:::live"
  "public-surface:::live"
  "reminder-loop:::live"
  "workshop-app:::live"
  "mcp-server:::live"
  "cli-dest:::live"
  "semantic-query:::live"
  "wasm-code-mode:::live"
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
  echo "       just verify" >&2
  echo "       just verify-v1" >&2
  echo "       just verify-activation" >&2
  echo "scenarios: ${names[*]}" >&2
  exit 2
}

no_compose_scenario() {
  [[ "$scenario" == "public-surface" || "$scenario" == "cli-dest" ]]
}

load_scenario_env() {
  local env_file="e2e/${scenario}/.env"
  export ZOEN_E2E_ARTIFACTS_DIR="artifacts/${scenario}"
  export ZOEN_E2E_GENERATED_DIR="e2e/${scenario}/.generated"
  generated_directory="${ZOEN_E2E_GENERATED_DIR}"
  if no_compose_scenario; then
    return
  fi
  if [[ ! -f "$env_file" ]]; then
    echo "missing ${env_file}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

resolve_scenario() {
  local candidate="${1:-}"
  local row
  local name
  local realm
  local klass
  for row in "${scenario_table[@]}"; do
    IFS=: read -r name realm _ klass <<< "$row"
    if [[ "$name" == "$candidate" ]]; then
      scenario="$name"
      compose_file="e2e/${scenario}/compose.yaml"
      project="zoen-${scenario}"
      runner="dist/e2e/${scenario}.js"
      prepare=""
      if no_compose_scenario; then
        compose_file=""
        project=""
      elif [[ "$klass" == "credential" && -n "$realm" ]]; then
        prepare="e2e/${realm}/prepare-realm.mjs"
      fi
      load_scenario_env
      return
    fi
  done
  usage
}

run_lint() {
  if [[ ! -s apps/conversation/agent/instructions.md ]]; then
    echo "apps/conversation/agent/instructions.md is required for eve build" >&2
    exit 1
  fi
  npm ci --ignore-scripts
  npm --prefix apps/effect-worker ci --ignore-scripts
  npm run buf:lint
  npm run buf:breaking
  npm run buf:generate
  npm exec -- buf build --as-file-descriptor-set -o proto/definition_descriptor.binpb
  /usr/bin/git diff --exit-code -- gen/connect proto/definition_descriptor.binpb
  if grep -REn '@zoen/sdk|@zoen/osdk|@zoen/ontology|packages/sdk|packages/osdk|packages/ontology' \
    --include='*.ts' --include='*.tsx' --include='package.json' \
    --include='buf.gen.yaml' --include='Dockerfile*' --include='tsconfig*.json' \
    --exclude='package-lock.json' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=target --exclude-dir=.git \
    .; then
    echo "sdk/osdk references remain" >&2
    exit 1
  fi
  if grep -R --include='compose.yaml' 'quay.io/keycloak' e2e \
    | grep -v 'fiscal-'; then
    echo "dest e2e compose still plants Keycloak" >&2
    exit 1
  fi
  npm run build
  npm run lint:ts
  node scripts/generate-jcs-fixtures.mjs --check
  node scripts/check-canonical-json.mjs
  cargo fmt --all --check
  cargo test --locked --workspace
  test "$(cargo tree --package zoen-core --depth 1 | wc -l)" -eq 1
  ./e2e/assert-unique-ports.sh
}

run_clippy() {
  cargo clippy --locked --workspace --all-targets --exclude zoen-proto --no-deps -- -D warnings
}

run_check() {
  run_lint
  run_clippy
}

run_native_build() {
  cargo build --locked --workspace
}

run_build() {
  npm run buf:generate
  npm run build
  run_native_build
}

require_built() {
  if [[ "$scenario" != "public-surface" && ! -x target/debug/zoen ]]; then
    echo "missing target/debug/zoen; run \`just build\` or \`just e2e ${scenario}\`" >&2
    exit 1
  fi
  if [[ ! -f "$runner" ]]; then
    echo "missing ${runner}; run \`just build\` or \`just e2e ${scenario}\`" >&2
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
  if no_compose_scenario; then
    return
  fi
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
  if [[ -n "$generated_directory" ]]; then
    rm -rf "$generated_directory"
  fi
}

run_scenario() {
  require_fiscal_live_environment
  if ! no_compose_scenario && ! command -v docker >/dev/null 2>&1; then
    echo "e2e-run requires docker; check/build do not" >&2
    exit 1
  fi
  require_built
  trap cleanup_scenario EXIT
  cleanup_scenario
  mkdir -p "${ZOEN_E2E_ARTIFACTS_DIR}"
  if no_compose_scenario; then
    node "$runner"
    trap - EXIT
    return
  fi
  mkdir -p "$generated_directory"
  if [[ -n "$prepare" ]]; then
    node "$prepare"
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
    IFS=: read -r name _ _ klass <<< "$row"
    if [[ "$klass" != "live" ]]; then
      continue
    fi
    resolve_scenario "$name"
    run_scenario
  done
}

run_verify_v1() {
  # Aggregate-only gate: consume artifacts/, never wipe them, never rerun scenarios.
  if [[ ! -f node_modules/typescript/package.json ]]; then
    npm ci
  fi
  npm exec -- tsc -p tsconfig.json --pretty false
  node dist/e2e/verify-v1.js
}

run_verify_activation() {
  # Aggregate-only gate: consume artifacts/, never wipe them, never rerun scenarios.
  if [[ ! -f node_modules/typescript/package.json ]]; then
    npm ci
  fi
  npm exec -- tsc -p tsconfig.json --pretty false
  node dist/e2e/verify-activation.js
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
  verify)
    run_verify
    ;;
  verify-v1)
    run_verify_v1
    ;;
  verify-activation)
    run_verify_activation
    ;;
  -h | --help | help | "")
    usage
    ;;
  *)
    run_e2e "$command"
    ;;
esac
