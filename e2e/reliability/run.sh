#!/usr/bin/env bash
set -euo pipefail

drill="${1:-}"
case "${drill}" in
  ha-chaos | backup-restore | rolling-upgrade | rpo-rto) ;;
  *)
    echo "usage: e2e/reliability/run.sh <ha-chaos|backup-restore|rolling-upgrade|rpo-rto>" >&2
    exit 2
    ;;
esac

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scenario="${drill}"
generated_directory="${ZOEN_E2E_GENERATED_DIR:-${repository_root}/e2e/${scenario}/.generated}"
artifacts_directory="${ZOEN_E2E_ARTIFACTS_DIR:-${repository_root}/artifacts/${scenario}}"
tools_directory="${repository_root}/.cache/zoen-e2e/bin"
source_sha="$(git -C "${repository_root}" rev-parse HEAD)"
artifact_cache="${repository_root}/.cache/deployment-portability/${source_sha}"
artifact_metadata="${artifact_cache}/signed-oci.json"
cosign_key="${artifact_cache}/cosign"
registry_name="zoen-portability-registry"
registry_address="localhost:5002"
cluster_name="zoen-${drill}"
control_plane_node="${cluster_name}-control-plane"
durable_namespace="zoen-${drill}-durable"
application_namespace="zoen-${drill}-app"
profile_values="deploy/helm/zoen/profiles/dedicated.yaml"
overlay_values="deploy/helm/zoen/overlays/reliability.yaml"
classification_file="deploy/helm/zoen/state-classification.yaml"
mutants_file="${artifacts_directory}/mutants.tsv"
recovery_file="${artifacts_directory}/recovery.tsv"
started_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
third_party_images=(
  "pgvector/pgvector:pg18"
  "chekkan/wal-g:v3.0.7"
  "quay.io/keycloak/keycloak:26.0.7"
  "minio/minio:RELEASE.2025-07-23T15-54-02Z"
  "minio/mc:RELEASE.2025-07-21T05-28-08Z"
  "docker.restate.dev/restatedev/restate:1.7.2"
  "otel/opentelemetry-collector-contrib:0.132.0"
)

cd "${repository_root}"
source e2e/lib/kubernetes.sh
mkdir -p "${generated_directory}" "${artifacts_directory}" "${artifact_cache}"
zoen_install_cluster_tools "${generated_directory}" "${tools_directory}"
: >"${mutants_file}"
: >"${recovery_file}"
export ZOEN_RELIABILITY_STARTED_AT="${started_at}"
export ZOEN_RELIABILITY_NAMESPACE="${application_namespace}"
chmod +x deploy/scripts/postgres-promote.sh deploy/scripts/postgres-backup.sh \
  deploy/scripts/postgres-restore.sh deploy/scripts/assert-rolling-compatible.sh

metadata_value() {
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    if (typeof value !== "string" || value.length === 0) process.exit(1);
    process.stdout.write(value);
  ' "${artifact_metadata}" "$1"
}

collect_diagnostics() {
  kubectl get pods,deployments,statefulsets,jobs --all-namespaces --output wide \
    >"${artifacts_directory}/kubernetes-resources.log" 2>&1 || true
  kubectl describe pods --all-namespaces \
    >"${artifacts_directory}/kubernetes-describe.log" 2>&1 || true
  kubectl get events --all-namespaces --sort-by='.lastTimestamp' \
    >"${artifacts_directory}/kubernetes-events.log" 2>&1 || true
  : >"${artifacts_directory}/kubernetes.log"
  for namespace in "${application_namespace}" "${durable_namespace}"; do
    if kubectl get namespace "${namespace}" >/dev/null 2>&1; then
      kubectl logs --all-containers --prefix --tail=300 \
        --selector app.kubernetes.io/part-of=zoen \
        --namespace "${namespace}" \
        >>"${artifacts_directory}/kubernetes.log" 2>&1 || true
    fi
  done
}

cleanup_cluster() {
  kind delete cluster --name "${cluster_name}" >/dev/null 2>&1 || true
}

finish() {
  local status="$?"
  trap - EXIT
  if [[ "${status}" -ne 0 ]]; then
    collect_diagnostics
  fi
  cleanup_cluster
  exit "${status}"
}

trap finish EXIT

verify_artifact_set() {
  local public_key="${cosign_key}.pub"
  local rust_ref
  local node_ref
  local chart_ref
  rust_ref="$(metadata_value rustRepository)@$(metadata_value rustDigest)"
  node_ref="$(metadata_value nodeRepository)@$(metadata_value nodeDigest)"
  chart_ref="$(metadata_value chartRepository)@$(metadata_value chartDigest)"
  for reference in "${rust_ref}" "${node_ref}" "${chart_ref}"; do
    cosign verify \
      --allow-insecure-registry \
      --insecure-ignore-tlog \
      --key "${public_key}" \
      "${reference}" >/dev/null
    cosign verify-attestation \
      --allow-insecure-registry \
      --insecure-ignore-tlog \
      --key "${public_key}" \
      --type spdxjson \
      "${reference}" >/dev/null
  done
}

start_registry() {
  if docker container inspect "${registry_name}" >/dev/null 2>&1; then
    docker start "${registry_name}" >/dev/null
    return
  fi
  docker run --detach \
    --name "${registry_name}" \
    --publish 127.0.0.1:5002:5000 \
    registry:2 >/dev/null
}

ensure_artifact_set() {
  start_registry
  local cached_sha=""
  if [[ -f "${artifact_metadata}" ]]; then
    cached_sha="$(metadata_value sourceSha || true)"
  fi
  if [[ "${cached_sha}" == "${source_sha}" ]] && verify_artifact_set; then
    return
  fi
  docker rm --force "${registry_name}" >/dev/null 2>&1 || true
  rm -rf "${artifact_cache}"
  mkdir -p "${artifact_cache}"
  start_registry
  COSIGN_PASSWORD="" cosign generate-key-pair \
    --output-key-prefix "${cosign_key}" >/dev/null
  COSIGN_PASSWORD="" deploy/scripts/build-and-sign.sh \
    "${registry_address}" \
    "${cosign_key}" \
    "${artifact_metadata}"
  verify_artifact_set
}

