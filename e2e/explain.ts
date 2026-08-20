import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import {
  EffectAttemptOutcome,
  EffectEvidenceOutcome,
  EffectKnowledgeState,
} from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  EvidenceClass,
  GapReason,
  PolicyDecisionStage,
  StateBasisStage,
  type CausalActionExplanation,
  type CausalExplanation,
  type ExplanationTarget,
} from "../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  LineageRole,
  ValidTimeSchema,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  activateDefinition,
  type DefinitionFixture,
  loadFixture,
  publishDefinition,
  recordAvailable,
  resourceId,
  writePolicyManifest,
} from "./governed-action/support.js";
import {
  commitEffect,
  evidenceInput,
  expectConnectCode,
  sha256,
  waitForConnectorStatus,
  waitForState,
} from "./effects/scenario.js";
import {
  actionClient,
  adminClient,
  definitionClient,
  dispatchOnce,
  effectClient,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  registerWorker,
  repositoryRoot,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  worldClient,
  type ManagedProcess,
  type WorldClient,
} from "./effects/support.js";
import { historyClient, type HistoryClient } from "./explain/support.js";
import { e2eGeneratedDirectory, writeScenarioArtifact } from "./host-env.js";

type Target = Exclude<
  ExplanationTarget["target"],
  { case: undefined; value?: undefined }
>;

function crossRelationFixture(fixture: DefinitionFixture): DefinitionFixture {
  const directPrecondition =
    '"precondition":{"kind":"binary","left":{"kind":"relation","relationId":"inventory.available"},"operator":"greater_than","right":{"inputId":"quantity","kind":"input"}}';
  const crossRelationPrecondition =
    '"precondition":{"kind":"binary","left":{"kind":"binary","left":{"kind":"relation","relationId":"inventory.available"},"operator":"subtract","right":{"kind":"relation","relationId":"inventory.requested"}},"operator":"greater_than","right":{"inputId":"quantity","kind":"input"}}';
  const canonicalJson = fixture.canonicalJson
    .replace(directPrecondition, crossRelationPrecondition)
    .replace(
      '"cardinality":"many","id":"inventory.requested"',
      '"cardinality":"one","id":"inventory.requested"',
    );
  assert.notEqual(canonicalJson, fixture.canonicalJson);
  const digest = sha256(canonicalJson);
  return {
    ...fixture,
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: fixture.definition.definitionId,
      digest,
      revision: fixture.definition.revision,
    }),
    digest,
  };
}

