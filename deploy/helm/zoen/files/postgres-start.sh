#!/bin/bash
set -euo pipefail

: "${PGDATA:=/var/lib/postgresql/18/docker}"
: "${POSTGRES_ROLE:=primary}"
POD_NAME="${POD_NAME:-$(hostname)}"

if [[ -f /ha/primary ]]; then
  designated="$(tr -d '[:space:]' </ha/primary)"
  if [[ -n "${designated}" && "${POD_NAME}" == "${designated}" ]]; then
    POSTGRES_ROLE=primary
  elif [[ -n "${designated}" ]]; then
    POSTGRES_ROLE=replica
  fi
fi

replication_gucs=(
  -c wal_level=replica
  -c max_wal_senders=16
  -c max_replication_slots=16
  -c hot_standby=on
  -c listen_addresses=*
)

append_hba() {
  local hba="${PGDATA}/pg_hba.conf"
  if [[ -f "${hba}" ]] && ! grep -q "replication replicator" "${hba}"; then
    printf '\nhost replication replicator all scram-sha-256\n' >>"${hba}"
  fi
}

start_primary() {
  mkdir -p "${PGDATA}"
  if [[ -f "${PGDATA}/standby.signal" ]]; then
    rm -f "${PGDATA}/standby.signal"
  fi
  append_hba
  extra=("${replication_gucs[@]}")
  if [[ "${WAL_ARCHIVE_ENABLED:-false}" == "true" ]]; then
    extra+=(
      -c archive_mode=on
      -c "archive_timeout=${WAL_ARCHIVE_TIMEOUT_SECONDS:-30}"
      -c "archive_command=/wal-g/wal-g wal-push %p"
    )
  fi
  extra+=("$@")
  exec docker-entrypoint.sh postgres "${extra[@]}"
}

start_replica() {
  mkdir -p "${PGDATA}"
  if [[ ! -s "${PGDATA}/PG_VERSION" ]]; then
    until pg_isready -h "${POSTGRES_PRIMARY_HOST}" -U postgres -d zoen; do
      sleep 1
    done
    export PGPASSWORD="${POSTGRES_REPLICATION_PASSWORD:-replicator}"
    rm -rf "${PGDATA:?}/"*
    pg_basebackup \
      -h "${POSTGRES_PRIMARY_HOST}" \
      -U replicator \
      -D "${PGDATA}" \
      -Fp -Xs -P -R \
      -C -S zoen_replica
  fi
  append_hba
  # pg_basebackup copies the primary auto.conf, including wal-g restore_command.
  rm -f "${PGDATA}/recovery.signal"
  if [[ -f "${PGDATA}/postgresql.auto.conf" ]]; then
    grep -vE '^[[:space:]]*(restore_command|recovery_target)' \
      "${PGDATA}/postgresql.auto.conf" >"${PGDATA}/postgresql.auto.conf.tmp" || true
    mv "${PGDATA}/postgresql.auto.conf.tmp" "${PGDATA}/postgresql.auto.conf"
  fi
  extra=("${replication_gucs[@]}")
  extra+=("$@")
  exec docker-entrypoint.sh postgres "${extra[@]}"
}

if [[ "${POSTGRES_ROLE}" == "replica" ]]; then
  start_replica "$@"
else
  start_primary "$@"
fi