pass() {
  printf '%s\t%s\t%s\n' "$1" PASS "$2" >>"$3"
}

digest_value() {
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).authorityDigest)' \
    "${artifacts_directory}/authority-digest.json"
}

classified_tables() {
  node --input-type=module -e '
    import { readFile } from "node:fs/promises";
    import { parse } from "yaml";
    const classification = parse(await readFile(process.argv[1], "utf8"));
    const tables = [
      ...(classification.authority?.postgresTables ?? []),
      ...(classification.authority?.referenceTables ?? []),
    ];
    process.stdout.write(`${tables.join("\n")}\n`);
  ' "${classification_file}"
}

postgres_primary_pod() {
  kubectl --namespace "${durable_namespace}" get pod \
    --selector 'app.kubernetes.io/name=postgres,zoen.dev/postgres-role=primary' \
    --output jsonpath='{.items[0].metadata.name}'
}

postgres_exec() {
  kubectl --namespace "${durable_namespace}" exec "$(postgres_primary_pod)" -- \
    psql -U postgres -d zoen "$@"
}

backup_commit_sequence() {
  tr -d '[:space:]' <"${artifacts_directory}/backup-commit-sequence.txt"
}

expect_nonzero() {
  local description="$1"
  shift
  if ! command -v "$1" >/dev/null 2>&1 && ! declare -F "$1" >/dev/null 2>&1; then
    echo "missing command $1 for ${description}" >&2
    exit 1
  fi
  if "$@"; then
    echo "${description}" >&2
    exit 1
  fi
}

pause_deployments() {
  local deploy
  local found
  local _attempt
  local remaining
  local deadline
  for deploy in "$@"; do
    found=0
    for _attempt in $(seq 1 30); do
      if kubectl --namespace "${application_namespace}" get "deployment/${deploy}" \
        >/dev/null 2>&1; then
        found=1
        break
      fi
      sleep 2
    done
    if [[ "${found}" != "1" ]]; then
      echo "deployment ${deploy} was not created" >&2
      exit 1
    fi
    kubectl --namespace "${application_namespace}" scale "deployment/${deploy}" --replicas=0
    kubectl --namespace "${application_namespace}" rollout status \
      "deployment/${deploy}" --timeout=120s
  done
  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    remaining=0
    for deploy in "$@"; do
      remaining=$((remaining + $(
        kubectl --namespace "${application_namespace}" get pod \
          --selector "app.kubernetes.io/name=${deploy}" \
          --field-selector=status.phase=Running \
          --output name 2>/dev/null | grep -c . || true
      )))
    done
    if [[ "${remaining}" -eq 0 ]]; then
      return 0
    fi
    sleep 2
  done
  echo "authority writer pods still present after scale-to-zero" >&2
  kubectl --namespace "${application_namespace}" get pods --output wide >&2 || true
  exit 1
}

resume_deployments() {
  local deploy
  for deploy in "$@"; do
    kubectl --namespace "${application_namespace}" scale "deployment/${deploy}" --replicas=1
    kubectl --namespace "${application_namespace}" rollout status \
      "deployment/${deploy}" --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  done
}

pause_authority_writers() {
  pause_deployments \
    harness-tenant-a \
    zoen-effect-dispatcher-tenant-a \
    zoen-effect-worker
}

resume_authority_writers() {
  resume_deployments \
    harness-tenant-a \
    zoen-effect-dispatcher-tenant-a \
    zoen-effect-worker
}

helm_upgrade_application() {
  local namespace="$1"
  local version="$2"
  shift 2
  helm upgrade zoen \
    "oci://${registry_address}/zoen/charts/zoen" \
    --version "${version}" \
    --plain-http \
    --namespace "${namespace}" \
    --values "${profile_values}" \
    --values "${overlay_values}" \
    --values "${generated_directory}/ports.yaml" \
    "${artifact_flags[@]}" \
    "$@"
}

publish_signed_chart_version() {
  local version="$1"
  local signing_config="${artifact_cache}/cosign-signing-config.json"
  local chart_sbom="${artifact_cache}/chart.spdx.json"
  local package_path="${artifact_cache}/zoen-${version}.tgz"
  if [[ ! -f "${signing_config}" || ! -f "${chart_sbom}" ]]; then
    echo "signed chart cache is missing signing config or SBOM" >&2
    exit 1
  fi
  helm package deploy/helm/zoen \
    --version "${version}" \
    --app-version "${version}" \
    --destination "${artifact_cache}"
  helm push "${package_path}" "oci://${registry_address}/zoen/charts" --plain-http
  local digest
  digest="$(
    curl --silent --show-error --head \
      --header 'Accept: application/vnd.oci.image.manifest.v1+json' \
      "http://${registry_address}/v2/zoen/charts/zoen/manifests/${version}" |
      awk 'tolower($1) == "docker-content-digest:" {gsub("\r", "", $2); print $2}'
  )"
  test -n "${digest}"
  local chart_ref="${registry_address}/zoen/charts/zoen@${digest}"
  COSIGN_PASSWORD="" cosign sign \
    --yes \
    --allow-insecure-registry \
    --signing-config "${signing_config}" \
    --key "${cosign_key}.key" \
    "${chart_ref}"
  COSIGN_PASSWORD="" cosign attest \
    --yes \
    --allow-insecure-registry \
    --signing-config "${signing_config}" \
    --key "${cosign_key}.key" \
    --predicate "${chart_sbom}" \
    --type spdxjson \
    "${chart_ref}"
  cosign verify \
    --allow-insecure-registry \
    --insecure-ignore-tlog \
    --key "${cosign_key}.pub" \
    "${chart_ref}" >/dev/null
  cosign verify-attestation \
    --allow-insecure-registry \
    --insecure-ignore-tlog \
    --key "${cosign_key}.pub" \
    --type spdxjson \
    "${chart_ref}" >/dev/null
}

