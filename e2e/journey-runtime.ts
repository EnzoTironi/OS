import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:net";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  writeJsonAtomically,
  type JourneyRunContext,
} from "./journey-run-context.js";
import {
  journeyPortAt,
  journeyPortBlockWidth,
  journeyPortSlotCount,
  preferredJourneyPortSlot,
} from "./journey-runtime-layout.js";

const nonceSchema = z.string().regex(/^[0-9a-f]{64}$/);
const sourceShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const artifactPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      value
        .split("/")
        .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "must be a repository-relative POSIX path",
  );
const preparedArtifactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bundle"),
      path: artifactPathSchema,
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      executable: z.literal(true),
      kind: z.literal("launchable"),
      path: artifactPathSchema,
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
]);
const preparedArtifactsSchema = z
  .array(preparedArtifactSchema)
  .min(1)
  .superRefine((artifacts, context) => {
    const paths = artifacts.map((artifact) => artifact.path);
    const sorted = [...paths].sort((left, right) =>
      left.localeCompare(right, "en"),
    );
    if (
      new Set(paths).size !== paths.length ||
      paths.some((candidate, index) => candidate !== sorted[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prepared artifact paths must be unique and sorted",
      });
    }
  });
const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const preparedBuildSchema = z
  .object({
    artifacts: preparedArtifactsSchema,
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    preparedAt: z.string().datetime(),
    sourceSha: sourceShaSchema,
    version: z.literal(2),
  })
  .strict();
const preparedArtifactSnapshotSchema = preparedBuildSchema.omit({
  preparedAt: true,
});
const leaseSchema = z
  .object({
    attempt: z.number().int().positive(),
    composeProject: z.string().min(1).nullable(),
    contextFile: z.string().min(1),
    createdAt: z.string().datetime(),
    exclusive: z.boolean(),
    ownerGuardianPid: z.number().int().positive(),
    ownerPid: z.number().int().positive(),
    ownerPgid: z.number().int().positive(),
    ownerNonce: nonceSchema,
    ownerToken: nonceSchema,
    repository: z.string().min(1),
    runId: idSchema,
    scenario: idSchema,
    slot: z.number().int().min(0).max(journeyPortSlotCount - 1),
    suiteId: idSchema,
    version: z.literal(2),
  })
  .strict();
const lockOwnerSchema = z
  .object({
    ownerNonce: nonceSchema,
    ownerPid: z.number().int().positive(),
    token: nonceSchema,
    version: z.literal(1),
  })
  .strict();
const runningProcessMetadataSchema = z
  .object({
    authorityNonce: nonceSchema,
    groupCleanToken: nonceSchema,
    ownerToken: nonceSchema,
    pgid: z.number().int().positive(),
    pid: z.number().int().positive(),
    runnerPath: z.string().min(1),
    startedAt: z.string().datetime(),
    state: z.literal("running"),
    version: z.literal(1),
  })
  .strict();
const exitedProcessMetadataSchema = runningProcessMetadataSchema
  .omit({ state: true })
  .extend({
    exitCode: z.number().int().nullable(),
    exitedAt: z.string().datetime(),
    state: z.literal("exited"),
  })
  .strict();
const processMetadataSchema = z.discriminatedUnion("state", [
  runningProcessMetadataSchema,
  exitedProcessMetadataSchema,
]);
const groupCleanSchema = z
  .object({
    cleanedAt: z.string().datetime(),
    groupCleanToken: nonceSchema,
    ownerToken: nonceSchema,
    pgid: z.number().int().positive(),
    status: z.literal("group-empty"),
    version: z.literal(1),
  })
  .strict();
const preparationOwnerSchema = z
  .object({
    createdAt: z.string().datetime(),
    ownerNonce: nonceSchema,
    ownerPgid: z.number().int().positive(),
    ownerPid: z.number().int().positive(),
    state: z.enum(["pending", "active"]),
    version: z.literal(1),
  })
  .strict();
const bootstrapReaderSchema = z
  .object({
    createdAt: z.string().datetime(),
    guardianPid: z.number().int().positive().nullable(),
    kind: z.enum(["journey", "suite"]),
    ownerNonce: nonceSchema,
    ownerPgid: z.number().int().positive(),
    ownerPid: z.number().int().positive(),
    parentToken: nonceSchema.nullable(),
    token: nonceSchema,
    version: z.literal(1),
  })
  .strict();
const runResultSchema = z
  .object({
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    finishedAt: z.string().datetime(),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    sourceSha: sourceShaSchema,
    status: z.enum(["passed", "failed"]),
    version: z.literal(1),
  })
  .strict();
const cleanupResultSchema = z
  .object({
    cleanedAt: z.string().datetime(),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["resources-clean", "clean"]),
    version: z.literal(1),
  })
  .strict();

type Lease = z.infer<typeof leaseSchema>;
type PreparedBuild = z.infer<typeof preparedBuildSchema>;
type OwnedLock = {
  readonly directory: string;
  readonly token: string;
};
type CleanupClaim = {
  readonly context: JourneyRunContext;
  readonly directory: string;
  readonly lease: Lease;
  readonly phase: "reaping" | "release";
  readonly token: string;
};

type ProcessOwnership =
  | { readonly kind: "foreign" }
  | { readonly kind: "missing" }
  | { readonly kind: "owned" }
  | { readonly kind: "uncertain"; readonly reason: string };

const command = process.argv[2] ?? "";
const runtimeOwnerNonce = nonceSchema.parse(requiredFlag("--runtime-owner-nonce"));

let commandFailure: unknown;
try {
  await main(command);
} catch (error) {
  commandFailure = error;
}
let readerReleaseFailure: unknown;
try {
  await releaseRuntimeBootstrapReaderIfRequested();
} catch (error) {
  readerReleaseFailure = error;
}
if (commandFailure !== undefined || readerReleaseFailure !== undefined) {
  throw new AggregateError(
    [commandFailure, readerReleaseFailure].filter(
      (error) => error !== undefined,
    ),
    "journey runtime command failed",
  );
}

async function main(selectedCommand: string): Promise<void> {
  switch (selectedCommand) {
    case "allocate":
      await allocateCommand();
      return;
    case "aggregate":
      await aggregateCommand();
      return;
    case "cleanup":
      await cleanupCommand();
      return;
    case "mark-prepared":
      await markPreparedCommand();
      return;
    case "mark-result":
      await markResultCommand();
      return;
    case "reconcile":
      await reconcileCommand();
      return;
    case "resolve-pointer":
      await resolvePointerCommand();
      return;
    case "shell-env":
      await shellEnvironmentCommand();
      return;
    case "write-compose-override":
      await writeComposeOverrideCommand();
      return;
    case "write-pointer":
      await writePointerCommand();
      return;
    default:
      throw new Error(`unknown journey-runtime command ${JSON.stringify(selectedCommand)}`);
  }
}

