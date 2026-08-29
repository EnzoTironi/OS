import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { CommitStatus } from "../gen/connect/zoen/action/v1/action_pb.js";
import {
  activateDefinition,
  loadFixture,
  publishDefinition,
  recordAvailable,
  resourceId,
  writePolicyManifest,
} from "./governed-action/support.js";
import { e2eGeneratedDirectory, writeScenarioArtifact } from "./host-env.js";
import { verifyDispatch } from "./effects/laws/dispatch.js";
import { verifyReconciliation } from "./effects/laws/reconciliation.js";
import { verifyRecovery } from "./effects/laws/recovery.js";
import { verifyTenantIsolation } from "./effects/laws/tenant-isolation.js";
import { verifyUncertainty } from "./effects/laws/uncertainty.js";
import {
  EvidenceRecorder,
  type EffectsScenario,
} from "./effects/scenario.js";
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
  startConnector,
  startFaultProvider,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  worldClient,
  type ManagedProcess,
} from "./effects/support.js";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixture = await loadFixture("direct", 1);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "effects"),
    "effects-policies.json",
  );
  await writePolicyManifest(policyManifestPath, [fixture]);

  const agentAToken = await oidcToken("agent-a");
  const agentBToken = await oidcToken("agent-b");
  const adminAToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  const workerAToken = await oidcToken("effect-worker-a");
  const workerBToken = await oidcToken("effect-worker-b");
  const reconcilerAToken = await oidcToken("effect-reconciler-a");
  const reconcilerBToken = await oidcToken("effect-reconciler-b");
  const actionA = actionClient(agentAToken);
  const actionB = actionClient(agentBToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const definitionAdminA = definitionClient(adminAToken);
  const definitionAdminB = definitionClient(adminBToken);
  const effectA = effectClient(agentAToken);
  const effectB = effectClient(agentBToken);
  const effectReconcilerA = effectClient(reconcilerAToken);
  const effectReconcilerB = effectClient(reconcilerBToken);
  const effectWorkerA = effectClient(workerAToken);
  const effectWorkerB = effectClient(workerBToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  const recorder = new EvidenceRecorder();
  const zoend = await startZoend(policyManifestPath);
  processes.push(zoend);
  const provider = await startFaultProvider();
  processes.push(provider);
  const connector = await startConnector();
  processes.push(connector);
  const worker = await startWorker({
    [tenantA]: workerAToken,
    [tenantB]: workerBToken,
  });
  processes.push(worker);
  await admin.connect();

  const scenario: EffectsScenario = {
    actionA,
    actionB,
    admin,
    effectA,
    effectB,
    effectReconcilerA,
    effectReconcilerB,
    effectWorkerA,
    effectWorkerB,
    fixture,
    policyManifestPath,
    processes,
    recorder,
    runtime: { connector, provider, zoend },
  };

  try {
    const registration = await registerWorker();
    assert.match(registration, /ZoenEffect|deployment/i);
    await publishDefinition(definitionA, tenantA, fixture);
    await publishDefinition(definitionB, tenantB, fixture);
    await activateDefinition(definitionAdminA, tenantA, fixture);
    await activateDefinition(definitionAdminB, tenantB, fixture);
    await recordAvailable(worldA, {
      claimId: "claim.available.effects.a",
      fixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "100",
    });
    await recordAvailable(worldB, {
      claimId: "claim.available.effects.b",
      fixture,
      resource: resourceId,
      tenantId: tenantB,
      value: "100",
    });

    const unavailable = await verifyDispatch(scenario);
    const reconciliation = await verifyReconciliation(scenario);
    const uncertainty = await verifyUncertainty(scenario);
    await verifyTenantIsolation(
      scenario,
      reconciliation.accepted,
      reconciliation.firstEvidence,
    );
    const recovery = await verifyRecovery(scenario);

    const causal = reconciliation.contradicted;
    recorder.observe(
      "causalExplanationSeparatesRequestAttemptEvidenceAndReconciliation",
      causal.request !== undefined &&
        causal.attempts.length === 1 &&
        causal.evidence.length === 2 &&
        causal.reconciliations.length === 2 &&
        causal.request.commitSequence < causal.attempts[0]!.commitSequence &&
        causal.attempts[0]!.commitSequence <
          causal.evidence[0]!.commitSequence,
    );
    recorder.observe(
      "idempotencyProviderIdentityAndDigestsAreAttributable",
      causal.request?.idempotencyKey ===
        reconciliation.accepted.idempotencyKey &&
        /^[0-9a-f]{64}$/.test(causal.request.requestDigest ?? "") &&
        causal.attempts.every(
          (attempt) =>
            attempt.providerOperationId.startsWith("provider.") &&
            /^[0-9a-f]{64}$/.test(attempt.requestDigest) &&
            /^attempt\.[0-9a-f]{64}$/.test(attempt.attemptId),
        ) &&
        causal.evidence.every(
          (evidence) =>
            evidence.idempotencyKey === reconciliation.accepted.idempotencyKey &&
            evidence.providerOperationId.startsWith("provider."),
        ),
    );

    const secretScan = await admin.query<{ leaked: boolean }>(
      `SELECT EXISTS (
          SELECT 1
          FROM effect_requests
          WHERE convert_from(payload, 'UTF8') LIKE '%provider-secret%'
             OR convert_from(payload, 'UTF8') LIKE '%secret.provider%'
          UNION ALL
          SELECT 1
          FROM projection_outbox
          WHERE payload::text LIKE '%provider-secret%'
             OR payload::text LIKE '%secret.provider%'
       ) AS leaked`,
    );
    recorder.observe(
      "connectorCredentialsRemainOpaqueAndOutsideHistory",
      secretScan.rows[0]?.leaked === false &&
        !processes
          .flatMap((process) => process.output)
          .join("")
          .includes("provider-secret"),
    );

    const committedEffects = [
      unavailable,
      reconciliation.accepted,
      reconciliation.ambiguous,
      reconciliation.claimedRace,
      uncertainty.parseError,
      uncertainty.schemaError,
      uncertainty.noEffect,
      uncertainty.connectorUnavailable,
      uncertainty.providerRejectedCredential,
      uncertainty.revoked,
      uncertainty.safeRetry,
      recovery.restateRestart,
      recovery.zoendRestart,
    ];
    const statuses = await Promise.all(
      committedEffects.map((effect) =>
        actionA.getOperationStatus({ operationId: effect.operationId }),
      ),
    );
    recorder.observe(
      "localCommitReceiptsRemainCommittedAcrossEffectStates",
      statuses.every((status) => status.status === CommitStatus.COMMITTED),
    );
    recorder.observe(
      "allEffectKnowledgeStatesObserved",
      [
        "accepted_pending",
        "confirmed",
        "confirmed_no_effect",
        "contradicted",
        "definitely_not_sent",
        "not_attempted",
        "unknown",
      ].every((state) => recorder.observedStates.has(state)),
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    const mutants = {
      credentialsSerializedIntoHistory:
        recorder.assertions.connectorCredentialsRemainOpaqueAndOutsideHistory ===
        true,
      duplicateWebhookCreatesConfirmation:
        recorder.assertions.duplicateEvidenceIsIdempotent === true,
      effectInsertedAfterTransaction:
        recorder.assertions.effectRequestStoredBeforeRemoteAttempt === true,
      restateStatusTreatedAsBusinessSuccess:
        recorder.assertions.remoteAcceptedRemainsPending === true,
      timeoutMappedToFailure:
        recorder.assertions
          .timeoutAfterPossibleDeliveryStaysUnknownWithoutBlindRetry === true,
      unknownBlindlyRetried:
        recorder.assertions
          .timeoutAfterPossibleDeliveryStaysUnknownWithoutBlindRetry === true,
    };
    assert.ok(Object.values(mutants).every(Boolean));
    const manifest = {
      assertions: recorder.assertions,
      componentVersions: {
        keycloak: "26.0.7",
        postgres: postgresVersion,
        restate: "1.7.2",
      },
      failureInjections: recorder.failureInjections,
      finishedAt: new Date().toISOString(),
      mutants,
      observedEffectStates: [...recorder.observedStates].sort(),
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      scenario: "effects",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await writeScenarioArtifact(repositoryRoot, "effects", manifest);
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
