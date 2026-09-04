import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { AUTH_DOOR_ORIGIN, startAuthDoor, stopAuthDoor } from "./ba-door.js";
import { startEve } from "./eve-support.js";
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
  const eve = await startEve({
    authBaseUrl: AUTH_DOOR_ORIGIN,
    eveOrigin,
    zoendBaseUrl: zoenBaseUrl,
  });
  processes.push(eve);

  await waitForReady(
    (body) => body === "ready\n",
    "product dependencies recover to /ready",
  );
  const happy = await fetchReady();
  observe("readyPassesWhenProductDependenciesAreLive", happy.status === 200);
  await assertReadyDoesNotMutate(admin, observe, "healthy");

  await writeFile(policyManifestPath, "{}\n");
  await assertReadyFails(
    observe,
    "bootstrap Cedar is broken",
    "bootstrapPolicyBroken",
  );
  await writeFile(policyManifestPath, originalPolicy);
  await waitForReady((body) => body === "ready\n", "bootstrap Cedar restored");

  const releaseARow = await requireActiveReleaseRow(admin, tenantA);
  const publicationARow = await requireReleasePublicationRow(
    admin,
    releaseA.digest,
  );
  const catalogsA = await requireReleaseCatalogRows(admin, releaseA.digest);
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

  await replacePublicationPublishedBy(admin, releaseA.digest, "not a principal");
  await assertReadyFailsWithoutMutation(
    admin,
    observe,
    "active WorldRelease is broken",
    "activePublicationPrincipalBroken",
  );
  await restoreReleasePublication(admin, publicationARow);
  await waitForReady(
    (body) => body === "ready\n",
    "active WorldRelease publication principal restored",
  );

  await replacePublicationPolicyDigest(admin, releaseA.digest, "0".repeat(64));
  await assertReadyFailsWithoutMutation(
    admin,
    observe,
    "active WorldRelease is broken",
    "activePublicationPolicyEvidenceMismatch",
  );
  await restoreReleasePublication(admin, publicationARow);
  await waitForReady(
    (body) => body === "ready\n",
    "active WorldRelease publication policy evidence restored",
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

  await replaceReleaseCatalogContent(
    admin,
    "ontology",
    catalogsA.ontologyDigest,
    Buffer.from("{}\n"),
  );
  await assertReadyFails(
    observe,
    "active WorldRelease is broken",
    "activeOntologyDigestBroken",
  );
  await replaceReleaseCatalogContent(
    admin,
    "ontology",
    catalogsA.ontologyDigest,
    catalogsA.ontologyContent,
  );
  await waitForReady((body) => body === "ready\n", "active OntologyCatalog restored");

  await removeReleaseCatalog(admin, "executors", catalogsA.executorsDigest);
  await assertReadyFails(
    observe,
    "active WorldRelease is broken",
    "activeExecutorCatalogMissing",
  );
  await restoreReleaseCatalog(
    admin,
    "executors",
    catalogsA.executorsDigest,
    catalogsA.executorsContent,
    catalogsA.executorsStoredAtMicros,
  );
  await waitForReady((body) => body === "ready\n", "active ExecutorCatalog restored");

  await replaceReleaseCatalogContent(
    admin,
    "components",
    catalogsA.componentsDigest,
    Buffer.from("broken component catalog\n"),
  );
  await assertReadyFails(
    observe,
    "active WorldRelease is broken",
    "activeComponentDigestBroken",
  );
  await replaceReleaseCatalogContent(
    admin,
    "components",
    catalogsA.componentsDigest,
    catalogsA.componentsContent,
  );
  await waitForReady((body) => body === "ready\n", "active ComponentCatalog restored");

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
  const restartedEve = await startEve({
    authBaseUrl: AUTH_DOOR_ORIGIN,
    eveOrigin,
    zoendBaseUrl: zoenBaseUrl,
  });
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

interface ReleasePublicationRow {
  determining_policies: string[];
  digest: string;
  policy_digest: string;
  policy_id: string;
  policy_revision: string;
  published_at_micros: string;
  published_by: string;
}

interface ReleaseCatalogRows {
  componentsContent: Buffer;
  componentsDigest: string;
  componentsStoredAtMicros: string;
  executorsContent: Buffer;
  executorsDigest: string;
  executorsStoredAtMicros: string;
  ontologyContent: Buffer;
  ontologyDigest: string;
}

type ReleaseCatalogKind = "components" | "executors" | "ontology";

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

async function requireReleasePublicationRow(
  admin: PostgresClient,
  digest: string,
): Promise<ReleasePublicationRow> {
  const result = await admin.query<ReleasePublicationRow>(
    `SELECT digest, published_at_micros::text, published_by, policy_id,
            policy_revision::text, policy_digest, determining_policies
       FROM world_release_publications
      WHERE digest = $1`,
    [digest],
  );
  const row = result.rows[0];
  assert.ok(row, `WorldRelease publication ${digest} must exist`);
  return row;
}

async function requireReleaseCatalogRows(
  admin: PostgresClient,
  releaseDigest: string,
): Promise<ReleaseCatalogRows> {
  const result = await admin.query<ReleaseCatalogRows>(
    `SELECT
       release.ontology_digest AS "ontologyDigest",
       ontology.content AS "ontologyContent",
       release.executors_digest AS "executorsDigest",
       executors.content AS "executorsContent",
       executors.stored_at_micros::text AS "executorsStoredAtMicros",
       release.components_digest AS "componentsDigest",
       components.content AS "componentsContent",
       components.stored_at_micros::text AS "componentsStoredAtMicros"
     FROM world_releases release
     JOIN world_ontology_catalogs ontology ON ontology.digest = release.ontology_digest
     JOIN world_executor_catalogs executors ON executors.digest = release.executors_digest
     JOIN world_component_catalogs components ON components.digest = release.components_digest
     WHERE release.digest = $1`,
    [releaseDigest],
  );
  const row = result.rows[0];
  assert.ok(row, `all catalogs for WorldRelease ${releaseDigest} must exist`);
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

async function replacePublicationPublishedBy(
  admin: PostgresClient,
  digest: string,
  publishedBy: string,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    await admin.query(
      "UPDATE world_release_publications SET published_by = $1 WHERE digest = $2",
      [publishedBy, digest],
    );
  });
}

