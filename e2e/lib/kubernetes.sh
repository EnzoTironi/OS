#!/usr/bin/env bash

ZOEN_KIND_VERSION="v0.32.0"
ZOEN_KUBECTL_VERSION="v1.36.4"
ZOEN_HELM_VERSION="v4.2.4"
ZOEN_COSIGN_VERSION="v3.1.3"
ZOEN_SYFT_VERSION="v1.51.0"
ZOEN_KUBERNETES_ROLLOUT_TIMEOUT="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT:-10m}"

zoen_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Kubernetes E2E requires $1" >&2
    exit 1
  fi
}

zoen_download_file() {
  local url="$1"
  local output="$2"
  curl --fail --location --silent --show-error "${url}" --output "${output}"
}

zoen_verify_digest() {
  local file="$1"
  local expected="$2"
  test "$(sha256sum "${file}" | awk '{print $1}')" = "${expected}"
}

zoen_install_kind() {
  local tools_directory="$1"
  local binary="${tools_directory}/kind"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local url="https://github.com/kubernetes-sigs/kind/releases/download/${ZOEN_KIND_VERSION}/kind-linux-amd64"
  zoen_download_file "${url}" "${binary}"
  zoen_download_file "${url}.sha256sum" "${binary}.sha256sum"
  zoen_verify_digest "${binary}" "$(awk '{print $1}' "${binary}.sha256sum")"
  chmod +x "${binary}"
}

zoen_install_kubectl() {
  local tools_directory="$1"
  local binary="${tools_directory}/kubectl"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local url="https://dl.k8s.io/release/${ZOEN_KUBECTL_VERSION}/bin/linux/amd64/kubectl"
  zoen_download_file "${url}" "${binary}"
  zoen_download_file "${url}.sha256" "${binary}.sha256"
  printf '%s  %s\n' "$(tr -d '\n' <"${binary}.sha256")" "$(basename "${binary}")" |
    (cd "${tools_directory}" && sha256sum --check)
  chmod +x "${binary}"
}

zoen_install_helm() {
  local generated_directory="$1"
  local tools_directory="$2"
  local binary="${tools_directory}/helm"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local archive="${generated_directory}/helm.tar.gz"
  local url="https://get.helm.sh/helm-${ZOEN_HELM_VERSION}-linux-amd64.tar.gz"
  zoen_download_file "${url}" "${archive}"
  zoen_download_file "${url}.sha256sum" "${archive}.sha256sum"
  zoen_verify_digest "${archive}" "$(awk '{print $1}' "${archive}.sha256sum")"
  tar --extract --gzip --file "${archive}" --directory "${generated_directory}"
  install -m 0755 "${generated_directory}/linux-amd64/helm" "${binary}"
}

zoen_install_cosign() {
  local generated_directory="$1"
  local tools_directory="$2"
  local binary="${tools_directory}/cosign"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local checksums="${generated_directory}/cosign_checksums.txt"
  local url="https://github.com/sigstore/cosign/releases/download/${ZOEN_COSIGN_VERSION}"
  zoen_download_file "${url}/cosign-linux-amd64" "${binary}"
  zoen_download_file "${url}/cosign_checksums.txt" "${checksums}"
  local digest
  digest="$(awk '$2 == "cosign-linux-amd64" {print $1}' "${checksums}")"
  test -n "${digest}"
  zoen_verify_digest "${binary}" "${digest}"
  chmod +x "${binary}"
}

zoen_install_syft() {
  local generated_directory="$1"
  local tools_directory="$2"
  local binary="${tools_directory}/syft"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local archive="${generated_directory}/syft.tar.gz"
  local checksums="${generated_directory}/syft_checksums.txt"
  local release="syft_${ZOEN_SYFT_VERSION#v}_linux_amd64.tar.gz"
  local checksum_release="syft_${ZOEN_SYFT_VERSION#v}_checksums.txt"
  local url="https://github.com/anchore/syft/releases/download/${ZOEN_SYFT_VERSION}"
  zoen_download_file "${url}/${release}" "${archive}"
  zoen_download_file "${url}/${checksum_release}" "${checksums}"
  local digest
  digest="$(awk -v release="${release}" '$2 == release {print $1}' "${checksums}")"
  test -n "${digest}"
  zoen_verify_digest "${archive}" "${digest}"
  tar --extract --gzip --file "${archive}" --directory "${generated_directory}" syft
  install -m 0755 "${generated_directory}/syft" "${binary}"
}

