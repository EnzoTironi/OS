#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
duplicate=0
seen_keys=()
seen_values=()

record() {
  local value="$1"
  local owner="$2"
  local index
  for index in "${!seen_values[@]}"; do
    if [[ "${seen_values[$index]}" == "$value" ]]; then
      echo "port ${value} used by ${seen_keys[$index]} and ${owner}" >&2
      duplicate=1
      return
    fi
  done
  seen_keys+=("$owner")
  seen_values+=("$value")
}

while IFS= read -r file; do
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" == ZOEN_E2E_*_PORT ]] || continue
    record "$value" "${file#"${root}"/} ${key}"
  done < "$file"
done < <(find "${root}/e2e" -name .env -print | sort)

if [[ "$duplicate" -ne 0 ]]; then
  exit 1
fi

echo "e2e host ports are unique (${#seen_values[@]} bindings)"
