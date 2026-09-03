import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import { z } from "zod";
import { CommitStatus } from "../gen/connect/zoen/action/v1/action_pb.js";
import { EffectKnowledgeState } from "../gen/connect/zoen/effect/v1/effect_pb.js";
import { DefinitionReferenceSchema } from "../gen/connect/zoen/world/v1/world_pb.js";
import {
  activateDefinition,
  approveProposal,
  authDatabaseUrl,
  humanActionId,
  loadFixture,
  plantGovernedActionDoor,
  publishDefinition,
  propose,
  recordAvailable,
  resourceId,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
  type DefinitionFixture,
  writePolicyManifest,
} from "./governed-action/support.js";
import {
  commitEffect,
  delay,
  evidenceCounts,
  evidenceInput,
  expectConnectCode,
  sha256,
  waitForConnectorStatus,
  waitForProviderOperation,
  waitForState,
} from "./effect-scenario.js";
import {
  actionClient,
  adminClient,
  connectorCallerToken,
  connectorUrl,
  crashProcess,
  credentialReady,
  definitionClient,
  dispatchOnce,
  effectClient,
  effectWorkerApiKeyFile,
  effectWorkerReadyFile,
  exchangeWorkloadCredential,
  issueWorkloadCredential,
  lookupInvocation,
  prepareWorkerArtifact,
  providerOperation,
  providerStats,
  registerWorker,
  registrarReady,
  repositoryRoot,
  requestWorkloadCredential,
  restateAdmin,
  restateIngress,
  revokeWorkloadCredential,
  setProviderMode,
  startConnector,
  startCredentialValidator,
  startEffectRegistrar,
  startFaultProvider,
  startRestate,
  startWorker,
  startZoend,
  stopProcess,
  stopRestate,
  suspendProcess,
  tenantA,
  tenantB,
  resumeProcess,
  waitFor,
  waitForCredentialReady,
  worldClient,
  writeEffectWorkerApiKey,
  writeEffectWorkerApiKeyValue,
  zoenBaseUrl,
  type ManagedProcess,
  type WorkloadIdentity,
} from "./effect-support.js";
import {
  e2eGeneratedDirectory,
  writeScenarioArtifact,
} from "./host-env.js";
import { gitHead } from "./scenario-evidence.js";

const registrationStateSchema = z
  .object({
    artifact: z.string().min(1),
    deploymentId: z.string().min(1),
    ready: z.literal(true),
    reason: z.literal("exact registration verified"),
    updatedAt: z.string().min(1),
  })
  .strict();
const deploymentSchema = z
  .object({
    id: z.string().min(1),
    metadata: z.record(z.string(), z.string()),
    services: z.array(
      z
        .object({
          handlers: z.array(
            z
              .object({
                metadata: z.record(z.string(), z.string()),
                name: z.string(),
                public: z.boolean(),
                ty: z.string(),
              })
              .passthrough(),
          ),
          metadata: z.record(z.string(), z.string()),
          name: z.string(),
          ty: z.string(),
        })
        .passthrough(),
    ),
    uri: z.url(),
  })
  .passthrough();

interface EffectIdentityRow {
  adapter_execution_id: string;
  attempt_id: string;
  claimed_workload_id: string;
  dispatch_version: string;
  effect_request_id: string;
  effect_request_digest: string;
  idempotency_key: string;
  operation_id: string;
  provider_operation_id: string;
  restate_invocation_id: string;
  result_kind: string;
  tenant_id: string;
  attempt_request_digest: string;
}

