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
    --values "${overlay_values}" \
    --values "${generated_directory}/ports.yaml" \
    "${artifact_flags[@]}"
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
  curl --fail --silent --show-error \
    "http://127.0.0.1:${ZOEN_E2E_ZOEND_PORT}/ready" >/dev/null
}

run_semantic() {
  node dist/e2e/reliability.js "$@"
}

authority_tables_present() {
  local table
  node --input-type=module -e '
    import { readFile } from "node:fs/promises";
    import { parse } from "yaml";
    const classification = parse(await readFile(process.argv[1], "utf8"));
    process.stdout.write(classification.authority.postgresTables.join("\n"));
  ' "${classification_file}" |
    while IFS= read -r table; do
      [[ -z "${table}" ]] && continue
      exists="$(
        kubectl --namespace "${durable_namespace}" exec sts/postgres -- \
          psql -U postgres -d zoen -At -c "SELECT to_regclass('public.${table}') IS NOT NULL;"
      )"
      if [[ "${exists}" != "t" ]]; then
        echo "authority table ${table} missing after restore" >&2
        exit 1
      fi
    done
}

mirror_wal_to_host() {
  mkdir -p "${artifacts_directory}/wal"
  docker run --rm --network host \
    --volume "${artifacts_directory}/wal:/wal" \
    minio/mc:RELEASE.2025-07-21T05-28-08Z \
    sh -c "mc alias set local http://127.0.0.1:${ZOEN_E2E_MINIO_PORT} zoen-access zoen-secret && mc mirror --overwrite local/zoen-wal /wal"
}

restore_wal_to_cluster() {
  docker run --rm --network host \
    --volume "${artifacts_directory}/wal:/wal" \
    minio/mc:RELEASE.2025-07-21T05-28-08Z \
    sh -c "mc alias set local http://127.0.0.1:${ZOEN_E2E_MINIO_PORT} zoen-access zoen-secret && mc mb --ignore-existing local/zoen-wal && mc mirror --overwrite /wal local/zoen-wal"
}

rebuild_projections() {
  kubectl --namespace "${application_namespace}" exec deploy/zoen-projection -- \
    /usr/local/bin/zoen-projection --rebuild tenant.a
}

fresh_restore() {
  local cut_at="${1:-}"
  deploy/scripts/postgres-backup.sh "${durable_namespace}" "${classification_file}"
  mirror_wal_to_host
  install -m 0644 "${artifacts_directory}/semantic-state.json" \
    "${artifacts_directory}/semantic-before-restore.json"
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
  if curl --silent --show-error "http://127.0.0.1:${ZOEN_E2E_ZOEND_PORT}/ready" >/dev/null 2>&1; then
    echo "application accepted traffic before restore integrity" >&2
    exit 1
  fi
  pass traffic-before-integrity \
    "the application was not Ready until restore integrity completed" \
    "${mutants_file}"
  install_application "${application_namespace}"
  wait_for_application "${application_namespace}"
  kubectl --namespace "${application_namespace}" rollout status \
    deployment/harness-tenant-a \
    --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
  rebuild_projections
  run_semantic verify "${artifacts_directory}/semantic-before-restore.json"
  run_semantic digest
  test "$(
    node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).authorityDigest)' \
      "${artifacts_directory}/authority-digest.json"
  )" = "${digest_before}"
  if [[ -n "${cut_at}" ]]; then
    measure_rpo_rto "${cut_at}"
  fi
}

measure_rpo_rto() {
  local cut_at="$1"
  local healthy_at
  healthy_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
  local restored
  restored="$(
    kubectl --namespace "${durable_namespace}" exec sts/postgres -- \
      psql -U postgres -d zoen -At -c \
      "SELECT coalesce(string_agg(claim_id, ',' ORDER BY claim_id), '') FROM semantic_claims WHERE claim_id LIKE 'claim.canary.%';"
  )"
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
    const report = {
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
  if deploy/scripts/postgres-backup.sh "${durable_namespace}" "${mutant_classification}"; then
    echo "unbacked authority table mutant survived backup verification" >&2
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
  kubectl --namespace "${durable_namespace}" exec sts/postgres -- \
    psql -U postgres -d zoen -c "DROP TABLE definition_revisions CASCADE;"
  sleep 4
  if curl --fail --silent --show-error "http://127.0.0.1:${ZOEN_E2E_ZOEND_PORT}/ready" >/dev/null; then
    echo "restore missing definition revisions mutant survived /ready" >&2
    exit 1
  fi
  pass restore-missing-definition-revisions \
    "/ready failed after definition revisions were removed" \
    "${mutants_file}"
}

