#!/usr/bin/env bash
set -euo pipefail

migration="${1:?migration file is required}"
namespace="${2:?namespace is required}"

if ! grep -q -- "-- zoen:breaking" "${migration}"; then
  exit 0
fi

ready="$(
  kubectl --namespace "${namespace}" get deployment zoend \
    --output jsonpath='{.status.readyReplicas}'
)"
generations="$(
  kubectl --namespace "${namespace}" get replicaset \
    --selector app.kubernetes.io/name=zoend \
    --output jsonpath='{range .items[*]}{.status.readyReplicas}{"\n"}{end}' |
    awk '$1+0 > 0 { count += 1 } END { print count+0 }'
)"
if [[ "${ready}" -ge 2 || "${generations}" -ge 2 ]]; then
  echo "refusing -- zoen:breaking migration while an old zoend replica is still Ready" >&2
  exit 1
fi