interface EffectIdentityEvidence extends EffectIdentityRow {
  restate_object_key: string;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixture = await loadFixture("direct", 1);
  const humanFixture = asHumanFixture(await loadFixture("human", 2));
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "effect-runtime"),
    "effect-runtime-policies.json",
  );
  await writePolicyManifest(policyManifestPath, [fixture, humanFixture]);
  await Promise.all([
    rm(effectWorkerApiKeyFile, { force: true }),
    rm(effectWorkerReadyFile, { force: true }),
  ]);

  const door = await startAuthDoor(authDatabaseUrl);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  const assertions: Record<string, boolean> = {};
  const observe = (name: string, value: boolean): void => {
    assert.ok(value, name);
    assertions[name] = true;
  };
  let zoend = await startZoend(policyManifestPath);
  processes.push(zoend);
  await admin.connect();

  try {
    const planted = await plantGovernedActionDoor(door);
    const agentAToken = sessionOf(planted, "agent-a").token;
    const agentBToken = sessionOf(planted, "agent-b").token;
    const adminAToken = sessionOf(planted, "admin-a").token;
    const adminBToken = sessionOf(planted, "admin-b").token;
    const approverAToken = sessionOf(planted, "approver-a").token;
    const workerIdentity = {
      actorId: "actor.effect-worker.a",
      principalId: "principal.effect-worker.a",
      tenantId: tenantA,
      workloadId: "workload.effect-worker",
    } satisfies WorkloadIdentity;
    const workerBIdentity = {
      actorId: "actor.effect-worker.b",
      principalId: "principal.effect-worker.b",
      tenantId: tenantB,
      workloadId: "workload.effect-worker",
    } satisfies WorkloadIdentity;
    const reconcilerIdentity = {
      actorId: "actor.effect-reconciler.a",
      principalId: "principal.effect-reconciler.a",
      tenantId: tenantA,
      workloadId: "workload.effect-reconciler",
    } satisfies WorkloadIdentity;

    const live = await fetch(new URL("/live", zoenBaseUrl));
    observe("zoendLiveIsComponentLocal", live.status === 200);

    processes.push(await startFaultProvider());
    let connector = await startConnector();
    processes.push(connector);
    await prepareWorkerArtifact();
    processes.push(await startEffectRegistrar(workerIdentity));

    const credentialsBefore = await credentialCount(admin);
    const unauthorized = await requestWorkloadCredential(
      agentAToken,
      workerIdentity,
    );
    await unauthorized.text();
    observe(
      "ordinaryDoorSessionCannotIssueWorkloadCredential",
      unauthorized.status === 403 &&
        (await credentialCount(admin)) === credentialsBefore,
    );

    await expectRegistrationGateClosed("missing API key");
    observe(
      "missingWorkerKeyGatesDispatch",
      !(await credentialReady(workerIdentity)) &&
        (await totalDispatchAttemptCount(admin)) === 0,
    );

    await writeEffectWorkerApiKeyValue("zoen_wl_wrong");
    const validator = await startCredentialValidator(workerIdentity, {
      awaitReady: false,
    });
    processes.push(validator);
    await waitFor(
      async () =>
        validator.output.join("").includes("authentication failed")
          ? true
          : undefined,
      "wrong worker key rejection",
    );
    await expectRegistrationGateClosed("wrong API key");
    observe(
      "wrongWorkerKeyGatesDispatch",
      !(await credentialReady(workerIdentity)) &&
        (await totalDispatchAttemptCount(admin)) === 0,
    );

    const firstWorkerCredential = await issueWorkloadCredential(
      adminAToken,
      workerIdentity,
    );
    await writeEffectWorkerApiKey(firstWorkerCredential);
    await waitForCredentialReady(workerIdentity, validator);
    let worker = await startWorker(workerIdentity);
    processes.push(worker);
    const registration = await exactRegistration();
    observe(
      "authorizedOperatorIssuesExactWorkerCredential",
      firstWorkerCredential.tenantId === tenantA &&
        firstWorkerCredential.principalId === workerIdentity.principalId &&
        registration.ready,
    );

    const crossTenantWorkerCredential = await issueWorkloadCredential(
      adminBToken,
      workerBIdentity,
    );
    const crossTenantProviderRequests = (await providerStats()).requests;
    const crossTenantClaims = await totalClaimCount(admin);
    await writeEffectWorkerApiKey(crossTenantWorkerCredential);
    await waitFor(
      async () => (!(await credentialReady(workerIdentity)) ? true : undefined),
      "cross-tenant worker credential rejection",
    );
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration gate for cross-tenant worker credential",
    );
    await expectRegistrationGateClosed("cross-tenant worker credential");
    observe(
      "crossTenantWorkerCredentialFailsClosed",
      (await totalClaimCount(admin)) === crossTenantClaims &&
        (await providerStats()).requests === crossTenantProviderRequests,
    );
    await writeEffectWorkerApiKey(firstWorkerCredential);
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();

    const crossReferenceProviderRequests = (await providerStats()).requests;
    const crossReferenceResponse = await invokeConnectorWithCrossTenantRef();
    observe(
      "crossTenantConnectorCredentialReferenceFailsClosed",
      crossReferenceResponse.status === 403 &&
        (await claimCount(admin, "effect.synthetic.cross-reference")) === 0 &&
        (await providerStats()).requests === crossReferenceProviderRequests,
    );

    const definitionAdmin = definitionClient(adminAToken, tenantA);
    const definitionAdminB = definitionClient(adminBToken, tenantB);
    const actionA = actionClient(agentAToken, tenantA);
    const actionB = actionClient(agentBToken, tenantB);
    const approverA = actionClient(approverAToken, tenantA);
    const effectA = effectClient(agentAToken, tenantA);
    const worldA = worldClient(agentAToken, tenantA);
    const worldB = worldClient(agentBToken, tenantB);
    await publishDefinition(definitionAdmin, tenantA, fixture);
    await publishDefinition(definitionAdmin, tenantA, humanFixture);
    await activateDefinition(definitionAdmin, tenantA, fixture);
    await activateDefinition(definitionAdmin, tenantA, humanFixture);
    await publishDefinition(definitionAdminB, tenantB, fixture);
    await activateDefinition(definitionAdminB, tenantB, fixture);
    await recordAvailable(worldA, {
      claimId: "claim.available.effect-runtime.external",
      fixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "100",
    });
    await recordAvailable(worldB, {
      claimId: "claim.available.effect-runtime.cross-tenant",
      fixture,
      resource: resourceId,
      tenantId: tenantB,
      value: "100",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.effect-runtime.human",
      fixture: humanFixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "100",
    });

    await setProviderMode("confirmed");
    const normal = await commitEffect(actionA, fixture, "normal-chain");
    await revokeWorkloadCredential(
      adminAToken,
      firstWorkerCredential.credentialId,
      tenantA,
    );
    await waitFor(
      async () => (!(await credentialReady(workerIdentity)) ? true : undefined),
      "revoked worker marker removal",
    );
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration gate after credential revocation",
    );
    await expectRegistrationGateClosed("revoked API key");
    observe(
      "revokedWorkerKeyGatesPendingDispatch",
      (await dispatchAttemptCount(admin, normal.effectRequestId)) === 0 &&
        (await providerOperation(normal.idempotencyKey)) === undefined,
    );

    const replacementWorkerCredential = await issueWorkloadCredential(
      adminAToken,
      workerIdentity,
    );
    await writeEffectWorkerApiKey(replacementWorkerCredential);
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();
    await dispatchOnce();
    await waitForState(
      effectA,
      normal.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    const normalProvider = await waitForProviderOperation(normal.idempotencyKey);
    const identity = await effectIdentity(admin, normal.effectRequestId);
    const normalCounts = await attemptCounts(admin, normal.effectRequestId);
    const normalEffectRequests = await effectRequestCount(
      admin,
      normal.operationId,
    );
    const lookedUpInvocation = await lookupInvocation(
      identity.effect_request_id,
      identity.dispatch_version,
    );
    observe(
      "invocationDispatchClaimAttemptProviderIdentityIsContinuous",
      identity.tenant_id === tenantA &&
        identity.operation_id === normal.operationId &&
        identity.idempotency_key === normal.idempotencyKey &&
        identity.restate_object_key ===
          `${tenantA}:${normal.effectRequestId}:${identity.dispatch_version}` &&
        identity.restate_invocation_id === lookedUpInvocation &&
        identity.adapter_execution_id === lookedUpInvocation &&
        identity.claimed_workload_id === workerIdentity.workloadId &&
        identity.effect_request_digest === identity.attempt_request_digest &&
        identity.provider_operation_id === normalProvider.providerOperationId &&
        normalProvider.idempotencyKey === normal.idempotencyKey &&
        identity.result_kind === "confirmed" &&
        normalProvider.requests === 1 &&
        normalEffectRequests === 1 &&
        normalCounts.claims === 1 &&
        normalCounts.dispatches === 1 &&
        normalCounts.effectAttempts === 1 &&
        normalCounts.schedulerAttempts === 1,
    );

    await stopProcess(connector);
    connector = await startConnector({
      providerUrl: "http://127.0.0.1:1/v1/operations",
    });
    processes.push(connector);
    await exactRegistration();
    const retryable = await commitEffect(
      actionA,
      fixture,
      "definitely-not-sent",
    );
    await dispatchOnce();
    await waitForState(
      effectA,
      retryable.effectRequestId,
      EffectKnowledgeState.DEFINITELY_NOT_SENT,
    );
    observe(
      "definitelyNotSentDoesNotInventProviderOperation",
      (await providerOperation(retryable.idempotencyKey)) === undefined,
    );

    await crashProcess(worker);
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration loss after handler stop",
    );
    await expectRegistrationGateClosed("missing effect handler");
    observe(
      "missingHandlerGatesRetryDispatch",
      (await dispatchAttemptCount(admin, retryable.effectRequestId)) === 1 &&
        (await providerOperation(retryable.idempotencyKey)) === undefined,
    );
    worker = await startWorker(workerIdentity);
    processes.push(worker);
    await exactRegistration();

    await stopRestate();
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration loss after Restate stop",
    );
    await startRestate();
    await exactRegistration();

    await stopProcess(connector);
    connector = await startConnector();
    processes.push(connector);
    await exactRegistration();
    const invalidatedExchangeToken = await exchangeWorkloadCredential(
      replacementWorkerCredential,
      workerIdentity,
    );

    await crashProcess(zoend);
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration loss after zoend stop",
    );
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();
    const invalidatedExchangeCode = await expectConnectCode(
      () =>
        effectClient(invalidatedExchangeToken, tenantA).getEffect({
          effectRequestId: retryable.effectRequestId,
        }),
      Code.Unauthenticated,
    );
    observe(
      "zoendRestartInvalidatesPriorWorkloadExchange",
      invalidatedExchangeCode === Code.Unauthenticated,
    );
    await dispatchOnce();
    await waitForState(
      effectA,
      retryable.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    const retriedProvider = await waitForProviderOperation(
      retryable.idempotencyKey,
    );
    const retryCounts = await attemptCounts(admin, retryable.effectRequestId);
    observe(
      "definitelyNotSentRetryConvergesAcrossAllRuntimeRestarts",
      retryCounts.claims === 2 &&
        retryCounts.dispatches === 2 &&
        retryCounts.effectAttempts === 2 &&
        retryCounts.schedulerAttempts === 2 &&
        retriedProvider.requests === 1 &&
        (await actionOperationCount(admin, retryable.operationId)) === 1,
    );

    const reconcilerCredential = await issueWorkloadCredential(
      adminAToken,
      reconcilerIdentity,
    );
    const reconcilerToken = await exchangeWorkloadCredential(
      reconcilerCredential,
      reconcilerIdentity,
    );
    const workerToken = await exchangeWorkloadCredential(
      replacementWorkerCredential,
      workerIdentity,
    );
    const reconciler = effectClient(reconcilerToken, tenantA);
    const workerEffect = effectClient(workerToken, tenantA);

    await setProviderMode("timeout_after_delivery");
    const unknown = await commitEffect(actionA, fixture, "unknown-no-resend");
    await dispatchOnce();
    await waitForState(
      effectA,
      unknown.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    const unknownProvider = await waitForProviderOperation(
      unknown.idempotencyKey,
    );
    await dispatchOnce();
    await delay(1100);
    const stillOneProviderRequest = await waitForProviderOperation(
      unknown.idempotencyKey,
    );
    observe(
      "unknownOutcomeIsNeverBlindlyResent",
      (await dispatchAttemptCount(admin, unknown.effectRequestId)) === 1 &&
        unknownProvider.requests === 1 &&
        stillOneProviderRequest.requests === 1,
    );

    const statusEvidence = await waitForConnectorStatus(unknown.idempotencyKey);
    const evidence = evidenceInput(statusEvidence, "effect-runtime-unknown");
    const wrongScopeReconciliationCountsBefore = await evidenceCounts(
      admin,
      unknown.effectRequestId,
    );
    const wrongScopeReconciliationVersionBefore =
      await latestKnowledgeCommitSequence(
        admin,
        tenantA,
        unknown.effectRequestId,
      );
    const wrongActionReconcilerCredential = await issueWorkloadCredential(
      adminAToken,
      reconcilerIdentity,
      {
        delegation: [
          {
            actions: ["zoen.effect.execute"],
            id: "delegation.effect-reconciler.wrong-action",
            resources: ["zoen.effect.requests"],
          },
        ],
      },
    );
    const wrongResourceReconcilerCredential = await issueWorkloadCredential(
      adminAToken,
      reconcilerIdentity,
      {
        delegation: [
          {
            actions: ["zoen.effect.reconcile"],
            id: "delegation.effect-reconciler.wrong-resource",
            resources: ["zoen.effect.other-requests"],
          },
        ],
      },
    );
    const wrongActionReconciler = effectClient(
      await exchangeWorkloadCredential(
        wrongActionReconcilerCredential,
        reconcilerIdentity,
      ),
      tenantA,
    );
    const wrongResourceReconciler = effectClient(
      await exchangeWorkloadCredential(
        wrongResourceReconcilerCredential,
        reconcilerIdentity,
      ),
      tenantA,
    );
    const wrongActionReconcileDenied = await expectConnectCode(
      () =>
        wrongActionReconciler.reconcile({
          effectRequestId: unknown.effectRequestId,
          evidence,
        }),
      Code.PermissionDenied,
    );
    const wrongResourceReconcileDenied = await expectConnectCode(
      () =>
        wrongResourceReconciler.reconcile({
          effectRequestId: unknown.effectRequestId,
          evidence,
        }),
      Code.PermissionDenied,
    );
    const wrongScopeReconciliationCounts = await evidenceCounts(
      admin,
      unknown.effectRequestId,
    );
    const wrongScopeReconciliationVersion =
      await latestKnowledgeCommitSequence(
        admin,
        tenantA,
        unknown.effectRequestId,
      );
    const wrongScopeReconciliationSnapshot = await effectA.getEffect({
      effectRequestId: unknown.effectRequestId,
    });
    observe(
      "reconciliationRequiresCanonicalActionAndResourceGrantsBeforeMutation",
      wrongActionReconcileDenied === Code.PermissionDenied &&
        wrongResourceReconcileDenied === Code.PermissionDenied &&
        wrongScopeReconciliationCounts.evidence ===
          wrongScopeReconciliationCountsBefore.evidence &&
        wrongScopeReconciliationCounts.reconciliations ===
          wrongScopeReconciliationCountsBefore.reconciliations &&
        wrongScopeReconciliationVersion ===
          wrongScopeReconciliationVersionBefore &&
        wrongScopeReconciliationSnapshot.snapshot?.request?.state ===
          EffectKnowledgeState.UNKNOWN,
    );
    const workerDenied = await expectConnectCode(
      () =>
        workerEffect.reconcile({
          effectRequestId: unknown.effectRequestId,
          evidence,
        }),
      Code.PermissionDenied,
    );
    const reconciled = await reconciler.reconcile({
      effectRequestId: unknown.effectRequestId,
      evidence,
    });
    const reconciliationCounts = await evidenceCounts(
      admin,
      unknown.effectRequestId,
    );
    const credentialIdentities = await credentialIdentityCount(
      admin,
      replacementWorkerCredential.credentialId,
      reconcilerCredential.credentialId,
    );
    observe(
      "reconciliationUsesDistinctCredentialAndImmutableEvidence",
      workerDenied === Code.PermissionDenied &&
        reconciled.snapshot?.request?.state === EffectKnowledgeState.CONFIRMED &&
        reconciliationCounts.evidence === 1 &&
        reconciliationCounts.reconciliations === 1 &&
        credentialIdentities === 2 &&
        replacementWorkerCredential.credentialId !==
          reconcilerCredential.credentialId,
    );

    await setProviderMode("truncate_after_commit");
    const truncated = await commitEffect(
      actionA,
      fixture,
      "truncated-response-no-resend",
    );
    await dispatchOnce();
    await waitForState(
      effectA,
      truncated.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    const truncatedProvider = await waitForProviderOperation(
      truncated.idempotencyKey,
    );
    await dispatchOnce();
    await delay(100);
    const truncatedProviderAfterRedispatch = await waitForProviderOperation(
      truncated.idempotencyKey,
    );
    const truncatedWorkerEvidence = evidenceInput(
      await waitForConnectorStatus(truncated.idempotencyKey),
      "effect-runtime-truncated-response-worker",
    );
    const truncatedWorkerDenied = await expectConnectCode(
      () =>
        workerEffect.reconcile({
          effectRequestId: truncated.effectRequestId,
          evidence: truncatedWorkerEvidence,
        }),
      Code.PermissionDenied,
    );
    const truncatedEvidence = evidenceInput(
      await waitForConnectorStatus(truncated.idempotencyKey),
      "effect-runtime-truncated-response",
    );
    const truncatedReconciled = await reconciler.reconcile({
      effectRequestId: truncated.effectRequestId,
      evidence: truncatedEvidence,
    });
    const truncatedReconciliationCounts = await evidenceCounts(
      admin,
      truncated.effectRequestId,
    );
    observe(
      "truncatedProviderResponseIsUnknownNeverResentAndReconciled",
      (await dispatchAttemptCount(admin, truncated.effectRequestId)) === 1 &&
        truncatedProvider.requests === 1 &&
        truncatedProviderAfterRedispatch.requests === 1 &&
        truncatedWorkerDenied === Code.PermissionDenied &&
        truncatedReconciled.snapshot?.request?.state ===
          EffectKnowledgeState.CONFIRMED &&
        truncatedReconciliationCounts.evidence === 1 &&
        truncatedReconciliationCounts.reconciliations === 1,
    );

    await setProviderMode("confirmed");
    const preClaimCredentialRace = await commitEffect(
      actionA,
      fixture,
      "credential-loss-before-claim",
    );
    await suspendValidatorAtFreshCredentialMarker(workerIdentity, validator);
    let acceptedWithoutClaimBeforeCredentialLoss = false;
    let revokedWorkerSessionWasInvalidated = false;
    const preClaimRecoveryCredential = await (async () => {
      const pending: { revoke?: Promise<void> } = {};
      try {
        await withCredentialRowHeld(
          replacementWorkerCredential.credentialId,
          async () => {
            pending.revoke = revokeWorkloadCredential(
              adminAToken,
              replacementWorkerCredential.credentialId,
              tenantA,
            );
            await waitFor(
              async () =>
                (await blockedWorkloadQueryCount(
                  admin,
                  "zoen:workload-credential-revocation",
                )) === 1
                  ? true
                  : undefined,
              "governed revocation waiting on the credential row",
            );
            await dispatchOnce();
            await waitFor(
              async () =>
                (await blockedWorkloadQueryCount(
                  admin,
                  "zoen:workload-api-key-authentication",
                )) === 1
                  ? true
                  : undefined,
              "effect handler authentication waiting on the credential row",
            );
            const heldCounts = await attemptCounts(
              admin,
              preClaimCredentialRace.effectRequestId,
            );
            acceptedWithoutClaimBeforeCredentialLoss =
              heldCounts.dispatches === 1 &&
              heldCounts.schedulerAttempts === 1 &&
              heldCounts.claims === 0 &&
              heldCounts.effectAttempts === 0 &&
              (await providerOperation(
                preClaimCredentialRace.idempotencyKey,
              )) === undefined;
          },
        );
        assert.ok(pending.revoke);
        await pending.revoke;
        revokedWorkerSessionWasInvalidated =
          (await expectConnectCode(
            () =>
              workerEffect.getEffect({
                effectRequestId: preClaimCredentialRace.effectRequestId,
              }),
            Code.Unauthenticated,
          )) === Code.Unauthenticated;
        const credential = await issueWorkloadCredential(
          adminAToken,
          workerIdentity,
        );
        await writeEffectWorkerApiKey(credential);
        return credential;
      } finally {
        resumeProcess(validator);
      }
    })();
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();
    await waitForState(
      effectA,
      preClaimCredentialRace.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    const preClaimRaceCounts = await attemptCounts(
      admin,
      preClaimCredentialRace.effectRequestId,
    );
    const preClaimRaceProvider = await waitForProviderOperation(
      preClaimCredentialRace.idempotencyKey,
    );
    observe(
      "acceptedPreClaimCredentialLossResumesAfterCredentialRestoration",
      acceptedWithoutClaimBeforeCredentialLoss &&
        revokedWorkerSessionWasInvalidated &&
        preClaimRaceCounts.dispatches === 1 &&
        preClaimRaceCounts.schedulerAttempts === 1 &&
        preClaimRaceCounts.claims === 1 &&
        preClaimRaceCounts.effectAttempts === 1 &&
        preClaimRaceProvider.requests === 1,
    );

    const postClaimCredentialRace = await commitEffect(
      actionA,
      fixture,
      "credential-revoked-after-claim-authorization",
    );
    await suspendValidatorAtFreshCredentialMarker(workerIdentity, validator);
    let postClaimRevocationStoppedProvider = false;
    const finalWorkerCredential = await (async () => {
      try {
        const authorityHead = await holdAuthorityHead(tenantA);
        try {
          await dispatchOnce();
          await waitFor(
            async () =>
              (await blockedAuthorityHeadClaimCount(admin)) > 0
                ? true
                : undefined,
            "claim authorization waiting on the authority head",
          );
          await revokeWorkloadCredential(
            adminAToken,
            preClaimRecoveryCredential.credentialId,
            tenantA,
          );
          const secretReads = await holdWorkloadSecretReads();
          try {
            await authorityHead.release();
            await waitFor(
              async () =>
                (await blockedWorkloadQueryCount(
                  admin,
                  "zoen:workload-api-key-lookup",
                )) === 1
                  ? true
                  : undefined,
              "post-claim worker authentication waiting on secret reads",
            );
            postClaimRevocationStoppedProvider =
              (await registrarReady()) &&
              (await claimCount(
                admin,
                postClaimCredentialRace.effectRequestId,
              )) === 1 &&
              (await providerOperation(
                postClaimCredentialRace.idempotencyKey,
              )) === undefined;
          } finally {
            await secretReads.release();
          }
        } finally {
          await authorityHead.release();
        }
        const credential = await issueWorkloadCredential(
          adminAToken,
          workerIdentity,
        );
        await writeEffectWorkerApiKey(credential);
        return credential;
      } finally {
        resumeProcess(validator);
      }
    })();
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();
    await waitForState(
      effectA,
      postClaimCredentialRace.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    const postClaimRaceCounts = await attemptCounts(
      admin,
      postClaimCredentialRace.effectRequestId,
    );
    const postClaimRaceProvider = await waitForProviderOperation(
      postClaimCredentialRace.idempotencyKey,
    );
    observe(
      "freshAuthenticationAfterClaimBlocksRevokedWorkerUntilRestored",
      postClaimRevocationStoppedProvider &&
        postClaimRaceCounts.dispatches === 1 &&
        postClaimRaceCounts.schedulerAttempts === 1 &&
        postClaimRaceCounts.claims === 1 &&
        postClaimRaceCounts.effectAttempts === 1 &&
        postClaimRaceProvider.requests === 1,
    );

    const terminalProviderRequestsBefore = (await providerStats()).requests;
    const crossTenantEffect = await commitEffect(
      actionB,
      fixture,
      "cross-tenant-payload",
      tenantB,
    );
    const crossTenantEffectVersion = await latestKnowledgeCommitSequence(
      admin,
      tenantB,
      crossTenantEffect.effectRequestId,
    );
    const crossTenantPayloadResult = await invokeEffect(
      `${tenantA}:${crossTenantEffect.effectRequestId}:${crossTenantEffectVersion}`,
      {
        dispatchVersion: crossTenantEffectVersion,
        effectRequestId: crossTenantEffect.effectRequestId,
        tenantId: tenantA,
      },
    );
    const wrongKeyResult = await invokeEffect(
      `${tenantA}:effect.synthetic.wrong-key:wrong`,
      {
        dispatchVersion: 7,
        effectRequestId: "effect.synthetic.wrong-key",
        tenantId: tenantA,
      },
    );
    const crossTenantResult = await invokeEffect(
      `${tenantB}:effect.synthetic.cross-tenant:8`,
      {
        dispatchVersion: 8,
        effectRequestId: "effect.synthetic.cross-tenant",
        tenantId: tenantB,
      },
    );
    const missingEffectResult = await invokeEffect(
      `${tenantA}:effect.synthetic.missing:10`,
      {
        dispatchVersion: 10,
        effectRequestId: "effect.synthetic.missing",
        tenantId: tenantA,
      },
    );
    observe(
      "wrongKeyCrossTenantAndMissingInvocationsFailTerminalBeforeConnector",
      wrongKeyResult.status >= 400 &&
        crossTenantResult.status >= 400 &&
        crossTenantPayloadResult.status >= 400 &&
        missingEffectResult.status >= 400 &&
        (await claimCount(admin, "effect.synthetic.wrong-key")) === 0 &&
        (await claimCount(admin, "effect.synthetic.cross-tenant")) === 0 &&
        (await claimCount(admin, "effect.synthetic.missing")) === 0 &&
        (await claimCount(
          admin,
          crossTenantEffect.effectRequestId,
          tenantB,
        )) === 0 &&
        (await providerStats()).requests === terminalProviderRequestsBefore,
    );

    const forbiddenClaim = await commitEffect(
      actionA,
      fixture,
      "forbidden-claim",
    );
    const forbiddenClaimVersion = await latestKnowledgeCommitSequence(
      admin,
      tenantA,
      forbiddenClaim.effectRequestId,
    );
    const authorizationAttemptCountsBefore = await attemptCounts(
      admin,
      forbiddenClaim.effectRequestId,
    );
    const authorizationProviderRequestsBefore = (await providerStats()).requests;
    const credentialsBeforeEmptyDelegation = await credentialCount(admin);
    const emptyDelegationResponse = await requestWorkloadCredential(
      adminAToken,
      workerIdentity,
      { delegation: [] },
    );
    await emptyDelegationResponse.text();
    observe(
      "emptyDelegationCannotCreateEffectWorkerCredential",
      emptyDelegationResponse.status === 400 &&
        (await credentialCount(admin)) === credentialsBeforeEmptyDelegation &&
        (await claimCount(admin, forbiddenClaim.effectRequestId)) === 0,
    );
    const expiringWorkerCredential = await issueWorkloadCredential(
      adminAToken,
      workerIdentity,
      { expiresAtMicros: (await databaseNowMicros(admin)) + 10_000_000 },
    );
    const expiringWorkerToken = await exchangeWorkloadCredential(
      expiringWorkerCredential,
      workerIdentity,
    );
    await waitFor(
      () => credentialExpired(admin, expiringWorkerCredential.credentialId),
      "effect worker credential expiry",
      400,
    );
    const expiredWorkerDenied = await expectConnectCode(
      () =>
        effectClient(expiringWorkerToken, tenantA).claimAttempt({
          adapterExecutionId: "adapter.expired-credential",
          effectRequestId: forbiddenClaim.effectRequestId,
          expectedKnowledgeCommitSequence: BigInt(forbiddenClaimVersion),
        }),
      Code.Unauthenticated,
    );
    observe(
      "expiredEffectWorkerCredentialFailsBeforeClaim",
      expiredWorkerDenied === Code.Unauthenticated &&
        (await claimCount(admin, forbiddenClaim.effectRequestId)) === 0,
    );
    const revokedWorkerCredential = await issueWorkloadCredential(
      adminAToken,
      workerIdentity,
    );
    const revokedWorkerToken = await exchangeWorkloadCredential(
      revokedWorkerCredential,
      workerIdentity,
    );
    await revokeWorkloadCredential(
      adminAToken,
      revokedWorkerCredential.credentialId,
      tenantA,
    );
    const revokedWorkerDenied = await expectConnectCode(
      () =>
        effectClient(revokedWorkerToken, tenantA).claimAttempt({
          adapterExecutionId: "adapter.revoked-credential",
          effectRequestId: forbiddenClaim.effectRequestId,
          expectedKnowledgeCommitSequence: BigInt(forbiddenClaimVersion),
        }),
      Code.Unauthenticated,
    );
    observe(
      "revokedEffectWorkerCredentialFailsBeforeClaim",
      revokedWorkerDenied === Code.Unauthenticated &&
        (await claimCount(admin, forbiddenClaim.effectRequestId)) === 0,
    );
    const wrongActionWorkerCredential = await issueWorkloadCredential(
      adminAToken,
      workerIdentity,
      {
        delegation: [
          {
            actions: ["zoen.effect.reconcile"],
            id: "delegation.effect-worker.wrong-action",
            resources: ["zoen.effect.requests"],
          },
        ],
      },
    );
    const wrongResourceWorkerCredential = await issueWorkloadCredential(
      adminAToken,
      workerIdentity,
      {
        delegation: [
          {
            actions: ["zoen.effect.execute"],
            id: "delegation.effect-worker.wrong-resource",
            resources: ["zoen.effect.other-requests"],
          },
        ],
      },
    );
    const wrongActionWorker = effectClient(
      await exchangeWorkloadCredential(
        wrongActionWorkerCredential,
        workerIdentity,
      ),
      tenantA,
    );
    const wrongResourceWorker = effectClient(
      await exchangeWorkloadCredential(
        wrongResourceWorkerCredential,
        workerIdentity,
      ),
      tenantA,
    );
    const wrongActionClaimDenied = await expectConnectCode(
      () =>
        wrongActionWorker.claimAttempt({
          adapterExecutionId: "adapter.wrong-action",
          effectRequestId: forbiddenClaim.effectRequestId,
          expectedKnowledgeCommitSequence: BigInt(forbiddenClaimVersion),
        }),
      Code.PermissionDenied,
    );
    const wrongResourceClaimDenied = await expectConnectCode(
      () =>
        wrongResourceWorker.claimAttempt({
          adapterExecutionId: "adapter.wrong-resource",
          effectRequestId: forbiddenClaim.effectRequestId,
          expectedKnowledgeCommitSequence: BigInt(forbiddenClaimVersion),
        }),
      Code.PermissionDenied,
    );
    const authorizationAttemptCounts = await attemptCounts(
      admin,
      forbiddenClaim.effectRequestId,
    );
    const authorizationVersion = await latestKnowledgeCommitSequence(
      admin,
      tenantA,
      forbiddenClaim.effectRequestId,
    );
    observe(
      "effectExecutionRequiresCanonicalActionAndResourceGrantsBeforeClaim",
      wrongActionClaimDenied === Code.PermissionDenied &&
        wrongResourceClaimDenied === Code.PermissionDenied &&
        authorizationAttemptCounts.claims ===
          authorizationAttemptCountsBefore.claims &&
        authorizationAttemptCounts.dispatches ===
          authorizationAttemptCountsBefore.dispatches &&
        authorizationAttemptCounts.effectAttempts ===
          authorizationAttemptCountsBefore.effectAttempts &&
        authorizationAttemptCounts.schedulerAttempts ===
          authorizationAttemptCountsBefore.schedulerAttempts &&
        authorizationVersion === forbiddenClaimVersion &&
        (await providerStats()).requests ===
          authorizationProviderRequestsBefore &&
        (await providerOperation(forbiddenClaim.idempotencyKey)) === undefined,
    );
    await crashProcess(zoend);
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration loss before forbidden claim proof",
    );
    zoend = await startZoend(policyManifestPath, {
      effectWorkerWorkloadId: "workload.effect-worker-denied",
    });
    processes.push(zoend);
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();
    const forbiddenClaimResult = await invokeEffect(
      `${tenantA}:${forbiddenClaim.effectRequestId}:${forbiddenClaimVersion}`,
      {
        dispatchVersion: forbiddenClaimVersion,
        effectRequestId: forbiddenClaim.effectRequestId,
        tenantId: tenantA,
      },
    );
    observe(
      "forbiddenClaimIsAVisibleFailureBeforeConnector",
      forbiddenClaimResult.status >= 400 &&
        forbiddenClaimResult.body.includes("not authorized") &&
        (await claimCount(admin, forbiddenClaim.effectRequestId)) === 0 &&
        (await providerOperation(forbiddenClaim.idempotencyKey)) === undefined,
    );
    await crashProcess(zoend);
    zoend = await startZoend(policyManifestPath);
    processes.push(zoend);
    await waitForCredentialReady(workerIdentity, validator);
    await exactRegistration();

    const human = await commitHumanEffect(
      actionA,
      approverA,
      humanFixture,
      "human-terminal",
    );
    const humanVersion = await latestKnowledgeCommitSequence(
      admin,
      tenantA,
      human.effectRequestId,
    );
    const wrongVersion = humanVersion + 1;
    const wrongVersionResult = await invokeEffect(
      `${tenantA}:${human.effectRequestId}:${wrongVersion}`,
      {
        dispatchVersion: wrongVersion,
        effectRequestId: human.effectRequestId,
        tenantId: tenantA,
      },
    );
    observe(
      "fabricatedDispatchVersionFailsBeforeClaim",
      wrongVersionResult.status >= 400 &&
        wrongVersionResult.body.includes("dispatch version") &&
        (await claimCount(admin, human.effectRequestId)) === 0,
    );
    const humanResult = await invokeEffect(
      `${tenantA}:${human.effectRequestId}:${humanVersion}`,
      {
        dispatchVersion: humanVersion,
        effectRequestId: human.effectRequestId,
        tenantId: tenantA,
      },
    );
    observe(
      "humanEffectFailsTerminalWithoutGenericConnector",
      humanResult.status >= 400 &&
        humanResult.body.includes("human-executor") &&
        (await claimCount(admin, human.effectRequestId)) === 0 &&
        (await providerOperation(human.idempotencyKey)) === undefined,
    );

    await stopProcess(worker);
    worker = await startWorker(workerIdentity, {
      artifactRevision: "effect-runtime-incompatible",
    });
    processes.push(worker);
    await waitFor(
      async () => (!(await registrarReady()) ? true : undefined),
      "registration rejection for incompatible handler artifact",
    );
    await expectRegistrationGateClosed("incompatible handler artifact");
    observe(
      "incompatibleHandlerArtifactFailsRegistrationReadiness",
      (await registrarReady()) === false,
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const sourceCommit = gitHead(repositoryRoot);
    const manifest = {
      assertions,
      componentVersions: {
        handlerArtifact: registration.artifact,
        postgres: postgresVersion,
        restate: "1.7.2",
        sessionDoor: "better-auth",
      },
      credentialIds: {
        preClaimRevokedWorker: replacementWorkerCredential.credentialId,
        postClaimRevokedWorker: preClaimRecoveryCredential.credentialId,
        reconciler: reconcilerCredential.credentialId,
        revokedWorker: firstWorkerCredential.credentialId,
        worker: finalWorkerCredential.credentialId,
      },
      finishedAt: new Date().toISOString(),
      invocationIdentity: identity,
      registration,
      scenario: "effect-runtime",
      sourceCommit,
      startedAt,
      targets: {
        humanEffectRequestId: human.effectRequestId,
        normalEffectRequestId: normal.effectRequestId,
        postClaimCredentialRaceEffectRequestId:
          postClaimCredentialRace.effectRequestId,
        preClaimCredentialRaceEffectRequestId:
          preClaimCredentialRace.effectRequestId,
        retryableEffectRequestId: retryable.effectRequestId,
        truncatedResponseEffectRequestId: truncated.effectRequestId,
        unknownEffectRequestId: unknown.effectRequestId,
      },
      tenants: [tenantA, tenantB],
    };
    observe(
      "artifactCarriesAssertionsAndSourceCommit",
      sourceCommit.length >= 7 && Object.keys(assertions).length >= 12,
    );
    await writeScenarioArtifact(repositoryRoot, "effect-runtime", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    for (const process of processes.reverse()) {
      if (process.child.exitCode === null && process.child.signalCode === null) {
        await stopProcess(process);
      }
    }
    await stopAuthDoor(door);
  }
}

async function commitHumanEffect(
  action: ReturnType<typeof actionClient>,
  approver: ReturnType<typeof actionClient>,
  fixture: DefinitionFixture,
  label: string,
): Promise<{
  effectRequestId: string;
  idempotencyKey: string;
  operationId: string;
}> {
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
  await approveProposal(approver, proposed.proposal, {
    approvalId: `approval.effects.${label}`,
    expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
  });
  const committed = await action.commit({ operationId, proposalId });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.equal(committed.receipt?.effectRequestIds.length, 1);
  const effectRequestId = committed.receipt?.effectRequestIds[0];
  assert.ok(effectRequestId);
  return {
    effectRequestId,
    idempotencyKey: `idempotency.${tenantA}.${effectRequestId}`,
    operationId,
  };
}

function asHumanFixture(fixture: DefinitionFixture): DefinitionFixture {
  const actionNeedle = '"id":"inventory.requestStock"';
  const canonicalJson = fixture.canonicalJson.replace(
    actionNeedle,
    `"id":"${humanActionId}"`,
  );
  assert.notEqual(canonicalJson, fixture.canonicalJson);
  const digest = sha256(canonicalJson);
  return {
    ...fixture,
    actionId: humanActionId,
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: fixture.definition.definitionId,
      digest,
      revision: fixture.definition.revision,
    }),
    digest,
  };
}

async function expectRegistrationGateClosed(reason: string): Promise<void> {
  assert.equal(await registrarReady(), false, reason);
  await assert.rejects(
    () => dispatchOnce(tenantA, 300),
    /effect registration did not become ready/,
  );
}

async function exactRegistration(): Promise<
  z.infer<typeof registrationStateSchema>
> {
  const status = registrationStateSchema.parse(JSON.parse(await registerWorker()));
  const response = await fetch(
    `${restateAdmin}/deployments/${encodeURIComponent(status.deploymentId)}`,
  );
  const responseBody = await response.text();
  assert.equal(response.ok, true, responseBody);
  const deployment = deploymentSchema.parse(JSON.parse(responseBody) as unknown);
  const service = deployment.services[0];
  const handler = service?.handlers[0];
  assert.equal(deployment.services.length, 1);
  assert.equal(service?.name, "ZoenEffect");
  assert.equal(service?.ty, "VirtualObject");
  assert.equal(service?.handlers.length, 1);
  assert.equal(handler?.name, "execute");
  assert.equal(handler?.ty, "Exclusive");
  assert.equal(handler?.public, true);
  for (const metadata of [deployment.metadata, service?.metadata, handler?.metadata]) {
    assert.equal(metadata?.["zoen.owner"], "ontology");
    assert.equal(metadata?.["zoen.artifact"], status.artifact);
  }
  return status;
}

async function invokeEffect(
  key: string,
  body: {
    dispatchVersion: number;
    effectRequestId: string;
    tenantId: string;
  },
): Promise<{ body: string; status: number }> {
  const response = await fetch(
    `${restateIngress}/ZoenEffect/${encodeURIComponent(key)}/execute`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    },
  );
  return { body: await response.text(), status: response.status };
}

async function invokeConnectorWithCrossTenantRef(): Promise<Response> {
  const payload = "{}";
  return fetch(connectorUrl, {
    body: JSON.stringify({
      credentialRef: "secret.provider.b",
      effectRequestId: "effect.synthetic.cross-reference",
      idempotencyKey: "idempotency.synthetic.cross-reference",
      payloadBase64: Buffer.from(payload).toString("base64"),
      requestDigest: sha256(payload),
      tenantId: tenantA,
    }),
    headers: {
      authorization: `Bearer ${connectorCallerToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

async function credentialCount(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM workload_credentials",
  );
  return Number(result.rows[0]?.count);
}

async function credentialIdentityCount(
  admin: ReturnType<typeof adminClient>,
  workerCredentialId: string,
  reconcilerCredentialId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM workload_credentials
     WHERE credential_id = ANY($1::text[])
       AND ((credential_id = $2 AND workload_id = 'workload.effect-worker')
         OR (credential_id = $3 AND workload_id = 'workload.effect-reconciler'))`,
    [
      [workerCredentialId, reconcilerCredentialId],
      workerCredentialId,
      reconcilerCredentialId,
    ],
  );
  return Number(result.rows[0]?.count);
}

async function credentialExpired(
  admin: ReturnType<typeof adminClient>,
  credentialId: string,
): Promise<true | undefined> {
  const result = await admin.query<{ expired: boolean }>(
    `SELECT expires_at <= clock_timestamp() AS expired
     FROM workload_credentials
     WHERE credential_id = $1`,
    [credentialId],
  );
  return result.rows[0]?.expired ? true : undefined;
}

async function databaseNowMicros(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ now_micros: string }>(
    `SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000000)::bigint::text AS now_micros`,
  );
  const nowMicros = result.rows[0]?.now_micros;
  assert.ok(nowMicros, "database clock query must return a timestamp");
  return Number(nowMicros);
}

async function totalDispatchAttemptCount(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM effect_dispatch_attempts",
  );
  return Number(result.rows[0]?.count);
}

async function totalClaimCount(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM effect_attempt_claims",
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

async function claimCount(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
  tenantId = tenantA,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM effect_attempt_claims
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantId, effectRequestId],
  );
  return Number(result.rows[0]?.count);
}