wait_for_zoend_overlap() {
  local ready_sets
  for _ in $(seq 1 300); do
    ready_sets="$(
      kubectl --namespace "${application_namespace}" get replicaset \
        --selector app.kubernetes.io/name=zoend \
        --output jsonpath='{range .items[*]}{.status.readyReplicas}{"\n"}{end}' |
        awk '$1+0 > 0 { count += 1 } END { print count+0 }'
    )"
    if [[ "${ready_sets}" -ge 2 ]]; then
      return 0
    fi
    sleep 2
  done
  echo "zoend old and new ReplicaSets did not overlap during rolling upgrade" >&2
  return 1
}

drop_postgres_network() {
  local postgres_ip
  postgres_ip="$(
    kubectl --namespace "${durable_namespace}" get pod \
      --selector 'app.kubernetes.io/name=postgres,zoen.dev/postgres-role=primary' \
      --output jsonpath='{.items[0].status.podIP}'
  )"
  if [[ -z "${postgres_ip}" ]]; then
    echo "no postgres primary IP for network-loss mutant" >&2
    exit 1
  fi
  printf '%s\n' "${postgres_ip}" >"${generated_directory}/blocked-postgres-ip"
  cat <<EOF | kubectl apply --filename -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: zoen-chaos-drop-postgres
  namespace: ${application_namespace}
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: zoend
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
EOF
  docker exec "${control_plane_node}" \
    iptables -I FORWARD 1 -p tcp -d "${postgres_ip}" --dport 5432 -j DROP
  docker exec "${control_plane_node}" \
    iptables -I OUTPUT 1 -p tcp -d "${postgres_ip}" --dport 5432 -j DROP
}

restore_postgres_network() {
  kubectl --namespace "${application_namespace}" delete networkpolicy \
    zoen-chaos-drop-postgres --ignore-not-found >/dev/null
  local postgres_ip=""
  if [[ -f "${generated_directory}/blocked-postgres-ip" ]]; then
    postgres_ip="$(tr -d '[:space:]' <"${generated_directory}/blocked-postgres-ip")"
  fi
  if [[ -n "${postgres_ip}" ]]; then
    docker exec "${control_plane_node}" \
      iptables -D FORWARD -p tcp -d "${postgres_ip}" --dport 5432 -j DROP \
      >/dev/null 2>&1 || true
    docker exec "${control_plane_node}" \
      iptables -D OUTPUT -p tcp -d "${postgres_ip}" --dport 5432 -j DROP \
      >/dev/null 2>&1 || true
  fi
}

kill_stateless_application() {
  local name
  for name in \
    zoend \
    harness-tenant-a \
    zoen-projection \
    zoen-effect-dispatcher-tenant-a \
    zoen-effect-worker \
    zoen-http-connector; do
    kubectl --namespace "${application_namespace}" delete pod \
      --selector "app.kubernetes.io/name=${name}" \
      --wait=true --grace-period=15 --ignore-not-found >/dev/null
  done
}

assert_authority_rls() {
  local table
  local row
  while IFS= read -r table; do
    [[ -z "${table}" ]] && continue
    row="$(
      postgres_exec -At -c \
        "SELECT c.relrowsecurity::text || ',' || c.relforcerowsecurity::text
           FROM pg_class AS c
           JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = '${table}';"
    )"
    if [[ "${row}" != "true,true" ]]; then
      echo "restore left RLS off on ${table}: ${row}" >&2
      exit 1
    fi
  done < <(classified_tables)
}

ready_http() {
  local body_file="${generated_directory}/ready-body.txt"
  local code
  code="$(
    curl --silent --show-error --max-time 5 \
      --output "${body_file}" \
      --write-out '%{http_code}' \
      "http://127.0.0.1:${ZOEN_E2E_ZOEND_PORT}/ready" || true
  )"
  printf '%s' "${code:-000}"
}

write_ports_values() {
  cat >"${generated_directory}/ports.yaml" <<EOF
global:
  durableNamespace: ${durable_namespace}
  keycloakClusterIp: 10.96.0.90
  publicOidcIssuer: http://keycloak.127.0.0.1.nip.io:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen
zoend:
  replicas: 2
  nodePort: ${ZOEN_E2E_ZOEND_PORT}
postgres:
  host: postgres.${durable_namespace}.svc.cluster.local
  nodePort: ${ZOEN_E2E_POSTGRES_PORT}
keycloak:
  nodePort: ${ZOEN_E2E_KEYCLOAK_PORT}
  discoveryUrl: http://keycloak.${durable_namespace}.svc.cluster.local:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/.well-known/openid-configuration
  tokenEndpoint: http://keycloak.${durable_namespace}.svc.cluster.local:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/protocol/openid-connect/token
objectStorage:
  endpoint: http://minio.${durable_namespace}.svc.cluster.local:9000
minio:
  nodePort: ${ZOEN_E2E_MINIO_PORT}
restate:
  ingressUrl: http://restate.${durable_namespace}.svc.cluster.local:8080
  adminUrl: http://restate.${durable_namespace}.svc.cluster.local:9070
  ingressNodePort: ${ZOEN_E2E_RESTATE_INGRESS_PORT}
  adminNodePort: ${ZOEN_E2E_RESTATE_UI_PORT}
telemetry:
  endpoint: http://otel-collector.${durable_namespace}.svc.cluster.local:4318
tenants:
  - id: tenant.a
    suffix: A
    clientId: harness-a
    clientSecretKey: harnessClientSecretA
    databaseUrlKey: databaseUrlTenantA
    nodePort: ${ZOEN_E2E_HARNESS_A_PORT}
web:
  nodePort: ${ZOEN_E2E_WEB_PORT}
EOF
}

