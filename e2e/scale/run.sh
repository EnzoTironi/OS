#!/usr/bin/env bash
set -euo pipefail

phase="${1:-}"
case "${phase}" in
  seed-v1 | query-v1 | actions-v1 | mixed-v1) ;;
  *)
    echo "usage: e2e/scale/run.sh <seed-v1|query-v1|actions-v1|mixed-v1>" >&2
    exit 2
    ;;
esac

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scenario="scale-${phase}"
generated_directory="${ZOEN_E2E_GENERATED_DIR:-${repository_root}/e2e/${scenario}/.generated}"
artifacts_directory="${ZOEN_E2E_ARTIFACTS_DIR:-${repository_root}/artifacts/${scenario}}"
tools_directory="${repository_root}/.cache/zoen-e2e/bin"
source_sha="$(git -C "${repository_root}" rev-parse HEAD)"
artifact_cache="${repository_root}/.cache/deployment-portability/${source_sha}"
artifact_metadata="${artifact_cache}/signed-oci.json"
cosign_key="${artifact_cache}/cosign"
registry_name="zoen-portability-registry"
registry_address="localhost:5002"
cluster_name="zoen-${scenario}"
control_plane_node="${cluster_name}-control-plane"
durable_namespace="zoen-${scenario}-durable"
application_namespace="zoen-${scenario}-app"
profile_values="deploy/helm/zoen/profiles/dedicated.yaml"
overlay_values="deploy/helm/zoen/overlays/reliability.yaml"
mutants_file="${artifacts_directory}/mutants.tsv"
recovery_file="${artifacts_directory}/recovery.tsv"
export ZOEN_SCALE="${ZOEN_SCALE:-smoke}"
export ZOEN_E2E_GENERATED_DIR="${generated_directory}"
export ZOEN_E2E_ARTIFACTS_DIR="${artifacts_directory}"
third_party_images=(
  "pgvector/pgvector:pg18"
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
export ZOEN_SCALE_NAMESPACE="${application_namespace}"

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
}

cleanup_cluster() {
  zoen_stop_create_container_error_recyclers
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
  local rust_ref node_ref chart_ref
  rust_ref="$(metadata_value rustRepository)@$(metadata_value rustDigest)"
  node_ref="$(metadata_value nodeRepository)@$(metadata_value nodeDigest)"
  chart_ref="$(metadata_value chartRepository)@$(metadata_value chartDigest)"
  for reference in "${rust_ref}" "${node_ref}" "${chart_ref}"; do
    cosign verify --allow-insecure-registry --insecure-ignore-tlog --key "${public_key}" \
      "${reference}" >/dev/null
    cosign verify-attestation --allow-insecure-registry --insecure-ignore-tlog --key "${public_key}" \
      --type spdxjson "${reference}" >/dev/null
  done
}

start_registry() {
  if docker container inspect "${registry_name}" >/dev/null 2>&1; then
    docker start "${registry_name}" >/dev/null
    return
  fi
  docker run --detach --name "${registry_name}" --publish 127.0.0.1:5002:5000 registry:2 >/dev/null
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
  COSIGN_PASSWORD="" cosign generate-key-pair --output-key-prefix "${cosign_key}" >/dev/null
  COSIGN_PASSWORD="" deploy/scripts/build-and-sign.sh \
    "${registry_address}" "${cosign_key}" "${artifact_metadata}"
  verify_artifact_set
}

pass() {
  printf '%s\t%s\t%s\n' "$1" PASS "$2" >>"$3"
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
      ctr --namespace=k8s.io images import --local --snapshotter=native \
      --platform "$(zoen_container_platform)" -
  docker network connect kind "${registry_name}" 2>/dev/null || true
}

install_dependencies() {
  kubectl create namespace "${durable_namespace}"
  zoen_create_runtime_secret "${durable_namespace}" postgres
  helm upgrade --install zoen-dependencies \
    "oci://${registry_address}/zoen/charts/zoen" \
    --version "${chart_version}" --plain-http --namespace "${durable_namespace}" \
    --values "${profile_values}" --values "${overlay_values}" \
    --values "${generated_directory}/ports.yaml" \
    --set "applications.enabled=false" --set "networkPolicy.enabled=false" \
    --set "reference.enabled=true" \
    --set-file "keycloak.realmJson=${generated_directory}/realm.json" \
    "${artifact_flags[@]}"
  zoen_rollout_status "${durable_namespace}" statefulset/postgres
  zoen_rollout_status "${durable_namespace}" statefulset/postgres-replica
  zoen_rollout_status "${durable_namespace}" statefulset/restate
  for workload in deployment/keycloak deployment/minio deployment/otel-collector; do
    zoen_rollout_status "${durable_namespace}" "${workload}"
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
  kubectl create namespace "${application_namespace}"
  zoen_create_runtime_secret \
    "${application_namespace}" \
    "postgres.${durable_namespace}.svc.cluster.local"
  helm upgrade --install zoen \
    "oci://${registry_address}/zoen/charts/zoen" \
    --version "${chart_version}" --plain-http --namespace "${application_namespace}" \
    --values "${profile_values}" --values "${overlay_values}" \
    --values "${generated_directory}/ports.yaml" \
    "${artifact_flags[@]}"
}

wait_for_application() {
  for workload in \
    deployment/web \
    deployment/zoen-effect-dispatcher-tenant-a \
    deployment/zoen-effect-worker \
    deployment/zoen-http-connector \
    deployment/zoen-projection \
    deployment/zoend; do
    zoen_rollout_status "${application_namespace}" "${workload}"
  done
}

ensure_artifact_set
install -m 0644 "${artifact_metadata}" "${artifacts_directory}/signed-oci.json"
chart_version="$(metadata_value chartVersion)"
rust_repository="$(metadata_value rustRepository)"
rust_digest="$(metadata_value rustDigest)"
node_repository="$(metadata_value nodeRepository)"
node_digest="$(metadata_value nodeDigest)"
definition_digest="$(
  node -e '
    const { createHash } = require("node:crypto");
    const { readFileSync } = require("node:fs");
    process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1], "utf8").trim()).digest("hex"));
  ' e2e/scale/definition.canonical.json
)"
artifact_flags=(
  --set-string "definitionDigest=${definition_digest}"
  --set-string "images.rust.repository=${rust_repository}"
  --set-string "images.rust.digest=${rust_digest}"
  --set-string "images.node.repository=${node_repository}"
  --set-string "images.node.digest=${node_digest}"
)
write_ports_values
for image in "${third_party_images[@]}"; do
  docker pull "${image}"
done
create_cluster
node e2e/shared-tenancy/prepare-realm.mjs scale.definition product.sku.0
install_dependencies
install_application
wait_for_application
zoen_start_create_container_error_recycler "${application_namespace}"
node dist/e2e/scale.js "${phase}"
pass "${phase}" "scale ${phase} completed at ${ZOEN_SCALE}" "${recovery_file}"
trap - EXIT
cleanup_cluster
