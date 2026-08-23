#!/usr/bin/env bash
set -euo pipefail

registry="${1:?registry host is required}"
cosign_key_prefix="${2:?cosign key prefix is required}"
output="${3:?output path is required}"
cosign_private_key="${cosign_key_prefix}.key"
cosign_public_key="${cosign_key_prefix}.pub"
source_sha="$(git rev-parse HEAD)"
tag="${source_sha:0:12}"
rust_image="${registry}/zoen/rust:${tag}"
node_image="${registry}/zoen/node:${tag}"
chart_version="$(awk '$1 == "version:" {print $2}' deploy/helm/zoen/Chart.yaml)"

rust_binaries=(zoend zoen-effect-dispatcher zoen-http-connector zoen-projection)
for binary in "${rust_binaries[@]}"; do
  test -x "target/debug/${binary}"
done

# The rust OCI image is Ubuntu. Host `cargo build` on macOS produces Mach-O
# and those binaries exit 126 in kind. Rebuild ELF when the host bins are not Linux.
is_linux_elf() {
  file -b "$1" | grep -q '^ELF '
}

rust_context="target/debug"
if ! is_linux_elf "target/debug/zoend"; then
  rust_context="target/container-linux/debug"
  linux_bins_ready=1
  for binary in "${rust_binaries[@]}"; do
    if [[ ! -x "${rust_context}/${binary}" ]] || ! is_linux_elf "${rust_context}/${binary}"; then
      linux_bins_ready=0
      break
    fi
  done
  if [[ "${linux_bins_ready}" -eq 1 ]]; then
    while IFS= read -r _; do
      linux_bins_ready=0
      break
    done < <(
      find crates apps Cargo.lock Cargo.toml rust-toolchain.toml \
        \( -name '*.rs' -o -name 'Cargo.toml' -o -name 'Cargo.lock' -o -name 'rust-toolchain.toml' \) \
        -newer "${rust_context}/zoend" -print
    )
  fi
  if [[ "${linux_bins_ready}" -eq 0 ]]; then
    rust_channel="$(awk -F'"' '/^channel =/ { print $2; exit }' rust-toolchain.toml)"
    mkdir -p target/container-linux
    docker run --rm \
      --volume "${PWD}:/src" \
      --volume zoen-cargo-registry:/usr/local/cargo/registry \
      --volume zoen-cargo-git:/usr/local/cargo/git \
      --workdir /src \
      --env CARGO_TARGET_DIR=/src/target/container-linux \
      "rust:${rust_channel}-bookworm" \
      bash -c 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends pkg-config protobuf-compiler cmake clang binutils && cargo build --locked --package zoend && for binary in zoend zoen-effect-dispatcher zoen-http-connector zoen-projection; do strip --strip-debug "/src/target/container-linux/debug/${binary}"; done'
  fi
fi
for binary in "${rust_binaries[@]}"; do
  test -x "${rust_context}/${binary}"
  if ! is_linux_elf "${rust_context}/${binary}"; then
    echo "${rust_context}/${binary} is not a Linux ELF binary" >&2
    file -b "${rust_context}/${binary}" >&2
    exit 1
  fi
done

docker build \
  --file deploy/images/Dockerfile.rust \
  --tag "${rust_image}" \
  "${rust_context}"
docker build \
  --file deploy/images/Dockerfile.node \
  --tag "${node_image}" \
  .
docker push "${rust_image}"
docker push "${node_image}"

rust_ref="$(docker image inspect --format '{{index .RepoDigests 0}}' "${rust_image}")"
node_ref="$(docker image inspect --format '{{index .RepoDigests 0}}' "${node_image}")"
output_directory="$(dirname "${output}")"
signing_config="${output_directory}/cosign-signing-config.json"
mkdir -p "${output_directory}"
rust_sbom="${output_directory}/rust.spdx.json"
node_sbom="${output_directory}/node.spdx.json"
chart_sbom="${output_directory}/chart.spdx.json"
syft "${rust_image}" --output "spdx-json=${rust_sbom}"
syft "${node_image}" --output "spdx-json=${node_sbom}"
syft dir:deploy/helm/zoen --output "spdx-json=${chart_sbom}"
cosign signing-config create --out "${signing_config}"

cosign sign \
  --yes \
  --allow-insecure-registry \
  --signing-config "${signing_config}" \
  --key "${cosign_private_key}" \
  "${rust_ref}"
