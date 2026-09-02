#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const preparedBuildVersion = 2;

const bundleRoots = ["dist", "apps/auth/dist"];
const launchablePaths = [
  "target/debug/zoen",
  "target/debug/zoen-effect-dispatcher",
  "target/debug/zoen-http-connector",
  "target/debug/zoen-projection",
];
const digestPattern = /^[0-9a-f]{64}$/;
const sourceShaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  await main(process.argv[2] ?? "");
}

async function main(mode) {
  if (mode === "snapshot") {
    const repository = await exactRepository(flag("--repository"));
    const sourceSha = sourceShaValue(flag("--source-sha"));
    process.stdout.write(
      `${canonicalJson(await preparedArtifactSnapshot(repository, sourceSha))}\n`,
    );
  } else if (mode === "verify") {
    const repository = await exactRepository(flag("--repository"));
    const manifestPath = path.resolve(flag("--manifest"));
    const manifest = await verifyPreparedArtifacts(repository, manifestPath);
    process.stdout.write(`${manifest.buildIdentity}\n`);
  } else if (mode === "proof-mutation") {
    await proveArtifactMutation();
    process.stdout.write(
      `${JSON.stringify({ artifactMutationInvalidatedPreparedBuild: true, version: 1 })}\n`,
    );
  } else {
    throw new Error(`unknown prepared-artifacts command ${JSON.stringify(mode)}`);
  }
}

export async function preparedArtifactSnapshot(repository, sourceSha) {
  const artifacts = [];
  for (const root of bundleRoots) {
    artifacts.push(...(await bundleArtifacts(repository, root)));
  }
  for (const relative of launchablePaths) {
    artifacts.push(await launchableArtifact(repository, relative));
  }
  artifacts.sort((left, right) => left.path.localeCompare(right.path, "en"));
  const identity = { artifacts, sourceSha: sourceShaValue(sourceSha), version: 2 };
  return {
    ...identity,
    buildIdentity: sha256(Buffer.from(canonicalJson(identity), "utf8")),
  };
}

export async function verifyPreparedArtifacts(repository, manifestPath) {
  const manifest = parsePreparedBuild(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  assertCleanExactSource(repository, manifest.sourceSha);
  const current = await preparedArtifactSnapshot(repository, manifest.sourceSha);
  if (
    manifest.buildIdentity !== current.buildIdentity ||
    canonicalJson(manifest.artifacts) !== canonicalJson(current.artifacts)
  ) {
    throw new Error(
      `prepared artifacts no longer match ${manifestPath}; run just prepare`,
    );
  }
  return manifest;
}

async function bundleArtifacts(repository, relativeRoot) {
  const lexicalRoot = path.join(repository, ...relativeRoot.split("/"));
  const rootMetadata = await lstat(lexicalRoot);
  if (rootMetadata.isSymbolicLink()) {
    const target = await realpath(lexicalRoot);
    const targetMetadata = await lstat(target);
    if (!targetMetadata.isDirectory()) {
      throw new Error(`prepared bundle root ${relativeRoot} is not a directory`);
    }
  } else if (!rootMetadata.isDirectory()) {
    throw new Error(`prepared bundle root ${relativeRoot} is not a directory`);
  }
  const artifacts = [];
  await walkBundle(lexicalRoot, relativeRoot, artifacts);
  if (artifacts.length === 0) {
    throw new Error(`prepared bundle root ${relativeRoot} is empty`);
  }
  return artifacts;
}

async function walkBundle(directory, relativeDirectory, artifacts) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`prepared bundle contains nested symlink ${relative}`);
    }
    if (entry.isDirectory()) {
      await walkBundle(absolute, relative, artifacts);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`prepared bundle contains unsupported entry ${relative}`);
    }
    artifacts.push({
      kind: "bundle",
      path: relative,
      sha256: await sha256File(absolute),
    });
  }
}

async function launchableArtifact(repository, relative) {
  const absolute = path.join(repository, ...relative.split("/"));
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`prepared launchable ${relative} must be a regular file`);
  }
  const executable = (metadata.mode & 0o111) !== 0;
  if (!executable) {
    throw new Error(`prepared launchable ${relative} is not executable`);
  }
  return {
    executable: true,
    kind: "launchable",
    path: relative,
    sha256: await sha256File(absolute),
  };
}

async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(file);
    input.once("error", reject);
    input.once("end", resolve);
    input.on("data", (chunk) => hash.update(chunk));
  });
  return hash.digest("hex");
}

function parsePreparedBuild(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("prepared build must be an object");
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "artifacts",
    "buildIdentity",
    "preparedAt",
    "sourceSha",
    "version",
  ];
  if (canonicalJson(keys) !== canonicalJson(expectedKeys)) {
    throw new Error("prepared build has an invalid schema");
  }
  if (
    value.version !== preparedBuildVersion ||
    typeof value.preparedAt !== "string" ||
    !sourceShaPattern.test(value.sourceSha ?? "") ||
    !digestPattern.test(value.buildIdentity ?? "") ||
    !Array.isArray(value.artifacts)
  ) {
    throw new Error("prepared build has invalid values");
  }
  const artifacts = value.artifacts.map(parseArtifact);
  if (
    canonicalJson(artifacts.map((artifact) => artifact.path)) !==
    canonicalJson(
      artifacts.map((artifact) => artifact.path).sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    ) ||
    new Set(artifacts.map((artifact) => artifact.path)).size !== artifacts.length
  ) {
    throw new Error("prepared artifact paths must be unique and sorted");
  }
  return { ...value, artifacts };
}

