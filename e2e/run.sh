#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--zoen-script-owner-token" ]]; then
  script_owner_token="$(
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
  )"
  exec /bin/bash "${BASH_SOURCE[0]}" \
    --zoen-script-owner-token "$script_owner_token" "$@"
fi
script_owner_token="${2:-}"
if [[ ! "$script_owner_token" =~ ^[0-9a-f]{64}$ ]]; then
  echo "invalid journey script owner token" >&2
  exit 2
fi
shift 2

if [[ -n "${CARGO_TARGET_DIR:-}" ]]; then
  echo "CARGO_TARGET_DIR is unsupported for journeys; prepared launchables live in target/debug" >&2
  exit 2
fi

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
bootstrap_reader_token=""
suite_reader_token=""
verified_build_identity=""
journey_owner_pid="${ZOEN_E2E_LIFECYCLE_OWNER_PID:-$$}"
journey_owner_nonce="${ZOEN_E2E_LIFECYCLE_OWNER_NONCE:-$script_owner_token}"

registry() {
  node e2e/scenario-registry.mjs "$@"
}

runtime() {
  local runtime_owner_nonce
  runtime_owner_nonce="$(
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
  )"
  node dist/e2e/journey-runtime.js "$@" \
    --runtime-owner-nonce "$runtime_owner_nonce"
}

reader_shim() {
  node e2e/prepare-lock.mjs "$@"
}

verify_prepared_artifacts() {
  local manifest="${ZOEN_E2E_BUILD_MANIFEST:-.cache/e2e/prepared.json}"
  local verifier_arguments=(
    verify
    --repository "$PWD"
    --manifest "$manifest"
  )
  if [[ -n "${ZOEN_E2E_PREPARED_INPUT_SOURCE:-}" ]]; then
    verifier_arguments+=(
      --prepared-input-source "$ZOEN_E2E_PREPARED_INPUT_SOURCE"
    )
  fi
  verified_build_identity="$(
    node e2e/prepared-artifacts.mjs "${verifier_arguments[@]}"
  )"
  if [[ ! "$verified_build_identity" =~ ^[0-9a-f]{64}$ ]]; then
    echo "prepared artifact verifier returned an invalid build identity" >&2
    return 1
  fi
}

acquire_journey_reader() {
  local lease_context="${1:-}"
  local reader_arguments=(
    reader-acquire
    --kind journey
    --owner-pid "$journey_owner_pid"
    --owner-pgid "${ZOEN_E2E_LIFECYCLE_OWNER_PGID:-$journey_owner_pid}"
    --owner-nonce "$journey_owner_nonce"
  )
  if [[ -n "${ZOEN_E2E_LIFECYCLE_GUARDIAN_PID:-}" ]]; then
    reader_arguments+=(--guardian-pid "$ZOEN_E2E_LIFECYCLE_GUARDIAN_PID")
  fi
  if [[ -n "${ZOEN_E2E_SUITE_READER_TOKEN:-}" ]]; then
    reader_arguments+=(--parent-token "$ZOEN_E2E_SUITE_READER_TOKEN")
  fi
  if [[ -n "$lease_context" ]]; then
    reader_arguments+=(--lease-context "$lease_context")
  fi
  bootstrap_reader_token="$(reader_shim "${reader_arguments[@]}")"
}

release_journey_reader() {
  local status=0
  if [[ -z "$bootstrap_reader_token" ]]; then
    return 0
  fi
  reader_shim reader-release \
    --reader-token "$bootstrap_reader_token" \
    --owner-pid "$journey_owner_pid" \
    --owner-nonce "$journey_owner_nonce" || status=$?
  if [[ "$status" -eq 0 ]]; then
    bootstrap_reader_token=""
  fi
  return "$status"
}

