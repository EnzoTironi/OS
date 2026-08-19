import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  ActionInputSchema,
  ActionService,
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
  type ActionInput,
  type Proposal,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";

const repositoryRoot = process.cwd();
const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "governed-action",
);
const generatedDirectory = path.join(scenarioDirectory, ".generated");
const serverPath = path.join(repositoryRoot, "target", "debug", "zoend");
const composeFile = path.join("e2e", "governed-action", "compose.yaml");
const composeProject = "zoen-governed-action";
const applicationDatabaseUrl =
  "postgres://zoen_app:zoen_app@127.0.0.1:55434/zoen";
const adminDatabaseUrl =
  "postgres://postgres:postgres@127.0.0.1:55434/zoen";
const baseUrl = "http://127.0.0.1:58083";
const oidcIssuer = "http://127.0.0.1:58082/realms/zoen";
const oidcAudience = "zoend";
const actionId = "inventory.requestStock";
const definitionId = "inventory.governed";
const resourceId = "inventory.item.1";
const unrelatedResourceId = "inventory.item.unrelated";
const availableRelation = "inventory.available";
const tenantA = "tenant.a";
const tenantB = "tenant.b";
const validAt = new Date("2026-08-19T00:00:00.000Z");

type ActionClient = Client<typeof ActionService>;
type DefinitionClient = Client<typeof DefinitionService>;
type WorldClient = Client<typeof WorldService>;

interface DefinitionFixture {
  canonicalJson: string;
  definition: DefinitionReference;
  digest: string;
  policyDigest: string;
  policyId: string;
  policyRevision: number;
  policySource: string;
}

interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

