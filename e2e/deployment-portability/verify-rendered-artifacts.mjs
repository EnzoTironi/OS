import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [metadataPath, manifestPath] = process.argv.slice(2);
if (metadataPath === undefined || manifestPath === undefined) {
  throw new Error("usage: verify-rendered-artifacts.mjs <metadata> <manifest>");
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const manifest = await readFile(manifestPath, "utf8");
const expected = {
  node: `${metadata.nodeRepository}@${metadata.nodeDigest}`,
  rust: `${metadata.rustRepository}@${metadata.rustDigest}`,
};
const images = [...manifest.matchAll(/^\s*image:\s*"?([^"\s]+)"?\s*$/gmu)].map(
  (match) => match[1],
);
const nodeImages = images.filter((image) =>
  image?.startsWith(`${metadata.nodeRepository}@`),
);
const rustImages = images.filter((image) =>
  image?.startsWith(`${metadata.rustRepository}@`),
);

assert.ok(nodeImages.length > 0, "rendered chart has no Node application image");
assert.ok(rustImages.length > 0, "rendered chart has no Rust application image");
assert.ok(
  nodeImages.every((image) => image === expected.node),
  "rendered chart changed the signed Node artifact",
);
assert.ok(
  rustImages.every((image) => image === expected.rust),
  "rendered chart changed the signed Rust artifact",
);
assert.doesNotMatch(
  manifest,
  /ZOEN_(?:DEPLOYMENT_MODE|SELF_HOST_FEATURE|TENANT_AWARENESS_OFF)/u,
);
