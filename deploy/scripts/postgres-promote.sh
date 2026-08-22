#!/usr/bin/env bash
set -euo pipefail

namespace="${1:?namespace is required}"

replica="$(
  kubectl --namespace "${namespace}" get pod \
    --selector zoen.dev/postgres-role=replica \
    --output jsonpath='{.items[0].metadata.name}'
)"
if [[ -z "${replica}" ]]; then
  echo "no postgres replica is available in ${namespace}" >&2
  exit 1
fi

kubectl --namespace "${namespace}" exec "${replica}" -- \
  psql -U postgres -d zoen -c "SELECT pg_promote();"

recovery="t"
for _ in $(seq 1 60); do
  recovery="$(
    kubectl --namespace "${namespace}" exec "${replica}" -- \
      psql -U postgres -d zoen -At -c "SELECT pg_is_in_recovery();"
  )"
  if [[ "${recovery}" == "f" ]]; then
    break
  fi
  sleep 2
done
if [[ "${recovery}" != "f" ]]; then
  echo "postgres replica ${replica} did not leave recovery" >&2
  exit 1
fi

kubectl --namespace "${namespace}" label pod "${replica}" \
  zoen.dev/postgres-role=primary --overwrite
kubectl --namespace "${namespace}" create configmap zoen-postgres-ha \
  --from-literal=primary="${replica}" \
  --dry-run=client \
  --output yaml |
  kubectl apply --filename -

if kubectl --namespace "${namespace}" get statefulset postgres >/dev/null 2>&1; then
  kubectl --namespace "${namespace}" scale statefulset postgres --replicas=0
fi

for _ in $(seq 1 60); do
  address="$(
    kubectl --namespace "${namespace}" get endpoints postgres \
      --output jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null || true
  )"
  if [[ -n "${address}" ]]; then
    exit 0
  fi
  sleep 2
done

echo "postgres Service has no primary endpoints after promotion" >&2
exit 1
