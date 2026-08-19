import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { create } from "@bufbuild/protobuf";
import { Code } from "@connectrpc/connect";
import { Client as PostgresClient } from "pg";
import {
  CommitIdentityKind,
  CommitStatus,
  type CommitReceipt,
  PolicyDecision,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionReferenceSchema } from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  adminDatabaseUrl,
  delay,
  definitionClient,
  definitionId,
  expectConnectCode,
  generatedDirectory,
  loadFixture,
  minutesFromNow,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  propose,
  publishDefinition,
  recordAvailable,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writePolicyManifest,
  type DefinitionFixture,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  composeOutput,
  durableSnapshot,
  killCommitProcess,
  runCommitProcess,
  seedEffectRequestCollision,
  startCommitProcess,
  waitForOperation,
} from "./durable-commit/support.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const scenarioDirectory = path.join(repositoryRoot, "e2e", "durable-commit");

function recordAssertion(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function recordFailureInjection(name: string): void {
  failureInjections.push(name);
}

function receiptShape(receipt: CommitReceipt | undefined) {
  assert.ok(receipt);
  return {
    commitSequence: receipt.commitSequence.toString(),
    effectRequestIds: receipt.effectRequestIds,
    intentDigest: receipt.intentDigest,
    operationId: receipt.operationId,
    proposalId: receipt.proposalId,
    recordIds: receipt.recordIds,
  };
}

async function loadMultiFixture(): Promise<DefinitionFixture> {
  const canonicalJson = (
    await readFile(
      path.join(scenarioDirectory, "definition-multi.canonical.json"),
      "utf8",
    )
  ).trimEnd();
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", "governed-action", "direct.cedar"),
    "utf8",
  );
  const digest = sha256(canonicalJson);
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId,
      digest,
      revision: 6n,
    }),
    digest,
    policyDigest: sha256(policySource),
    policyId: "policy.multi",
    policyRevision: 6,
    policySource,
  };
}

