import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  connectorFaultBoundaryUrl,
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
  registrarStatus,
  repositoryRoot,
  requestWorkloadCredential,
  restateAdmin,
  restateIngress,
  recreateRestateContainer,
  revokeWorkloadCredential,
  setProviderMode,
  startConnector,
  startCredentialValidator,
  startEffectDispatcher,
  startEffectRegistrar,
  startFaultProvider,
  startRestate,
  startWorker,
  stopProcess,
  stopRestate,
  suspendProcess,
  tenantA,
  tenantB,
  terminateProcess,
  resumeProcess,
  waitFor,
  waitForCredentialReady,
  worldClient,
  writeEffectWorkerApiKey,
  writeEffectWorkerApiKeyValue,
  zoenBaseUrl,
  type IssuedWorkloadCredential,
  type ManagedProcess,
  type WorkloadIdentity,
} from "./effect-support.js";
import {
  proveProductReadiness,
  startReadyZoend,
} from "./effect-readiness.js";
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
const registrationProbeStateSchema = z
  .object({
    artifact: z.string().min(1),
    deploymentId: z.string().min(1).optional(),
    ready: z.boolean(),
    reason: z.string().min(1),
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
const buildAArtifact = "effect-runtime-build-a";
const buildBArtifact = "effect-runtime-build-b";

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

interface EffectRetrySchedule {
  knowledgeState: string;
  nextEligibleAt: Date | null;
  retryCount: number;
  updatedAt: Date;
}

type JourneyObserve = (name: string, value: boolean) => void;

type ExactRegistration = Awaited<ReturnType<typeof exactRegistration>>;

type CommittedEffect = Awaited<ReturnType<typeof commitEffect>>;

type CommittedHumanEffect = Awaited<ReturnType<typeof commitHumanEffect>>;

type TrackedEffectIdentity = Awaited<ReturnType<typeof effectIdentity>>;

type JourneyEffectClient = ReturnType<typeof effectClient>;

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

  let door = await startAuthDoor(authDatabaseUrl);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  const assertions: Record<string, boolean> = {};
  const observe = (name: string, value: boolean): void => {
    assert.ok(value, name);
    assertions[name] = true;
  };
  let zoend = await startReadyZoend(policyManifestPath);
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

    const drained = await proveConnectorSigtermDrain({ observe, processes });
    let connector = drained.connector;
    const gates = await proveCredentialIssuanceGates({
      admin,
      adminAToken,
      agentAToken,
      observe,
      processes,
      workerIdentity,
    });
    let registrar = gates.registrar;
    const validator = gates.validator;

    const matrix = await proveRegistrationMatrix({
      admin,
      adminAToken,
      adminBToken,
      observe,
      processes,
      registrar,
      validator,
      workerBIdentity,
      workerIdentity,
    });
    const firstWorkerCredential = matrix.firstWorkerCredential;
    const initialDeploymentId = matrix.initialDeploymentId;
    registrar = matrix.registrar;
    let registration = matrix.registration;
    let worker = matrix.worker;

    const chain = await proveNormalDispatchChain({
      admin,
      adminAToken,
      adminBToken,
      agentAToken,
      agentBToken,
      firstWorkerCredential,
      fixture,
      humanFixture,
      observe,
      validator,
      workerIdentity,
    });
    const identity = chain.identity;
    const normal = chain.normal;
    const replacementWorkerCredential = chain.replacementWorkerCredential;

    const readiness = await proveProductReadiness({
      admin,
      door,
      observe,
      policyManifestPath,
      processes,
      registrar,
      workerIdentity,
      zoend,
    });
    door = readiness.door;
    registrar = readiness.registrar;
    zoend = readiness.zoend;

    const convergence = await proveRetryConvergenceAcrossRestarts({
      admin,
      agentAToken,
      connector,
      fixture,
      observe,
      policyManifestPath,
      processes,
      replacementWorkerCredential,
      validator,
      worker,
      workerIdentity,
      zoend,
    });
    connector = convergence.connector;
    let dispatcher = convergence.dispatcher;
    const retryable = convergence.retryable;
    worker = convergence.worker;
    zoend = convergence.zoend;

    const backoff = await proveManualRetryBackoffBoundary({
      admin,
      agentAToken,
      connector,
      dispatcher,
      fixture,
      observe,
      processes,
    });
    connector = backoff.connector;
    dispatcher = backoff.dispatcher;
    const manualRetry = backoff.manualRetry;

    const transientRecovery = await proveConnectorTransientRecovery({
      admin,
      agentAToken,
      connector,
      dispatcher,
      fixture,
      observe,
      processes,
      worker,
      workerIdentity,
    });
    connector = transientRecovery.connector;
    const transient = transientRecovery.transient;
    worker = transientRecovery.worker;

    const reconciliation = await proveUnknownOutcomeReconciliation({
      admin,
      adminAToken,
      agentAToken,
      fixture,
      observe,
      reconcilerIdentity,
      replacementWorkerCredential,
      workerIdentity,
    });
    const reconciler = reconciliation.reconciler;
    const reconcilerCredential = reconciliation.reconcilerCredential;
    const unknown = reconciliation.unknown;
    const workerEffect = reconciliation.workerEffect;

    const truncatedRecovery = await proveTruncatedResponseRecovery({
      admin,
      agentAToken,
      fixture,
      observe,
      reconciler,
      workerEffect,
    });
    const truncated = truncatedRecovery.truncated;

    const preClaim = await provePreClaimCredentialLossRecovery({
      admin,
      adminAToken,
      agentAToken,
      fixture,
      observe,
      replacementWorkerCredential,
      validator,
      workerEffect,
      workerIdentity,
    });
    const preClaimCredentialRace = preClaim.preClaimCredentialRace;
    const preClaimRecoveryCredential = preClaim.preClaimRecoveryCredential;

    const postClaim = await provePostClaimCredentialRevival({
      admin,
      adminAToken,
      agentAToken,
      fixture,
      observe,
      preClaimRecoveryCredential,
      validator,
      workerIdentity,
    });
    const finalWorkerCredential = postClaim.finalWorkerCredential;
    const postClaimCredentialRace = postClaim.postClaimCredentialRace;

    await proveTerminalInvocationBoundary({
      admin,
      agentBToken,
      fixture,
      observe,
    });

    const forbidden = await proveDelegatedClaimAuthorization({
      admin,
      adminAToken,
      agentAToken,
      finalWorkerCredential,
      fixture,
      observe,
      policyManifestPath,
      processes,
      validator,
      workerIdentity,
      zoend,
    });
    zoend = forbidden.zoend;

    const evolution = await proveHumanTerminalAndDeploymentEvolution({
      admin,
      agentAToken,
      approverAToken,
      humanFixture,
      initialDeploymentId,
      observe,
      processes,
      registrar,
      registration,
      worker,
      workerIdentity,
    });
    const human = evolution.human;
    const persistedBuildBUri = evolution.persistedBuildBUri;
    registrar = evolution.registrar;
    registration = evolution.registration;
    worker = evolution.worker;

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
      deploymentEvolution: {
        buildAArtifact,
        buildBArtifact,
        deploymentId: registration.deploymentId,
        uri: persistedBuildBUri,
      },
      dimensions: {
        actors:
          "the configured World is activated by its durable Owner Membership through the governed CLI before zoend evaluates readiness",
        isolation:
          "corrupting another World's distinct active PolicyCatalog leaves the configured World's readiness unchanged",
        negative:
          "broken bootstrap Cedar, missing or corrupt active release authority, and missing, corrupt, or unloadable release-bound catalogs fail readiness closed",
        path:
          "governed WorldRelease activation -> one-statement active release and four-catalog snapshot -> fresh Cedar compilation -> /ready",
        recovery:
          "governed CLI activation restores a deleted active pointer; dependency, Restate, and zoend restarts converge only after exact authority recovers",
        replay:
          "identical governed activation reports replay and concurrent readiness probes do not mutate release authority",
      },
      finishedAt: new Date().toISOString(),
      invocationIdentity: identity,
      journeys: ["J8"],
      readinessAuthority: readiness.authority,
      registration,
      scenario: "effect-runtime",
      sourceCommit,
      startedAt,
      canonicalJourneyVerdict: "NOT_EVALUATED",
      journeyCoverage: {
        J6: {
          proofPending: [
            "a generic AutomationDefinition creating exactly two content-addressed ExecutorCall records",
            "each ExecutorCall delivering once through its verified conversation origin",
          ],
          proven: [
            "production ZoenEffect dispatches a durable EffectRequest through Restate",
            "Restate resumes one invocation after restart without a second provider operation",
            "an ambiguous provider outcome is reconciled before another effect",
          ],
          status: "SUBSTRATE_ONLY",
        },
        J8: {
          proofPending: [
            "the complete J8 ceremony on one production image after every product dependency lands",
          ],
          proven: [
            "ZoenEffect registration survives a Restate container recreation on its persistent volume",
            "readiness verifies the exact active release, publication, and four bound catalog blobs without mutation",
            "broken bootstrap Cedar and release-bound catalogs fail closed while another World's corruption remains isolated",
            "missing handler and runtime dependencies fail readiness closed",
            "dispatcher, handler, Restate, connector, and zoend restart recovery converges",
          ],
          status: "SUBSTRATE_ONLY",
        },
      },
      targets: {
        humanEffectRequestId: human.effectRequestId,
        normalEffectRequestId: normal.effectRequestId,
        postClaimCredentialRaceEffectRequestId:
          postClaimCredentialRace.effectRequestId,
        preClaimCredentialRaceEffectRequestId:
          preClaimCredentialRace.effectRequestId,
        retryableEffectRequestId: retryable.effectRequestId,
        manualRetryEffectRequestId: manualRetry.effectRequestId,
        transientConnectorEffectRequestId: transient.effectRequestId,
        truncatedResponseEffectRequestId: truncated.effectRequestId,
        unknownEffectRequestId: unknown.effectRequestId,
      },
      tenants: [tenantA, tenantB],
    };
    observe(
      "artifactCarriesAssertionsAndSourceCommit",
      sourceCommit.length >= 7 && Object.keys(assertions).length >= 12,
    );
    observe(
      "artifactDeclaresCanonicalJourneyBoundary",
      manifest.canonicalJourneyVerdict === "NOT_EVALUATED" &&
        manifest.journeyCoverage.J6.status === "SUBSTRATE_ONLY" &&
        manifest.journeyCoverage.J8.status === "SUBSTRATE_ONLY" &&
        manifest.journeyCoverage.J6.proofPending.length > 0 &&
        manifest.journeyCoverage.J8.proofPending.length > 0,
    );
    await writeScenarioArtifact(repositoryRoot, "effect-runtime", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    processes.reverse();
    for (const process of processes) {
      if (process.child.exitCode === null && process.child.signalCode === null) {
        await stopProcess(process);
      }
    }
    await stopAuthDoor(door);
  }
}