acquire_suite_reader() {
  local reader_arguments=(
    reader-acquire
    --kind suite
    --owner-pid "$$"
    --owner-nonce "$script_owner_token"
  )
  if [[ -n "${ZOEN_E2E_SUITE_READER_TOKEN:-}" ]]; then
    reader_arguments+=(--parent-token "$ZOEN_E2E_SUITE_READER_TOKEN")
  fi
  suite_reader_token="$(reader_shim "${reader_arguments[@]}")"
  export ZOEN_E2E_SUITE_READER_TOKEN="$suite_reader_token"
}

release_suite_reader() {
  local status=0
  if [[ -z "$suite_reader_token" ]]; then
    return 0
  fi
  reader_shim reader-release \
    --reader-token "$suite_reader_token" \
    --owner-pid "$$" \
    --owner-nonce "$script_owner_token" || status=$?
  if [[ "$status" -eq 0 ]]; then
    suite_reader_token=""
    unset ZOEN_E2E_SUITE_READER_TOKEN
  fi
  return "$status"
}

usage() {
  echo "usage: just lint | clippy | check | prepare | verify" >&2
  echo "       just build [scenario|all]" >&2
  echo "       just e2e-run <scenario>" >&2
  echo "       just e2e <scenario>" >&2
  echo "       just e2e-parallel" >&2
  echo "       just verify-v1 | verify-activation" >&2
  echo "       ./e2e/run.sh verify-runtime-proof --proof PATH --expected-source SHA" >&2
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
    prepare_realm="dist/e2e/realms/${realm}.mjs"
  fi
}

prepare_fiscal_realms() {
  mkdir -p dist/e2e/realms
  local realm
  while IFS= read -r realm; do
    if [[ ! -f "e2e/${realm}/prepare-realm.mjs" ]]; then
      echo "missing credential realm generator e2e/${realm}/prepare-realm.mjs" >&2
      exit 1
    fi
    install -m 0644 \
      "e2e/${realm}/prepare-realm.mjs" \
      "dist/e2e/realms/${realm}.mjs"
  done < <(
    node -e '
      const scenarios = require("./e2e/scenarios.json");
      for (const scenario of scenarios) {
        if (typeof scenario.realm === "string") process.stdout.write(`${scenario.realm}\n`);
      }
    '
  )
}

run_lint() {
  if [[ ! -s apps/conversation/agent/instructions.md ]]; then
    echo "apps/conversation/agent/instructions.md is required for eve build" >&2
    exit 1
  fi
  npm ci
  npm ci --prefix apps/auth
  npm run build --prefix apps/auth
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
  prepare_fiscal_realms
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
  if [[ -z "${ZOEN_E2E_PREPARE_OWNER_PID:-}" || -z "${ZOEN_E2E_PREPARE_OWNER_NONCE:-}" ]]; then
    echo "mark-prepared requires the active shared preparation writer" >&2
    exit 1
  fi
  runtime mark-prepared \
    --writer-pid "$ZOEN_E2E_PREPARE_OWNER_PID" \
    --writer-nonce "$ZOEN_E2E_PREPARE_OWNER_NONCE" >/dev/null
}

prepare_fiscal_archive() {
  local fiscal_tsconfig="archive/domain/fiscal-brazil/tsconfig.json"
  if [[ -f "$fiscal_tsconfig" ]]; then
    node node_modules/typescript/bin/tsc \
      -p "$fiscal_tsconfig" --pretty false
  fi
}

run_build_phase() {
  npm ci --prefix apps/auth
  npm run build --prefix apps/auth
  npm run buf:generate
  npm run build
  prepare_fiscal_realms
  prepare_fiscal_archive
  run_native_build
  mark_prepared
}

run_prepare_phase() {
  run_check
  prepare_fiscal_archive
  run_native_build
  mark_prepared
}

run_coverage_build_phase() {
  npm run build
  npm run build --prefix apps/auth
  prepare_fiscal_realms
  prepare_fiscal_archive
  cargo build --locked --workspace
  mark_prepared
}

with_prepare_lock() {
  local phase="$1"
  node e2e/prepare-lock.mjs run -- \
    "${BASH_SOURCE[0]}" "_${phase}-body"
}

