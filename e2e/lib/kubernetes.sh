#!/usr/bin/env bash

ZOEN_KIND_VERSION="v0.32.0"
ZOEN_KUBECTL_VERSION="v1.36.4"
ZOEN_HELM_VERSION="v4.2.4"
ZOEN_COSIGN_VERSION="v3.1.3"
ZOEN_SYFT_VERSION="v1.51.0"
ZOEN_KUBERNETES_ROLLOUT_TIMEOUT="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT:-10m}"
ZOEN_KUBERNETES_PROGRESS_DEADLINE_SECONDS="${ZOEN_KUBERNETES_PROGRESS_DEADLINE_SECONDS:-1800}"
ZOEN_RECYCLE_PIDS=()

zoen_host_os() {
  case "$(uname -s)" in
    Darwin) printf 'darwin\n' ;;
    Linux) printf 'linux\n' ;;
    *)
      echo "Kubernetes E2E requires Darwin or Linux, got $(uname -s)" >&2
      exit 1
      ;;
  esac
}

zoen_host_arch() {
  case "$(uname -m)" in
    amd64 | x86_64) printf 'amd64\n' ;;
    arm64 | aarch64) printf 'arm64\n' ;;
    *)
      echo "Kubernetes E2E requires amd64 or arm64, got $(uname -m)" >&2
      exit 1
      ;;
  esac
}

zoen_container_platform() {
  printf 'linux/%s\n' "$(zoen_host_arch)"
}

zoen_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Kubernetes E2E requires $1" >&2
    exit 1
  fi
}

zoen_file_digest() {
  local file="$1"
  if sha256sum --version >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
  else
    shasum -a 256 "${file}" | awk '{print $1}'
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
  test "$(zoen_file_digest "${file}")" = "${expected}"
}

zoen_install_kind() {
  local tools_directory="$1"
  local binary="${tools_directory}/kind"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local artifact="kind-$(zoen_host_os)-$(zoen_host_arch)"
  local url="https://github.com/kubernetes-sigs/kind/releases/download/${ZOEN_KIND_VERSION}/${artifact}"
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
  local url="https://dl.k8s.io/release/${ZOEN_KUBECTL_VERSION}/bin/$(zoen_host_os)/$(zoen_host_arch)/kubectl"
  zoen_download_file "${url}" "${binary}"
  zoen_download_file "${url}.sha256" "${binary}.sha256"
  zoen_verify_digest "${binary}" "$(tr -d '\n' <"${binary}.sha256")"
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
  local tuple
  tuple="$(zoen_host_os)-$(zoen_host_arch)"
  local url="https://get.helm.sh/helm-${ZOEN_HELM_VERSION}-${tuple}.tar.gz"
  zoen_download_file "${url}" "${archive}"
  zoen_download_file "${url}.sha256sum" "${archive}.sha256sum"
  zoen_verify_digest "${archive}" "$(awk '{print $1}' "${archive}.sha256sum")"
  tar --extract --gzip --file "${archive}" --directory "${generated_directory}"
  install -m 0755 "${generated_directory}/${tuple}/helm" "${binary}"
}

zoen_install_cosign() {
  local generated_directory="$1"
  local tools_directory="$2"
  local binary="${tools_directory}/cosign"
  if [[ -x "${binary}" ]]; then
    return
  fi
  local checksums="${generated_directory}/cosign_checksums.txt"
  local artifact="cosign-$(zoen_host_os)-$(zoen_host_arch)"
  local url="https://github.com/sigstore/cosign/releases/download/${ZOEN_COSIGN_VERSION}"
  zoen_download_file "${url}/${artifact}" "${binary}"
  zoen_download_file "${url}/cosign_checksums.txt" "${checksums}"
  local digest
  digest="$(awk -v artifact="${artifact}" '$2 == artifact || $2 == "*"artifact {print $1}' "${checksums}")"
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
  local release="syft_${ZOEN_SYFT_VERSION#v}_$(zoen_host_os)_$(zoen_host_arch).tar.gz"
  local checksum_release="syft_${ZOEN_SYFT_VERSION#v}_checksums.txt"
  local url="https://github.com/anchore/syft/releases/download/${ZOEN_SYFT_VERSION}"
  zoen_download_file "${url}/${release}" "${archive}"
  zoen_download_file "${url}/${checksum_release}" "${checksums}"
  local digest
  digest="$(awk -v release="${release}" '$2 == release || $2 == "*"release {print $1}' "${checksums}")"
  test -n "${digest}"
  zoen_verify_digest "${archive}" "${digest}"
  tar --extract --gzip --file "${archive}" --directory "${generated_directory}" syft
  install -m 0755 "${generated_directory}/syft" "${binary}"
}