async function proveTerminalInvocationBoundary(input: {
  admin: ReturnType<typeof adminClient>;
  agentBToken: string;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
}): Promise<void> {
  const { admin, agentBToken, fixture, observe } = input;
  const actionB = actionClient(agentBToken, tenantB);
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
}

async function proveDelegatedClaimAuthorization(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  agentAToken: string;
  finalWorkerCredential: IssuedWorkloadCredential;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  policyManifestPath: string;
  processes: ManagedProcess[];
  validator: ManagedProcess;
  workerIdentity: WorkloadIdentity;
  zoend: ManagedProcess;
}): Promise<{ zoend: ManagedProcess }> {
  const {
    admin,
    adminAToken,
    agentAToken,
    finalWorkerCredential,
    fixture,
    observe,
    policyManifestPath,
    processes,
    validator,
    workerIdentity,
  } = input;
  let { zoend } = input;
  const actionA = actionClient(agentAToken, tenantA);
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
  zoend = await startReadyZoend(policyManifestPath, {
    effectWorkerWorkloadId: "workload.effect-worker-denied",
  });
  processes.push(zoend);
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: finalWorkerCredential.credentialId,
    process: validator,
  });
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
  zoend = await startReadyZoend(policyManifestPath);
  processes.push(zoend);
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: finalWorkerCredential.credentialId,
    process: validator,
  });
  await exactRegistration();
  return { zoend };
}

