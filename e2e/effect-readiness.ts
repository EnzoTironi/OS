import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { AUTH_DOOR_ORIGIN, startAuthDoor, stopAuthDoor } from "./ba-door.js";
import {
  plantBudgetRelease,
  type AuthorizationPolicy,
} from "./budget-class/plant-release.js";
import {
  applicationDatabaseUrl,
  authDatabaseUrl,
  crashProcess,
  effectGeneratedDirectory,
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
  zoenExecutablePath,
  zoenBaseUrl,
  type ManagedProcess,
  type WorkloadIdentity,
} from "./effect-support.js";
import { parseZoenJson, runZoenCli } from "./zoen-cli.js";

type Observe = (name: string, value: boolean) => void;

const authorizationPolicySchema: z.ZodType<AuthorizationPolicy> = z
  .object({
    actionId: z.string().min(1),
    definitionDigest: z.string().regex(/^[0-9a-f]{64}$/),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    policyId: z.string().min(1),
    revision: z.number().int().positive(),
    source: z.string().min(1),
  })
  .strict();
const bootPolicyManifestSchema = z
  .object({ policies: z.array(authorizationPolicySchema).min(1) })
  .strict();

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
  door: Awaited<ReturnType<typeof startAuthDoor>>;
  observe: Observe;
  policyManifestPath: string;
  processes: ManagedProcess[];
  registrar: ManagedProcess;
  workerIdentity: WorkloadIdentity;
  zoend: ManagedProcess;
}): Promise<{
  authority: {
    policyCatalogDigest: string;
    releaseDigest: string;
    worldId: string;
  };
  door: Awaited<ReturnType<typeof startAuthDoor>>;
  registrar: ManagedProcess;
  zoend: ManagedProcess;
}> {
  const {
    admin,
    observe,
    policyManifestPath,
    processes,
    workerIdentity,
  } = input;
  let { door, registrar, zoend } = input;
  const originalPolicy = await readFile(policyManifestPath, "utf8");
  const authorizationPolicies = bootPolicyManifestSchema.parse(
    JSON.parse(originalPolicy),
  ).policies;
  const releaseA = await plantBudgetRelease({
    authorizationPolicies,
    databaseUrl: applicationDatabaseUrl,
    generatedDirectory: path.join(effectGeneratedDirectory, "readiness-releases"),
    identityBaseUrl: zoenBaseUrl,
    world: tenantA,
    zoenPath: zoenExecutablePath,
  });
  const releaseB = await plantBudgetRelease({
    authorizationPolicies,
    budgets: [],
    databaseUrl: applicationDatabaseUrl,
    generatedDirectory: path.join(effectGeneratedDirectory, "readiness-releases"),
    identityBaseUrl: zoenBaseUrl,
    world: tenantB,
    zoenPath: zoenExecutablePath,
  });
  observe(
    "worldsUseDistinctPolicyCatalogs",
    releaseA.policyCatalogDigest !== releaseB.policyCatalogDigest,
  );
  const activeRows = await admin.query<{ digest: string; world_id: string }>(
    "SELECT world_id, digest FROM world_active_releases WHERE world_id = ANY($1::text[]) ORDER BY world_id",
    [[tenantA, tenantB]],
  );
  observe(
    "readinessUsesRealWorldReleases",
    activeRows.rows.length === 2 &&
      activeRows.rows[0]?.world_id === tenantA &&
      activeRows.rows[0]?.digest === releaseA.digest &&
      activeRows.rows[1]?.world_id === tenantB &&
      activeRows.rows[1]?.digest === releaseB.digest,
  );
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
  const ignoresBootPolicy = await fetchReady();
  observe(
    "readyIgnoresBootManifestAfterWorldReleaseActivation",
    ignoresBootPolicy.status === 200 && ignoresBootPolicy.body === "ready\n",
  );
  await writeFile(policyManifestPath, originalPolicy);

  const releaseARow = await requireActiveReleaseRow(admin, tenantA);
  const policyARow = await requirePolicyCatalogRow(
    admin,
    releaseA.policyCatalogDigest,
  );
  const policyBRow = await requirePolicyCatalogRow(
    admin,
    releaseB.policyCatalogDigest,
  );
  await replacePolicyCatalogContent(
    admin,
    releaseB.policyCatalogDigest,
    Buffer.from("{}\n"),
  );
  const isolated = await fetchReady();
  observe(
    "otherWorldBrokenPolicyDoesNotAffectReadyWorld",
    isolated.status === 200 && isolated.body === "ready\n",
  );
  await replacePolicyCatalogContent(
    admin,
    releaseB.policyCatalogDigest,
    policyBRow.content,
  );

  await replacePolicyCatalogContent(
    admin,
    releaseA.policyCatalogDigest,
    Buffer.from("{}\n"),
  );
  await assertReadyFails(
    observe,
    "active PolicyCatalog is broken",
    "activePolicyDigestBroken",
  );
  await replacePolicyCatalogContent(
    admin,
    releaseA.policyCatalogDigest,
    policyARow.content,
  );
  await waitForReady((body) => body === "ready\n", "active PolicyCatalog restored");

  await removePolicyCatalog(admin, releaseA.policyCatalogDigest);
  await assertReadyFails(
    observe,
    "active PolicyCatalog is missing",
    "activePolicyMissing",
  );
  await restorePolicyCatalog(admin, policyARow);
  await waitForReady((body) => body === "ready\n", "active PolicyCatalog row restored");

  await pointActiveRelease(admin, tenantA, releaseB.digest);
  await assertReadyFails(observe, "active WorldRelease is broken", "releaseStale");
  await restoreActiveRelease(admin, releaseARow);
  await waitForReady((body) => body === "ready\n", "active WorldRelease restored");

  await admin.query("DELETE FROM world_active_releases WHERE world_id = $1", [
    tenantA,
  ]);
  await assertReadyFails(
    observe,
    "active WorldRelease is missing",
    "releaseMissing",
  );
  const activationArguments = [
    "world",
    "release",
    "activate",
    "--world",
    tenantA,
    "--digest",
    releaseA.digest,
    "--preview-digest",
    releaseA.previewDigest,
    "--principal",
    releaseA.actors.owner.principal,
    "--membership",
    releaseA.actors.owner.membership,
  ];
  const recovered = runZoenCli(
    zoenExecutablePath,
    applicationDatabaseUrl,
    activationArguments,
  );
  assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
  const recoveredBody = parseZoenJson(recovered.stdout);
  observe(
    "governedActivationRecoversMissingPointer",
    recoveredBody.activated === true &&
      recoveredBody.digest === releaseA.digest &&
      recoveredBody.replay === false,
  );
  await waitForReady((body) => body === "ready\n", "active WorldRelease restored");
  const authorityBeforeActivationReplay = await authorityFingerprint(admin);
  const replayed = runZoenCli(
    zoenExecutablePath,
    applicationDatabaseUrl,
    activationArguments,
  );
  assert.equal(replayed.status, 0, replayed.stderr || replayed.stdout);
  const replayedBody = parseZoenJson(replayed.stdout);
  observe(
    "governedActivationReplayIsIdempotent",
    replayedBody.activated === true &&
      replayedBody.digest === releaseA.digest &&
      replayedBody.replay === true &&
      (await authorityFingerprint(admin)) === authorityBeforeActivationReplay,
  );

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
  return {
    authority: {
      policyCatalogDigest: releaseA.policyCatalogDigest,
      releaseDigest: releaseA.digest,
      worldId: tenantA,
    },
    door,
    registrar,
    zoend,
  };
}