async function allocateCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const scenario = idSchema.parse(requiredFlag("--scenario"));
  const suiteId = idSchema.parse(requiredFlag("--suite-id"));
  const runId = idSchema.parse(requiredFlag("--run-id"));
  const composeEnabled = requiredFlag("--compose") === "true";
  const exclusive = booleanFlag("--exclusive");
  const ownerPid = positiveInteger(requiredFlag("--owner-pid"), "--owner-pid");
  const ownerPgid = positiveInteger(requiredFlag("--owner-pgid"), "--owner-pgid");
  const ownerGuardianPid = positiveInteger(
    requiredFlag("--owner-guardian-pid"),
    "--owner-guardian-pid",
  );
  const ownerNonce = nonceSchema.parse(requiredFlag("--owner-nonce"));
  const verifiedBuildIdentity = nonceSchema.parse(
    requiredFlag("--verified-build-identity"),
  );
  const readerToken = nonceSchema.parse(requiredFlag("--reader-token"));
  const owner = processOwnership(ownerPid, ownerNonce);
  if (owner.kind !== "owned") {
    throw new Error(
      `journey owner process ${ownerPid} is not verifiably owned (${owner.kind})`,
    );
  }
  assertJourneyAuthorityGroup(
    ownerPgid,
    ownerPid,
    ownerGuardianPid,
    ownerNonce,
  );
  assertCleanWorktree(repository);
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  await mkdir(slotsRoot, { recursive: true });
  const waitStartedAt = Date.now();
  for (;;) {
    const allocationLock = await acquireOwnedLock(
      path.join(registryRoot, "allocation.lock"),
      "journey allocation",
    );
    let recoveries: readonly string[] = [];
    let logicalRunActive: Lease | undefined;
    try {
      const reader = await requiredBootstrapReader(
        registryRoot,
        readerToken,
        ownerPid,
        ownerNonce,
        { guardianPid: ownerGuardianPid, pgid: ownerPgid },
      );
      await assertPreparationAllowsReader(registryRoot);
      const active = await reconcileActiveLeases(slotsRoot);
      if (active.uncertain) {
        throw new Error(
          "journey allocation is blocked by a quarantined or incomplete lease",
        );
      }
      recoveries = active.recoveries;
      logicalRunActive = active.leases.find(
        (lease) =>
          lease.repository === repository &&
          lease.suiteId === suiteId &&
          lease.scenario === scenario &&
          lease.runId === runId,
      );
      if (recoveries.length === 0 && logicalRunActive === undefined) {
        if (
          exclusive
            ? active.leases.length > 0
            : active.leases.some((lease) => lease.exclusive)
        ) {
          throw new Error(
            exclusive
              ? `exclusive credential journey ${scenario} requires an idle runtime`
              : "an exclusive credential journey currently owns the runtime",
          );
        }

        const sourceSha = git(repository, ["rev-parse", "HEAD"]);
        const prepared = await readPreparedBuild(repository);
        if (prepared.sourceSha !== sourceSha) {
          throw new Error(
            `prepared build ${prepared.sourceSha} does not match journey source ${sourceSha}`,
          );
        }
        if (prepared.buildIdentity !== verifiedBuildIdentity) {
          throw new Error(
            "source verification does not match the published prepared build",
          );
        }

        const attempt = await allocateAttempt(repository, suiteId, scenario, runId);
        const runRoot = path.join(
          repository,
          "artifacts",
          "runs",
          suiteId,
          scenario,
          runId,
          `attempt-${attempt}`,
        );
        const paths = {
          artifacts: path.join(runRoot, "artifacts", scenario),
          generated: path.join(runRoot, "generated"),
          logs: path.join(runRoot, "logs"),
          process: path.join(runRoot, "process"),
          repository,
          runRoot,
        };
        await Promise.all([
          mkdir(paths.artifacts, { recursive: true }),
          mkdir(paths.generated, { recursive: true }),
          mkdir(paths.logs, { recursive: true }),
          mkdir(paths.process, { recursive: true }),
        ]);

        const worktreeKey = digest(repository).slice(0, 10);
        const runKey = digest(`${suiteId}\0${scenario}\0${runId}`);
        const projectSuffix = digest(
          `${worktreeKey}\0${runKey}\0${attempt}`,
        ).slice(0, 20);
        const composeProject = composeEnabled
          ? composeProjectName(scenario, projectSuffix)
          : null;
        const ownerToken = randomBytes(32).toString("hex");
        const contextFile = path.join(runRoot, "context.json");
        const preferredSlot = preferredJourneyPortSlot(
          suiteId,
          scenario,
          runId,
        );

        for (let offset = 0; offset < journeyPortSlotCount; offset += 1) {
          const slot = (preferredSlot + offset) % journeyPortSlotCount;
          if (active.reservedSlots.has(slot)) {
            continue;
          }
          const portReservation = await reserveJourneyPortBlock(slot);
          if (portReservation === undefined) {
            continue;
          }
          const leaseDirectory = path.join(
            slotsRoot,
            String(slot).padStart(4, "0"),
          );
          const lease: Lease = {
            attempt,
            composeProject,
            contextFile,
            createdAt: new Date().toISOString(),
            exclusive,
            ownerGuardianPid,
            ownerNonce,
            ownerPid,
            ownerPgid,
            ownerToken,
            repository,
            runId,
            scenario,
            slot,
            suiteId,
            version: 2,
          };
          const context = makeContext({
            attempt,
            buildIdentity: prepared.buildIdentity,
            composeEnabled,
            composeProject,
            contextFile,
            leaseDirectory,
            ownerNonce,
            ownerGuardianPid,
            ownerPid,
            ownerPgid,
            ownerToken,
            paths,
            repository,
            runId,
            scenario,
            slot,
            sourceSha,
            suiteId,
          });
          const claimDirectory = path.join(
            slotsRoot,
            `.claim-${String(slot).padStart(4, "0")}-${ownerToken.slice(0, 16)}`,
          );
          try {
            await mkdir(claimDirectory);
            await writeJsonAtomically(
              path.join(claimDirectory, "lease.json"),
              lease,
            );
            await writeJsonAtomically(contextFile, context);
            await reachRuntimeProofBarrier(runId, ownerToken, "claim-ready");
            await rename(claimDirectory, leaseDirectory);
            await releaseTransferredBootstrapReader(registryRoot, reader);
          } catch (error) {
            await rm(claimDirectory, { force: true, recursive: true });
            throw error;
          } finally {
            await releasePortReservation(portReservation);
          }
          process.stdout.write(`${contextFile}\n`);
          return;
        }
        throw new Error(
          `all ${journeyPortSlotCount} journey port slots are leased or unavailable`,
        );
      }
    } finally {
      await releaseOwnedLock(allocationLock);
    }
    if (recoveries.length > 0) {
      await drainCleanupRecoveries(recoveries, waitStartedAt);
      continue;
    }
    if (logicalRunActive === undefined) {
      throw new Error("journey allocation did not reach a stable decision");
    }
    await reachRuntimeProofBarrier(
      runId,
      logicalRunActive.ownerToken,
      "logical-run-active",
    );
    if (Date.now() - waitStartedAt >= 120_000) {
      throw new Error(
        `timed out waiting for prior ${scenario}/${runId} execution to release`,
      );
    }
    await delay(250);
  }
}

async function reachRuntimeProofBarrier(
  runId: string,
  ownerToken: string,
  stage: string,
): Promise<void> {
  const root = process.env.ZOEN_E2E_RUNTIME_BARRIER_DIR;
  if (root === undefined || root === "") {
    return;
  }
  await mkdir(root, { recursive: true });
  await writeJsonAtomically(path.join(root, `${runId}.${stage}.ready.json`), {
    ownerToken,
    runId,
    stage,
  });
  const release = path.join(root, `${runId}.${stage}.release`);
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    if (await fileExists(release)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`runtime proof barrier ${stage} timed out for ${runId}`);
}

async function reserveJourneyPortBlock(
  slot: number,
): Promise<readonly Server[] | undefined> {
  const servers: Server[] = [];
  try {
    for (let offset = 0; offset < journeyPortBlockWidth; offset += 1) {
      const server = createServer();
      try {
        await listen(server, journeyPortAt(slot, offset));
      } catch (error) {
        if (isUnavailablePort(error)) {
          await releasePortReservation(servers);
          return undefined;
        }
        throw error;
      }
      server.unref();
      servers.push(server);
    }
    return servers;
  } catch (error) {
    await releasePortReservation(servers);
    throw error;
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onListening = (): void => {
      cleanup();
      resolve();
    };
    const cleanup = (): void => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ exclusive: true, host: "127.0.0.1", port });
  });
}

async function releasePortReservation(servers: readonly Server[]): Promise<void> {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        }),
    ),
  );
}

function isUnavailablePort(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EACCES", "EADDRINUSE"].includes(String(Reflect.get(error, "code")))
  );
}

function makeContext(input: {
  attempt: number;
  buildIdentity: string;
  composeEnabled: boolean;
  composeProject: string | null;
  contextFile: string;
  leaseDirectory: string;
  ownerNonce: string;
  ownerGuardianPid: number;
  ownerPgid: number;
  ownerPid: number;
  ownerToken: string;
  paths: JourneyRunContext["paths"];
  repository: string;
  runId: string;
  scenario: string;
  slot: number;
  sourceSha: string;
  suiteId: string;
}): JourneyRunContext {
  const block = journeyPortAt(input.slot, 0);
  const compose = input.composeEnabled
    ? {
        baseFile: path.join(input.repository, "e2e", input.scenario, "compose.yaml"),
        kind: "compose" as const,
        overrideFile: path.join(input.paths.runRoot, "compose.owner.yaml"),
        project: requireComposeProject(input.composeProject),
      }
    : { kind: "none" as const };
  const executionLabel = dnsLabel(
    `${digest(input.repository).slice(0, 10)}-${input.suiteId}-${input.runId}-attempt-${input.attempt}`,
  );
  const name = `${executionLabel}.${dnsLabel(input.scenario)}.zoen.localhost`;
  return journeyRunContextSchema.parse({
    attempt: input.attempt,
    buildIdentity: input.buildIdentity,
    compose,
    contextVersion: 1,
    createdAt: new Date().toISOString(),
    httpNames: { auth: `auth.${name}`, zoend: `zoend.${name}` },
    lease: {
      directory: input.leaseDirectory,
      ownerToken: input.ownerToken,
      slot: input.slot,
    },
    owner: {
      guardianPid: input.ownerGuardianPid,
      nonce: input.ownerNonce,
      pgid: input.ownerPgid,
      pid: input.ownerPid,
    },
    paths: input.paths,
    ports: {
      adapter: block + 13,
      auth: block + 2,
      connector: block + 7,
      effectWorker: block + 12,
      keycloak: block + 11,
      minio: block + 3,
      postgres: block,
      provider: block + 8,
      restateIngress: block + 5,
      restateNode: block + 4,
      restateUi: block + 6,
      worker: block + 9,
      workerControl: block + 10,
      zoend: block + 1,
    },
    runId: input.runId,
    scenario: input.scenario,
    sourceSha: input.sourceSha,
    suiteId: input.suiteId,
  });
}