async function proveHumanTerminalAndDeploymentEvolution(input: {
  admin: ReturnType<typeof adminClient>;
  agentAToken: string;
  approverAToken: string;
  humanFixture: DefinitionFixture;
  initialDeploymentId: string;
  observe: JourneyObserve;
  processes: ManagedProcess[];
  registrar: ManagedProcess;
  registration: ExactRegistration;
  worker: ManagedProcess;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  human: CommittedHumanEffect;
  persistedBuildBUri: string;
  registrar: ManagedProcess;
  registration: ExactRegistration;
  worker: ManagedProcess;
}> {
  const {
    admin,
    agentAToken,
    approverAToken,
    humanFixture,
    initialDeploymentId,
    observe,
    processes,
    workerIdentity,
  } = input;
  let { registrar, registration, worker } = input;
  const actionA = actionClient(agentAToken, tenantA);
  const approverA = actionClient(approverAToken, tenantA);
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

  await stopProcess(registrar);
  await stopProcess(worker);
  await recreateRestateContainer();
  const persistedBuildA = await waitForRestateDeployment(
    registration.deploymentId,
  );
  assertDeploymentArtifact(persistedBuildA, buildAArtifact);
  worker = await startWorker(workerIdentity, {
    artifactRevision: buildBArtifact,
  });
  processes.push(worker);
  registrar = await startEffectRegistrar(workerIdentity);
  processes.push(registrar);
  registration = await exactRegistration();
  const persistedBuildB = await restateDeployment(registration.deploymentId);
  assertDeploymentArtifact(persistedBuildB, buildBArtifact);
  observe(
    "persistedRestateDeploymentUpdatesBuildAToBOnTheSameVolume",
    registration.deploymentId === initialDeploymentId &&
      persistedBuildB.id === persistedBuildA.id &&
      persistedBuildB.uri === persistedBuildA.uri,
  );

  const incompatibleUri = new URL(persistedBuildB.uri);
  incompatibleUri.searchParams.set("deployment", "foreign");
  const uriProviderStats = await providerStats();
  await overwriteDeploymentMetadata({
    deploymentId: registration.deploymentId,
    metadata: persistedBuildB.metadata,
    uri: incompatibleUri.href,
  });
  await waitForRegistrationReason("deployment URI does not match");
  await expectRegistrationGateClosed("incompatible deployment URI");
  const uriProviderStatsAfter = await providerStats();
  observe(
    "incompatibleDeploymentUriIsNeverForceReclaimed",
    uriProviderStatsAfter.operations === uriProviderStats.operations &&
      uriProviderStatsAfter.requests === uriProviderStats.requests,
  );
  await overwriteDeploymentMetadata({
    deploymentId: registration.deploymentId,
    metadata: persistedBuildB.metadata,
    uri: persistedBuildB.uri,
  });
  registration = await exactRegistration();

  const ownershipProviderStats = await providerStats();
  await overwriteDeploymentMetadata({
    deploymentId: registration.deploymentId,
    metadata: {
      "zoen.artifact": buildBArtifact,
      "zoen.owner": "foreign",
    },
    uri: persistedBuildB.uri,
  });
  await waitForRegistrationReason("deployment owner metadata does not match");
  await expectRegistrationGateClosed("foreign deployment ownership");
  const ownershipProviderStatsAfter = await providerStats();
  observe(
    "incompatibleDeploymentOwnershipIsNeverForceReclaimed",
    ownershipProviderStatsAfter.operations ===
      ownershipProviderStats.operations &&
      ownershipProviderStatsAfter.requests === ownershipProviderStats.requests,
  );
  return {
    human,
    persistedBuildBUri: persistedBuildB.uri,
    registrar,
    registration,
    worker,
  };
}

async function rotatePreClaimCredential(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  preClaim: CommittedEffect;
  replacementWorkerCredential: IssuedWorkloadCredential;
  validator: ManagedProcess;
  workerEffect: JourneyEffectClient;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  acceptedWithoutClaimBeforeCredentialLoss: boolean;
  credential: IssuedWorkloadCredential;
  revokedWorkerSessionWasInvalidated: boolean;
}> {
  const {
    admin,
    adminAToken,
    preClaim,
    replacementWorkerCredential,
    validator,
    workerEffect,
    workerIdentity,
  } = input;
  const pending: { revoke?: Promise<void> } = {};
  let acceptedWithoutClaimBeforeCredentialLoss = false;
  let revokedWorkerSessionWasInvalidated = false;
  let credential: IssuedWorkloadCredential;
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
          preClaim.effectRequestId,
        );
        acceptedWithoutClaimBeforeCredentialLoss =
          heldCounts.dispatches === 1 &&
          heldCounts.schedulerAttempts === 1 &&
          heldCounts.claims === 0 &&
          heldCounts.effectAttempts === 0 &&
          (await providerOperation(preClaim.idempotencyKey)) === undefined;
      },
    );
    assert.ok(pending.revoke);
    await pending.revoke;
    revokedWorkerSessionWasInvalidated =
      (await expectConnectCode(
        () =>
          workerEffect.getEffect({
            effectRequestId: preClaim.effectRequestId,
          }),
        Code.Unauthenticated,
      )) === Code.Unauthenticated;
    credential = await issueWorkloadCredential(adminAToken, workerIdentity);
    await writeEffectWorkerApiKey(credential);
  } finally {
    resumeProcess(validator);
  }
  return {
    acceptedWithoutClaimBeforeCredentialLoss,
    credential,
    revokedWorkerSessionWasInvalidated,
  };
}

async function provePreClaimCredentialLossRecovery(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  agentAToken: string;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  replacementWorkerCredential: IssuedWorkloadCredential;
  validator: ManagedProcess;
  workerEffect: JourneyEffectClient;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  preClaimCredentialRace: CommittedEffect;
  preClaimRecoveryCredential: IssuedWorkloadCredential;
}> {
  const {
    admin,
    adminAToken,
    agentAToken,
    fixture,
    observe,
    replacementWorkerCredential,
    validator,
    workerEffect,
    workerIdentity,
  } = input;
  const actionA = actionClient(agentAToken, tenantA);
  const effectA = effectClient(agentAToken, tenantA);
  await setProviderMode("confirmed");
  const preClaimCredentialRace = await commitEffect(
    actionA,
    fixture,
    "credential-loss-before-claim",
  );
  await suspendValidatorAtFreshCredentialMarker(
    workerIdentity,
    validator,
    replacementWorkerCredential.credentialId,
  );
  const rotation = await rotatePreClaimCredential({
    admin,
    adminAToken,
    preClaim: preClaimCredentialRace,
    replacementWorkerCredential,
    validator,
    workerEffect,
    workerIdentity,
  });
  const preClaimRecoveryCredential = rotation.credential;
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: preClaimRecoveryCredential.credentialId,
    process: validator,
  });
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
    rotation.acceptedWithoutClaimBeforeCredentialLoss &&
      rotation.revokedWorkerSessionWasInvalidated &&
      preClaimRaceCounts.dispatches === 1 &&
      preClaimRaceCounts.schedulerAttempts === 1 &&
      preClaimRaceCounts.claims === 1 &&
      preClaimRaceCounts.effectAttempts === 1 &&
      preClaimRaceProvider.requests === 1,
  );
  return { preClaimCredentialRace, preClaimRecoveryCredential };
}

