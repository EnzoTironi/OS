#!/usr/bin/env bash
set -euo pipefail

scenario_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guest_directory="${scenario_directory}/guest"
target_directory="${guest_directory}/target"
core_module="${target_directory}/wasm32-unknown-unknown/release/zoen_code_mode_fixture.wasm"

CARGO_TARGET_DIR="${target_directory}" cargo build \
  --locked \
  --manifest-path "${guest_directory}/Cargo.toml" \
  --release \
  --target wasm32-unknown-unknown \
  --lib
CARGO_TARGET_DIR="${target_directory}" cargo run \
  --locked \
  --manifest-path "${guest_directory}/Cargo.toml" \
  --release \
  --bin build-fixtures \
  -- \
  "${core_module}" \
  "${scenario_directory}/fixtures"
