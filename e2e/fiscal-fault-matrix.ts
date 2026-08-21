import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EffectKnowledgeState,
  type EffectSnapshot,
} from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  type SemanticQueryResponse,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  e2eGeneratedDirectory,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  actionClient,
  activateDefinition,
  adapterProviderUrl,
  adminClient,
  assertProviderNeutralSource,
  compileCommercialPackage,
  compileFiscalPackage,
  connectorStatusResponse,
  definitionClient,
  dispatchOnce,
  effectClient,
  expectConnectCode,
  explainOperation,
  fiscalPackageSource,
  fiscalProxyMetrics,
  historyClient,
  oidcToken,
  processOutputContains,
  proposalRequest,
  publishDefinition,
  recordFiscalEvidence,
  registerWorker,
  repositoryRoot,
  runLeakageGate,
  runRustLeakageMutant,
  setFiscalProxyMode,
  startConnector,
  startFiscalAdapter,
  startServer,
  startVendorFaultProxy,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writeFiscalPolicyManifest,
  type ActionClient,
  type FiscalFixture,
  type ManagedProcess,
  type SemanticValue,
  type WorldClient,
} from "./fiscal-fault-matrix/support.js";
import {
  connectorStatus,
} from "./effects/support.js";
import {
  delay,
  evidenceCounts,
  evidenceInput,
} from "./effects/scenario.js";

const scenario = "fiscal-fault-matrix";
const validAt = new Date("2026-08-21T15:00:00.000Z");
const connectorAdapterTimeoutMs = 5_000;
const vendorAdapterTimeoutMs = 10_000;
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