interface DatabaseSnapshot {
  actionApprovals: number;
  actionOperations: number;
  actionProposals: number;
  authorityCommits: number;
  projectionOutbox: number;
  semanticClaims: number;
}

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
  })
  .passthrough();

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function recordAssertion(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function recordFailureInjection(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixtures = {
    deny: await loadFixture("deny", 3),
    direct: await loadFixture("direct", 1),
    error: await loadFixture("error", 4),
    human: await loadFixture("human", 2),
  };
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, Object.values(fixtures));

  const agentAToken = await oidcToken("agent-a");
  const approverAToken = await oidcToken("approver-a");
  const agentBToken = await oidcToken("agent-b");
  const expandedToken = await oidcToken("expanded-a");
  const wrongAudienceToken = await oidcToken("wrong-audience-a");
  const expiredToken = await oidcToken("expired-a");

  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  const actionA = actionClient(agentAToken);
  const approverA = actionClient(approverAToken);
  const actionB = actionClient(agentBToken);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  let server = await startServer(policyManifestPath);
  await admin.connect();

  try {
    for (const fixture of Object.values(fixtures)) {
      await publishDefinition(definitionA, tenantA, fixture);
    }
    await publishDefinition(definitionB, tenantB, fixtures.direct);

    await recordAvailable(worldA, {
      claimId: "claim.available.direct.a",
      fixture: fixtures.direct,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.human.a",
      fixture: fixtures.human,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.deny.a",
      fixture: fixtures.deny,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.error.a",
      fixture: fixtures.error,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    await recordAvailable(worldB, {
      claimId: "claim.available.direct.b",
      fixture: fixtures.direct,
      resource: resourceId,
      tenantId: tenantB,
      value: "20",
    });

    const directDiscovery = await actionA.discover({
      definition: fixtures.direct.definition,
      resourceId,
    });
    const trusted = directDiscovery.trustedContext;
    assert.ok(trusted);
    assert.equal(trusted.tenantId, tenantA);
    assert.equal(trusted.actorId, "actor.agent.a");
    assert.equal(trusted.principalId, "principal.agent.a");
    assert.equal(trusted.workloadId, "workload.agent.a");
    assert.equal(trusted.delegation.length, 1);
    assert.deepEqual(trusted.delegation[0]?.actionIds, [actionId]);
    assert.deepEqual(trusted.delegation[0]?.resourceIds, [resourceId]);
    assert.deepEqual(trusted.delegation[0]?.workloadIds, [
      "workload.agent.a",
    ]);
    const directCapability = directDiscovery.actions.find(
      (action) => action.actionId === actionId,
    );
    assert.ok(directCapability);
    assert.equal(directCapability.decision, PolicyDecision.PERMIT);
    assertPolicy(directCapability.policy, fixtures.direct);
    recordAssertion(
      "oidcTrustedContextDerived",
      trusted.tenantId === tenantA &&
        trusted.actorId === "actor.agent.a" &&
        trusted.principalId === "principal.agent.a" &&
        trusted.workloadId === "workload.agent.a",
    );
    recordAssertion(
      "delegationScopeExposed",
      trusted.delegation.length === 1 &&
        isDeepStrictEqual(trusted.delegation[0]?.actionIds, [actionId]) &&
        isDeepStrictEqual(trusted.delegation[0]?.resourceIds, [resourceId]) &&
        isDeepStrictEqual(trusted.delegation[0]?.workloadIds, [
          "workload.agent.a",
        ]),
    );
    recordAssertion(
      "cedarDeterminingPolicyRecorded",
      directCapability.policy?.revision?.policyId ===
        fixtures.direct.policyId &&
        directCapability.policy.determiningPolicyIds.length > 0,
    );

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
    const proposeRequest = actionProtocol.match(
      /message ProposeRequest \{(?<body>[^}]*)\}/s,
    )?.groups?.body;
    assert.ok(proposeRequest);
    assert.doesNotMatch(
      proposeRequest,
      /\b(?:actor_id|principal_id|tenant_id|workload_id)\b/,
    );
    recordAssertion(
      "identityFieldsAbsentFromActionRequest",
      !/\b(?:actor_id|principal_id|tenant_id|workload_id)\b/.test(
        proposeRequest,
      ),
    );

    const direct = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.direct",
      proposalId: "proposal.direct",
      quantity: "2",
    });
    assert.equal(direct.decision, PolicyDecision.PERMIT);
    assert.ok(direct.proposal);
    assert.equal(direct.proposal.status, ProposalStatus.READY);
    assert.equal(direct.proposal.stateBasis?.dependencies.length, 1);
    assertPolicy(direct.proposal.policy, fixtures.direct);
    const directCommit = await actionA.commit({
      operationId: "operation.direct",
      proposalId: "proposal.direct",
    });
    assert.equal(directCommit.status, CommitStatus.COMMITTED);
    assert.ok(directCommit.receipt);
    assertPolicy(directCommit.receipt.policy, fixtures.direct);
    assert.equal(directCommit.receipt.definition?.digest, fixtures.direct.digest);
    const directStatus = await actionA.getOperationStatus({
      operationId: "operation.direct",
    });
    assert.equal(directStatus.status, CommitStatus.COMMITTED);
    assert.equal(
      directStatus.receipt?.intentDigest,
      directCommit.receipt.intentDigest,
    );
    const directReplay = await actionA.commit({
      operationId: "operation.direct",
      proposalId: "proposal.direct",
    });
    assert.equal(
      directReplay.receipt?.commitSequence,
      directCommit.receipt.commitSequence,
    );
    recordAssertion(
      "directPermitCommitted",
      directCommit.status === CommitStatus.COMMITTED &&
        directCommit.receipt.definition?.digest === fixtures.direct.digest,
    );
    recordAssertion(
      "operationIdempotencyPreserved",
      directReplay.receipt?.commitSequence ===
        directCommit.receipt.commitSequence,
    );

    const beforeThresholdDeny = await databaseSnapshot(admin, tenantA);
    const thresholdDeny = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.thresholdDeny",
      proposalId: "proposal.thresholdDeny",
      quantity: "6",
    });
    assert.equal(thresholdDeny.decision, PolicyDecision.DENY);
    assert.equal(thresholdDeny.proposal, undefined);
    const afterThresholdDeny = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterThresholdDeny, beforeThresholdDeny);
    recordAssertion(
      "cedarThresholdControlsPermit",
      thresholdDeny.decision === PolicyDecision.DENY &&
        thresholdDeny.proposal === undefined,
    );
    recordAssertion(
      "deniedProposalHasNoWrites",
      isDeepStrictEqual(afterThresholdDeny, beforeThresholdDeny),
    );

    const human = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.human,
      operationId: "operation.human",
      proposalId: "proposal.human",
      quantity: "2",
    });
    assert.equal(human.decision, PolicyDecision.PERMIT);
    assert.ok(human.proposal);
    assert.equal(human.proposal.status, ProposalStatus.AWAITING_APPROVAL);
    assertPolicy(human.proposal.policy, fixtures.human);
    const humanBasisDigest = human.proposal.stateBasis?.digest;
    assert.ok(humanBasisDigest);

    await recordAvailable(worldA, {
      claimId: "claim.available.unrelated.a",
      fixture: fixtures.human,
      resource: unrelatedResourceId,
      tenantId: tenantA,
      value: "99",
    });
    await stopServer(server);
    server = await startServer(policyManifestPath);
    const humanApproval = await approverA.approve({
      approvalId: "approval.human",
      expiresAt: timestampFromDate(minutesFromNow(4)),
      proposalId: "proposal.human",
    });
    assert.equal(humanApproval.decision, PolicyDecision.PERMIT);
    assert.equal(humanApproval.approval?.approvedBy, "actor.approver.a");
    const humanCommit = await actionA.commit({
      operationId: "operation.human",
      proposalId: "proposal.human",
    });
    assert.equal(humanCommit.status, CommitStatus.COMMITTED);
    recordAssertion(
      "proposalRecoveredAcrossRestart",
      humanApproval.approval?.proposalId === "proposal.human",
    );
    recordAssertion(
      "unrelatedStateDidNotFalseStale",
      humanCommit.status === CommitStatus.COMMITTED,
    );
    recordAssertion(
      "humanApprovalCommitted",
      humanApproval.decision === PolicyDecision.PERMIT &&
        humanCommit.status === CommitStatus.COMMITTED,
    );

    const boundedProposal = await propose(actionA, {
      expiresAt: minutesFromNow(1),
      fixture: fixtures.human,
      operationId: "operation.approvalBounds",
      proposalId: "proposal.approvalBounds",
      quantity: "2",
    });
    assert.ok(boundedProposal.proposal);
    const approvalsBeforeBounds = await rowCount(
      admin,
      "action_approvals",
      tenantA,
    );
    const approvalBoundsCode = await expectConnectCode(
      () =>
        approverA.approve({
          approvalId: "approval.outsideBounds",
          expiresAt: timestampFromDate(minutesFromNow(2)),
          proposalId: "proposal.approvalBounds",
        }),
      Code.FailedPrecondition,
    );
    const approvalsAfterBounds = await rowCount(
      admin,
      "action_approvals",
      tenantA,
    );
    assert.equal(approvalsAfterBounds, approvalsBeforeBounds);
    recordFailureInjection("approval-outside-bounds");
    recordAssertion(
      "approvalBoundsEnforced",
      approvalBoundsCode === Code.FailedPrecondition &&
        approvalsAfterBounds === approvalsBeforeBounds,
    );

    const expiringProposal = await propose(actionA, {
      expiresAt: minutesFromNow(1),
      fixture: fixtures.human,
      operationId: "operation.expiredApproval",
      proposalId: "proposal.expiredApproval",
      quantity: "2",
    });
    assert.ok(expiringProposal.proposal);
    const expiringApproval = await approverA.approve({
      approvalId: "approval.expired",
      expiresAt: timestampFromDate(millisecondsFromNow(1_000)),
      proposalId: "proposal.expiredApproval",
    });
    assert.equal(expiringApproval.decision, PolicyDecision.PERMIT);
    await delay(1_200);
    const beforeExpiredCommit = await databaseSnapshot(admin, tenantA);
    const expiredApprovalCode = await expectConnectCode(
      () =>
        actionA.commit({
          operationId: "operation.expiredApproval",
          proposalId: "proposal.expiredApproval",
        }),
      Code.FailedPrecondition,
    );
    const afterExpiredCommit = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterExpiredCommit, beforeExpiredCommit);
    recordFailureInjection("expired-approval");
    recordAssertion(
      "expiredApprovalRejectedWithoutWrites",
      expiredApprovalCode === Code.FailedPrecondition &&
        isDeepStrictEqual(afterExpiredCommit, beforeExpiredCommit),
    );

    const stale = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.human,
      operationId: "operation.stale",
      proposalId: "proposal.stale",
      quantity: "2",
    });
    assert.ok(stale.proposal?.stateBasis);
    assert.equal(stale.proposal.stateBasis.digest, humanBasisDigest);
    await approverA.approve({
      approvalId: "approval.stale",
      expiresAt: timestampFromDate(minutesFromNow(4)),
      proposalId: "proposal.stale",
    });
    await recordAvailable(worldA, {
      claimId: "claim.available.changed.a",
      fixture: fixtures.human,
      resource: resourceId,
      tenantId: tenantA,
      value: "6",
    });
    const beforeStaleCommit = await databaseSnapshot(admin, tenantA);
    const staleCommit = await actionA.commit({
      operationId: "operation.stale",
      proposalId: "proposal.stale",
    });
    assert.equal(staleCommit.status, CommitStatus.STALE);
    assert.ok(staleCommit.currentStateBasis);
    assert.notEqual(staleCommit.currentStateBasis.digest, humanBasisDigest);
    assert.equal(staleCommit.currentStateBasis.dependencies.length, 2);
    const afterStaleCommit = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterStaleCommit, beforeStaleCommit);
    recordFailureInjection("relevant-state-change");
    recordAssertion(
      "relevantDependencyChangeRejectedBeforeMutation",
      staleCommit.status === CommitStatus.STALE &&
        staleCommit.currentStateBasis.digest !== humanBasisDigest &&
        isDeepStrictEqual(afterStaleCommit, beforeStaleCommit),
    );

    const underChangedState = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.human,
      operationId: "operation.changed",
      proposalId: "proposal.changed",
      quantity: "2",
    });
    assert.equal(
      underChangedState.proposal?.stateBasis?.digest,
      staleCommit.currentStateBasis.digest,
    );
    await approverA.approve({
      approvalId: "approval.changed",
      expiresAt: timestampFromDate(minutesFromNow(4)),
      proposalId: "proposal.changed",
    });
    const changedCommit = await actionA.commit({
      operationId: "operation.changed",
      proposalId: "proposal.changed",
    });
    assert.equal(changedCommit.status, CommitStatus.COMMITTED);
    recordAssertion(
      "secondProposalUnderChangedStateCommitted",
      underChangedState.proposal?.stateBasis?.digest ===
        staleCommit.currentStateBasis.digest &&
        changedCommit.status === CommitStatus.COMMITTED,
    );

    const denyDiscovery = await actionA.discover({
      definition: fixtures.deny.definition,
      resourceId,
    });
    assert.equal(denyDiscovery.actions[0]?.decision, PolicyDecision.PERMIT);
    const beforePolicyDeny = await databaseSnapshot(admin, tenantA);
    const denied = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.deny,
      operationId: "operation.deny",
      proposalId: "proposal.deny",
      quantity: "2",
    });
    assert.equal(denied.decision, PolicyDecision.DENY);
    assertPolicy(denied.policy, fixtures.deny);
    const afterPolicyDeny = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterPolicyDeny, beforePolicyDeny);
    recordAssertion(
      "visibleActionStillRequiredCommitAuthorization",
      denyDiscovery.actions[0]?.decision === PolicyDecision.PERMIT &&
        denied.decision === PolicyDecision.DENY,
    );
    recordAssertion(
      "explicitDenyDistinguished",
      denied.decision === PolicyDecision.DENY &&
        (denied.policy?.determiningPolicyIds.length ?? 0) > 0 &&
        isDeepStrictEqual(afterPolicyDeny, beforePolicyDeny),
    );

    const beforeEvaluationError = await databaseSnapshot(admin, tenantA);
    const evaluationError = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.error,
      operationId: "operation.error",
      proposalId: "proposal.error",
      quantity: "2",
    });
    assert.equal(
      evaluationError.decision,
      PolicyDecision.EVALUATION_ERROR,
    );
    assert.match(evaluationError.evaluationError, /missing/);
    assertPolicy(evaluationError.policy, fixtures.error, false);
    const afterEvaluationError = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterEvaluationError, beforeEvaluationError);
    recordFailureInjection("cedar-evaluation-error");
    recordAssertion(
      "cedarEvaluationErrorDistinguished",
      evaluationError.decision === PolicyDecision.EVALUATION_ERROR &&
        /missing/.test(evaluationError.evaluationError) &&
        isDeepStrictEqual(afterEvaluationError, beforeEvaluationError),
    );

    const beforeForgedInput = await databaseSnapshot(admin, tenantA);
    const forgedInputCode = await expectConnectCode(
      () =>
        propose(actionA, {
          expiresAt: minutesFromNow(5),
          extraInputs: [textInput("principal_id", "principal.approver.a")],
          fixture: fixtures.human,
          operationId: "operation.forgedPrincipal",
          proposalId: "proposal.forgedPrincipal",
          quantity: "2",
        }),
      Code.InvalidArgument,
    );
    const afterForgedInput = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterForgedInput, beforeForgedInput);
    recordFailureInjection("caller-supplied-principal");
    recordAssertion(
      "callerIdentityInputRejected",
      forgedInputCode === Code.InvalidArgument &&
        isDeepStrictEqual(afterForgedInput, beforeForgedInput),
    );

    const beforeTokenFailures = await databaseSnapshot(admin, tenantA);
    const invalidSignatureCode = await expectConnectCode(
      () =>
        actionClient(corruptToken(agentAToken)).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.Unauthenticated,
    );
    const wrongAudienceCode = await expectConnectCode(
      () =>
        actionClient(wrongAudienceToken).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.Unauthenticated,
    );
    await delay(1_100);
    const expiredTokenCode = await expectConnectCode(
      () =>
        actionClient(expiredToken).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.Unauthenticated,
    );
    const expandedDelegationCode = await expectConnectCode(
      () =>
        actionClient(expandedToken).discover({
          definition: fixtures.direct.definition,
          resourceId,
        }),
      Code.PermissionDenied,
    );
    const afterTokenFailures = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterTokenFailures, beforeTokenFailures);
    recordFailureInjection("invalid-token-signature");
    recordFailureInjection("wrong-token-audience");
    recordFailureInjection("expired-token");
    recordFailureInjection("child-delegation-expansion");
    recordAssertion(
      "oidcFailuresRejectedWithoutWrites",
      [invalidSignatureCode, wrongAudienceCode, expiredTokenCode].every(
        (code) => code === Code.Unauthenticated,
      ) &&
        expandedDelegationCode === Code.PermissionDenied &&
        isDeepStrictEqual(afterTokenFailures, beforeTokenFailures),
    );
    recordAssertion(
      "childDelegationExpansionRejected",
      expandedDelegationCode === Code.PermissionDenied,
    );

    const foreignOperation = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.foreign",
      proposalId: "proposal.foreign",
      quantity: "2",
    });
    assert.ok(foreignOperation.proposal);
    const beforeForeignOperation = await databaseSnapshot(admin, tenantA);
    const foreignOperationCode = await expectConnectCode(
      () =>
        actionA.commit({
          operationId: "operation.other",
          proposalId: "proposal.foreign",
        }),
      Code.InvalidArgument,
    );
    const afterForeignOperation = await databaseSnapshot(admin, tenantA);
    assert.deepEqual(afterForeignOperation, beforeForeignOperation);
    const foreignRecovery = await actionA.commit({
      operationId: "operation.foreign",
      proposalId: "proposal.foreign",
    });
    assert.equal(foreignRecovery.status, CommitStatus.COMMITTED);
    recordFailureInjection("foreign-operation-identity");
    recordAssertion(
      "foreignOperationRejectedWithoutWrites",
      foreignOperationCode === Code.InvalidArgument &&
        isDeepStrictEqual(afterForeignOperation, beforeForeignOperation) &&
        foreignRecovery.status === CommitStatus.COMMITTED,
    );

    const tenantACollision = await propose(actionA, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.tenantCollision",
      proposalId: "proposal.tenantCollision",
      quantity: "2",
    });
    assert.ok(tenantACollision.proposal);
    const tenantBBeforeCrossAttempt = await databaseSnapshot(admin, tenantB);
    const crossTenantCommitCode = await expectConnectCode(
      () =>
        actionB.commit({
          operationId: "operation.tenantCollision",
          proposalId: "proposal.tenantCollision",
        }),
      Code.NotFound,
    );
    const tenantBAfterCrossAttempt = await databaseSnapshot(admin, tenantB);
    assert.deepEqual(tenantBAfterCrossAttempt, tenantBBeforeCrossAttempt);
    const tenantBCollision = await propose(actionB, {
      expiresAt: minutesFromNow(5),
      fixture: fixtures.direct,
      operationId: "operation.tenantCollision",
      proposalId: "proposal.tenantCollision",
      quantity: "2",
    });
    assert.ok(tenantBCollision.proposal);
    const tenantBCommit = await actionB.commit({
      operationId: "operation.tenantCollision",
      proposalId: "proposal.tenantCollision",
    });
    assert.equal(tenantBCommit.status, CommitStatus.COMMITTED);
    const tenantACommit = await actionA.commit({
      operationId: "operation.tenantCollision",
      proposalId: "proposal.tenantCollision",
    });
    assert.equal(tenantACommit.status, CommitStatus.COMMITTED);
    const crossTenantDefinitionCode = await expectConnectCode(
      () =>
        definitionA.getRevision({
          definitionId,
          digest: fixtures.direct.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordFailureInjection("cross-tenant-proposal-lookup");
    recordAssertion(
      "identicalActionAndOperationIdsIsolatedByTenant",
      crossTenantCommitCode === Code.NotFound &&
        crossTenantDefinitionCode === Code.PermissionDenied &&
        isDeepStrictEqual(
          tenantBAfterCrossAttempt,
          tenantBBeforeCrossAttempt,
        ) &&
        tenantBCommit.status === CommitStatus.COMMITTED &&
        tenantACommit.status === CommitStatus.COMMITTED,
    );

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const recoveredStatus = await actionA.getOperationStatus({
      operationId: "operation.changed",
    });
    assert.equal(recoveredStatus.status, CommitStatus.COMMITTED);
    assert.equal(
      recoveredStatus.receipt?.proposalId,
      changedCommit.receipt?.proposalId,
    );
    recordAssertion(
      "receiptRecoveredAfterRestart",
      recoveredStatus.status === CommitStatus.COMMITTED &&
        recoveredStatus.receipt?.proposalId ===
          changedCommit.receipt?.proposalId,
    );

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
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      actors: {
        agent: trusted.actorId,
        approver: humanApproval.approval?.approvedBy,
      },
      assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      definitions: Object.fromEntries(
        Object.entries(fixtures).map(([name, fixture]) => [
          name,
          {
            digest: fixture.digest,
            revision: fixture.definition.revision.toString(),
          },
        ]),
      ),
      failureInjections,
      finishedAt: new Date().toISOString(),
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      operations: {
        changed: changedCommit.receipt?.operationId,
        direct: directCommit.receipt.operationId,
        human: humanCommit.receipt?.operationId,
      },
      policies: Object.fromEntries(
        Object.entries(fixtures).map(([name, fixture]) => [
          name,
          {
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: fixture.policyRevision,
          },
        ]),
      ),
      protocolDigest: sha256(actionProtocol),
      scenario: "governed-action",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "governed-action.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    if (server.child.exitCode === null) {
      await stopServer(server);
    }
  }
}