async function rotatePostClaimCredential(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  postClaim: CommittedEffect;
  preClaimRecoveryCredential: IssuedWorkloadCredential;
  validator: ManagedProcess;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  credential: IssuedWorkloadCredential;
  stoppedProvider: boolean;
}> {
  const {
    admin,
    adminAToken,
    postClaim,
    preClaimRecoveryCredential,
    validator,
    workerIdentity,
  } = input;
  let stoppedProvider = false;
  let credential: IssuedWorkloadCredential;
  try {
    const authorityHead = await holdAuthorityHead(tenantA);
    try {
      await dispatchOnce();
      await waitFor(
        async () =>
          (await blockedAuthorityHeadClaimCount(admin)) > 0 ? true : undefined,
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
        stoppedProvider =
          (await registrarReady()) &&
          (await claimCount(admin, postClaim.effectRequestId)) === 1 &&
          (await providerOperation(postClaim.idempotencyKey)) === undefined;
      } finally {
        await secretReads.release();
      }
    } finally {
      await authorityHead.release();
    }
    credential = await issueWorkloadCredential(adminAToken, workerIdentity);
    await writeEffectWorkerApiKey(credential);
  } finally {
    resumeProcess(validator);
  }
  return { credential, stoppedProvider };
}

async function provePostClaimCredentialRevival(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  agentAToken: string;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  preClaimRecoveryCredential: IssuedWorkloadCredential;
  validator: ManagedProcess;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  finalWorkerCredential: IssuedWorkloadCredential;
  postClaimCredentialRace: CommittedEffect;
}> {
  const {
    admin,
    adminAToken,
    agentAToken,
    fixture,
    observe,
    preClaimRecoveryCredential,
    validator,
    workerIdentity,
  } = input;
  const actionA = actionClient(agentAToken, tenantA);
  const effectA = effectClient(agentAToken, tenantA);
  const postClaimCredentialRace = await commitEffect(
    actionA,
    fixture,
    "credential-revoked-after-claim-authorization",
  );
  await suspendValidatorAtFreshCredentialMarker(
    workerIdentity,
    validator,
    preClaimRecoveryCredential.credentialId,
  );
  const rotation = await rotatePostClaimCredential({
    admin,
    adminAToken,
    postClaim: postClaimCredentialRace,
    preClaimRecoveryCredential,
    validator,
    workerIdentity,
  });
  const finalWorkerCredential = rotation.credential;
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: finalWorkerCredential.credentialId,
    process: validator,
  });
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
    rotation.stoppedProvider &&
      postClaimRaceCounts.dispatches === 1 &&
      postClaimRaceCounts.schedulerAttempts === 1 &&
      postClaimRaceCounts.claims === 1 &&
      postClaimRaceCounts.effectAttempts === 1 &&
      postClaimRaceProvider.requests === 1,
  );
  return { finalWorkerCredential, postClaimCredentialRace };
}

async function proveUnknownOutcomeReconciliation(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  agentAToken: string;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  reconcilerIdentity: WorkloadIdentity;
  replacementWorkerCredential: IssuedWorkloadCredential;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  reconciler: JourneyEffectClient;
  reconcilerCredential: IssuedWorkloadCredential;
  unknown: CommittedEffect;
  workerEffect: JourneyEffectClient;
}> {
  const {
    admin,
    adminAToken,
    agentAToken,
    fixture,
    observe,
    reconcilerIdentity,
    replacementWorkerCredential,
    workerIdentity,
  } = input;
  const actionA = actionClient(agentAToken, tenantA);
  const effectA = effectClient(agentAToken, tenantA);
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
  return { reconciler, reconcilerCredential, unknown, workerEffect };
}

async function proveTruncatedResponseRecovery(input: {
  admin: ReturnType<typeof adminClient>;
  agentAToken: string;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  reconciler: JourneyEffectClient;
  workerEffect: JourneyEffectClient;
}): Promise<{ truncated: CommittedEffect }> {
  const { admin, agentAToken, fixture, observe, reconciler, workerEffect } =
    input;
  const actionA = actionClient(agentAToken, tenantA);
  const effectA = effectClient(agentAToken, tenantA);
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
  return { truncated };
}

async function proveManualRetryBackoffBoundary(input: {
  admin: ReturnType<typeof adminClient>;
  agentAToken: string;
  connector: ManagedProcess;
  dispatcher: ManagedProcess;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  processes: ManagedProcess[];
}): Promise<{
  connector: ManagedProcess;
  dispatcher: ManagedProcess;
  manualRetry: CommittedEffect;
}> {
  const { admin, agentAToken, dispatcher, fixture, observe, processes } = input;
  let { connector } = input;
  const actionA = actionClient(agentAToken, tenantA);
  await stopProcess(dispatcher);
  await stopProcess(connector);
  connector = await startConnector({
    providerUrl: "http://127.0.0.1:1/v1/operations",
  });
  processes.push(connector);
  await exactRegistration();
  const manualRetry = await commitEffect(
    actionA,
    fixture,
    "definitely-not-sent-manual",
  );
  const expectedPersistedRetryDelays = [1_000, 2_000, 4_000, 4_000];
  const persistedRetryDelays: number[] = [];
  for (const [index, expectedDelay] of
    expectedPersistedRetryDelays.entries()) {
    const retryCount = index + 1;
    const schedule = await waitFor(
      async () => {
        await dispatchOnce();
        const current = await effectRetrySchedule(
          admin,
          manualRetry.effectRequestId,
        );
        return current.retryCount === retryCount &&
          current.nextEligibleAt !== null
          ? current
          : undefined;
      },
      `definitely-not-sent retry schedule ${retryCount}`,
    );
    assert.ok(schedule.nextEligibleAt);
    const persistedDelay =
      schedule.nextEligibleAt.getTime() - schedule.updatedAt.getTime();
    assert.ok(persistedDelay >= expectedDelay - 100);
    persistedRetryDelays.push(persistedDelay);
    await delay(
      Math.max(0, schedule.nextEligibleAt.getTime() - Date.now() + 50),
    );
  }
  const manualRetrySchedule = await waitFor(
    async () => {
      await dispatchOnce();
      const schedule = await effectRetrySchedule(
        admin,
        manualRetry.effectRequestId,
      );
      return schedule.retryCount === 5 &&
        schedule.nextEligibleAt === null
        ? schedule
        : undefined;
    },
    "definitely-not-sent manual retry boundary",
    500,
  );
  const manualRetryCounts = await attemptCounts(
    admin,
    manualRetry.effectRequestId,
  );
  const manualAttemptTimes = await effectAttemptTimes(
    admin,
    manualRetry.effectRequestId,
  );
  const retryIntervals = manualAttemptTimes
    .slice(1)
    .map((attemptedAt, index) => {
      const previousAttempt = manualAttemptTimes[index];
      return previousAttempt === undefined
        ? 0
        : attemptedAt.getTime() - previousAttempt.getTime();
    });
  const minimumRetryIntervals = [900, 1_900, 3_900, 3_900];
  const restartedDispatcher = await startEffectDispatcher();
  processes.push(restartedDispatcher);
  await delay(750);
  const frozenManualRetryCounts = await attemptCounts(
    admin,
    manualRetry.effectRequestId,
  );
  observe(
    "definitelyNotSentBackoffTerminatesForManualRetry",
    manualRetrySchedule.knowledgeState === "definitely_not_sent" &&
      manualRetryCounts.claims === 5 &&
      manualRetryCounts.dispatches === 5 &&
      manualRetryCounts.effectAttempts === 5 &&
      manualRetryCounts.schedulerAttempts === 5 &&
      persistedRetryDelays.every(
        (delayMillis, index) =>
          delayMillis >=
            (expectedPersistedRetryDelays[index] ?? Number.POSITIVE_INFINITY) -
              100 &&
          delayMillis <=
            (expectedPersistedRetryDelays[index] ?? Number.NEGATIVE_INFINITY) +
              500,
      ) &&
      retryIntervals.length === minimumRetryIntervals.length &&
      retryIntervals.every(
        (interval, index) =>
          minimumRetryIntervals[index] !== undefined &&
          interval >= minimumRetryIntervals[index],
      ) &&
      JSON.stringify(frozenManualRetryCounts) ===
        JSON.stringify(manualRetryCounts) &&
      (await providerOperation(manualRetry.idempotencyKey)) === undefined,
  );
  return {
    connector,
    dispatcher: restartedDispatcher,
    manualRetry,
  };
}

