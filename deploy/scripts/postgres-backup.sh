#!/usr/bin/env bash
set -euo pipefail

namespace="${1:?namespace is required}"
classification="${2:?state classification file is required}"

primary="$(
  kubectl --namespace "${namespace}" get pod \
    --selector 'app.kubernetes.io/name=postgres,zoen.dev/postgres-role=primary' \
    --output jsonpath='{.items[0].metadata.name}'
)"
if [[ -z "${primary}" ]]; then
  echo "no postgres primary is available in ${namespace}" >&2
  exit 1
fi

kubectl --namespace "${namespace}" exec "${primary}" -- /wal-g/wal-g backup-push
kubectl --namespace "${namespace}" exec "${primary}" -- \
  psql -U postgres -d zoen -c "SELECT pg_switch_wal();"

node --input-type=module -e '
  import { readFile } from "node:fs/promises";
  import { parse } from "yaml";
  const classification = parse(await readFile(process.argv[1], "utf8"));
  const tables = classification.authority?.postgresTables;
  if (!Array.isArray(tables) || tables.length === 0) process.exit(1);
  process.stdout.write(tables.join("\n"));
' "${classification}" |
  while IFS= read -r table; do
    [[ -z "${table}" ]] && continue
    exists="$(
      kubectl --namespace "${namespace}" exec "${primary}" -- \
        psql -U postgres -d zoen -At -c "SELECT to_regclass('public.${table}') IS NOT NULL;"
    )"
    if [[ "${exists}" != "t" ]]; then
      echo "authority table ${table} is classified but missing from postgres" >&2
      exit 1
    fi
  done