async function loadFixture(
  name: string,
  revision: number,
): Promise<DefinitionFixture> {
  const canonicalJson = (
    await readFile(
      path.join(
        scenarioDirectory,
        `definition-${name}.canonical.json`,
      ),
      "utf8",
    )
  ).trimEnd();
  const policySource = await readFile(
    path.join(scenarioDirectory, `${name}.cedar`),
    "utf8",
  );
  const digest = sha256(canonicalJson);
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId,
      digest,
      revision: BigInt(revision),
    }),
    digest,
    policyDigest: sha256(policySource),
    policyId: `policy.${name}`,
    policyRevision: revision,
    policySource,
  };
}

async function writePolicyManifest(
  outputPath: string,
  fixtures: readonly DefinitionFixture[],
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: fixtures.map((fixture) => ({
          actionId,
          definitionDigest: fixture.digest,
          digest: fixture.policyDigest,
          policyId: fixture.policyId,
          revision: fixture.policyRevision,
          source: fixture.policySource,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}

function actionClient(token: string): ActionClient {
  return createClient(ActionService, transport(token));
}

function definitionClient(token: string): DefinitionClient {
  return createClient(DefinitionService, transport(token));
}

function worldClient(token: string): WorldClient {
  return createClient(WorldService, transport(token));
}

function transport(token: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

async function publishDefinition(
  client: DefinitionClient,
  tenantId: string,
  fixture: DefinitionFixture,
): Promise<void> {
  const response = await client.publish({
    canonicalJson: new TextEncoder().encode(fixture.canonicalJson),
    digest: fixture.digest,
    tenantId,
  });
  assert.equal(response.definitionRevision?.digest, fixture.digest);
  assert.equal(
    response.definitionRevision?.revision,
    fixture.definition.revision,
  );
}

interface EvidenceInput {
  claimId: string;
  fixture: DefinitionFixture;
  resource: string;
  tenantId: string;
  value: string;
}

async function recordAvailable(
  client: WorldClient,
  input: EvidenceInput,
): Promise<void> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.fixture.definition,
      entityId: input.resource,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(input.claimId),
        sourceId: "source.governedActionE2e",
        sourceRef: `urn:zoen:e2e:${input.claimId}`,
      }),
      relationId: availableRelation,
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(validAt),
        },
      }),
      value: integerValue(input.value),
    }),
    tenantId: input.tenantId,
  });
  assert.equal(response.claimId, input.claimId);
}

