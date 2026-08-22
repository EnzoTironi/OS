#!/usr/bin/env bash
set -euo pipefail

profile="${1:-}"
case "${profile}" in
  dedicated)
    scenario="deploy-dedicated"
    ;;
  self-hosted)
    scenario="deploy-self-hosted-isolated"
    ;;
  *)
    echo "usage: e2e/deployment-portability/run.sh <dedicated|self-hosted>" >&2
    exit 2
    ;;
esac

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
generated_directory="${ZOEN_E2E_GENERATED_DIR:-${repository_root}/e2e/${scenario}/.generated}"
artifacts_directory="${ZOEN_E2E_ARTIFACTS_DIR:-${repository_root}/artifacts/${scenario}}"
tools_directory="${repository_root}/.cache/zoen-e2e/bin"
source_sha="$(git -C "${repository_root}" rev-parse HEAD)"
artifact_cache="${repository_root}/.cache/deployment-portability/${source_sha}"
artifact_metadata="${artifact_cache}/signed-oci.json"
cosign_key="${artifact_cache}/cosign"
registry_name="zoen-portability-registry"
registry_address="localhost:5002"
cluster_name="zoen-${profile}"
control_plane_node="${cluster_name}-control-plane"
durable_namespace="zoen-${profile}-durable"
application_namespace="zoen-${profile}-app"
restored_namespace="${application_namespace}-restored"
profile_values="deploy/helm/zoen/profiles/${profile}.yaml"
mutants_file="${artifacts_directory}/mutants.tsv"
recovery_file="${artifacts_directory}/recovery.tsv"
network_audit="${artifacts_directory}/network-audit.json"
started_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
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
  : >"${artifacts_directory}/kubernetes.log"
  for namespace in \
    "${application_namespace}" \
    "${restored_namespace}" \
    "${durable_namespace}"; do
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

cleanup_cluster
for image in "${third_party_images[@]}"; do
  docker pull "${image}"
done

kind_config="${generated_directory}/kind.yaml"
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
if [[ "${profile}" == "self-hosted" ]]; then
  kubectl apply --filename e2e/deployment-portability/coredns-isolation.yaml
  kubectl --namespace kube-system rollout restart deployment/coredns
  zoen_rollout_status kube-system deployment/coredns 3m
fi

node e2e/shared-tenancy/prepare-realm.mjs \
  inventory.governed \
  inventory.item.1
kubectl create namespace "${durable_namespace}"
zoen_create_runtime_secret "${durable_namespace}" postgres

artifact_flags=(
  --set-string "definitionDigest=${definition_digest}"
  --set-string "images.rust.repository=${rust_repository}"
  --set-string "images.rust.digest=${rust_digest}"
  --set-string "images.node.repository=${node_repository}"
  --set-string "images.node.digest=${node_digest}"
)

helm upgrade --install zoen-dependencies \
  "oci://${registry_address}/zoen/charts/zoen" \
  --version "${chart_version}" \
  --plain-http \
  --namespace "${durable_namespace}" \
  --values "${profile_values}" \
  --set "applications.enabled=false" \
  --set "networkPolicy.enabled=false" \
  --set "reference.enabled=true" \
  --set-file "keycloak.realmJson=${generated_directory}/realm.json" \
  "${artifact_flags[@]}"

for workload in \
  statefulset/postgres \
  statefulset/restate \
  deployment/keycloak \
  deployment/minio \
  deployment/otel-collector; do
  zoen_rollout_status "${durable_namespace}" "${workload}"
done

render_application() {
  local namespace="$1"
  local output="$2"
  shift 2
  helm template zoen "${chart_package}" \
    --namespace "${namespace}" \
    --values "${profile_values}" \
    "${artifact_flags[@]}" \
    "$@" >"${output}"
}

install_application() {
  local namespace="$1"
  kubectl create namespace "${namespace}"
  zoen_create_runtime_secret \
    "${namespace}" \
    "postgres.${durable_namespace}.svc.cluster.local"
  helm upgrade --install zoen \
    "oci://${registry_address}/zoen/charts/zoen" \
    --version "${chart_version}" \
    --plain-http \
    --namespace "${namespace}" \
    --values "${profile_values}" \
    "${artifact_flags[@]}"
}

application_workloads=(
  deployment/web
  deployment/zoen-effect-dispatcher-tenant-a
  deployment/zoen-effect-worker
  deployment/zoen-http-connector
  deployment/zoen-projection
  deployment/zoend
)

wait_for_application() {
  local namespace="$1"
  for workload in "${application_workloads[@]}"; do
    zoen_rollout_status "${namespace}" "${workload}"
  done
  test "$(
    kubectl --namespace "${namespace}" get deployment zoend \
      --output jsonpath='{.status.readyReplicas}'
  )" -ge 2
}

rendered_manifest="${artifacts_directory}/rendered.yaml"
render_application "${application_namespace}" "${rendered_manifest}"
node e2e/deployment-portability/verify-rendered-artifacts.mjs \
  "${artifact_metadata}" \
  "${rendered_manifest}"
