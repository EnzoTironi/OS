import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import { AUTH_DOOR_ORIGIN, startAuthDoor, stopAuthDoor } from "./ba-door.js";
import {
  activateDefinition,
  type DefinitionFixture,
} from "./governed-action/support.js";
import {
  authDatabaseUrl,
  crashProcess,
  definitionClient,
  eveOrigin,
  productReadinessEnvironment,
  registrarReady,
  repositoryRoot,
  startEffectRegistrar,
  startMinio,
  startProjection,
  startZoend,
  stopMinio,
  stopProcess,
  tenantA,
  tenantB,
  waitFor,
  zoenBaseUrl,
  type ManagedProcess,
  type WorkloadIdentity,
} from "./effect-support.js";

type Observe = (name: string, value: boolean) => void;

export async function startReadyZoend(
  policyManifestPath: string,
  options: { effectWorkerWorkloadId?: string } = {},
): Promise<ManagedProcess> {
  return startZoend(policyManifestPath, {
    ...options,
    environment: productReadinessEnvironment(),
  });
}

export async function proveProductReadiness(input: {
  admin: PostgresClient;
  adminAToken: string;
  adminBToken: string;
  door: Awaited<ReturnType<typeof startAuthDoor>>;
  fixture: DefinitionFixture;
  humanFixture: DefinitionFixture;
  observe: Observe;
  policyManifestPath: string;
  processes: ManagedProcess[];
  registrar: ManagedProcess;
  workerIdentity: WorkloadIdentity;
  zoend: ManagedProcess;
}): Promise<{
  door: Awaited<ReturnType<typeof startAuthDoor>>;
  registrar: ManagedProcess;
  zoend: ManagedProcess;
}> {
  const {
    admin,
    adminAToken,
    adminBToken,
    fixture,
    humanFixture,
    observe,
    policyManifestPath,
    processes,
    workerIdentity,
  } = input;
  let { door, registrar, zoend } = input;
  const originalPolicy = await readFile(policyManifestPath, "utf8");
  const projection = startProjection();
  processes.push(projection);
  await waitFor(async () => {
    if (projection.child.exitCode !== null) {
      throw new Error(
        `zoen-projection exited during startup:\n${projection.output.join("")}`,
      );
    }
    return true;
  }, "projection process stays alive", 5);
  const eve = await startEve();
  processes.push(eve);

  await waitForReady(
    (body) => body === "ready\n",
    "product dependencies recover to /ready",
  );
  const happy = await fetchReady();
  observe("readyPassesWhenProductDependenciesAreLive", happy.status === 200);
  await assertReadyDoesNotMutate(admin, observe, "healthy");

  await writeFile(policyManifestPath, "{}\n");
  await assertReadyFails(observe, "cedar policy is broken", "cedarBroken");
  await writeFile(policyManifestPath, `${JSON.stringify({ policies: [] })}\n`);
  await assertReadyFails(observe, "cedar policy is missing", "cedarMissing");
  await writeFile(policyManifestPath, originalPolicy);
  await waitForReady((body) => body === "ready\n", "cedar policy restored");

  const activations = await admin.query<{
    definition_id: string;
    digest: string;
    revision: string;
    tenant_id: string;
  }>(
    "SELECT tenant_id, definition_id, digest, revision::text AS revision FROM active_definition_revisions ORDER BY tenant_id, definition_id",
  );
  await admin.query("SET session_replication_role = replica");
  await admin.query(
    "UPDATE active_definition_revisions SET digest = repeat('ab', 32)",
  );
  await admin.query("SET session_replication_role = origin");
  await assertReadyFails(
    observe,
    "active WorldRelease is stale",
    "releaseStale",
  );
  await admin.query("SET session_replication_role = replica");
  for (const row of activations.rows) {
    await admin.query(
      "UPDATE active_definition_revisions SET digest = $1 WHERE tenant_id = $2 AND definition_id = $3",
      [row.digest, row.tenant_id, row.definition_id],
    );
  }
  await admin.query("SET session_replication_role = origin");
  await admin.query("DELETE FROM active_definition_revisions");
  await assertReadyFails(
    observe,
    "active WorldRelease is missing",
    "releaseMissing",
  );
  await activateDefinition(
    definitionClient(adminAToken, tenantA),
    tenantA,
    fixture,
  );
  await activateDefinition(
    definitionClient(adminAToken, tenantA),
    tenantA,
    humanFixture,
  );
  await activateDefinition(
    definitionClient(adminBToken, tenantB),
    tenantB,
    fixture,
  );
  await waitForReady((body) => body === "ready\n", "active WorldRelease restored");

  await stopProcess(projection);
  await waitForReady(
    (body) => body.includes("projection watermark is stale"),
    "stopped projection makes watermark stale",
    80,
  );
  await assertReadyFails(
    observe,
    "projection watermark is stale",
    "projectionStale",
  );
  const restartedProjection = startProjection();
  processes.push(restartedProjection);
  await waitForReady(
    (body) => body === "ready\n",
    "projection watermark recovered",
  );

  await stopProcess(registrar);
  await assertReadyFails(
    observe,
    "ZoenEffect handler registration is missing",
    "effectMissing",
  );
  registrar = await startEffectRegistrar(workerIdentity);
  processes.push(registrar);
  await waitFor(
    async () => ((await registrarReady()) ? true : undefined),
    "effect registrar recovered",
  );
  await waitForReady(
    (body) => body === "ready\n",
    "ZoenEffect handler registration recovered",
  );

  await stopProcess(eve);
  await assertReadyFails(observe, "Eve is missing", "eveMissing");
  const restartedEve = await startEve();
  processes.push(restartedEve);
  await waitForReady((body) => body === "ready\n", "Eve recovered");

  await stopAuthDoor(door);
  await assertReadyFails(observe, "Better Auth is missing", "authMissing");
  door = await startAuthDoor(authDatabaseUrl);
  await waitForReady((body) => body === "ready\n", "Better Auth recovered");

  await stopMinio();
  await assertReadyFails(observe, "storage is broken", "storageBroken");
  await startMinio();
  await waitForReady((body) => body === "ready\n", "storage recovered");

  await crashProcess(zoend);
  const down = await fetchReady();
  observe(
    "readyFailsWhileZoendIsDown",
    down.status === 0 || down.status >= 500,
  );
  zoend = await startReadyZoend(policyManifestPath);
  processes.push(zoend);
  await waitForReady(
    (body) => body === "ready\n",
    "restarted zoend returns /ready only after product recovery",
  );
  observe("readyReturnsAfterRestartRecovery", true);
  await assertReadyDoesNotMutate(admin, observe, "recovered");
  return { door, registrar, zoend };
}

