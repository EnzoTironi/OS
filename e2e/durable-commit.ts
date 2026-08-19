import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { Client as PostgresClient } from "pg";
import { DefinitionReferenceSchema } from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  activateDefinition,
  adminDatabaseUrl,
  definitionClient,
  definitionId,
  generatedDirectory,
  loadFixture,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  publishDefinition,
  recordAvailable,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writePolicyManifest,
  type DefinitionFixture,
} from "./governed-action/support.js";
import { composeOutput } from "./durable-commit/support.js";
import { verifyConflictingCas } from "./durable-commit/laws/conflict.js";
import { verifyIdentity } from "./durable-commit/laws/identity.js";
import { verifyRecovery } from "./durable-commit/laws/recovery.js";
import { verifyReplayAndMismatch } from "./durable-commit/laws/replay.js";
import { verifyRollback } from "./durable-commit/laws/rollback.js";
import { verifyTenantIsolation } from "./durable-commit/laws/tenant-isolation.js";
import {
  EvidenceRecorder,
  type DurableFixtures,
  type DurableScenario,
} from "./durable-commit/scenario.js";

const scenarioDirectory = path.join(repositoryRoot, "e2e", "durable-commit");

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixtures: DurableFixtures = {
    direct: await loadFixture("direct", 1),
    multi: await loadMultiFixture(),
    self: await loadFixture("self", 5),
  };
  const policyManifestPath = path.join(
    generatedDirectory,
    "durable-policies.json",
  );
  await writePolicyManifest(policyManifestPath, Object.values(fixtures));

  const agentAToken = await oidcToken("agent-a");
  const agentBToken = await oidcToken("agent-b");
  const adminAToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  const actionA = actionClient(agentAToken);
  const actionB = actionClient(agentBToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const definitionAdminA = definitionClient(adminAToken);
  const definitionAdminB = definitionClient(adminBToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const runtime = {
    admin: new PostgresClient({ connectionString: adminDatabaseUrl }),
    server: await startServer(policyManifestPath),
  };
  await runtime.admin.connect();

  try {
    for (const fixture of Object.values(fixtures)) {
      await publishDefinition(definitionA, tenantA, fixture);
      await publishDefinition(definitionB, tenantB, fixture);
      await activateDefinition(definitionAdminA, tenantA, fixture);
      await activateDefinition(definitionAdminB, tenantB, fixture);
      await recordAvailable(worldA, {
        claimId: `claim.available.${fixture.definition.revision}.a`,
        fixture,
        resource: resourceId,
        tenantId: tenantA,
        value: "10",
      });
      await recordAvailable(worldB, {
        claimId: `claim.available.${fixture.definition.revision}.b`,
        fixture,
        resource: resourceId,
        tenantId: tenantB,
        value: "10",
      });
    }

    const recorder = new EvidenceRecorder();
    const scenario: DurableScenario = {
      actionA,
      actionB,
      agentAToken,
      agentBToken,
      fixtures,
      policyManifestPath,
      recorder,
      runtime,
    };
    const replay = await verifyReplayAndMismatch(scenario);
    await verifyIdentity(scenario, replay.canonicalReceipt);
    const independentTenantCommitsMs =
      await verifyTenantIsolation(scenario);
    await verifyRollback(scenario);
    const recovery = await verifyRecovery(scenario);
    await verifyConflictingCas(scenario);

    const postgresVersion = (
      await runtime.admin.query<{ server_version: string }>(
        "SHOW server_version",
      )
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const keycloakVersion = await composeOutput(
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    );
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/);
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    const actionProtocol = await readFile(
      path.join(
        repositoryRoot,
        "proto",
        "zoen",
        "action",
        "v1",
        "action.proto",
      ),
      "utf8",
    );
    const mutants = {
      collisionReturnedRawDatabaseError:
        recorder.assertions.semanticRecordCollisionTypedAndAtomic === true &&
        recorder.assertions.effectRequestCollisionTypedAndAtomic === true,
      effectWrittenOutsideTransaction:
        recorder.assertions.allPreCommitFailpointsRolledBack === true,
      failpointEnabledInDefaultBuild:
        recorder.assertions.defaultBuildIgnoresCommitFailpoint === true,
      intentIgnored:
        recorder.assertions.sameOperationDifferentIntentTypedMismatch === true,
      missingHeadLock:
        recorder.assertions.sameHeadConflictHasOneSemanticWinner === true &&
        recorder.assertions.sameOperationRaceConverged === true &&
        recorder.assertions.racedExpiredRetryReturnedDurableReceipt === true,
      namespaceOmitted:
        recorder.assertions.tenantScopedOperationNamespace === true,
      operationOmittedFromRecordIdentity:
        recorder.assertions.independentSamePlanOperationsCommitted === true,
      partialSemanticCommit:
        recorder.assertions.allPreCommitFailpointsRolledBack === true,
      statusUnavailableAfterCommit:
        recorder.assertions.serverDeathRecoveredAfterRestart === true &&
        recorder.assertions.postgresRestartPreservedReceipt === true,
      unstableReceiptOrder:
        recorder.assertions.canonicalReceiptOrderingStable === true,
    };
    assert.ok(Object.values(mutants).every(Boolean));
    const manifest = {
      assertions: recorder.assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      failureInjections: recorder.failureInjections,
      finishedAt: new Date().toISOString(),
      mutants,
      observedOperations: {
        canonical: replay.canonicalShape.operationId,
        clientDeath: recovery.clientDeath,
        lostResponse: recovery.lostResponse,
        serverDeath: recovery.serverDeath,
      },
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      protocolDigest: sha256(actionProtocol),
      scenario: "durable-commit",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
      timings: {
        independentTenantCommitsMs,
      },
    };
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "durable-commit.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await runtime.admin.end();
    if (runtime.server.child.exitCode === null) {
      await stopServer(runtime.server);
    }
  }
}

async function loadMultiFixture(): Promise<DefinitionFixture> {
  const source = (
    await readFile(
      path.join(scenarioDirectory, "definition-multi.canonical.json"),
      "utf8",
    )
  ).trimEnd();
  const multiDefinitionId = `${definitionId}.multi`;
  const canonicalJson = source.replace(
    `"definitionId":"${definitionId}"`,
    `"definitionId":"${multiDefinitionId}"`,
  );
  assert.notEqual(canonicalJson, source);
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", "governed-action", "direct.cedar"),
    "utf8",
  );
  const digest = sha256(canonicalJson);
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: multiDefinitionId,
      digest,
      revision: 6n,
    }),
    digest,
    policyDigest: sha256(policySource),
    policyId: "policy.multi",
    policyRevision: 6,
    policySource,
  };
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