zoen_install_cluster_tools() {
  local generated_directory="$1"
  local tools_directory="$2"
  mkdir -p "${generated_directory}" "${tools_directory}"
  export PATH="${tools_directory}:${PATH}"
  zoen_require_command curl
  zoen_require_command docker
  zoen_require_command node
  zoen_require_command npm
  zoen_require_command sha256sum
  zoen_require_command tar
  zoen_install_kind "${tools_directory}"
  zoen_install_kubectl "${tools_directory}"
  zoen_install_helm "${generated_directory}" "${tools_directory}"
  zoen_install_cosign "${generated_directory}" "${tools_directory}"
  zoen_install_syft "${generated_directory}" "${tools_directory}"
}

zoen_create_kind_cluster() {
  local cluster_name="$1"
  local config="$2"
  local attempt
  local node="${cluster_name}-control-plane"
  for attempt in 1 2 3 4 5 6 7 8; do
    if kind create cluster --name "${cluster_name}" --config "${config}" --wait 180s; then
      return
    fi
    kind delete cluster --name "${cluster_name}" >/dev/null 2>&1 || true
    docker rm --force "${node}" >/dev/null 2>&1 || true
    if [[ "${attempt}" -lt 8 ]]; then
      printf 'kind cluster creation failed (attempt %s); retrying\n' "${attempt}" >&2
      sleep $((attempt * 20))
    fi
  done
  return 1
}

zoen_duration_seconds() {
  local duration="$1"
  case "${duration}" in
    *s) printf '%s\n' "${duration%s}" ;;
    *m) printf '%s\n' "$((${duration%m} * 60))" ;;
    *h) printf '%s\n' "$((${duration%h} * 3600))" ;;
    *) printf '%s\n' "${duration}" ;;
  esac
}

zoen_recycle_create_container_error_pods() {
  # kind's native snapshotter can pin a container name until the pod UID changes.
  local namespace="$1"
  local pod
  local status
  while read -r pod status; do
    [[ -z "${pod}" ]] && continue
    case "${status}" in
      CreateContainerError | Init:CreateContainerError)
        printf 'deleting %s/%s stuck in %s\n' "${namespace}" "${pod}" "${status}" >&2
        kubectl --namespace "${namespace}" delete pod "${pod}" \
          --wait=false --force --grace-period=0 >/dev/null 2>&1 || true
        ;;
    esac
  done < <(
    kubectl --namespace "${namespace}" get pods --no-headers 2>/dev/null |
      awk '{print $1, $3}' || true
  )
}

zoen_rollout_status() {
  local namespace="$1"
  local workload="$2"
  local timeout="${3:-${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}}"
  local seconds remaining
  seconds="$(zoen_duration_seconds "${timeout}")"
  local deadline=$((SECONDS + seconds))
  while ((SECONDS < deadline)); do
    zoen_recycle_create_container_error_pods "${namespace}"
    remaining=$((deadline - SECONDS))
    if ((remaining < 1)); then
      break
    fi
    if ((remaining > 20)); then
      remaining=20
    fi
    if kubectl --namespace "${namespace}" rollout status "${workload}" \
      --timeout="${remaining}s"; then
      return 0
    fi
  done
  echo "rollout of ${workload} in ${namespace} did not become ready" >&2
  kubectl --namespace "${namespace}" get pods --output wide >&2 || true
  return 1
}

zoen_create_runtime_secret() {
  local namespace="$1"
  local postgres_host="$2"
  local database_url="postgres://zoen_app:zoen_app@${postgres_host}:5432/zoen"
  kubectl --namespace "${namespace}" create secret generic zoen-runtime \
    --from-literal=connectorCallerToken=zoen-e2e-connector-token \
    --from-literal=connectorCredentials='{"secret.provider.a":{"secret":"unused","tenantId":"tenant.a"},"secret.provider.b":{"secret":"unused","tenantId":"tenant.b"}}' \
    --from-literal=databaseUrl="${database_url}" \
    --from-literal=databaseUrlTenantA="${database_url}?options=-c%20zoen.tenant_id%3Dtenant.a" \
    --from-literal=databaseUrlTenantB="${database_url}?options=-c%20zoen.tenant_id%3Dtenant.b" \
    --from-literal=effectOidcClients='{"tenant.a":{"clientId":"effect-worker-a","clientSecret":"effect-worker-a-secret"},"tenant.b":{"clientId":"effect-worker-b","clientSecret":"effect-worker-b-secret"}}' \
    --from-literal=harnessBindingKey=shared-saas-harness-binding-key-v1 \
    --from-literal=harnessClientSecretA=harness-a-secret \
    --from-literal=harnessClientSecretB=harness-b-secret \
    --from-literal=postgresAdminPassword=postgres \
    --from-literal=postgresApplicationPassword=zoen_app \
    --from-literal=s3AccessKeyId=zoen-access \
    --from-literal=s3SecretAccessKey=zoen-secret \
    --from-literal=workerCredentialRefs='{"tenant.a":"secret.provider.a","tenant.b":"secret.provider.b"}' \
    --dry-run=client \
    --output yaml |
    kubectl apply --filename -
}
