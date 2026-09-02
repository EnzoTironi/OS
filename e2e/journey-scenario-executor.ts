import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  journeyRunContext,
  reachJourneyBarrier,
} from "./journey-run-context.js";

const context = journeyRunContext();
const runnerPath = path.join(
  context.paths.repository,
  "dist",
  "e2e",
  `${context.scenario}.js`,
);

if (process.env.ZOEN_E2E_HOLD_SETUP === "1") {
  await reachJourneyBarrier("setup-ready");
}

if (context.compose.kind === "compose") {
  prepareComposeOverride();
  prepareCredentialRealm();
  compose("up", "--detach", "--wait");
  if (process.env.ZOEN_E2E_MINIO_KIND === "minio") {
    compose(
      "run",
      "--rm",
      "-T",
      "minio-client",
      "mb",
      "--ignore-existing",
      "local/zoen-projections",
    );
  }
}

process.argv[1] = runnerPath;
await import(pathToFileURL(runnerPath).href);

function prepareComposeOverride(): void {
  if (context.compose.kind !== "compose") {
    throw new Error("cannot prepare Compose for a host-only journey");
  }
  const baseArguments = [
    "compose",
    "--project-name",
    context.compose.project,
    "--file",
    context.compose.baseFile,
    "--profile",
    "tools",
    "config",
  ];
  const services = captureDocker([...baseArguments, "--services"])
    .split(/\s+/)
    .filter(Boolean)
    .join(",");
  const volumes = captureDocker([...baseArguments, "--volumes"])
    .split(/\s+/)
    .filter(Boolean)
    .join(",");
  execFileSync(
    process.execPath,
    [
      path.join(context.paths.repository, "dist", "e2e", "journey-runtime.js"),
      "write-compose-override",
      "--context",
      process.env.ZOEN_E2E_CONTEXT_FILE ?? "",
      "--services",
      services,
      "--volumes",
      volumes,
      "--runtime-owner-nonce",
      randomBytes(32).toString("hex"),
    ],
    {
      cwd: context.paths.repository,
      env: process.env,
      stdio: "inherit",
      timeout: 30_000,
    },
  );
}

function prepareCredentialRealm(): void {
  const configured = process.env.ZOEN_E2E_PREPARE_REALM;
  if (configured === undefined || configured === "") {
    return;
  }
  const expected = path.join(
    context.paths.repository,
    "dist",
    "e2e",
    "realms",
    context.scenario,
  ) + ".mjs";
  if (path.resolve(configured) !== expected) {
    throw new Error(`invalid realm preparation path for ${context.scenario}`);
  }
  execFileSync(process.execPath, [expected], {
    cwd: context.paths.repository,
    env: process.env,
    stdio: "inherit",
    timeout: 30_000,
  });
}

function compose(...arguments_: string[]): void {
  if (context.compose.kind !== "compose") {
    throw new Error("cannot run Compose for a host-only journey");
  }
  execFileSync(
    "docker",
    [
      "compose",
      "--project-name",
      context.compose.project,
      "--file",
      context.compose.baseFile,
      "--file",
      context.compose.overrideFile,
      ...arguments_,
    ],
    {
      cwd: context.paths.repository,
      env: process.env,
      stdio: "inherit",
      timeout: 300_000,
    },
  );
}

function captureDocker(arguments_: readonly string[]): string {
  return execFileSync("docker", arguments_, {
    cwd: context.paths.repository,
    encoding: "utf8",
    env: process.env,
    timeout: 30_000,
  });
}