async function latestKnowledgeCommitSequence(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
  effectRequestId: string,
): Promise<number> {
  const result = await admin.query<{ commit_sequence: string }>(
    `SELECT last_commit_sequence::text AS commit_sequence
     FROM effect_requests
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantId, effectRequestId],
  );
  assert.equal(result.rows.length, 1);
  const commitSequence = Number(result.rows[0]?.commit_sequence);
  assert.ok(Number.isSafeInteger(commitSequence) && commitSequence > 0);
  return commitSequence;
}

async function actionOperationCount(
  admin: ReturnType<typeof adminClient>,
  operationId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM action_operations
     WHERE tenant_id = $1 AND operation_id = $2`,
    [tenantA, operationId],
  );
  return Number(result.rows[0]?.count);
}

async function effectRequestCount(
  admin: ReturnType<typeof adminClient>,
  operationId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM effect_requests
     WHERE tenant_id = $1 AND operation_id = $2`,
    [tenantA, operationId],
  );
  return Number(result.rows[0]?.count);
}

async function attemptCounts(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
): Promise<{
  claims: number;
  dispatches: number;
  effectAttempts: number;
  schedulerAttempts: number;
}> {
  const result = await admin.query<{
    claims: string;
    dispatches: string;
    effect_attempts: string;
    scheduler_attempts: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM effect_attempt_claims WHERE tenant_id = $1 AND effect_request_id = $2) AS claims,
       (SELECT count(*)::text FROM effect_attempts WHERE tenant_id = $1 AND effect_request_id = $2) AS effect_attempts,
       (SELECT count(*)::text FROM effect_dispatches WHERE tenant_id = $1 AND effect_request_id = $2) AS dispatches,
       (SELECT count(*)::text FROM effect_dispatch_attempts WHERE tenant_id = $1 AND effect_request_id = $2) AS scheduler_attempts`,
    [tenantA, effectRequestId],
  );
  const row = result.rows[0];
  return {
    claims: Number(row?.claims),
    dispatches: Number(row?.dispatches),
    effectAttempts: Number(row?.effect_attempts),
    schedulerAttempts: Number(row?.scheduler_attempts),
  };
}

