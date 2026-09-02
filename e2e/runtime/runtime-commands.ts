import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomically } from "../journey-run-context.js";
import {
  nonceSchema,
  preparedArtifactSnapshotSchema,
} from "./runtime-contracts.js";
import {
  optionalFlag,
  positiveInteger,
  requiredFlag,
} from "./runtime-config.js";
import {
  shellQuote,
  writeTextAtomically,
} from "./runtime-support.js";
import {
  assertCleanWorktree,
  git,
} from "./runtime-process-authority.js";
import {
  acquireOwnedLock,
  assertActivePreparationWriter,
  preparedArtifactSnapshot,
  preparedBuildPath,
  releaseOwnedLock,
  runtimeRegistryRoot,
} from "./runtime-registry.js";
import {
  latestCompletedContext,
  loadCanonicalActiveContext,
  loadCanonicalCompletedContext,
  readOptionalPointer,
  repositoryForContextFile,
} from "./runtime-context.js";
import {
  authorizeCleanup,
  cleanupContext,
  drainCleanupRecoveries,
  reconcileActiveLeases,
} from "./runtime-cleanup-recovery.js";

export async function shellEnvironmentCommand(): Promise<void> {
  const contextFile = path.resolve(requiredFlag("--context"));
  const repository = await realpath(process.cwd());
  const context = await loadCanonicalActiveContext(contextFile, repository);
  const environment: Record<string, string> = {
    ZOEN_E2E_ADAPTER_PORT: String(context.ports.adapter),
    ZOEN_E2E_ARTIFACTS_DIR: context.paths.artifacts,
    ZOEN_E2E_ATTEMPT: String(context.attempt),
    ZOEN_E2E_AUTH_NAME: context.httpNames.auth,
    ZOEN_E2E_AUTH_PORT: String(context.ports.auth),
    ZOEN_E2E_BUILD_IDENTITY: context.buildIdentity,
    ZOEN_E2E_CONNECTOR_PORT: String(context.ports.connector),
    ZOEN_E2E_CONTEXT_FILE: contextFile,
    ZOEN_E2E_EFFECT_PROVIDER_PORT: String(context.ports.provider),
    ZOEN_E2E_EFFECT_WORKER_PORT: String(context.ports.effectWorker),
    ZOEN_E2E_GENERATED_DIR: context.paths.generated,
    ZOEN_E2E_KEYCLOAK_PORT: String(context.ports.keycloak),
    ZOEN_E2E_LOGS_DIR: context.paths.logs,
    ZOEN_E2E_MINIO_PORT: String(context.ports.minio),
    ZOEN_E2E_OWNER_TOKEN: context.lease.ownerToken,
    ZOEN_E2E_PLUGNOTAS_ADAPTER_PORT: String(context.ports.adapter),
    ZOEN_E2E_POSTGRES_PORT: String(context.ports.postgres),
    ZOEN_E2E_PROCESS_DIR: context.paths.process,
    ZOEN_E2E_PROTHEUS_ADAPTER_PORT: String(context.ports.adapter),
    ZOEN_E2E_PROVIDER_PORT: String(context.ports.provider),
    ZOEN_E2E_RESTATE_INGRESS_PORT: String(context.ports.restateIngress),
    ZOEN_E2E_RESTATE_NODE_PORT: String(context.ports.restateNode),
    ZOEN_E2E_RESTATE_UI_PORT: String(context.ports.restateUi),
    ZOEN_E2E_RUN_ID: context.runId,
    ZOEN_E2E_RUN_ROOT: context.paths.runRoot,
    ZOEN_E2E_SUITE_ID: context.suiteId,
    ZOEN_E2E_SYSTAX_ADAPTER_PORT: String(context.ports.adapter),
    ZOEN_E2E_WORKER_CONTROL_PORT: String(context.ports.workerControl),
    ZOEN_E2E_WORKER_PORT: String(context.ports.worker),
    ZOEN_E2E_ZOEND_NAME: context.httpNames.zoend,
    ZOEN_E2E_ZOEND_PORT: String(context.ports.zoend),
    ZOEN_AUTH_BASE_URL: `http://127.0.0.1:${context.ports.auth}`,
  };
  if (context.compose.kind === "compose") {
    environment.ZOEN_E2E_COMPOSE_FILE = context.compose.baseFile;
    environment.ZOEN_E2E_COMPOSE_OVERRIDE = context.compose.overrideFile;
    environment.ZOEN_E2E_COMPOSE_PROJECT = context.compose.project;
  }
  for (const [name, value] of Object.entries(environment)) {
    process.stdout.write(`export ${name}=${shellQuote(value)}\n`);
  }
}

