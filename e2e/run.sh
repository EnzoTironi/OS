#!/usr/bin/env bash
set -euo pipefail

# `prepare` is the only phase allowed to install, generate, check, or build.
# Each `run` leases all of its mutable runtime state before loading a scenario.

scenario=""
scenario_class=""
compose_kind=""
scenario_weight=""
realm=""
minio_kind=""
runner=""
prepare_realm=""
context_file=""
result_marked="false"
prepare_lock_token=""
pool_weight=0
suite_failed="false"
pool_pids=()
pool_weights=()
pool_names=()

registry() {
  node e2e/scenario-registry.mjs "$@"
}

usage() {
  echo "usage: just lint | clippy | check | prepare | verify" >&2
  echo "       just build [scenario|all]" >&2
  echo "       just e2e-run <scenario>" >&2
  echo "       just e2e <scenario>" >&2
  echo "       just e2e-parallel" >&2
  echo "       just verify-v1 | verify-activation" >&2
  echo "scenarios: $(registry names all)" >&2
  exit 2
}

resolve_scenario() {
  local candidate="${1:-}"
  local row
  if ! row="$(registry rows "$candidate")"; then
    usage
  fi
  IFS='|' read -r scenario scenario_class compose_kind scenario_weight realm minio_kind _ <<< "$row"
  if [[ -z "$scenario" || -z "$scenario_class" || -z "$compose_kind" || -z "$scenario_weight" ]]; then
    echo "invalid registry row for ${candidate}" >&2
    exit 1
  fi
  runner="dist/e2e/${scenario}.js"
  prepare_realm=""
  if [[ "$scenario_class" == "credential" && -n "$realm" ]]; then
    prepare_realm="e2e/${realm}/prepare-realm.mjs"
  fi
}