interface ProposeInput {
  expiresAt: Date;
  extraInputs?: readonly ActionInput[];
  fixture: DefinitionFixture;
  operationId: string;
  proposalId: string;
  quantity: string;
}

function propose(client: ActionClient, input: ProposeInput) {
  return client.propose({
    actionId,
    definition: input.fixture.definition,
    expiresAt: timestampFromDate(input.expiresAt),
    inputs: [integerInput("quantity", input.quantity), ...(input.extraInputs ?? [])],
    operationId: input.operationId,
    proposalId: input.proposalId,
    resourceId,
    validAt: timestampFromDate(validAt),
  });
}

function integerInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: integerValue(value),
  });
}

function textInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: {
        case: "textValue",
        value,
      },
    }),
  });
}

function integerValue(value: string) {
  return create(ExactValueSchema, {
    value: {
      case: "integerValue",
      value,
    },
  });
}

function assertPolicy(
  policy: Proposal["policy"] | undefined,
  fixture: DefinitionFixture,
  requireDeterminingPolicy = true,
): void {
  assert.ok(policy);
  assert.equal(policy.revision?.policyId, fixture.policyId);
  assert.equal(policy.revision?.revision, BigInt(fixture.policyRevision));
  assert.equal(policy.revision?.digest, fixture.policyDigest);
  if (requireDeterminingPolicy) {
    assert.ok(policy.determiningPolicyIds.length > 0);
  }
}