async function proveConnectorTransientRecovery(input: {
  admin: ReturnType<typeof adminClient>;
  agentAToken: string;
  connector: ManagedProcess;
  dispatcher: ManagedProcess;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  processes: ManagedProcess[];
  worker: ManagedProcess;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  connector: ManagedProcess;
  transient: CommittedEffect;
  worker: ManagedProcess;
}> {
  const { admin, agentAToken, dispatcher, fixture, observe, processes } = input;
  const { workerIdentity } = input;
  let { connector, worker } = input;
  const actionA = actionClient(agentAToken, tenantA);
  const effectA = effectClient(agentAToken, tenantA);
  await stopProcess(connector);
  connector = await startConnector();
  processes.push(connector);
  await stopProcess(worker);
  worker = await startWorker(workerIdentity, {
    artifactRevision: buildAArtifact,
    connectorUrl: connectorFaultBoundaryUrl,
  });
  processes.push(worker);
  await exactRegistration();
  await setProviderMode("connector_transient_sequence");
  const transientStatsBefore = await providerStats();
  const transient = await commitEffect(
    actionA,
    fixture,
    "connector-transient-sequence",
  );
  const transientDispatchVersion = await latestKnowledgeCommitSequence(
    admin,
    tenantA,
    transient.effectRequestId,
  );
  await waitFor(
    async () =>
      (await providerStats()).connectorRetryableStatuses.length >=
      transientStatsBefore.connectorRetryableStatuses.length + 4
        ? true
        : undefined,
    "connector transient retries before Restate restart",
  );
  const transientInvocation = await lookupInvocation(
    transient.effectRequestId,
    transientDispatchVersion.toString(),
  );
  const transientCountsBeforeRestart = await attemptCounts(
    admin,
    transient.effectRequestId,
  );
  const transientStatsBeforeRestart = await providerStats();
  observe(
    "connectorTransientsRemainPendingUntilRestateRestart",
    transientCountsBeforeRestart.claims === 1 &&
      transientCountsBeforeRestart.dispatches === 1 &&
      transientCountsBeforeRestart.effectAttempts === 0 &&
      transientCountsBeforeRestart.schedulerAttempts === 1 &&
      (await providerOperation(transient.idempotencyKey)) === undefined &&
      JSON.stringify(
        transientStatsBeforeRestart.connectorRetryableStatuses.slice(
          transientStatsBefore.connectorRetryableStatuses.length,
          transientStatsBefore.connectorRetryableStatuses.length + 4,
        ),
      ) === JSON.stringify([408, 425, 429, 503]),
  );
  await stopRestate();
  await crashProcess(worker);
  await setProviderMode("confirmed");
  await startRestate();
  worker = await startWorker(workerIdentity, {
    artifactRevision: buildAArtifact,
    connectorUrl: connectorFaultBoundaryUrl,
  });
  processes.push(worker);
  await exactRegistration();
  await waitForState(
    effectA,
    transient.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  const transientProvider = await waitForProviderOperation(
    transient.idempotencyKey,
  );
  const transientCounts = await attemptCounts(
    admin,
    transient.effectRequestId,
  );
  const transientStatsAfter = await providerStats();
  const transientSchedule = await effectRetrySchedule(
    admin,
    transient.effectRequestId,
  );
  observe(
    "connectorTransientsRecoverInOneInvocationAcrossRestateRestart",
    transientCounts.claims === 1 &&
      transientCounts.dispatches === 1 &&
      transientCounts.effectAttempts === 1 &&
      transientCounts.schedulerAttempts === 1 &&
      transientSchedule.retryCount === 0 &&
      transientSchedule.nextEligibleAt === null &&
      transientStatsAfter.operations === transientStatsBefore.operations + 1 &&
      transientStatsAfter.requests === transientStatsBefore.requests + 1 &&
      transientStatsAfter.connectorRequests >=
        transientStatsBefore.connectorRequests + 5 &&
      transientProvider.requests === 1 &&
      (await lookupInvocation(
        transient.effectRequestId,
        transientDispatchVersion.toString(),
      )) === transientInvocation &&
      (await actionOperationCount(admin, transient.operationId)) === 1,
  );
  await stopProcess(dispatcher);
  await stopProcess(worker);
  worker = await startWorker(workerIdentity, {
    artifactRevision: buildAArtifact,
  });
  processes.push(worker);
  await exactRegistration();
  return { connector, transient, worker };
}

async function proveNormalDispatchChain(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  adminBToken: string;
  agentAToken: string;
  agentBToken: string;
  firstWorkerCredential: IssuedWorkloadCredential;
  fixture: DefinitionFixture;
  humanFixture: DefinitionFixture;
  observe: JourneyObserve;
  validator: ManagedProcess;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  identity: TrackedEffectIdentity;
  normal: CommittedEffect;
  replacementWorkerCredential: IssuedWorkloadCredential;
}> {
  const {
    admin,
    adminAToken,
    adminBToken,
    agentAToken,
    agentBToken,
    firstWorkerCredential,
    fixture,
    humanFixture,
    observe,
    validator,
    workerIdentity,
  } = input;
  const definitionAdmin = definitionClient(adminAToken, tenantA);
  const definitionAdminB = definitionClient(adminBToken, tenantB);
  const actionA = actionClient(agentAToken, tenantA);
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
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: replacementWorkerCredential.credentialId,
    process: validator,
  });
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
  return { identity, normal, replacementWorkerCredential };
}