async function effectIdentity(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
): Promise<EffectIdentityEvidence> {
  const result = await admin.query<EffectIdentityRow>(
    `SELECT
       request.effect_request_id,
       request.tenant_id,
       request.operation_id,
       request.idempotency_key,
       request.request_digest AS effect_request_digest,
       dispatch.knowledge_commit_sequence::text AS dispatch_version,
       dispatch.restate_invocation_id,
       claim.attempt_id,
       claim.adapter_execution_id,
       claim.claimed_workload_id,
       attempt.request_digest AS attempt_request_digest,
       attempt.provider_operation_id,
       attempt.result_kind
     FROM effect_requests AS request
     JOIN effect_dispatches AS dispatch
       ON dispatch.tenant_id = request.tenant_id
      AND dispatch.effect_request_id = request.effect_request_id
     JOIN effect_attempt_claims AS claim
       ON claim.tenant_id = request.tenant_id
      AND claim.effect_request_id = request.effect_request_id
     JOIN effect_attempts AS attempt
       ON attempt.tenant_id = claim.tenant_id
      AND attempt.effect_request_id = claim.effect_request_id
      AND attempt.attempt_id = claim.attempt_id
     WHERE request.tenant_id = $1 AND request.effect_request_id = $2`,
    [tenantA, effectRequestId],
  );
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.ok(row);
  return {
    ...row,
    restate_object_key: `${row.tenant_id}:${row.effect_request_id}:${row.dispatch_version}`,
  };
}