install_application "${application_namespace}"
wait_for_application "${application_namespace}"

npx playwright install --with-deps chromium
export ZOEN_DEPLOYMENT_ARTIFACTS_DIR="${artifacts_directory}"
export ZOEN_DEPLOYMENT_NAMESPACE="${application_namespace}"
export ZOEN_DEPLOYMENT_PROFILE="${profile}"
node dist/e2e/deployment-portability.js initial
initial_state="${artifacts_directory}/semantic-initial.json"
install -m 0644 "${artifacts_directory}/semantic-state.json" "${initial_state}"
printf '%s\t%s\t%s\n' \
  initial-conformance \
  PASS \
  "definition, Action, query, effect, explanation, and UI passed" \
  >>"${recovery_file}"

kubectl --namespace "${application_namespace}" rollout restart \
  "${application_workloads[@]}" \
  deployment/harness-tenant-a
wait_for_application "${application_namespace}"
zoen_rollout_status "${application_namespace}" deployment/harness-tenant-a
node dist/e2e/deployment-portability.js verify "${initial_state}"
printf '%s\t%s\t%s\n' \
  stateless-restart \
  PASS \
  "durable dependencies stayed up and semantic authority stayed exact" \
  >>"${recovery_file}"

expect_helm_failure() {
  local id="$1"
  local observation="$2"
  shift 2
  if render_application "${application_namespace}" /dev/null "$@" 2>/dev/null; then
    echo "${id} mutant survived Helm validation" >&2
    exit 1
  fi
  printf '%s\t%s\t%s\n' "${id}" PASS "${observation}" >>"${mutants_file}"
}

expect_helm_failure \
  missing-external-dependency \
  "an empty Postgres endpoint failed schema validation" \
  --set-string postgres.host=
expect_helm_failure \
  invalid-oidc-config \
  "a non-URL OIDC issuer failed schema validation" \
  --set-string global.publicOidcIssuer=invalid
expect_helm_failure \
  self-host-semantic-feature-flag \
  "an unknown deployment-specific semantic flag failed schema validation" \
  --set semantic.selfHostFeature=true
expect_helm_failure \
  tenant-awareness-disabled \
  "tenant awareness false failed the profile schema" \
  --set tenantAwareness=false
expect_helm_failure \
  unsupported-config-version \
  "an unsupported config version failed schema validation" \
  --set-string configVersion=zoen.config.v2
expect_helm_failure \
  incompatible-migration-preflight \
  "an incompatible migration state failed schema validation" \
  --set-string migration.compatibility=incompatible
if [[ "${profile}" == "self-hosted" ]]; then
  expect_helm_failure \
    hard-coded-cloud-endpoint \
    "a Zoen-hosted object endpoint failed the isolated profile schema" \
    --set-string objectStorage.endpoint=https://objects.zoen.cloud
fi

different_digest="sha256:$(printf 'f%.0s' {1..64})"
mutant_manifest="${generated_directory}/different-binary.yaml"
render_application \
  "${application_namespace}" \
  "${mutant_manifest}" \
  --set-string "images.node.digest=${different_digest}"
if node e2e/deployment-portability/verify-rendered-artifacts.mjs \
  "${artifact_metadata}" \
  "${mutant_manifest}" >/dev/null 2>&1; then
  echo "different self-host binary mutant survived artifact validation" >&2
  exit 1
fi
printf '%s\t%s\t%s\n' \
  different-self-host-binary \
  PASS \
  "the rendered-artifact verifier rejected a different Node digest" \
  >>"${mutants_file}"

run_preflight_failure() {
  local id="$1"
  local observation="$2"
  local database_url="$3"
  local s3_endpoint="$4"
  local oidc_discovery_url="$5"
  local oidc_issuer="${6:-http://keycloak.127.0.0.1.nip.io:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen}"
  local pod="mutant-${id}"
  kubectl --namespace "${application_namespace}" run "${pod}" \
    --image="${node_repository}@${node_digest}" \
    --image-pull-policy=Always \
    --labels=app.kubernetes.io/part-of=zoen \
    --restart=Never \
    --env="DATABASE_URL=${database_url}" \
    --env=S3_ACCESS_KEY_ID=zoen-access \
    --env=S3_ALLOW_HTTP=true \
    --env=S3_BUCKET=zoen-projections \
    --env="S3_ENDPOINT=${s3_endpoint}" \
    --env=S3_REGION=us-east-1 \
    --env=S3_SECRET_ACCESS_KEY=zoen-secret \
    --env=ZOEN_CONFIG_VERSION=zoen.config.v1 \
    --env=ZOEN_MIGRATION_COMPATIBILITY=current \
    --env="ZOEN_OIDC_DISCOVERY_URL=${oidc_discovery_url}" \
    --env="ZOEN_OIDC_ISSUER=${oidc_issuer}" \
    --env="ZOEN_RESTATE_ADMIN_URL=http://restate.${durable_namespace}.svc.cluster.local:9070" \
    --env=ZOEN_TENANT_AWARENESS=true \
    --command -- node /app/deploy/scripts/preflight-dependencies.mjs
  kubectl --namespace "${application_namespace}" wait \
    --for=jsonpath='{.status.phase}'=Failed \
    "pod/${pod}" \
    --timeout=90s
  kubectl --namespace "${application_namespace}" delete "pod/${pod}" --wait=true
  printf '%s\t%s\t%s\n' "${id}" PASS "${observation}" >>"${mutants_file}"
}