async function killServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGKILL");
  await once(server.child, "exit");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixtures = {
    direct: await loadFixture("direct", 1),
    multi: await loadMultiFixture(),
    self: await loadFixture("self", 5),
  };
  const policyManifestPath = path.join(
    generatedDirectory,
    "durable-policies.json",
  );
  await writePolicyManifest(policyManifestPath, Object.values(fixtures));

  const agentAToken = await oidcToken("agent-a");
  const agentBToken = await oidcToken("agent-b");
  const actionA = actionClient(agentAToken);
  const actionB = actionClient(agentBToken);
  const definitionA = definitionClient(agentAToken);
  const definitionB = definitionClient(agentBToken);
  const worldA = worldClient(agentAToken);
  const worldB = worldClient(agentBToken);
  let admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  let server = await startServer(policyManifestPath);
  await admin.connect();

  try {
    for (const fixture of Object.values(fixtures)) {
      await publishDefinition(definitionA, tenantA, fixture);
      await publishDefinition(definitionB, tenantB, fixture);
      await recordAvailable(worldA, {
        claimId: `claim.available.${fixture.definition.revision}.a`,
        fixture,
        resource: resourceId,
        tenantId: tenantA,
        value: "10",
      });
      await recordAvailable(worldB, {
        claimId: `claim.available.${fixture.definition.revision}.b`,
        fixture,
        resource: resourceId,
        tenantId: tenantB,
        value: "10",
      });
    }

    const sameOperationProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.same-race",
      proposalId: "proposal.same-race",
      quantity: "1",
    });
    assert.equal(sameOperationProposal.decision, PolicyDecision.PERMIT);
    assert.ok(sameOperationProposal.proposal);
    const beforeSameOperationRace = await durableSnapshot(admin, tenantA);
    const sameOperationRace = await Promise.all([
      runCommitProcess({
        operationId: "operation.same-race",
        proposalId: "proposal.same-race",
        token: agentAToken,
      }),
      runCommitProcess({
        operationId: "operation.same-race",
        proposalId: "proposal.same-race",
        token: agentAToken,
      }),
    ]);
    assert.deepEqual(
      sameOperationRace.map((result) => result.status),
      [CommitStatus.COMMITTED, CommitStatus.COMMITTED],
    );
    assert.deepEqual(sameOperationRace[0]?.receipt, sameOperationRace[1]?.receipt);
    const afterSameOperationRace = await durableSnapshot(admin, tenantA);
    recordAssertion(
      "sameOperationRaceConverged",
      sameOperationRace.every(
        (result) => result.status === CommitStatus.COMMITTED,
      ) &&
        isDeepStrictEqual(
          sameOperationRace[0]?.receipt,
          sameOperationRace[1]?.receipt,
        ) &&
        afterSameOperationRace.actionOperations ===
          beforeSameOperationRace.actionOperations + 1 &&
        afterSameOperationRace.semanticClaims ===
          beforeSameOperationRace.semanticClaims + 1 &&
        afterSameOperationRace.effectRequests ===
          beforeSameOperationRace.effectRequests + 1 &&
        afterSameOperationRace.projectionOutbox ===
          beforeSameOperationRace.projectionOutbox + 1 &&
        afterSameOperationRace.authorityHead ===
          beforeSameOperationRace.authorityHead + 1,
    );

    const canonicalProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.multi,
      operationId: "operation.canonical",
      proposalId: "proposal.canonical",
      quantity: "1",
    });
    assert.ok(canonicalProposal.proposal);
    const canonicalCommit = await actionA.commit({
      operationId: "operation.canonical",
      proposalId: "proposal.canonical",
    });
    assert.equal(canonicalCommit.status, CommitStatus.COMMITTED);
    assert.ok(canonicalCommit.receipt);
    const canonicalCommitReceipt = canonicalCommit.receipt;
    const canonicalReplay = await actionA.commit({
      operationId: "operation.canonical",
      proposalId: "proposal.canonical",
    });
    const canonicalStatus = await actionA.getOperationStatus({
      operationId: "operation.canonical",
    });
    const canonicalReceipt = receiptShape(canonicalCommitReceipt);
    assert.deepEqual(receiptShape(canonicalReplay.receipt), canonicalReceipt);
    assert.deepEqual(receiptShape(canonicalStatus.receipt), canonicalReceipt);
    assert.deepEqual(canonicalReceipt.recordIds, [
      `claim.action.${canonicalReceipt.intentDigest}.0`,
      `claim.action.${canonicalReceipt.intentDigest}.1`,
    ]);
    assert.deepEqual(canonicalReceipt.effectRequestIds, [
      `effect.action.${canonicalReceipt.intentDigest}.0`,
      `effect.action.${canonicalReceipt.intentDigest}.1`,
    ]);
    recordAssertion(
      "canonicalReceiptOrderingStable",
      canonicalReceipt.recordIds.length === 2 &&
        canonicalReceipt.effectRequestIds.length === 2 &&
        isDeepStrictEqual(
          receiptShape(canonicalReplay.receipt),
          canonicalReceipt,
        ) &&
        isDeepStrictEqual(
          receiptShape(canonicalStatus.receipt),
          canonicalReceipt,
        ),
    );

    const beforeIntentMismatch = await durableSnapshot(admin, tenantA);
    const intentMismatchCode = await expectConnectCode(
      () =>
        propose(actionA, {
          expiresAt: minutesFromNow(10),
          fixture: fixtures.direct,
          operationId: "operation.canonical",
          proposalId: "proposal.intent-mismatch",
          quantity: "2",
        }),
      Code.InvalidArgument,
    );
    const afterIntentMismatch = await durableSnapshot(admin, tenantA);
    recordAssertion(
      "sameOperationDifferentIntentTypedMismatch",
      intentMismatchCode === Code.InvalidArgument &&
        isDeepStrictEqual(afterIntentMismatch, beforeIntentMismatch),
    );

    const otherProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.other",
      proposalId: "proposal.other",
      quantity: "2",
    });
    assert.ok(otherProposal.proposal);
    const beforeProposalMismatch = await durableSnapshot(admin, tenantA);
    const proposalMismatch = await actionA.commit({
      operationId: "operation.canonical",
      proposalId: "proposal.other",
    });
    const proposalMismatchReplay = await actionA.commit({
      operationId: "operation.canonical",
      proposalId: "proposal.other",
    });
    const afterProposalMismatch = await durableSnapshot(admin, tenantA);
    recordAssertion(
      "wrongProposalTypedMismatch",
      proposalMismatch.status === CommitStatus.OPERATION_MISMATCH &&
        proposalMismatchReplay.status === CommitStatus.OPERATION_MISMATCH &&
        isDeepStrictEqual(afterProposalMismatch, beforeProposalMismatch),
    );

    const semanticCollisionProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.semantic-collision",
      proposalId: "proposal.semantic-collision",
      quantity: "1",
    });
    assert.equal(
      semanticCollisionProposal.proposal?.intentDigest,
      sameOperationProposal.proposal.intentDigest,
    );
    const beforeSemanticCollision = await durableSnapshot(admin, tenantA);
    const semanticCollision = await actionA.commit({
      operationId: "operation.semantic-collision",
      proposalId: "proposal.semantic-collision",
    });
    const semanticCollisionReplay = await actionA.commit({
      operationId: "operation.semantic-collision",
      proposalId: "proposal.semantic-collision",
    });
    const afterSemanticCollision = await durableSnapshot(admin, tenantA);
    recordFailureInjection("semantic-record-identity-collision");
    recordAssertion(
      "semanticRecordCollisionTypedAndAtomic",
      semanticCollision.status === CommitStatus.IDENTITY_COLLISION &&
        semanticCollision.collisionKind ===
          CommitIdentityKind.SEMANTIC_RECORD &&
        semanticCollisionReplay.status === CommitStatus.IDENTITY_COLLISION &&
        semanticCollisionReplay.collisionKind ===
          CommitIdentityKind.SEMANTIC_RECORD &&
        isDeepStrictEqual(afterSemanticCollision, beforeSemanticCollision),
    );

    const effectCollisionProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.effect-collision",
      proposalId: "proposal.effect-collision",
      quantity: "3",
    });
    assert.ok(effectCollisionProposal.proposal);
    await seedEffectRequestCollision(
      admin,
      tenantA,
      canonicalCommitReceipt.commitSequence,
      `effect.action.${effectCollisionProposal.proposal.intentDigest}.0`,
    );
    const beforeEffectCollision = await durableSnapshot(admin, tenantA);
    const effectCollision = await actionA.commit({
      operationId: "operation.effect-collision",
      proposalId: "proposal.effect-collision",
    });
    const effectCollisionReplay = await actionA.commit({
      operationId: "operation.effect-collision",
      proposalId: "proposal.effect-collision",
    });
    const afterEffectCollision = await durableSnapshot(admin, tenantA);
    recordFailureInjection("effect-request-identity-collision");
    recordAssertion(
      "effectRequestCollisionTypedAndAtomic",
      effectCollision.status === CommitStatus.IDENTITY_COLLISION &&
        effectCollision.collisionKind === CommitIdentityKind.EFFECT_REQUEST &&
        effectCollisionReplay.status === CommitStatus.IDENTITY_COLLISION &&
        effectCollisionReplay.collisionKind ===
          CommitIdentityKind.EFFECT_REQUEST &&
        isDeepStrictEqual(afterEffectCollision, beforeEffectCollision),
    );

    const independentProposalA = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.independent",
      proposalId: "proposal.independent",
      quantity: "4",
    });
    const independentProposalB = await propose(actionB, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.independent",
      proposalId: "proposal.independent",
      quantity: "4",
    });
    assert.ok(independentProposalA.proposal);
    assert.ok(independentProposalB.proposal);
    await stopServer(server);
    server = await startServer(policyManifestPath, {
      name: "after_lock",
      pauseMs: 1_500,
    });
    const independentStartedAt = performance.now();
    const independentRace = await Promise.all([
      runCommitProcess({
        operationId: "operation.independent",
        proposalId: "proposal.independent",
        token: agentAToken,
      }),
      runCommitProcess({
        operationId: "operation.independent",
        proposalId: "proposal.independent",
        token: agentBToken,
      }),
    ]);
    const independentElapsedMs = performance.now() - independentStartedAt;
    assert.ok(
      independentRace.every(
        (result) => result.status === CommitStatus.COMMITTED,
      ),
    );
    recordFailureInjection("tenant-scoped-lock-delay");
    recordAssertion(
      "independentTenantsNotGloballySerialized",
      independentRace.every(
        (result) => result.status === CommitStatus.COMMITTED,
      ) && independentElapsedMs < 2_700,
    );
    await stopServer(server);
    server = await startServer(policyManifestPath);

    const namespaceProposalA = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.multi,
      operationId: "operation.namespace",
      proposalId: "proposal.namespace",
      quantity: "4",
    });
    assert.ok(namespaceProposalA.proposal);
    const namespaceCommitA = await actionA.commit({
      operationId: "operation.namespace",
      proposalId: "proposal.namespace",
    });
    assert.equal(namespaceCommitA.status, CommitStatus.COMMITTED);
    const tenantBStatusCode = await expectConnectCode(
      () =>
        actionB.getOperationStatus({
          operationId: "operation.namespace",
        }),
      Code.NotFound,
    );
    const namespaceProposalB = await propose(actionB, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.multi,
      operationId: "operation.namespace",
      proposalId: "proposal.namespace",
      quantity: "4",
    });
    assert.ok(namespaceProposalB.proposal);
    const namespaceCommitB = await actionB.commit({
      operationId: "operation.namespace",
      proposalId: "proposal.namespace",
    });
    recordAssertion(
      "tenantScopedOperationNamespace",
      tenantBStatusCode === Code.NotFound &&
        namespaceCommitA.status === CommitStatus.COMMITTED &&
        namespaceCommitB.status === CommitStatus.COMMITTED &&
        namespaceCommitA.receipt?.operationId ===
          namespaceCommitB.receipt?.operationId,
    );

    const preCommitFailpoints = [
      "before_lock",
      "after_operation_insert",
      "after_semantic_records",
      "after_effect_requests",
      "before_head_advance",
      "before_commit",
    ] as const;
    for (const [index, failpoint] of preCommitFailpoints.entries()) {
      const operationId = `operation.failpoint.${index}`;
      const proposalId = `proposal.failpoint.${index}`;
      const proposal = await propose(actionA, {
        expiresAt: minutesFromNow(10),
        fixture: fixtures.direct,
        operationId,
        proposalId,
        quantity: "5",
      });
      assert.ok(proposal.proposal);
      const beforeFailure = await durableSnapshot(admin, tenantA);
      await stopServer(server);
      server = await startServer(policyManifestPath, { name: failpoint });
      const failureCode = await expectConnectCode(
        () => actionA.commit({ operationId, proposalId }),
        Code.Unavailable,
      );
      await stopServer(server);
      server = await startServer(policyManifestPath);
      const afterFailure = await durableSnapshot(admin, tenantA);
      const missingStatusCode = await expectConnectCode(
        () => actionA.getOperationStatus({ operationId }),
        Code.NotFound,
      );
      recordFailureInjection(failpoint);
      recordAssertion(
        `failpoint${index}RolledBack`,
        failureCode === Code.Unavailable &&
          missingStatusCode === Code.NotFound &&
          isDeepStrictEqual(afterFailure, beforeFailure),
      );
    }
    recordAssertion(
      "allPreCommitFailpointsRolledBack",
      preCommitFailpoints.every(
        (_, index) => assertions[`failpoint${index}RolledBack`] === true,
      ),
    );

    const lostResponseProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.direct,
      operationId: "operation.lost-response",
      proposalId: "proposal.lost-response",
      quantity: "5",
    });
    assert.ok(lostResponseProposal.proposal);
    await stopServer(server);
    server = await startServer(policyManifestPath, { name: "after_commit" });
    const lostResponseCode = await expectConnectCode(
      () =>
        actionA.commit({
          operationId: "operation.lost-response",
          proposalId: "proposal.lost-response",
        }),
      Code.Unavailable,
    );
    await stopServer(server);
    server = await startServer(policyManifestPath);
    const lostResponseStatus = await actionA.getOperationStatus({
      operationId: "operation.lost-response",
    });
    const lostResponseReplay = await actionA.commit({
      operationId: "operation.lost-response",
      proposalId: "proposal.lost-response",
    });
    recordFailureInjection("postgres-commit-then-lost-response");
    recordAssertion(
      "lostResponseRecoveredWithoutSecondCommit",
      lostResponseCode === Code.Unavailable &&
        lostResponseStatus.status === CommitStatus.COMMITTED &&
        isDeepStrictEqual(
          receiptShape(lostResponseReplay.receipt),
          receiptShape(lostResponseStatus.receipt),
        ),
    );

    const clientDeathProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.multi,
      operationId: "operation.client-death",
      proposalId: "proposal.client-death",
      quantity: "2",
    });
    assert.ok(clientDeathProposal.proposal);
    await stopServer(server);
    server = await startServer(policyManifestPath, {
      name: "after_commit",
      pauseMs: 2_500,
    });
    const doomedClient = startCommitProcess({
      operationId: "operation.client-death",
      proposalId: "proposal.client-death",
      token: agentAToken,
    });
    await waitForOperation(admin, tenantA, "operation.client-death");
    await killCommitProcess(doomedClient);
    const clientDeathStatus = await actionA.getOperationStatus({
      operationId: "operation.client-death",
    });
    const clientDeathReplay = await actionA.commit({
      operationId: "operation.client-death",
      proposalId: "proposal.client-death",
    });
    recordFailureInjection("client-killed-after-request-delivery");
    recordAssertion(
      "clientDeathRecoveredFromStatusAndReplay",
      clientDeathStatus.status === CommitStatus.COMMITTED &&
        isDeepStrictEqual(
          receiptShape(clientDeathReplay.receipt),
          receiptShape(clientDeathStatus.receipt),
        ),
    );
    await delay(2_600);
    await stopServer(server);
    server = await startServer(policyManifestPath);

    const serverDeathProposal = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.multi,
      operationId: "operation.server-death",
      proposalId: "proposal.server-death",
      quantity: "3",
    });
    assert.ok(serverDeathProposal.proposal);
    await stopServer(server);
    server = await startServer(policyManifestPath, {
      name: "after_commit",
      pauseMs: 5_000,
    });
    const interruptedClient = startCommitProcess({
      operationId: "operation.server-death",
      proposalId: "proposal.server-death",
      token: agentAToken,
    });
    await waitForOperation(admin, tenantA, "operation.server-death");
    await killServer(server);
    await killCommitProcess(interruptedClient);
    server = await startServer(policyManifestPath);
    const serverDeathStatus = await actionA.getOperationStatus({
      operationId: "operation.server-death",
    });
    const serverDeathReplay = await actionA.commit({
      operationId: "operation.server-death",
      proposalId: "proposal.server-death",
    });
    recordFailureInjection("zoend-killed-after-postgres-commit");
    recordAssertion(
      "serverDeathRecoveredAfterRestart",
      serverDeathStatus.status === CommitStatus.COMMITTED &&
        isDeepStrictEqual(
          receiptShape(serverDeathReplay.receipt),
          receiptShape(serverDeathStatus.receipt),
        ),
    );

    await stopServer(server);
    await admin.end();
    await composeOutput("restart", "postgres");
    await composeOutput("up", "--detach", "--wait");
    admin = new PostgresClient({ connectionString: adminDatabaseUrl });
    await admin.connect();
    server = await startServer(policyManifestPath);
    const postgresRestartStatus = await actionA.getOperationStatus({
      operationId: "operation.server-death",
    });
    recordFailureInjection("postgres-restart-after-commit");
    recordAssertion(
      "postgresRestartPreservedReceipt",
      postgresRestartStatus.status === CommitStatus.COMMITTED &&
        isDeepStrictEqual(
          receiptShape(postgresRestartStatus.receipt),
          receiptShape(serverDeathStatus.receipt),
        ),
    );

    const conflictingProposalA = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.self,
      operationId: "operation.conflict.a",
      proposalId: "proposal.conflict.a",
      quantity: "1",
    });
    const conflictingProposalB = await propose(actionA, {
      expiresAt: minutesFromNow(10),
      fixture: fixtures.self,
      operationId: "operation.conflict.b",
      proposalId: "proposal.conflict.b",
      quantity: "1",
    });
    assert.ok(conflictingProposalA.proposal);
    assert.ok(conflictingProposalB.proposal);
    assert.equal(
      conflictingProposalA.proposal.stateBasis?.digest,
      conflictingProposalB.proposal.stateBasis?.digest,
    );
    const beforeConflictingRace = await durableSnapshot(admin, tenantA);
    const conflictingRace = await Promise.all([
      runCommitProcess({
        operationId: "operation.conflict.a",
        proposalId: "proposal.conflict.a",
        token: agentAToken,
      }),
      runCommitProcess({
        operationId: "operation.conflict.b",
        proposalId: "proposal.conflict.b",
        token: agentAToken,
      }),
    ]);
    const afterConflictingRace = await durableSnapshot(admin, tenantA);
    const conflictingStatuses = conflictingRace
      .map((result) => result.status)
      .sort((left, right) => left - right);
    recordFailureInjection("same-head-conflicting-multi-process-race");
    recordAssertion(
      "sameHeadConflictHasOneSemanticWinner",
      isDeepStrictEqual(conflictingStatuses, [
        CommitStatus.COMMITTED,
        CommitStatus.STALE,
      ]) &&
        afterConflictingRace.actionOperations ===
          beforeConflictingRace.actionOperations + 1 &&
        afterConflictingRace.authorityHead ===
          beforeConflictingRace.authorityHead + 1,
    );

    const storedProcedureCount = (
      await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM pg_proc
         WHERE prokind = 'f'
           AND (
             prosrc ILIKE '%action_operations%'
             OR prosrc ILIKE '%semantic_claims%'
             OR prosrc ILIKE '%projection_outbox%'
           )`,
      )
    ).rows[0]?.count;
    recordAssertion(
      "noStoredProcedureOwnsActionSemantics",
      storedProcedureCount === "0",
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
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
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
    const mutants = {
      collisionReturnedRawDatabaseError:
        assertions.semanticRecordCollisionTypedAndAtomic === true &&
        assertions.effectRequestCollisionTypedAndAtomic === true,
      effectWrittenOutsideTransaction:
        assertions.allPreCommitFailpointsRolledBack === true,
      intentIgnored:
        assertions.sameOperationDifferentIntentTypedMismatch === true,
      missingHeadLock:
        assertions.sameHeadConflictHasOneSemanticWinner === true &&
        assertions.sameOperationRaceConverged === true,
      namespaceOmitted:
        assertions.tenantScopedOperationNamespace === true,
      partialSemanticCommit:
        assertions.allPreCommitFailpointsRolledBack === true,
      statusUnavailableAfterCommit:
        assertions.serverDeathRecoveredAfterRestart === true &&
        assertions.postgresRestartPreservedReceipt === true,
      unstableReceiptOrder:
        assertions.canonicalReceiptOrderingStable === true,
    };
    assert.ok(Object.values(mutants).every(Boolean));
    const manifest = {
      assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      mutants,
      observedOperations: {
        canonical: canonicalReceipt.operationId,
        clientDeath: clientDeathStatus.receipt?.operationId,
        lostResponse: lostResponseStatus.receipt?.operationId,
        serverDeath: serverDeathStatus.receipt?.operationId,
      },
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      protocolDigest: sha256(actionProtocol),
      scenario: "durable-commit",
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
      timings: {
        independentTenantCommitsMs: independentElapsedMs,
      },
    };
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "durable-commit.json"),
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