async function withCredentialRowHeld(
  credentialId: string,
  whileHeld: () => Promise<void>,
): Promise<void> {
  const held = await holdDatabaseLock(async (locker) => {
    const locked = await locker.query(
      `SELECT credential_id
       FROM workload_credentials
       WHERE credential_id = $1
       FOR UPDATE`,
      [credentialId],
    );
    assert.equal(locked.rowCount, 1);
  });
  try {
    await whileHeld();
  } finally {
    await held.release();
  }
}

async function suspendValidatorAtFreshCredentialMarker(
  identity: WorkloadIdentity,
  validator: ManagedProcess,
): Promise<void> {
  assert.ok(validator.processGroupId !== undefined);
  await rm(effectWorkerReadyFile, { force: true });
  await waitForCredentialReady(identity, validator);
  suspendProcess(validator);
}

async function blockedWorkloadQueryCount(
  admin: ReturnType<typeof adminClient>,
  marker: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM pg_stat_activity
     WHERE datname = current_database()
       AND usename = 'zoen_app'
       AND wait_event_type = 'Lock'
       AND query LIKE $1`,
    [`%${marker}%`],
  );
  return Number(result.rows[0]?.count);
}

async function holdAuthorityHead(tenantId: string): Promise<HeldDatabaseLock> {
  return holdDatabaseLock(async (locker) => {
    const locked = await locker.query(
      `SELECT commit_sequence
       FROM authority_heads
       WHERE tenant_id = $1
       FOR UPDATE`,
      [tenantId],
    );
    assert.equal(locked.rowCount, 1);
  });
}

function holdWorkloadSecretReads(): Promise<HeldDatabaseLock> {
  return holdDatabaseLock(async (locker) => {
    await locker.query(
      "LOCK TABLE workload_secrets IN ACCESS EXCLUSIVE MODE",
    );
  });
}

interface HeldDatabaseLock {
  release: () => Promise<void>;
}

async function holdDatabaseLock(
  acquire: (locker: ReturnType<typeof adminClient>) => Promise<void>,
): Promise<HeldDatabaseLock> {
  const locker = adminClient();
  await locker.connect();
  try {
    await locker.query("BEGIN");
    await acquire(locker);
  } catch (error: unknown) {
    try {
      await locker.query("ROLLBACK");
    } catch {
      // Closing the connection below also releases every held lock.
    }
    await locker.end();
    throw error;
  }
  let released = false;
  return {
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      try {
        await locker.query("COMMIT");
      } finally {
        await locker.end();
      }
    },
  };
}

async function blockedAuthorityHeadClaimCount(
  admin: ReturnType<typeof adminClient>,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM pg_stat_activity
     WHERE datname = current_database()
       AND usename = 'zoen_app'
       AND wait_event_type = 'Lock'
       AND query LIKE '%FROM authority_heads%'
       AND query LIKE '%FOR UPDATE%'`,
  );
  return Number(result.rows[0]?.count);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
