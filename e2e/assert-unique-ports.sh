#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
failed=0
seen_keys=()
seen_values=()

record() {
  local value="$1"
  local owner="$2"
  local index
  for index in "${!seen_values[@]}"; do
    if [[ "${seen_values[$index]}" == "$value" ]]; then
      echo "port ${value} used by ${seen_keys[$index]} and ${owner}" >&2
      failed=1
      return
    fi
  done
  seen_keys+=("$owner")
  seen_values+=("$value")
}

while IFS= read -r file; do
  kind_node_ports=0
  if [[ ! -f "$(dirname "$file")/compose.yaml" ]]; then
    kind_node_ports=1
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" == ZOEN_E2E_*_PORT ]] || continue
    record "$value" "${file#"${root}"/} ${key}"
    if [[ "${kind_node_ports}" -eq 1 ]]; then
      if [[ ! "$value" =~ ^[0-9]+$ ]] || ((value < 30000 || value > 32767)); then
        echo "kind nodePort ${value} in ${file#"${root}"/} is outside 30000-32767" >&2
        failed=1
      fi
    fi
  done < "$file"
done < <(find "${root}/e2e" -name .env -print | sort)

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "e2e host ports are unique (${#seen_values[@]} bindings)"
