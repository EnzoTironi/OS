import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { code, pathExists, runtimeRegistryRoot } from "./atomic-state.mjs";
import { noncePattern } from "./command-line.mjs";

export const journeyBootstrapReaderCommandTimeoutMilliseconds = 30_000;
export const journeyCleanupRuntimeTimeoutMilliseconds = 300_000;

// The cleanup authority can attempt reader release twice after a failed first
// release. It also owns guardian startup and shutdown and descendant drain.
// The final 60 seconds covers their bounded 5 + 10 + 12 second process waits
// and leaves 33 seconds for IPC and scheduling.
const journeyCleanupAuthorityLifecycleMarginMilliseconds =
  journeyBootstrapReaderCommandTimeoutMilliseconds * 3 + 60_000;

export const journeyCleanupAuthorityTimeoutMilliseconds =
  journeyCleanupRuntimeTimeoutMilliseconds +
  journeyCleanupAuthorityLifecycleMarginMilliseconds;

export const journeyLeaseReconciliationTimeoutMilliseconds =
  journeyCleanupAuthorityTimeoutMilliseconds + 30_000;

export async function canonicalJourneyAuthority(repository, contextFile, allowMissing = false) {
  const resolvedContext = path.resolve(contextFile);
  await assertSafeJourneyContextFileBeforeRead(repository, resolvedContext);
  const context = JSON.parse(await readFile(resolvedContext, "utf8"));
  const identity = parseJourneyContextIdentity(context, resolvedContext);
  const registryRoot = await runtimeRegistryRoot(repository);
  const slotsRoot = path.join(registryRoot, "slots");
  const numeric = path.join(slotsRoot, String(identity.slot).padStart(4, "0"));
  const suffix = `${path.basename(numeric)}-${identity.ownerToken.slice(0, 16)}`;
  const candidates = [
    numeric,
    path.join(slotsRoot, `.reaping-${suffix}`),
    path.join(slotsRoot, `.release-${suffix}`),
  ];
  const found = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "quarantined.json"))) {
      throw new Error(`journey lease ${candidate} is quarantined`);
    }
    try {
      const lease = parseJourneyLease(
        JSON.parse(await readFile(path.join(candidate, "lease.json"), "utf8")),
      );
      found.push({ candidate, lease });
    } catch (error) {
      if (code(error) !== "ENOENT") {
        throw error;
      }
    }
  }
  if (found.length === 0) {
    if (allowMissing) {
      return undefined;
    }
    throw new Error(`journey context ${resolvedContext} has no active lease`);
  }
  if (found.length !== 1) {
    throw new Error(`journey context ${resolvedContext} has conflicting leases`);
  }
  const lease = found[0].lease;
  const layout = canonicalJourneyLayout(lease);
  const expectedProject = expectedComposeProject(lease);
  const expectedPorts = expectedJourneyPorts(lease.slot);
  const expectedNames = expectedJourneyHttpNames(lease);
  if (
    lease.repository !== repository ||
    lease.contextFile !== layout.contextFile ||
    resolvedContext !== layout.contextFile ||
    identity.attempt !== lease.attempt ||
    identity.ownerToken !== lease.ownerToken ||
    identity.runId !== lease.runId ||
    identity.scenario !== lease.scenario ||
    identity.slot !== lease.slot ||
    identity.suiteId !== lease.suiteId ||
    context.paths.repository !== repository ||
    context.paths.runRoot !== layout.runRoot ||
    context.paths.artifacts !== layout.artifacts ||
    context.paths.generated !== layout.generated ||
    context.paths.logs !== layout.logs ||
    context.paths.process !== layout.process ||
    context.lease.directory !== numeric ||
    context.owner?.pid !== lease.ownerPid ||
    context.owner?.pgid !== lease.ownerPgid ||
    context.owner?.guardianPid !== lease.ownerGuardianPid ||
    context.owner?.nonce !== lease.ownerNonce ||
    JSON.stringify(context.ports) !== JSON.stringify(expectedPorts) ||
    JSON.stringify(context.httpNames) !== JSON.stringify(expectedNames) ||
    (context.compose?.kind === "compose"
      ? context.compose.project !== expectedProject ||
        context.compose.baseFile !==
          path.join(repository, "e2e", lease.scenario, "compose.yaml") ||
        context.compose.overrideFile !== path.join(layout.runRoot, "compose.owner.yaml") ||
        lease.composeProject !== expectedProject
      : context.compose?.kind !== "none" || lease.composeProject !== null)
  ) {
    throw new Error(`journey context ${resolvedContext} is not canonical`);
  }
  await assertRealJourneyLayout(repository, layout);
  return {
    context,
    contextFile: layout.contextFile,
    lease,
    metadataPath: path.join(layout.process, "scenario.json"),
  };
}

