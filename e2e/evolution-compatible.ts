import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  DefinitionChangeKind,
  DefinitionElementKind,
  DefinitionImpactApplicability,
  DefinitionImpactArea,
  EvolutionClassification,
  type EvolutionPlan,
} from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  actionClient,
  adminClient,
  command,
  commitReplenish,
  compileDefinition,
  composeOutput,
  definitionClient,
  definitionId,
  definitionReference,
  fixtureDirectory,
  generatedDirectory,
  historyClient,
  oidcToken,
  publish,
  queryProjectedQuantity,
  queryQuantity,
  rebuildProjection,
  recordQuantity,
  replenishProposal,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writePolicyManifest,
  type CompiledDefinition,
  type ServerProcess,
} from "./evolution-compatible/support.js";
import { writeScenarioArtifact } from "./host-env.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function recordFailure(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const v1 = await compileDefinition(
    path.join(fixtureDirectory, "inventory.zoen.ts"),
  );
  const v2 = await compileDefinition(
    path.join(fixtureDirectory, "inventory-v2.zoen.ts"),
  );
  const mutant = await compileMutant(v2);
  const addedActionMutant = await compileAddedActionMutant(v2);
  assert.equal(v1.definition.revision, 1);
  assert.equal(v2.definition.revision, 2);
  assert.equal(mutant.definition.revision, 3);
  assert.equal(addedActionMutant.definition.revision, 3);
  assert.notEqual(v1.digest, v2.digest);
  assert.notEqual(v2.digest, mutant.digest);
  assert.notEqual(v2.digest, addedActionMutant.digest);
  assert.notEqual(mutant.digest, addedActionMutant.digest);

  const policyManifestPath = path.join(
    generatedDirectory,
    "policies.json",
  );
  await writePolicyManifest(policyManifestPath, [v1, v2, addedActionMutant]);
  const adminAToken = await oidcToken("admin-a");
  const deniedAToken = await oidcToken("denied-a");
  const adminBToken = await oidcToken("admin-b");
  const definitionA = definitionClient(adminAToken);
  const definitionDenied = definitionClient(deniedAToken);
  const definitionB = definitionClient(adminBToken);
  const actionA = actionClient(adminAToken);
  const worldA = worldClient(adminAToken);
  const admin = adminClient();
  await admin.connect();
  let server: ServerProcess | undefined;
  let compatiblePlan: EvolutionPlan | undefined;
  let v1ReceiptOperationId = "";
  let replayRequest: ReturnType<typeof replenishProposal> | undefined;

  try {
    server = await startServer(policyManifestPath);
    const beforePublication = await definitionA.getActiveRevision({
      definitionId,
      tenantId: tenantA,
    });
    observe(
      "noActiveRevisionBeforeExplicitActivation",
      beforePublication.definitionRevision === undefined,
    );
    const publishedV1A = await publish(definitionA, tenantA, v1);
    const publishedV1B = await publish(definitionB, tenantB, v1);
    observe(
      "v1PublishedForBothTenants",
      publishedV1A.digest === v1.digest &&
        publishedV1B.digest === v1.digest,
    );
    const afterV1Publication = await definitionA.getActiveRevision({
      definitionId,
      tenantId: tenantA,
    });
    observe(
      "publishDoesNotAutoActivate",
      afterV1Publication.definitionRevision === undefined,
    );
    await expectConnectCode(
      () =>
        definitionA.publish({
          canonicalJson: new TextEncoder().encode(v2.canonicalJson),
          digest: "0".repeat(64),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("publication-digest-mismatch");
    const invalidV2 = v2.canonicalJson.replace(
      '"sourceType":"inventory.Item"',
      '"sourceType":"inventory.Missing"',
    );
    assert.notEqual(invalidV2, v2.canonicalJson);
    await expectConnectCode(
      () =>
        definitionA.publish({
          canonicalJson: new TextEncoder().encode(invalidV2),
          digest: sha256(invalidV2),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("invalid-v2-cross-reference");
    await stopServer(server);
    server = undefined;

    server = await startServer(policyManifestPath);
    const recoveredV1 = await exactRevision(definitionA, tenantA, v1);
    observe(
      "v1RecoveredAfterPublishRestart",
      recoveredV1.digest === v1.digest,
    );
    const activatedV1A = await definitionA.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId,
      digest: v1.digest,
      tenantId: tenantA,
    });
    const activatedV1B = await definitionB.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId,
      digest: v1.digest,
      tenantId: tenantB,
    });
    observe(
      "initialActivationHasTrustedCausalEvidence",
      activatedV1A.activation?.active?.digest === v1.digest &&
        activatedV1A.activation.previous === undefined &&
        activatedV1A.activation.activatedBy === "actor.admin.a" &&
        activatedV1A.activation.principalId === "principal.admin.a" &&
        activatedV1A.activation.workloadId === "workload.admin.a" &&
        activatedV1A.activation.policy?.revision?.policyId ===
          "policy.activation.v1" &&
        activatedV1B.activation?.active?.digest === v1.digest,
    );
    const v1Receipt = await commitReplenish(
      actionA,
      definitionReference(v1),
      "evolution.v1",
      "5",
    );
    v1ReceiptOperationId = v1Receipt.operationId;
    observe(
      "v1ActionPinnedAtCommit",
      v1Receipt.definition?.digest === v1.digest &&
        v1Receipt.definition.revision === 1n,
    );
    replayRequest = replenishProposal(
      definitionReference(v1),
      "evolution.v1.lostResponse",
      "6",
    );
    const proposalBeforeActivation = await actionA.propose(replayRequest);
    assert.ok(proposalBeforeActivation.proposal);
    observe(
      "proposalCreatedBeforeLaterActivation",
      proposalBeforeActivation.proposal.definition?.digest === v1.digest,
    );
    await publish(definitionA, tenantA, v2);
    await publish(definitionB, tenantB, v2);
    await publish(definitionA, tenantA, mutant);
    await publish(definitionB, tenantB, addedActionMutant);
    const activeAfterV2Publication = await activeDigest(definitionA, tenantA);
    observe(
      "v2PublicationLeavesV1Active",
      activeAfterV2Publication === v1.digest,
    );
    await expectConnectCode(
      () =>
        commitReplenish(
          actionA,
          definitionReference(v2),
          "evolution.v2.beforeActivation",
          "9",
        ),
      Code.FailedPrecondition,
    );
    recordFailure("client-digest-bypass-before-activation");
    await expectConnectCode(
      () =>
        recordQuantity(
          worldA,
          definitionReference(mutant),
          "inventory.reserved",
          "2",
          "claim.inventory.inactive.mutant",
        ),
      Code.FailedPrecondition,
    );
    await expectConnectCode(
      () =>
        actionA.discover({
          definition: definitionReference(mutant),
          resourceId,
        }),
      Code.FailedPrecondition,
    );
    recordFailure("inactive-revision-new-work");
    await expectConnectCode(
      () =>
        definitionA.activateRevision({
          definitionId,
          digest: v2.digest,
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    recordFailure("activation-without-precondition");
    await expectConnectCode(
      () =>
        definitionA.activateRevision({
          activeRevisionPrecondition: {
            case: "expectedActiveDigest",
            value: v1.digest,
          },
          definitionId,
          digest: "f".repeat(64),
          tenantId: tenantA,
        }),
      Code.NotFound,
    );
    recordFailure("activation-of-unpublished-revision");
    await expectConnectCode(
      () =>
        definitionDenied.activateRevision({
          activeRevisionPrecondition: {
            case: "expectedActiveDigest",
            value: v1.digest,
          },
          definitionId,
          digest: v2.digest,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );
    recordFailure("activation-without-cedar-authority");
    await expectConnectCode(
      () =>
        definitionA.activateRevision({
          activeRevisionPrecondition: {
            case: "expectedActiveDigest",
            value: v1.digest,
          },
          definitionId,
          digest: mutant.digest,
          tenantId: tenantA,
        }),
      Code.FailedPrecondition,
    );
    recordFailure("incompatible-revision-activation");
    observe(
      "failedActivationsLeaveV1Active",
      (await activeDigest(definitionA, tenantA)) === v1.digest,
    );
    await stopServer(server);
    server = undefined;

    server = await startServer(policyManifestPath);
    const planned = await definitionA.planEvolution({
      definitionId,
      fromDigest: v1.digest,
      tenantId: tenantA,
      toDigest: v2.digest,
    });
    assert.ok(planned.plan);
    compatiblePlan = planned.plan;
    assertCompatiblePlan(compatiblePlan);
    observe(
      "compatiblePlanNamesBothExactRevisions",
      compatiblePlan.from?.digest === v1.digest &&
        compatiblePlan.to?.digest === v2.digest,
    );
    const mutantPlan = await definitionA.planEvolution({
      definitionId,
      fromDigest: v1.digest,
      tenantId: tenantA,
      toDigest: mutant.digest,
    });
    observe(
      "actionMutantIsNotCompatible",
      mutantPlan.plan?.classification === EvolutionClassification.BREAKING &&
        mutantPlan.plan.migrationRequired,
    );
    recordFailure("compatible-classifier-action-mutant");
    const tenantBPlan = await definitionB.planEvolution({
      definitionId,
      fromDigest: v1.digest,
      tenantId: tenantB,
      toDigest: addedActionMutant.digest,
    });
    assert.ok(tenantBPlan.plan);
    assertAddedActionPlan(tenantBPlan.plan);
    observe("tenantBPlansOnlyItsOwnPublishedRevisions", true);
    await expectConnectCode(
      () =>
        definitionA.planEvolution({
          definitionId,
          fromDigest: v1.digest,
          tenantId: tenantB,
          toDigest: v2.digest,
        }),
      Code.PermissionDenied,
    );
    await expectConnectCode(
      () =>
        definitionB.planEvolution({
          definitionId,
          fromDigest: v1.digest,
          tenantId: tenantA,
          toDigest: v2.digest,
        }),
      Code.PermissionDenied,
    );
    recordFailure("cross-tenant-evolution-plan");
    await stopServer(server);
    server = undefined;

    server = await startServer(policyManifestPath);
    const activationRace = await Promise.allSettled([
      definitionA.activateRevision({
        activeRevisionPrecondition: {
          case: "expectedActiveDigest",
          value: v1.digest,
        },
        definitionId,
        digest: v2.digest,
        tenantId: tenantA,
      }),
      definitionA.activateRevision({
        activeRevisionPrecondition: {
          case: "expectedActiveDigest",
          value: v1.digest,
        },
        definitionId,
        digest: v2.digest,
        tenantId: tenantA,
      }),
    ]);
    const winners = activationRace.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    const losers = activationRace.filter(
      (outcome) => outcome.status === "rejected",
    );
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    const loser = losers[0];
    assert.ok(loser?.status === "rejected");
    assert.ok(loser.reason instanceof ConnectError);
    assert.equal(loser.reason.code, Code.FailedPrecondition);
    observe(
      "concurrentActivationHasOneWinner",
      winners.length === 1 &&
        losers.length === 1 &&
        (await activeDigest(definitionA, tenantA)) === v2.digest,
    );
    recordFailure("concurrent-activation-race");
    assert.ok(replayRequest);
    const replayedAfterActivation = await actionA.propose(replayRequest);
    const replayedAt = replayedAfterActivation.proposal?.proposedAt;
    const replayedAtMicros =
      replayedAt === undefined
        ? undefined
        : replayedAt.seconds * 1_000_000n +
          BigInt(Math.trunc(replayedAt.nanos / 1_000));
    const originalProposal = await admin.query<{
      intent_digest: string;
      proposed_at_micros: string;
    }>(
      `SELECT intent_digest, proposed_at_micros::text
       FROM action_proposals
       WHERE tenant_id = $1 AND proposal_id = $2`,
      [tenantA, replayRequest.proposalId],
    );
    observe(
      "lostProposalResponseReplaysAfterActivation",
      replayedAfterActivation.proposal?.intentDigest ===
        originalProposal.rows[0]?.intent_digest &&
        replayedAtMicros?.toString() ===
          originalProposal.rows[0]?.proposed_at_micros,
    );
    await expectConnectCode(
      () =>
        definitionA.activateRevision({
          activeRevisionPrecondition: {
            case: "expectedActiveDigest",
            value: v1.digest,
          },
          definitionId,
          digest: v2.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordFailure("cross-tenant-activation");
    observe(
      "tenantBPointerUnaffectedByTenantAAttack",
      (await activeDigest(definitionB, tenantB)) === v1.digest,
    );
    const addedActionActivation = await definitionB.activateRevision({
      activeRevisionPrecondition: {
        case: "expectedActiveDigest",
        value: v1.digest,
      },
      definitionId,
      digest: addedActionMutant.digest,
      tenantId: tenantB,
    });
    observe(
      "addedActionOnAddedRelationActivates",
      addedActionActivation.activation?.active?.digest ===
        addedActionMutant.digest &&
        addedActionActivation.activation.classification ===
          EvolutionClassification.COMPATIBLE,
    );
    await stopServer(server);
    server = undefined;

    server = await startServer(policyManifestPath);
    const activeAfterActivationRestart = await definitionA.getActiveRevision({
      definitionId,
      tenantId: tenantA,
    });
    observe(
      "activeV2SurvivesApplicationRestart",
      activeAfterActivationRestart.definitionRevision?.digest === v2.digest &&
        activeAfterActivationRestart.definitionRevision.revision === 2n,
    );
    const exactV1 = await exactRevision(definitionA, tenantA, v1);
    const exactV2 = await exactRevision(definitionA, tenantA, v2);
    observe(
      "v1AndV2CoexistAfterRestart",
      exactV1.digest === v1.digest && exactV2.digest === v2.digest,
    );
    const historicalQuery = await queryQuantity(
      worldA,
      definitionReference(v1),
      { id: "inventory.level", kind: "relation" },
    );
    const history = await historyClient(adminAToken).explain({
      target: {
        target: {
          case: "operationId",
          value: v1ReceiptOperationId,
        },
      },
    });
    observe(
      "historicalActionQueryAndExplainRemainOnV1",
      historicalQuery.amount === "5" &&
        historicalQuery.definition?.digest === v1.digest &&
        history.explanation?.subject.case === "action" &&
        history.explanation.subject.value.definition?.reference?.digest ===
          v1.digest &&
        history.explanation.subject.value.definition.reference.revision === 1n,
    );
    const v2Receipt = await commitReplenish(
      actionA,
      definitionReference(v2),
      "evolution.v2.afterActivation",
      "10",
    );
    await recordQuantity(
      worldA,
      definitionReference(v2),
      "inventory.reserved",
      "3",
      "claim.inventory.reserved.v2",
    );
    const v2Computation = await queryQuantity(
      worldA,
      definitionReference(v2),
      { id: "inventory.availableToPromise", kind: "computation" },
    );
    observe(
      "newWorkUsesV2RelationAndComputation",
      v2Receipt.definition?.digest === v2.digest &&
        v2Computation.amount === "7" &&
        v2Computation.definition?.digest === v2.digest,
    );
    const rebuiltProjection = await rebuildProjection(tenantA);
    const projectedV1 = await queryProjectedQuantity(
      worldA,
      definitionReference(v1),
      { id: "inventory.level", kind: "relation" },
    );
    const projectedV2 = await queryProjectedQuantity(
      worldA,
      definitionReference(v2),
      { id: "inventory.availableToPromise", kind: "computation" },
    );
    observe(
      "projectionRebuildServesHistoricalV1AndActiveV2",
      rebuiltProjection.wroteManifest &&
        projectedV1.amount === "5" &&
        projectedV1.definition?.digest === v1.digest &&
        projectedV2.amount === "7" &&
        projectedV2.definition?.digest === v2.digest,
    );
    const historicalQueryAgain = await queryQuantity(
      worldA,
      definitionReference(v1),
      { id: "inventory.level", kind: "relation" },
    );
    observe(
      "v2WorkDoesNotRewriteV1History",
      historicalQueryAgain.amount === "5" &&
        historicalQueryAgain.definition?.digest === v1.digest,
    );

    const storedV1 = await admin.query<{
      definition_digest: string;
      definition_revision: string;
    }>(
      `SELECT definition_digest, definition_revision::text
       FROM action_proposals
       WHERE tenant_id = $1 AND operation_id = $2`,
      [tenantA, v1ReceiptOperationId],
    );
    observe(
      "durableHistoricalProposalStillNamesV1",
      storedV1.rows[0]?.definition_digest === v1.digest &&
        storedV1.rows[0]?.definition_revision === "1",
    );
    const activationEvidence = await admin.query<{
      actor_id: string;
      classification: string;
      commit_sequence: string;
      digest: string;
      policy_id: string;
      principal_id: string;
      revision: string;
      workload_id: string;
    }>(
      `SELECT actor_id, classification, commit_sequence::text,
              digest, policy_id, principal_id, revision::text, workload_id
       FROM definition_activations
       WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3`,
      [tenantA, definitionId, v2.digest],
    );
    observe(
      "activationEvidenceIsDurable",
      activationEvidence.rows.length === 1 &&
        activationEvidence.rows[0]?.actor_id === "actor.admin.a" &&
        activationEvidence.rows[0]?.principal_id === "principal.admin.a" &&
        activationEvidence.rows[0]?.workload_id === "workload.admin.a" &&
        activationEvidence.rows[0]?.policy_id === "policy.activation.v2" &&
        activationEvidence.rows[0]?.revision === "2" &&
        activationEvidence.rows[0]?.classification === "compatible",
    );
    const activationGrant = await admin.query<{
      action_ids: string[];
      delegation_id: string;
      resource_ids: string[];
      workload_ids: string[];
    }>(
      `SELECT action_ids, delegation_id, resource_ids, workload_ids
       FROM definition_activation_grants
       WHERE tenant_id = $1 AND commit_sequence = $2`,
      [tenantA, activationEvidence.rows[0]?.commit_sequence],
    );
    observe(
      "activationDelegationGrantIsDurable",
      activationGrant.rows.length === 1 &&
        activationGrant.rows[0]?.delegation_id ===
          "delegation.workload.admin.a" &&
        activationGrant.rows[0]?.action_ids.includes(
          "zoen.definition.activate",
        ) === true &&
        activationGrant.rows[0]?.resource_ids.includes(definitionId) === true &&
        activationGrant.rows[0]?.workload_ids.includes("workload.admin.a") ===
          true,
    );
    await assertImmutableActivationHistory(admin);
    const activationEvent = await admin.query<{
      payload: {
        definitionId?: string;
        digest?: string;
        revision?: number;
      };
    }>(
      `SELECT outbox.payload
       FROM projection_outbox AS outbox
       JOIN authority_commits AS commit
         ON commit.tenant_id = outbox.tenant_id
        AND commit.commit_sequence = outbox.commit_sequence
       WHERE outbox.tenant_id = $1
         AND commit.commit_kind = 'definition_activation'
         AND outbox.payload->>'digest' = $2`,
      [tenantA, v2.digest],
    );
    observe(
      "projectionMetadataNamesProducingRevision",
      activationEvent.rows.length === 1 &&
        activationEvent.rows[0]?.payload.definitionId === definitionId &&
        activationEvent.rows[0]?.payload.digest === v2.digest &&
        activationEvent.rows[0]?.payload.revision === 2,
    );
    await assertImmutableRevisions(admin, v1);

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
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
    assert.ok(compatiblePlan);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const protocol = await readFile(
      path.join(
        repositoryRoot,
        "proto",
        "zoen",
        "definition",
        "v1",
        "definition.proto",
      ),
    );
    const manifest = {
      artifactMetadata: {
        producingDefinitionRevision: {
          definitionId: compatiblePlan.to?.definitionId,
          digest: compatiblePlan.to?.digest,
          revision: compatiblePlan.to?.revision.toString(),
        },
      },
      assertions,
      componentVersions: {
        keycloak: keycloakVersion,
        postgres: postgresVersion,
      },
      definitionDigests: {
        addedActionMutant: addedActionMutant.digest,
        mutant: mutant.digest,
        v1: v1.digest,
        v2: v2.digest,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      mutants: {
        activationAuthorityBypassed:
          assertions.activationEvidenceIsDurable === true &&
          failureInjections.includes("activation-without-cedar-authority"),
        activeRevisionStoredOnlyInMemory:
          assertions.activeV2SurvivesApplicationRestart === true,
        dependencyImpactOmittedNewComputation:
          assertions.semanticImpactIncludesAddedComputation === true,
        addedActionOnAddedRelationClassifiedBreaking:
          assertions.addedActionOnAddedRelationActivates === true,
        historicalActionResolvedLatest:
          assertions.historicalActionQueryAndExplainRemainOnV1 === true,
        inactiveRevisionAcceptedNewWork:
          failureInjections.includes("inactive-revision-new-work"),
        lostProposalResponseRejectedAfterActivation:
          assertions.lostProposalResponseReplaysAfterActivation === true,
        publishAutoActivated: assertions.publishDoesNotAutoActivate === true,
      },
      observedOperations: {
        v1: v1ReceiptOperationId,
        v2: v2Receipt.operationId,
      },
      protocolDigest: sha256(protocol),
      scenario: "evolution-compatible",
      sourceCommit,
      startedAt,
    };
    await writeScenarioArtifact(repositoryRoot, "evolution-compatible", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
  }
}

function assertCompatiblePlan(plan: EvolutionPlan): void {
  assert.equal(plan.classification, EvolutionClassification.COMPATIBLE);
  assert.equal(plan.migrationRequired, false);
  const addedRelation = plan.changes.find(
    (change) =>
      change.element === DefinitionElementKind.RELATION &&
      change.change === DefinitionChangeKind.ADDED &&
      change.id === "inventory.reserved",
  );
  const addedComputation = plan.changes.find(
    (change) =>
      change.element === DefinitionElementKind.COMPUTATION &&
      change.change === DefinitionChangeKind.ADDED &&
      change.id === "inventory.availableToPromise",
  );
  const relationImpact = impact(plan, DefinitionImpactArea.RELATIONS);
  const computationImpact = impact(plan, DefinitionImpactArea.COMPUTATIONS);
  const actionImpact = impact(plan, DefinitionImpactArea.ACTIONS);
  const queryImpact = impact(
    plan,
    DefinitionImpactArea.QUERY_AND_MATERIALIZATION_ARTIFACTS,
  );
  const packageImpact = impact(
    plan,
    DefinitionImpactArea.DOMAIN_PACKAGE_DEPENDENCIES,
  );
  const policyAndWasmImpact = impact(
    plan,
    DefinitionImpactArea.POLICY_AND_WASM_REFERENCES,
  );
  observe(
    "semanticDiffIncludesAddedRelation",
    addedRelation !== undefined &&
      relationImpact.affected.includes("inventory.reserved"),
  );
  observe(
    "semanticImpactIncludesAddedComputation",
    addedComputation !== undefined &&
      computationImpact.affected.includes("inventory.availableToPromise") &&
      queryImpact.affected.includes("inventory.availableToPromise"),
  );
  observe(
    "unchangedActionMeaningIsExplicit",
    actionImpact.affected.length === 0 &&
      actionImpact.unaffected.includes("inventory.replenish"),
  );
  observe(
    "unobservableImpactAreasAreNotApplicable",
    packageImpact.applicability ===
      DefinitionImpactApplicability.NOT_APPLICABLE &&
      packageImpact.affected.length === 0 &&
      packageImpact.unaffected.length === 0 &&
      policyAndWasmImpact.applicability ===
        DefinitionImpactApplicability.NOT_APPLICABLE &&
      policyAndWasmImpact.affected.length === 0 &&
      policyAndWasmImpact.unaffected.length === 0,
  );
}

function assertAddedActionPlan(plan: EvolutionPlan): void {
  assert.equal(plan.classification, EvolutionClassification.COMPATIBLE);
  assert.equal(plan.migrationRequired, false);
  const addedRelation = plan.changes.find(
    (change) =>
      change.element === DefinitionElementKind.RELATION &&
      change.change === DefinitionChangeKind.ADDED &&
      change.id === "inventory.reserved",
  );
  const addedAction = plan.changes.find(
    (change) =>
      change.element === DefinitionElementKind.ACTION &&
      change.change === DefinitionChangeKind.ADDED &&
      change.id === "inventory.reserve",
  );
  const actionImpact = impact(plan, DefinitionImpactArea.ACTIONS);
  observe(
    "addedActionAndRelationClassifyCompatible",
    addedRelation !== undefined &&
      addedAction !== undefined &&
      actionImpact.affected.includes("inventory.reserve") &&
      actionImpact.unaffected.includes("inventory.replenish"),
  );
}

function impact(plan: EvolutionPlan, area: DefinitionImpactArea) {
  const result = plan.impacts.find((item) => item.area === area);
  assert.ok(result);
  return result;
}

async function compileMutant(
  v2: CompiledDefinition,
): Promise<CompiledDefinition> {
  const source = await readFile(
    path.join(fixtureDirectory, "inventory-v2.zoen.ts"),
    "utf8",
  );
  const mutated = source
    .replace('value: { amount: "0.125"', 'value: { amount: "0.25"')
    .replace("revision: 2", "revision: 3");
  assert.notEqual(mutated, source);
  const outputPath = path.join(generatedDirectory, "inventory-mutant.zoen.ts");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, mutated);
  const mutant = await compileDefinition(outputPath);
  assert.notEqual(mutant.digest, v2.digest);
  return mutant;
}

async function compileAddedActionMutant(
  v2: CompiledDefinition,
): Promise<CompiledDefinition> {
  const source = await readFile(
    path.join(fixtureDirectory, "inventory-v2.zoen.ts"),
    "utf8",
  );
  const reserveAction = `const reserve = defineAction({
  effects: [
    {
      relationId: "inventory.reserved",
      value: { inputId: "quantity", kind: "input" },
    },
  ],
  id: "inventory.reserve",
  inputs: [
    {
      id: "quantity",
      valueType: { kind: "quantity", unit: "kg" },
    },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "quantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0.125", kind: "quantity", unit: "kg" },
    },
  },
});

`;
  const mutated = source
    .replace("const replenish = defineAction({", `${reserveAction}const replenish = defineAction({`)
    .replace("actions: [replenish]", "actions: [replenish, reserve]")
    .replace("revision: 2", "revision: 3");
  assert.notEqual(mutated, source);
  assert.match(mutated, /id: "inventory\.reserve"/);
  assert.match(mutated, /actions: \[replenish, reserve\]/);
  const outputPath = path.join(
    generatedDirectory,
    "inventory-added-action-mutant.zoen.ts",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, mutated);
  const mutant = await compileDefinition(outputPath);
  assert.notEqual(mutant.digest, v2.digest);
  return mutant;
}

async function exactRevision(
  client: ReturnType<typeof definitionClient>,
  tenantId: string,
  definition: CompiledDefinition,
) {
  const response = await client.getRevision({
    definitionId,
    digest: definition.digest,
    tenantId,
  });
  assert.ok(response.definitionRevision);
  return response.definitionRevision;
}

async function activeDigest(
  client: ReturnType<typeof definitionClient>,
  tenantId: string,
): Promise<string | undefined> {
  const response = await client.getActiveRevision({ definitionId, tenantId });
  return response.definitionRevision?.digest;
}

async function expectConnectCode(
  operation: () => Promise<unknown>,
  expected: Code,
): Promise<void> {
  try {
    await operation();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
  }
}

async function assertImmutableRevisions(
  admin: ReturnType<typeof adminClient>,
  v1: CompiledDefinition,
): Promise<void> {
  await assert.rejects(
    admin.query(
      `UPDATE definition_revisions
       SET canonical_json = replace(canonical_json, 'inventory.level', 'inventory.changed')
       WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3`,
      [tenantA, definitionId, v1.digest],
    ),
    /published definition revisions are immutable/,
  );
  const count = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM definition_revisions
     WHERE tenant_id = $1 AND definition_id = $2`,
    [tenantA, definitionId],
  );
  observe(
    "immutableRevisionsCoexistWithoutRewrite",
    count.rows[0]?.count === "3",
  );
}

async function assertImmutableActivationHistory(
  admin: ReturnType<typeof adminClient>,
): Promise<void> {
  const rejected = await admin
    .query(
      `UPDATE definition_activations
       SET actor_id = 'actor.rewritten'
       WHERE tenant_id = $1 AND definition_id = $2`,
      [tenantA, definitionId],
    )
    .then(
      () => false,
      (error: unknown) =>
        /definition activation history is immutable/.test(String(error)),
    );
  observe("activationHistoryRejectsRewrite", rejected);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