zoen_install_cluster_tools() {
  local generated_directory="$1"
  local tools_root="$2"
  local tools_directory="${tools_root}/$(zoen_host_os)-$(zoen_host_arch)"
  mkdir -p "${generated_directory}" "${tools_directory}"
  export PATH="${tools_directory}:${PATH}"
  zoen_require_command curl
  zoen_require_command docker
  zoen_require_command node
  zoen_require_command npm
  zoen_require_command tar
  if ! sha256sum --version >/dev/null 2>&1; then
    zoen_require_command shasum
  fi
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
  # Only CreateContainerError: ContainerCreating/PodInitializing can take minutes
  # for the debug images, and deleting those pods fills the runner disk.
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

zoen_start_create_container_error_recycler() {
  local namespace="$1"
  (
    set +e
    while true; do
      zoen_recycle_create_container_error_pods "${namespace}"
      sleep 10
    done
  ) &
  ZOEN_RECYCLE_PIDS+=("$!")
}

zoen_stop_create_container_error_recyclers() {
  local pid
  for pid in "${ZOEN_RECYCLE_PIDS[@]+"${ZOEN_RECYCLE_PIDS[@]}"}"; do
    kill "${pid}" >/dev/null 2>&1 || true
  done
  ZOEN_RECYCLE_PIDS=()
}

zoen_stretch_progress_deadlines() {
  local namespace="$1"
  local seconds="$2"
  local name current
  while read -r name current; do
    [[ -z "${name}" || "${name}" == "NAME" ]] && continue
    if [[ "${current}" == "<none>" || -z "${current}" ]]; then
      current=600
    fi
    if ((current < seconds)); then
      kubectl --namespace "${namespace}" patch "deployment/${name}" --type merge \
        --patch "{\"spec\":{\"progressDeadlineSeconds\":${seconds}}}" \
        >/dev/null 2>&1 || true
    fi
  done < <(
    kubectl --namespace "${namespace}" get deploy \
      --output custom-columns=NAME:.metadata.name,DEADLINE:.spec.progressDeadlineSeconds \
      --no-headers 2>/dev/null || true
  )
}

zoen_rollout_status() {
  local namespace="$1"
  local workload="$2"
  local timeout="${3:-${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}}"
  local seconds remaining
  seconds="$(zoen_duration_seconds "${timeout}")"
  local deadline=$((SECONDS + seconds))
  zoen_stretch_progress_deadlines \
    "${namespace}" \
    "${ZOEN_KUBERNETES_PROGRESS_DEADLINE_SECONDS}"
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
  local projection_database_url="postgres://zoen_projection:zoen_projection@${postgres_host}:5432/zoen"
  kubectl --namespace "${namespace}" create secret generic zoen-runtime \
    --from-literal=connectorCallerToken=zoen-e2e-connector-token \
    --from-literal=connectorCredentials='{"secret.provider.a":{"secret":"unused","tenantId":"tenant.a"},"secret.provider.b":{"secret":"unused","tenantId":"tenant.b"}}' \
    --from-literal=databaseUrl="${database_url}" \
    --from-literal=projectionDatabaseUrl="${projection_database_url}" \
    --from-literal=databaseUrlTenantA="${database_url}?options=-c%20zoen.tenant_id%3Dtenant.a" \
    --from-literal=databaseUrlTenantB="${database_url}?options=-c%20zoen.tenant_id%3Dtenant.b" \
    --from-literal=effectOidcClients='{"tenant.a":{"clientId":"effect-worker-a","clientSecret":"effect-worker-a-secret"},"tenant.b":{"clientId":"effect-worker-b","clientSecret":"effect-worker-b-secret"}}' \
    --from-literal=harnessBindingKey=shared-saas-harness-binding-key-v1 \
    --from-literal=harnessClientSecretA=harness-a-secret \
    --from-literal=harnessClientSecretB=harness-b-secret \
    --from-literal=postgresAdminPassword=postgres \
    --from-literal=postgresApplicationPassword=zoen_app \
    --from-literal=postgresProjectionPassword=zoen_projection \
    --from-literal=postgresReplicationPassword=replicator \
    --from-literal=s3AccessKeyId=zoen-access \
    --from-literal=s3SecretAccessKey=zoen-secret \
    --from-literal=workerCredentialRefs='{"tenant.a":"secret.provider.a","tenant.b":"secret.provider.b"}' \
    --dry-run=client \
    --output yaml |
    kubectl apply --filename -
}