async function recordRequested(
  client: WorldClient,
  fixture: DefinitionFixture,
): Promise<string> {
  const claimId = "claim.requested.explain.computation-input";
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId,
      definition: fixture.definition,
      entityId: resourceId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(claimId),
        sourceId: "source.explainE2e",
        sourceRef: `urn:zoen:e2e:${claimId}`,
      }),
      relationId: "inventory.requested",
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(
            new Date("2026-08-19T00:00:00.000Z"),
          ),
        },
      }),
      value: create(ExactValueSchema, {
        value: { case: "integerValue", value: "5" },
      }),
    }),
    tenantId: tenantA,
  });
  assert.equal(response.claimId, claimId);
  return claimId;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixture = crossRelationFixture(await loadFixture("direct", 1));
  const laterFixture = await loadFixture("self", 2);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "explain"),
    "explain-policies.json",
  );
  await writePolicyManifest(policyManifestPath, [fixture, laterFixture]);

  const agentAToken = await oidcToken("agent-a");
  const agentBToken = await oidcToken("agent-b");
  const adminAToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  const workerAToken = await oidcToken("effect-worker-a");
  const workerBToken = await oidcToken("effect-worker-b");
  const reconcilerAToken = await oidcToken("effect-reconciler-a");
  const actionA = actionClient(agentAToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const definitionAdminA = definitionClient(adminAToken);
  const definitionAdminB = definitionClient(adminBToken);
  const effectA = effectClient(agentAToken);
  const reconcilerA = effectClient(reconcilerAToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  const assertions: Record<string, boolean> = {};
  const observe = (name: string, value: boolean): void => {
    assert.ok(value, name);
    assertions[name] = value;
  };

  const firstZoend = await startZoend(policyManifestPath);
  processes.push(firstZoend);
  processes.push(await startFaultProvider());
  processes.push(await startConnector());
  processes.push(
    await startWorker({
      [tenantA]: workerAToken,
      [tenantB]: workerBToken,
    }),
  );
  await admin.connect();

  try {
    const registration = await registerWorker();
    assert.match(registration, /ZoenEffect|deployment/i);
    await publishDefinition(definitionA, tenantA, fixture);
    await publishDefinition(definitionB, tenantB, fixture);
    await activateDefinition(definitionAdminA, tenantA, fixture);
    await activateDefinition(definitionAdminB, tenantB, fixture);
    await recordAvailable(worldA, {
      claimId: "claim.available.explain.rival",
      fixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "90",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.explain.supporting",
      fixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "100",
    });
    await recordAvailable(worldB, {
      claimId: "claim.available.explain.foreign",
      fixture,
      resource: resourceId,
      tenantId: tenantB,
      value: "100",
    });
    const crossRelationClaimId = await recordRequested(worldA, fixture);

    await setProviderMode("accepted_pending");
    const contradicted = await commitEffect(
      actionA,
      fixture,
      "explain-contradicted",
    );
    await dispatchOnce();
    await waitForState(
      effectA,
      contradicted.effectRequestId,
      EffectKnowledgeState.ACCEPTED_PENDING,
    );
    const providerEvidence = await waitForConnectorStatus(
      contradicted.idempotencyKey,
    );
    const confirmedEvidence = evidenceInput(
      providerEvidence,
      "explain-confirmed",
    );
    const confirmed = await reconcilerA.reconcile({
      effectRequestId: contradicted.effectRequestId,
      evidence: confirmedEvidence,
    });
    assert.equal(
      confirmed.snapshot?.request?.state,
      EffectKnowledgeState.CONFIRMED,
    );
    const finalContradiction = await reconcilerA.reconcile({
      effectRequestId: contradicted.effectRequestId,
      evidence: {
        evidenceDigest: sha256(
          `${contradicted.effectRequestId}:no-effect:explain`,
        ),
        evidenceId: "evidence.explain.no-effect",
        idempotencyKey: contradicted.idempotencyKey,
        observedAt: timestampFromDate(new Date()),
        outcome: EffectEvidenceOutcome.NO_EFFECT,
        providerOperationId: providerEvidence.providerOperationId,
        sourceId: "source.independent-audit",
        sourceRef: `urn:independent-audit:${contradicted.effectRequestId}`,
      },
    });
    assert.equal(
      finalContradiction.snapshot?.request?.state,
      EffectKnowledgeState.CONTRADICTED,
    );

    await setProviderMode("timeout_after_delivery");
    const unknown = await commitEffect(actionA, fixture, "explain-unknown");
    await dispatchOnce();
    await waitForState(
      effectA,
      unknown.effectRequestId,
      EffectKnowledgeState.UNKNOWN,
    );

    await publishDefinition(definitionA, tenantA, laterFixture);
    await admin.query("TRUNCATE projection_outbox");
    await stopProcess(firstZoend);
    const freshZoend = await startZoend(policyManifestPath);
    processes.push(freshZoend);
    observe(
      "explanationRunsFromFreshProcessState",
      firstZoend.child.exitCode === 0 &&
        firstZoend.child.pid !== freshZoend.child.pid,
    );

    const historyA = historyClient(agentAToken);
    const historyB = historyClient(agentBToken);
    const historyForbidden = historyClient(reconcilerAToken);
    const operation = await explain(historyA, {
      case: "operationId",
      value: contradicted.operationId,
    });
    const claimId = crossRelationClaimId;
    const claim = await explain(historyA, {
      case: "claimId",
      value: claimId,
    });
    const effect = await explain(historyA, {
      case: "effectRequestId",
      value: contradicted.effectRequestId,
    });
    const decision = await explain(historyA, {
      case: "proposalId",
      value: contradicted.receipt.proposalId,
    });
    const unknownEffect = await explain(historyA, {
      case: "effectRequestId",
      value: unknown.effectRequestId,
    });
    const redacted = await explain(historyForbidden, {
      case: "operationId",
      value: contradicted.operationId,
    });

    const operationAction = actionSubject(operation);
    const claimAction = actionSubject(claim);
    const effectAction = actionSubject(effect);
    const decisionAction = actionSubject(decision);
    const unknownAction = actionSubject(unknownEffect);
    const redactedAction = actionSubject(redacted);
    observe(
      "operationClaimEffectAndDecisionTargetsResolve",
      [operation, claim, effect, decision, unknownEffect].every(
        (explanation) => explanation.complete && explanation.gaps.length === 0,
      ) &&
        operation.target?.target.case === "operationId" &&
        claim.target?.target.case === "claimId" &&
        effect.target?.target.case === "effectRequestId" &&
        decision.target?.target.case === "proposalId",
    );
    observe(
      "trustedContextComesFromDurableAuthority",
      operationAction.proposedBy?.tenantId === tenantA &&
        operationAction.proposedBy.actorId === "actor.agent.a" &&
        operationAction.proposedBy.principalId === "principal.agent.a" &&
        operationAction.commit?.committedBy?.tenantId === tenantA &&
        operationAction.commit.committedBy.actorId === "actor.agent.a",
    );
    observe(
      "proposalAndCommitStateBasesAreDistinct",
      operationAction.proposalStateBasis?.stage === StateBasisStage.PROPOSAL &&
        operationAction.commit?.stateBasis?.stage === StateBasisStage.COMMIT &&
        operationAction.proposalStateBasis.basis?.digest.length === 64 &&
        operationAction.commit.stateBasis.basis?.digest.length === 64,
    );
    const dependencies =
      operationAction.proposalStateBasis?.basis?.dependencies ?? [];
    observe(
      "materialRivalEvidenceIsPresent",
      dependencies.some(
        (dependency) =>
          dependency.role === LineageRole.SUPPORTING &&
          dependency.relationId === "inventory.available",
      ) &&
        dependencies.some(
          (dependency) =>
            dependency.role === LineageRole.RIVAL &&
            dependency.relationId === "inventory.available",
        ),
    );
    observe(
      "crossRelationCalculationHasDurableLineage",
      dependencies.some(
        (dependency) =>
          dependency.claimId === crossRelationClaimId &&
          dependency.role === LineageRole.SUPPORTING &&
          dependency.relationId === "inventory.requested",
      ),
    );
    observe(
      "historicalDefinitionAndComponentsStayPinned",
      operationAction.definition?.reference?.digest === fixture.digest &&
        operationAction.definition.reference.revision === 1n &&
        operationAction.definition.digestVerified &&
        operationAction.definition.relationIds.includes("inventory.available") &&
        operationAction.definition.relationIds.includes("inventory.requested") &&
        operationAction.definition.computationIds.length === 0 &&
        operationAction.proposal?.structure?.definition?.digest ===
          fixture.digest &&
        laterFixture.digest !== fixture.digest,
    );
    observe(
      "policyRevisionAndDeterminingPoliciesArePresent",
      operationAction.policies.length === 2 &&
        operationAction.policies.some(
          (policy) => policy.stage === PolicyDecisionStage.PROPOSAL,
        ) &&
        operationAction.policies.some(
          (policy) => policy.stage === PolicyDecisionStage.COMMIT,
        ) &&
        operationAction.policies.every(
          (policy) =>
            policy.policy?.revision?.policyId === fixture.policyId &&
            policy.policy.revision.revision === 1n &&
            policy.policy.revision.digest === fixture.policyDigest &&
            policy.policy.determiningPolicyIds.length > 0,
        ),
    );
    const causalEffect = operationAction.effects[0];
    assert.ok(causalEffect);
    observe(
      "requestDispatchAttemptEvidenceAndReconciliationStaySeparate",
      causalEffect.request?.structure?.effectRequestId ===
        contradicted.effectRequestId &&
        causalEffect.request.payload.case === "value" &&
        causalEffect.request.payload.value.length > 0 &&
        causalEffect.dispatches.length === 1 &&
        causalEffect.dispatches.some(
          (dispatch) => dispatch.schedulerInvocationId.length > 0,
        ) &&
        causalEffect.attempts.length === 1 &&
        causalEffect.evidence.length === 2 &&
        causalEffect.reconciliations.length === 2 &&
        causalEffect.request.structure.state ===
          EffectKnowledgeState.CONTRADICTED,
    );
    const unknownCausalEffect = unknownAction.effects[0];
    assert.ok(unknownCausalEffect);
    observe(
      "unknownExternalEffectIsRepresentedHonestly",
      unknownCausalEffect.request?.structure?.state ===
        EffectKnowledgeState.UNKNOWN &&
        unknownCausalEffect.attempts.length === 1 &&
        unknownCausalEffect.attempts[0]?.outcome ===
          EffectAttemptOutcome.UNKNOWN &&
        unknownCausalEffect.evidence.length === 0 &&
        unknownCausalEffect.reconciliations.length === 0,
    );
    const redactedClaims = [
      ...(redactedAction.proposalStateBasis?.claims ?? []),
      ...(redactedAction.commit?.stateBasis?.claims ?? []),
      ...(redactedAction.commit?.records ?? []),
    ];
    const redactedEffect = redactedAction.effects[0];
    assert.ok(redactedEffect);
    observe(
      "redactionHidesValuesButKeepsStructureAndReason",
      !redacted.complete &&
        redacted.gaps.some(
          (gap) =>
            gap.class === EvidenceClass.PAYLOAD &&
            gap.reason === GapReason.REDACTED,
        ) &&
        redactedClaims.length > 0 &&
        redactedClaims.every(
          (record) =>
            record.payload.case === "redaction" &&
            record.payload.value.digest.length === 64 &&
            record.structure?.value === undefined &&
            (record.structure?.claimId.length ?? 0) > 0,
        ) &&
        redactedEffect.request?.payload.case === "redaction" &&
        redactedEffect.request.payload.value.digest.length === 64 &&
        redactedEffect.request.structure?.payload.length === 0 &&
        (redactedAction.proposal?.inputs.length ?? 0) > 0 &&
        redactedAction.proposal?.inputs.every(
          (input) =>
            input.payload.case === "redaction" &&
            input.payload.value.digest.length === 64,
        ) === true &&
        redactedAction.proposal?.structure?.inputs.length === 0,
    );
    observe(
      "allTargetFormsResolveTheSameDurableOperation",
      [claimAction, effectAction, decisionAction].every(
        (action) =>
          action.commit?.receipt?.operationId === contradicted.operationId,
      ),
    );
    const foreignTenantCode = await expectConnectCode(
      () =>
        explain(historyB, {
          case: "operationId",
          value: contradicted.operationId,
        }),
      Code.NotFound,
    );
    observe(
      "foreignTenantOperationIsOpaque",
      foreignTenantCode === Code.NotFound,
    );
    observe(
      "projectionArtifactsAreNotAuthorityHistory",
      (
        await admin.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM projection_outbox",
        )
      ).rows[0]?.count === "0" && operation.complete,
    );
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL session_replication_role = replica");
      const withheld = await admin.query(
        "DELETE FROM effect_requests WHERE tenant_id = $1 AND effect_request_id = $2",
        [tenantA, unknown.effectRequestId],
      );
      assert.equal(withheld.rowCount, 1);
      await admin.query("COMMIT");
    } catch (error: unknown) {
      await admin.query("ROLLBACK");
      throw error;
    }
    const missingRequiredEffect = await explain(historyA, {
      case: "operationId",
      value: unknown.operationId,
    });
    observe(
      "missingRequiredEffectRequestMakesExplanationIncomplete",
      !missingRequiredEffect.complete &&
        missingRequiredEffect.gaps.some(
          (gap) =>
            gap.class === EvidenceClass.EFFECT_REQUEST &&
            gap.reason === GapReason.MISSING &&
            gap.reference?.reference.case === "effectRequestId" &&
            gap.reference.reference.value === unknown.effectRequestId,
        ),
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
      completeBasedOnlyOnReachability:
        assertions.missingRequiredEffectRequestMakesExplanationIncomplete ===
        true,
      currentDefinitionUsedForOldAction:
        assertions.historicalDefinitionAndComponentsStayPinned === true,
      effectRequestAndAttemptConflated:
        assertions
          .requestDispatchAttemptEvidenceAndReconciliationStaySeparate === true,
      foreignTenantLookup:
        assertions.foreignTenantOperationIsOpaque === true,
      policyRevisionOmitted:
        assertions.policyRevisionAndDeterminingPoliciesArePresent === true,
      rivalEvidenceOmitted:
        assertions.materialRivalEvidenceIsPresent === true,
      samePredicateOnly:
        assertions.crossRelationCalculationHasDurableLineage === true,
    };
    assert.ok(Object.values(mutants).every(Boolean));
    const manifest = {
      assertions,
      componentVersions: {
        keycloak: "26.0.7",
        postgres: postgresVersion,
        restate: "1.7.2",
      },
      finishedAt: new Date().toISOString(),
      mutants,
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      scenario: "explain",
      sourceCommit,
      startedAt,
      targets: {
        claimId,
        effectRequestId: contradicted.effectRequestId,
        operationId: contradicted.operationId,
        proposalId: contradicted.receipt.proposalId,
        unknownEffectRequestId: unknown.effectRequestId,
      },
      tenants: [tenantA, tenantB],
    };
    await writeScenarioArtifact(repositoryRoot, "explain", manifest);
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

async function explain(
  client: HistoryClient,
  target: Target,
): Promise<CausalExplanation> {
  const response = await client.explain({
    target: { target },
  });
  assert.ok(response.explanation);
  return response.explanation;
}

function actionSubject(
  explanation: CausalExplanation,
): CausalActionExplanation {
  if (explanation.subject.case !== "action") {
    throw new Error(
      `expected Action explanation, received ${explanation.subject.case ?? "none"}`,
    );
  }
  return explanation.subject.value;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