async function proveRetryConvergenceAcrossRestarts(input: {
  admin: ReturnType<typeof adminClient>;
  agentAToken: string;
  connector: ManagedProcess;
  fixture: DefinitionFixture;
  observe: JourneyObserve;
  policyManifestPath: string;
  processes: ManagedProcess[];
  replacementWorkerCredential: IssuedWorkloadCredential;
  validator: ManagedProcess;
  worker: ManagedProcess;
  workerIdentity: WorkloadIdentity;
  zoend: ManagedProcess;
}): Promise<{
  connector: ManagedProcess;
  dispatcher: ManagedProcess;
  retryable: CommittedEffect;
  worker: ManagedProcess;
  zoend: ManagedProcess;
}> {
  const {
    admin,
    agentAToken,
    fixture,
    observe,
    policyManifestPath,
    processes,
    replacementWorkerCredential,
    validator,
    workerIdentity,
  } = input;
  let { connector, worker, zoend } = input;
  const actionA = actionClient(agentAToken, tenantA);
  const effectA = effectClient(agentAToken, tenantA);
  await stopProcess(connector);
  connector = await startConnector({
    providerUrl: "http://127.0.0.1:1/v1/operations",
  });
  processes.push(connector);
  await exactRegistration();
  let dispatcher = await startEffectDispatcher();
  processes.push(dispatcher);
  const retryable = await commitEffect(
    actionA,
    fixture,
    "definitely-not-sent",
  );
  await waitForState(
    effectA,
    retryable.effectRequestId,
    EffectKnowledgeState.DEFINITELY_NOT_SENT,
  );
  suspendProcess(dispatcher);
  const firstRetrySchedule = await effectRetrySchedule(
    admin,
    retryable.effectRequestId,
  );
  observe(
    "definitelyNotSentPersistsItsNextEligibleRetry",
    firstRetrySchedule.knowledgeState === "definitely_not_sent" &&
      firstRetrySchedule.retryCount === 1 &&
      firstRetrySchedule.nextEligibleAt !== null &&
      firstRetrySchedule.nextEligibleAt.getTime() -
        firstRetrySchedule.updatedAt.getTime() >=
        900 &&
      firstRetrySchedule.nextEligibleAt.getTime() -
        firstRetrySchedule.updatedAt.getTime() <=
        1_100 &&
      (await providerOperation(retryable.idempotencyKey)) === undefined,
  );

  await crashProcess(dispatcher);
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
  worker = await startWorker(workerIdentity, {
    artifactRevision: buildAArtifact,
  });
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
  zoend = await startReadyZoend(policyManifestPath);
  processes.push(zoend);
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: replacementWorkerCredential.credentialId,
    process: validator,
  });
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
  dispatcher = await startEffectDispatcher();
  processes.push(dispatcher);
  await waitForState(
    effectA,
    retryable.effectRequestId,
    EffectKnowledgeState.CONFIRMED,
  );
  const retriedProvider = await waitForProviderOperation(
    retryable.idempotencyKey,
  );
  const retryCounts = await attemptCounts(admin, retryable.effectRequestId);
  const completedRetrySchedule = await effectRetrySchedule(
    admin,
    retryable.effectRequestId,
  );
  observe(
    "continuousDispatcherRetryConvergesAcrossAllRuntimeRestarts",
    retryCounts.claims === 2 &&
      retryCounts.dispatches === 2 &&
      retryCounts.effectAttempts === 2 &&
      retryCounts.schedulerAttempts === 2 &&
      completedRetrySchedule.retryCount === 1 &&
      completedRetrySchedule.nextEligibleAt === null &&
      retriedProvider.requests === 1 &&
      (await actionOperationCount(admin, retryable.operationId)) === 1,
  );
  return { connector, dispatcher, retryable, worker, zoend };
}

async function proveConnectorSigtermDrain(input: {
  observe: JourneyObserve;
  processes: ManagedProcess[];
}): Promise<{ connector: ManagedProcess }> {
  const { observe, processes } = input;
  processes.push(await startFaultProvider());
  let connector = await startConnector({ timeoutMs: 3000 });
  processes.push(connector);
  await setProviderMode("hold_confirmed");
  const drainIdempotencyKey = "idempotency.synthetic.sigterm-drain";
  const drainingRequest = invokeConnector({
    credentialRef: "secret.provider.a",
    effectRequestId: "effect.synthetic.sigterm-drain",
    idempotencyKey: drainIdempotencyKey,
    tenantId: tenantA,
  });
  await waitForProviderOperation(drainIdempotencyKey);
  const [drainedResponse] = await Promise.all([
    drainingRequest,
    terminateProcess(connector),
  ]);
  const drainedBody = await drainedResponse.text();
  observe(
    "connectorDrainsInflightDeliveryOnSupervisorSigterm",
    drainedResponse.status === 200 &&
      drainedBody.includes('"kind":"confirmed"') &&
      (await providerOperation(drainIdempotencyKey))?.requests === 1,
  );
  await setProviderMode("confirmed");
  connector = await startConnector();
  processes.push(connector);
  return { connector };
}

async function proveCredentialIssuanceGates(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  agentAToken: string;
  observe: JourneyObserve;
  processes: ManagedProcess[];
  workerIdentity: WorkloadIdentity;
}): Promise<{ registrar: ManagedProcess; validator: ManagedProcess }> {
  const { admin, adminAToken, agentAToken, observe, processes, workerIdentity } =
    input;
  await prepareWorkerArtifact(buildAArtifact);
  const registrar = await startEffectRegistrar(workerIdentity);
  processes.push(registrar);

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
  return { registrar, validator };
}