async function shellEnvironmentCommand(): Promise<void> {
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

async function writeComposeOverrideCommand(): Promise<void> {
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

async function writePointerCommand(): Promise<void> {
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

async function resolvePointerCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const context = await latestCompletedContext(
    path.resolve(requiredFlag("--pointer")),
    repository,
  );
  process.stdout.write(`${path.join(context.paths.runRoot, "context.json")}\n`);
}

async function markPreparedCommand(): Promise<void> {
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

async function reconcileCommand(): Promise<void> {
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

async function markResultCommand(): Promise<void> {
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

async function cleanupCommand(): Promise<void> {
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

async function cleanupContext(
  context: JourneyRunContext,
): Promise<void> {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const claim = await claimCleanup(context);
    if (claim === "done") {
      return;
    }
    if (claim === "busy") {
      await delay(250);
      continue;
    }
    await executeCleanupClaim(claim);
    return;
  }
  throw new Error(`timed out waiting to clean ${context.scenario}/${context.runId}`);
}

async function drainCleanupRecoveries(
  contextFiles: readonly string[],
  operationStartedAt: number,
): Promise<void> {
  const pending = [...new Set(contextFiles)];
  for (let offset = 0; offset < pending.length; offset += 4) {
    if (Date.now() - operationStartedAt >= 120_000) {
      throw new Error("timed out reconciling stale journey leases");
    }
    await Promise.all(
      pending.slice(offset, offset + 4).map(async (contextFile) => {
        const context = await readContext(contextFile);
        await cleanupContext(context);
      }),
    );
  }
}

async function claimCleanup(
  context: JourneyRunContext,
): Promise<CleanupClaim | "busy" | "done"> {
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  const numericDirectory = path.join(
    slotsRoot,
    String(context.lease.slot).padStart(4, "0"),
  );
  const suffix = `${String(context.lease.slot).padStart(4, "0")}-${context.lease.ownerToken.slice(0, 16)}`;
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "journey cleanup recovery",
  );
  try {
    const reaping = path.join(slotsRoot, `.reaping-${suffix}`);
    const released = path.join(slotsRoot, `.release-${suffix}`);
    if (await fileExists(numericDirectory)) {
      const numericLease = await requiredRecoveryLease(numericDirectory);
      const numericContext = await contextForLease(numericLease, numericDirectory);
      assertSameRunContext(context, numericContext);
      await rename(numericDirectory, reaping);
    }
    const directory = (await fileExists(reaping))
      ? reaping
      : (await fileExists(released))
        ? released
        : undefined;
    if (directory === undefined) {
      await assertCanonicalContextLayout(context, undefined, {
        leaseDirectory: numericDirectory,
        repository,
      });
      await finishReleasedCleanup(context);
      return "done";
    }
    if (await fileExists(path.join(directory, "quarantined.json"))) {
      throw new Error(`cleanup recovery for ${context.runId} is quarantined`);
    }
    const lease = await requiredRecoveryLease(directory);
    const recovered = await contextForLease(lease, directory);
    assertSameRunContext(context, recovered);
    const existing = await readOptionalCleanupOwner(directory);
    if (existing !== undefined) {
      const ownership = processOwnership(existing.ownerPid, existing.ownerNonce);
      if (
        ownership.kind === "owned" &&
        (existing.ownerPid !== process.pid ||
          existing.ownerNonce !== runtimeOwnerNonce)
      ) {
        return "busy";
      }
      if (ownership.kind === "uncertain") {
        await quarantineRecoveryDirectory(
          directory,
          new Error(`cleanup owner ${existing.ownerPid} is uncertain`),
        );
        throw new Error(`cleanup authority for ${context.runId} is uncertain`);
      }
    }
    const token = randomBytes(32).toString("hex");
    await writeJsonAtomically(path.join(directory, "cleaner.json"), {
      ownerNonce: runtimeOwnerNonce,
      ownerPid: process.pid,
      token,
      version: 1,
    });
    return {
      context: recovered,
      directory,
      lease,
      phase: directory === reaping ? "reaping" : "release",
      token,
    };
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

async function executeCleanupClaim(claim: CleanupClaim): Promise<void> {
  let directory = claim.directory;
  if (claim.phase === "reaping") {
    await cleanupOwnedResources(claim.context);
    await writeCleanupResult(claim.context, "resources-clean");
    const slotsRoot = path.dirname(claim.context.lease.directory);
    const released = path.join(
      slotsRoot,
      `.release-${String(claim.lease.slot).padStart(4, "0")}-${claim.lease.ownerToken.slice(0, 16)}`,
    );
    const lock = await acquireOwnedLock(
      path.join(path.dirname(slotsRoot), "allocation.lock"),
      "journey cleanup transition",
    );
    try {
      await assertCleanupOwner(directory, claim.token);
      await rename(directory, released);
      directory = released;
    } finally {
      await releaseOwnedLock(lock);
    }
  }
  await reachReleaseProofBarrier(claim.context);
  await writeCleanupResult(claim.context, "clean");
  const slotsRoot = path.dirname(claim.context.lease.directory);
  const lock = await acquireOwnedLock(
    path.join(path.dirname(slotsRoot), "allocation.lock"),
    "journey cleanup completion",
  );
  try {
    await assertCleanupOwner(directory, claim.token);
    await rm(directory, { force: true, recursive: true });
  } finally {
    await releaseOwnedLock(lock);
  }
}

async function readOptionalCleanupOwner(
  directory: string,
): Promise<z.infer<typeof lockOwnerSchema> | undefined> {
  try {
    return lockOwnerSchema.parse(
      JSON.parse(await readFile(path.join(directory, "cleaner.json"), "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    await quarantineRecoveryDirectory(directory, error);
    throw new Error(`invalid cleanup authority ${directory}`, { cause: error });
  }
}

async function assertCleanupOwner(
  directory: string,
  token: string,
): Promise<void> {
  const owner = lockOwnerSchema.parse(
    JSON.parse(await readFile(path.join(directory, "cleaner.json"), "utf8")),
  );
  if (
    owner.ownerPid !== process.pid ||
    owner.ownerNonce !== runtimeOwnerNonce ||
    owner.token !== token ||
    processOwnership(owner.ownerPid, owner.ownerNonce).kind !== "owned"
  ) {
    throw new Error(`cleanup authority changed for ${directory}`);
  }
}

async function requiredRecoveryLease(directory: string): Promise<Lease> {
  try {
    return leaseSchema.parse(
      JSON.parse(await readFile(path.join(directory, "lease.json"), "utf8")),
    );
  } catch (error) {
    await quarantineRecoveryDirectory(directory, error);
    throw new Error(`cleanup recovery lease is invalid at ${directory}`, {
      cause: error,
    });
  }
}

function assertSameRunContext(
  expected: JourneyRunContext,
  recovered: JourneyRunContext,
): void {
  if (JSON.stringify(recovered) !== JSON.stringify(expected)) {
    throw new Error(
      `cleanup recovery context does not match ${expected.scenario}/${expected.runId}`,
    );
  }
}

function authorizeCleanup(context: JourneyRunContext): void {
  const owner = processOwnership(context.owner.pid, context.owner.nonce);
  if (owner.kind === "uncertain") {
    throw new Error(
      `cannot inspect journey owner ${context.owner.pid}: ${owner.reason}`,
    );
  }
  if (owner.kind !== "owned") {
    return;
  }
  const callerPidRaw = optionalFlag("--caller-pid");
  const callerNonceRaw = optionalFlag("--caller-nonce");
  if (
    callerPidRaw === undefined ||
    callerNonceRaw === undefined ||
    positiveInteger(callerPidRaw, "--caller-pid") !== context.owner.pid ||
    nonceSchema.parse(callerNonceRaw) !== context.owner.nonce
  ) {
    throw new Error(
      `refusing to clean live journey ${context.runId} from a foreign caller`,
    );
  }
}

async function finishReleasedCleanup(context: JourneyRunContext): Promise<void> {
  const cleanupPath = path.join(context.paths.runRoot, "cleanup.json");
  try {
    const cleanup = cleanupResultSchema.parse(
      JSON.parse(await readFile(cleanupPath, "utf8")),
    );
    if (cleanup.ownerToken !== context.lease.ownerToken) {
      throw new Error(`cleanup ownership mismatch for ${context.runId}`);
    }
    if (cleanup.status !== "clean") {
      throw new Error(
        `cleanup for ${context.runId} stopped before owned lease release`,
      );
    }
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(
        `lease for ${context.runId} disappeared without a clean release receipt`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function writeCleanupResult(
  context: JourneyRunContext,
  status: "resources-clean" | "clean",
): Promise<void> {
  await writeJsonAtomically(path.join(context.paths.runRoot, "cleanup.json"), {
    cleanedAt: new Date().toISOString(),
    ownerToken: context.lease.ownerToken,
    status,
    version: 1,
  });
}

async function aggregateCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  await assertRuntimeBootstrapReader(repository);
  assertCleanWorktree(repository);
  const suiteId = idSchema.parse(requiredFlag("--suite-id"));
  const expected = requiredFlag("--expected-scenarios")
    .split(",")
    .filter(Boolean)
    .map((scenario) => idSchema.parse(scenario));
  if (expected.length === 0 || new Set(expected).size !== expected.length) {
    throw new Error("aggregate requires a non-empty unique scenario set");
  }
  const contextListPath = path.resolve(requiredFlag("--context-list"));
  const pointers = (await readFile(contextListPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const contexts = await Promise.all(
    pointers.map((pointer) => latestCompletedContext(pointer, repository)),
  );
  const byScenario = new Map<string, JourneyRunContext>();
  for (const context of contexts) {
    if (context.suiteId !== suiteId) {
      throw new Error(
        `context ${context.runId} belongs to suite ${context.suiteId}, expected ${suiteId}`,
      );
    }
    if (byScenario.has(context.scenario)) {
      throw new Error(`suite ${suiteId} contains duplicate ${context.scenario} runs`);
    }
    byScenario.set(context.scenario, context);
  }
  if (
    byScenario.size !== expected.length ||
    expected.some((scenario) => !byScenario.has(scenario))
  ) {
    throw new Error(`suite ${suiteId} is incomplete`);
  }
  const prepared = await readPreparedBuild(repository);
  const sourceSha = git(repository, ["rev-parse", "HEAD"]);
  const token = randomBytes(16).toString("hex");
  const artifactsRoot = path.join(repository, "artifacts");
  const stagingRoot = path.join(artifactsRoot, `.publish-${suiteId}-${token}`);
  const generationName = `${suiteId}-${token}`;
  const generationRoot = path.join(artifactsRoot, "generations", generationName);
  const lockDirectory = path.join(artifactsRoot, ".suite-publication.lock");
  await mkdir(path.dirname(generationRoot), { recursive: true });
  const publicationLock = await acquireOwnedLock(
    lockDirectory,
    "journey suite publication",
  );
  try {
    await removeOrphanPublicationStages(artifactsRoot);
    await mkdir(stagingRoot, { recursive: true });
    const manifestRuns: Array<Record<string, unknown>> = [];
    for (const scenario of expected) {
      const context = byScenario.get(scenario);
      if (context === undefined) {
        throw new Error(`missing context for ${scenario}`);
      }
      if (
        context.sourceSha !== sourceSha ||
        context.sourceSha !== prepared.sourceSha ||
        context.buildIdentity !== prepared.buildIdentity
      ) {
        throw new Error(`mixed source or build identity in ${scenario}`);
      }
      const result = runResultSchema.parse(
        JSON.parse(await readFile(path.join(context.paths.runRoot, "result.json"), "utf8")),
      );
      if (
        result.status !== "passed" ||
        result.ownerToken !== context.lease.ownerToken ||
        result.sourceSha !== sourceSha ||
        result.buildIdentity !== prepared.buildIdentity
      ) {
        throw new Error(`run ${context.runId} is not complete and publishable`);
      }
      const cleanup = cleanupResultSchema.parse(
        JSON.parse(
          await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8"),
        ),
      );
      if (
        cleanup.status !== "clean" ||
        cleanup.ownerToken !== context.lease.ownerToken
      ) {
        throw new Error(`run ${context.runId} has not completed owned cleanup`);
      }
      const primary = path.join(context.paths.artifacts, `${scenario}.json`);
      const body = jsonObject(await readFile(primary, "utf8"), primary);
      validateArtifactProvenance(body, context);
      const stagedScenario = path.join(stagingRoot, scenario);
      await copyDirectory(context.paths.artifacts, stagedScenario);
      manifestRuns.push({
        attempt: context.attempt,
        runId: context.runId,
        scenario,
      });
    }

    const completedAt = new Date().toISOString();
    const suiteManifest = path.join(stagingRoot, "suite.json");
    const manifest = {
      buildIdentity: prepared.buildIdentity,
      completedAt,
      runs: manifestRuns,
      sourceSha,
      status: "complete",
      suiteId,
      version: 1,
    } as const;
    await writeJsonAtomically(suiteManifest, manifest);
    await rename(stagingRoot, generationRoot);
    await writeJsonAtomically(path.join(artifactsRoot, "current.json"), {
      buildIdentity: prepared.buildIdentity,
      completedAt,
      generation: path.posix.join("generations", generationName),
      sourceSha,
      suiteId,
      version: 1,
    });
    process.stdout.write(`${path.join(generationRoot, "suite.json")}\n`);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
    await releaseOwnedLock(publicationLock);
  }
}

async function assertRuntimeBootstrapReader(repository: string): Promise<void> {
  const registryRoot = await runtimeRegistryRoot(repository);
  const readerToken = nonceSchema.parse(requiredFlag("--reader-token"));
  const ownerPid = positiveInteger(
    requiredFlag("--reader-owner-pid"),
    "--reader-owner-pid",
  );
  const ownerNonce = nonceSchema.parse(requiredFlag("--reader-owner-nonce"));
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "runtime bootstrap reader validation",
  );
  try {
    await requiredBootstrapReader(
      registryRoot,
      readerToken,
      ownerPid,
      ownerNonce,
    );
    await assertPreparationAllowsReader(registryRoot);
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

async function removeOrphanPublicationStages(artifactsRoot: string): Promise<void> {
  for (const entry of await readdir(artifactsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(".publish-")) {
      await rm(path.join(artifactsRoot, entry.name), {
        force: true,
        recursive: true,
      });
    }
  }
}

function validateArtifactProvenance(
  body: Record<string, unknown>,
  context: JourneyRunContext,
): void {
  if (body.sourceCommit !== context.sourceSha) {
    throw new Error(`${context.scenario} artifact has the wrong sourceCommit`);
  }
  const provenance = body.journeyRun;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    throw new Error(`${context.scenario} artifact is missing journeyRun provenance`);
  }
  if (
    Reflect.get(provenance, "buildIdentity") !== context.buildIdentity ||
    Reflect.get(provenance, "runId") !== context.runId ||
    Reflect.get(provenance, "suiteId") !== context.suiteId ||
    Reflect.get(provenance, "attempt") !== context.attempt
  ) {
    throw new Error(`${context.scenario} artifact journeyRun provenance is mixed`);
  }
}

async function runtimeRegistryRoot(repository: string): Promise<string> {
  const commonGitDirectory = await realpath(
    path.resolve(repository, git(repository, ["rev-parse", "--git-common-dir"])),
  );
  return path.join(commonGitDirectory, "zoen-e2e", "runtime-v1");
}

async function assertPreparationAllowsReader(
  registryRoot: string,
): Promise<void> {
  const writerDirectory = path.join(registryRoot, "preparation");
  const writer = await readOptionalPreparationOwner(writerDirectory);
  if (writer === undefined) {
    return;
  }
  if (await fileExists(path.join(writerDirectory, "quarantined.json"))) {
    throw new Error(
      `journey allocation is blocked by quarantined preparation ${writerDirectory}`,
    );
  }
  if (writer.state === "active") {
    throw new Error(
      `journey allocation cannot coexist with active preparation ${writer.ownerPid}`,
    );
  }
}

async function requiredBootstrapReader(
  registryRoot: string,
  token: string,
  ownerPid: number,
  ownerNonce: string,
  authority?: { readonly guardianPid: number; readonly pgid: number },
): Promise<z.infer<typeof bootstrapReaderSchema>> {
  const directory = path.join(registryRoot, "readers", token);
  if (await fileExists(path.join(directory, "quarantined.json"))) {
    throw new Error(`bootstrap reader ${token} is quarantined`);
  }
  let reader: z.infer<typeof bootstrapReaderSchema>;
  try {
    reader = bootstrapReaderSchema.parse(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
  } catch (error) {
    throw new Error(`bootstrap reader ${token} is missing or invalid`, {
      cause: error,
    });
  }
  if (
    reader.kind !== "journey" ||
    reader.token !== token ||
    reader.ownerPid !== ownerPid ||
    reader.ownerNonce !== ownerNonce ||
    (authority !== undefined &&
      (reader.ownerPgid !== authority.pgid ||
        reader.guardianPid !== authority.guardianPid))
  ) {
    throw new Error(`bootstrap reader ${token} does not own this journey`);
  }
  const ownership = processOwnership(reader.ownerPid, reader.ownerNonce);
  if (ownership.kind !== "owned") {
    throw new Error(
      `bootstrap reader ${token} owner is not verifiably live (${ownership.kind})`,
    );
  }
  return reader;
}

async function releaseTransferredBootstrapReader(
  registryRoot: string,
  reader: z.infer<typeof bootstrapReaderSchema>,
): Promise<void> {
  const directory = path.join(registryRoot, "readers", reader.token);
  const releasing = `${directory}.release-${randomBytes(8).toString("hex")}`;
  await rename(directory, releasing);
  await rm(releasing, { force: true, recursive: true });
}

async function releaseRuntimeBootstrapReaderIfRequested(): Promise<void> {
  const token = optionalFlag("--release-reader-token");
  if (token === undefined) {
    return;
  }
  const readerToken = nonceSchema.parse(token);
  const repository = await realpath(process.cwd());
  const registryRoot = await runtimeRegistryRoot(repository);
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "runtime bootstrap reader release",
  );
  try {
    const reader = await requiredBootstrapReader(
      registryRoot,
      readerToken,
      process.pid,
      runtimeOwnerNonce,
    );
    await releaseTransferredBootstrapReader(registryRoot, reader);
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

async function assertActivePreparationWriter(
  registryRoot: string,
  writerPid: number,
  writerNonce: string,
): Promise<void> {
  const writerDirectory = path.join(registryRoot, "preparation");
  let writer: z.infer<typeof preparationOwnerSchema>;
  try {
    writer = preparationOwnerSchema.parse(
      JSON.parse(await readFile(path.join(writerDirectory, "owner.json"), "utf8")),
    );
  } catch (error) {
    throw new Error("prepared build publication requires the active preparation writer", {
      cause: error,
    });
  }
  if (
    writer.state !== "active" ||
    writer.ownerPid !== writerPid ||
    writer.ownerNonce !== writerNonce
  ) {
    throw new Error("prepared build publication writer ownership mismatch");
  }
  const ownership = processOwnership(writer.ownerPid, writer.ownerNonce);
  if (ownership.kind !== "owned") {
    throw new Error(
      `prepared build writer ${writer.ownerPid} is not verifiably owned (${ownership.kind})`,
    );
  }
}

async function readOptionalPreparationOwner(
  directory: string,
): Promise<z.infer<typeof preparationOwnerSchema> | undefined> {
  try {
    return preparationOwnerSchema.parse(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error) && !(await fileExists(directory))) {
      return undefined;
    }
    throw new Error(
      `preparation authority ${directory} is incomplete or corrupt; allocation is blocked`,
      { cause: error },
    );
  }
}

async function readPreparedBuild(repository: string): Promise<PreparedBuild> {
  const manifestPath = preparedBuildPath(repository);
  try {
    return preparedBuildSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (error) {
    throw new Error(
      `missing or invalid prepared build ${manifestPath}; run just build or just prepare`,
      { cause: error },
    );
  }
}

function preparedArtifactSnapshot(
  repository: string,
  sourceSha: string,
): z.infer<typeof preparedArtifactSnapshotSchema> {
  const output = execFileSync(
    process.execPath,
    [
      path.join(repository, "e2e", "prepared-artifacts.mjs"),
      "snapshot",
      "--repository",
      repository,
      "--source-sha",
      sourceSha,
    ],
    {
      cwd: repository,
      encoding: "utf8",
      env: processInspectionEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  return preparedArtifactSnapshotSchema.parse(JSON.parse(output));
}

function preparedBuildPath(repository: string): string {
  const override = process.env.ZOEN_E2E_BUILD_MANIFEST;
  return override === undefined || override === ""
    ? path.join(repository, ".cache", "e2e", "prepared.json")
    : path.resolve(repository, override);
}

async function allocateAttempt(
  repository: string,
  suiteId: string,
  scenario: string,
  runId: string,
): Promise<number> {
  const root = path.join(repository, "artifacts", "runs", suiteId, scenario, runId);
  await mkdir(root, { recursive: true });
  for (let attempt = 1; attempt < 1_000_000; attempt += 1) {
    try {
      await mkdir(path.join(root, `attempt-${attempt}`));
      return attempt;
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
    }
  }
  throw new Error(`could not claim an attempt for ${suiteId}/${scenario}/${runId}`);
}

async function reconcileActiveLeases(
  slotsRoot: string,
): Promise<{
  readonly leases: Lease[];
  readonly recoveries: string[];
  readonly reservedSlots: ReadonlySet<number>;
  readonly uncertain: boolean;
}> {
  const leases: Lease[] = [];
  const recoveries: string[] = [];
  const reservedSlots = new Set<number>();
  let uncertain = false;
  const entries = await readdir(slotsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(slotsRoot, entry.name);
    if (entry.name.startsWith(".claim-")) {
      // Claims are never visible to a runner. Holding allocation.lock proves
      // the process that could have committed this staging directory is gone.
      await rm(directory, { force: true, recursive: true });
      continue;
    }
    if (entry.name.startsWith(".reaping-")) {
      const transition = await inspectCleanupTransition(directory);
      uncertain ||= transition.uncertain;
      if (transition.lease !== undefined) {
        leases.push(transition.lease);
        reservedSlots.add(transition.lease.slot);
      }
      if (transition.recover) {
        recoveries.push(transition.lease?.contextFile ?? "");
      }
      continue;
    }
    if (entry.name.startsWith(".release-")) {
      const transition = await inspectCleanupTransition(directory);
      uncertain ||= transition.uncertain;
      if (transition.lease !== undefined) {
        leases.push(transition.lease);
        reservedSlots.add(transition.lease.slot);
      }
      if (transition.recover) {
        recoveries.push(transition.lease?.contextFile ?? "");
      }
      continue;
    }
    if (!/^\d{4}$/.test(entry.name)) {
      continue;
    }
    const slotDirectory = directory;
    const numericSlot = Number.parseInt(entry.name, 10);
    reservedSlots.add(numericSlot);
    if (await fileExists(path.join(slotDirectory, "quarantined.json"))) {
      uncertain = true;
      continue;
    }
    try {
      const lease = leaseSchema.parse(
        JSON.parse(await readFile(path.join(slotDirectory, "lease.json"), "utf8")),
      );
      await contextForLease(lease, slotDirectory);
      const ownership = processOwnership(lease.ownerPid, lease.ownerNonce);
      if (ownership.kind === "owned") {
        leases.push(lease);
      } else if (ownership.kind === "uncertain") {
        uncertain = true;
      } else {
        const group = leaseAuthorityGroupState(lease);
        if (group === "owned" || group === "empty") {
          const reaping = path.join(
            slotsRoot,
            `.reaping-${entry.name}-${lease.ownerToken.slice(0, 16)}`,
          );
          await rename(slotDirectory, reaping);
          leases.push(lease);
          recoveries.push(lease.contextFile);
        } else {
          await quarantineRecoveryDirectory(
            slotDirectory,
            new Error(
              `stale journey authority group ${lease.ownerPgid} is ${group}`,
            ),
          );
          uncertain = true;
        }
      }
    } catch (error) {
      if (!(await fileExists(slotDirectory))) {
        continue;
      }
      const age = Date.now() - (await stat(slotDirectory)).mtimeMs;
      if (age < 5_000) {
        uncertain = true;
        continue;
      }
      await quarantineRecoveryDirectory(slotDirectory, error);
      uncertain = true;
    }
  }
  return {
    leases,
    recoveries: recoveries.filter((candidate) => candidate !== ""),
    reservedSlots,
    uncertain,
  };
}

async function inspectCleanupTransition(directory: string): Promise<{
  readonly lease?: Lease;
  readonly recover: boolean;
  readonly uncertain: boolean;
}> {
  if (await fileExists(path.join(directory, "quarantined.json"))) {
    return { recover: false, uncertain: true };
  }
  const lease = await recoveryLease(directory);
  if (lease === undefined) {
    return { recover: false, uncertain: true };
  }
  if ((await recoveryContext(directory, lease)) === undefined) {
    return { lease, recover: false, uncertain: true };
  }
  const cleaner = await readOptionalCleanupOwner(directory);
  if (cleaner !== undefined) {
    const cleanerOwnership = processOwnership(
      cleaner.ownerPid,
      cleaner.ownerNonce,
    );
    if (cleanerOwnership.kind === "owned") {
      return { lease, recover: false, uncertain: false };
    }
    if (cleanerOwnership.kind === "uncertain") {
      await quarantineRecoveryDirectory(
        directory,
        new Error(`cleanup owner ${cleaner.ownerPid} is uncertain`),
      );
      return { lease, recover: false, uncertain: true };
    }
  }
  const leaseOwnership = processOwnership(lease.ownerPid, lease.ownerNonce);
  if (leaseOwnership.kind === "owned") {
    return { lease, recover: false, uncertain: false };
  }
  if (leaseOwnership.kind === "uncertain") {
    await quarantineRecoveryDirectory(
      directory,
      new Error(`journey owner ${lease.ownerPid} is uncertain`),
    );
    return { lease, recover: false, uncertain: true };
  }
  const group = leaseAuthorityGroupState(lease);
  if (group === "owned" || group === "empty") {
    return { lease, recover: true, uncertain: false };
  }
  await quarantineRecoveryDirectory(
    directory,
    new Error(`journey authority group ${lease.ownerPgid} is ${group}`),
  );
  return { lease, recover: false, uncertain: true };
}

async function acquireOwnedLock(
  directory: string,
  purpose: string,
): Promise<OwnedLock> {
  const ownerPid = process.pid;
  if (processOwnership(ownerPid, runtimeOwnerNonce).kind !== "owned") {
    throw new Error(`cannot identify ${purpose} lock owner ${ownerPid}`);
  }
  const token = randomBytes(32).toString("hex");
  await mkdir(path.dirname(directory), { recursive: true });
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    const claim = `${directory}.claim-${ownerPid}-${token.slice(0, 16)}-${attempt}`;
    try {
      await mkdir(claim);
      try {
        await writeJsonAtomically(path.join(claim, "owner.json"), {
          ownerNonce: runtimeOwnerNonce,
          ownerPid,
          token,
          version: 1,
        });
      } catch (error) {
        await rm(claim, { force: true, recursive: true });
        throw error;
      }
      try {
        await rename(claim, directory);
        return { directory, token };
      } catch (error) {
        await rm(claim, { force: true, recursive: true });
        if (!isPathOccupied(error)) {
          throw error;
        }
      }
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
    }
    const state = await ownedLockState(directory);
    if (state === "uncertain") {
      throw new Error(`${purpose} lock ${directory} has uncertain ownership`);
    }
    if (state === "stale") {
      const stale = `${directory}.stale-${randomBytes(8).toString("hex")}`;
      try {
        await rename(directory, stale);
        await rm(stale, { force: true, recursive: true });
        continue;
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${purpose} lock`);
}

async function releaseOwnedLock(lock: OwnedLock): Promise<void> {
  const owner = lockOwnerSchema.parse(
    JSON.parse(await readFile(path.join(lock.directory, "owner.json"), "utf8")),
  );
  if (
    owner.ownerPid !== process.pid ||
    owner.ownerNonce !== runtimeOwnerNonce ||
    owner.token !== lock.token
  ) {
    throw new Error(`refusing to release a lock owned by another process`);
  }
  const releasing = `${lock.directory}.release-${lock.token.slice(0, 16)}`;
  await rename(lock.directory, releasing);
  await rm(releasing, { force: true, recursive: true });
}

async function ownedLockState(
  directory: string,
): Promise<"live" | "pending" | "stale" | "uncertain"> {
  let serialized: string;
  try {
    serialized = await readFile(path.join(directory, "owner.json"), "utf8");
  } catch (error) {
    if (!isMissingFile(error)) {
      return "uncertain";
    }
    try {
      const age = Date.now() - (await stat(directory)).mtimeMs;
      return age < 5_000 ? "pending" : "stale";
    } catch (error) {
      if (isMissingFile(error)) {
        return "stale";
      }
      throw error;
    }
  }
  let owner: z.infer<typeof lockOwnerSchema>;
  try {
    owner = lockOwnerSchema.parse(JSON.parse(serialized));
  } catch {
    return "uncertain";
  }
  const ownership = processOwnership(owner.ownerPid, owner.ownerNonce);
  switch (ownership.kind) {
    case "owned":
      return "live";
    case "foreign":
    case "missing":
      return "stale";
    case "uncertain":
      return "uncertain";
    default: {
      const exhaustive: never = ownership;
      return exhaustive;
    }
  }
}

async function recoveryLease(directory: string): Promise<Lease | undefined> {
  try {
    return leaseSchema.parse(
      JSON.parse(await readFile(path.join(directory, "lease.json"), "utf8")),
    );
  } catch (error) {
    await quarantineRecoveryDirectory(directory, error);
    return undefined;
  }
}

function leaseAuthorityGroupState(
  lease: Lease,
): "empty" | "foreign" | "owned" | "uncertain" {
  const group = inspectProcessGroup(lease.ownerPgid);
  if (group.kind !== "members") {
    return group.kind;
  }
  const anchored = group.members.some(
    (member) =>
      member.command.includes(lease.ownerNonce) &&
      (member.pid === lease.ownerPid ||
        member.pid === lease.ownerGuardianPid ||
        member.command.includes("guardian")),
  );
  return anchored ? "owned" : "foreign";
}

async function waitForLeaseAuthorityRelease(
  lease: Lease,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = leaseAuthorityGroupState(lease);
    if (state === "empty") {
      return true;
    }
    if (state === "uncertain" || state === "foreign") {
      return false;
    }
    await delay(100);
  }
  return false;
}

async function recoveryContext(
  directory: string,
  lease: Lease,
): Promise<JourneyRunContext | undefined> {
  try {
    return await contextForLease(lease, directory);
  } catch (error) {
    await quarantineRecoveryDirectory(directory, error);
    return undefined;
  }
}

async function quarantineRecoveryDirectory(
  directory: string,
  error: unknown,
): Promise<void> {
  await writeJsonAtomically(path.join(directory, "quarantined.json"), {
    quarantinedAt: new Date().toISOString(),
    reason: error instanceof Error ? error.message : String(error),
    status: "manual-reconciliation-required",
    version: 1,
  });
}

async function contextForLease(
  lease: Lease,
  physicalLeaseDirectory: string,
): Promise<JourneyRunContext> {
  const expectedSlotsRoot = path.dirname(physicalLeaseDirectory);
  assertPhysicalLeaseDirectory(physicalLeaseDirectory, lease);
  const repository = await realpath(lease.repository);
  if (repository !== lease.repository) {
    throw new Error(`lease ${lease.slot} repository is not canonical`);
  }
  const registryRoot = await runtimeRegistryRoot(repository);
  if (path.join(registryRoot, "slots") !== expectedSlotsRoot) {
    throw new Error(`lease ${lease.slot} does not belong to its physical registry`);
  }
  const leaseDirectory = path.join(
    expectedSlotsRoot,
    String(lease.slot).padStart(4, "0"),
  );
  const expected = canonicalRunLayout(lease);
  if (lease.contextFile !== expected.contextFile) {
    throw new Error(`lease ${lease.slot} context path is not canonical`);
  }
  await assertSafeContextFileBeforeRead(repository, expected.contextFile);
  let context: JourneyRunContext;
  try {
    context = await readContext(expected.contextFile);
  } catch (error) {
    throw new Error(
      `cannot reconcile lease ${lease.slot} without its run context`,
      { cause: error },
    );
  }
  await assertCanonicalContextLayout(context, lease, {
    leaseDirectory,
    repository,
  });
  if (
    context.lease.ownerToken !== lease.ownerToken ||
    context.lease.slot !== lease.slot ||
    context.owner.pid !== lease.ownerPid ||
    context.owner.guardianPid !== lease.ownerGuardianPid ||
    context.owner.pgid !== lease.ownerPgid ||
    context.owner.nonce !== lease.ownerNonce ||
    (context.compose.kind === "compose" ? context.compose.project : null) !==
      lease.composeProject ||
    context.runId !== lease.runId ||
    context.paths.repository !== lease.repository ||
    context.scenario !== lease.scenario ||
    context.suiteId !== lease.suiteId
  ) {
    throw new Error(`stale lease ${lease.slot} does not match its run context`);
  }
  return context;
}

function assertPhysicalLeaseDirectory(directory: string, lease: Lease): void {
  const slot = String(lease.slot).padStart(4, "0");
  const suffix = `${slot}-${lease.ownerToken.slice(0, 16)}`;
  const name = path.basename(directory);
  if (
    name !== slot &&
    name !== `.reaping-${suffix}` &&
    name !== `.release-${suffix}`
  ) {
    throw new Error(
      `physical lease ${directory} does not match slot ${lease.slot} ownership`,
    );
  }
}

type CanonicalRunIdentity = Pick<
  Lease,
  "attempt" | "repository" | "runId" | "scenario" | "suiteId"
>;

function canonicalRunLayout(identity: CanonicalRunIdentity): {
  readonly artifacts: string;
  readonly contextFile: string;
  readonly generated: string;
  readonly logs: string;
  readonly process: string;
  readonly runRoot: string;
} {
  const runRoot = path.join(
    identity.repository,
    "artifacts",
    "runs",
    identity.suiteId,
    identity.scenario,
    identity.runId,
    `attempt-${identity.attempt}`,
  );
  return {
    artifacts: path.join(runRoot, "artifacts", identity.scenario),
    contextFile: path.join(runRoot, "context.json"),
    generated: path.join(runRoot, "generated"),
    logs: path.join(runRoot, "logs"),
    process: path.join(runRoot, "process"),
    runRoot,
  };
}

async function assertCanonicalContextLayout(
  context: JourneyRunContext,
  lease: Lease | undefined,
  expected: { readonly leaseDirectory: string; readonly repository: string },
): Promise<void> {
  const identity: CanonicalRunIdentity =
    lease ?? {
      attempt: context.attempt,
      repository: expected.repository,
      runId: context.runId,
      scenario: context.scenario,
      suiteId: context.suiteId,
    };
  const layout = canonicalRunLayout(identity);
  const pathMismatch =
    context.paths.repository !== identity.repository ||
    context.paths.runRoot !== layout.runRoot ||
    context.paths.artifacts !== layout.artifacts ||
    context.paths.generated !== layout.generated ||
    context.paths.logs !== layout.logs ||
    context.paths.process !== layout.process ||
    context.lease.directory !== expected.leaseDirectory;
  const composeMismatch =
    context.compose.kind === "compose" &&
    (context.compose.baseFile !==
      path.join(identity.repository, "e2e", identity.scenario, "compose.yaml") ||
      context.compose.overrideFile !== path.join(layout.runRoot, "compose.owner.yaml"));
  const block = journeyPortAt(context.lease.slot, 0);
  const expectedPorts: JourneyRunContext["ports"] = {
    adapter: block + 13,
    auth: block + 2,
    connector: block + 7,
    effectWorker: block + 12,
    keycloak: block + 11,
    minio: block + 3,
    postgres: block,
    provider: block + 8,
    restateIngress: block + 5,
    restateNode: block + 4,
    restateUi: block + 6,
    worker: block + 9,
    workerControl: block + 10,
    zoend: block + 1,
  };
  const executionLabel = dnsLabel(
    `${digest(identity.repository).slice(0, 10)}-${identity.suiteId}-${identity.runId}-attempt-${identity.attempt}`,
  );
  const name = `${executionLabel}.${dnsLabel(identity.scenario)}.zoen.localhost`;
  const expectedHttpNames = { auth: `auth.${name}`, zoend: `zoend.${name}` };
  const expectedProject = composeProjectName(
    identity.scenario,
    digest(
      `${digest(identity.repository).slice(0, 10)}\0${digest(`${identity.suiteId}\0${identity.scenario}\0${identity.runId}`)}\0${identity.attempt}`,
    ).slice(0, 20),
  );
  const authorityMismatch =
    lease !== undefined &&
    (context.lease.ownerToken !== lease.ownerToken ||
      context.lease.slot !== lease.slot ||
      context.owner.pid !== lease.ownerPid ||
      context.owner.guardianPid !== lease.ownerGuardianPid ||
      context.owner.pgid !== lease.ownerPgid ||
      context.owner.nonce !== lease.ownerNonce ||
      (context.compose.kind === "compose" ? context.compose.project : null) !==
        lease.composeProject);
  const topologyMismatch =
    JSON.stringify(context.ports) !== JSON.stringify(expectedPorts) ||
    JSON.stringify(context.httpNames) !== JSON.stringify(expectedHttpNames) ||
    (context.compose.kind === "compose" && context.compose.project !== expectedProject);
  if (
    pathMismatch ||
    composeMismatch ||
    authorityMismatch ||
    topologyMismatch ||
    context.attempt !== identity.attempt ||
    context.runId !== identity.runId ||
    context.scenario !== identity.scenario ||
    context.suiteId !== identity.suiteId
  ) {
    throw new Error(
      `journey context layout is not canonical for ${identity.scenario}/${identity.runId}`,
    );
  }
  const resolvedRepository = await realpath(context.paths.repository);
  if (resolvedRepository !== identity.repository) {
    throw new Error(`journey repository path is not canonical`);
  }
  await assertRealOwnedLayout(identity.repository, layout);
}

async function assertRealOwnedLayout(
  repository: string,
  layout: ReturnType<typeof canonicalRunLayout>,
): Promise<void> {
  const ancestors = [
    path.join(repository, "artifacts"),
    path.join(repository, "artifacts", "runs"),
  ];
  let current = path.join(repository, "artifacts", "runs");
  const relative = path.relative(current, layout.runRoot).split(path.sep);
  for (const segment of relative) {
    current = path.join(current, segment);
    ancestors.push(current);
  }
  for (const candidate of ancestors) {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`owned journey layout contains unsafe path ${candidate}`);
    }
  }
  for (const candidate of [
    layout.artifacts,
    layout.generated,
    layout.logs,
    layout.process,
  ]) {
    let nested = layout.runRoot;
    for (const segment of path.relative(layout.runRoot, candidate).split(path.sep)) {
      nested = path.join(nested, segment);
      try {
        const metadata = await lstat(nested);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new Error(`owned journey path is not a real directory: ${nested}`);
        }
      } catch (error) {
        if (isMissingFile(error)) {
          break;
        }
        throw error;
      }
    }
  }
  const contextMetadata = await lstat(layout.contextFile);
  if (contextMetadata.isSymbolicLink() || !contextMetadata.isFile()) {
    throw new Error(`journey context is not a regular file: ${layout.contextFile}`);
  }
}

function assertConfinedContextFile(repository: string, contextFile: string): void {
  const relative = path.relative(
    path.join(repository, "artifacts", "runs"),
    contextFile,
  );
  const parts = relative.split(path.sep);
  if (
    path.isAbsolute(relative) ||
    relative.startsWith(`..${path.sep}`) ||
    parts.length !== 5 ||
    !idSchema.safeParse(parts[0]).success ||
    !idSchema.safeParse(parts[1]).success ||
    !idSchema.safeParse(parts[2]).success ||
    !/^attempt-[1-9][0-9]*$/.test(parts[3] ?? "") ||
    parts[4] !== "context.json"
  ) {
    throw new Error(`journey context path escapes its canonical run layout`);
  }
}

async function assertSafeContextFileBeforeRead(
  repository: string,
  contextFile: string,
): Promise<void> {
  assertConfinedContextFile(repository, contextFile);
  let current = repository;
  for (const segment of path
    .relative(repository, path.dirname(contextFile))
    .split(path.sep)) {
    current = path.join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`journey context ancestor is unsafe: ${current}`);
    }
  }
  const metadata = await lstat(contextFile);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`journey context is not a regular file: ${contextFile}`);
  }
}

async function repositoryForContextFile(
  contextFile: string,
  currentRepository: string,
): Promise<string> {
  let candidate = contextFile;
  for (let depth = 0; depth < 7; depth += 1) {
    candidate = path.dirname(candidate);
  }
  const repository = await realpath(candidate);
  if (repository !== candidate) {
    throw new Error(`journey context repository is not a canonical real path`);
  }
  assertConfinedContextFile(repository, contextFile);
  const [candidateRegistry, currentRegistry] = await Promise.all([
    runtimeRegistryRoot(repository),
    runtimeRegistryRoot(currentRepository),
  ]);
  if (candidateRegistry !== currentRegistry) {
    throw new Error(`journey context does not belong to the shared repository registry`);
  }
  return repository;
}

async function cleanupOwnedResources(context: JourneyRunContext): Promise<void> {
  await stopOwnedProcess(context);
  if (context.compose.kind === "compose") {
    await assertComposeOwnership(context);
    const files = [context.compose.baseFile];
    if (await fileExists(context.compose.overrideFile)) {
      files.push(context.compose.overrideFile);
    }
    const arguments_ = ["compose", "--project-name", context.compose.project];
    for (const file of files) {
      arguments_.push("--file", file);
    }
    arguments_.push("down", "--volumes", "--remove-orphans");
    const result = spawnSync("docker", arguments_, {
      cwd: context.paths.repository,
      encoding: "utf8",
      env: { ...process.env, ...contextEnvironment(context) },
      killSignal: "SIGKILL",
      timeout: 60_000,
    });
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(
        `failed to remove owned Compose project ${context.compose.project}: ${result.error?.message ?? result.stderr}`,
      );
    }
  }
  assertOwnedPath(context.paths.runRoot, context.paths.generated);
  await rm(context.paths.generated, { force: true, recursive: true });
}

async function assertComposeOwnership(context: JourneyRunContext): Promise<void> {
  if (context.compose.kind !== "compose") {
    return;
  }
  assertDockerResourceOwners(
    [
      "ps",
      "--all",
      "--filter",
      `label=com.docker.compose.project=${context.compose.project}`,
      "--format",
      '{{.ID}}\t{{.Label "zoen.e2e.owner"}}',
    ],
    context,
    "container",
  );
  assertDockerResourceOwners(
    [
      "network",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${context.compose.project}`,
      "--format",
      '{{.ID}}\t{{.Label "zoen.e2e.owner"}}',
    ],
    context,
    "network",
  );
  assertDockerResourceOwners(
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${context.compose.project}`,
      "--format",
      '{{.Name}}\t{{.Label "zoen.e2e.owner"}}',
    ],
    context,
    "volume",
  );
}

function assertDockerResourceOwners(
  arguments_: readonly string[],
  context: JourneyRunContext,
  kind: string,
): void {
  const result = spawnSync("docker", arguments_, {
    encoding: "utf8",
    killSignal: "SIGKILL",
    timeout: 15_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `cannot inspect Compose ${kind} ownership: ${result.error?.message ?? result.stderr}`,
    );
  }
  for (const line of result.stdout.split("\n").filter((entry) => entry !== "")) {
    const separator = line.indexOf("\t");
    const identity = separator < 0 ? line : line.slice(0, separator);
    const owner = separator < 0 ? "" : line.slice(separator + 1);
    if (owner !== context.lease.ownerToken) {
      const project =
        context.compose.kind === "compose" ? context.compose.project : context.runId;
      throw new Error(
        `refusing to remove ${kind} ${identity} from ${project}: owner label mismatch`,
      );
    }
  }
}

async function stopOwnedProcess(context: JourneyRunContext): Promise<void> {
  const metadataPath = path.join(context.paths.process, "scenario.json");
  let metadata: z.infer<typeof processMetadataSchema>;
  try {
    metadata = processMetadataSchema.parse(
      JSON.parse(await readFile(metadataPath, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      await stopPrepublicationAuthority(context);
      return;
    }
    throw error;
  }
  if (
    metadata.ownerToken !== context.lease.ownerToken ||
    metadata.authorityNonce !== context.owner.nonce ||
    metadata.pgid !== context.owner.pgid ||
    metadata.pid !== context.owner.pid
  ) {
    throw new Error(`process ownership mismatch for ${context.runId}`);
  }
  if (await matchingGroupCleanReceipt(context, metadata)) {
    return;
  }

  let group = inspectProcessGroup(metadata.pgid);
  if (group.kind === "uncertain") {
    throw new Error(
      `cannot inspect journey process group ${metadata.pgid}: ${group.reason}`,
    );
  }
  if (group.kind === "empty") {
    await writeGroupCleanReceipt(context, metadata);
    return;
  }
  const leader = group.members.find((member) => member.pid === metadata.pid);
  if (leader !== undefined) {
    const ownership = processOwnership(metadata.pid, metadata.authorityNonce);
    if (
      ownership.kind !== "owned" ||
      leader.pgid !== metadata.pgid ||
      !leader.command.includes(metadata.runnerPath)
    ) {
      throw new Error(
        `refusing to signal reused or foreign journey leader ${metadata.pid}`,
      );
    }
  } else if (
    !group.members.some(
      (member) =>
        member.pid === context.owner.guardianPid &&
        member.command.includes("prepare-lock.mjs") &&
        member.command.includes("--guardian") &&
        member.command.includes(metadata.authorityNonce),
    )
  ) {
    throw new Error(
      `refusing to signal orphaned journey group ${metadata.pgid} without its ownership guardian`,
    );
  }

  signalOwnedJourneyGroup(context, metadata, "SIGTERM");
  if (!(await waitForEmptyProcessGroup(metadata.pgid, 50))) {
    signalOwnedJourneyGroup(context, metadata, "SIGKILL");
    if (!(await waitForEmptyProcessGroup(metadata.pgid, 50))) {
      group = inspectProcessGroup(metadata.pgid);
      const members =
        group.kind === "members"
          ? group.members.map((member) => member.pid).join(",")
          : group.kind;
      throw new Error(
        `journey process group ${metadata.pgid} survived cleanup (${members})`,
      );
    }
  }
  await writeGroupCleanReceipt(context, metadata);
}

async function stopPrepublicationAuthority(
  context: JourneyRunContext,
): Promise<void> {
  const lease: Lease = {
    attempt: context.attempt,
    composeProject:
      context.compose.kind === "compose" ? context.compose.project : null,
    contextFile: path.join(context.paths.runRoot, "context.json"),
    createdAt: context.createdAt,
    exclusive: false,
    ownerGuardianPid: context.owner.guardianPid,
    ownerNonce: context.owner.nonce,
    ownerPgid: context.owner.pgid,
    ownerPid: context.owner.pid,
    ownerToken: context.lease.ownerToken,
    repository: context.paths.repository,
    runId: context.runId,
    scenario: context.scenario,
    slot: context.lease.slot,
    suiteId: context.suiteId,
    version: 2,
  };
  const state = leaseAuthorityGroupState(lease);
  if (state === "empty") {
    return;
  }
  if (state !== "owned") {
    throw new Error(
      `cannot prove prepublication journey group ${context.owner.pgid} ownership (${state})`,
    );
  }
  signalProcessGroup(context.owner.pgid, "SIGTERM");
  if (await waitForLeaseAuthorityRelease(lease, 50)) {
    return;
  }
  if (leaseAuthorityGroupState(lease) === "owned") {
    signalProcessGroup(context.owner.pgid, "SIGKILL");
  }
  if (!(await waitForLeaseAuthorityRelease(lease, 50))) {
    throw new Error(
      `prepublication journey group ${context.owner.pgid} survived cleanup`,
    );
  }
}

async function matchingGroupCleanReceipt(
  context: JourneyRunContext,
  metadata: z.infer<typeof processMetadataSchema>,
): Promise<boolean> {
  const receiptPath = path.join(context.paths.process, "group-clean.json");
  let receipt: z.infer<typeof groupCleanSchema>;
  try {
    receipt = groupCleanSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw new Error(`invalid journey process cleanup receipt ${receiptPath}`, {
      cause: error,
    });
  }
  if (
    receipt.groupCleanToken !== metadata.groupCleanToken ||
    receipt.ownerToken !== context.lease.ownerToken ||
    receipt.pgid !== metadata.pgid
  ) {
    throw new Error(`journey process cleanup receipt ownership mismatch`);
  }
  return true;
}

async function writeGroupCleanReceipt(
  context: JourneyRunContext,
  metadata: z.infer<typeof processMetadataSchema>,
): Promise<void> {
  await writeJsonAtomically(path.join(context.paths.process, "group-clean.json"), {
    cleanedAt: new Date().toISOString(),
    groupCleanToken: metadata.groupCleanToken,
    ownerToken: context.lease.ownerToken,
    pgid: metadata.pgid,
    status: "group-empty",
    version: 1,
  });
}

async function loadCanonicalActiveContext(
  contextFile: string,
  repository: string,
): Promise<JourneyRunContext> {
  await assertSafeContextFileBeforeRead(repository, contextFile);
  const supplied = await readContext(contextFile);
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  const leaseDirectory = path.join(
    slotsRoot,
    String(supplied.lease.slot).padStart(4, "0"),
  );
  let lease: Lease;
  try {
    lease = leaseSchema.parse(
      JSON.parse(await readFile(path.join(leaseDirectory, "lease.json"), "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error) && !(await fileExists(leaseDirectory))) {
      throw new Error(`journey lease is no longer owned by ${supplied.runId}`, {
        cause: error,
      });
    }
    throw new Error(`active journey lease ${leaseDirectory} is invalid`, {
      cause: error,
    });
  }
  const canonical = await contextForLease(lease, leaseDirectory);
  if (JSON.stringify(canonical) !== JSON.stringify(supplied)) {
    throw new Error(`journey context changed after allocation for ${supplied.runId}`);
  }
  return canonical;
}

async function loadCanonicalCompletedContext(
  contextFile: string,
  repository: string,
): Promise<JourneyRunContext> {
  await assertSafeContextFileBeforeRead(repository, contextFile);
  const context = await readContext(contextFile);
  const registryRoot = await runtimeRegistryRoot(repository);
  await assertCanonicalContextLayout(context, undefined, {
    leaseDirectory: path.join(
      registryRoot,
      "slots",
      String(context.lease.slot).padStart(4, "0"),
    ),
    repository,
  });
  return context;
}

async function reachReleaseProofBarrier(
  context: JourneyRunContext,
): Promise<void> {
  const root = process.env.ZOEN_E2E_RUNTIME_RELEASE_BARRIER_DIR;
  if (root === undefined || root === "") {
    return;
  }
  await mkdir(root, { recursive: true });
  await writeJsonAtomically(
    path.join(root, `${context.runId}.release-renamed.ready.json`),
    {
      ownerToken: context.lease.ownerToken,
      runId: context.runId,
      stage: "release-renamed",
    },
  );
  const release = path.join(
    root,
    `${context.runId}.release-renamed.release`,
  );
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    if (await fileExists(release)) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `runtime proof barrier release-renamed timed out for ${context.runId}`,
  );
}

function contextEnvironment(context: JourneyRunContext): NodeJS.ProcessEnv {
  return {
    ZOEN_E2E_ADAPTER_PORT: String(context.ports.adapter),
    ZOEN_E2E_ARTIFACTS_DIR: context.paths.artifacts,
    ZOEN_E2E_ATTEMPT: String(context.attempt),
    ZOEN_E2E_AUTH_NAME: context.httpNames.auth,
    ZOEN_E2E_AUTH_PORT: String(context.ports.auth),
    ZOEN_E2E_BUILD_IDENTITY: context.buildIdentity,
    ZOEN_E2E_CONNECTOR_PORT: String(context.ports.connector),
    ZOEN_E2E_CONTEXT_FILE: path.join(context.paths.runRoot, "context.json"),
    ZOEN_E2E_EFFECT_PROVIDER_PORT: String(context.ports.provider),
    ZOEN_E2E_EFFECT_WORKER_PORT: String(context.ports.effectWorker),
    ZOEN_E2E_GENERATED_DIR: context.paths.generated,
    ZOEN_E2E_KEYCLOAK_PORT: String(context.ports.keycloak),
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
}

async function readContext(contextFile: string): Promise<JourneyRunContext> {
  return journeyRunContextSchema.parse(JSON.parse(await readFile(contextFile, "utf8")));
}

async function readOptionalPointer(pointerFile: string) {
  try {
    return journeyContextPointerSchema.parse(
      JSON.parse(await readFile(pointerFile, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw new Error(`invalid journey context pointer ${pointerFile}`, {
      cause: error,
    });
  }
}

async function latestCompletedContext(
  pointerFile: string,
  repository: string,
): Promise<JourneyRunContext> {
  const pointer = await readOptionalPointer(pointerFile);
  if (pointer === undefined) {
    throw new Error(`missing journey context pointer ${pointerFile}`);
  }
  const seed = await loadCanonicalCompletedContext(pointer.contextFile, repository);
  if (
    seed.attempt !== pointer.attempt ||
    seed.runId !== pointer.runId ||
    seed.scenario !== pointer.scenario ||
    seed.suiteId !== pointer.suiteId
  ) {
    throw new Error(`journey context pointer ${pointerFile} does not match its context`);
  }
  const runRoot = path.dirname(seed.paths.runRoot);
  const expectedRunRoot = path.join(
    repository,
    "artifacts",
    "runs",
    seed.suiteId,
    seed.scenario,
    seed.runId,
  );
  if (
    runRoot !== expectedRunRoot ||
    path.basename(seed.paths.runRoot) !== `attempt-${seed.attempt}` ||
    path.basename(runRoot) !== seed.runId ||
    path.basename(path.dirname(runRoot)) !== seed.scenario ||
    path.basename(path.dirname(path.dirname(runRoot))) !== seed.suiteId
  ) {
    throw new Error(`journey context ${pointer.contextFile} has an invalid run root`);
  }
  const attempts = (await readdir(runRoot, { withFileTypes: true }))
    .flatMap((entry) => {
      const match = entry.isDirectory() ? /^attempt-([1-9][0-9]*)$/.exec(entry.name) : null;
      return match?.[1] === undefined
        ? []
        : [{ attempt: Number.parseInt(match[1], 10), name: entry.name }];
    })
    .sort((a, b) => b.attempt - a.attempt);
  for (const candidate of attempts) {
    const contextFile = path.join(runRoot, candidate.name, "context.json");
    let context: JourneyRunContext;
    try {
      context = await loadCanonicalCompletedContext(contextFile, repository);
    } catch (error) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    if (
      context.attempt !== candidate.attempt ||
      context.runId !== seed.runId ||
      context.scenario !== seed.scenario ||
      context.suiteId !== seed.suiteId ||
      context.paths.repository !== seed.paths.repository ||
      context.paths.runRoot !== path.join(runRoot, candidate.name)
    ) {
      throw new Error(`attempt ${candidate.attempt} does not belong to ${seed.runId}`);
    }
    let result: z.infer<typeof runResultSchema>;
    let cleanup: z.infer<typeof cleanupResultSchema>;
    try {
      result = runResultSchema.parse(
        JSON.parse(await readFile(path.join(context.paths.runRoot, "result.json"), "utf8")),
      );
      cleanup = cleanupResultSchema.parse(
        JSON.parse(await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8")),
      );
    } catch (error) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    if (
      result.ownerToken !== context.lease.ownerToken ||
      result.sourceSha !== context.sourceSha ||
      result.buildIdentity !== context.buildIdentity ||
      cleanup.ownerToken !== context.lease.ownerToken
    ) {
      throw new Error(`attempt ${candidate.attempt} has mixed completion ownership`);
    }
    if (cleanup.status === "clean") {
      return context;
    }
  }
  throw new Error(`run ${seed.runId} has no completed attempt`);
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    } else {
      throw new Error(`artifact tree contains unsupported entry ${from}`);
    }
  }
}

function jsonObject(text: string, source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function requiredFlag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function booleanFlag(name: string): boolean {
  const raw = requiredFlag(name);
  if (raw !== "true" && raw !== "false") {
    throw new Error(`${name} must be true or false`);
  }
  return raw === "true";
}

function positiveInteger(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function composeProjectName(scenario: string, suffix: string): string {
  const available = 63 - "zoen--".length - suffix.length;
  return `zoen-${scenario.slice(0, available)}-${suffix}`;
}

function dnsLabel(value: string): string {
  if (value.length <= 63) {
    return value;
  }
  const prefix = value.slice(0, 46).replace(/-+$/, "");
  return `${prefix}-${digest(value).slice(0, 16)}`;
}

function requireComposeProject(project: string | null): string {
  if (project === null) {
    throw new Error("Compose project is missing");
  }
  return project;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(repository: string, arguments_: readonly string[]): string {
  return execFileSync("/usr/bin/git", arguments_, {
    cwd: repository,
    encoding: "utf8",
    env: processInspectionEnvironment(),
  }).trim();
}

function processOwnership(pid: number, nonce: string): ProcessOwnership {
  const liveness = processLiveness(pid);
  if (liveness.kind !== "alive") {
    return liveness;
  }
  const result = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: processInspectionEnvironment(),
      killSignal: "SIGKILL",
      timeout: 5_000,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    const afterInspection = processLiveness(pid);
    return afterInspection.kind === "missing"
      ? afterInspection
      : {
          kind: "uncertain",
          reason: result.error?.message ?? `ps exited ${String(result.status)}`,
        };
  }
  const commandLine = result.stdout.trim();
  if (commandLine === "") {
    const afterInspection = processLiveness(pid);
    return afterInspection.kind === "missing"
      ? afterInspection
      : { kind: "uncertain", reason: "ps returned an empty command" };
  }
  return commandLine.includes(nonce) ? { kind: "owned" } : { kind: "foreign" };
}

function processLiveness(
  pid: number,
): { readonly kind: "alive" } | Extract<ProcessOwnership, { kind: "missing" | "uncertain" }> {
  try {
    process.kill(pid, 0);
    return { kind: "alive" };
  } catch (error) {
    if (isNoSuchProcess(error)) {
      return { kind: "missing" };
    }
    return { kind: "uncertain", reason: String(error) };
  }
}

type ProcessGroupInspection =
  | { readonly kind: "empty" }
  | {
      readonly kind: "members";
      readonly members: readonly {
        readonly command: string;
        readonly pgid: number;
        readonly pid: number;
      }[];
    }
  | { readonly kind: "uncertain"; readonly reason: string };

function inspectProcessGroup(pgid: number): ProcessGroupInspection {
  const result = spawnSync("/bin/ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
    env: processInspectionEnvironment(),
    killSignal: "SIGKILL",
    timeout: 5_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    return {
      kind: "uncertain",
      reason: result.error?.message ?? `ps exited ${String(result.status)}`,
    };
  }
  if (!Number.isInteger(result.pid) || result.pid < 1) {
    return {
      kind: "uncertain",
      reason: "ps did not report its inspection pid",
    };
  }
  const inspectionPid = result.pid;
  const members = result.stdout
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*([0-9]+)\s+([0-9]+)\s+(.*)$/.exec(line);
      if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
        return [];
      }
      const memberPid = Number.parseInt(match[1], 10);
      const memberPgid = Number.parseInt(match[2], 10);
      return memberPgid === pgid && memberPid !== inspectionPid
        ? [
            {
              command: match[3],
              pgid: memberPgid,
              pid: memberPid,
            },
          ]
        : [];
    });
  if (members.length > 0) {
    return { kind: "members", members };
  }
  try {
    process.kill(-pgid, 0);
    return {
      kind: "uncertain",
      reason: "kernel reports a group that ps did not enumerate",
    };
  } catch (error) {
    return isNoSuchProcess(error)
      ? { kind: "empty" }
      : { kind: "uncertain", reason: String(error) };
  }
}

async function waitForEmptyProcessGroup(
  pgid: number,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const group = inspectProcessGroup(pgid);
    if (group.kind === "empty") {
      return true;
    }
    if (group.kind === "uncertain") {
      throw new Error(`cannot inspect process group ${pgid}: ${group.reason}`);
    }
    await delay(100);
  }
  return false;
}

function signalProcessGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (!isNoSuchProcess(error)) {
      throw error;
    }
  }
}

function signalOwnedJourneyGroup(
  context: JourneyRunContext,
  metadata: z.infer<typeof processMetadataSchema>,
  signal: NodeJS.Signals,
): void {
  const group = inspectProcessGroup(metadata.pgid);
  if (group.kind === "empty") {
    return;
  }
  if (group.kind === "uncertain") {
    throw new Error(
      `cannot inspect journey group ${metadata.pgid}: ${group.reason}`,
    );
  }
  const leader = group.members.find((member) => member.pid === metadata.pid);
  const anchoredByLeader =
    leader !== undefined &&
    leader.command.includes(metadata.runnerPath) &&
    processOwnership(metadata.pid, metadata.authorityNonce).kind === "owned";
  const anchoredByGuardian = group.members.some(
    (member) =>
      member.pid === context.owner.guardianPid &&
      member.command.includes("prepare-lock.mjs") &&
      member.command.includes("--guardian") &&
      member.command.includes(metadata.authorityNonce),
  );
  if (!anchoredByLeader && !anchoredByGuardian) {
    throw new Error(
      `refusing to signal journey group ${metadata.pgid} without its ownership anchor`,
    );
  }
  signalProcessGroup(metadata.pgid, signal);
}

function assertJourneyAuthorityGroup(
  ownerPgid: number,
  ownerPid: number,
  guardianPid: number,
  ownerNonce: string,
): void {
  if (ownerPid !== ownerPgid || guardianPid === ownerPid) {
    throw new Error(
      "journey authority must be the group leader with a distinct guardian",
    );
  }
  const group = inspectProcessGroup(ownerPgid);
  if (group.kind !== "members") {
    const reason = group.kind === "uncertain" ? `: ${group.reason}` : "";
    throw new Error(`journey authority group ${ownerPgid} is not live${reason}`);
  }
  const leader = group.members.find((member) => member.pid === ownerPgid);
  const guardian = group.members.find((member) => member.pid === guardianPid);
  if (
    leader === undefined ||
    !leader.command.includes("prepare-lock.mjs") ||
    !leader.command.includes("journey-worker") ||
    !leader.command.includes(ownerNonce) ||
    guardian === undefined ||
    !guardian.command.includes("prepare-lock.mjs") ||
    !guardian.command.includes("guardian") ||
    !guardian.command.includes(ownerNonce)
  ) {
    throw new Error(
      `journey authority group ${ownerPgid} lacks its exact leader and guardian`,
    );
  }
}

function processInspectionEnvironment(): NodeJS.ProcessEnv {
  return { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" };
}

function assertCleanWorktree(repository: string): void {
  const dirty = git(repository, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty !== "") {
    throw new Error(
      `journey provenance requires a clean worktree; commit or remove:\n${dirty}`,
    );
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function assertOwnedPath(parent: string, candidate: string): void {
  const relative = path.relative(parent, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing to remove non-owned path ${candidate}`);
  }
}

async function writeTextAtomically(outputPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(text);
  } finally {
    await handle.close();
  }
  await rename(temporary, outputPath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return errorCode(error) === "EEXIST";
}

function isPathOccupied(error: unknown): boolean {
  const code = errorCode(error);
  return code === "EEXIST" || code === "ENOTEMPTY";
}

function isMissingFile(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

function isNoSuchProcess(error: unknown): boolean {
  return errorCode(error) === "ESRCH";
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
}