async function databaseSnapshot(
  client: PostgresClient,
  tenantId: string,
): Promise<DatabaseSnapshot> {
  return {
    actionApprovals: await rowCount(client, "action_approvals", tenantId),
    actionOperations: await rowCount(client, "action_operations", tenantId),
    actionProposals: await rowCount(client, "action_proposals", tenantId),
    authorityCommits: await rowCount(client, "authority_commits", tenantId),
    projectionOutbox: await rowCount(client, "projection_outbox", tenantId),
    semanticClaims: await rowCount(client, "semantic_claims", tenantId),
  };
}

async function rowCount(
  client: PostgresClient,
  table: string,
  tenantId: string,
): Promise<number> {
  const allowed = new Set([
    "action_approvals",
    "action_operations",
    "action_proposals",
    "authority_commits",
    "projection_outbox",
    "semantic_claims",
  ]);
  assert.ok(allowed.has(table));
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

async function startServer(policyManifestPath: string): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_LISTEN_ADDR: "127.0.0.1:58083",
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForPort(child, output);
  return { child, output };
}

async function stopServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGINT");
  await once(server.child, "exit");
  assert.equal(
    server.child.exitCode,
    0,
    `zoend failed during shutdown:\n${server.output.join("")}`,
  );
}

async function waitForPort(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during startup:\n${output.join("")}`);
    }
    if (await canConnect()) {
      return;
    }
    await delay(100);
  }
  throw new Error(`zoend did not listen on port 58083:\n${output.join("")}`);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 58083 });
    let settled = false;
    const finish = (connected: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
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

function corruptToken(token: string): string {
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const signature = parts[2];
  assert.ok(signature);
  const replacement = signature[0] === "A" ? "B" : "A";
  return `${parts[0]}.${parts[1]}.${replacement}${signature.slice(1)}`;
}

function minutesFromNow(minutes: number): Date {
  return millisecondsFromNow(minutes * 60_000);
}

function millisecondsFromNow(milliseconds: number): Date {
  return new Date(Date.now() + milliseconds);
}

function composeOutput(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    ...arguments_,
  ]);
}

function command(
  executable: string,
  arguments_: readonly string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