async function proveRegistrationMatrix(input: {
  admin: ReturnType<typeof adminClient>;
  adminAToken: string;
  adminBToken: string;
  observe: JourneyObserve;
  processes: ManagedProcess[];
  registrar: ManagedProcess;
  validator: ManagedProcess;
  workerBIdentity: WorkloadIdentity;
  workerIdentity: WorkloadIdentity;
}): Promise<{
  firstWorkerCredential: IssuedWorkloadCredential;
  initialDeploymentId: string;
  registrar: ManagedProcess;
  registration: ExactRegistration;
  worker: ManagedProcess;
}> {
  const {
    admin,
    adminAToken,
    adminBToken,
    observe,
    processes,
    validator,
    workerBIdentity,
    workerIdentity,
  } = input;
  let { registrar } = input;
  const firstWorkerCredential = await issueWorkloadCredential(
    adminAToken,
    workerIdentity,
  );
  const sourceCredential = await issueWorkloadCredential(
    adminAToken,
    workerIdentity,
    {
      allowedIngress: [{ kind: "api_event", sourceClass: "rest" }],
    },
  );
  await proveWorkloadSignalBoundary(
    sourceCredential,
    firstWorkerCredential,
    workerIdentity,
    observe,
  );
  await revokeWorkloadCredential(
    adminAToken,
    sourceCredential.credentialId,
    tenantA,
  );
  await writeEffectWorkerApiKey(firstWorkerCredential);
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: firstWorkerCredential.credentialId,
    process: validator,
  });
  const worker = await startWorker(workerIdentity, {
    artifactRevision: buildAArtifact,
  });
  processes.push(worker);
  let registration = await exactRegistration();
  observe(
    "authorizedOperatorIssuesExactWorkerCredential",
    firstWorkerCredential.tenantId === tenantA &&
      firstWorkerCredential.principalId === workerIdentity.principalId &&
      registration.ready,
  );

  const initialDeploymentId = registration.deploymentId;
  const readinessProviderStats = await providerStats();
  await stopProcess(registrar);
  registrar = await startEffectRegistrar(workerIdentity, {
    callerToken: "wrong-connector-caller-token",
  });
  processes.push(registrar);
  await waitForRegistrationReason("HTTP 401");
  await expectRegistrationGateClosed("connector caller token mismatch");
  await stopProcess(registrar);
  registrar = await startEffectRegistrar(workerIdentity, {
    credentialRefs: { [tenantA]: "secret.provider.missing" },
  });
  processes.push(registrar);
  await waitForRegistrationReason("HTTP 424");
  await expectRegistrationGateClosed("connector credential ref missing");
  await stopProcess(registrar);
  registrar = await startEffectRegistrar(workerIdentity, {
    credentialRefs: { [tenantA]: "secret.provider.b" },
  });
  processes.push(registrar);
  await waitForRegistrationReason("HTTP 403");
  await expectRegistrationGateClosed("connector credential tenant mismatch");
  await stopProcess(registrar);
  registrar = await startEffectRegistrar(workerIdentity);
  processes.push(registrar);
  registration = await exactRegistration();
  const readinessProviderStatsAfter = await providerStats();
  observe(
    "connectorReadinessValidatesCallerTenantAndCredentialWithoutDelivery",
    registration.deploymentId === initialDeploymentId &&
      readinessProviderStatsAfter.operations ===
        readinessProviderStats.operations &&
      readinessProviderStatsAfter.requests === readinessProviderStats.requests,
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
  await waitForCredentialReady(workerIdentity, {
    expectedCredentialId: firstWorkerCredential.credentialId,
    process: validator,
  });
  await exactRegistration();

  const crossReferenceProviderRequests = (await providerStats()).requests;
  const crossReferenceResponse = await invokeConnectorWithCrossTenantRef();
  observe(
    "crossTenantConnectorCredentialReferenceFailsClosed",
    crossReferenceResponse.status === 403 &&
      (await claimCount(admin, "effect.synthetic.cross-reference")) === 0 &&
      (await providerStats()).requests === crossReferenceProviderRequests,
  );
  return {
    firstWorkerCredential,
    initialDeploymentId,
    registrar,
    registration,
    worker,
  };
}

