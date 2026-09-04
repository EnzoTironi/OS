#!/usr/bin/env bash
set -euo pipefail

# Ticket command stays `just e2e <scenario>` (check + native build + run).
# `just verify` runs check and native build once, then each scenario runner.
# scenario_table fields: name:realm:variant:class
# class is live | credential | image.
# dest live leaves realm empty. Credential fiscal realm still runs prepare-realm.mjs.
# just verify runs only class=live. Credential fiscal stays optional.
# class=image is the one-Fly Dockerfile journey; required CI builds and runs it.
# `just verify-v1` aggregates typed artifacts into a signed zoen.verify.v1 bundle.
# `just verify-activation` aggregates AD artifacts into a signed zoen.activation.v1 bundle.
# `just e2e-run` executes a built workspace and does not lint.
# Each scenario loads `e2e/<scenario>/.env` so Compose, zoend, and artifacts
# never share host ports or generated files with another scenario.

scenario_table=(
  "activation-identity:::live"
  "messaging-boundary:::live"
  "bound-conversation:::live"
  "definition-publication:::live"
  "cedar-object-projection:::live"
  "commercial-identity:::live"
  "cursor-security:::live"
  "dirty-quote:::live"
  "durable-commit:::live"
  "evolution-breaking:::live"
  "evolution-compatible:::live"
  "effect-runtime:::live"
  "explain:::live"
  "fiscal-systax-live:fiscal-systax-live::credential"
  "fiscal-plugnotas-live:fiscal-plugnotas-live::credential"
  "fiscal-protheus-live:fiscal-protheus-live::credential"
  "governed-action:::live"
  "public-surface:::live"
  "world-release:::live"
  "agent-parity:::live"
  "governed-clinic:::live"
  "object-key:::live"
  "cli-dest:::live"
  "semantic-query:::live"
  "wasm-code-mode:::live"
  "one-fly-image:::image"
)

scenario=""
compose_file=""
project=""
runner=""
generated_directory=""
prepare=""
runner_pid=""
runner_process_group=""
pending_signal_status=""
scenario_ports=()
cleanup_in_progress=0

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
  [[ "$scenario" == "public-surface" ]]
}

