#!/usr/bin/env bash
set -euo pipefail

# Ticket command stays `just e2e <scenario>` (check + native build + run).
# `just verify` runs check and native build once, then each scenario runner.
# scenario_table fields: name:realm:variant:class
# class is live | archive | kind | scale | credential.
# just verify runs only class=live. Archive, KIND, scale, and credential
# scenarios stay optional.
# `just verify-v1` aggregates typed artifacts into a signed zoen.verify.v1 bundle.
# `just verify-activation` aggregates AD artifacts into a signed zoen.activation.v1 bundle.
# `just e2e-run` executes a built workspace and does not lint.
# Each scenario loads `e2e/<scenario>/.env` so Compose, zoend, and artifacts
# never share host ports or generated files with another scenario.

scenario_table=(
  "activation-identity:activation-identity::live"
  "activation-context:activation-context::live"
  "activation-onboarding:activation-onboarding::archive"
  "activation-metrics:activation-metrics::archive"
  "messaging-boundary:messaging-boundary::live"
  "channel-linq-live:channel-linq-live::credential"
  "channel-whatsapp-live:channel-whatsapp-live::credential"
  "channel-telegram-live:channel-telegram-live::credential"
  "messaging-conformance-live:messaging-conformance-live::credential"
  "whatsapp-dirty-quote:whatsapp-dirty-quote::credential"
  "company-bootstrap-shadow:company-bootstrap-shadow::archive"
  "conversational-approval:conversational-approval::live"
  "conversational-turn:conversational-turn::live"
  "pack-kitchen:pack-kitchen::archive"
  "personal-family:personal-family::archive"
  "workload-api-mcp:workload-api-mcp::archive"
  "activation-sample:::archive"
  "agent-capabilities-live:agent-capabilities-live::live"
  "backup-restore:::kind"
  "company-brain-live:company-brain-live::live"
  "definition-publication:governed-action::live"
  "deploy-dedicated:::kind"
  "deploy-self-hosted-isolated:::kind"
  "ha-chaos:::kind"
  "adr-0007:adr-0007::archive"
  "domain-commercial:domain-commercial::archive"
  "domain-inventory-procurement:domain-inventory-procurement::archive"
  "domain-manufacturing-accounting:domain-manufacturing-accounting::archive"
  "domain-quality:domain-quality::archive"
  "entity-location:entity-location::archive"
  "cedar-object-projection:cedar-object-projection::live"
  "commercial-identity:commercial-identity::live"
  "dirty-quote:dirty-quote::live"
  "durable-commit:governed-action:failpoints:live"
  "effects:governed-action::archive"
  "evolution-breaking:evolution-breaking::live"
  "evolution-compatible:evolution-compatible::live"
  "explain:governed-action::live"
  "fiscal-fault-matrix:fiscal-fault-matrix::archive"
  "fiscal-systax-live:fiscal-systax-live::credential"
  "fiscal-plugnotas-live:fiscal-plugnotas-live::credential"
  "fiscal-protheus-live:fiscal-protheus-live::credential"
  "governed-action:governed-action::live"
  "human-executor:human-executor::archive"
  "pack-install:pack-install::archive"
  "pack-registry:pack-registry::archive"
  "public-surface:::live"
  "public-surface-web:public-surface-web::archive"
  "rolling-upgrade:::kind"
  "rpo-rto:::kind"
  "scale-actions-v1:::scale"
  "scale-mixed-v1:::scale"
  "scale-query-v1:::scale"
  "scale-seed-v1:::scale"
  "semantic-query:semantic-query::live"
  "shared-tenancy:::kind"
  "v1-company:::kind"
  "wasm-code-mode:wasm-code-mode::live"
  "web-adaptive-live:web-adaptive-live::archive"
  "web-deterministic:web-deterministic::archive"
  "workshop-miniapp:workshop-miniapp::archive"
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
  echo "       just verify-v1" >&2
  echo "       just verify-activation" >&2
  echo "scenarios: ${names[*]}" >&2
  exit 2
}

load_scenario_env() {
  local env_file="e2e/${scenario}/.env"
  export ZOEN_E2E_ARTIFACTS_DIR="artifacts/${scenario}"
  export ZOEN_E2E_GENERATED_DIR="e2e/${scenario}/.generated"
  generated_directory="${ZOEN_E2E_GENERATED_DIR}"
  if [[ "$scenario" == "public-surface" ]]; then
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
  for row in "${scenario_table[@]}"; do
    IFS=: read -r name realm _ <<< "$row"
    if [[ "$name" == "$candidate" ]]; then
      scenario="$name"
      compose_file="e2e/${scenario}/compose.yaml"
      project="zoen-${scenario}"
      runner="dist/e2e/${scenario}.js"
      prepare=""
      if [[ "$scenario" == "shared-tenancy" || "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" || "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" || "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" || "$scenario" == "v1-company" || "$scenario" == "activation-sample" || "$scenario" == "public-surface" ]]; then
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
    IFS=: read -r name _ variant _ <<< "$row"
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
  npm run roadmap:check
  node scripts/check-no-fake-exports.mjs
  node scripts/check-domain-leakage.mjs
  node scripts/check-commercial-lake.mjs
  node scripts/check-e2e-workflow-matrix.mjs
  node scripts/generate-jcs-fixtures.mjs --check
  node scripts/check-production-artifacts.mjs
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
  if [[ "$scenario" != "public-surface" && ! -x target/debug/zoend ]]; then
    echo "missing target/debug/zoend; run \`just build\` or \`just e2e ${scenario}\`" >&2
    exit 1
  fi
  if [[ ! -f "$runner" ]]; then
    echo "missing ${runner}; run \`just build\` or \`just e2e ${scenario}\`" >&2
    exit 1
  fi
  if [[ ( "$scenario" == "web-deterministic" || "$scenario" == "web-adaptive-live" || "$scenario" == "activation-sample" || "$scenario" == "public-surface-web" || "$scenario" == "workshop-miniapp" ) && ! -f archive/apps/web/.output/server/index.mjs ]]; then
    echo "missing archived web; checkout archive/pre-modeled-erp to run this optional scenario" >&2
    exit 1
  fi
}