function parseArtifact(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("prepared artifact must be an object");
  }
  const common =
    typeof value.path === "string" &&
    isRepositoryRelativePosix(value.path) &&
    digestPattern.test(value.sha256 ?? "");
  if (!common) {
    throw new Error("prepared artifact has invalid path or digest");
  }
  if (
    value.kind === "bundle" &&
    canonicalJson(Object.keys(value).sort()) ===
      canonicalJson(["kind", "path", "sha256"])
  ) {
    return { kind: "bundle", path: value.path, sha256: value.sha256 };
  }
  if (
    value.kind === "launchable" &&
    value.executable === true &&
    canonicalJson(Object.keys(value).sort()) ===
      canonicalJson(["executable", "kind", "path", "sha256"])
  ) {
    return {
      executable: true,
      kind: "launchable",
      path: value.path,
      sha256: value.sha256,
    };
  }
  throw new Error(`prepared artifact ${value.path} has an invalid shape`);
}

function isRepositoryRelativePosix(value) {
  return (
    value !== "" &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exactRepository(candidate) {
  const absolute = path.resolve(candidate);
  const resolved = await realpath(absolute);
  if (resolved !== absolute) {
    throw new Error(`repository must be a real path: ${absolute}`);
  }
  return resolved;
}

function sourceShaValue(value) {
  if (!sourceShaPattern.test(value)) {
    throw new Error("source SHA must be a 40- or 64-character lowercase digest");
  }
  return value;
}

function assertCleanExactSource(repository, expectedSourceSha) {
  const head = git(repository, ["rev-parse", "HEAD"]);
  if (head !== expectedSourceSha) {
    throw new Error(
      `prepared source ${expectedSourceSha} does not match checked-out HEAD ${head}`,
    );
  }
  const dirty = git(repository, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (dirty !== "") {
    throw new Error(`prepared artifact verification requires a clean worktree:\n${dirty}`);
  }
}

function git(repository, arguments_) {
  const result = spawnSync("/usr/bin/git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    env: { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    killSignal: "SIGKILL",
    timeout: 30_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function flag(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function proveArtifactMutation() {
  const work = await mkdtemp(path.join(tmpdir(), "zoen-prepared-artifacts-proof-"));
  try {
    const root = await realpath(work);
    await mkdir(path.join(root, "dist"), { recursive: true });
    await mkdir(path.join(root, "apps", "auth", "dist"), { recursive: true });
    await mkdir(path.join(root, "target", "debug"), { recursive: true });
    await writeFile(path.join(root, "dist", "runtime.js"), "first\n", {
      flag: "wx",
    });
    await writeFile(
      path.join(root, "apps", "auth", "dist", "server.mjs"),
      "auth\n",
      { flag: "wx" },
    );
    for (const relative of launchablePaths) {
      const launchable = path.join(root, ...relative.split("/"));
      await writeFile(launchable, randomBytes(32), { flag: "wx" });
      await chmod(launchable, 0o755);
    }
    await writeFile(
      path.join(root, ".gitignore"),
      ".cache/\napps/auth/dist/\ndist/\ntarget/\n",
      { flag: "wx" },
    );
    runGit(root, ["init", "--quiet"]);
    runGit(root, ["config", "user.email", "proof@zoen.local"]);
    runGit(root, ["config", "user.name", "Zoen Proof"]);
    runGit(root, ["add", ".gitignore"]);
    runGit(root, ["commit", "--quiet", "-m", "prepared artifact proof"]);
    const sourceSha = git(root, ["rev-parse", "HEAD"]);
    const before = await preparedArtifactSnapshot(root, sourceSha);
    const manifestPath = path.join(root, ".cache", "e2e", "prepared.json");
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      `${canonicalJson({ ...before, preparedAt: new Date().toISOString() })}\n`,
      { flag: "wx" },
    );
    assertVerificationOutcome(root, manifestPath, true);
    await writeFile(path.join(root, "dist", "runtime.js"), "second\n");
    assertVerificationOutcome(root, manifestPath, false);
    await writeFile(path.join(root, "dist", "runtime.js"), "first\n");
    await chmod(path.join(root, launchablePaths[0]), 0o644);
    assertVerificationOutcome(root, manifestPath, false);
  } finally {
    await rm(work, { force: true, recursive: true });
  }
}

function assertVerificationOutcome(repository, manifestPath, expectedSuccess) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "verify",
      "--repository",
      repository,
      "--manifest",
      manifestPath,
    ],
    {
      cwd: repository,
      encoding: "utf8",
      env: process.env,
      killSignal: "SIGKILL",
      timeout: 30_000,
    },
  );
  const succeeded = result.error === undefined && result.status === 0;
  if (succeeded !== expectedSuccess) {
    throw new Error(
      `prepared artifact verifier ${expectedSuccess ? "rejected valid bytes" : "accepted mutated bytes"}: ${result.error?.message ?? result.stderr}`,
    );
  }
}

function runGit(repository, arguments_) {
  const result = spawnSync("/usr/bin/git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    env: { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    killSignal: "SIGKILL",
    timeout: 30_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
}
