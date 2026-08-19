#!/usr/bin/env bash
set -euo pipefail

# Warm node_modules, generated protobuf/TS, and cargo target/ so a Cloud
# Agent snapshot can `just check` / `just e2e-run` without a cold DataFusion
# compile. Tests stay out of this script: they belong to `just lint`.

cd "$(dirname "$0")/.."

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required; install the toolchain in rust-toolchain.toml" >&2
  exit 1
fi

npm ci
npm exec -- buf generate
npm run build
cargo build --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