require_fiscal_live_environment() {
  if [[ "$scenario" == "channel-linq-live" && -f "${HOME}/.config/zoen/linq-sandbox.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${HOME}/.config/zoen/linq-sandbox.env"
    set +a
  fi
  if [[ "$scenario" == "channel-whatsapp-live" ]]; then
    if [[ -f "${HOME}/.config/zoen/whatsapp-door.env" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "${HOME}/.config/zoen/whatsapp-door.env"
      set +a
    fi
    if [[ -f /tmp/zoen-wa-pair/door.env ]]; then
      set -a
      # shellcheck disable=SC1091
      source /tmp/zoen-wa-pair/door.env
      set +a
    fi
    if [[ -z "${ZOEN_WHATSAPP_COMPANION_URL:-}" ]]; then
      export ZOEN_WHATSAPP_COMPANION_URL="http://127.0.0.1:8081"
    fi
  fi
  if [[ "$scenario" == "whatsapp-dirty-quote" ]]; then
    if [[ -f /tmp/zoen-wa-pair/door.env ]]; then
      set -a
      # shellcheck disable=SC1091
      source /tmp/zoen-wa-pair/door.env
      set +a
    fi
    if [[ -z "${ZOEN_WHATSAPP_COMPANION_URL:-}" ]]; then
      export ZOEN_WHATSAPP_COMPANION_URL="http://127.0.0.1:8081"
    fi
  fi
  if [[ "$scenario" == "channel-telegram-live" && -f "${HOME}/.config/zoen/telegram-bot.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${HOME}/.config/zoen/telegram-bot.env"
    set +a
  fi
  if [[ "$scenario" == "messaging-conformance-live" ]]; then
    if [[ -f "${HOME}/.config/zoen/whatsapp-door.env" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "${HOME}/.config/zoen/whatsapp-door.env"
      set +a
    fi
    if [[ -f "${HOME}/.config/zoen/telegram-bot.env" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "${HOME}/.config/zoen/telegram-bot.env"
      set +a
    fi
    if [[ -f "${HOME}/.config/zoen/linq-sandbox.env" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "${HOME}/.config/zoen/linq-sandbox.env"
      set +a
    fi
  fi
  local required=()
  case "$scenario" in
    channel-linq-live)
      required=(LINQ_API_KEY)
      ;;
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
  if [[ "$scenario" == "shared-tenancy" || "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" || "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" || "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" || "$scenario" == "v1-company" || "$scenario" == "activation-sample" || "$scenario" == "public-surface" ]]; then
    return
  fi
  docker compose --project-name "$project" --file "$compose_file" down --volumes --remove-orphans
  if [[ -n "$generated_directory" ]]; then
    rm -rf "$generated_directory"
  fi
}

run_scenario() {
  require_fiscal_live_environment
  if [[ "$scenario" != "public-surface" ]] && ! command -v docker >/dev/null 2>&1; then
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
  if [[ "$scenario" == "deploy-dedicated" || "$scenario" == "deploy-self-hosted-isolated" || "$scenario" == "ha-chaos" || "$scenario" == "backup-restore" || "$scenario" == "rolling-upgrade" || "$scenario" == "rpo-rto" || "$scenario" == "scale-seed-v1" || "$scenario" == "scale-query-v1" || "$scenario" == "scale-actions-v1" || "$scenario" == "scale-mixed-v1" || "$scenario" == "v1-company" || "$scenario" == "activation-sample" ]]; then
    "e2e/${scenario}/run.sh"
    trap - EXIT
    return
  fi
  if [[ "$scenario" == "public-surface" ]]; then
    node "$runner"
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
    IFS=: read -r name _ _ klass <<< "$row"
    if [[ "$klass" != "live" ]]; then
      continue
    fi
    resolve_scenario "$name"
    run_scenario
  done
}

run_verify_v1() {
  # Aggregate-only gate: consume artifacts/, never wipe them, never rerun KIND.
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
  release-drill)
    run_e2e "${2:-}"
    ;;
  scale)
    run_e2e "scale-${2:-}"
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