create_cluster() {
  cleanup_cluster
  local kind_config="${generated_directory}/kind.yaml"
  cat >"${kind_config}" <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  kubeProxyMode: "nftables"
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".containerd]
      snapshotter = "native"
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:5002"]
      endpoint = ["http://${registry_name}:5000"]
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: ${ZOEN_E2E_WEB_PORT}
        hostPort: ${ZOEN_E2E_WEB_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_ZOEND_PORT}
        hostPort: ${ZOEN_E2E_ZOEND_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_RESTATE_INGRESS_PORT}
        hostPort: ${ZOEN_E2E_RESTATE_INGRESS_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_HARNESS_A_PORT}
        hostPort: ${ZOEN_E2E_HARNESS_A_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_POSTGRES_PORT}
        hostPort: ${ZOEN_E2E_POSTGRES_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_MINIO_PORT}
        hostPort: ${ZOEN_E2E_MINIO_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_KEYCLOAK_PORT}
        hostPort: ${ZOEN_E2E_KEYCLOAK_PORT}
        listenAddress: "127.0.0.1"
      - containerPort: ${ZOEN_E2E_RESTATE_UI_PORT}
        hostPort: ${ZOEN_E2E_RESTATE_UI_PORT}
        listenAddress: "127.0.0.1"
EOF
  zoen_create_kind_cluster "${cluster_name}" "${kind_config}"
  docker save "${third_party_images[@]}" |
    docker exec --privileged --interactive "${control_plane_node}" \
      ctr --namespace=k8s.io images import \
      --local \
      --snapshotter=native \
      --platform linux/amd64 \
      -
  docker network connect kind "${registry_name}" 2>/dev/null || true
}

install_dependencies() {
  kubectl create namespace "${durable_namespace}"
  zoen_create_runtime_secret "${durable_namespace}" postgres
  helm upgrade --install zoen-dependencies \
    "oci://${registry_address}/zoen/charts/zoen" \
    --version "${chart_version}" \
    --plain-http \
    --namespace "${durable_namespace}" \
    --values "${profile_values}" \
    --values "${overlay_values}" \
    --values "${generated_directory}/ports.yaml" \
    --set "applications.enabled=false" \
    --set "networkPolicy.enabled=false" \
    --set "reference.enabled=true" \
    --set-file "keycloak.realmJson=${generated_directory}/realm.json" \
    "${artifact_flags[@]}"
  kubectl --namespace "${durable_namespace}" rollout status statefulset/postgres \
    --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  kubectl --namespace "${durable_namespace}" rollout status statefulset/postgres-replica \
    --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  kubectl --namespace "${durable_namespace}" rollout status statefulset/restate \
    --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  for workload in deployment/keycloak deployment/minio deployment/otel-collector; do
    kubectl --namespace "${durable_namespace}" rollout status \
      "${workload}" \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  done
  test "$(
    kubectl --namespace "${durable_namespace}" get statefulset postgres-replica \
      --output jsonpath='{.status.readyReplicas}'
  )" -ge 1
  test "$(
    kubectl --namespace "${durable_namespace}" get statefulset restate \
      --output jsonpath='{.status.readyReplicas}'
  )" -ge 3
}

install_application() {
  local namespace="$1"
  local version="${2:-${chart_version}}"
  kubectl create namespace "${namespace}"
  zoen_create_runtime_secret \
    "${namespace}" \
    "postgres.${durable_namespace}.svc.cluster.local"
  helm upgrade --install zoen \
    "oci://${registry_address}/zoen/charts/zoen" \
    --version "${version}" \
    --plain-http \
    --namespace "${namespace}" \
    --values "${profile_values}" \
    --values "${overlay_values}" \
    --values "${generated_directory}/ports.yaml" \
    "${artifact_flags[@]}"
}

wait_for_ready_http() {
  local _attempt
  for _attempt in $(seq 1 30); do
    if curl --fail --silent --show-error \
      "http://127.0.0.1:${ZOEN_E2E_ZOEND_PORT}/ready" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "zoend /ready did not return 200 after rollout" >&2
  return 1
}

wait_for_stateless_application() {
  local namespace="$1"
  local workload
  for workload in \
    deployment/web \
    deployment/zoen-http-connector \
    deployment/zoen-projection \
    deployment/zoend; do
    kubectl --namespace "${namespace}" rollout status \
      "${workload}" \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  done
  test "$(
    kubectl --namespace "${namespace}" get deployment zoend \
      --output jsonpath='{.status.readyReplicas}'
  )" -ge 2
  wait_for_ready_http
}

wait_for_application() {
  local namespace="$1"
  local workload
  for workload in \
    deployment/web \
    deployment/zoen-effect-dispatcher-tenant-a \
    deployment/zoen-effect-worker \
    deployment/zoen-http-connector \
    deployment/zoen-projection \
    deployment/zoend; do
    kubectl --namespace "${namespace}" rollout status \
      "${workload}" \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  done
  test "$(
    kubectl --namespace "${namespace}" get deployment zoend \
      --output jsonpath='{.status.readyReplicas}'
  )" -ge 2
  wait_for_ready_http
}

wait_for_oidc() {
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if run_semantic login >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "keycloak did not issue a token after restore" >&2
  return 1
}

run_semantic() {
  node dist/e2e/reliability.js "$@"
}

authority_tables_present() {
  local table
  local exists
  while IFS= read -r table; do
    [[ -z "${table}" ]] && continue
    exists="$(
      postgres_exec -At -c "SELECT to_regclass('public.${table}') IS NOT NULL;"
    )"
    if [[ "${exists}" != "t" ]]; then
      echo "authority table ${table} missing after restore" >&2
      exit 1
    fi
  done < <(classified_tables)
}

wal_host_directory() {
  mkdir -p "${artifacts_directory}/wal"
  (cd "${artifacts_directory}/wal" && pwd)
}

run_mc() {
  docker run --rm --network host \
    --env "MC_HOST_local=http://zoen-access:zoen-secret@127.0.0.1:${ZOEN_E2E_MINIO_PORT}" \
    --volume "$(wal_host_directory):/wal" \
    minio/mc:RELEASE.2025-07-21T05-28-08Z \
    "$@"
}

mirror_wal_to_host() {
  run_mc mirror --overwrite local/zoen-wal /wal
}

restore_wal_to_cluster() {
  run_mc mb --ignore-existing local/zoen-wal
  run_mc mirror --overwrite /wal local/zoen-wal
}

rebuild_projections() {
  kubectl --namespace "${application_namespace}" exec deploy/zoen-projection -- \
    /usr/local/bin/zoen-projection --rebuild tenant.a
}