type CommittedFiscalEffect = {
  readonly effectRequestId: string;
  readonly idempotencyKey: string;
  readonly operationId: string;
};

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const [commercial, fiscal, repeatedFiscal, source] = await Promise.all([
    compileCommercialPackage(),
    compileFiscalPackage(),
    compileFiscalPackage(),
    fiscalPackageSource(),
  ]);
  assertProviderNeutralSource(source);
  observe(
    "fiscalPackageCompilesDeterministicallyWithFourCanonicalFamilies",
    fiscal.digest === repeatedFiscal.digest &&
      fiscal.canonicalJson === repeatedFiscal.canonicalJson &&
      fiscal.metadata.types.length > 0 &&
      fiscal.metadata.relations.length > 0 &&
      fiscal.metadata.computations.length > 0 &&
      fiscal.metadata.actions.length > 0,
  );
  observe(
    "commercialTaxIntentDocumentEventAndArtifactRemainDistinct",
    [
      "fiscal.TaxDetermination",
      "fiscal.FiscalIntent",
      "fiscal.FiscalDocument",
      "fiscal.FiscalEvent",
      "fiscal.FiscalArtifact",
    ].every((id) => source.includes(id)) &&
      commercial.metadata.definitionId === "commercial.sales" &&
      !source.includes("commercial.Invoice"),
  );

  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writeFiscalPolicyManifest(policyManifestPath, commercial, fiscal);

  const [
    adminAToken,
    adminBToken,
    fiscalAToken,
    fiscalBToken,
    workerAToken,
    workerBToken,
    reconcilerAToken,
  ] = await Promise.all([
    oidcToken("domain-admin-a"),
    oidcToken("domain-admin-b"),
    oidcToken("fiscal-agent-a"),
    oidcToken("fiscal-agent-b"),
    oidcToken("effect-worker-a"),
    oidcToken("effect-worker-b"),
    oidcToken("effect-reconciler-a"),
  ]);
  const definitionA = definitionClient(adminAToken);
  const definitionB = definitionClient(adminBToken);
  const fiscalActionA = actionClient(fiscalAToken);
  const effectA = effectClient(fiscalAToken);
  const reconcilerA = effectClient(reconcilerAToken);
  const worldA = worldClient(fiscalAToken);
  const worldB = worldClient(fiscalBToken);
  const historyA = historyClient(fiscalAToken);
  const admin = adminClient();
  const providerCredential = randomBytes(32).toString("hex");
  const adapterASecret = randomBytes(32).toString("hex");
  const adapterBSecret = randomBytes(32).toString("hex");
  const callerBindings = {
    [adapterASecret]: tenantA,
    [adapterBSecret]: tenantB,
  };
  const connectorCredentials = {
    "secret.provider.a": {
      secret: adapterASecret,
      tenantId: tenantA,
    },
    "secret.provider.b": {
      secret: adapterBSecret,
      tenantId: tenantB,
    },
  };

  const processes: ManagedProcess[] = [];
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let connector: ManagedProcess | undefined;
  let protheusAdapter: ManagedProcess | undefined;
  const waitForState = (
    client: ReturnType<typeof effectClient>,
    effectRequestId: string,
    expected: EffectKnowledgeState,
  ) =>
    waitForFiscalState({
      client,
      effectRequestId,
      expected,
      processes,
    });
  await admin.connect();

  try {
    server = await startServer(policyManifestPath);
    processes.push(await startVendorFaultProxy(providerCredential));
    const systaxAdapter = await startFiscalAdapter({
      callerBindings,
      provider: "systax",
      providerCredential,
      providerTimeoutMs: vendorAdapterTimeoutMs,
    });
    const plugNotasAdapter = await startFiscalAdapter({
      callerBindings,
      provider: "plugnotas",
      providerCredential,
      providerTimeoutMs: vendorAdapterTimeoutMs,
    });
    protheusAdapter = await startFiscalAdapter({
      callerBindings,
      provider: "protheus",
      providerCredential,
      providerTimeoutMs: vendorAdapterTimeoutMs,
    });
    processes.push(systaxAdapter, plugNotasAdapter, protheusAdapter);
    connector = await startConnector({
      credentials: connectorCredentials,
      providerUrl: adapterProviderUrl("systax"),
      timeoutMs: connectorAdapterTimeoutMs,
    });
    processes.push(connector);
    processes.push(
      await startWorker({
        [tenantA]: workerAToken,
        [tenantB]: workerBToken,
      }),
    );
    const registration = await registerWorker();
    observe(
      "realRestateWorkerRegistered",
      /ZoenEffect|deployment/iu.test(registration),
    );

    await Promise.all(
      [commercial, fiscal].flatMap((fixture) => [
        publishDefinition(definitionA, tenantA, fixture),
        publishDefinition(definitionB, tenantB, fixture),
      ]),
    );
    await Promise.all(
      [commercial, fiscal].flatMap((fixture) => [
        activateDefinition(definitionA, tenantA, fixture),
        activateDefinition(definitionB, tenantB, fixture),
      ]),
    );

    const taxValidation = await taxEffect({
      action: fiscalActionA,
      entityId: "fiscal.tax.validation",
      fiscal,
      label: "validation",
      world: worldA,
    });
    inject("systax-validation");
    await setFiscalProxyMode("systax_validation");
    await dispatchOnce();
    await waitForState(
      effectA,
      taxValidation.effectRequestId,
      EffectKnowledgeState.CONFIRMED_NO_EFFECT,
    );

    const taxError = await taxEffect({
      action: fiscalActionA,
      entityId: "fiscal.tax.error",
      fiscal,
      label: "error",
      world: worldA,
    });
    inject("systax-error");
    await setFiscalProxyMode("systax_error");
    await dispatchOnce();
    await waitForState(
      effectA,
      taxError.effectRequestId,
      EffectKnowledgeState.CONFIRMED_NO_EFFECT,
    );

    const taxOutage = await taxEffect({
      action: fiscalActionA,
      entityId: "fiscal.tax.outage",
      fiscal,
      label: "outage",
      world: worldA,
    });
    inject("systax-outage");
    await setFiscalProxyMode("systax_outage");
    await dispatchOnce();
    await waitForState(
      effectA,
      taxOutage.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    const outageRequest = await fiscalQuery({
      client: worldA,
      entityId: "fiscal.tax.outage",
      fixture: fiscal,
      relationId: "fiscal.taxDeterminationRequestReference",
      tenantId: tenantA,
    });
    const outageExplanation = await explainOperation(
      historyA,
      taxOutage.operationId,
    );
    observe(
      "taxValidationErrorAndOutageDoNotCorruptLocalActionCommit",
      textValues(outageRequest).includes("tax-request-outage") &&
        outageExplanation.subject.case === "action" &&
        outageExplanation.subject.value.commit?.receipt?.operationId ===
          taxOutage.operationId,
    );

    const taxSuccess = await taxEffect({
      action: fiscalActionA,
      entityId: "fiscal.tax.success",
      fiscal,
      label: "success",
      world: worldA,
    });
    await setFiscalProxyMode("systax_success");
    await dispatchOnce();
    const taxSuccessSnapshot = await waitForState(
      effectA,
      taxSuccess.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    const taxAttempt = taxSuccessSnapshot.attempts.at(-1);
    assert.ok(taxAttempt);
    await recordRelations(worldA, fiscal, "fiscal.tax.success", [
      ["fiscal.determinationProviderReference", text("tax-determination-provider")],
      [
        "fiscal.determinationProviderOperationReference",
        text(taxAttempt.providerOperationId),
      ],
      ["fiscal.determinationRuleVersion", text("contract-v1")],
      [
        "fiscal.determinationResponseDigest",
        text(taxAttempt.responseDigest),
      ],
      ["fiscal.federalTaxAmount", decimal("1.1")],
      ["fiscal.stateTaxAmount", decimal("2.2")],
      ["fiscal.municipalTaxAmount", decimal("0")],
    ]);
    const taxTotal = await fiscalQuery({
      client: worldA,
      computationId: "fiscal.determinedTotalTaxAmount",
      entityId: "fiscal.tax.success",
      fixture: fiscal,
      tenantId: tenantA,
    });
    observe(
      "systaxProductionAdapterMapsProviderNeutralTaxContextAndEvidence",
      textValues(
        await fiscalQuery({
          client: worldA,
          entityId: "fiscal.tax.success",
          fixture: fiscal,
          relationId: "fiscal.determinationProviderOperationReference",
          tenantId: tenantA,
        }),
      ).includes(taxAttempt.providerOperationId) &&
        decimalValues(taxTotal).includes("3.3"),
    );

    connector = await switchConnector(
      connector,
      "plugnotas",
      connectorCredentials,
      processes,
    );

    const credentialEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.credential",
      fiscal,
      label: "credential",
      world: worldA,
    });
    inject("credential-or-certificate-failure");
    await setFiscalProxyMode("credential_failure");
    await dispatchOnce();
    await waitForState(
      effectA,
      credentialEffect.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );

    const schemaEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.schema",
      fiscal,
      label: "schema",
      world: worldA,
    });
    inject("provider-response-schema-drift");
    await setFiscalProxyMode("schema_drift");
    await dispatchOnce();
    const schemaSnapshot = await waitForState(
      effectA,
      schemaEffect.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    observe(
      "providerSchemaDriftStaysUnknown",
      schemaSnapshot.attempts.at(-1)?.reason !== undefined,
    );

    const http200Effect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.http200",
      fiscal,
      label: "http200",
      world: worldA,
    });
    inject("http-200-with-pending-status");
    await setFiscalProxyMode("plug_http_200_pending");
    await dispatchOnce();
    const http200Pending = await waitForState(
      effectA,
      http200Effect.effectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    observe(
      "http200IsNotMappedDirectlyToFiscalAuthorization",
      http200Pending.request?.state === EffectKnowledgeState.ACCEPTED_PENDING,
    );

    const timeoutEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.timeout",
      fiscal,
      label: "timeout",
      world: worldA,
    });
    inject("timeout-after-possible-remote-receipt");
    await setFiscalProxyMode("timeout_after_receipt");
    await dispatchOnce();
    await waitForState(
      effectA,
      timeoutEffect.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );
    await delay(1_100);
    const beforeRetry = await fiscalProxyMetrics();
    await dispatchOnce();
    await delay(100);
    const afterRetry = await fiscalProxyMetrics();
    observe(
      "timeoutAfterPossibleReceiptStaysUnknownAndIsNotBlindlyRetried",
      beforeRetry.dispatchCounts[timeoutEffect.idempotencyKey] === 1 &&
        afterRetry.dispatchCounts[timeoutEffect.idempotencyKey] === 1,
    );

    await setFiscalProxyMode("plug_authorized");
    const authorizedStatus = await requireConnectorStatus(
      timeoutEffect.idempotencyKey,
    );
    const confirmed = await reconcilerA.reconcile({
      effectRequestId: timeoutEffect.effectRequestId,
      evidence: evidenceInput(authorizedStatus, "fiscal.timeout.authorized"),
    });
    assert.equal(
      confirmed.snapshot?.request?.state,
      EffectKnowledgeState.CONFIRMED,
    );
    const confirmedAgain = await reconcilerA.reconcile({
      effectRequestId: timeoutEffect.effectRequestId,
      evidence: evidenceInput(authorizedStatus, "fiscal.timeout.authorized"),
    });
    assert.equal(
      confirmedAgain.snapshot?.request?.state,
      EffectKnowledgeState.CONFIRMED,
    );
    const duplicateCounts = await evidenceCounts(
      admin,
      timeoutEffect.effectRequestId,
    );
    observe(
      "duplicateStatusEvidenceIsIdempotent",
      duplicateCounts.evidence === 1 && duplicateCounts.reconciliations === 1,
    );

    await recordRelations(worldA, fiscal, "fiscal.document.a", [
      ["fiscal.fiscalIntentReference", text("fiscal.intent.timeout")],
      ["fiscal.documentProviderReference", text("fiscal-document-provider")],
      [
        "fiscal.documentProviderOperationReference",
        text(authorizedStatus.providerOperationId),
      ],
      ["fiscal.remoteSubmissionStatus", text("submitted")],
      ["fiscal.authorityStatus", text("authorized")],
      [
        "fiscal.authorityProtocol",
        text(`protocol.${authorizedStatus.providerOperationId}`),
      ],
      [
        "fiscal.authorityAccessKey",
        text(`key.${authorizedStatus.providerOperationId}`),
      ],
      [
        "fiscal.authorizationEvidenceDigest",
        text(authorizedStatus.evidenceDigest),
      ],
      ["fiscal.authorizedArtifactReference", text("fiscal.artifact.a")],
      ["fiscal.remoteDocumentRevision", integer("1")],
      ["fiscal.cancellationReason", text("duplicate issuance")],
      ["fiscal.correctionText", text("correct the product description")],
    ]);
    await recordRelations(worldA, fiscal, "fiscal.artifact.a", [
      ["fiscal.artifactDocumentReference", text("fiscal.document.a")],
      ["fiscal.artifactDigest", text(authorizedStatus.evidenceDigest)],
      ["fiscal.artifactMediaType", text("application/xml")],
      ["fiscal.artifactSourceReference", text(authorizedStatus.sourceRef)],
    ]);
    observe(
      "authorizationEvidencePersistsProviderIdentityAndArtifactDigest",
      /^[a-f0-9]{64}$/u.test(authorizedStatus.evidenceDigest) &&
        authorizedStatus.sourceRef.includes(":artifact-sha256:"),
    );

    inject("remote-manual-change-conflict");
    await setFiscalProxyMode("plug_rejected");
    const conflictingStatus = await requireConnectorStatus(
      timeoutEffect.idempotencyKey,
    );
    const contradicted = await reconcilerA.reconcile({
      effectRequestId: timeoutEffect.effectRequestId,
      evidence: evidenceInput(conflictingStatus, "fiscal.timeout.conflict"),
    });
    observe(
      "remoteManualChangeConflictsWithLocalExpectation",
      contradicted.snapshot?.request?.state ===
        EffectKnowledgeState.CONTRADICTED,
    );

    const pendingEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.pending",
      fiscal,
      label: "pending",
      world: worldA,
    });
    inject("remote-202-style-acceptance");
    await setFiscalProxyMode("plug_accepted_pending");
    await dispatchOnce();
    await waitForState(
      effectA,
      pendingEffect.effectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );

    const rejectedEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.rejected",
      fiscal,
      label: "rejected",
      world: worldA,
    });
    await setFiscalProxyMode("plug_accepted_pending");
    await dispatchOnce();
    await waitForState(
      effectA,
      rejectedEffect.effectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    inject("fiscal-authority-rejection");
    await setFiscalProxyMode("plug_rejected");
    const rejectionStatus = await requireConnectorStatus(
      rejectedEffect.idempotencyKey,
    );
    const rejected = await reconcilerA.reconcile({
      effectRequestId: rejectedEffect.effectRequestId,
      evidence: evidenceInput(rejectionStatus, "fiscal.rejected"),
    });
    observe(
      "fiscalRejectionIsNoEffectRatherThanAuthorization",
      rejected.snapshot?.request?.state ===
        EffectKnowledgeState.CONFIRMED_NO_EFFECT,
    );

    const cancellation = await documentEventEffect({
      action: fiscalActionA,
      actionId: "fiscal.cancelDocument",
      entityId: "fiscal.document.a",
      fiscal,
      label: "cancel",
      requestReference: "cancellation-request-a",
    });
    inject("cancellation-failure");
    await setFiscalProxyMode("cancellation_failure");
    await dispatchOnce();
    await waitForState(
      effectA,
      cancellation.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );

    const correction = await documentEventEffect({
      action: fiscalActionA,
      actionId: "fiscal.correctDocument",
      entityId: "fiscal.document.a",
      fiscal,
      label: "correct",
      requestReference: "correction-request-a",
    });
    inject("correction-failure");
    await setFiscalProxyMode("correction_failure");
    await dispatchOnce();
    await waitForState(
      effectA,
      correction.effectRequestId,
      EffectKnowledgeState.CONFIRMED_NO_EFFECT,
    );
    const authorityAfterFailedEvents = await fiscalQuery({
      client: worldA,
      entityId: "fiscal.document.a",
      fixture: fiscal,
      relationId: "fiscal.authorityStatus",
      tenantId: tenantA,
    });
    observe(
      "failedCancellationAndCorrectionAppendEvidenceWithoutRewritingAuthorization",
      textValues(authorityAfterFailedEvents).includes("authorized"),
    );

    connector = await switchConnector(
      connector,
      "protheus",
      connectorCredentials,
      processes,
    );
    const protheusEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.protheus",
      fiscal,
      label: "protheus",
      world: worldA,
    });
    await setFiscalProxyMode("protheus_pending");
    await dispatchOnce();
    await waitForState(
      effectA,
      protheusEffect.effectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    const plugExplanation = await explainOperation(
      historyA,
      pendingEffect.operationId,
    );
    const protheusExplanation = await explainOperation(
      historyA,
      protheusEffect.operationId,
    );
    const plugOrigin = await fiscalQuery({
      client: worldA,
      entityId: "fiscal.intent.pending",
      fixture: fiscal,
      relationId: "fiscal.intentCommercialOperationReference",
      tenantId: tenantA,
    });
    const protheusOrigin = await fiscalQuery({
      client: worldA,
      entityId: "fiscal.intent.protheus",
      fixture: fiscal,
      relationId: "fiscal.intentCommercialOperationReference",
      tenantId: tenantA,
    });
    observe(
      "providerSwitchPreservesCommercialAndFiscalActionIdentity",
      actionId(plugExplanation) === "fiscal.submitDocument" &&
        actionId(protheusExplanation) === "fiscal.submitDocument" &&
        textValues(plugOrigin).includes("commercial.createCommitment") &&
        textValues(protheusOrigin).includes("commercial.createCommitment"),
    );

    await setFiscalProxyMode("protheus_authorized");
    const protheusStatus = await requireConnectorStatus(
      protheusEffect.idempotencyKey,
    );
    const protheusConfirmed = await reconcilerA.reconcile({
      effectRequestId: protheusEffect.effectRequestId,
      evidence: evidenceInput(protheusStatus, "fiscal.protheus.authorized"),
    });
    observe(
      "protheusContractAdapterQueriesAuthorityStatusBeforeConfirmation",
      protheusConfirmed.snapshot?.request?.state ===
        EffectKnowledgeState.CONFIRMED,
    );

    const crossTenantCode = await expectConnectCode(
      () =>
        fiscalQuery({
          client: worldB,
          entityId: "fiscal.intent.protheus",
          fixture: fiscal,
          relationId: "fiscal.documentSubmissionRequestReference",
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );
    const crossTenantStatus = await connectorStatusResponse({
      credentialRef: "secret.provider.a",
      idempotencyKey: protheusEffect.idempotencyKey,
      tenantId: tenantB,
    });
    observe(
      "crossTenantFiscalDocumentAndStatusQueriesAreDenied",
      crossTenantCode === Code.PermissionDenied &&
        crossTenantStatus.status === 403,
    );

    const secretMutant = await fiscalActionA.propose(
      proposalRequest({
        actionId: "fiscal.submitDocument",
        fixture: fiscal,
        inputs: [{ id: "requestReference", value: text(providerCredential) }],
        resourceId: "fiscal.intent.protheus",
        suffix: "secret-mutant",
        validAt,
      }),
    );
    observe(
      "apiSecretActionMutantIsDeniedBeforeHistoryWrite",
      secretMutant.decision === PolicyDecision.DENY &&
        secretMutant.proposal === undefined,
    );

    const crossBoundaryMutants = [
      source.replace(
        '"fiscal.submitDocument"',
        '"plugnotas.submitDocument"',
      ),
      source.replace(
        '"fiscal.FiscalDocument"',
        '"commercial.Invoice"',
      ),
    ];
    let rejectedSourceMutants = 0;
    for (const mutant of crossBoundaryMutants) {
      try {
        assertProviderNeutralSource(mutant);
      } catch {
        rejectedSourceMutants += 1;
      }
    }
    const [fiscalRustMutant, schemaRustMutant, handlerRustMutant] =
      await Promise.all([
        runRustLeakageMutant("fiscal.submitDocument"),
        runRustLeakageMutant("plugnotas.idIntegracao"),
        runRustLeakageMutant("protheus.handleFiscal"),
      ]);
    const leakage = await runLeakageGate();
    observe(
      "providerAndBusinessSchemaLeakageMutantsAreKilled",
      rejectedSourceMutants === crossBoundaryMutants.length &&
        fiscalRustMutant.code !== 0 &&
        schemaRustMutant.code !== 0 &&
        handlerRustMutant.code !== 0 &&
        leakage.code === 0,
    );

    const secretScan = await admin.query<{ leaked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM action_proposal_inputs WHERE value_text = ANY($1::TEXT[])
         UNION ALL
         SELECT 1 FROM semantic_claims WHERE value_text = ANY($1::TEXT[])
         UNION ALL
         SELECT 1 FROM effect_requests
           WHERE convert_from(payload, 'UTF8') LIKE ANY($2::TEXT[])
         UNION ALL
         SELECT 1 FROM projection_outbox
           WHERE payload::text LIKE ANY($2::TEXT[])
       ) AS leaked`,
      [
        [providerCredential, adapterASecret, adapterBSecret],
        [
          `%${providerCredential}%`,
          `%${adapterASecret}%`,
          `%${adapterBSecret}%`,
        ],
      ],
    );
    observe(
      "credentialsStayOutsideDefinitionsEffectsHistoryLogsAndEvidence",
      secretScan.rows[0]?.leaked === false &&
        ![providerCredential, adapterASecret, adapterBSecret].some((secret) =>
          processOutputContains(processes, secret),
        ),
    );

    const preSendEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.presend",
      fiscal,
      label: "presend",
      world: worldA,
    });
    inject("timeout-before-known-send");
    assert.ok(protheusAdapter);
    await stopProcess(protheusAdapter);
    await dispatchOnce();
    await waitForState(
      effectA,
      preSendEffect.effectRequestId,
      EffectKnowledgeState.DEFINITELY_NOT_SENT,
    );
    const finalMetrics = await fiscalProxyMetrics();
    observe(
      "timeoutBeforeKnownSendDoesNotReachVendor",
      finalMetrics.dispatchCounts[preSendEffect.idempotencyKey] === undefined,
    );

    observe(
      "commercialInvoiceNeverAliasesFiscalDocument",
      !source.includes("commercial.Invoice") &&
        source.includes("fiscal.FiscalDocument"),
    );

    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      {
        assertions,
        completedAt: new Date().toISOString(),
        failureInjections,
        liveEvidence: {
          plugnotas: "not-run-no-credentials",
          protheus: "not-run-no-environment",
          systax: "not-run-no-credentials",
        },
        productionAdapters: ["systax", "plugnotas", "protheus"],
        scenario,
        startedAt,
        status: "pass",
      },
    );
    process.stdout.write(`fiscal fault matrix passed: ${artifactPath}\n`);
  } finally {
    for (const process of [...processes].reverse()) {
      await stopProcess(process);
    }
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
  }
}

async function taxEffect(input: {
  readonly action: ActionClient;
  readonly entityId: string;
  readonly fiscal: FiscalFixture;
  readonly label: string;
  readonly world: WorldClient;
}): Promise<CommittedFiscalEffect> {
  await recordRelations(input.world, input.fiscal, input.entityId, [
    [
      "fiscal.originatingCommercialOperationReference",
      text("commercial.createCommitment"),
    ],
    ["fiscal.taxIssuerRegistration", text("12345678000190")],
    ["fiscal.taxRecipientRegistration", text("98765432000110")],
    ["fiscal.taxProductReference", text("product.item.fiscal")],
    ["fiscal.operationCode", text("5102")],
    ["fiscal.productClassificationCode", text("84713012")],
    ["fiscal.destinationRegion", text("SP")],
    ["fiscal.taxEffectiveAt", text(validAt.toISOString())],
    ["fiscal.taxQuantity", quantity("2", "each")],
    ["fiscal.taxUnitPrice", decimal("50")],
  ]);
  return commitFiscalAction({
    action: input.action,
    actionId: "fiscal.requestTaxDetermination",
    entityId: input.entityId,
    fiscal: input.fiscal,
    inputs: [
      { id: "requestReference", value: text(`tax-request-${input.label}`) },
    ],
    label: `tax-${input.label}`,
  });
}

async function submitEffect(input: {
  readonly action: ActionClient;
  readonly entityId: string;
  readonly fiscal: FiscalFixture;
  readonly label: string;
  readonly world: WorldClient;
}): Promise<CommittedFiscalEffect> {
  const content = {
    issuer: { taxRegistration: "12345678000190" },
    lines: [
      {
        classificationCode: "84713012",
        description: "Fiscal contract item",
        operationCode: "5102",
        productReference: "product.item.fiscal",
        quantity: "2",
        tax: {
          cofinsAmount: "0.00",
          cofinsRate: "0",
          icmsAmount: "2.20",
          icmsRate: "2.20",
          pisAmount: "0.00",
          pisRate: "0",
        },
        unit: "UN",
        unitPrice: "50.00",
      },
    ],
    nature: "sale of goods",
    payment: {
      methodCode: "01",
      paidAtSight: true,
    },
    recipient: {
      address: {
        city: "Sao Paulo",
        cityCode: "3550308",
        countryCode: "1058",
        district: "Central",
        postalCode: "01001000",
        region: "SP",
        street: "Fiscal Street",
        streetNumber: "100",
      },
      name: "Contract Recipient",
      taxRegistration: "98765432000110",
    },
    totals: { amount: "100.00" },
  };
  await recordRelations(input.world, input.fiscal, input.entityId, [
    [
      "fiscal.intentCommercialOperationReference",
      text("commercial.createCommitment"),
    ],
    ["fiscal.accountingClaimReference", text("accounting.claim.receivable")],
    [
      "fiscal.taxDeterminationReference",
      text("fiscal.tax.success"),
    ],
    ["fiscal.documentModel", text("nfe")],
    ["fiscal.authorityEnvironment", text("homologation")],
    ["fiscal.documentContent", text(JSON.stringify(content))],
    ["fiscal.intentIssuerRegistration", text("12345678000190")],
    ["fiscal.intentRecipientRegistration", text("98765432000110")],
    ["fiscal.documentTotalAmount", decimal("100")],
  ]);
  return commitFiscalAction({
    action: input.action,
    actionId: "fiscal.submitDocument",
    entityId: input.entityId,
    fiscal: input.fiscal,
    inputs: [
      {
        id: "requestReference",
        value: text(`document-request-${input.label}`),
      },
    ],
    label: `document-${input.label}`,
  });
}

function documentEventEffect(input: {
  readonly action: ActionClient;
  readonly actionId: "fiscal.cancelDocument" | "fiscal.correctDocument";
  readonly entityId: string;
  readonly fiscal: FiscalFixture;
  readonly label: string;
  readonly requestReference: string;
}): Promise<CommittedFiscalEffect> {
  return commitFiscalAction({
    action: input.action,
    actionId: input.actionId,
    entityId: input.entityId,
    fiscal: input.fiscal,
    inputs: [
      { id: "requestReference", value: text(input.requestReference) },
      { id: "revision", value: integer("1") },
    ],
    label: input.label,
  });
}

async function commitFiscalAction(input: {
  readonly action: ActionClient;
  readonly actionId:
    | "fiscal.cancelDocument"
    | "fiscal.correctDocument"
    | "fiscal.requestTaxDetermination"
    | "fiscal.submitDocument";
  readonly entityId: string;
  readonly fiscal: FiscalFixture;
  readonly inputs: readonly {
    readonly id: string;
    readonly value: SemanticValue;
  }[];
  readonly label: string;
}): Promise<CommittedFiscalEffect> {
  const request = proposalRequest({
    actionId: input.actionId,
    fixture: input.fiscal,
    inputs: input.inputs,
    resourceId: input.entityId,
    suffix: input.label,
    validAt,
  });
  const proposed = await input.action.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  const committed = await input.action.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  const effectRequestId = committed.receipt?.effectRequestIds[0];
  assert.ok(effectRequestId);
  return {
    effectRequestId,
    idempotencyKey: `idempotency.${tenantA}.${effectRequestId}`,
    operationId: request.operationId,
  };
}

async function recordRelations(
  world: WorldClient,
  fiscal: FiscalFixture,
  entityId: string,
  relations: readonly (readonly [string, SemanticValue])[],
): Promise<void> {
  for (const [index, [relationId, value]] of relations.entries()) {
    await recordFiscalEvidence(world, fiscal, {
      at: validAt,
      claimId: `claim.${entityId}.${relationId}.${index}`,
      entityId,
      relationId,
      sourceId: "source.fiscal.integration",
      tenantId: tenantA,
      value,
    });
  }
}

async function waitForFiscalState(input: {
  readonly client: ReturnType<typeof effectClient>;
  readonly effectRequestId: string;
  readonly expected: EffectKnowledgeState;
  readonly processes: readonly ManagedProcess[];
}): Promise<EffectSnapshot> {
  let getEffectError: string | undefined;
  let snapshot: EffectSnapshot | undefined;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      snapshot = (
        await input.client.getEffect({ effectRequestId: input.effectRequestId })
      ).snapshot;
      getEffectError = undefined;
    } catch (error: unknown) {
      getEffectError =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
    }
    if (snapshot?.request?.state === input.expected) {
      return snapshot;
    }
    await delay(50);
  }
  process.stderr.write(
    `${JSON.stringify(
      {
        effectRequestId: input.effectRequestId,
        event: "fiscal_effect_wait_failed",
        expectedState: input.expected,
        getEffectError,
        processes: input.processes.map((managed) => ({
          exitCode: managed.child.exitCode,
          name: managed.name,
          signalCode: managed.child.signalCode,
          stderr: managed.stderr.join(""),
          stdout: managed.output.join(""),
        })),
        snapshot: effectSnapshotDiagnostic(snapshot),
      },
      null,
      2,
    )}\n`,
  );
  throw new Error(
    `timed out waiting for ${input.effectRequestId} to reach ${input.expected}`,
  );
}

function effectSnapshotDiagnostic(snapshot: EffectSnapshot | undefined) {
  const request = snapshot?.request;
  return {
    attempts:
      snapshot?.attempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        commitSequence: attempt.commitSequence.toString(),
        outcome: attempt.outcome,
        providerOperationId: attempt.providerOperationId,
        reason: attempt.reason,
        requestDigest: attempt.requestDigest,
        responseDigest: attempt.responseDigest,
      })) ?? [],
    evidence:
      snapshot?.evidence.map((entry) => ({
        commitSequence: entry.commitSequence.toString(),
        evidenceDigest: entry.evidenceDigest,
        evidenceId: entry.evidenceId,
        idempotencyKey: entry.idempotencyKey,
        outcome: entry.outcome,
        providerOperationId: entry.providerOperationId,
        sourceId: entry.sourceId,
        sourceRef: entry.sourceRef,
      })) ?? [],
    reconciliations:
      snapshot?.reconciliations.map((entry) => ({
        commitSequence: entry.commitSequence.toString(),
        evidenceId: entry.evidenceId,
        previousState: entry.previousState,
        resultingState: entry.resultingState,
      })) ?? [],
    request:
      request === undefined
        ? undefined
        : {
            commitSequence: request.commitSequence.toString(),
            effectRequestId: request.effectRequestId,
            idempotencyKey: request.idempotencyKey,
            intentDigest: request.intentDigest,
            operationId: request.operationId,
            payloadBytes: request.payload.byteLength,
            requestDigest: request.requestDigest,
            state: request.state,
          },
  };
}

async function fiscalQuery(input: {
  readonly client: WorldClient;
  readonly computationId?: string;
  readonly entityId: string;
  readonly fixture: FiscalFixture;
  readonly relationId?: string;
  readonly tenantId: string;
}): Promise<SemanticQueryResponse> {
  const selection =
    input.computationId === undefined
      ? create(QuerySelectionSchema, {
          value: {
            case: "relationId",
            value: required(input.relationId, "relationId"),
          },
        })
      : create(QuerySelectionSchema, {
          value: {
            case: "computationId",
            value: input.computationId,
          },
        });
  return input.client.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
    definition: input.fixture.definition,
    entityId: input.entityId,
    selection,
    tenantId: input.tenantId,
    validAt: timestampFromDate(validAt),
  });
}

function textValues(result: SemanticQueryResponse): string[] {
  return result.values.flatMap((entry) =>
    entry.value?.value.case === "textValue"
      ? [entry.value.value.value]
      : [],
  );
}

function decimalValues(result: SemanticQueryResponse): string[] {
  return result.values.flatMap((entry) =>
    entry.value?.value.case === "decimalValue"
      ? [entry.value.value.value]
      : [],
  );
}

async function requireConnectorStatus(idempotencyKey: string) {
  const status = await connectorStatus(idempotencyKey, tenantA);
  if (status === undefined) {
    throw new Error(`missing provider status for ${idempotencyKey}`);
  }
  return status;
}

async function switchConnector(
  current: ManagedProcess | undefined,
  provider: "plugnotas" | "protheus" | "systax",
  credentials: Readonly<
    Record<string, { readonly secret: string; readonly tenantId: string }>
  >,
  processes: ManagedProcess[],
): Promise<ManagedProcess> {
  if (current !== undefined) {
    await stopProcess(current);
  }
  const next = await startConnector({
    credentials,
    providerUrl: adapterProviderUrl(provider),
    timeoutMs: connectorAdapterTimeoutMs,
  });
  processes.push(next);
  return next;
}

function actionId(
  explanation: Awaited<ReturnType<typeof explainOperation>>,
): string | undefined {
  return explanation.subject.case === "action"
    ? explanation.subject.value.definition?.actionId
    : undefined;
}

function text(value: string): SemanticValue {
  return { kind: "text", value };
}

function decimal(value: string): SemanticValue {
  return { kind: "decimal", value };
}

function integer(value: string): SemanticValue {
  return { kind: "integer", value };
}

function quantity(amount: string, unit: string): SemanticValue {
  return { amount, kind: "quantity", unit };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

await main();
