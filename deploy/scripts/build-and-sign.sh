#!/usr/bin/env bash
set -euo pipefail

registry="${1:?registry host is required}"
cosign_key="${2:?cosign private key path is required}"
output="${3:?output path is required}"
source_sha="$(git rev-parse HEAD)"
tag="${source_sha:0:12}"
rust_image="${registry}/zoen/rust:${tag}"
node_image="${registry}/zoen/node:${tag}"
chart_version="$(awk '$1 == "version:" {print $2}' deploy/helm/zoen/Chart.yaml)"

for binary in zoend zoen-effect-dispatcher zoen-http-connector zoen-projection; do
  test -x "target/debug/${binary}"
done

docker build \
  --file deploy/images/Dockerfile.rust \
  --tag "${rust_image}" \
  target/debug
docker build \
  --file deploy/images/Dockerfile.node \
  --tag "${node_image}" \
  .
docker push "${rust_image}"
docker push "${node_image}"

rust_ref="$(docker image inspect --format '{{index .RepoDigests 0}}' "${rust_image}")"
node_ref="$(docker image inspect --format '{{index .RepoDigests 0}}' "${node_image}")"

cosign sign \
  --yes \
  --allow-insecure-registry \
  --tlog-upload=false \
  --key "${cosign_key}" \
  "${rust_ref}"
cosign sign \
  --yes \
  --allow-insecure-registry \
  --tlog-upload=false \
  --key "${cosign_key}" \
  "${node_ref}"

mkdir -p "$(dirname "${output}")"
helm package deploy/helm/zoen --destination "$(dirname "${output}")"
chart_package="$(dirname "${output}")/zoen-${chart_version}.tgz"
helm push "${chart_package}" "oci://${registry}/zoen/charts" --plain-http
chart_repository="${registry}/zoen/charts/zoen"
chart_digest="$(
  curl --silent --show-error --head \
    --header 'Accept: application/vnd.oci.image.manifest.v1+json' \
    "http://${registry}/v2/zoen/charts/zoen/manifests/${chart_version}" |
    awk 'tolower($1) == "docker-content-digest:" {gsub("\r", "", $2); print $2}'
)"
test -n "${chart_digest}"
chart_ref="${chart_repository}@${chart_digest}"
cosign sign \
  --yes \
  --allow-insecure-registry \
  --tlog-upload=false \
  --key "${cosign_key}" \
  "${chart_ref}"

cosign verify \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_key}.pub" \
  "${rust_ref}" >/dev/null
cosign verify \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_key}.pub" \
  "${node_ref}" >/dev/null
cosign verify \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_key}.pub" \
  "${chart_ref}" >/dev/null

rust_digest="${rust_ref##*@}"
node_digest="${node_ref##*@}"
printf '%s\n' \
  '{' \
  "  \"chartDigest\": \"${chart_digest}\"," \
  "  \"chartRepository\": \"${chart_repository}\"," \
  "  \"chartVersion\": \"${chart_version}\"," \
  "  \"nodeDigest\": \"${node_digest}\"," \
  "  \"nodeRepository\": \"${node_ref%@*}\"," \
  "  \"rustDigest\": \"${rust_digest}\"," \
  "  \"rustRepository\": \"${rust_ref%@*}\"," \
  "  \"sourceSha\": \"${source_sha}\"" \
  '}' >"${output}"