fresh_restore() {
  local cut_at="${1:-}"
  local observed_sequence
  pause_authority_writers
  deploy/scripts/postgres-backup.sh "${durable_namespace}" "${classification_file}"
  mirror_wal_to_host
  run_semantic observe
  install -m 0644 "${artifacts_directory}/semantic-state.json" \
    "${artifacts_directory}/semantic-before-restore.json"
  observed_sequence="$(
    node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).commitSequence))' \
      "${artifacts_directory}/semantic-before-restore.json"
  )"
  if [[ "${observed_sequence}" != "$(backup_commit_sequence)" ]]; then
    echo "observed commit sequence ${observed_sequence} does not match backup $(backup_commit_sequence)" >&2
    exit 1
  fi
  run_semantic digest
  local digest_before
  digest_before="$(
    node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).authorityDigest)' \
      "${artifacts_directory}/authority-digest.json"
  )"
  printf '%s\n' "${digest_before}" >"${artifacts_directory}/authority-digest-before.txt"
  trap - EXIT
  cleanup_cluster
  create_cluster
  trap finish EXIT
  node e2e/shared-tenancy/prepare-realm.mjs inventory.governed inventory.item.1
  install_dependencies
  restore_wal_to_cluster
  ZOEN_WALG_IMAGE=chekkan/wal-g:v3.0.7 \
    ZOEN_POSTGRES_IMAGE=pgvector/pgvector:pg18 \
    ZOEN_OBJECT_ENDPOINT="http://minio.${durable_namespace}.svc.cluster.local:9000" \
    ZOEN_WAL_BUCKET=zoen-wal \
    deploy/scripts/postgres-restore.sh "${durable_namespace}"
  authority_tables_present
  assert_authority_rls
  local restored_sequence
  restored_sequence="$(
    postgres_exec -At -c \
      "SELECT coalesce(max(commit_sequence), 0)::text FROM authority_commits;"
  )"
  if [[ "${restored_sequence}" != "$(backup_commit_sequence)" ]]; then
    echo "restored commit sequence ${restored_sequence} does not match backup $(backup_commit_sequence)" >&2
    exit 1
  fi
  postgres_exec -c "ALTER TABLE definition_revisions RENAME TO definition_revisions_hidden;"
  install_application "${application_namespace}"
  pause_authority_writers
  local zoend_pod=""
  local _attempt
  for _attempt in $(seq 1 60); do
    zoend_pod="$(
      kubectl --namespace "${application_namespace}" get pod \
        --selector app.kubernetes.io/name=zoend \
        --output jsonpath='{.items[0].metadata.name}' 2>/dev/null || true
    )"
    if [[ -n "${zoend_pod}" ]]; then
      break
    fi
    sleep 2
  done
  if [[ -z "${zoend_pod}" ]]; then
    echo "zoend pod was never created after restore" >&2
    exit 1
  fi
  kubectl --namespace "${application_namespace}" get service zoend >/dev/null
  local ready_count
  local ready_code
  for _attempt in $(seq 1 15); do
    ready_count="$(
      kubectl --namespace "${application_namespace}" get deployment zoend \
        --output jsonpath='{.status.readyReplicas}'
    )"
    if [[ "${ready_count:-0}" -gt 0 ]]; then
      echo "zoend became Ready before restore integrity" >&2
      exit 1
    fi
    ready_code="$(ready_http)"
    if [[ "${ready_code}" == "200" ]]; then
      echo "zoend /ready returned 200 before restore integrity" >&2
      exit 1
    fi
    sleep 2
  done
  pass traffic-before-integrity \
    "a Running zoend stayed unready until migrate and integrity succeeded" \
    "${mutants_file}"
  postgres_exec -c "ALTER TABLE definition_revisions_hidden RENAME TO definition_revisions;"
  wait_for_stateless_application "${application_namespace}"
  rebuild_projections
  run_semantic verify "${artifacts_directory}/semantic-before-restore.json"
  run_semantic digest
  if [[ "$(digest_value)" != "${digest_before}" ]]; then
    echo "authority digest after restore $(digest_value) does not match backup ${digest_before}" >&2
    exit 1
  fi
  if [[ -n "${cut_at}" ]]; then
    measure_rpo_rto "${cut_at}"
  fi
  resume_authority_writers
  run_semantic register
}

