import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  writeJsonAtomically,
  type JourneyRunContext,
} from "./journey-run-context.js";

const portBase = 20_000;
const portBlockWidth = 32;
const portSlotCount = 384;
const sourceShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const preparedBuildSchema = z
  .object({
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    preparedAt: z.string().datetime(),
    sourceSha: sourceShaSchema,
    version: z.literal(1),
  })
  .strict();
const leaseSchema = z
  .object({
    composeProject: z.string().min(1).nullable(),
    contextFile: z.string().min(1),
    createdAt: z.string().datetime(),
    exclusive: z.boolean(),
    ownerPid: z.number().int().positive(),
    ownerStartedAt: z.string().min(1),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    runId: idSchema,
    scenario: idSchema,
    slot: z.number().int().min(0).max(portSlotCount - 1),
    suiteId: idSchema,
    version: z.literal(1),
  })
  .strict();
const lockOwnerSchema = z
  .object({
    ownerPid: z.number().int().positive(),
    ownerStartedAt: z.string().min(1),
    token: z.string().regex(/^[0-9a-f]{64}$/),
    version: z.literal(1),
  })
  .strict();
const processMetadataSchema = z
  .object({
    exitCode: z.number().int().nullable().optional(),
    exitedAt: z.string().datetime().optional(),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    pid: z.number().int().positive(),
    runnerPath: z.string().min(1),
    startedAt: z.string().datetime(),
    state: z.enum(["running", "exited"]),
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

const command = process.argv[2] ?? "";

await main(command);

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
  const ownerStartedAt = processStartedAt(ownerPid);
  if (ownerStartedAt === null) {
    throw new Error(`journey owner process ${ownerPid} is not alive`);
  }
  const sourceSha = git(repository, ["rev-parse", "HEAD"]);
  const prepared = await readPreparedBuild(repository);
  if (prepared.sourceSha !== sourceSha) {
    throw new Error(
      `prepared build ${prepared.sourceSha} does not match journey source ${sourceSha}`,
    );
  }

  const commonGitDirectory = await realpath(
    path.resolve(repository, git(repository, ["rev-parse", "--git-common-dir"])),
  );
  const repositoryKey = digest(commonGitDirectory).slice(0, 32);
  const registryRoot = path.join(tmpdir(), "zoen-e2e-leases", repositoryKey);
  const slotsRoot = path.join(registryRoot, "slots");
  await mkdir(slotsRoot, { recursive: true });
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "journey allocation",
  );
  try {
    const active = await reconcileActiveLeases(slotsRoot);
    if (active.uncertain) {
      throw new Error(
        "journey allocation is blocked by a quarantined or incomplete lease",
      );
    }
    if (exclusive ? active.leases.length > 0 : active.leases.some((lease) => lease.exclusive)) {
      throw new Error(
        exclusive
          ? `exclusive credential journey ${scenario} requires an idle runtime`
          : "an exclusive credential journey currently owns the runtime",
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
    const preferredSlot = Number.parseInt(runKey.slice(0, 8), 16) % portSlotCount;

    for (let offset = 0; offset < portSlotCount; offset += 1) {
      const slot = (preferredSlot + offset) % portSlotCount;
      const leaseDirectory = path.join(slotsRoot, String(slot).padStart(4, "0"));
      if (await fileExists(leaseDirectory)) {
        continue;
      }

      const lease: Lease = {
        composeProject,
        contextFile,
        createdAt: new Date().toISOString(),
        exclusive,
        ownerPid,
        ownerStartedAt,
        ownerToken,
        runId,
        scenario,
        slot,
        suiteId,
        version: 1,
      };
      const context = makeContext({
        attempt,
        buildIdentity: prepared.buildIdentity,
        composeEnabled,
        composeProject,
        contextFile,
        leaseDirectory,
        ownerPid,
        ownerStartedAt,
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
        await writeJsonAtomically(path.join(claimDirectory, "lease.json"), lease);
        await writeJsonAtomically(contextFile, context);
        await rename(claimDirectory, leaseDirectory);
      } catch (error) {
        await rm(claimDirectory, { force: true, recursive: true });
        throw error;
      }
      process.stdout.write(`${contextFile}\n`);
      return;
    }
    throw new Error(`all ${portSlotCount} journey port slots are leased`);
  } finally {
    await releaseOwnedLock(allocationLock);
  }
}

function makeContext(input: {
  attempt: number;
  buildIdentity: string;
  composeEnabled: boolean;
  composeProject: string | null;
  contextFile: string;
  leaseDirectory: string;
  ownerPid: number;
  ownerStartedAt: string;
  ownerToken: string;
  paths: JourneyRunContext["paths"];
  repository: string;
  runId: string;
  scenario: string;
  slot: number;
  sourceSha: string;
  suiteId: string;
}): JourneyRunContext {
  const block = portBase + input.slot * portBlockWidth;
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
    owner: { pid: input.ownerPid, startedAt: input.ownerStartedAt },
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
  const context = await readContext(contextFile);
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
  const context = await readContext(path.resolve(requiredFlag("--context")));
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
  const context = await readContext(contextFile);
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
  const context = await latestCompletedContext(
    path.resolve(requiredFlag("--pointer")),
  );
  process.stdout.write(`${path.join(context.paths.runRoot, "context.json")}\n`);
}

async function markPreparedCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  const sourceSha = git(repository, ["rev-parse", "HEAD"]);
  const preparedAt = new Date().toISOString();
  const buildIdentity = digest(
    `${sourceSha}\0${preparedAt}\0${randomBytes(32).toString("hex")}`,
  );
  await writeJsonAtomically(preparedBuildPath(repository), {
    buildIdentity,
    preparedAt,
    sourceSha,
    version: 1,
  });
  process.stdout.write(`${buildIdentity}\n`);
}

async function markResultCommand(): Promise<void> {
  const context = await readContext(path.resolve(requiredFlag("--context")));
  const status = requiredFlag("--status");
  if (status !== "passed" && status !== "failed") {
    throw new Error("--status must be passed or failed");
  }
  await assertLeaseOwner(context);
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
  const context = await readContext(path.resolve(requiredFlag("--context")));
  const owned = await leaseMatchesContext(context);
  if (!owned) {
    await finishReleasedCleanup(context);
    return;
  }
  await cleanupOwnedResources(context);
  await writeCleanupResult(context, "resources-clean");
  await releaseLease(context);
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
    if (cleanup.status === "resources-clean") {
      await writeCleanupResult(context, "clean");
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
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
  const contexts = await Promise.all(pointers.map(latestCompletedContext));
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
): Promise<{ readonly leases: Lease[]; readonly uncertain: boolean }> {
  const leases: Lease[] = [];
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
      if (!(await resumeReapingDirectory(directory, slotsRoot))) {
        uncertain = true;
      }
      continue;
    }
    if (entry.name.startsWith(".release-")) {
      if (!(await resumeReleaseDirectory(directory))) {
        uncertain = true;
      }
      continue;
    }
    if (!/^\d{4}$/.test(entry.name)) {
      continue;
    }
    const slotDirectory = directory;
    if (await reapIfStale(slotDirectory, slotsRoot)) {
      continue;
    }
    if (!(await fileExists(slotDirectory))) {
      uncertain = true;
      continue;
    }
    try {
      const lease = leaseSchema.parse(
        JSON.parse(await readFile(path.join(slotDirectory, "lease.json"), "utf8")),
      );
      if (processStartedAt(lease.ownerPid) === lease.ownerStartedAt) {
        leases.push(lease);
      } else {
        uncertain = true;
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        uncertain = true;
      }
    }
  }
  return { leases, uncertain };
}

async function acquireOwnedLock(
  directory: string,
  purpose: string,
): Promise<OwnedLock> {
  const ownerPid = process.pid;
  const ownerStartedAt = processStartedAt(ownerPid);
  if (ownerStartedAt === null) {
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
          ownerPid,
          ownerStartedAt,
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
    if ((await ownedLockState(directory)) === "stale") {
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
  if (owner.token !== lock.token) {
    throw new Error(`refusing to release a lock owned by another process`);
  }
  const releasing = `${lock.directory}.release-${lock.token.slice(0, 16)}`;
  await rename(lock.directory, releasing);
  await rm(releasing, { force: true, recursive: true });
}

async function ownedLockState(directory: string): Promise<"live" | "pending" | "stale"> {
  try {
    const owner = lockOwnerSchema.parse(
      JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")),
    );
    return processStartedAt(owner.ownerPid) === owner.ownerStartedAt
      ? "live"
      : "stale";
  } catch {
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
}

async function reapIfStale(slotDirectory: string, slotsRoot: string): Promise<boolean> {
  if (await fileExists(path.join(slotDirectory, "quarantined.json"))) {
    return false;
  }
  const leasePath = path.join(slotDirectory, "lease.json");
  let lease: Lease | undefined;
  try {
    lease = leaseSchema.parse(JSON.parse(await readFile(leasePath, "utf8")));
  } catch (error) {
    let age: number;
    try {
      age = Date.now() - (await stat(slotDirectory)).mtimeMs;
    } catch (statError) {
      if (isMissingFile(statError)) {
        return true;
      }
      throw statError;
    }
    if (age < 5_000) {
      return false;
    }
    await writeJsonAtomically(path.join(slotDirectory, "quarantined.json"), {
      quarantinedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : String(error),
      status: "manual-reconciliation-required",
      version: 1,
    });
    return false;
  }
  if (
    lease !== undefined &&
    processStartedAt(lease.ownerPid) === lease.ownerStartedAt
  ) {
    return false;
  }
  const reaping = path.join(
    slotsRoot,
    `.reaping-${path.basename(slotDirectory)}-${lease.ownerToken.slice(0, 16)}`,
  );
  try {
    await rename(slotDirectory, reaping);
  } catch (error) {
    if (isMissingFile(error)) {
      return true;
    }
    throw error;
  }
  return resumeReapingDirectory(reaping, slotsRoot);
}

async function resumeReapingDirectory(
  reaping: string,
  slotsRoot: string,
): Promise<boolean> {
  if (await fileExists(path.join(reaping, "quarantined.json"))) {
    return false;
  }
  const lease = await recoveryLease(reaping);
  if (lease === undefined) {
    return false;
  }
  if (processStartedAt(lease.ownerPid) === lease.ownerStartedAt) {
    return false;
  }
  const context = await recoveryContext(reaping, lease);
  if (context === undefined) {
    return false;
  }
  try {
    await cleanupOwnedResources(context);
    await writeCleanupResult(context, "resources-clean");
    const released = path.join(
      slotsRoot,
      `.release-${String(lease.slot).padStart(4, "0")}-${lease.ownerToken.slice(0, 16)}`,
    );
    await rename(reaping, released);
    return resumeReleaseDirectory(released);
  } catch {
    // Docker or process inspection may be temporarily unavailable. Keeping the
    // complete lease makes the cleanup retryable on the next allocation.
    return false;
  }
}

async function resumeReleaseDirectory(released: string): Promise<boolean> {
  if (await fileExists(path.join(released, "quarantined.json"))) {
    return false;
  }
  const lease = await recoveryLease(released);
  if (lease === undefined) {
    return false;
  }
  if (processStartedAt(lease.ownerPid) === lease.ownerStartedAt) {
    return false;
  }
  const context = await recoveryContext(released, lease);
  if (context === undefined) {
    return false;
  }
  try {
    await cleanupOwnedResources(context);
    await writeCleanupResult(context, "resources-clean");
    await writeCleanupResult(context, "clean");
    await rm(released, { force: true, recursive: true });
    return true;
  } catch {
    return false;
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

async function recoveryContext(
  directory: string,
  lease: Lease,
): Promise<JourneyRunContext | undefined> {
  try {
    return await contextForLease(lease);
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

async function contextForLease(lease: Lease): Promise<JourneyRunContext> {
  let context: JourneyRunContext;
  try {
    context = await readContext(lease.contextFile);
  } catch (error) {
    throw new Error(
      `cannot reconcile lease ${lease.slot} without its run context`,
      { cause: error },
    );
  }
  if (
    context.lease.ownerToken !== lease.ownerToken ||
    context.lease.slot !== lease.slot ||
    context.owner.pid !== lease.ownerPid ||
    context.owner.startedAt !== lease.ownerStartedAt ||
    (context.compose.kind === "compose" ? context.compose.project : null) !==
      lease.composeProject ||
    context.runId !== lease.runId ||
    context.scenario !== lease.scenario ||
    context.suiteId !== lease.suiteId
  ) {
    throw new Error(`stale lease ${lease.slot} does not match its run context`);
  }
  return context;
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
    });
    if (result.status !== 0) {
      throw new Error(
        `failed to remove owned Compose project ${context.compose.project}: ${result.stderr}`,
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
  const result = spawnSync("docker", arguments_, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`cannot inspect Compose ${kind} ownership: ${result.stderr}`);
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
      return;
    }
    throw error;
  }
  if (metadata.ownerToken !== context.lease.ownerToken || metadata.state !== "running") {
    return;
  }
  const commandLine = processCommand(metadata.pid);
  if (commandLine === null) {
    return;
  }
  if (
    !commandLine.includes(metadata.runnerPath) ||
    !commandLine.includes(context.lease.ownerToken)
  ) {
    throw new Error(`refusing to signal reused or foreign pid ${metadata.pid}`);
  }
  const processGroup = processGroupId(metadata.pid);
  if (processGroup !== metadata.pid) {
    throw new Error(`refusing to signal non-owned process group ${metadata.pid}`);
  }
  try {
    process.kill(-metadata.pid, "SIGTERM");
  } catch (error) {
    if (!isNoSuchProcess(error)) {
      throw error;
    }
    return;
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processCommand(metadata.pid) === null) {
      return;
    }
    await delay(100);
  }
  process.kill(-metadata.pid, "SIGKILL");
}

async function assertLeaseOwner(context: JourneyRunContext): Promise<void> {
  if (!(await leaseMatchesContext(context))) {
    throw new Error(`journey lease is no longer owned by ${context.runId}`);
  }
}

async function leaseMatchesContext(context: JourneyRunContext): Promise<boolean> {
  try {
    const lease = leaseSchema.parse(
      JSON.parse(
        await readFile(path.join(context.lease.directory, "lease.json"), "utf8"),
      ),
    );
    return (
      lease.composeProject ===
        (context.compose.kind === "compose" ? context.compose.project : null) &&
      lease.contextFile === path.join(context.paths.runRoot, "context.json") &&
      lease.ownerToken === context.lease.ownerToken &&
      lease.ownerPid === context.owner.pid &&
      lease.ownerStartedAt === context.owner.startedAt &&
      lease.runId === context.runId &&
      lease.scenario === context.scenario &&
      lease.slot === context.lease.slot &&
      lease.suiteId === context.suiteId
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

async function releaseLease(context: JourneyRunContext): Promise<void> {
  const slotsRoot = path.dirname(context.lease.directory);
  const registryRoot = path.dirname(slotsRoot);
  const allocationLock = await acquireOwnedLock(
    path.join(registryRoot, "allocation.lock"),
    "journey lease release",
  );
  try {
    await assertLeaseOwner(context);
    const releaseDirectory = path.join(
      slotsRoot,
      `.release-${String(context.lease.slot).padStart(4, "0")}-${context.lease.ownerToken.slice(0, 16)}`,
    );
    await rename(context.lease.directory, releaseDirectory);
    await writeCleanupResult(context, "clean");
    await rm(releaseDirectory, { force: true, recursive: true });
  } finally {
    await releaseOwnedLock(allocationLock);
  }
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

async function latestCompletedContext(pointerFile: string): Promise<JourneyRunContext> {
  const pointer = await readOptionalPointer(pointerFile);
  if (pointer === undefined) {
    throw new Error(`missing journey context pointer ${pointerFile}`);
  }
  const seed = await readContext(pointer.contextFile);
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
    seed.paths.repository,
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
      context = await readContext(contextFile);
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
    env: { PATH: "/usr/bin:/bin" },
  }).trim();
}

function processStartedAt(pid: number): string | null {
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const startedAt = result.status === 0 ? result.stdout.trim() : "";
  return startedAt === "" ? null : startedAt;
}

function processCommand(pid: number): string | null {
  const result = spawnSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const commandLine = result.status === 0 ? result.stdout.trim() : "";
  return commandLine === "" ? null : commandLine;
}

function processGroupId(pid: number): number | null {
  const result = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const raw = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[0-9]+$/.test(raw)) {
    return null;
  }
  return Number.parseInt(raw, 10);
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