interface ActiveReleaseRow {
  activated_at_micros: string;
  digest: string;
  world_id: string;
}

interface PolicyCatalogRow {
  content: Buffer;
  digest: string;
  stored_at_micros: string;
}

async function requireActiveReleaseRow(
  admin: PostgresClient,
  worldId: string,
): Promise<ActiveReleaseRow> {
  const result = await admin.query<ActiveReleaseRow>(
    "SELECT world_id, digest, activated_at_micros::text FROM world_active_releases WHERE world_id = $1",
    [worldId],
  );
  const row = result.rows[0];
  assert.ok(row, `active release for ${worldId} must exist`);
  return row;
}

async function requirePolicyCatalogRow(
  admin: PostgresClient,
  digest: string,
): Promise<PolicyCatalogRow> {
  const result = await admin.query<PolicyCatalogRow>(
    "SELECT digest, content, stored_at_micros::text FROM world_policy_catalogs WHERE digest = $1",
    [digest],
  );
  const row = result.rows[0];
  assert.ok(row, `PolicyCatalog ${digest} must exist`);
  return row;
}

async function withImmutableHistoryBypass(
  admin: PostgresClient,
  operation: () => Promise<void>,
): Promise<void> {
  await admin.query("SET session_replication_role = replica");
  try {
    await operation();
  } finally {
    await admin.query("SET session_replication_role = origin");
  }
}

async function replacePolicyCatalogContent(
  admin: PostgresClient,
  digest: string,
  content: Buffer,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    await admin.query(
      "UPDATE world_policy_catalogs SET content = $1 WHERE digest = $2",
      [content, digest],
    );
  });
}

async function removePolicyCatalog(
  admin: PostgresClient,
  digest: string,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    await admin.query("DELETE FROM world_policy_catalogs WHERE digest = $1", [
      digest,
    ]);
  });
}

async function restorePolicyCatalog(
  admin: PostgresClient,
  row: PolicyCatalogRow,
): Promise<void> {
  await admin.query(
    "INSERT INTO world_policy_catalogs (digest, content, stored_at_micros) VALUES ($1, $2, $3)",
    [row.digest, row.content, row.stored_at_micros],
  );
}

