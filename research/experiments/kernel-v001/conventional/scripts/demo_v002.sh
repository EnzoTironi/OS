#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPERIMENT="$(cd "${ROOT}/.." && pwd)"
SHA="${HEAD_SHA:-unknown}"
echo "SHA=${SHA}"
echo "HEAD=${SHA}"
echo "os scenario run v002 --output json"
"${ROOT}/os" scenario run v002 --output json
echo "ontology os scenario run v002 --output json"
"${EXPERIMENT}/os" scenario run v002 --output json
echo "os explain v002:operation:quarantine-lot-1 --output json"
"${ROOT}/os" explain v002:operation:quarantine-lot-1 --output json
echo "known-then"
"${ROOT}/os" query known-then --scenario v002 --subject lot:lot-q-1 --predicate measurement --valid-at 2030-08-10 --known-at kr:before-late-calibration --output json
echo "now-believed-for-then"
"${ROOT}/os" query now-believed-for-then --scenario v002 --subject lot:lot-q-1 --predicate measurement --valid-at 2030-08-10 --output json