run_build() {
  with_prepare_lock build
}

run_prepare() {
  with_prepare_lock prepare
}

require_built() {
  if [[ "$scenario" != "public-surface" && ! -x target/debug/zoen ]]; then
    echo "missing target/debug/zoen; run \`just build\` or \`just prepare\`" >&2
    exit 1
  fi
  if [[ ! -f "$runner" || ! -f dist/e2e/journey-runtime.js || ! -f dist/e2e/journey-scenario-executor.js || ! -f dist/e2e/journey-pool.js ]]; then
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
  if [[ "$compose_kind" == "compose" ]] && \
    { [[ ! -f apps/auth/dist/auth.mjs ]] || [[ ! -f apps/auth/dist/server.mjs ]]; }; then
    echo "missing prepared Auth JavaScript; run \`just prepare\`" >&2
    exit 1
  fi
  if [[ "$scenario_class" == "credential" && ! -f dist/archive/domain/fiscal-brazil/src/adapter/main.js ]]; then
    echo "missing prepared fiscal adapter JavaScript; check out the archive and run \`just prepare\`" >&2
    exit 1
  fi
  if [[ -n "$prepare_realm" && ! -f "$prepare_realm" ]]; then
    echo "missing prepared credential realm generator ${prepare_realm}; run \`just prepare\`" >&2
    exit 1
  fi
  verify_prepared_artifacts
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

cleanup_scenario() {
  if [[ -z "$context_file" ]]; then
    return
  fi
  runtime cleanup --context "$context_file" \
    --caller-pid "$$" --caller-nonce "$script_owner_token"
}

finish_scenario() {
  local original_status="$?"
  local final_status="$original_status"
  trap - EXIT INT TERM
  if [[ -n "$context_file" && "$result_marked" != "true" ]]; then
    runtime mark-result \
      --context "$context_file" --status failed >/dev/null 2>&1 || true
  fi
  if ! release_journey_reader; then
    final_status=1
  fi
  exit "$final_status"
}

run_scenario() {
  if [[ "${ZOEN_E2E_EXTERNAL_LIFECYCLE:-}" != "1" ]]; then
    echo "internal journey execution requires its source lifecycle authority" >&2
    exit 2
  fi
  require_fiscal_live_environment
  if [[ "$compose_kind" == "compose" ]] && ! command -v docker >/dev/null 2>&1; then
    echo "e2e-run requires docker; prepare does not" >&2
    exit 1
  fi
  acquire_journey_reader
  result_marked="false"
  trap finish_scenario EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  require_built
  local suite_id="${ZOEN_E2E_SUITE_ID:-$(new_id suite)}"
  local run_id="${ZOEN_E2E_RUN_ID:-$(new_id "$scenario")}"
  context_file="$(
    runtime allocate \
      --scenario "$scenario" \
      --suite-id "$suite_id" \
      --run-id "$run_id" \
      --compose "$([[ "$compose_kind" == "compose" ]] && echo true || echo false)" \
      --exclusive "$([[ "$scenario_class" == "credential" ]] && echo true || echo false)" \
      --owner-pid "$journey_owner_pid" \
      --owner-pgid "${ZOEN_E2E_LIFECYCLE_OWNER_PGID:?}" \
      --owner-guardian-pid "${ZOEN_E2E_LIFECYCLE_GUARDIAN_PID:?}" \
      --owner-nonce "$journey_owner_nonce" \
      --verified-build-identity "$verified_build_identity" \
      --reader-token "$bootstrap_reader_token"
  )"
  bootstrap_reader_token=""
  # Values originate from a validated context written by journey-runtime.
  eval "$(runtime shell-env --context "$context_file")"

  if ! printf '%s\n' "$context_file" >&3; then
    echo "could not publish the canonical journey context to its source authority" >&2
    exit 1
  fi
  local authority_ack=""
  if ! IFS= read -r authority_ack <&4 || [[ "$authority_ack" != "accepted" ]]; then
    echo "journey source authority did not accept its canonical context" >&2
    exit 1
  fi
  exec 3>&- 4<&-
  verify_prepared_artifacts
  if [[ "$verified_build_identity" != "$ZOEN_E2E_BUILD_IDENTITY" ]]; then
    echo "prepared build changed between allocation and execution" >&2
    exit 1
  fi

  if [[ -n "${ZOEN_E2E_CONTEXT_POINTER:-}" ]]; then
    runtime write-pointer \
      --context "$context_file" --output "$ZOEN_E2E_CONTEXT_POINTER"
  fi

  reader_shim journey-publish \
    --context "$context_file" \
    --owner-pgid "${ZOEN_E2E_LIFECYCLE_OWNER_PGID:?}" \
    --leader-pid "${ZOEN_E2E_LIFECYCLE_LEADER_PID:?}" \
    --guardian-pid "${ZOEN_E2E_LIFECYCLE_GUARDIAN_PID:?}" \
    --owner-nonce "$journey_owner_nonce"

  ZOEN_E2E_PREPARE_REALM="$prepare_realm" \
    ZOEN_E2E_MINIO_KIND="$minio_kind" \
    node dist/e2e/journey-scenario-executor.js
  runtime mark-result \
    --context "$context_file" --status passed
  result_marked="true"
  trap - EXIT INT TERM
}

