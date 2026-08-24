import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  activateDefinition,
  publishDefinition,
  recordAvailable,
  resourceId,
} from "./governed-action/support.js";
import { e2eGeneratedDirectory, writeScenarioArtifact } from "./host-env.js";
import { verifyClaimIsolation } from "./human-executor/laws/claim-isolation.js";
import { verifyPacketMinimal } from "./human-executor/laws/packet-minimal.js";
import { verifyRecovery } from "./human-executor/laws/recovery.js";
import { verifyReportEvidence } from "./human-executor/laws/report-evidence.js";
import {
  EvidenceRecorder,
  loadHumanExecutorFixture,
  writeHumanExecutorPolicyManifest,
  type HumanScenario,
} from "./human-executor/scenario.js";
import {
  actionClient,
  adminClient,
  definitionClient,
  effectClient,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  registerWorker,
  repositoryRoot,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  worldClient,
  type ManagedProcess,
} from "./human-executor/support.js";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixture = await loadHumanExecutorFixture();
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "human-executor"),
    "human-executor-policies.json",
  );
  await writeHumanExecutorPolicyManifest(policyManifestPath, fixture);

  const agentAToken = await oidcToken("agent-a");
  const agentBToken = await oidcToken("agent-b");
  const adminAToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  const workerAToken = await oidcToken("effect-worker-a");
  const workerBToken = await oidcToken("effect-worker-b");
  const reconcilerAToken = await oidcToken("effect-reconciler-a");
  const humanAToken = await oidcToken("human-executor-a");
  const humanBToken = await oidcToken("human-executor-b");
  const humanRevokedToken = await oidcToken("human-executor-revoked-a");

  const actionA = actionClient(agentAToken);
  const actionB = actionClient(agentBToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const definitionAdminA = definitionClient(adminAToken);
  const definitionAdminB = definitionClient(adminBToken);
  const effectA = effectClient(agentAToken);
  const effectB = effectClient(agentBToken);
  const effectReconcilerA = effectClient(reconcilerAToken);
  const effectWorkerA = effectClient(workerAToken);
  const effectHumanA = effectClient(humanAToken);
  const effectHumanB = effectClient(humanBToken);
  const effectHumanRevokedA = effectClient(humanRevokedToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  const recorder = new EvidenceRecorder();
  const zoend = await startZoend(policyManifestPath);
  processes.push(zoend);
  const worker = await startWorker({
    [tenantA]: workerAToken,
    [tenantB]: workerBToken,
  });
  processes.push(worker);
  await admin.connect();

  const scenario: HumanScenario = {
    actionA,
    actionB,
    admin,
    effectA,
    effectB,
    effectHumanA,
    effectHumanB,
    effectHumanRevokedA,
    effectReconcilerA,
    effectWorkerA,
    fixture,
    policyManifestPath,
    processes,
    recorder,
    runtime: { worker, zoend },
  };

  try {
    const registration = await registerWorker();
    assert.match(registration, /ZoenEffect|deployment/i);
    await publishDefinition(definitionA, tenantA, fixture);
    await publishDefinition(definitionB, tenantB, fixture);
    await activateDefinition(definitionAdminA, tenantA, fixture);
    await activateDefinition(definitionAdminB, tenantB, fixture);
    await recordAvailable(worldA, {
      claimId: "claim.available.human.a",
      fixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "100",
    });
    await recordAvailable(worldB, {
      claimId: "claim.available.human.b",
      fixture,
      resource: resourceId,
      tenantId: tenantB,
      value: "100",
    });

    const packet = await verifyPacketMinimal(scenario);
    await verifyClaimIsolation(scenario);
    const report = await verifyReportEvidence(scenario);
    await verifyRecovery(scenario);

    recorder.observe(
      "personalAndEnterpriseShareContractPath",
      packet.requestDigest.length === 64 && report.attemptId.startsWith("attempt."),
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();

    const requiredMutants = [
      "duplicateClaim",
      "resultTwice",
      "restateRestart",
      "reportedSuccessLaterContradicted",
      "revokedOperator",
      "crossTenantIdSwap",
      "packetIncludesFullTenantContext",
      "operatorResultSetsConfirmed",
      "expiredTaskRemainsActionable",
      "submitNeverTouchesMessaging",
    ];
    for (const mutant of requiredMutants) {
      assert.equal(recorder.mutantsKilled[mutant], true, mutant);
    }

    const manifest = {
      assertions: recorder.assertions,
      componentVersions: {
        keycloak: "26.0.7",
        postgres: postgresVersion,
        restate: "1.7.2",
      },
      failureInjections: recorder.failureInjections,
      finishedAt: new Date().toISOString(),
      mutantsKilled: recorder.mutantsKilled,
      observedEffectStates: [...recorder.observedStates].sort(),
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      packetDigests: recorder.packetDigests,
      scenario: "human-executor",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await writeScenarioArtifact(repositoryRoot, "human-executor", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    for (const process of processes.reverse()) {
      if (process.child.exitCode === null && process.child.signalCode === null) {
        await stopProcess(process);
      }
    }
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
