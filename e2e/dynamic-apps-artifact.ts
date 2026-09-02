/**
 * Dynamic Apps build-artifact cache for e2e.
 *
 * The engine-side deployApp build (buildRelease in @rivet-dev/dynamic-apps-core)
 * packs the release with a guest `tar` writing into a writable host-dir mount.
 * The AgentOs runtime denies guest-process writes to native host-dir mounts on
 * Linux, so that pack step can never complete in CI. This module replicates
 * buildRelease step for step but tars /release to an in-guest path and reads
 * the bytes out through the runtime control plane (vm.readFile), which is not
 * subject to the host-mount restriction. The resulting aospkg is written to
 * DYNAMIC_APPS_E2E_ARTIFACT_CACHE so the deploy actor's artifactCache lookup
 * hits and skips the VM build entirely.
 *
 * The build inputs (planted app files) are constant, so the content-addressed
 * buildId is stable across runs.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

type ExecResult = { exitCode: number; stdout: string; stderr: string };
type BuildVm = {
  writeFiles: (
    entries: { path: string; content: Uint8Array }[],
  ) => Promise<{ success: boolean; path: string; error?: string }[]>;
  execArgv: (
    command: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string>; timeout?: number; captureStdio?: boolean },
  ) => Promise<ExecResult>;
  readFile: (path: string) => Promise<Uint8Array>;
  dispose: () => Promise<void>;
};

// Mirrors DEFAULT_BUILD_CONFIG in @rivet-dev/dynamic-apps-core.
const BUILD_TIMEOUT_MS = 15 * 60_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_BUILD_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_BUILD_ARTIFACT_FILES = 4096;
const MAX_BUILD_ARTIFACT_FILE_BYTES = 32 * 1024 * 1024;
const MAX_BUILD_FILESYSTEM_BYTES = 2 * 1024 * 1024 * 1024;

function failBuild(step: string, result: ExecResult): never {
  const stderr = result.stderr.slice(0, 4096);
  const stdout = result.stdout.slice(0, 2048);
  throw new Error(
    `dynamic apps artifact build failed at ${step} (exit ${result.exitCode}): ${stderr || stdout}`,
  );
}

export async function ensureDynamicAppsArtifact(options: {
  repositoryRoot: string;
  cacheDir: string;
  appId: string;
  files: Record<string, string>;
  log?: (message: string) => void;
}): Promise<{ buildId: string; artifactPath: string; built: boolean }> {
  const log = options.log ?? (() => {});
  const workerModules = path.join(
    options.repositoryRoot,
    "apps/effect-worker/node_modules",
  );
  const importModule = async (relativePath: string) =>
    (await import(
      pathToFileURL(path.join(workerModules, relativePath)).href
    )) as Record<string, unknown>;
  const builderPackage = (await importModule(
    "@rivet-dev/dynamic-apps-builder/dist/index.js",
  )) as unknown as {
    default: { packagePath: string };
    appsBuilderVersion: string;
    appBundleManifestVersion: number;
  };
  const { AgentOs } = (await importModule(
    "@rivet-dev/agentos-core/dist/index.js",
  )) as { AgentOs: { create: (opts: unknown) => Promise<BuildVm> } };
  const shModule = await importModule("@agentos-software/sh/dist/index.js");
  const sh = shModule.default ?? shModule;
  const tarModule = await importModule("@agentos-software/tar/dist/index.js");
  const tar = tarModule.default ?? tarModule;
  const { packAospkgFromTarBytes } = (await importModule(
    "@rivet-dev/agentos-toolchain/dist/index.js",
  )) as { packAospkgFromTarBytes: (tarBytes: Buffer) => { bytes: Uint8Array } };
  const internal = (await import(
    pathToFileURL(
      path.join(
        workerModules,
        "@rivet-dev/dynamic-apps-core/dist/internal.js",
      ),
    ).href
  )) as {
    canonicalDeploymentHash: (input: {
      files: Record<string, Uint8Array>;
      entrypoint: string;
      build: boolean;
      packagingIdentity: string;
    }) => string;
    directRunnerSource: (input: {
      entrypoint: string;
      release: string;
      maxResponseBytes: number;
    }) => string;
    normalizeAppPath: (path: string) => string;
    DIRECT_BUNDLE_PATH: string;
  };

  // validateDeployment for the planted quadro app: package.json declares
  // main "dist/index.js" and scripts.build "tsc"; no rivetkit dependency.
  const packageJson = JSON.parse(options.files["package.json"] ?? "{}") as {
    main?: string;
    scripts?: { build?: string };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const plan = {
    entrypoint: internal.normalizeAppPath(packageJson.main ?? "src/index.js"),
    build: typeof packageJson.scripts?.build === "string",
    usesRivetKit: [packageJson.dependencies, packageJson.devDependencies].some(
      (deps) => typeof deps?.rivetkit === "string",
    ),
  };
  if (plan.usesRivetKit) {
    throw new Error("artifact cache builder only supports direct apps");
  }
  const fileBytes: Record<string, Uint8Array> = {};
  for (const [filePath, text] of Object.entries(options.files)) {
    fileBytes[filePath] = new TextEncoder().encode(text);
  }
  const packagingIdentity = [
    `apps-builder@${builderPackage.appsBuilderVersion}`,
    `manifest@${builderPackage.appBundleManifestVersion}`,
    "direct@2",
    `actors@${plan.usesRivetKit ? 1 : 0}`,
    "esbuild-wasm@0.27.4",
  ].join(";");
  const buildId = internal.canonicalDeploymentHash({
    files: fileBytes,
    entrypoint: plan.entrypoint,
    build: plan.build,
    packagingIdentity,
  });
  const artifactPath = path.join(options.cacheDir, `${buildId}.aospkg`);
  try {
    await fs.access(artifactPath);
    log(`dynamic apps artifact cache hit: ${buildId}`);
    return { buildId, artifactPath, built: false };
  } catch {
    // cache miss: build below
  }

  log(`dynamic apps artifact cache miss: ${buildId}; building in VM`);
  const vm = (await AgentOs.create({
    defaultSoftware: false,
    software: [sh, tar, builderPackage.default],
    permissions: {
      fs: "allow",
      childProcess: "allow",
      process: "allow",
      env: "allow",
      network: "allow",
    },
    limits: {
      tls: { maxBufferedBytes: 16 * 1024 * 1024 },
      jsRuntime: { v8HeapLimitMb: 1024 },
      resources: {
        maxProcesses: 64,
        maxOpenFds: 2048,
        maxPreadBytes: 15 * 1024 * 1024,
        maxFdWriteBytes: 16 * 1024 * 1024,
        maxSocketBufferedBytes: 16 * 1024 * 1024,
        maxFilesystemBytes: MAX_BUILD_FILESYSTEM_BYTES,
      },
    },
  })) as BuildVm;
  try {
    const workspaceFiles = Object.entries(fileBytes).map(
      ([filePath, content]) => ({
        path: `/workspace/${internal.normalizeAppPath(filePath)}`,
        content,
      }),
    );
    workspaceFiles.push({
      path: "/workspace/direct-runner.mjs",
      content: new TextEncoder().encode(
        internal.directRunnerSource({
          entrypoint: plan.entrypoint,
          release: buildId,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        }),
      ),
    });
    const writes = await vm.writeFiles(workspaceFiles);
    const failedWrite = writes.find((entry) => !entry.success);
    if (failedWrite) {
      throw new Error(`build input write failed: ${failedWrite.path}`);
    }
    const install = await vm.execArgv(
      "npm",
      [
        "install",
        "--install-strategy=shallow",
        "--include=dev",
        "--omit=optional",
        "--omit=peer",
        "--legacy-peer-deps",
        "--no-audit",
        "--no-fund",
        "--maxsockets=16",
        "--loglevel=error",
      ],
      {
        cwd: "/workspace",
        env: { NODE_ENV: "development", NPM_CONFIG_PRODUCTION: "false" },
        timeout: BUILD_TIMEOUT_MS,
        captureStdio: true,
      },
    );
    if (install.exitCode !== 0) failBuild("npm install", install);
    log("artifact build: dependencies installed");
    if (plan.build) {
      const buildStep = await vm.execArgv("npm", ["run", "build"], {
        cwd: "/workspace",
        timeout: BUILD_TIMEOUT_MS,
        captureStdio: true,
      });
      if (buildStep.exitCode !== 0) failBuild("npm run build", buildStep);
      log("artifact build: application built");
    }
    const prune = await vm.execArgv(
      "npm",
      ["prune", "--omit=dev", "--omit=optional", "--omit=peer", "--legacy-peer-deps"],
      { cwd: "/workspace", timeout: BUILD_TIMEOUT_MS, captureStdio: true },
    );
    if (prune.exitCode !== 0) failBuild("npm prune", prune);
    const directConfigPath = "/workspace/.agentos-app-direct-build.json";
    const configWrites = await vm.writeFiles([
      {
        path: directConfigPath,
        content: new TextEncoder().encode(
          JSON.stringify({
            version: buildId,
            workspace: "/workspace",
            release: "/release/direct",
            entrypoint: "direct-runner.mjs",
            sourceFiles: Object.keys(fileBytes),
            usesRivetKit: false,
            directAgentOs: true,
            maxOutputBytes: MAX_BUILD_ARTIFACT_BYTES,
            maxOutputFiles: MAX_BUILD_ARTIFACT_FILES,
            maxFileBytes: MAX_BUILD_ARTIFACT_FILE_BYTES,
          }),
        ),
      },
    ]);
    if (configWrites.some((entry) => !entry.success)) {
      throw new Error("failed to write apps-builder input");
    }
    const bundle = await vm.execArgv(
      "node",
      ["/opt/agentos/bin/apps-builder", directConfigPath],
      { cwd: "/workspace", timeout: BUILD_TIMEOUT_MS, captureStdio: true },
    );
    if (bundle.exitCode !== 0) failBuild("apps-builder (direct)", bundle);
    log("artifact build: release bundled");
    const validation = await vm.execArgv(
      "node",
      [
        "-e",
        `import("/release/${internal.DIRECT_BUNDLE_PATH}").then((module)=>{if(module.dynamicAppMetadata?.format!=="dynamic-apps-direct-v2"||typeof module.dispatch!=="function") throw new TypeError("invalid direct app handler")}).catch((error)=>{console.error(error);process.exitCode=1})`,
      ],
      { cwd: "/release", timeout: BUILD_TIMEOUT_MS, captureStdio: true },
    );
    if (validation.exitCode !== 0) failBuild("handler validation", validation);
    const manifestWrites = await vm.writeFiles([
      {
        path: "/release/agentos-package.json",
        content: new TextEncoder().encode(
          JSON.stringify({ name: "agentos-app", version: buildId }),
        ),
      },
    ]);
    if (manifestWrites.some((entry) => !entry.success)) {
      throw new Error("failed to write root package manifest");
    }
    // The stock build packs into a writable host-dir mount, which the runtime
    // denies on Linux. Tar to an in-guest path and read the bytes out through
    // the control plane instead.
    const pack = await vm.execArgv(
      "tar",
      ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-cf", "/tmp/agentos-app.tar", "."],
      { cwd: "/release", timeout: BUILD_TIMEOUT_MS, captureStdio: true },
    );
    if (pack.exitCode !== 0) failBuild("tar pack", pack);
    log("artifact build: release archived");
    const sourceTar = Buffer.from(await vm.readFile("/tmp/agentos-app.tar"));
    if (sourceTar.byteLength > MAX_BUILD_ARTIFACT_BYTES) {
      throw new Error(`artifact is ${sourceTar.byteLength} bytes, over limit`);
    }
    const artifact = packAospkgFromTarBytes(sourceTar).bytes;
    await fs.mkdir(options.cacheDir, { recursive: true });
    const temporary = `${artifactPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, artifact);
    await fs.rename(temporary, artifactPath);
    log(`dynamic apps artifact built: ${buildId} (${artifact.byteLength} bytes)`);
    return { buildId, artifactPath, built: true };
  } finally {
    await vm.dispose().catch(() => {});
  }
}
