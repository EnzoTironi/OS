import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  CommitStatus,
  type CommitReceipt,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EffectAttemptReason,
  EffectEvidenceOutcome,
  EffectKnowledgeState,
  type EffectSnapshot,
} from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  loadFixture,
  propose,
  publishDefinition,
  recordAvailable,
  resourceId,
  writePolicyManifest,
} from "./governed-action/support.js";
import {
  actionClient,
  adminClient,
  definitionClient,
  dispatchOnce,
  effectClient,
  lookupInvocation,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  providerOperation,
  registerWorker,
  repositoryRoot,
  restartRestate,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startRestate,
  startWorker,
  startZoend,
  stopProcess,
  stopRestate,
  tenantA,
  tenantB,
  waitFor,
  worldClient,
  type ActionClient,
  type EffectClient,
  type ManagedProcess,
  type ProviderOperation,
} from "./effects/support.js";

class EvidenceRecorder {
  readonly assertions: Record<string, boolean> = {};
  readonly failureInjections: string[] = [];
  readonly observedStates = new Set<string>();

  observe(name: string, observed: boolean): void {
    assert.ok(observed, name);
    this.assertions[name] = observed;
  }

  inject(name: string): void {
    this.failureInjections.push(name);
  }

  state(snapshot: EffectSnapshot): void {
    const request = snapshot.request;
    assert.ok(request);
    this.observedStates.add(stateName(request.state));
  }
}

interface CommittedEffect {
  effectRequestId: string;
  operationId: string;
  receipt: CommitReceipt;
}