function parseJourneyContextIdentity(context, source) {
  if (
    context === null ||
    typeof context !== "object" ||
    !Number.isInteger(context.attempt) ||
    context.attempt < 1 ||
    context.contextVersion !== 1 ||
    typeof context.lease !== "object" ||
    !Number.isInteger(context.lease?.slot) ||
    context.lease.slot < 0 ||
    context.lease.slot >= 384 ||
    !noncePattern.test(context.lease?.ownerToken ?? "")
  ) {
    throw new Error(`invalid journey context ${source}`);
  }
  return {
    attempt: context.attempt,
    ownerToken: context.lease.ownerToken,
    runId: journeyId(context.runId),
    scenario: journeyId(context.scenario),
    slot: context.lease.slot,
    suiteId: journeyId(context.suiteId),
  };
}

function parseJourneyLease(lease) {
  if (
    lease === null ||
    typeof lease !== "object" ||
    !Number.isInteger(lease.attempt) ||
    lease.attempt < 1 ||
    !Number.isInteger(lease.ownerPid) ||
    lease.ownerPid < 1 ||
    !Number.isInteger(lease.ownerPgid) ||
    lease.ownerPgid < 1 ||
    !Number.isInteger(lease.ownerGuardianPid) ||
    lease.ownerGuardianPid < 1 ||
    !Number.isInteger(lease.slot) ||
    lease.slot < 0 ||
    lease.slot >= 384 ||
    !noncePattern.test(lease.ownerNonce ?? "") ||
    !noncePattern.test(lease.ownerToken ?? "") ||
    typeof lease.contextFile !== "string" ||
    typeof lease.repository !== "string" ||
    (lease.composeProject !== null && typeof lease.composeProject !== "string") ||
    lease.version !== 2
  ) {
    throw new Error("invalid journey lease");
  }
  journeyId(lease.runId);
  journeyId(lease.scenario);
  journeyId(lease.suiteId);
  return lease;
}

export function canonicalJourneyLayout(identity) {
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

export function expectedJourneyPorts(slot) {
  const block = 20_000 + slot * 32;
  return {
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
}

export function expectedComposeProject(identity) {
  const worktreeKey = sha256(identity.repository).slice(0, 10);
  const runKey = sha256(`${identity.suiteId}\0${identity.scenario}\0${identity.runId}`);
  const suffix = sha256(`${worktreeKey}\0${runKey}\0${identity.attempt}`).slice(0, 20);
  const available = 63 - "zoen--".length - suffix.length;
  return `zoen-${identity.scenario.slice(0, available)}-${suffix}`;
}

export function expectedJourneyHttpNames(identity) {
  const execution = dnsLabel(
    `${sha256(identity.repository).slice(0, 10)}-${identity.suiteId}-${identity.runId}-attempt-${identity.attempt}`,
  );
  const name = `${execution}.${dnsLabel(identity.scenario)}.zoen.localhost`;
  return { auth: `auth.${name}`, zoend: `zoend.${name}` };
}

function dnsLabel(value) {
  if (value.length <= 63) {
    return value;
  }
  return `${value.slice(0, 46).replace(/-+$/, "")}-${sha256(value).slice(0, 16)}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertConfinedJourneyContextFile(repository, contextFile) {
  const relative = path.relative(path.join(repository, "artifacts", "runs"), contextFile);
  const parts = relative.split(path.sep);
  if (
    path.isAbsolute(relative) ||
    relative.startsWith(`..${path.sep}`) ||
    parts.length !== 5 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0] ?? "") ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[1] ?? "") ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2] ?? "") ||
    !/^attempt-[1-9][0-9]*$/.test(parts[3] ?? "") ||
    parts[4] !== "context.json"
  ) {
    throw new Error(`journey context ${contextFile} escapes its canonical run layout`);
  }
}

async function assertSafeJourneyContextFileBeforeRead(repository, contextFile) {
  assertConfinedJourneyContextFile(repository, contextFile);
  let current = repository;
  for (const segment of path.relative(repository, path.dirname(contextFile)).split(path.sep)) {
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

export async function assertRealJourneyLayout(repository, layout) {
  const ancestors = [path.join(repository, "artifacts"), path.join(repository, "artifacts", "runs")];
  let current = ancestors[1];
  for (const segment of path.relative(current, layout.runRoot).split(path.sep)) {
    current = path.join(current, segment);
    ancestors.push(current);
  }
  for (const candidate of ancestors) {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`journey owned path is not a real directory: ${candidate}`);
    }
  }
  for (const candidate of [layout.artifacts, layout.generated, layout.logs, layout.process]) {
    let nested = layout.runRoot;
    for (const segment of path.relative(layout.runRoot, candidate).split(path.sep)) {
      nested = path.join(nested, segment);
      try {
        const metadata = await lstat(nested);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new Error(`journey owned path is not a real directory: ${nested}`);
        }
      } catch (error) {
        if (code(error) === "ENOENT") {
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

export function journeyId(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`invalid journey id ${JSON.stringify(value)}`);
  }
  return value;
}

export function isLeaseDirectory(name) {
  return (
    /^\d{4}$/.test(name) ||
    name.startsWith(".claim-") ||
    name.startsWith(".reaping-") ||
    name.startsWith(".release-")
  );
}