async function proveWorkloadSignalBoundary(
  sourceCredential: IssuedWorkloadCredential,
  deniedCredential: IssuedWorkloadCredential,
  identity: WorkloadIdentity,
  observe: (name: string, value: boolean) => void,
): Promise<void> {
  const sourceHome = await mkdtemp(path.join(tmpdir(), "zoen-workload-boundary-"));
  const invalidApiKey = `zoen_wl_${"A".repeat(43)}`;
  const apiKeyPath = path.join(sourceHome, "workload.api-key");
  const environment = {
    ...process.env,
    ZOEN_ACTOR: identity.actorId,
    ZOEN_BEARER: "unused",
    ZOEN_PRINCIPAL: identity.principalId,
    ZOEN_SOURCE_HOME: sourceHome,
    ZOEN_TENANT: identity.tenantId,
    ZOEN_VALID_AT: new Date().toISOString(),
    ZOEN_WORKLOAD: identity.workloadId,
    ZOEN_ZOEND: zoenBaseUrl,
  };
  const runZoen = (arguments_: readonly string[]) => {
    const result = spawnSync(
      path.join(repositoryRoot, "target", "debug", "zoen"),
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
        timeout: 10_000,
      },
    );
    return {
      status: result.status,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    };
  };

  try {
    await writeFile(apiKeyPath, `${sourceCredential.apiKeyOnce}\n`, {
      mode: 0o600,
    });
    await chmod(apiKeyPath, 0o600);
    const connected = runZoen([
      "source",
      "connect",
      "rest",
      "--id",
      "workload-boundary",
      "--base",
      zoenBaseUrl,
    ]);
    assert.equal(connected.status, 0, connected.stderr);
    const introduced = runZoen([
      "source",
      "introduce",
      "workload-boundary",
      "--path",
      "/live",
    ]);
    assert.equal(introduced.status, 0, introduced.stderr);

    const synchronized = runZoen([
      "source",
      "sync",
      "workload-boundary",
    ]);
    const synchronizedDocument = z
      .object({ signalId: z.string().regex(/^wlsig\.[0-9a-f]{1,32}$/) })
      .passthrough()
      .parse(JSON.parse(synchronized.stdout) as unknown);
    observe(
      "workloadSignalSuccessIsCanonical",
      synchronized.status === 0 &&
        synchronized.stderr === "" &&
        synchronizedDocument.signalId.startsWith("wlsig."),
    );
    observe(
      "successfulWorkloadCredentialNeverReachesCommandOutput",
      !synchronized.stdout.includes(sourceCredential.apiKeyOnce) &&
        !synchronized.stderr.includes(sourceCredential.apiKeyOnce),
    );

    await writeFile(apiKeyPath, `${deniedCredential.apiKeyOnce}\n`);

    const exchangeToken = await exchangeWorkloadCredential(
      deniedCredential,
      identity,
    );
    const rawSignal = await fetch(new URL("/workload/signals", zoenBaseUrl), {
      body: JSON.stringify({
        durableEventId: "evt.workload-boundary.raw",
        payloadDigestRef: `sha256:${"0".repeat(64)}`,
        source: { class: "rest", externalId: "workload-boundary" },
        sourceDigestRef: `sha256:${"0".repeat(64)}`,
        trustDisposition: "evidence_candidate",
      }),
      headers: {
        authorization: `Bearer ${exchangeToken}`,
        "content-type": "application/json",
      },
      method: "PUT",
      signal: AbortSignal.timeout(10_000),
    });
    const rawSignalBody = await rawSignal.text();
    const rawSignalError = z
      .object({ error: z.string().min(1) })
      .parse(JSON.parse(rawSignalBody) as unknown).error;
    assert.equal(rawSignal.ok, false);

    const signalRejected = runZoen([
      "source",
      "sync",
      "workload-boundary",
    ]);
    observe(
      "workloadSignalFailureIsSanitized",
      signalRejected.status === 1 &&
        signalRejected.stdout === "" &&
        signalRejected.stderr.includes("workload signal was rejected"),
    );
    observe(
      "workloadCredentialNeverReachesCommandOutput",
      !signalRejected.stdout.includes(deniedCredential.apiKeyOnce) &&
        !signalRejected.stderr.includes(deniedCredential.apiKeyOnce),
    );
    observe(
      "workloadSignalBodyNeverReachesCommandOutput",
      !signalRejected.stdout.includes(rawSignalBody) &&
        !signalRejected.stderr.includes(rawSignalBody) &&
        !signalRejected.stdout.includes(rawSignalError) &&
        !signalRejected.stderr.includes(rawSignalError),
    );

    await writeFile(apiKeyPath, `${invalidApiKey}\n`);
    const rawAuthentication = await fetch(
      new URL("/workload/authenticate", zoenBaseUrl),
      {
        body: JSON.stringify({ apiKey: invalidApiKey }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const rawAuthenticationBody = await rawAuthentication.text();
    const rawAuthenticationError = z
      .object({ error: z.string().min(1) })
      .parse(JSON.parse(rawAuthenticationBody) as unknown).error;
    assert.equal(rawAuthentication.ok, false);

    const authenticationRejected = runZoen([
      "source",
      "sync",
      "workload-boundary",
    ]);
    observe(
      "workloadAuthenticationFailureIsSanitized",
      authenticationRejected.status === 1 &&
        authenticationRejected.stdout === "" &&
        authenticationRejected.stderr.includes(
          "workload authentication was rejected",
        ),
    );
    observe(
      "workloadApiKeyNeverReachesCommandOutput",
      !authenticationRejected.stdout.includes(invalidApiKey) &&
        !authenticationRejected.stderr.includes(invalidApiKey),
    );
    observe(
      "workloadResponseBodyNeverReachesCommandOutput",
      !authenticationRejected.stdout.includes(rawAuthenticationBody) &&
        !authenticationRejected.stderr.includes(rawAuthenticationBody) &&
        !authenticationRejected.stdout.includes(rawAuthenticationError) &&
        !authenticationRejected.stderr.includes(rawAuthenticationError),
    );
  } finally {
    await rm(sourceHome, { force: true, recursive: true });
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

async function waitForRegistrationReason(reason: string): Promise<void> {
  await waitFor(async () => {
    const state = registrationProbeStateSchema.parse(await registrarStatus());
    return !state.ready && state.reason.includes(reason) ? true : undefined;
  }, `registration blocker ${reason}`);
}

async function exactRegistration(): Promise<
  z.infer<typeof registrationStateSchema>
> {
  const status = registrationStateSchema.parse(JSON.parse(await registerWorker()));
  const deployment = await restateDeployment(status.deploymentId);
  assertDeploymentArtifact(deployment, status.artifact);
  return status;
}

async function restateDeployment(
  deploymentId: string,
): Promise<z.infer<typeof deploymentSchema>> {
  const response = await fetch(
    `${restateAdmin}/deployments/${encodeURIComponent(deploymentId)}`,
  );
  const responseBody = await response.text();
  assert.equal(response.ok, true, responseBody);
  const document: unknown = JSON.parse(responseBody);
  return deploymentSchema.parse(document);
}

function waitForRestateDeployment(
  deploymentId: string,
): Promise<z.infer<typeof deploymentSchema>> {
  return waitFor(async () => {
    try {
      return await restateDeployment(deploymentId);
    } catch {
      return undefined;
    }
  }, `persisted Restate deployment ${deploymentId}`);
}

function assertDeploymentArtifact(
  deployment: z.infer<typeof deploymentSchema>,
  artifact: string,
): void {
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
    assert.equal(metadata?.["zoen.artifact"], artifact);
  }
}

async function overwriteDeploymentMetadata(input: {
  deploymentId: string;
  metadata: Readonly<Record<string, string>>;
  uri: string;
}): Promise<void> {
  const response = await fetch(`${restateAdmin}/deployments`, {
    body: JSON.stringify({
      breaking: false,
      dry_run: false,
      force: true,
      metadata: input.metadata,
      uri: input.uri,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const responseBody = await response.text();
  assert.equal(response.ok, true, responseBody);
  const document: unknown = JSON.parse(responseBody);
  const registered = z
    .object({ id: z.string().min(1) })
    .passthrough()
    .parse(document);
  assert.equal(registered.id, input.deploymentId);
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

function invokeConnector(input: {
  credentialRef: string;
  effectRequestId: string;
  idempotencyKey: string;
  tenantId: string;
}): Promise<Response> {
  const payload = "{}";
  return fetch(connectorUrl, {
    body: JSON.stringify({
      credentialRef: input.credentialRef,
      effectRequestId: input.effectRequestId,
      idempotencyKey: input.idempotencyKey,
      payloadBase64: Buffer.from(payload).toString("base64"),
      requestDigest: sha256(payload),
      tenantId: input.tenantId,
    }),
    headers: {
      authorization: `Bearer ${connectorCallerToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function invokeConnectorWithCrossTenantRef(): Promise<Response> {
  return invokeConnector({
    credentialRef: "secret.provider.b",
    effectRequestId: "effect.synthetic.cross-reference",
    idempotencyKey: "idempotency.synthetic.cross-reference",
    tenantId: tenantA,
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

async function effectRetrySchedule(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
): Promise<EffectRetrySchedule> {
  const result = await admin.query<{
    knowledge_state: string;
    next_eligible_at: Date | null;
    retry_count: number;
    updated_at: Date;
  }>(
    `SELECT knowledge_state, next_eligible_at, retry_count, updated_at
     FROM effect_requests
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantA, effectRequestId],
  );
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.ok(row);
  assert.ok(Number.isInteger(row.retry_count));
  assert.ok(
    row.next_eligible_at === null || row.next_eligible_at instanceof Date,
  );
  assert.ok(row.updated_at instanceof Date);
  return {
    knowledgeState: row.knowledge_state,
    nextEligibleAt: row.next_eligible_at,
    retryCount: row.retry_count,
    updatedAt: row.updated_at,
  };
}

async function effectAttemptTimes(
  admin: ReturnType<typeof adminClient>,
  effectRequestId: string,
): Promise<Date[]> {
  const result = await admin.query<{ recorded_at: Date }>(
    `SELECT recorded_at
     FROM effect_attempts
     WHERE tenant_id = $1 AND effect_request_id = $2
     ORDER BY commit_sequence`,
    [tenantA, effectRequestId],
  );
  const attemptedAt = result.rows.map((row) => row.recorded_at);
  assert.ok(attemptedAt.every((timestamp) => timestamp instanceof Date));
  return attemptedAt;
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
  expectedCredentialId: string,
): Promise<void> {
  assert.ok(validator.processGroupId !== undefined);
  await rm(effectWorkerReadyFile, { force: true });
  await waitForCredentialReady(identity, {
    expectedCredentialId,
    process: validator,
  });
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

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