async function assertReadyFails(
  observe: Observe,
  reason: string,
  label: string,
): Promise<void> {
  const response = await fetchReady();
  observe(
    `readyFailsClosedFor_${label}`,
    response.status === 503 && response.body.includes(reason),
  );
}

async function assertReadyDoesNotMutate(
  admin: PostgresClient,
  observe: Observe,
  label: string,
): Promise<void> {
  const before = await authorityFingerprint(admin);
  const ready = await fetchReady();
  assert.equal(ready.status, 200, ready.body);
  const after = await authorityFingerprint(admin);
  observe(`readyDoesNotMutateAuthority_${label}`, before === after);
}

async function authorityFingerprint(admin: PostgresClient): Promise<string> {
  const commits = await admin.query(
    "SELECT tenant_id, commit_sequence, commit_kind FROM authority_commits ORDER BY tenant_id, commit_sequence",
  );
  const activations = await admin.query(
    "SELECT tenant_id, definition_id, digest, revision FROM active_definition_revisions ORDER BY tenant_id, definition_id",
  );
  return JSON.stringify({
    activations: activations.rows,
    commits: commits.rows,
  });
}

async function waitForReady(
  match: (body: string) => boolean,
  description: string,
  attempts = 200,
): Promise<void> {
  let last = { body: "", status: 0 };
  try {
    await waitFor(
      async () => {
        last = await fetchReady();
        return match(last.body) ? true : undefined;
      },
      description,
      attempts,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}: HTTP ${last.status} ${last.body}`);
  }
}

async function fetchReady(): Promise<{ body: string; status: number }> {
  try {
    const response = await fetch(new URL("/ready", zoenBaseUrl));
    return { body: await response.text(), status: response.status };
  } catch {
    return { body: "", status: 0 };
  }
}

async function startEve(): Promise<ManagedProcess> {
  const conversationRoot = path.join(repositoryRoot, "apps", "conversation");
  const eveBin = path.join(conversationRoot, "node_modules", "eve", "bin", "eve.js");
  const npmBin = path.join(path.dirname(process.execPath), "npm");
  if (!existsSync(eveBin)) {
    execFileSync(
      npmBin,
      ["ci", "--ignore-scripts", "--prefix", conversationRoot],
      {
        cwd: repositoryRoot,
        stdio: "inherit",
      },
    );
  }
  const eveNode = eveNodeExecutable();
  const evePath = `${path.dirname(eveNode)}${path.delimiter}${process.env.PATH ?? ""}`;
  const eveOutput = path.join(
    conversationRoot,
    ".output",
    "server",
    "index.mjs",
  );
  if (!existsSync(eveOutput)) {
    const buildEnv = { ...process.env };
    for (const name of [
      "KAPSO_API_KEY",
      "KAPSO_PHONE_NUMBER_ID",
      "KAPSO_WEBHOOK_SECRET",
      "KAPSO_BASE_URL",
      "WHATSAPP_ACCESS_TOKEN",
    ]) {
      delete buildEnv[name];
    }
    execFileSync(eveNode, [eveBin, "build"], {
      cwd: conversationRoot,
      env: {
        ...buildEnv,
        PATH: evePath,
        ZOEN_MODEL: process.env.ZOEN_MODEL ?? "openai-compatible/hy3-free",
      },
      stdio: "inherit",
    });
  }
  const output: string[] = [];
  const stderr: string[] = [];
  const evePort = new URL(eveOrigin).port;
  const child: ChildProcessWithoutNullStreams = spawn(
    eveNode,
    [eveBin, "start", "--host", "127.0.0.1", "--port", evePort],
    {
      cwd: conversationRoot,
      env: {
        ...process.env,
        PATH: evePath,
        ZOEN_AUTH_BASE_URL: AUTH_DOOR_ORIGIN,
        ZOEN_MODEL: process.env.ZOEN_MODEL ?? "openai-compatible/hy3-free",
        ZOEN_ZOEND: zoenBaseUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    stderr.push(text);
  });
  const managed: ManagedProcess = {
    child,
    name: "eve",
    output,
    stderr,
  };
  await waitFor(
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`eve exited during startup:\n${output.join("")}`);
      }
      try {
        const response = await fetch(`${eveOrigin}/eve/v1/health`);
        return response.ok ? true : undefined;
      } catch {
        return undefined;
      }
    },
    "Eve /eve/v1/health",
    2400,
  );
  return managed;
}

const eveNodeMajor = 24;

function eveNodeExecutable(): string {
  const candidates = [
    process.env.ZOEN_EVE_NODE,
    process.execPath,
    "/usr/local/node24/bin/node",
    "/tmp/node24/node-v24.20.0-linux-x64/bin/node",
  ].filter((value): value is string => value !== undefined && value !== "");
  for (const candidate of candidates) {
    if (nodeMajor(candidate) >= eveNodeMajor) {
      return candidate;
    }
  }
  throw new Error(
    `Eve requires Node.js >= ${eveNodeMajor} (runner is ${process.version}). Set ZOEN_EVE_NODE to a Node ${eveNodeMajor}+ binary.`,
  );
}

function nodeMajor(executable: string): number {
  if (executable === process.execPath) {
    return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  }
  if (!existsSync(executable)) {
    return 0;
  }
  try {
    const version = execFileSync(executable, ["-p", "process.versions.node"], {
      encoding: "utf8",
    }).trim();
    return Number.parseInt(version.split(".")[0] ?? "0", 10);
  } catch {
    return 0;
  }
}