load_scenario_defaults() {
  if [[ "$compose_kind" != "compose" ]]; then
    return
  fi
  local env_file="e2e/${scenario}/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "missing ${env_file}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

run_lint() {
  if [[ ! -s apps/conversation/agent/instructions.md ]]; then
    echo "apps/conversation/agent/instructions.md is required for eve build" >&2
    exit 1
  fi
  npm ci
  npm ci --prefix apps/auth
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
  CARGO_BUILD_BUILD_DIR="target/gates" CARGO_BUILD_TARGET_DIR="target/gates" \
    CARGO_TARGET_DIR="target/gates" \
    CARGO_BUILD_RUSTC_WRAPPER="" CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER="" \
    RUSTC_WRAPPER="" RUSTC_WORKSPACE_WRAPPER="" \
    cargo test --locked --workspace --target-dir target/gates
  test "$(cargo tree --package zoen-core --depth 1 | wc -l)" -eq 1
  ./e2e/assert-unique-ports.sh
}

run_clippy() {
  CARGO_BUILD_BUILD_DIR="target/gates" CARGO_BUILD_TARGET_DIR="target/gates" \
    CARGO_TARGET_DIR="target/gates" \
    CARGO_BUILD_RUSTC_WRAPPER="" CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER="" \
    RUSTC_WRAPPER="" RUSTC_WORKSPACE_WRAPPER="" \
    cargo clippy --locked --workspace --all-targets --exclude zoen-proto --no-deps \
      --target-dir target/gates -- -D warnings
}

run_check() {
  run_lint
  run_clippy
}

run_native_build() {
  local wrapper=""
  if [[ "${ZOEN_BUILD_RUSTC_WRAPPER+x}" == "x" ]]; then
    wrapper="${ZOEN_BUILD_RUSTC_WRAPPER}"
  elif [[ "${RUSTC_WRAPPER+x}" == "x" ]]; then
    wrapper="${RUSTC_WRAPPER}"
  elif [[ "${CARGO_BUILD_RUSTC_WRAPPER+x}" == "x" ]]; then
    wrapper="${CARGO_BUILD_RUSTC_WRAPPER}"
  elif command -v kache >/dev/null 2>&1; then
    wrapper="$(command -v kache)"
  fi

  if [[ -n "$wrapper" ]]; then
    local wrapper_version
    wrapper_version="$("$wrapper" --version 2>/dev/null || true)"
    if [[ "$wrapper_version" == kache\ * && "$wrapper_version" != "kache 0.16.0" ]]; then
      echo "Zoen requires kache 0.16.0, found ${wrapper_version}" >&2
      exit 1
    fi
    if [[ "$wrapper_version" == "kache 0.16.0" ]]; then
      echo "building Rust with ${wrapper_version}" >&2
    fi
    CARGO_BUILD_BUILD_DIR="target" CARGO_BUILD_TARGET_DIR="target" \
      CARGO_TARGET_DIR="target" CARGO_BUILD_RUSTC_WRAPPER="$wrapper" \
      CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER="" \
      KACHE_CONFIG="$PWD/.kache.toml" KACHE_LOCAL_ONLY=1 \
      RUSTC_WRAPPER="$wrapper" RUSTC_WORKSPACE_WRAPPER="" \
      cargo build --locked --workspace --target-dir target
  else
    CARGO_BUILD_BUILD_DIR="target" CARGO_BUILD_TARGET_DIR="target" \
      CARGO_TARGET_DIR="target" CARGO_BUILD_RUSTC_WRAPPER="" \
      CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER="" \
      RUSTC_WRAPPER="" RUSTC_WORKSPACE_WRAPPER="" \
      cargo build --locked --workspace --target-dir target
  fi
}

mark_prepared() {
  node dist/e2e/journey-runtime.js mark-prepared >/dev/null
}

run_build_phase() {
  npm ci --prefix apps/auth
  npm run buf:generate
  npm run build
  run_native_build
  mark_prepared
}

run_prepare_phase() {
  run_check
  run_native_build
  mark_prepared
}

release_prepare_lock() {
  local token="$prepare_lock_token"
  if [[ -z "$token" ]]; then
    return
  fi
  prepare_lock_token=""
  node e2e/prepare-lock.mjs release --token "$token"
}

with_prepare_lock() {
  prepare_lock_token="$(node e2e/prepare-lock.mjs acquire --owner-pid "$$")"
  trap release_prepare_lock EXIT
  "$@"
  release_prepare_lock
  trap - EXIT
}

run_build() {
  with_prepare_lock run_build_phase
}

run_prepare() {
  with_prepare_lock run_prepare_phase
}

require_built() {
  if [[ "$scenario" != "public-surface" && ! -x target/debug/zoen ]]; then
    echo "missing target/debug/zoen; run \`just build\` or \`just prepare\`" >&2
    exit 1
  fi
  if [[ ! -f "$runner" || ! -f dist/e2e/journey-runtime.js || ! -f dist/e2e/journey-process-supervisor.js ]]; then
    echo "missing built journey runtime; run \`just build\` or \`just prepare\`" >&2
    exit 1
  fi
  if [[ ! -f .cache/e2e/prepared.json && -z "${ZOEN_E2E_BUILD_MANIFEST:-}" ]]; then
    echo "missing prepared build identity; run \`just build\` or \`just prepare\`" >&2
    exit 1
  fi
  if [[ "$compose_kind" == "compose" && ! -d apps/auth/node_modules/better-auth ]]; then
    echo "missing apps/auth dependencies; run \`just prepare\`" >&2
    exit 1
  fi
}

require_fiscal_live_environment() {
  local required=()
  case "$scenario" in
    fiscal-systax-live)
      required=(ZOEN_FISCAL_LIVE_CONTEXT_PATH ZOEN_SYSTAX_BASE_URL ZOEN_SYSTAX_API_TOKEN)
      ;;
    fiscal-plugnotas-live)
      required=(ZOEN_FISCAL_LIVE_CONTEXT_PATH ZOEN_PLUGNOTAS_BASE_URL ZOEN_PLUGNOTAS_API_KEY)
      ;;
    fiscal-protheus-live)
      required=(ZOEN_FISCAL_LIVE_CONTEXT_PATH ZOEN_PROTHEUS_BASE_URL ZOEN_PROTHEUS_API_TOKEN)
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

new_id() {
  local prefix="$1"
  node -e 'const { randomBytes } = require("node:crypto"); process.stdout.write(`${process.argv[1]}-${Date.now()}-${randomBytes(6).toString("hex")}`)' "$prefix"
}

compose_command() {
  docker compose \
    --project-name "$ZOEN_E2E_COMPOSE_PROJECT" \
    --file "$ZOEN_E2E_COMPOSE_FILE" \
    --file "$ZOEN_E2E_COMPOSE_OVERRIDE" \
    "$@"
}