run_journey_controller() {
  resolve_scenario "$1"
  require_fiscal_live_environment
  exec node e2e/prepare-lock.mjs journey-run \
    --owner-nonce "$script_owner_token" \
    --scenario "$scenario"
}

aggregate_contexts() {
  acquire_journey_reader
  verify_prepared_artifacts
  exec node dist/e2e/journey-runtime.js aggregate \
    --suite-id "$1" \
    --expected-scenarios "$2" \
    --context-list "$3" \
    --reader-token "$bootstrap_reader_token" \
    --reader-owner-pid "$$" \
    --reader-owner-nonce "$script_owner_token" \
    --release-reader-token "$bootstrap_reader_token" \
    --runtime-owner-nonce "$script_owner_token"
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
  acquire_suite_reader
  trap release_suite_reader EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  ZOEN_E2E_SUITE_ID="$suite_id" \
    ZOEN_E2E_RUN_ID="$(new_id "$scenario")" \
    ZOEN_E2E_CONTEXT_POINTER="$pointer" \
    /bin/bash "${BASH_SOURCE[0]}" run "$scenario"
  printf '%s\n' "$pointer" > "$context_list"
  /bin/bash "${BASH_SOURCE[0]}" aggregate \
    "$suite_id" "$scenario" "$context_list"
  release_suite_reader
  trap - EXIT INT TERM
}

run_parallel_suite() {
  acquire_suite_reader
  verify_prepared_artifacts
  exec node dist/e2e/journey-pool.js \
    --zoen-suite-reader-token "$suite_reader_token" \
    --zoen-suite-owner-nonce "$script_owner_token" \
    -- "$@"
}

cleanup_context() {
  acquire_journey_reader "$1"
  exec node dist/e2e/journey-runtime.js cleanup \
    --context "$1" \
    --caller-pid "$$" --caller-nonce "$script_owner_token" \
    --release-reader-token "$bootstrap_reader_token" \
    --runtime-owner-nonce "$script_owner_token"
}

reconcile_runtime() {
  acquire_journey_reader
  exec node dist/e2e/journey-runtime.js reconcile \
    --release-reader-token "$bootstrap_reader_token" \
    --runtime-owner-nonce "$script_owner_token"
}

resolve_context_pointer() {
  acquire_journey_reader
  verify_prepared_artifacts
  exec node dist/e2e/journey-runtime.js resolve-pointer \
    --pointer "$1" \
    --release-reader-token "$bootstrap_reader_token" \
    --runtime-owner-nonce "$script_owner_token"
}

run_verify() {
  run_prepare
  run_parallel_suite
}

run_verify_v1() {
  run_read_only_verifier dist/e2e/verify-v1.js
}