cosign sign \
  --yes \
  --allow-insecure-registry \
  --signing-config "${signing_config}" \
  --key "${cosign_private_key}" \
  "${node_ref}"
cosign attest \
  --yes \
  --allow-insecure-registry \
  --signing-config "${signing_config}" \
  --key "${cosign_private_key}" \
  --predicate "${rust_sbom}" \
  --type spdxjson \
  "${rust_ref}"
cosign attest \
  --yes \
  --allow-insecure-registry \
  --signing-config "${signing_config}" \
  --key "${cosign_private_key}" \
  --predicate "${node_sbom}" \
  --type spdxjson \
  "${node_ref}"

helm package deploy/helm/zoen --destination "${output_directory}"
chart_package="${output_directory}/zoen-${chart_version}.tgz"
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
  --signing-config "${signing_config}" \
  --key "${cosign_private_key}" \
  "${chart_ref}"
cosign attest \
  --yes \
  --allow-insecure-registry \
  --signing-config "${signing_config}" \
  --key "${cosign_private_key}" \
  --predicate "${chart_sbom}" \
  --type spdxjson \
  "${chart_ref}"

cosign verify \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_public_key}" \
  "${rust_ref}" >/dev/null
cosign verify \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_public_key}" \
  "${node_ref}" >/dev/null
cosign verify \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_public_key}" \
  "${chart_ref}" >/dev/null
cosign verify-attestation \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_public_key}" \
  --type spdxjson \
  "${rust_ref}" >/dev/null
cosign verify-attestation \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_public_key}" \
  --type spdxjson \
  "${node_ref}" >/dev/null
cosign verify-attestation \
  --allow-insecure-registry \
  --insecure-ignore-tlog \
  --key "${cosign_public_key}" \
  --type spdxjson \
  "${chart_ref}" >/dev/null

rust_digest="${rust_ref##*@}"
node_digest="${node_ref##*@}"
signature_digest() {
  local repository="$1"
  local digest="$2"
  local repository_path="${repository#${registry}/}"
  local referrer_tag="${digest/:/-}"
  curl --silent --show-error --head \
    --header 'Accept: application/vnd.oci.image.index.v1+json' \
    "http://${registry}/v2/${repository_path}/manifests/${referrer_tag}" |
    awk 'tolower($1) == "docker-content-digest:" {gsub("\r", "", $2); print $2}'
}
rust_signature_digest="$(signature_digest "${rust_ref%@*}" "${rust_digest}")"
node_signature_digest="$(signature_digest "${node_ref%@*}" "${node_digest}")"
chart_signature_digest="$(signature_digest "${chart_repository}" "${chart_digest}")"
test -n "${rust_signature_digest}"
test -n "${node_signature_digest}"
test -n "${chart_signature_digest}"
rust_sbom_digest="sha256:$(sha256sum "${rust_sbom}" | awk '{print $1}')"
node_sbom_digest="sha256:$(sha256sum "${node_sbom}" | awk '{print $1}')"
chart_sbom_digest="sha256:$(sha256sum "${chart_sbom}" | awk '{print $1}')"
chart_package_digest="sha256:$(sha256sum "${chart_package}" | awk '{print $1}')"
public_key_digest="sha256:$(sha256sum "${cosign_public_key}" | awk '{print $1}')"
printf '%s\n' \
  '{' \
  "  \"chartDigest\": \"${chart_digest}\"," \
  "  \"chartPackageDigest\": \"${chart_package_digest}\"," \
  "  \"chartRepository\": \"${chart_repository}\"," \
  "  \"chartSbomDigest\": \"${chart_sbom_digest}\"," \
  "  \"chartSignatureDigest\": \"${chart_signature_digest}\"," \
  "  \"chartVersion\": \"${chart_version}\"," \
  "  \"nodeDigest\": \"${node_digest}\"," \
  "  \"nodeRepository\": \"${node_ref%@*}\"," \
  "  \"nodeSbomDigest\": \"${node_sbom_digest}\"," \
  "  \"nodeSignatureDigest\": \"${node_signature_digest}\"," \
  "  \"publicKeyDigest\": \"${public_key_digest}\"," \
  "  \"rustDigest\": \"${rust_digest}\"," \
  "  \"rustRepository\": \"${rust_ref%@*}\"," \
  "  \"rustSbomDigest\": \"${rust_sbom_digest}\"," \
  "  \"rustSignatureDigest\": \"${rust_signature_digest}\"," \
  "  \"sourceSha\": \"${source_sha}\"" \
  '}' >"${output}"
