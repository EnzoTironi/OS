#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="${HEAD_SHA:-unknown}"
echo "SHA=${SHA}"
echo "HEAD=${SHA}"
echo "os scenario run v001 --output json"
"${ROOT}/os" scenario run v001 --output json
echo "os explain v001:operation:purchase-raw-1 --output json"
"${ROOT}/os" explain v001:operation:purchase-raw-1 --output json
echo "known-then"
"${ROOT}/os" query known-then --scenario v001 --subject stock:sku-x --predicate available-quantity --valid-at 2030-08-10 --known-at kr:before-late-document --output json
echo "now-believed-for-then"
"${ROOT}/os" query now-believed-for-then --scenario v001 --subject stock:sku-x --predicate available-quantity --valid-at 2030-08-10 --output json
