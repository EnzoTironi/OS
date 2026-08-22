#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
generated_directory="${ZOEN_E2E_GENERATED_DIR:-${repository_root}/e2e/shared-tenancy/.generated}"
artifacts_directory="${ZOEN_E2E_ARTIFACTS_DIR:-${repository_root}/artifacts/shared-tenancy}"
tools_directory="${repository_root}/.cache/zoen-e2e/bin"
cluster_name="zoen-shared-tenancy"
control_plane_node="${cluster_name}-control-plane"
registry_name="zoen-shared-tenancy-registry"
registry_address="localhost:5001"
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
mkdir -p "${generated_directory}" "${artifacts_directory}"
zoen_install_cluster_tools "${generated_directory}" "${tools_directory}"

collect_diagnostics() {
  kubectl get pods,deployments,statefulsets,jobs --all-namespaces --output wide \
    >"${artifacts_directory}/kubernetes-resources.log" 2>&1 || true
  kubectl describe pods --all-namespaces \
    >"${artifacts_directory}/kubernetes-describe.log" 2>&1 || true
  kubectl logs --all-containers --prefix --tail=300 \
    --selector app.kubernetes.io/part-of=zoen \
    >"${artifacts_directory}/kubernetes.log" 2>&1 || true
}

cleanup() {
  kind delete cluster --name "${cluster_name}" >/dev/null 2>&1 || true
  docker rm --force "${registry_name}" >/dev/null 2>&1 || true
}

finish() {
  local status="$?"
  trap - EXIT
  if [[ "${status}" -ne 0 ]]; then
    collect_diagnostics
  fi
  cleanup
  exit "${status}"
}

trap finish EXIT

cleanup
for image in "${third_party_images[@]}"; do
  docker pull "${image}"
done
docker run --detach \
  --name "${registry_name}" \
  --publish 127.0.0.1:5001:5000 \
  registry:2 >/dev/null

kind_config="${generated_directory}/kind.yaml"
cat >"${kind_config}" <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  kubeProxyMode: "nftables"
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".containerd]
      snapshotter = "native"
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:5001"]
      endpoint = ["http://zoen-shared-tenancy-registry:5000"]
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 32080
        hostPort: 32080
        listenAddress: "127.0.0.1"
      - containerPort: 32081
        hostPort: 32081
        listenAddress: "127.0.0.1"
      - containerPort: 32082
        hostPort: 32082
        listenAddress: "127.0.0.1"
      - containerPort: 32083
        hostPort: 32083
        listenAddress: "127.0.0.1"
      - containerPort: 32084
        hostPort: 32084
        listenAddress: "127.0.0.1"
      - containerPort: 32085
        hostPort: 32085
        listenAddress: "127.0.0.1"
      - containerPort: 32086
        hostPort: 32086
        listenAddress: "127.0.0.1"
      - containerPort: 32090
        hostPort: 32090
        listenAddress: "127.0.0.1"
      - containerPort: 32092
        hostPort: 32092
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
node e2e/shared-tenancy/prepare-realm.mjs
zoen_create_runtime_secret default postgres

cosign_key="${generated_directory}/cosign"
rm -f "${cosign_key}.key" "${cosign_key}.pub"
COSIGN_PASSWORD="" cosign generate-key-pair --output-key-prefix "${cosign_key}" >/dev/null
artifact_metadata="${artifacts_directory}/signed-oci.json"
COSIGN_PASSWORD="" deploy/scripts/build-and-sign.sh \
  "${registry_address}" \
  "${cosign_key}" \
  "${artifact_metadata}"

metadata_value() {
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    if (typeof value !== "string" || value.length === 0) process.exit(1);
    process.stdout.write(value);
  ' "${artifact_metadata}" "$1"
}

definition_digest="$(
  node -e '
    const { createHash } = require("node:crypto");
    const { readFileSync } = require("node:fs");
    const canonicalJson = readFileSync(process.argv[1], "utf8").trim();
    process.stdout.write(createHash("sha256").update(canonicalJson).digest("hex"));
  ' e2e/shared-tenancy/definition.canonical.json
)"
chart_version="$(metadata_value chartVersion)"
rust_repository="$(metadata_value rustRepository)"
rust_digest="$(metadata_value rustDigest)"
node_repository="$(metadata_value nodeRepository)"
node_digest="$(metadata_value nodeDigest)"

npx playwright install --with-deps chromium

helm upgrade --install zoen \
  "oci://${registry_address}/zoen/charts/zoen" \
  --version "${chart_version}" \
  --plain-http \
  --values deploy/helm/zoen/profiles/shared-saas.yaml \
  --set "definitionDigest=${definition_digest}" \
  --set "images.rust.repository=${rust_repository}" \
  --set "images.rust.digest=${rust_digest}" \
  --set "images.node.repository=${node_repository}" \
  --set "images.node.digest=${node_digest}" \
  --set-file "keycloak.realmJson=${generated_directory}/realm.json"

definition_independent_workloads=(
  "statefulset/postgres"
  "deployment/keycloak"
  "deployment/minio"
  "statefulset/restate"
  "deployment/web"
  "deployment/zoen-http-connector"
  "deployment/zoen-effect-worker"
  "deployment/zoen-effect-dispatcher-tenant-a"
  "deployment/zoen-effect-dispatcher-tenant-b"
  "deployment/zoen-projection"
  "deployment/zoend"
)
for workload in "${definition_independent_workloads[@]}"; do
  kubectl rollout status "${workload}" --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
done
test "$(kubectl get deployment zoend --output jsonpath='{.status.readyReplicas}')" -ge 2
export ZOEN_SHARED_ARTIFACTS_METADATA="${artifact_metadata}"
node dist/e2e/shared-tenancy.js

collect_diagnostics
trap - EXIT
cleanup