rls_mutant() {
  kubectl --namespace "${durable_namespace}" exec sts/postgres -- \
    psql -U postgres -d zoen -c "ALTER TABLE semantic_claims DISABLE ROW LEVEL SECURITY;"
  sleep 4
  if curl --fail --silent --show-error "http://127.0.0.1:${ZOEN_E2E_ZOEND_PORT}/ready" >/dev/null; then
    echo "RLS disabled mutant survived /ready" >&2
    exit 1
  fi
  pass rls-disabled-after-restore \
    "/ready failed after RLS was disabled" \
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

helm template zoen-dependencies "${chart_package}" \
  --namespace "${durable_namespace}" \
  --values "${profile_values}" \
  --values "${overlay_values}" \
  --values "${generated_directory}/ports.yaml" \
  --set "applications.enabled=false" \
  --set "reference.enabled=true" \
  "${artifact_flags[@]}" \
  >"${generated_directory}/overlay-deps.yaml"
helm template zoen-dependencies "${chart_package}" \
  --namespace "${durable_namespace}" \
  --values "${profile_values}" \
  --values "${generated_directory}/ports.yaml" \
  --set "applications.enabled=false" \
  --set "reference.enabled=true" \
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
kubectl --namespace "${application_namespace}" rollout status \
  deployment/harness-tenant-a \
  --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
run_semantic seed
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
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${application_namespace}" delete pod \
      --selector app.kubernetes.io/name=zoend --wait=true --grace-period=15
    wait_for_application "${application_namespace}"
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    deploy/scripts/postgres-promote.sh "${durable_namespace}"
    wait_for_application "${application_namespace}"
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${durable_namespace}" delete pod restate-1 --wait=true
    kubectl --namespace "${durable_namespace}" rollout status statefulset/restate \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
    wait_for_application "${application_namespace}"
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    kubectl --namespace "${durable_namespace}" scale deployment/minio --replicas=0
    sleep 5
    kubectl --namespace "${durable_namespace}" scale deployment/minio --replicas=1
    kubectl --namespace "${durable_namespace}" rollout status deployment/minio \
      --timeout="${ZOEN_KUBERNETES_ROLLOUT_TIMEOUT}"
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    pass ha-failover \
      "zoend, Postgres primary, Restate, and object-store faults kept semantic authority" \
      "${recovery_file}"
    pass effect-from-restate-only \
      "effect authority remained in Postgres through Restate restart" \
      "${mutants_file}"
    ;;
  backup-restore)
    kubectl --namespace "${durable_namespace}" exec deploy/minio -- \
      test -d /data/zoen-wal
    fresh_restore
    pass backup-fresh-restore \
      "wal-g backup restored into a new kind cluster with an unchanged authority digest" \
      "${recovery_file}"
    pass effect-from-restate-only \
      "empty Restate after restore reconciled effects from Postgres authority" \
      "${mutants_file}"
    kubectl --namespace "${durable_namespace}" exec sts/postgres -- \
      psql -U postgres -d zoen -c "TRUNCATE projection_watermarks, projection_manifests;"
    rebuild_projections
    run_semantic digest
    test "$(
      node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).authorityDigest)' \
        "${artifacts_directory}/authority-digest.json"
    )" = "$(tr -d '\n' <"${artifacts_directory}/authority-digest-before.txt")"
    pass projection-rebuildable \
      "wiping projection watermarks and rebuilding left authority digest unchanged" \
      "${mutants_file}"
    live_mutants
    rls_mutant
    ;;
  rolling-upgrade)
    helm upgrade zoen \
      "oci://${registry_address}/zoen/charts/zoen" \
      --version "${chart_version}" \
      --plain-http \
      --namespace "${application_namespace}" \
      --values "${profile_values}" \
      --values "${overlay_values}" \
      --values "${generated_directory}/ports.yaml" \
      --set-string "migration.compatibility=previous" \
      "${artifact_flags[@]}"
    wait_for_application "${application_namespace}"
    helm upgrade zoen \
      "oci://${registry_address}/zoen/charts/zoen" \
      --version "${chart_version}" \
      --plain-http \
      --namespace "${application_namespace}" \
      --values "${profile_values}" \
      --values "${overlay_values}" \
      --values "${generated_directory}/ports.yaml" \
      --set-string "migration.compatibility=current" \
      "${artifact_flags[@]}"
    wait_for_application "${application_namespace}"
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    run_semantic digest
    local_digest="$(
      node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).authorityDigest)' \
        "${artifacts_directory}/authority-digest.json"
    )"
    helm rollback zoen --namespace "${application_namespace}"
    wait_for_application "${application_namespace}"
    run_semantic verify "${artifacts_directory}/semantic-initial.json"
    run_semantic digest
    test "$(
      node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).authorityDigest)' \
        "${artifacts_directory}/authority-digest.json"
    )" = "${local_digest}"
    pass rolling-upgrade \
      "compatible rolling upgrade and application rollback preserved semantic history" \
      "${recovery_file}"
    ;;
  rpo-rto)
    : >"${artifacts_directory}/canaries.jsonl"
    for _ in $(seq 1 8); do
      run_semantic canary
      sleep 5
    done
    kubectl --namespace "${durable_namespace}" exec sts/postgres -- \
      psql -U postgres -d zoen -c "SELECT pg_switch_wal();"
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
