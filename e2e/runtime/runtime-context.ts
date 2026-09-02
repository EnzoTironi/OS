import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  type JourneyRunContext,
} from "../journey-run-context.js";
import { journeyPortAt } from "../journey-runtime-layout.js";
import {
  cleanupResultSchema,
  idSchema,
  leaseSchema,
  runResultSchema,
  type Lease,
} from "./runtime-contracts.js";
import { runtimeRegistryRoot } from "./runtime-registry.js";
import {
  composeProjectName,
  digest,
  dnsLabel,
  fileExists,
  isMissingFile,
  requireComposeProject,
} from "./runtime-support.js";

export function makeContext(input: {
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


export async function contextForLease(
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

export function assertPhysicalLeaseDirectory(directory: string, lease: Lease): void {
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

export function canonicalRunLayout(identity: CanonicalRunIdentity): {
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

export async function assertCanonicalContextLayout(
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

export async function assertRealOwnedLayout(
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

export function assertConfinedContextFile(repository: string, contextFile: string): void {
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

export async function assertSafeContextFileBeforeRead(
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

export async function repositoryForContextFile(
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


export async function loadCanonicalActiveContext(
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

export async function loadCanonicalCompletedContext(
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


export function contextEnvironment(context: JourneyRunContext): NodeJS.ProcessEnv {
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

export async function readContext(contextFile: string): Promise<JourneyRunContext> {
  return journeyRunContextSchema.parse(JSON.parse(await readFile(contextFile, "utf8")));
}

export async function readOptionalPointer(pointerFile: string) {
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

export async function latestCompletedContext(
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