const scenarioDirectory = path.join(repositoryRoot, "e2e", "effects");

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixture = await loadFixture("direct", 1);
  const policyManifestPath = path.join(
    repositoryRoot,
    "e2e",
    "governed-action",
    ".generated",
    "effects-policies.json",
  );
  await writePolicyManifest(policyManifestPath, [fixture]);

  const agentAToken = await oidcToken("agent-a");
  const agentBToken = await oidcToken("agent-b");
  const actionA = actionClient(agentAToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const effectA = effectClient(agentAToken);
  const effectB = effectClient(agentBToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  const recorder = new EvidenceRecorder();
  let zoend = await startZoend(policyManifestPath);
  processes.push(zoend);
  let provider = await startFaultProvider();
  processes.push(provider);
  let connector = await startConnector();
  processes.push(connector);
  const worker = await startWorker(agentAToken);
  processes.push(worker);
  await admin.connect();

  try {
    const registration = await registerWorker();
    assert.match(registration, /ZoenEffect|deployment/i);
    await publishDefinition(definitionA, tenantA, fixture);
    await publishDefinition(definitionB, tenantB, fixture);
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

    await setProviderMode("confirmed");
    const unavailable = await commitEffect(actionA, fixture, "restate-unavailable");
    const beforeDispatch = await effectA.getEffect({
      effectRequestId: unavailable.effectRequestId,
    });
    assert.ok(beforeDispatch.snapshot);
    recorder.state(beforeDispatch.snapshot);
    const storedBeforeRemote = await admin.query<{
      dispatches: string;
      requests: string;
    }>(
      `SELECT
          (SELECT count(*)::text FROM effect_requests WHERE tenant_id = $1 AND effect_request_id = $2) AS requests,
          (SELECT count(*)::text FROM effect_dispatch_attempts WHERE tenant_id = $1 AND effect_request_id = $2) AS dispatches`,
      [tenantA, unavailable.effectRequestId],
    );
    recorder.observe(
      "effectRequestStoredBeforeRemoteAttempt",
      storedBeforeRemote.rows[0]?.requests === "1" &&
        storedBeforeRemote.rows[0]?.dispatches === "0" &&
        (await providerOperation(unavailable.effectRequestId)) === undefined,
    );

    await stopRestate();
    recorder.inject("restate-unavailable");
    await dispatchOnce();
    const unavailableDispatch = await admin.query<{ outcome: string }>(
      `SELECT outcome
       FROM effect_dispatch_attempts
       WHERE tenant_id = $1 AND effect_request_id = $2
       ORDER BY attempt_number`,
      [tenantA, unavailable.effectRequestId],
    );
    recorder.observe(
      "temporaryRestateUnavailabilityTyped",
      unavailableDispatch.rows[0]?.outcome === "restate_unavailable",
    );
    await startRestate();
    await dispatchOnce();
    const confirmedAfterRestate = await waitForState(
      effectA,
      unavailable.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    recorder.state(confirmedAfterRestate);
    const dispatchIdentity = await admin.query<{
      restate_invocation_id: string;
    }>(
      `SELECT restate_invocation_id
       FROM effect_dispatches
       WHERE tenant_id = $1 AND effect_request_id = $2`,
      [tenantA, unavailable.effectRequestId],
    );
    const lookedUpInvocation = await lookupInvocation(
      unavailable.effectRequestId,
    );
    recorder.observe(
      "restateInvocationKeyedByTenantAndEffect",
      lookedUpInvocation ===
        dispatchIdentity.rows[0]?.restate_invocation_id,
    );

    await setProviderMode("accepted_pending");
    const accepted = await commitEffect(actionA, fixture, "accepted");
    await dispatchOnce();
    const acceptedSnapshot = await waitForState(
      effectA,
      accepted.effectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    recorder.state(acceptedSnapshot);
    recorder.observe(
      "remoteAcceptedRemainsPending",
      acceptedSnapshot.request?.state ===
        EffectKnowledgeState.ACCEPTED_PENDING,
    );
    const acceptedEvidence = await waitForProviderOperation(
      accepted.effectRequestId,
    );
    const actionCommitsBeforeReconcile = await actionCommitCount(admin);
    const firstEvidence = evidenceInput(acceptedEvidence, "accepted-confirmed");
    const reconciled = await effectA.reconcile({
      effectRequestId: accepted.effectRequestId,
      evidence: firstEvidence,
    });
    assert.ok(reconciled.snapshot);
    recorder.state(reconciled.snapshot);
    const duplicated = await effectA.reconcile({
      effectRequestId: accepted.effectRequestId,
      evidence: firstEvidence,
    });
    assert.ok(duplicated.snapshot);
    const duplicateCounts = await evidenceCounts(
      admin,
      accepted.effectRequestId,
    );
    recorder.observe(
      "duplicateEvidenceIsIdempotent",
      duplicateCounts.evidence === 1 &&
        duplicateCounts.reconciliations === 1,
    );
    const contradicted = await effectA.reconcile({
      effectRequestId: accepted.effectRequestId,
      evidence: {
        evidenceDigest: sha256(
          `${accepted.effectRequestId}:no_effect:reordered`,
        ),
        evidenceId: "evidence.accepted-no-effect",
        externalOperationId: accepted.effectRequestId,
        observedAt: timestampFromDate(new Date()),
        outcome: EffectEvidenceOutcome.NO_EFFECT,
        sourceId: "source.provider-query",
        sourceRef: `urn:provider-query:${accepted.effectRequestId}:no-effect`,
      },
    });
    assert.ok(contradicted.snapshot);
    recorder.state(contradicted.snapshot);
    recorder.observe(
      "reorderedOpposingEvidenceIsContradicted",
      contradicted.snapshot.request?.state ===
        EffectKnowledgeState.CONTRADICTED,
    );
    recorder.observe(
      "reconciliationDoesNotRerunBusinessAction",
      (await actionCommitCount(admin)) === actionCommitsBeforeReconcile,
    );

    await setProviderMode("timeout_after_delivery");
    const ambiguous = await commitEffect(actionA, fixture, "ambiguous-timeout");
    await dispatchOnce();
    const unknownSnapshot = await waitForState(
      effectA,
      ambiguous.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    recorder.state(unknownSnapshot);
    const ambiguousRemote = await waitForProviderOperation(
      ambiguous.effectRequestId,
    );
    await delay(1_100);
    const ambiguousAfterDelay = await effectA.getEffect({
      effectRequestId: ambiguous.effectRequestId,
    });
    assert.ok(ambiguousAfterDelay.snapshot);
    recorder.observe(
      "timeoutAfterPossibleDeliveryStaysUnknownWithoutBlindRetry",
      ambiguousAfterDelay.snapshot.request?.state ===
        EffectKnowledgeState.UNKNOWN &&
        ambiguousRemote.requests === 1,
    );
    const reconciledUnknown = await effectA.reconcile({
      effectRequestId: ambiguous.effectRequestId,
      evidence: evidenceInput(ambiguousRemote, "ambiguous-confirmed"),
    });
    assert.ok(reconciledUnknown.snapshot);
    recorder.state(reconciledUnknown.snapshot);
    recorder.observe(
      "independentEvidenceReconcilesUnknown",
      reconciledUnknown.snapshot.request?.state ===
        EffectKnowledgeState.CONFIRMED,
    );

    await setProviderMode("parse_error");
    const parseError = await commitEffect(actionA, fixture, "parse-error");
    await dispatchOnce();
    const parseSnapshot = await waitForState(
      effectA,
      parseError.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    recorder.state(parseSnapshot);
    recorder.observe(
      "responseParseErrorTypedUnknown",
      parseSnapshot.attempts[0]?.reason ===
        EffectAttemptReason.RESPONSE_PARSE_ERROR,
    );

    await setProviderMode("schema_error");
    const schemaError = await commitEffect(actionA, fixture, "schema-error");
    await dispatchOnce();
    const schemaSnapshot = await waitForState(
      effectA,
      schemaError.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    recorder.state(schemaSnapshot);
    recorder.observe(
      "responseSchemaErrorTypedUnknown",
      schemaSnapshot.attempts[0]?.reason ===
        EffectAttemptReason.RESPONSE_SCHEMA_ERROR,
    );

    await setProviderMode("confirmed_no_effect");
    const noEffect = await commitEffect(actionA, fixture, "no-effect");
    await dispatchOnce();
    const noEffectSnapshot = await waitForState(
      effectA,
      noEffect.effectRequestId,
      EffectKnowledgeState.CONFIRMED_NO_EFFECT,
    );
    recorder.state(noEffectSnapshot);

    await stopProcess(connector);
    connector = await startConnector({ credentials: {} });
    processes.push(connector);
    await setProviderMode("confirmed");
    const revoked = await commitEffect(actionA, fixture, "revoked");
    await dispatchOnce();
    const revokedSnapshot = await waitForState(
      effectA,
      revoked.effectRequestId,
      EffectKnowledgeState.DEFINITELY_NOT_SENT,
    );
    recorder.state(revokedSnapshot);
    recorder.observe(
      "credentialRevocationIsDefinitelyNotSent",
      revokedSnapshot.attempts[0]?.reason ===
        EffectAttemptReason.CREDENTIAL_REVOKED &&
        (await providerOperation(revoked.effectRequestId)) === undefined,
    );
    await stopProcess(connector);
    connector = await startConnector();
    processes.push(connector);

    await stopProcess(provider);
    const safeRetry = await commitEffect(actionA, fixture, "safe-retry");
    await dispatchOnce();
    recorder.inject("provider-unreachable-before-send");
    await delay(150);
    provider = await startFaultProvider();
    processes.push(provider);
    const safelyRetried = await waitForState(
      effectA,
      safeRetry.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    recorder.state(safelyRetried);
    recorder.observe(
      "definitelyNotSentTransportFailureSafelyRetriedByRestate",
      (await waitForProviderOperation(safeRetry.effectRequestId)).requests ===
        1,
    );

    const crossTenantGet = await expectConnectCode(
      () =>
        effectB.getEffect({
          effectRequestId: accepted.effectRequestId,
        }),
      Code.NotFound,
    );
    const dispatchAttemptsBeforeTenantB = await dispatchAttemptCount(
      admin,
      accepted.effectRequestId,
    );
    await dispatchOnce(tenantB);
    const dispatchAttemptsAfterTenantB = await dispatchAttemptCount(
      admin,
      accepted.effectRequestId,
    );
    const crossTenantReconcile = await expectConnectCode(
      () =>
        effectB.reconcile({
          effectRequestId: accepted.effectRequestId,
          evidence: firstEvidence,
        }),
      Code.NotFound,
    );
    recorder.observe(
      "tenantIsolationCoversScheduleQueryAndReconcile",
      crossTenantGet === Code.NotFound &&
        crossTenantReconcile === Code.NotFound &&
        dispatchAttemptsBeforeTenantB === dispatchAttemptsAfterTenantB,
    );

    await stopProcess(connector);
    connector = await startConnector({ timeoutMs: 3_000 });
    processes.push(connector);
    await setProviderMode("hold_confirmed");
    const restateRestart = await commitEffect(
      actionA,
      fixture,
      "restate-restart",
    );
    await dispatchOnce();
    await waitForProviderOperation(restateRestart.effectRequestId);
    recorder.inject("restate-restart-during-pending-work");
    await restartRestate();
    const afterRestateRestart = await waitForState(
      effectA,
      restateRestart.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    recorder.state(afterRestateRestart);
    recorder.observe(
      "restateRestartPreservesDurableInvocation",
      afterRestateRestart.attempts.length === 1 &&
        (await providerOperation(restateRestart.effectRequestId)) !== undefined,
    );

    await setProviderMode("hold_confirmed");
    const zoendRestart = await commitEffect(
      actionA,
      fixture,
      "zoend-restart",
    );
    await dispatchOnce();
    await waitForProviderOperation(zoendRestart.effectRequestId);
    recorder.inject("zoend-restart-after-remote-delivery");
    await stopProcess(zoend);
    await delay(2_200);
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    const afterZoendRestart = await waitForState(
      effectA,
      zoendRestart.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    recorder.state(afterZoendRestart);
    const durableReceipt = await actionA.getOperationStatus({
      operationId: zoendRestart.operationId,
    });
    recorder.observe(
      "zoendRestartConvergesFromPostgresWithoutActionRerun",
      afterZoendRestart.attempts.length === 1 &&
        durableReceipt.status === CommitStatus.COMMITTED,
    );

    const causal = contradicted.snapshot;
    recorder.observe(
      "causalExplanationSeparatesRequestAttemptEvidenceAndReconciliation",
      causal.request !== undefined &&
        causal.attempts.length === 1 &&
        causal.evidence.length === 2 &&
        causal.reconciliations.length === 2 &&
        causal.request.commitSequence <
          causal.attempts[0]!.commitSequence &&
        causal.attempts[0]!.commitSequence <
          causal.evidence[0]!.commitSequence,
    );
    recorder.observe(
      "externalOperationAndDigestsAreAttributable",
      causal.request?.externalOperationId === accepted.effectRequestId &&
        /^[0-9a-f]{64}$/.test(causal.request.requestDigest ?? "") &&
        causal.attempts.every(
          (attempt) =>
            attempt.externalOperationId === accepted.effectRequestId &&
            /^[0-9a-f]{64}$/.test(attempt.requestDigest),
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

    const committedOperations = [
      unavailable,
      accepted,
      ambiguous,
      parseError,
      schemaError,
      noEffect,
      revoked,
      safeRetry,
      restateRestart,
      zoendRestart,
    ];
    const statuses = await Promise.all(
      committedOperations.map((effect) =>
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
      connectorWritesSemanticAuthority:
        recorder.assertions.reconciliationDoesNotRerunBusinessAction === true,
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
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "effects.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
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

async function commitEffect(
  action: ActionClient,
  fixture: Awaited<ReturnType<typeof loadFixture>>,
  label: string,
): Promise<CommittedEffect> {
  const operationId = `operation.effects.${label}`;
  const proposalId = `proposal.effects.${label}`;
  const proposed = await propose(action, {
    expiresAt: new Date(Date.now() + 300_000),
    fixture,
    operationId,
    proposalId,
    quantity: "1",
  });
  assert.ok(proposed.proposal);
  const committed = await action.commit({ operationId, proposalId });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  const effectRequestId = committed.receipt.effectRequestIds[0];
  assert.ok(effectRequestId);
  return {
    effectRequestId,
    operationId,
    receipt: committed.receipt,
  };
}

async function waitForState(
  client: EffectClient,
  effectRequestId: string,
  expected: EffectKnowledgeState,
): Promise<EffectSnapshot> {
  return waitFor(async () => {
    const response = await client.getEffect({ effectRequestId });
    const snapshot = response.snapshot;
    return snapshot?.request?.state === expected ? snapshot : undefined;
  }, `${effectRequestId} to reach ${stateName(expected)}`);
}

async function waitForProviderOperation(
  effectRequestId: string,
): Promise<ProviderOperation> {
  return waitFor(
    () => providerOperation(effectRequestId),
    `provider operation ${effectRequestId}`,
  );
}

function evidenceInput(
  operation: ProviderOperation,
  suffix: string,
) {
  return {
    evidenceDigest: operation.evidenceDigest,
    evidenceId: `evidence.${suffix}`,
    externalOperationId: operation.externalOperationId,
    observedAt: timestampFromDate(
      new Date(Number(BigInt(operation.observedAtMicros) / 1_000n)),
    ),
    outcome:
      operation.outcome === "confirmed"
        ? EffectEvidenceOutcome.CONFIRMED
        : EffectEvidenceOutcome.NO_EFFECT,
    sourceId: "source.provider-query",
    sourceRef: operation.sourceRef,
  };
}

async function evidenceCounts(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
): Promise<{ evidence: number; reconciliations: number }> {
  const result = await admin.query<{
    evidence: string;
    reconciliations: string;
  }>(
    `SELECT
        (SELECT count(*)::text FROM effect_evidence WHERE tenant_id = $1 AND effect_request_id = $2) AS evidence,
        (SELECT count(*)::text FROM effect_reconciliations WHERE tenant_id = $1 AND effect_request_id = $2) AS reconciliations`,
    [tenantA, effectRequestId],
  );
  return {
    evidence: Number(result.rows[0]?.evidence),
    reconciliations: Number(result.rows[0]?.reconciliations),
  };
}

async function actionCommitCount(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM authority_commits
     WHERE tenant_id = $1 AND commit_kind = 'action'`,
    [tenantA],
  );
  return Number(result.rows[0]?.count);
}

async function dispatchAttemptCount(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM effect_dispatch_attempts
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantA, effectRequestId],
  );
  return Number(result.rows[0]?.count);
}

async function expectConnectCode(
  action: () => Promise<unknown>,
  expected: Code,
): Promise<Code> {
  try {
    await action();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
    return error.code;
  }
}

function stateName(state: EffectKnowledgeState): string {
  switch (state) {
    case EffectKnowledgeState.NOT_ATTEMPTED:
      return "not_attempted";
    case EffectKnowledgeState.DEFINITELY_NOT_SENT:
      return "definitely_not_sent";
    case EffectKnowledgeState.UNKNOWN:
      return "unknown";
    case EffectKnowledgeState.ACCEPTED_PENDING:
      return "accepted_pending";
    case EffectKnowledgeState.CONFIRMED:
      return "confirmed";
    case EffectKnowledgeState.CONFIRMED_NO_EFFECT:
      return "confirmed_no_effect";
    case EffectKnowledgeState.CONTRADICTED:
      return "contradicted";
    case EffectKnowledgeState.UNSPECIFIED:
      return "unspecified";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