run_verify_activation() {
  run_read_only_verifier dist/e2e/verify-activation.js
}

run_read_only_verifier() {
  local verifier="$1"
  acquire_journey_reader
  local status=0
  if [[ ! -f "$verifier" ]]; then
    echo "missing prepared verifier ${verifier}; run \`just prepare\`" >&2
    status=1
  else
    verify_prepared_artifacts
    exec node "$verifier" \
      --zoen-reader-token "$bootstrap_reader_token" \
      --zoen-reader-owner-nonce "$script_owner_token"
  fi
  release_journey_reader
  return "$status"
}

run_runtime_proof() {
  local proof_run_id="${ZOEN_E2E_PROOF_RUN_ID:-$(new_id runtime-proof)}"
  local proof_root
  proof_root="$(
    reader_shim create-runtime-proof-root --proof-run-id "$proof_run_id"
  )"
  local crash_proof="${proof_root}/prepare-crash-proof.json"
  reader_shim proof-crash-recovery --output "$crash_proof" >&2
  acquire_suite_reader
  verify_prepared_artifacts
  ZOEN_E2E_PREPARE_CRASH_PROOF="$crash_proof" \
    ZOEN_E2E_PROOF_RUN_ID="$proof_run_id" \
    exec node dist/e2e/journey-runtime-proof.js \
    --zoen-proof-reader-token "$suite_reader_token" \
    --zoen-proof-owner-nonce "$script_owner_token"
}

run_runtime_proof_verifier() {
  acquire_journey_reader
  local status=0
  if verify_prepared_artifacts; then
    trap 'release_journey_reader' EXIT
    exec node dist/e2e/verify-journey-runtime-proof.js "$@" \
      --zoen-reader-token "$bootstrap_reader_token" \
      --zoen-reader-owner-nonce "$script_owner_token"
  else
    status=$?
  fi
  local release_status=0
  if release_journey_reader; then
    :
  else
    release_status=$?
    if [[ "$status" -eq 0 ]]; then
      status="$release_status"
    fi
  fi
  return "$status"
}

command="${1:-}"
case "$command" in
  lint) with_prepare_lock lint ;;
  clippy) with_prepare_lock clippy ;;
  check) with_prepare_lock check ;;
  prepare) run_prepare ;;
  build) run_build ;;
  run | e2e-run)
    run_journey_controller "${2:-}"
    ;;
  _run-owned)
    resolve_scenario "${2:-}"
    run_scenario
    ;;
  e2e) run_e2e "${2:-}" ;;
  parallel | e2e-parallel)
    shift
    run_parallel_suite "$@"
    ;;
  aggregate) aggregate_contexts "${2:-}" "${3:-}" "${4:-}" ;;
  cleanup) cleanup_context "${2:-}" ;;
  reconcile) reconcile_runtime ;;
  resolve-pointer) resolve_context_pointer "${2:-}" ;;
  verify) run_verify ;;
  runtime-proof) run_runtime_proof ;;
  verify-runtime-proof)
    shift
    run_runtime_proof_verifier "$@"
    ;;
  verify-v1) run_verify_v1 ;;
  verify-activation) run_verify_activation ;;
  coverage-build) with_prepare_lock coverage ;;
  _lint-body | _clippy-body | _check-body | _prepare-body | _build-body | _coverage-body)
    if [[ -z "${ZOEN_E2E_PREPARE_OWNER_PID:-}" || -z "${ZOEN_E2E_PREPARE_OWNER_NONCE:-}" ]]; then
      echo "internal preparation phase requires the shared writer" >&2
      exit 2
    fi
    case "$command" in
      _lint-body) run_lint ;;
      _clippy-body) run_clippy ;;
      _check-body) run_check ;;
      _prepare-body) run_prepare_phase ;;
      _build-body) run_build_phase ;;
      _coverage-body) run_coverage_build_phase ;;
    esac
    ;;
  -h | --help | help | "") usage ;;
  *) run_e2e "$command" ;;
esac
