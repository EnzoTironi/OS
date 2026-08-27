import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cacheDirectory = path.join(repositoryRoot, ".cache", "zoen-lint");
const toolsDirectory = path.join(cacheDirectory, "bin");
const workDirectory = await mkdtemp(path.join(tmpdir(), "zoen-helm-secrets-"));
const digest = "a".repeat(64);
const imageDigest = `sha256:${digest}`;
const realmPath = path.join(workDirectory, "realm.json");
const overlayPath = path.join(workDirectory, "overlay-deps.yaml");
const referencePath = path.join(workDirectory, "reference-deps.yaml");
const applicationPath = path.join(workDirectory, "application.yaml");

await mkdir(toolsDirectory, { recursive: true });
await writeFile(realmPath, "{}\n");

const install = spawnSync(
  "bash",
  [
    "-c",
    [
      "set -euo pipefail",
      `source "${path.join(repositoryRoot, "e2e/lib/kubernetes.sh")}"`,
      `zoen_install_helm "${cacheDirectory}" "${toolsDirectory}"`,
    ].join("\n"),
  ],
  { cwd: repositoryRoot, encoding: "utf8" },
);
if (install.status !== 0) {
  process.stderr.write(install.stderr || install.stdout || "helm install failed\n");
  process.exit(1);
}

const helm = path.join(toolsDirectory, "helm");
const artifactFlags = [
  "--set-string",
  `definitionDigest=${digest}`,
  "--set-string",
  `images.rust.digest=${imageDigest}`,
  "--set-string",
  `images.node.digest=${imageDigest}`,
];

await writeFile(
  overlayPath,
  helmTemplate([
    "template",
    "zoen-dependencies",
    "deploy/helm/zoen",
    "--namespace",
    "zoen-dedicated-durable",
    "--values",
    "deploy/helm/zoen/profiles/dedicated.yaml",
    "--values",
    "deploy/helm/zoen/overlays/reliability.yaml",
    "--set",
    "applications.enabled=false",
    "--set",
    "reference.enabled=true",
    "--set-file",
    `keycloak.realmJson=${realmPath}`,
    ...artifactFlags,
  ]),
);
await writeFile(
  referencePath,
  helmTemplate([
    "template",
    "zoen-dependencies",
    "deploy/helm/zoen",
    "--namespace",
    "zoen-dedicated-durable",
    "--values",
    "deploy/helm/zoen/profiles/dedicated.yaml",
    "--set",
    "applications.enabled=false",
    "--set",
    "reference.enabled=true",
    "--set-file",
    `keycloak.realmJson=${realmPath}`,
    ...artifactFlags,
  ]),
);
await writeFile(
  applicationPath,
  helmTemplate([
    "template",
    "zoen",
    "deploy/helm/zoen",
    "--namespace",
    "zoen-dedicated",
    "--values",
    "deploy/helm/zoen/profiles/dedicated.yaml",
    "--values",
    "deploy/helm/zoen/overlays/reliability.yaml",
    ...artifactFlags,
  ]),
);

const rendered = [
  ["overlay", overlayPath],
  ["reference", referencePath],
  ["application", applicationPath],
];
const hits = [];
for (const [name, file] of rendered) {
  const text = await readFile(file, "utf8");
  if (/PASSWORD '/u.test(text)) {
    hits.push({ rule: "password-literal", file: name });
  }
}
if (hits.length > 0) {
  process.stderr.write(
    `${JSON.stringify({ rule: "helm-secret-literals", hits }, null, 2)}\n`,
  );
  process.exit(1);
}

const verify = spawnSync(
  process.execPath,
  [
    path.join(repositoryRoot, "e2e/reliability/verify-topology.mjs"),
    overlayPath,
    referencePath,
    applicationPath,
  ],
  { cwd: repositoryRoot, encoding: "utf8" },
);
if (verify.status !== 0) {
  process.stderr.write(verify.stderr || verify.stdout || "verify-topology failed\n");
  process.exit(verify.status === null ? 1 : verify.status);
}

process.stdout.write(
  `${JSON.stringify({
    rule: "helm-secret-literals",
    rendered: rendered.map(([name]) => name),
    hits: [],
  })}\n`,
);

function helmTemplate(args) {
  const result = spawnSync(helm, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "helm template failed\n");
    process.exit(1);
  }
  return result.stdout;
}
