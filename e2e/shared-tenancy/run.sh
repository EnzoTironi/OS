#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
generated_directory="${ZOEN_E2E_GENERATED_DIR:-${repository_root}/e2e/shared-tenancy/.generated}"
artifacts_directory="${ZOEN_E2E_ARTIFACTS_DIR:-${repository_root}/artifacts/shared-tenancy}"
tools_directory="${repository_root}/.cache/shared-tenancy/bin"
cluster_name="zoen-shared-tenancy"
registry_name="zoen-shared-tenancy-registry"
registry_address="localhost:5001"
kind_version="v0.32.0"
kubectl_version="v1.36.4"
helm_version="v4.2.4"
cosign_version="v3.1.3"

cd "${repository_root}"
mkdir -p "${generated_directory}" "${artifacts_directory}" "${tools_directory}"
export PATH="${tools_directory}:${PATH}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "shared-tenancy requires $1" >&2
    exit 1
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  curl --fail --location --silent --show-error "${url}" --output "${output}"
}

verify_digest() {
  local file="$1"
  local expected="$2"
  test "$(sha256sum "${file}" | awk '{print $1}')" = "${expected}"
}

install_kind() {
  local binary="${tools_directory}/kind"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local url="https://github.com/kubernetes-sigs/kind/releases/download/${kind_version}/kind-linux-amd64"
  download_file "${url}" "${binary}"
  download_file "${url}.sha256sum" "${binary}.sha256sum"
  verify_digest "${binary}" "$(awk '{print $1}' "${binary}.sha256sum")"
  chmod +x "${binary}"
}

install_kubectl() {
  local binary="${tools_directory}/kubectl"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local url="https://dl.k8s.io/release/${kubectl_version}/bin/linux/amd64/kubectl"
  download_file "${url}" "${binary}"
  download_file "${url}.sha256" "${binary}.sha256"
  printf '%s  %s\n' "$(tr -d '\n' <"${binary}.sha256")" "$(basename "${binary}")" |
    (cd "${tools_directory}" && sha256sum --check)
  chmod +x "${binary}"
}

install_helm() {
  local binary="${tools_directory}/helm"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local archive="${generated_directory}/helm.tar.gz"
  local url="https://get.helm.sh/helm-${helm_version}-linux-amd64.tar.gz"
  download_file "${url}" "${archive}"
  download_file "${url}.sha256sum" "${archive}.sha256sum"
  verify_digest "${archive}" "$(awk '{print $1}' "${archive}.sha256sum")"
  tar --extract --gzip --file "${archive}" --directory "${generated_directory}"
  install -m 0755 "${generated_directory}/linux-amd64/helm" "${binary}"
}

install_cosign() {
  local binary="${tools_directory}/cosign"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local checksums="${generated_directory}/cosign_checksums.txt"
  local url="https://github.com/sigstore/cosign/releases/download/${cosign_version}"
  download_file "${url}/cosign-linux-amd64" "${binary}"
  download_file "${url}/cosign_checksums.txt" "${checksums}"
  local digest
  digest="$(awk '$2 == "cosign-linux-amd64" {print $1}' "${checksums}")"
  test -n "${digest}"
  verify_digest "${binary}" "${digest}"
  chmod +x "${binary}"
}

collect_diagnostics() {
  kubectl get pods,deployments,statefulsets,jobs --all-namespaces --output wide \
    >"${artifacts_directory}/kubernetes-resources.log" 2>&1 || true
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

require_command curl
require_command docker
require_command node
require_command npm
require_command sha256sum
require_command tar
install_kind
install_kubectl
install_helm
install_cosign

cleanup
docker run --detach \
  --name "${registry_name}" \
  --publish 127.0.0.1:5001:5000 \
  registry:2 >/dev/null

kind_config="${generated_directory}/kind.yaml"
cat >"${kind_config}" <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
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

kind create cluster --name "${cluster_name}" --config "${kind_config}" --wait 180s
docker network connect kind "${registry_name}" 2>/dev/null || true
node e2e/shared-tenancy/prepare-realm.mjs

cosign_key="${generated_directory}/cosign"
rm -f "${cosign_key}" "${cosign_key}.pub"
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

definition_digest="$(sha256sum e2e/shared-tenancy/definition.canonical.json | awk '{print $1}')"
chart_version="$(metadata_value chartVersion)"
rust_repository="$(metadata_value rustRepository)"
rust_digest="$(metadata_value rustDigest)"
node_repository="$(metadata_value nodeRepository)"
node_digest="$(metadata_value nodeDigest)"

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
  --set-file "keycloak.realmJson=${generated_directory}/realm.json" \
  --wait \
  --wait-for-jobs \
  --timeout 15m

kubectl rollout status deployment/zoend --timeout=5m
test "$(kubectl get deployment zoend --output jsonpath='{.status.readyReplicas}')" -ge 2
npx playwright install --with-deps chromium
export ZOEN_SHARED_ARTIFACTS_METADATA="${artifact_metadata}"
node dist/e2e/shared-tenancy.js

collect_diagnostics
trap - EXIT
cleanup