measure_rpo_rto() {
  local cut_at="$1"
  local healthy_at
  healthy_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
  local restored
  restored="$(
    postgres_exec -At -c \
      "SELECT coalesce(string_agg(claim_id, ',' ORDER BY claim_id), '') FROM semantic_claims WHERE claim_id LIKE 'claim.canary.%';"
  )"
  ZOEN_BACKUP_COMMIT_SEQUENCE="$(backup_commit_sequence)" \
  node --input-type=module -e '
    import { readFile, writeFile } from "node:fs/promises";
    const canaries = (await readFile(process.argv[1], "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const restored = new Set(process.argv[2].split(",").filter(Boolean));
    const preserved = canaries.filter((row) => restored.has(row.claimId));
    if (preserved.length === 0) throw new Error("no canary survived restore");
    const newest = preserved.at(-1);
    const cutAt = Date.parse(process.argv[3]);
    const healthyAt = Date.parse(process.argv[4]);
    const newestAt = Date.parse(newest.committedAt);
    const measuredRPOSeconds = Math.max(0, (cutAt - newestAt) / 1000);
    const measuredRTOSeconds = (healthyAt - cutAt) / 1000;
    if (measuredRPOSeconds >= 300) {
      throw new Error(`measured RPO ${measuredRPOSeconds}s exceeds 5 minutes`);
    }
    if (measuredRTOSeconds >= 1800) {
      throw new Error(`measured RTO ${measuredRTOSeconds}s exceeds 30 minutes`);
    }
    const backupCommitSequence = Number(process.env.ZOEN_BACKUP_COMMIT_SEQUENCE ?? "");
    if (!Number.isInteger(backupCommitSequence)) {
      throw new Error("backup commit sequence is required for RPO evidence");
    }
    const report = {
      backupCommitSequence,
      cutAt: process.argv[3],
      healthyAt: process.argv[4],
      measuredRPOSeconds,
      measuredRTOSeconds,
      newestRestoredCanaryAt: newest.committedAt,
      newestRestoredCanaryId: newest.claimId,
      sourceSha: process.argv[5],
      targets: { rpoSeconds: 300, rtoSeconds: 1800 },
    };
    await writeFile(process.argv[6], `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  ' \
    "${artifacts_directory}/canaries.jsonl" \
    "${restored}" \
    "${cut_at}" \
    "${healthy_at}" \
    "${source_sha}" \
    "${artifacts_directory}/rpo-rto.json"
}

static_mutants() {
  node e2e/reliability/verify-classification.mjs "${classification_file}"
  pass projection-as-authority \
    "classification rejects treating rebuildable projections as authority" \
    "${mutants_file}"
  local mutant_classification="${generated_directory}/unbacked-authority.yaml"
  cat >"${mutant_classification}" <<'EOF'
authority:
  postgresTables:
    - definition_revisions
    - rogue_unbacked_authority
rebuildable:
  postgresTables:
    - projection_watermarks
  orchestration:
    - restate
EOF
  local mutant_output="${generated_directory}/unbacked-authority.out"
  if deploy/scripts/postgres-backup.sh \
    "${durable_namespace}" "${mutant_classification}" \
    >"${mutant_output}" 2>&1; then
    echo "unbacked authority table mutant survived backup verification" >&2
    cat "${mutant_output}" >&2
    exit 1
  fi
  if ! grep -q "authority table rogue_unbacked_authority is classified but missing from postgres" \
    "${mutant_output}"; then
    echo "backup did not refuse the missing classified table" >&2
    cat "${mutant_output}" >&2
    exit 1
  fi
  pass unbacked-authority-table \
    "backup refused a classified authority table that postgres does not have" \
    "${mutants_file}"
  cat >"${generated_directory}/breaking.sql" <<'EOF'
-- zoen:breaking
ALTER TABLE definition_revisions ADD COLUMN breaking text;
EOF
  if deploy/scripts/assert-rolling-compatible.sh \
    "${generated_directory}/breaking.sql" \
    "${application_namespace}"; then
    echo "breaking migration mutant survived an old replica" >&2
    exit 1
  fi
  pass rolling-breaking-with-old-replica \
    "a -- zoen:breaking migration was refused while zoend replicas were Ready" \
    "${mutants_file}"
}

live_mutants() {
  postgres_exec -c "DROP TABLE definition_revisions CASCADE;"
  sleep 4
  local body_file="${generated_directory}/ready-body.txt"
  local code
  code="$(ready_http)"
  if [[ "${code}" == "200" ]]; then
    echo "restore missing definition revisions mutant survived /ready" >&2
    exit 1
  fi
  if ! grep -q "authority table definition_revisions is missing" "${body_file}" \
    && [[ "${code}" != "000" && "${code}" != "503" ]]; then
    echo "missing definition revisions did not fail /ready: HTTP ${code}" >&2
    exit 1
  fi
  pass restore-missing-definition-revisions \
    "/ready failed after definition revisions were removed" \
    "${mutants_file}"
}

rls_mutant() {
  assert_authority_rls
  postgres_exec -At -c "SELECT to_regclass('public.semantic_claims') IS NOT NULL;" | grep -qx t
  postgres_exec -c "ALTER TABLE semantic_claims DISABLE ROW LEVEL SECURITY;"
  sleep 4
  local body_file="${generated_directory}/ready-body.txt"
  local code
  code="$(ready_http)"
  if [[ "${code}" == "200" ]]; then
    echo "RLS disabled mutant survived /ready" >&2
    exit 1
  fi
  if grep -q "authority table semantic_claims is missing" "${body_file}"; then
    echo "RLS mutant failed as MissingTable instead of RlsDisabled" >&2
    exit 1
  fi
  if ! grep -q "row-level security is disabled on semantic_claims" "${body_file}"; then
    echo "RLS mutant did not return IntegrityError::RlsDisabled: HTTP ${code} $(cat "${body_file}")" >&2
    exit 1
  fi
  postgres_exec -c "ALTER TABLE semantic_claims ENABLE ROW LEVEL SECURITY;"
  postgres_exec -c "ALTER TABLE semantic_claims FORCE ROW LEVEL SECURITY;"
  local restored_ready=""
  local _attempt
  for _attempt in $(seq 1 30); do
    if [[ "$(ready_http)" == "200" ]]; then
      restored_ready=1
      break
    fi
    sleep 2
  done
  if [[ "${restored_ready}" != "1" ]]; then
    echo "zoend did not become Ready after RLS was re-enabled" >&2
    exit 1
  fi
  pass rls-disabled-after-restore \
    "/ready failed with RlsDisabled on a restored semantic_claims table" \
    "${mutants_file}"
}

effect_from_restate_only_mutant() {
  local deployments
  deployments="$(
    curl --fail --silent --show-error \
      "http://127.0.0.1:${ZOEN_E2E_RESTATE_UI_PORT}/deployments"
  )"
  if ! printf '%s' "${deployments}" | grep -q 'harness-tenant-a'; then
    echo "Restate has no harness deployment; cannot prove Restate-as-authority mutant" >&2
    exit 1
  fi
  local effect_count
  effect_count="$(postgres_exec -At -c "SELECT count(*)::text FROM effect_requests;")"
  if [[ "${effect_count}" -lt 1 ]]; then
    echo "Postgres effect_requests is empty; cannot wipe authority while Restate has state" >&2
    exit 1
  fi
  postgres_exec -c \
    "TRUNCATE effect_dispatches, effect_dispatch_attempts, effect_reconciliations, effect_evidence, effect_attempt_claims, effect_attempts, effect_requests CASCADE;"
  if ZOEN_E2E_EFFECT_WAIT_ATTEMPTS=5 \
    run_semantic verify "${artifacts_directory}/semantic-before-restore.json"; then
    echo "effect-from-restate-only mutant survived after wiping Postgres effect tables" >&2
    exit 1
  fi
  deployments="$(
    curl --fail --silent --show-error \
      "http://127.0.0.1:${ZOEN_E2E_RESTATE_UI_PORT}/deployments"
  )"
  if ! printf '%s' "${deployments}" | grep -q 'harness-tenant-a'; then
    echo "Restate lost deployments during the effect-authority mutant" >&2
    exit 1
  fi
  pass effect-from-restate-only \
    "wiping Postgres effect_* while Restate still had deployments failed semantic integrity" \
    "${mutants_file}"
}

ensure_artifact_set
install -m 0644 "${artifact_metadata}" "${artifacts_directory}/signed-oci.json"
chart_version="$(metadata_value chartVersion)"
chart_package="${artifact_cache}/zoen-${chart_version}.tgz"
rust_repository="$(metadata_value rustRepository)"
rust_digest="$(metadata_value rustDigest)"
node_repository="$(metadata_value nodeRepository)"
node_digest="$(metadata_value nodeDigest)"
definition_digest="$(
  node --input-type=module -e '
    import { loadFixture } from "./dist/e2e/governed-action/support.js";
    const fixture = await loadFixture("direct", 1);
    process.stdout.write(fixture.digest);
  '
)"
artifact_flags=(
  --set-string "definitionDigest=${definition_digest}"
  --set-string "images.rust.repository=${rust_repository}"
  --set-string "images.rust.digest=${rust_digest}"
  --set-string "images.node.repository=${node_repository}"
  --set-string "images.node.digest=${node_digest}"
)
write_ports_values
printf '{}\n' >"${generated_directory}/realm.json"

helm template zoen-dependencies "${chart_package}" \
  --namespace "${durable_namespace}" \
  --values "${profile_values}" \
  --values "${overlay_values}" \
  --values "${generated_directory}/ports.yaml" \
  --set "applications.enabled=false" \
  --set "reference.enabled=true" \
  --set-file "keycloak.realmJson=${generated_directory}/realm.json" \
  "${artifact_flags[@]}" \
  >"${generated_directory}/overlay-deps.yaml"
helm template zoen-dependencies "${chart_package}" \
  --namespace "${durable_namespace}" \
  --values "${profile_values}" \
  --values "${generated_directory}/ports.yaml" \
  --set "applications.enabled=false" \
  --set "reference.enabled=true" \
  --set-file "keycloak.realmJson=${generated_directory}/realm.json" \
  "${artifact_flags[@]}" \
  >"${generated_directory}/reference-deps.yaml"
helm template zoen "${chart_package}" \
  --namespace "${application_namespace}" \
  --values "${profile_values}" \
  --values "${overlay_values}" \
  --values "${generated_directory}/ports.yaml" \
  "${artifact_flags[@]}" \
  >"${generated_directory}/application.yaml"
node e2e/reliability/verify-topology.mjs \
  "${generated_directory}/overlay-deps.yaml" \
  "${generated_directory}/reference-deps.yaml" \
  "${generated_directory}/application.yaml"
node e2e/deployment-portability/verify-rendered-artifacts.mjs \
  "${artifact_metadata}" \
  "${generated_directory}/application.yaml"
pass topology-overlay \
  "overlay rendered 2 PostgreSQL instances and 3 Restate nodes; reference stayed 1+1" \
  "${recovery_file}"

for image in "${third_party_images[@]}"; do
  docker pull "${image}"
done
create_cluster
node e2e/shared-tenancy/prepare-realm.mjs inventory.governed inventory.item.1
install_dependencies
install_application "${application_namespace}"
wait_for_application "${application_namespace}"
run_semantic seed
kubectl --namespace "${application_namespace}" rollout status \
  deployment/harness-tenant-a \
  --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
install -m 0644 "${artifacts_directory}/semantic-state.json" \
  "${artifacts_directory}/semantic-initial.json"
pass initial-conformance \
  "definition, Action, query, effect, explanation, and tenant isolation passed on HA" \
  "${recovery_file}"
static_mutants

case "${drill}" in
  ha-chaos)
    kubectl --namespace "${application_namespace}" delete pod \
      "$(kubectl --namespace "${application_namespace}" get pod \
        --selector app.kubernetes.io/name=zoend \
        --output jsonpath='{.items[0].metadata.name}')" \
      --wait=true --grace-period=15
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${application_namespace}" delete pod \
      --selector app.kubernetes.io/name=zoend --wait=true --grace-period=15
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    deploy/scripts/postgres-promote.sh "${durable_namespace}"
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${durable_namespace}" delete pod restate-1 --wait=true
    kubectl --namespace "${durable_namespace}" rollout status statefulset/restate \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${durable_namespace}" scale deployment/minio --replicas=0
    sleep 5
    kubectl --namespace "${durable_namespace}" scale deployment/minio --replicas=1
    kubectl --namespace "${durable_namespace}" rollout status deployment/minio \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"

    cached_token="$(
      curl --fail --silent --show-error \
        --data 'client_id=agent-a&client_secret=agent-a-secret&grant_type=client_credentials' \
        "http://127.0.0.1:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/protocol/openid-connect/token" |
        node -e 'let s=""; process.stdin.on("data", (d) => s += d); process.stdin.on("end", () => process.stdout.write(JSON.parse(s).access_token));'
    )"
    test -n "${cached_token}"
    kubectl --namespace "${durable_namespace}" patch service keycloak --type merge \
      --patch '{"spec":{"selector":{"app.kubernetes.io/name":"keycloak-outage"}}}'
    sleep 3
    expect_nonzero "new login succeeded during OIDC outage" run_semantic login
    ZOEN_E2E_ACCESS_TOKEN="${cached_token}" \
      run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${durable_namespace}" patch service keycloak --type merge \
      --patch '{"spec":{"selector":{"app.kubernetes.io/name":"keycloak"}}}'
    wait_for_oidc
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    run_semantic digest
    pass oidc-outage \
      "OIDC outage blocked new login and left durable query and commit-status intact" \
      "${recovery_file}"

    pause_authority_writers
    digest_before="$(
      run_semantic digest
    )"
    kubectl --namespace "${application_namespace}" delete pod \
      --selector app.kubernetes.io/name=zoen-projection --wait=true
    kubectl --namespace "${application_namespace}" scale deployment/zoen-projection --replicas=0
    sleep 2
    kubectl --namespace "${application_namespace}" scale deployment/zoen-projection --replicas=1
    kubectl --namespace "${application_namespace}" rollout status \
      deployment/zoen-projection --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
    run_semantic digest
    test "$(digest_value)" = "${digest_before}"
    rebuild_projections
    run_semantic digest
    test "$(digest_value)" = "${digest_before}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    resume_authority_writers
    pass projection-kill-backlog \
      "killing zoen-projection left authority digest unchanged and rebuild did not rewrite it" \
      "${recovery_file}"

    run_semantic propose operation.reliability.network proposal.reliability.network
    drop_postgres_network
    expect_nonzero "commit succeeded while zoend could not reach postgres" \
      timeout 30 node dist/e2e/reliability.js commit \
      operation.reliability.network proposal.reliability.network
    restore_postgres_network
    sleep 2
    run_semantic commit operation.reliability.network proposal.reliability.network
    network_ops="$(
      postgres_exec -At -c \
        "SELECT count(*)::text FROM action_operations WHERE operation_id = 'operation.reliability.network';"
    )"
    test "${network_ops}" = "1"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    pass network-lost-commit \
      "a network-lost commit failed typed and retry did not duplicate OperationId" \
      "${recovery_file}"

    kill_stateless_application
    wait_for_application "${application_namespace}"
    kubectl --namespace "${application_namespace}" rollout status \
      deployment/harness-tenant-a \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    pass stateless-pod-kill \
      "killing zoend, harness, projection, effect, and connector pods recovered Ready state" \
      "${recovery_file}"

    helm_upgrade_application "${application_namespace}" "${chart_version}" \
      --set-string "images.rust.digest=sha256:0000000000000000000000000000000000000000000000000000000000000000"
    bad_deploy=0
    for _ in $(seq 1 30); do
      if kubectl --namespace "${application_namespace}" get pods \
        --selector app.kubernetes.io/name=zoend \
        --output jsonpath='{range .items[*]}{.status.containerStatuses[0].state.waiting.reason}{"\n"}{end}' |
        grep -Eq 'ImagePullBackOff|ErrImagePull'; then
        bad_deploy=1
        break
      fi
      sleep 2
    done
    if [[ "${bad_deploy}" -ne 1 ]]; then
      echo "bad deploy did not produce a non-Ready zoend" >&2
      exit 1
    fi
    test "$(
      kubectl --namespace "${application_namespace}" get deployment zoend \
        --output jsonpath='{.status.readyReplicas}'
    )" -ge 1
    helm rollback zoen --namespace "${application_namespace}"
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    pass bad-deploy-rollback \
      "a deploy that could not become Ready rolled back without rewriting semantic history" \
      "${recovery_file}"

    pass ha-failover \
      "zoend, Postgres primary, Restate, object-store, OIDC, projection, network, and bad-deploy faults kept semantic authority" \
      "${recovery_file}"
    ;;
  backup-restore)
    kubectl --namespace "${durable_namespace}" exec deploy/minio -- \
      test -d /data/zoen-wal
    fresh_restore
    pass backup-fresh-restore \
      "wal-g backup restored into a new kind cluster with an unchanged authority digest" \
      "${recovery_file}"
    pass effect-authority-postgres \
      "empty Restate after restore reconciled effects from Postgres authority" \
      "${recovery_file}"
    rls_mutant
    pause_authority_writers
    run_semantic digest
    projection_digest="$(digest_value)"
    postgres_exec -c "TRUNCATE projection_watermarks, projection_manifests;"
    rebuild_projections
    run_semantic digest
    if [[ "$(digest_value)" != "${projection_digest}" ]]; then
      echo "authority digest after projection rebuild $(digest_value) does not match ${projection_digest}" >&2
      exit 1
    fi
    resume_authority_writers
    pass projection-rebuildable \
      "wiping projection watermarks and rebuilding left authority digest unchanged" \
      "${mutants_file}"
    effect_from_restate_only_mutant
    live_mutants
    ;;
  rolling-upgrade)
    npm run buf:breaking
    next_chart_version="$(
      node -e '
        const parts = process.argv[1].split(".").map((value) => Number(value));
        if (parts.length !== 3 || parts.some((value) => !Number.isInteger(value))) {
          process.exit(1);
        }
        parts[2] += 1;
        process.stdout.write(parts.join("."));
      ' "${chart_version}"
    )"
    test "${next_chart_version}" != "${chart_version}"
    publish_signed_chart_version "${next_chart_version}"
    helm_upgrade_application "${application_namespace}" "${next_chart_version}" --wait=false &
    upgrade_pid=$!
    if ! wait_for_zoend_overlap; then
      kill "${upgrade_pid}" >/dev/null 2>&1 || true
      wait "${upgrade_pid}" >/dev/null 2>&1 || true
      exit 1
    fi
    wait "${upgrade_pid}"
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    helm rollback zoen --namespace "${application_namespace}"
    wait_for_application "${application_namespace}"
    run_semantic verify-rolling "${artifacts_directory}/semantic-initial.json"
    pass rolling-upgrade \
      "two sequential signed chart versions overlapped zoend replicas and application rollback preserved semantic history" \
      "${recovery_file}"
    ;;
  rpo-rto)
    : >"${artifacts_directory}/canaries.jsonl"
    for _ in $(seq 1 8); do
      run_semantic canary
      sleep 5
    done
    postgres_exec -c "SELECT pg_switch_wal();"
    sleep 2
    cut_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
    fresh_restore "${cut_at}"
    pass rpo-rto \
      "measured RPO and RTO from the restore drill stayed inside the V1 target" \
      "${recovery_file}"
    ;;
esac

node e2e/reliability/finalize-evidence.mjs \
  "${drill}" \
  "${artifact_metadata}" \
  "${artifacts_directory}/semantic-state.json" \
  "${mutants_file}" \
  "${recovery_file}" \
  "${artifacts_directory}"

trap - EXIT
cleanup_cluster