prepare_compose() {
  local services
  local volumes
  services="$(
    docker compose \
      --project-name "$ZOEN_E2E_COMPOSE_PROJECT" \
      --file "$ZOEN_E2E_COMPOSE_FILE" \
      --profile tools \
      config --services \
      | paste -sd, -
  )"
  volumes="$(
    docker compose \
      --project-name "$ZOEN_E2E_COMPOSE_PROJECT" \
      --file "$ZOEN_E2E_COMPOSE_FILE" \
      --profile tools \
      config --volumes \
      | paste -sd, -
  )"
  node dist/e2e/journey-runtime.js write-compose-override \
    --context "$context_file" \
    --services "$services" \
    --volumes "$volumes"
}

cleanup_scenario() {
  if [[ -z "$context_file" ]]; then
    return
  fi
  node dist/e2e/journey-runtime.js cleanup --context "$context_file"
}

finish_scenario() {
  local original_status="$?"
  local final_status="$original_status"
  trap - EXIT INT TERM
  if [[ -n "$context_file" && "$result_marked" != "true" ]]; then
    node dist/e2e/journey-runtime.js mark-result \
      --context "$context_file" --status failed >/dev/null 2>&1 || true
  fi
  if ! cleanup_scenario; then
    final_status=1
  fi
  exit "$final_status"
}

run_scenario() {
  require_fiscal_live_environment
  if [[ "$compose_kind" == "compose" ]] && ! command -v docker >/dev/null 2>&1; then
    echo "e2e-run requires docker; prepare does not" >&2
    exit 1
  fi
  require_built
  load_scenario_defaults

  local suite_id="${ZOEN_E2E_SUITE_ID:-$(new_id suite)}"
  local run_id="${ZOEN_E2E_RUN_ID:-$(new_id "$scenario")}"
  context_file="$(
    node dist/e2e/journey-runtime.js allocate \
      --scenario "$scenario" \
      --suite-id "$suite_id" \
      --run-id "$run_id" \
      --compose "$([[ "$compose_kind" == "compose" ]] && echo true || echo false)" \
      --exclusive "$([[ "$scenario_class" == "credential" ]] && echo true || echo false)" \
      --owner-pid "$$"
  )"
  # Values originate from a validated context written by journey-runtime.
  eval "$(node dist/e2e/journey-runtime.js shell-env --context "$context_file")"
  result_marked="false"
  trap finish_scenario EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  if [[ -n "${ZOEN_E2E_CONTEXT_POINTER:-}" ]]; then
    node dist/e2e/journey-runtime.js write-pointer \
      --context "$context_file" --output "$ZOEN_E2E_CONTEXT_POINTER"
  fi

  if [[ "$compose_kind" == "compose" ]]; then
    prepare_compose
    if [[ -n "$prepare_realm" ]]; then
      node "$prepare_realm"
    fi
    compose_command up --detach --wait
    if [[ "$minio_kind" == "minio" ]]; then
      compose_command run --rm -T minio-client \
        mb --ignore-existing local/zoen-projections
    fi
  fi

  node dist/e2e/journey-process-supervisor.js --runner "$runner"
  node dist/e2e/journey-runtime.js mark-result \
    --context "$context_file" --status passed
  result_marked="true"
  cleanup_scenario
  context_file=""
  trap - EXIT INT TERM
}

aggregate_contexts() {
  node dist/e2e/journey-runtime.js aggregate \
    --suite-id "$1" --expected-scenarios "$2" --context-list "$3"
}

run_e2e() {
  resolve_scenario "$1"
  require_fiscal_live_environment
  run_prepare
  local suite_id
  suite_id="$(new_id ticket)"
  local suite_root=".cache/e2e/suites/${suite_id}"
  local pointer="${suite_root}/${scenario}.pointer"
  local context_list="${suite_root}/contexts.list"
  mkdir -p "$suite_root"
  ZOEN_E2E_SUITE_ID="$suite_id" \
    ZOEN_E2E_RUN_ID="$(new_id "$scenario")" \
    ZOEN_E2E_CONTEXT_POINTER="$pointer" \
    run_scenario
  printf '%s\n' "$pointer" > "$context_list"
  aggregate_contexts "$suite_id" "$scenario" "$context_list"
}