valid_database_url="postgres://zoen_app:zoen_app@postgres.${durable_namespace}.svc.cluster.local:5432/zoen"
valid_s3_endpoint="http://minio.${durable_namespace}.svc.cluster.local:9000"
valid_oidc_discovery="http://keycloak.${durable_namespace}.svc.cluster.local:${ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/.well-known/openid-configuration"
run_preflight_failure \
  postgres-unavailable-at-startup \
  "dependency preflight failed before Zoen startup" \
  postgres://zoen_app:zoen_app@postgres.unavailable.invalid:5432/zoen \
  "${valid_s3_endpoint}" \
  "${valid_oidc_discovery}"
run_preflight_failure \
  object-store-unavailable-at-startup \
  "dependency preflight failed before Zoen startup" \
  "${valid_database_url}" \
  http://objects.unavailable.invalid:9000 \
  "${valid_oidc_discovery}"
run_preflight_failure \
  oidc-unavailable-at-startup \
  "dependency preflight failed before Zoen startup" \
  "${valid_database_url}" \
  "${valid_s3_endpoint}" \
  http://oidc.unavailable.invalid/.well-known/openid-configuration
run_preflight_failure \
  invalid-oidc-issuer-at-startup \
  "dependency preflight rejected an issuer mismatch before Zoen startup" \
  "${valid_database_url}" \
  "${valid_s3_endpoint}" \
  "${valid_oidc_discovery}" \
  https://invalid-issuer.example/realms/zoen
node dist/e2e/deployment-portability.js verify "${initial_state}"

if [[ "${profile}" == "self-hosted" ]]; then
  kubectl --namespace "${application_namespace}" exec deployment/harness-tenant-a -- \
    node --input-type=module -e '
      import { lookup } from "node:dns/promises";
      try {
        await lookup("api.zoen.cloud");
        process.exit(1);
      } catch (error) {
        if (error.code !== "ENOTFOUND") throw error;
      }
    '
  kubectl --namespace "${application_namespace}" exec deployment/harness-tenant-a -- \
    node --input-type=module -e '
      import { connect } from "node:net";
      const socket = connect({ host: "1.1.1.1", port: 443 });
      const failed = await new Promise((resolve) => {
        socket.once("connect", () => resolve(false));
        socket.once("error", () => resolve(true));
        socket.setTimeout(3000, () => resolve(true));
      });
      socket.destroy();
      if (!failed) process.exit(1);
    '
  printf '%s\t%s\t%s\n' \
    hidden-mandatory-zoen-api-call \
    PASS \
    "CoreDNS returned NXDOMAIN and NetworkPolicy denied direct external egress" \
    >>"${mutants_file}"
  printf '%s\n' \
    '{"dns":{"api.zoen.cloud":"NXDOMAIN"},"externalEgress":"denied","networkPolicy":"zoen-isolated-egress"}' \
    >"${network_audit}"
else
  printf '%s\n' \
    '{"dns":{"api.zoen.cloud":"not_applicable"},"externalEgress":"profile_managed","networkPolicy":"not_required"}' \
    >"${network_audit}"
fi

helm uninstall zoen --namespace "${application_namespace}"
kubectl delete namespace "${application_namespace}" --wait=true
install_application "${restored_namespace}"
wait_for_application "${restored_namespace}"
zoen_rollout_status "${restored_namespace}" deployment/harness-tenant-a
export ZOEN_DEPLOYMENT_NAMESPACE="${restored_namespace}"
node dist/e2e/deployment-portability.js verify "${initial_state}"
printf '%s\t%s\t%s\n' \
  namespace-reinstall \
  PASS \
  "a new application namespace reused restored durable endpoints with exact semantic state" \
  >>"${recovery_file}"

semantic_digest="$(
  node -e '
    const fs = require("node:fs");
    process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).semanticDigest);
  ' "${initial_state}"
)"
semantic_lock="${artifact_cache}/semantic-digest"
if [[ -f "${semantic_lock}" ]]; then
  test "$(tr -d '\n' <"${semantic_lock}")" = "${semantic_digest}"
else
  printf '%s\n' "${semantic_digest}" >"${semantic_lock}"
fi

export ZOEN_DEPLOYMENT_STARTED_AT="${started_at}"
node e2e/deployment-portability/finalize-evidence.mjs \
  "${profile}" \
  "${profile_values}" \
  "${artifact_metadata}" \
  "${artifacts_directory}/semantic-state.json" \
  "${mutants_file}" \
  "${recovery_file}" \
  "${network_audit}" \
  "${artifacts_directory}"

trap - EXIT
cleanup_cluster
