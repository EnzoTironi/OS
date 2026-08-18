#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OS="$ROOT/os"
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
if git -C "$ROOT/../../.." rev-parse HEAD >/dev/null 2>&1; then
  echo "SHA=$(git -C "$ROOT/../../.." rev-parse HEAD)"
else
  echo "SHA=unknown"
fi
"$OS" --help
"$OS" scenario --help
"$OS" scenario run --help
"$OS" explain --help
"$OS" query --help
"$OS" scenario run v001 --output json
"$OS" scenario run v001 --engine ontology --output json
"$OS" explain v001:operation:purchase-raw-1 --output json
"$OS" query known-then --scenario v001 --subject stock:sku-x --predicate available-quantity --valid-at 2030-08-10 --known-at kr:before-late-document --output json
"$OS" query now-believed-for-then --scenario v001 --subject stock:sku-x --predicate available-quantity --valid-at 2030-08-10 --output json