export async function writeComposeOverrideCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const context = await loadCanonicalActiveContext(
    path.resolve(requiredFlag("--context")),
    repository,
  );
  if (context.compose.kind !== "compose") {
    throw new Error("cannot write a Compose override for a host-only journey");
  }
  const services = requiredFlag("--services").split(",").filter(Boolean);
  const declaredVolumes =
    optionalFlag("--volumes")?.split(",").filter(Boolean) ?? [];
  const volumes = [...new Set([...declaredVolumes, "zoen-run-owner"])];
  if (
    services.length === 0 ||
    [...services, ...volumes].some(
      (name) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name),
    )
  ) {
    throw new Error("Compose services and volumes must have validated names");
  }
  const lines = ["services:"];
  for (const service of services) {
    lines.push(
      `  ${service}:`,
      "    labels:",
      `      zoen.e2e.owner: ${JSON.stringify(context.lease.ownerToken)}`,
      `      zoen.e2e.run: ${JSON.stringify(context.runId)}`,
      `      zoen.e2e.suite: ${JSON.stringify(context.suiteId)}`,
    );
    if (service === "postgres") {
      lines.push(
        "    volumes:",
        "      - zoen-run-owner:/var/run/zoen-e2e-owner",
      );
    } else if (service === "keycloak") {
      lines.push(
        "    volumes:",
        `      - ${JSON.stringify(`${context.paths.generated}/realm.json:/opt/keycloak/data/import/realm.json:ro`)}`,
      );
    }
  }
  lines.push(
    "networks:",
    "  default:",
    "    labels:",
    `      zoen.e2e.owner: ${JSON.stringify(context.lease.ownerToken)}`,
    `      zoen.e2e.run: ${JSON.stringify(context.runId)}`,
    `      zoen.e2e.suite: ${JSON.stringify(context.suiteId)}`,
  );
  lines.push("volumes:");
  for (const volume of volumes) {
    lines.push(
      `  ${volume}:`,
      "    labels:",
      `      zoen.e2e.owner: ${JSON.stringify(context.lease.ownerToken)}`,
      `      zoen.e2e.run: ${JSON.stringify(context.runId)}`,
      `      zoen.e2e.suite: ${JSON.stringify(context.suiteId)}`,
    );
  }
  await writeTextAtomically(context.compose.overrideFile, `${lines.join("\n")}\n`);
}

export async function writePointerCommand(): Promise<void> {
  const contextFile = path.resolve(requiredFlag("--context"));
  const repository = await realpath(process.cwd());
  const context = await loadCanonicalActiveContext(contextFile, repository);
  const output = path.resolve(requiredFlag("--output"));
  const pointerLock = await acquireOwnedLock(
    `${output}.lock`,
    "journey context pointer publication",
  );
  try {
    const current = await readOptionalPointer(output);
    if (current !== undefined) {
      if (
        current.runId !== context.runId ||
        current.scenario !== context.scenario ||
        current.suiteId !== context.suiteId
      ) {
        throw new Error(`journey context pointer ${output} belongs to another run`);
      }
      if (current.attempt > context.attempt) {
        return;
      }
      if (
        current.attempt === context.attempt &&
        current.contextFile !== contextFile
      ) {
        throw new Error(`attempt ${context.attempt} has conflicting context pointers`);
      }
    }
    await writeJsonAtomically(output, {
      attempt: context.attempt,
      contextFile,
      runId: context.runId,
      scenario: context.scenario,
      suiteId: context.suiteId,
      version: 1,
    });
  } finally {
    await releaseOwnedLock(pointerLock);
  }
}