async function replacePublicationPolicyDigest(
  admin: PostgresClient,
  digest: string,
  policyDigest: string,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    await admin.query(
      "UPDATE world_release_publications SET policy_digest = $1 WHERE digest = $2",
      [policyDigest, digest],
    );
  });
}

async function restoreReleasePublication(
  admin: PostgresClient,
  row: ReleasePublicationRow,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    await admin.query(
      `UPDATE world_release_publications
          SET published_at_micros = $1,
              published_by = $2,
              policy_id = $3,
              policy_revision = $4,
              policy_digest = $5,
              determining_policies = $6
        WHERE digest = $7`,
      [
        row.published_at_micros,
        row.published_by,
        row.policy_id,
        row.policy_revision,
        row.policy_digest,
        row.determining_policies,
        row.digest,
      ],
    );
  });
}

async function replaceReleaseCatalogContent(
  admin: PostgresClient,
  kind: ReleaseCatalogKind,
  digest: string,
  content: Buffer,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    if (kind === "ontology") {
      await admin.query(
        "UPDATE world_ontology_catalogs SET content = $1 WHERE digest = $2",
        [content, digest],
      );
    } else if (kind === "executors") {
      await admin.query(
        "UPDATE world_executor_catalogs SET content = $1 WHERE digest = $2",
        [content, digest],
      );
    } else {
      await admin.query(
        "UPDATE world_component_catalogs SET content = $1 WHERE digest = $2",
        [content, digest],
      );
    }
  });
}

async function removeReleaseCatalog(
  admin: PostgresClient,
  kind: ReleaseCatalogKind,
  digest: string,
): Promise<void> {
  await withImmutableHistoryBypass(admin, async () => {
    if (kind === "ontology") {
      await admin.query("DELETE FROM world_ontology_catalogs WHERE digest = $1", [
        digest,
      ]);
    } else if (kind === "executors") {
      await admin.query("DELETE FROM world_executor_catalogs WHERE digest = $1", [
        digest,
      ]);
    } else {
      await admin.query("DELETE FROM world_component_catalogs WHERE digest = $1", [
        digest,
      ]);
    }
  });
}

async function restoreReleaseCatalog(
  admin: PostgresClient,
  kind: ReleaseCatalogKind,
  digest: string,
  content: Buffer,
  storedAtMicros: string,
): Promise<void> {
  if (kind === "ontology") {
    await admin.query(
      "INSERT INTO world_ontology_catalogs (digest, content, stored_at_micros) VALUES ($1, $2, $3)",
      [digest, content, storedAtMicros],
    );
  } else if (kind === "executors") {
    await admin.query(
      "INSERT INTO world_executor_catalogs (digest, content, stored_at_micros) VALUES ($1, $2, $3)",
      [digest, content, storedAtMicros],
    );
  } else {
    await admin.query(
      "INSERT INTO world_component_catalogs (digest, content, stored_at_micros) VALUES ($1, $2, $3)",
      [digest, content, storedAtMicros],
    );
  }
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

async function assertReadyFailsWithoutMutation(
  admin: PostgresClient,
  observe: Observe,
  reason: string,
  label: string,
): Promise<void> {
  const before = await authorityFingerprint(admin);
  await assertReadyFails(observe, reason, label);
  observe(
    `readyFailureDoesNotMutateAuthority_${label}`,
    (await authorityFingerprint(admin)) === before,
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