async function pointActiveRelease(
  admin: PostgresClient,
  worldId: string,
  digest: string,
): Promise<void> {
  await admin.query(
    "UPDATE world_active_releases SET digest = $1 WHERE world_id = $2",
    [digest, worldId],
  );
}

async function restoreActiveRelease(
  admin: PostgresClient,
  row: ActiveReleaseRow,
): Promise<void> {
  await admin.query(
    `INSERT INTO world_active_releases (world_id, digest, activated_at_micros)
     VALUES ($1, $2, $3)
     ON CONFLICT (world_id) DO UPDATE
     SET digest = EXCLUDED.digest,
         activated_at_micros = EXCLUDED.activated_at_micros`,
    [row.world_id, row.digest, row.activated_at_micros],
  );
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
  const ready = await Promise.all(
    Array.from({ length: 8 }, async () => fetchReady()),
  );
  assert.ok(
    ready.every(
      (response) => response.status === 200 && response.body === "ready\n",
    ),
    JSON.stringify(ready),
  );
  const after = await authorityFingerprint(admin);
  observe(`readyDoesNotMutateAuthority_${label}`, before === after);
  observe(`readyReplayConverges_${label}`, ready.length === 8);
}

async function authorityFingerprint(admin: PostgresClient): Promise<string> {
  const commits = await admin.query(
    "SELECT tenant_id, commit_sequence, commit_kind FROM authority_commits ORDER BY tenant_id, commit_sequence",
  );
  const activations = await admin.query(
    "SELECT tenant_id, definition_id, digest, revision FROM active_definition_revisions ORDER BY tenant_id, definition_id",
  );
  const worldActivations = await admin.query(
    "SELECT world_id, digest, activated_at_micros::text FROM world_active_releases ORDER BY world_id",
  );
  const worldPolicies = await admin.query(
    "SELECT digest, encode(content, 'hex') AS content_hex, stored_at_micros::text FROM world_policy_catalogs ORDER BY digest",
  );
  const worldOntologies = await admin.query(
    "SELECT digest, encode(content, 'hex') AS content_hex, stored_at_micros::text FROM world_ontology_catalogs ORDER BY digest",
  );
  const worldExecutors = await admin.query(
    "SELECT digest, encode(content, 'hex') AS content_hex, stored_at_micros::text FROM world_executor_catalogs ORDER BY digest",
  );
  const worldComponents = await admin.query(
    "SELECT digest, encode(content, 'hex') AS content_hex, stored_at_micros::text FROM world_component_catalogs ORDER BY digest",
  );
  const worldReleases = await admin.query(
    "SELECT digest, world_id, parent_digest, ontology_digest, policy_digest, executors_digest, components_digest, canonical_jcs, stored_at_micros::text FROM world_releases ORDER BY digest",
  );
  const worldPublications = await admin.query(
    "SELECT digest, published_at_micros::text, published_by, policy_id, policy_revision::text, policy_digest, determining_policies FROM world_release_publications ORDER BY digest",
  );
  const worldPreviews = await admin.query(
    "SELECT preview_digest, world_id, release_digest, current_active_digest, candidate_ontology_digest, candidate_policy_digest, candidate_executors_digest, candidate_components_digest, current_ontology_digest, current_policy_digest, current_executors_digest, current_components_digest, canonical_jcs, created_at_micros::text FROM world_release_previews ORDER BY preview_digest",
  );
  const worldDecisions = await admin.query(
    "SELECT preview_digest, release_digest, world_id, decided_at_micros::text, decided_by, outcome FROM world_release_decisions ORDER BY preview_digest",
  );
  const worldAuthorizations = await admin.query(
    "SELECT operation, target_digest, world_id, release_digest, preview_digest, authorized_at_micros::text, membership_id, principal_id, actor_id, workload_id, action_id, delegation_json, policy_id, policy_revision::text, policy_digest, determining_policies FROM world_release_authorizations ORDER BY operation, target_digest, membership_id",
  );
  const worldActivationLocks = await admin.query(
    "SELECT world_id FROM world_release_activation_locks ORDER BY world_id",
  );
  return JSON.stringify({
    activations: activations.rows,
    commits: commits.rows,
    worldActivations: worldActivations.rows,
    worldActivationLocks: worldActivationLocks.rows,
    worldAuthorizations: worldAuthorizations.rows,
    worldComponents: worldComponents.rows,
    worldDecisions: worldDecisions.rows,
    worldExecutors: worldExecutors.rows,
    worldOntologies: worldOntologies.rows,
    worldPolicies: worldPolicies.rows,
    worldPreviews: worldPreviews.rows,
    worldPublications: worldPublications.rows,
    worldReleases: worldReleases.rows,
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
