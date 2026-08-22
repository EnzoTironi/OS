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

node --input-type=module -e '
  import { readFile } from "node:fs/promises";
  import { parse } from "yaml";
  const classification = parse(await readFile(process.argv[1], "utf8"));
  const tables = [
    ...(classification.authority?.postgresTables ?? []),
    ...(classification.authority?.referenceTables ?? []),
  ];
  if (tables.length === 0) process.exit(1);
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

kubectl --namespace "${namespace}" exec "${primary}" -- \
  env PGUSER=postgres PGDATABASE=zoen PGHOST=/var/run/postgresql \
  /wal-g/wal-g backup-push
kubectl --namespace "${namespace}" exec "${primary}" -- \
  psql -U postgres -d zoen -c "SELECT pg_switch_wal();"

sequence="$(
  kubectl --namespace "${namespace}" exec "${primary}" -- \
    psql -U postgres -d zoen -At -c \
    "SELECT coalesce(max(commit_sequence), 0)::text FROM authority_commits;"
)"
if [[ -z "${sequence}" ]]; then
  echo "backup could not read authority commit sequence" >&2
  exit 1
fi
printf '%s\n' "${sequence}"
if [[ -n "${ZOEN_E2E_ARTIFACTS_DIR:-}" ]]; then
  printf '%s\n' "${sequence}" >"${ZOEN_E2E_ARTIFACTS_DIR}/backup-commit-sequence.txt"
fi