reap_completed() {
  local reaped="false"
  local index pid weight name
  local remaining_pids=()
  local remaining_weights=()
  local remaining_names=()
  for index in "${!pool_pids[@]}"; do
    pid="${pool_pids[$index]}"
    weight="${pool_weights[$index]}"
    name="${pool_names[$index]}"
    if kill -0 "$pid" 2>/dev/null; then
      remaining_pids+=("$pid")
      remaining_weights+=("$weight")
      remaining_names+=("$name")
      continue
    fi
    reaped="true"
    if ! wait "$pid"; then
      echo "journey ${name} failed" >&2
      suite_failed="true"
    fi
    pool_weight=$((pool_weight - weight))
  done
  pool_pids=("${remaining_pids[@]}")
  pool_weights=("${remaining_weights[@]}")
  pool_names=("${remaining_names[@]}")
  [[ "$reaped" == "true" ]]
}

terminate_pool() {
  trap - EXIT INT TERM
  local pid
  for pid in "${pool_pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${pool_pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

run_parallel_suite() {
  local suite_id="${ZOEN_E2E_SUITE_ID:-$(new_id verify)}"
  local suite_root=".cache/e2e/suites/${suite_id}"
  local context_list="${suite_root}/contexts.list"
  local expected
  expected="$(registry names live | tr ' ' ',')"
  mkdir -p "$suite_root"

  local pool_capacity="${ZOEN_E2E_PARALLEL_WEIGHT:-4}"
  local max_weight
  max_weight="$(registry max-weight live)"
  if [[ ! "$pool_capacity" =~ ^[1-9][0-9]*$ ]]; then
    echo "ZOEN_E2E_PARALLEL_WEIGHT must be a positive integer >= ${max_weight}" >&2
    return 2
  fi
  pool_capacity=$((10#$pool_capacity))
  if (( pool_capacity < max_weight )); then
    echo "ZOEN_E2E_PARALLEL_WEIGHT must be a positive integer >= ${max_weight}" >&2
    return 2
  fi
  pool_weight=0
  suite_failed="false"
  pool_pids=()
  pool_weights=()
  pool_names=()
  local name klass kind weight selected_realm selected_minio
  trap terminate_pool EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  while IFS='|' read -r name klass kind weight selected_realm selected_minio _; do
    if [[ "$klass" != "live" ]]; then
      continue
    fi
    while (( pool_weight + weight > pool_capacity )) && (( ${#pool_pids[@]} > 0 )); do
      if ! reap_completed; then
        sleep 0.1
      fi
    done
    local pointer="${suite_root}/${name}.pointer"
    ZOEN_E2E_SUITE_ID="$suite_id" \
      ZOEN_E2E_RUN_ID="$(new_id "$name")" \
      ZOEN_E2E_CONTEXT_POINTER="$pointer" \
      "${BASH_SOURCE[0]}" run "$name" &
    pool_pids+=("$!")
    pool_weights+=("$weight")
    pool_names+=("$name")
    pool_weight=$((pool_weight + weight))
  done < <(registry rows live)

  while (( ${#pool_pids[@]} > 0 )); do
    if ! reap_completed; then
      sleep 0.1
    fi
  done
  if [[ "$suite_failed" == "true" ]]; then
    return 1
  fi
  : > "$context_list"
  for name in $(registry names live); do
    printf '%s\n' "${suite_root}/${name}.pointer" >> "$context_list"
  done
  aggregate_contexts "$suite_id" "$expected" "$context_list"
  trap - EXIT INT TERM
}

run_verify() {
  run_prepare
  run_parallel_suite
}

run_verify_v1() {
  if [[ ! -f node_modules/typescript/package.json ]]; then
    npm ci
  fi
  npm exec -- tsc -p tsconfig.json --pretty false
  node dist/e2e/verify-v1.js
}

run_verify_activation() {
  if [[ ! -f node_modules/typescript/package.json ]]; then
    npm ci
  fi
  npm exec -- tsc -p tsconfig.json --pretty false
  node dist/e2e/verify-activation.js
}

command="${1:-}"
case "$command" in
  lint) with_prepare_lock run_lint ;;
  clippy) with_prepare_lock run_clippy ;;
  check) with_prepare_lock run_check ;;
  prepare) run_prepare ;;
  build) run_build ;;
  run | e2e-run)
    resolve_scenario "${2:-}"
    run_scenario
    ;;
  e2e) run_e2e "${2:-}" ;;
  parallel | e2e-parallel) run_parallel_suite ;;
  cleanup) node dist/e2e/journey-runtime.js cleanup --context "${2:-}" ;;
  verify) run_verify ;;
  verify-v1) run_verify_v1 ;;
  verify-activation) run_verify_activation ;;
  -h | --help | help | "") usage ;;
  *) run_e2e "$command" ;;
esac