export async function resolvePointerCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const context = await latestCompletedContext(
    path.resolve(requiredFlag("--pointer")),
    repository,
  );
  process.stdout.write(`${path.join(context.paths.runRoot, "context.json")}\n`);
}

export async function markPreparedCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const writerPid = positiveInteger(
    requiredFlag("--writer-pid"),
    "--writer-pid",
  );
  const writerNonce = nonceSchema.parse(requiredFlag("--writer-nonce"));
  assertCleanWorktree(repository);
  const registryRoot = await runtimeRegistryRoot(repository);
  const initialLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "prepared build publication",
  );
  try {
    await assertActivePreparationWriter(registryRoot, writerPid, writerNonce);
  } finally {
    await releaseOwnedLock(initialLock);
  }
  const sourceSha = git(repository, ["rev-parse", "HEAD"]);
  const snapshot = preparedArtifactSnapshot(repository, sourceSha);
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "prepared build publication",
  );
  try {
    await assertActivePreparationWriter(registryRoot, writerPid, writerNonce);
    assertCleanWorktree(repository);
    if (git(repository, ["rev-parse", "HEAD"]) !== sourceSha) {
      throw new Error("source HEAD changed while preparing artifact provenance");
    }
    await writeJsonAtomically(preparedBuildPath(repository), {
      ...snapshot,
      preparedAt: new Date().toISOString(),
    });
    process.stdout.write(`${snapshot.buildIdentity}\n`);
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

export async function reconcileCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  await mkdir(slotsRoot, { recursive: true });
  const startedAt = Date.now();
  for (;;) {
    const allocationLock = await acquireOwnedLock(
      path.join(registryRoot, "allocation.lock"),
      "journey reconciliation",
    );
    let active: Awaited<ReturnType<typeof reconcileActiveLeases>>;
    try {
      active = await reconcileActiveLeases(slotsRoot);
    } finally {
      await releaseOwnedLock(allocationLock);
    }
    if (active.uncertain) {
      throw new Error(
        "journey reconciliation is blocked by quarantined or incomplete state",
      );
    }
    if (active.recoveries.length > 0) {
      await drainCleanupRecoveries(active.recoveries, startedAt);
      continue;
    }
    process.stdout.write(
      `${JSON.stringify({
        leases: active.leases.map((lease) => ({
          runId: lease.runId,
          scenario: lease.scenario,
          suiteId: lease.suiteId,
        })),
        uncertain: false,
      })}\n`,
    );
    return;
  }
}

export async function markResultCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const contextFile = path.resolve(requiredFlag("--context"));
  const context = await loadCanonicalActiveContext(contextFile, repository);
  const status = requiredFlag("--status");
  if (status !== "passed" && status !== "failed") {
    throw new Error("--status must be passed or failed");
  }
  await writeJsonAtomically(path.join(context.paths.runRoot, "result.json"), {
    buildIdentity: context.buildIdentity,
    finishedAt: new Date().toISOString(),
    ownerToken: context.lease.ownerToken,
    sourceSha: context.sourceSha,
    status,
    version: 1,
  });
}

export async function cleanupCommand(): Promise<void> {
  const currentRepository = await realpath(process.cwd());
  const contextFile = path.resolve(requiredFlag("--context"));
  const repository = await repositoryForContextFile(
    contextFile,
    currentRepository,
  );
  const context = await loadCanonicalCompletedContext(contextFile, repository);
  authorizeCleanup(context);
  await cleanupContext(context);
}
