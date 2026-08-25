import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import {
  type CommitReceipt,
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
  compilePartyPackage,
  compileProductPackage,
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
  type DomainFixture,
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
  const [commercial, fiscal, party, product, repeatedFiscal, source] =
    await Promise.all([
      compileCommercialPackage(),
      compileFiscalPackage(),
      compilePartyPackage(),
      compileProductPackage(),
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
  await writeFiscalPolicyManifest(policyManifestPath, commercial, fiscal, [
    party,
    product,
  ]);

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
  let fiscalAdapter: ManagedProcess | undefined;
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
    fiscalAdapter = await startFiscalAdapter({
      callerBindings,
      listenProvider: "systax",
      routes: {
        documents: {
          "12345678000190": {
            provider: "plugnotas",
            providerCredential,
            providerTimeoutMs: vendorAdapterTimeoutMs,
          },
          "22345678000190": {
            provider: "protheus",
            providerCredential,
            providerTimeoutMs: vendorAdapterTimeoutMs,
          },
        },
        tax: {
          provider: "systax",
          providerCredential,
          providerTimeoutMs: vendorAdapterTimeoutMs,
        },
      },
    });
    processes.push(fiscalAdapter);
    const connector = await startConnector({
      credentials: connectorCredentials,
      providerUrl: adapterProviderUrl(),
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
      [party, product, commercial, fiscal].flatMap((fixture) => [
        publishDefinition(definitionA, tenantA, fixture),
        publishDefinition(definitionB, tenantB, fixture),
      ]),
    );
    await Promise.all(
      [party, product, commercial, fiscal].flatMap((fixture) => [
        activateDefinition(definitionA, tenantA, fixture),
        activateDefinition(definitionB, tenantB, fixture),
      ]),
    );

    const issuerPlug = await commitContextAction({
      action: fiscalActionA,
      actionId: "party.admitIdentity",
      fixture: party,
      inputs: [
        { id: "externalIdentifier", value: text("12345678000190") },
        { id: "identityKind", value: text("organization") },
      ],
      label: "issuer-plug",
      resourceId: "party.issuer.plug",
    });
    const issuerProtheus = await commitContextAction({
      action: fiscalActionA,
      actionId: "party.admitIdentity",
      fixture: party,
      inputs: [
        { id: "externalIdentifier", value: text("22345678000190") },
        { id: "identityKind", value: text("organization") },
      ],
      label: "issuer-protheus",
      resourceId: "party.issuer.protheus",
    });
    const recipient = await commitContextAction({
      action: fiscalActionA,
      actionId: "party.admitIdentity",
      fixture: party,
      inputs: [
        { id: "externalIdentifier", value: text("98765432000110") },
        { id: "identityKind", value: text("organization") },
      ],
      label: "recipient",
      resourceId: "party.recipient.fiscal",
    });
    const productAdmission = await commitContextAction({
      action: fiscalActionA,
      actionId: "product.admitItem",
      fixture: product,
      inputs: [
        { id: "externalIdentifier", value: text("sku:FISCAL-ITEM") },
        { id: "lifecycleState", value: text("active") },
        { id: "packQuantity", value: quantity("1", "each") },
      ],
      label: "product",
      resourceId: "product.item.fiscal",
    });
    const commercialCommitment = await commitContextAction({
      action: fiscalActionA,
      actionId: "commercial.createCommitment",
      fixture: commercial,
      inputs: [
        {
          id: "commitmentReference",
          value: entityRef("commitment.fiscal.order-1"),
        },
        { id: "quantity", value: quantity("3", "each") },
        { id: "revision", value: integer("1") },
        { id: "terms", value: text("net-30") },
        { id: "unitPrice", value: decimal("19.9") },
      ],
      label: "commercial-commitment",
      resourceId: "commercial.order-line.fiscal",
    });
    const commercialOperationId = commercialCommitment.operationId;
    observe(
      "issuerRecipientProductAndCommercialContextUseActions",
      issuerPlug.receipt.actionId === "party.admitIdentity" &&
        issuerProtheus.receipt.actionId === "party.admitIdentity" &&
        recipient.receipt.actionId === "party.admitIdentity" &&
        productAdmission.receipt.actionId === "product.admitItem" &&
        commercialCommitment.receipt.actionId ===
          "commercial.createCommitment",
    );
    await prepareIntent({
      commercialOperationId,
      documentEntityId: "fiscal.document.a",
      entityId: "fiscal.intent.plug",
      fiscal,
      issuerRegistration: "12345678000190",
      world: worldA,
    });
    await prepareIntent({
      commercialOperationId,
      documentEntityId: "fiscal.document.protheus",
      entityId: "fiscal.intent.protheus",
      fiscal,
      issuerRegistration: "22345678000190",
      world: worldA,
    });

    const taxValidation = await taxEffect({
      action: fiscalActionA,
      commercialOperationId,
      entityId: "fiscal.tax.validation",
      fiscal,
      intentEntityId: "fiscal.intent.plug",
      issuerRegistration: "12345678000190",
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
      commercialOperationId,
      entityId: "fiscal.tax.error",
      fiscal,
      intentEntityId: "fiscal.intent.plug",
      issuerRegistration: "12345678000190",
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
      commercialOperationId,
      entityId: "fiscal.tax.outage",
      fiscal,
      intentEntityId: "fiscal.intent.plug",
      issuerRegistration: "12345678000190",
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
      commercialOperationId,
      entityId: "fiscal.tax.success",
      fiscal,
      intentEntityId: "fiscal.intent.plug",
      issuerRegistration: "12345678000190",
      label: "success",
      world: worldA,
    });
    await recordFiscalEvidence(worldA, fiscal, {
      at: validAt,
      claimId: "claim.fiscal.tax.success.later-issuer",
      entityId: "fiscal.tax.success",
      relationId: "fiscal.taxIssuerRegistration",
      sourceId: "source.fiscal.later-rival",
      tenantId: tenantA,
      value: text("00000000000000"),
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
    const [
      federalTax,
      intentTaxTotal,
      municipalTax,
      providerOperation,
      responseDigest,
      ruleVersion,
      stateTax,
      taxTotal,
    ] = await Promise.all([
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        relationId: "fiscal.federalTaxAmount",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.intent.plug",
        fixture: fiscal,
        relationId: "fiscal.intentDeterminedTaxTotal",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        relationId: "fiscal.municipalTaxAmount",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        relationId: "fiscal.determinationProviderOperationReference",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        relationId: "fiscal.determinationResponseDigest",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        relationId: "fiscal.determinationRuleVersion",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        relationId: "fiscal.stateTaxAmount",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        computationId: "fiscal.determinedTotalTaxAmount",
        entityId: "fiscal.tax.success",
        fixture: fiscal,
        tenantId: tenantA,
      }),
    ]);
    const taxMetrics = await fiscalProxyMetrics();
    const taxProxyOperation = taxMetrics.operations.find(
      (operation) => operation.idempotencyKey === taxSuccess.idempotencyKey,
    );
    const taxEvidenceValues = {
      federalTax: decimalValues(federalTax),
      intentTaxTotal: decimalValues(intentTaxTotal),
      municipalTax: decimalValues(municipalTax),
      providerOperation: textValues(providerOperation),
      responseDigest: textValues(responseDigest),
      ruleVersion: textValues(ruleVersion),
      stateTax: decimalValues(stateTax),
      taxTotal: decimalValues(taxTotal),
    };
    const taxEvidenceChecks = {
      federalTax: taxEvidenceValues.federalTax.includes("1.1"),
      intentTaxTotal: taxEvidenceValues.intentTaxTotal.includes("3.3"),
      municipalTax: taxEvidenceValues.municipalTax.includes("0"),
      providerOperation: taxEvidenceValues.providerOperation.includes(
        taxAttempt.providerOperationId,
      ),
      proxyIssuer:
        taxProxyOperation?.issuerRegistration === "12345678000190",
      responseDigest: taxEvidenceValues.responseDigest.includes(
        taxAttempt.responseDigest,
      ),
      ruleVersion: taxEvidenceValues.ruleVersion.includes("contract-v1"),
      stateTax: taxEvidenceValues.stateTax.includes("2.2"),
      taxTotal: taxEvidenceValues.taxTotal.includes("3.3"),
    };
    const taxEvidencePasses = Object.values(taxEvidenceChecks).every(Boolean);
    if (!taxEvidencePasses) {
      process.stderr.write(
        `${JSON.stringify(
          {
            checks: taxEvidenceChecks,
            event: "systax_tax_evidence_observation_failed",
            taxAttempt: {
              attemptId: taxAttempt.attemptId,
              commitSequence: taxAttempt.commitSequence.toString(),
              outcome: taxAttempt.outcome,
              providerOperationId: taxAttempt.providerOperationId,
              reason: taxAttempt.reason,
              requestDigest: taxAttempt.requestDigest,
              responseDigest: taxAttempt.responseDigest,
            },
            taxProxyOperation,
            values: taxEvidenceValues,
          },
          null,
          2,
        )}\n`,
      );
    }
    observe(
      "systaxProductionAdapterMapsProviderNeutralTaxContextAndEvidence",
      taxEvidencePasses,
    );

    const protheusTax = await taxEffect({
      action: fiscalActionA,
      commercialOperationId,
      entityId: "fiscal.tax.protheus",
      fiscal,
      intentEntityId: "fiscal.intent.protheus",
      issuerRegistration: "22345678000190",
      label: "protheus",
      world: worldA,
    });
    await setFiscalProxyMode("systax_success");
    await dispatchOnce();
    await waitForState(
      effectA,
      protheusTax.effectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );

    const credentialEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.plug",
      fiscal,
      label: "credential",
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
      entityId: "fiscal.intent.plug",
      fiscal,
      label: "schema",
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
      entityId: "fiscal.intent.plug",
      fiscal,
      label: "http200",
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
      entityId: "fiscal.intent.plug",
      fiscal,
      label: "timeout",
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

    const [
      accessKey,
      artifactDigest,
      authorityProtocol,
      authorityStatus,
      documentProviderOperation,
      remoteRevision,
    ] = await Promise.all([
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.document.a",
        fixture: fiscal,
        relationId: "fiscal.authorityAccessKey",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.document.a",
        fixture: fiscal,
        relationId: "fiscal.authorizationEvidenceDigest",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.document.a",
        fixture: fiscal,
        relationId: "fiscal.authorityProtocol",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.document.a",
        fixture: fiscal,
        relationId: "fiscal.authorityStatus",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.document.a",
        fixture: fiscal,
        relationId: "fiscal.documentProviderOperationReference",
        tenantId: tenantA,
      }),
      fiscalQuery({
        client: worldA,
        entityId: "fiscal.document.a",
        fixture: fiscal,
        relationId: "fiscal.remoteDocumentRevision",
        tenantId: tenantA,
      }),
    ]);
    const plugRawId = authorizedStatus.providerOperationId.slice(
      "plugnotas.".length,
    );
    const expectedArtifactDigest = sha256(
      `<fiscalDocument operation="${plugRawId}" status="authorized"/>`,
    );
    observe(
      "authorizationEvidencePersistsProviderIdentityAndArtifactDigest",
      /^plugnotas\.[a-f0-9]{24}$/u.test(
        authorizedStatus.providerOperationId,
      ) &&
        textValues(documentProviderOperation).includes(
          authorizedStatus.providerOperationId,
        ) &&
        textValues(authorityProtocol).includes(`protocol.${plugRawId}`) &&
        textValues(accessKey).includes(`key.${plugRawId}`) &&
        textValues(authorityStatus).includes("authorized") &&
        textValues(artifactDigest).includes(expectedArtifactDigest) &&
        integerValues(remoteRevision).includes("1") &&
        expectedArtifactDigest !== authorizedStatus.evidenceDigest,
    );
    await recordRelations(worldA, fiscal, "fiscal.document.a", [
      ["fiscal.cancellationReason", text("duplicate issuance")],
      ["fiscal.correctionText", text("correct the product description")],
    ]);

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
      entityId: "fiscal.intent.plug",
      fiscal,
      label: "pending",
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
      entityId: "fiscal.intent.plug",
      fiscal,
      label: "rejected",
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

    const emptyCancellation = await fiscalActionA.propose(
      proposalRequest({
        actionId: "fiscal.cancelDocument",
        fixture: fiscal,
        inputs: [
          {
            id: "requestReference",
            value: text("cancellation-request-empty"),
          },
        ],
        resourceId: "fiscal.document.empty",
        suffix: "cancel-empty",
        validAt,
      }),
    );
    const emptyCorrection = await fiscalActionA.propose(
      proposalRequest({
        actionId: "fiscal.correctDocument",
        fixture: fiscal,
        inputs: [
          {
            id: "requestReference",
            value: text("correction-request-empty"),
          },
        ],
        resourceId: "fiscal.document.empty",
        suffix: "correct-empty",
        validAt,
      }),
    );
    observe(
      "cancelAndCorrectRequireStoredRemoteRevision",
      emptyCancellation.decision === PolicyDecision.DENY &&
        emptyCancellation.proposal === undefined &&
        emptyCancellation.evaluationError === "" &&
        emptyCancellation.stateBasis?.dependencies.length === 0 &&
        emptyCorrection.decision === PolicyDecision.DENY &&
        emptyCorrection.proposal === undefined &&
        emptyCorrection.evaluationError === "" &&
        emptyCorrection.stateBasis?.dependencies.length === 0,
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
    await setFiscalProxyMode("plug_authorized");
    const stillAuthorizedCancellation = await requireConnectorStatus(
      cancellation.idempotencyKey,
    );
    observe(
      "authorizedDocumentDoesNotConfirmCancellation",
      stillAuthorizedCancellation.outcome === "pending",
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

    const protheusEffect = await submitEffect({
      action: fiscalActionA,
      entityId: "fiscal.intent.protheus",
      fiscal,
      label: "protheus",
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
      entityId: "fiscal.intent.plug",
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
        textValues(plugOrigin).includes(commercialOperationId) &&
        textValues(protheusOrigin).includes(commercialOperationId),
    );

    await setFiscalProxyMode("protheus_authorized");
    const protheusStatus = await requireConnectorStatus(
      protheusEffect.idempotencyKey,
    );
    const protheusConfirmed = await reconcilerA.reconcile({
      effectRequestId: protheusEffect.effectRequestId,
      evidence: evidenceInput(protheusStatus, "fiscal.protheus.authorized"),
    });
    const [protheusArtifactDigest, protheusDocumentOperation] =
      await Promise.all([
        fiscalQuery({
          client: worldA,
          entityId: "fiscal.document.protheus",
          fixture: fiscal,
          relationId: "fiscal.authorizationEvidenceDigest",
          tenantId: tenantA,
        }),
        fiscalQuery({
          client: worldA,
          entityId: "fiscal.document.protheus",
          fixture: fiscal,
          relationId: "fiscal.documentProviderOperationReference",
          tenantId: tenantA,
        }),
      ]);
    observe(
      "protheusContractAdapterQueriesAuthorityStatusBeforeConfirmation",
      protheusConfirmed.snapshot?.request?.state ===
        EffectKnowledgeState.CONFIRMED &&
        textValues(protheusDocumentOperation).includes(
          protheusStatus.providerOperationId,
        ) &&
        textValues(protheusArtifactDigest).some((digest) =>
          /^[a-f0-9]{64}$/u.test(digest),
        ),
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

    const secretMutants = await Promise.all(
      [providerCredential, `document-request-${providerCredential}`].map(
        (requestReference, index) =>
          fiscalActionA.propose(
            proposalRequest({
              actionId: "fiscal.submitDocument",
              fixture: fiscal,
              inputs: [
                {
                  id: "requestReference",
                  value: text(requestReference),
                },
              ],
              resourceId: "fiscal.intent.protheus",
              suffix: `secret-mutant-${index}`,
              validAt,
            }),
          ),
      ),
    );
    observe(
      "apiSecretActionMutantIsDeniedBeforeHistoryWrite",
      secretMutants.every(
        (mutant) =>
          mutant.decision === PolicyDecision.DENY &&
          mutant.proposal === undefined,
      ),
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
         SELECT 1 FROM action_proposal_inputs
           WHERE value_text LIKE ANY($1::TEXT[])
         UNION ALL
         SELECT 1 FROM semantic_claims
           WHERE value_text LIKE ANY($1::TEXT[])
         UNION ALL
         SELECT 1 FROM effect_requests
           WHERE convert_from(payload, 'UTF8') LIKE ANY($1::TEXT[])
         UNION ALL
         SELECT 1 FROM projection_outbox
           WHERE payload::text LIKE ANY($1::TEXT[])
       ) AS leaked`,
      [
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
      entityId: "fiscal.intent.protheus",
      fiscal,
      label: "presend",
    });
    inject("timeout-before-known-send");
    assert.ok(fiscalAdapter);
    await stopProcess(fiscalAdapter);
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
  readonly commercialOperationId: string;
  readonly entityId: string;
  readonly fiscal: FiscalFixture;
  readonly intentEntityId: string;
  readonly issuerRegistration: string;
  readonly label: string;
  readonly world: WorldClient;
}): Promise<CommittedFiscalEffect> {
  await recordRelations(input.world, input.fiscal, input.entityId, [
    [
      "fiscal.originatingCommercialOperationReference",
      text(input.commercialOperationId),
    ],
    ["fiscal.taxIntentReference", text(input.intentEntityId)],
    ["fiscal.taxIssuerRegistration", text(input.issuerRegistration)],
    ["fiscal.taxRecipientRegistration", text("98765432000110")],
    ["fiscal.taxProductReference", text("product.item.fiscal")],
    ["fiscal.operationCode", text("5102")],
    ["fiscal.productClassificationCode", text("84713012")],
    ["fiscal.destinationRegion", text("SP")],
    ["fiscal.taxEffectiveAt", text(validAt.toISOString())],
    ["fiscal.taxQuantity", quantity("3", "each")],
    ["fiscal.taxUnitPrice", decimal("19.9")],
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
}): Promise<CommittedFiscalEffect> {
  return commitFiscalAction({
    action: input.action,
    actionId: "fiscal.submitDocument",
    entityId: input.entityId,
    fiscal: input.fiscal,
    inputs: [
      {
        id: "requestReference",
        value: text(`document-request-fault-${input.label}`),
      },
    ],
    label: `document-${input.label}`,
  });
}

async function prepareIntent(input: {
  readonly commercialOperationId: string;
  readonly documentEntityId: string;
  readonly entityId: string;
  readonly fiscal: FiscalFixture;
  readonly issuerRegistration: string;
  readonly world: WorldClient;
}): Promise<void> {
  const content = {
    issuer: { taxRegistration: input.issuerRegistration },
    lines: [
      {
        classificationCode: "84713012",
        description: "Fiscal contract item",
        operationCode: "5102",
        productReference: "product.item.fiscal",
        quantity: "3",
        tax: {
          cofinsAmount: "0.00",
          cofinsRate: "0",
          icmsAmount: "2.20",
          icmsRate: "2.20",
          pisAmount: "0.00",
          pisRate: "0",
        },
        unit: "UN",
        unitPrice: "19.90",
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
    totals: { amount: "59.70" },
  };
  await recordRelations(input.world, input.fiscal, input.entityId, [
    [
      "fiscal.intentCommercialOperationReference",
      text(input.commercialOperationId),
    ],
    ["fiscal.accountingClaimReference", text("accounting.claim.receivable")],
    ["fiscal.intentDocumentReference", text(input.documentEntityId)],
    ["fiscal.documentModel", text("nfe")],
    ["fiscal.authorityEnvironment", text("homologation")],
    ["fiscal.documentContent", text(JSON.stringify(content))],
    [
      "fiscal.intentIssuerRegistration",
      text(input.issuerRegistration),
    ],
    ["fiscal.intentRecipientRegistration", text("98765432000110")],
    ["fiscal.documentTotalAmount", decimal("59.7")],
  ]);
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
    inputs: [{ id: "requestReference", value: text(input.requestReference) }],
    label: input.label,
  });
}

async function commitContextAction(input: {
  readonly action: ActionClient;
  readonly actionId:
    | "commercial.createCommitment"
    | "party.admitIdentity"
    | "product.admitItem";
  readonly fixture: DomainFixture;
  readonly inputs: readonly {
    readonly id: string;
    readonly value: SemanticValue;
  }[];
  readonly label: string;
  readonly resourceId: string;
}): Promise<{
  readonly operationId: string;
  readonly receipt: CommitReceipt;
}> {
  const request = proposalRequest({
    actionId: input.actionId,
    fixture: input.fixture,
    inputs: input.inputs,
    resourceId: input.resourceId,
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
  assert.ok(committed.receipt);
  return {
    operationId: request.operationId,
    receipt: committed.receipt,
  };
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

function integerValues(result: SemanticQueryResponse): string[] {
  return result.values.flatMap((entry) =>
    entry.value?.value.case === "integerValue"
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

function entityRef(value: string): SemanticValue {
  return { kind: "entity-ref", value };
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

await main();