load_scenario_env() {
  local env_file="e2e/${scenario}/.env"
  local key
  export ZOEN_E2E_ARTIFACTS_DIR="artifacts/${scenario}"
  export ZOEN_E2E_GENERATED_DIR="e2e/${scenario}/.generated"
  generated_directory="${ZOEN_E2E_GENERATED_DIR}"
  scenario_ports=()
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
  while IFS='=' read -r key _; do
    if [[ "$key" == ZOEN_E2E_*_PORT ]]; then
      scenario_ports+=("${!key}")
    fi
  done < "$env_file"
  if [[ -n "${ZOEN_E2E_AUTH_PORT:-}" ]]; then
    export ZOEN_AUTH_BASE_URL="http://127.0.0.1:${ZOEN_E2E_AUTH_PORT}"
  fi
  if [[ "$scenario" == "one-fly-image" ]]; then
    export ZOEN_BUILD_REVISION="${ZOEN_BUILD_REVISION:-$(git rev-parse HEAD)}"
  fi
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
  npm ci
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

install_auth_dependencies() {
  npm ci --ignore-scripts --prefix apps/auth
}

run_build() {
  npm run buf:generate
  npm run build
  install_auth_dependencies
  run_native_build
}

require_built() {
  if [[ "$scenario" != "public-surface" && "$scenario" != "one-fly-image" && ! -x target/debug/zoen ]]; then
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

record_signal() {
  if [[ -z "$pending_signal_status" ]]; then
    pending_signal_status="$1"
  fi
  if ((cleanup_in_progress == 0)) && [[ -n "$runner_process_group" ]]; then
    kill -TERM -- "-${runner_process_group}" 2>/dev/null || true
  fi
}

stop_runner_process_group() {
  local process_group="${runner_process_group:-}"
  local process_id="${runner_pid:-}"
  local attempt
  if [[ -z "$process_group" ]]; then
    return 0
  fi
  kill -TERM -- "-${process_group}" 2>/dev/null || true
  for ((attempt = 0; attempt < 50; attempt += 1)); do
    if ! kill -0 -- "-${process_group}" 2>/dev/null; then
      if [[ -n "$process_id" ]]; then
        wait "$process_id" 2>/dev/null || true
      fi
      runner_pid=""
      runner_process_group=""
      return 0
    fi
    sleep 0.1
  done
  kill -KILL -- "-${process_group}" 2>/dev/null || true
  if [[ -n "$process_id" ]]; then
    wait "$process_id" 2>/dev/null || true
  fi
  for ((attempt = 0; attempt < 50; attempt += 1)); do
    if ! kill -0 -- "-${process_group}" 2>/dev/null; then
      runner_pid=""
      runner_process_group=""
      return 0
    fi
    sleep 0.1
  done
  echo "journey process group ${process_group} survived cleanup" >&2
  return 1
}

run_journey() {
  local observed_process_group
  local runner_status
  if [[ -n "$pending_signal_status" ]]; then
    return "$pending_signal_status"
  fi
  set -m
  ZOEN_E2E_RUNNER_PROCESS_GROUP=1 node "$runner" &
  runner_pid=$!
  runner_process_group="$runner_pid"
  set +m
  observed_process_group="$(
    ps -o pgid= -p "$runner_pid" 2>/dev/null | tr -d '[:space:]' || true
  )"
  if [[ -z "$observed_process_group" ]]; then
    if wait "$runner_pid"; then
      runner_status=0
    else
      runner_status=$?
    fi
    if [[ -n "$pending_signal_status" ]]; then
      runner_status="$pending_signal_status"
    fi
    stop_runner_process_group || return 1
    return "$runner_status"
  fi
  if [[ "$observed_process_group" != "$runner_process_group" ]]; then
    kill -TERM "$runner_pid" 2>/dev/null || true
    wait "$runner_pid" 2>/dev/null || true
    runner_pid=""
    runner_process_group=""
    echo "failed to isolate journey process group" >&2
    return 1
  fi
  if [[ -n "$pending_signal_status" ]]; then
    runner_status="$pending_signal_status"
    stop_runner_process_group || return 1
    return "$runner_status"
  fi
  if wait "$runner_pid"; then
    runner_status=0
  else
    runner_status=$?
  fi
  if [[ -n "$pending_signal_status" ]]; then
    runner_status="$pending_signal_status"
  fi
  stop_runner_process_group || return 1
  return "$runner_status"
}

port_in_use() {
  node -e '
    const { createConnection } = require("node:net");
    const port = Number(process.argv[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.exit(2);
    }
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (status) => {
      socket.destroy();
      process.exit(status);
    };
    socket.once("connect", () => finish(0));
    socket.once("error", (error) => finish(error.code === "ECONNREFUSED" ? 42 : 2));
    socket.setTimeout(500, () => finish(2));
  ' "$1"
}

scenario_is_clean() {
  local port
  local port_status
  local resource_ids
  if [[ -n "$runner_process_group" ]] \
    && kill -0 -- "-${runner_process_group}" 2>/dev/null; then
    return 1
  fi
  if ! no_compose_scenario; then
    if ! resource_ids="$(docker ps -aq --filter "label=com.docker.compose.project=${project}")" \
      || [[ -n "$resource_ids" ]]; then
      return 1
    fi
    if ! resource_ids="$(docker network ls -q --filter "label=com.docker.compose.project=${project}")" \
      || [[ -n "$resource_ids" ]]; then
      return 1
    fi
    if ! resource_ids="$(docker volume ls -q --filter "label=com.docker.compose.project=${project}")" \
      || [[ -n "$resource_ids" ]]; then
      return 1
    fi
  fi
  if [[ -n "$generated_directory" && -e "$generated_directory" ]]; then
    return 1
  fi
  if ((${#scenario_ports[@]} > 0)); then
    for port in "${scenario_ports[@]}"; do
      if port_in_use "$port"; then
        return 1
      else
        port_status=$?
        if ((port_status != 42)); then
          return 1
        fi
      fi
    done
  fi
  return 0
}

cleanup_scenario() {
  local attempt
  local cleanup_verified=0
  local generated_cleanup_status=0
  local project_cleanup_status=0
  local runner_cleanup_status=0
  if ((cleanup_in_progress != 0)); then
    echo "${scenario} cleanup re-entry blocked" >&2
    return 1
  fi
  cleanup_in_progress=1
  if ! stop_runner_process_group; then
    runner_cleanup_status=1
  fi
  if ! no_compose_scenario; then
    project_cleanup_status=1
  fi
  for ((attempt = 0; attempt < 50; attempt += 1)); do
    if ! no_compose_scenario && ((attempt % 10 == 0)); then
      if docker compose --project-name "$project" --file "$compose_file" \
        down --timeout 5 --volumes --remove-orphans; then
        project_cleanup_status=0
      else
        project_cleanup_status=1
      fi
    fi
    if [[ -n "$generated_directory" ]]; then
      if rm -rf "$generated_directory"; then
        generated_cleanup_status=0
      else
        generated_cleanup_status=1
      fi
    fi
    if ((runner_cleanup_status == 0 && project_cleanup_status == 0 \
      && generated_cleanup_status == 0)) && scenario_is_clean; then
      cleanup_verified=1
      break
    fi
    sleep 0.1
  done
  cleanup_in_progress=0
  if ((runner_cleanup_status != 0 || project_cleanup_status != 0 \
    || generated_cleanup_status != 0)); then
    echo "${scenario} cleanup command failed" >&2
    return 1
  fi
  if ((cleanup_verified == 0)); then
    echo "${scenario} cleanup did not converge" >&2
    if [[ -n "$generated_directory" && -e "$generated_directory" ]]; then
      echo "generated directory remains: ${generated_directory}" >&2
    fi
    if ((${#scenario_ports[@]} > 0)); then
      local leftover_port
      for leftover_port in "${scenario_ports[@]}"; do
        if port_in_use "$leftover_port"; then
          echo "port ${leftover_port} is still in use" >&2
        fi
      done
    fi
    return 1
  fi
  return 0
}

cleanup_on_exit() {
  local original_status=$?
  local cleanup_status
  trap - EXIT
  if cleanup_scenario; then
    cleanup_status=0
  else
    cleanup_status=$?
  fi
  trap - INT TERM
  if ((cleanup_status != 0)); then
    exit 1
  fi
  if [[ -n "$pending_signal_status" ]]; then
    exit "$pending_signal_status"
  fi
  exit "$original_status"
}

finish_scenario() {
  local runner_status="$1"
  local cleanup_status
  trap - EXIT
  if cleanup_scenario; then
    cleanup_status=0
  else
    cleanup_status=$?
  fi
  trap - INT TERM
  if [[ -n "$pending_signal_status" ]]; then
    runner_status="$pending_signal_status"
  fi
  if ((cleanup_status != 0)); then
    return 1
  fi
  return "$runner_status"
}

run_scenario() {
  local cleanup_status
  local runner_status
  pending_signal_status=""
  cleanup_in_progress=0
  require_fiscal_live_environment
  if ! no_compose_scenario && ! command -v docker >/dev/null 2>&1; then
    echo "e2e-run requires docker; check/build do not" >&2
    exit 1
  fi
  require_built
  trap cleanup_on_exit EXIT
  trap 'record_signal 130' INT
  trap 'record_signal 143' TERM
  if cleanup_scenario; then
    cleanup_status=0
  else
    cleanup_status=$?
  fi
  if ((cleanup_status != 0)); then
    trap - EXIT INT TERM
    return 1
  fi
  if [[ -n "$pending_signal_status" ]]; then
    if finish_scenario "$pending_signal_status"; then
      return 0
    else
      return $?
    fi
  fi
  mkdir -p "${ZOEN_E2E_ARTIFACTS_DIR}"
  if no_compose_scenario; then
    if run_journey; then
      runner_status=0
    else
      runner_status=$?
    fi
    if finish_scenario "$runner_status"; then
      return 0
    else
      return $?
    fi
  fi
  mkdir -p "$generated_directory"
  if [[ -n "$prepare" ]]; then
    node "$prepare"
  fi
  if [[ -n "$pending_signal_status" ]]; then
    if finish_scenario "$pending_signal_status"; then
      return 0
    else
      return $?
    fi
  fi
  docker compose --project-name "$project" --file "$compose_file" up --detach --wait
  if run_journey; then
    runner_status=0
  else
    runner_status=$?
  fi
  if finish_scenario "$runner_status"; then
    return 0
  else
    return $?
  fi
}

run_e2e() {
  resolve_scenario "$1"
  require_fiscal_live_environment
  rm -rf "${ZOEN_E2E_ARTIFACTS_DIR}"
  run_check
  install_auth_dependencies
  if [[ "$scenario" != "one-fly-image" ]]; then
    run_native_build
  fi
  run_scenario
}

run_verify() {
  rm -rf artifacts
  run_check
  install_auth_dependencies
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
