import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import { Client as PostgresClient } from "pg";
import {
  ActionInputSchema,
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import {
  ComponentAdmissionStatus,
  ExecutionStatus,
  ProgramActionStatus,
} from "../gen/connect/zoen/computation/v1/computation_pb.js";
import {
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
} from "../gen/connect/zoen/world/v1/world_pb.js";
import {
  actionClient,
  actionId,
  activateDefinition,
  adminDatabaseUrl,
  command,
  definitionClient,
  expectConnectCode,
  authDatabaseUrl,
  generatedDirectory,
  loadFixture,
  minutesFromNow,
  publishDefinition,
  recordAvailable,
  repositoryRoot,
  resourceId,
  startAuthDoor,
  startServer,
  stopAuthDoor,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writePolicyManifest,
  type ServerProcess,
} from "./governed-action/support.js";
import { plantPersonas, sessionOf } from "./ba-door.js";
import { historyClient } from "./explain/support.js";
import {
  e2eHttpUrl,
  e2eIdentityAdminToken,
  writeScenarioArtifact,
} from "./host-env.js";
import { gitHead } from "./scenario-evidence.js";
import {
  componentInterface,
  computationClient,
  emptyManifest,
  entityId,
  execute,
  loadComponentFixture,
  publish,
  relationId,
  budgetClassStandard,
  budgetClassTight,
  budgetResourceStandard,
  budgetResourceTight,
  scopedManifest,
  sha256,
  validAt,
  wasmCodeModePersonas,
  type ComponentFixture,
} from "./wasm-code-mode/support.js";
import {
  expectBudgetPublicationRejected,
  listBudgets,
  plantBudgetRelease,
} from "./budget-class/plant-release.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function observe(name: string, value: boolean): void {
  assert.ok(value, name);
  assertions[name] = value;
}

function inject(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixtures = {
    direct: await loadFixture("direct", 1),
    human: await loadFixture("human", 2),
  };
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, Object.values(fixtures));

  const door = await startAuthDoor(authDatabaseUrl);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  let server: ServerProcess | undefined;
  try {
    server = await startServer(policyManifestPath);
    await admin.connect();
    const zoenPath = path.join(
      process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target"),
      "debug",
      "zoen",
    );
    const bootManifest = JSON.parse(
      await readFile(policyManifestPath, "utf8"),
    ) as { policies: Array<{
      actionId: string;
      definitionDigest: string;
      digest: string;
      policyId: string;
      revision: number;
      source: string;
    }> };
    const invalidBudgetBase = {
      deadlineMillis: 2000,
      id: "clinic.query.invalid",
      instances: 4,
      memories: 2,
      memoryBytes: 8 * 1024 * 1024,
      priority: 1,
      resourceId: "zoen.compute.budget.invalid",
      tableElements: 1024,
      tables: 2,
    };
    await expectBudgetPublicationRejected({
      authorizationPolicies: bootManifest.policies,
      budgets: [
        {
          ...invalidBudgetBase,
          fuel: 9_223_372_036_854_776_000,
        },
      ],
      databaseUrl: adminDatabaseUrl,
      expected: /exceeds BIGINT/,
      generatedDirectory,
      name: "bigint",
      world: tenantA,
      zoenPath,
    });
    await expectBudgetPublicationRejected({
      authorizationPolicies: bootManifest.policies,
      budgets: [
        {
          ...invalidBudgetBase,
          fuel: 100_000_001,
        },
      ],
      databaseUrl: adminDatabaseUrl,
      expected: /exceeds platform maximum 100000000/,
      generatedDirectory,
      name: "platform-ceiling",
      world: tenantA,
      zoenPath,
    });
    observe("publicationRejectsBigIntAndPlatformOverflow", true);
    const plantedReleaseA = await plantBudgetRelease({
      authorizationPolicies: bootManifest.policies,
      databaseUrl: adminDatabaseUrl,
      generatedDirectory,
      identityBaseUrl: e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171),
      world: tenantA,
      zoenPath,
    });
    await plantBudgetRelease({
      authorizationPolicies: bootManifest.policies,
      databaseUrl: adminDatabaseUrl,
      generatedDirectory,
      identityBaseUrl: e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171),
      world: tenantB,
      zoenPath,
    });
    const cliBudgets = listBudgets(zoenPath, adminDatabaseUrl, tenantA);
    observe(
      "cliListsReleaseOwnedBudgetClasses",
      Array.isArray(cliBudgets.budgetClasses) &&
        (cliBudgets.budgetClasses as unknown[]).length >= 2 &&
        cliBudgets.digest === plantedReleaseA.digest,
    );
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: wasmCodeModePersonas,
      zoendBaseUrl: e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171),
    });
    const agentAToken = sessionOf(planted, "agent-a").token;
    const agentBToken = sessionOf(planted, "agent-b").token;
    const adminAToken = sessionOf(planted, "admin-a").token;
    const adminBToken = sessionOf(planted, "admin-b").token;
    const actionA = actionClient(agentAToken, tenantA);
    const computationA = computationClient(agentAToken, tenantA);
    const computationAdminA = computationClient(adminAToken, tenantA);
    const computationB = computationClient(agentBToken, tenantB);
    const computationAdminB = computationClient(adminBToken, tenantB);
    const computationCrossWorld = computationClient(agentBToken, tenantA);
    const definitionAdminA = definitionClient(adminAToken, tenantA);
    const definitionAdminB = definitionClient(adminBToken, tenantB);
    const historyA = historyClient(agentAToken, tenantA);
    const worldA = worldClient(agentAToken, tenantA);
    const worldB = worldClient(agentBToken, tenantB);
    for (const fixture of Object.values(fixtures)) {
      await publishDefinition(definitionAdminA, tenantA, fixture);
      await activateDefinition(definitionAdminA, tenantA, fixture);
    }
    await publishDefinition(definitionAdminB, tenantB, fixtures.direct);
    await activateDefinition(definitionAdminB, tenantB, fixtures.direct);
    await recordClaims(worldA, worldB, fixtures);

    const program = await loadComponentFixture("program");
    const publishedA = await publish(computationA, program);
    assert.equal(publishedA.status, ComponentAdmissionStatus.PUBLISHED);
    assert.equal(publishedA.componentDigest, program.digest);
    assert.equal(publishedA.componentInterface, componentInterface);
    assert.equal(publishedA.sizeBytes, BigInt(program.bytes.byteLength));

    await expectConnectCode(
      () =>
        execute(
          computationB,
          program,
          "execution.foreign-tenant",
          "pure",
          emptyManifest(),
        ),
      Code.Unavailable,
    );
    inject("foreign-tenant-component-read");
    await expectConnectCode(
      () =>
        execute(
          computationCrossWorld,
          program,
          "execution.cross-world-membership",
          "pure",
          emptyManifest(),
        ),
      Code.PermissionDenied,
    );
    inject("cross-world-membership");
    const publishedB = await publish(computationB, program);
    assert.equal(publishedB.status, ComponentAdmissionStatus.PUBLISHED);
    assert.equal(publishedB.componentDigest, publishedA.componentDigest);
    observe(
      "identicalBytesHaveIdenticalDigestAcrossTenants",
      publishedB.componentDigest === program.digest,
    );
    await expectConnectCode(
      () =>
        execute(
          computationAdminB,
          program,
          "execution.no-compute-delegation",
          "pure",
          emptyManifest(),
        ),
      Code.PermissionDenied,
    );
    inject("membership-without-compute-delegation");

    await verifyAdmissionFailures(computationA, program);
    const actionStateBeforeFailures = await actionState(admin, tenantA);
    const failures = await verifyExecutionFailures(
      computationA,
      computationAdminA,
      program,
      fixtures.direct.definition,
    );
    assert.deepEqual(await actionState(admin, tenantA), actionStateBeforeFailures);
    observe("failedExecutionsDoNotMutateSemanticAuthority", true);

    const pureFirst = await execute(
      computationA,
      program,
      "execution.pure.first",
      "pure",
      emptyManifest(),
    );
    const pureSecond = await execute(
      computationA,
      program,
      "execution.pure.second",
      "pure",
      emptyManifest(),
    );
    assertCompleted(pureFirst);
    assertCompleted(pureSecond);
    assert.equal(pureFirst.output?.aggregate, "17");
    assert.equal(pureFirst.resultDigest, pureSecond.resultDigest);
    assert.equal(pureFirst.fuelConsumed, pureSecond.fuelConsumed);
    assert.equal(pureFirst.computeBasis?.budgetClassId, budgetClassStandard);
    assert.equal(
      pureFirst.computeBasis?.budgetResourceId,
      budgetResourceStandard,
    );
    assert.equal(pureFirst.computeBasis?.releaseDigest, plantedReleaseA.digest);
    const pureReplay = await execute(
      computationA,
      program,
      "execution.pure.first",
      "pure",
      emptyManifest(),
    );
    assert.equal(pureReplay.resultDigest, pureFirst.resultDigest);
    assert.equal(pureReplay.requestDigest, pureFirst.requestDigest);
    assert.equal(
      pureReplay.computeBasis?.basisDigest,
      pureFirst.computeBasis?.basisDigest,
    );
    await expectConnectCode(
      () =>
        execute(
          computationA,
          program,
          "execution.pure.first",
          "trap",
          emptyManifest(),
        ),
      Code.AlreadyExists,
    );
    inject("execution-id-request-collision");
    observe(
      "sameInputPureReplayIsDeterministic",
      pureReplay.requestDigest === pureFirst.requestDigest &&
        pureReplay.resultDigest === pureFirst.resultDigest &&
        pureReplay.computeBasis?.basisDigest ===
          pureFirst.computeBasis?.basisDigest,
    );
    observe(
      "serverSelectsBudgetWithoutCallerClass",
      pureFirst.computeBasis?.budgetClassId === budgetClassStandard &&
        pureFirst.computeBasis?.actionId === "zoen.world.execute" &&
        pureFirst.computeBasis?.operation === "execute",
    );

    const ordinaryRead = await readOrdinaryPath(
      historyA,
      worldA,
      fixtures.direct,
    );
    const allowedManifest = scopedManifest(fixtures.direct.definition);
    const wasmAllowed = await execute(
      computationA,
      program,
      "execution.action.allowed",
      "run|proposal.wasm.allowed|operation.wasm.allowed|9",
      allowedManifest,
    );
    assertCompleted(wasmAllowed);
    assert.equal(wasmAllowed.output?.valuesScanned, 2);
    assert.equal(wasmAllowed.output?.selectedValues, 2);
    assert.equal(wasmAllowed.output?.aggregate, "30");
    assert.equal(wasmAllowed.output?.explanationComplete, true);
    assert.equal(
      wasmAllowed.output?.action?.status,
      ProgramActionStatus.COMMITTED,
    );
    assert.equal(wasmAllowed.output?.action?.actionId, actionId);
    assert.equal(
      wasmAllowed.evidence?.componentDigest,
      publishedA.componentDigest,
    );
    assert.equal(
      wasmAllowed.evidence?.componentInterface,
      componentInterface,
    );
    assert.deepEqual(wasmAllowed.evidence?.capabilityIds, [
      "action.request-stock",
      "explain.selected",
      "query.available",
    ]);
    observe("wasmQueriesFiltersAggregatesExplainsAndCommits", true);

    await runOrdinaryActionPath(actionA, fixtures.direct);
    const ordinary = {
      actionId,
      ...ordinaryRead,
      quantity: "2",
      resourceId,
    };
    assert.deepEqual(
      {
        actionId: wasmAllowed.output?.action?.actionId,
        aggregate: wasmAllowed.output?.aggregate,
        explanationComplete: wasmAllowed.output?.explanationComplete,
        quantity: "2",
        resourceId,
        selectedValues: wasmAllowed.output?.selectedValues,
        valuesScanned: wasmAllowed.output?.valuesScanned,
      },
      ordinary,
    );
    const [wasmContract, ordinaryContract] = await Promise.all([
      proposalContract(admin, tenantA, "proposal.wasm.allowed"),
      proposalContract(admin, tenantA, "proposal.ordinary.allowed"),
    ]);
    assert.deepEqual(wasmContract.business, ordinaryContract.business);
    assert.equal(wasmContract.componentDigest, program.digest);
    assert.equal(wasmContract.componentInterface, componentInterface);
    assert.equal(ordinaryContract.componentDigest, null);
    observe("ordinaryAndWasmActionContractsEquivalent", true);

    const wasmHistory = await historyA.explain({
      target: {
        target: { case: "proposalId", value: "proposal.wasm.allowed" },
      },
    });
    assert.equal(wasmHistory.explanation?.subject.case, "action");
    const historyExecution =
      wasmHistory.explanation?.subject.case === "action"
        ? wasmHistory.explanation.subject.value.proposal?.structure?.execution
        : undefined;
    assert.equal(historyExecution?.componentDigest, program.digest);
    assert.equal(
      historyExecution?.capabilityManifestDigest,
      wasmAllowed.evidence?.capabilityManifestDigest,
    );
    observe("wasmDigestAndManifestRecordedInHistory", true);

    const approvalRequired = await execute(
      computationA,
      program,
      "execution.action.approval",
      "run|proposal.wasm.approval|operation.wasm.approval|9",
      scopedManifest(fixtures.human.definition),
    );
    assertCompleted(approvalRequired);
    assert.equal(
      approvalRequired.output?.action?.status,
      ProgramActionStatus.AWAITING_APPROVAL,
    );
    const approvalProposal = await proposalContract(
      admin,
      tenantA,
      "proposal.wasm.approval",
    );
    assert.equal(approvalProposal.authorityKind, "awaiting_approval");
    observe("cedarCanRequireApprovalForWasmProposal", true);

    const tenantBDenied = await execute(
      computationB,
      program,
      "execution.action.tenant-b",
      "run|proposal.wasm.tenant-b|operation.wasm.tenant-b|9",
      scopedManifest(fixtures.direct.definition),
    );
    assert.equal(tenantBDenied.status, ExecutionStatus.CAPABILITY_DENIED);
    assert.equal(await operationCount(admin, tenantB, "operation.wasm.tenant-b"), 0);
    observe("sameComponentGetsDifferentTrustedTenantGrants", true);
    observe("unauthorizedActionDeniedByServer", true);

    const storedExecution = await executionRecord(
      admin,
      tenantA,
      "execution.action.allowed",
    );
    assert.equal(storedExecution.componentDigest, program.digest);
    assert.equal(
      storedExecution.capabilityManifestDigest,
      wasmAllowed.evidence?.capabilityManifestDigest,
    );
    assert.deepEqual(storedExecution.capabilityIds, [
      "action.request-stock",
      "explain.selected",
      "query.available",
    ]);
    assert.equal(storedExecution.startedActorId, "actor.agent.a");
    assert.equal(storedExecution.startedPrincipalId, "principal.agent.a");
    assert.equal(storedExecution.startedWorkloadId, "workload.agent.a");
    assert.equal(
      storedExecution.computeBasisDigest,
      wasmAllowed.computeBasis?.basisDigest,
    );
    assert.equal(
      storedExecution.releaseDigest,
      plantedReleaseA.digest,
    );
    assert.equal(
      storedExecution.policyCatalogDigest,
      plantedReleaseA.policyCatalogDigest,
    );
    assert.equal(storedExecution.budgetClassId, budgetClassStandard);
    assert.equal(storedExecution.membershipId, wasmAllowed.computeBasis?.membershipId);
    assert.deepEqual(
      JSON.parse(storedExecution.computeBasisJcs),
      JSON.parse(wasmAllowed.computeBasis?.explanationJcs ?? "null"),
    );
    assert.ok(storedExecution.fuelLimit > 0n);
    assert.ok(storedExecution.memoryLimitBytes > 0n);
    assert.ok(storedExecution.tableElementLimit > 0n);
    assert.ok(storedExecution.instanceLimit > 0n);
    assert.ok(storedExecution.tableLimit > 0n);
    assert.ok(storedExecution.memoryLimit > 0n);
    assert.ok(storedExecution.deadlineMillis > 0n);
    observe("completeImmutableComputeBasisPersisted", true);

    await verifyNoAmbientCredentials(program);
    observe("componentContainsNoCredentials", true);

    const plantedReleaseB = await plantBudgetRelease({
      authorizationPolicies: bootManifest.policies,
      budgets: [
        {
          deadlineMillis: 1500,
          fuel: 4_000_000,
          id: "clinic.query.standard.v2",
          instances: 4,
          memories: 2,
          memoryBytes: 8 * 1024 * 1024,
          priority: 100,
          resourceId: budgetResourceStandard,
          tableElements: 1024,
          tables: 2,
        },
        {
          deadlineMillis: 1500,
          fuel: 15_000,
          id: "clinic.query.tight.v2",
          instances: 4,
          memories: 2,
          memoryBytes: 8 * 1024 * 1024,
          priority: 10,
          resourceId: budgetResourceTight,
          tableElements: 1024,
          tables: 2,
        },
      ],
      databaseUrl: adminDatabaseUrl,
      generatedDirectory,
      world: tenantA,
      zoenPath,
    });
    assert.notEqual(plantedReleaseB.digest, plantedReleaseA.digest);
    const afterReleaseSwitch = await execute(
      computationA,
      program,
      "execution.pure.release-b",
      "pure",
      emptyManifest(),
    );
    assertCompleted(afterReleaseSwitch);
    assert.equal(
      afterReleaseSwitch.computeBasis?.budgetClassId,
      "clinic.query.standard.v2",
    );
    assert.equal(
      afterReleaseSwitch.computeBasis?.releaseDigest,
      plantedReleaseB.digest,
    );
    assert.notEqual(afterReleaseSwitch.requestDigest, pureFirst.requestDigest);
    observe("releaseSwitchChangesNewExecutionBasis", true);

    const committedSequence = wasmAllowed.output?.action?.commitSequence;
    assert.ok(committedSequence);
    assert.ok(server);
    await stopServer(server);
    server = await startServer(policyManifestPath);
    const recoveredStatus = await actionA.getOperationStatus({
      operationId: "operation.wasm.allowed",
    });
    assert.equal(recoveredStatus.status, CommitStatus.COMMITTED);
    assert.equal(recoveredStatus.receipt?.commitSequence, committedSequence);
    const recoveredExecution = await execute(
      computationA,
      program,
      "execution.action.allowed",
      "run|proposal.wasm.allowed|operation.wasm.allowed|9",
      allowedManifest,
    );
    assert.equal(
      recoveredExecution.output?.action?.commitSequence,
      committedSequence,
    );
    assert.equal(
      recoveredExecution.computeBasis?.basisDigest,
      wasmAllowed.computeBasis?.basisDigest,
    );
    assert.equal(
      recoveredExecution.computeBasis?.releaseDigest,
      plantedReleaseA.digest,
    );
    assert.equal(
      await operationCount(admin, tenantA, "operation.wasm.allowed"),
      1,
    );
    const pureAfterRestart = await execute(
      computationA,
      program,
      "execution.pure.after-restart",
      "pure",
      emptyManifest(),
    );
    assertCompleted(pureAfterRestart);
    assert.equal(pureAfterRestart.resultDigest, pureFirst.resultDigest);
    assert.equal(
      pureAfterRestart.computeBasis?.releaseDigest,
      plantedReleaseB.digest,
    );
    observe("restartReloadsContentAddressedComponent", true);
    observe("restartReplaysImmutableHistoricalComputeBasis", true);
    observe("committedActionRecoversAtMostOnce", true);

    assert.ok(failures.tightMembershipId);
    await revokeMembership(failures.tightMembershipId);
    await expectConnectCode(
      () =>
        execute(
          computationAdminA,
          program,
          "execution.revoked-membership",
          "pure",
          emptyManifest(),
        ),
      Code.PermissionDenied,
    );
    inject("revoked-membership");
    observe("revokedMembershipDeniedBeforeExecution", true);

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^(17|18)\./);
    const wasmtimeVersion = await wasmtimeDependency();
    const sourceCommit = gitHead(repositoryRoot);
    const artifact = {
      assertions,
      component: {
        digest: program.digest,
        interface: componentInterface,
        sizeBytes: program.bytes.byteLength,
      },
      componentVersions: {
        postgres: postgresVersion,
        wasmtime: wasmtimeVersion,
      },
      dimensions: {
        actors:
          "two Better Auth Membership actors use Connect Execute and receive different server-selected BudgetClasses",
        isolation:
          "cross-World Membership resolution and Memberships without compute delegation fail closed",
        negative:
          "the request has no BudgetClass field; delegation denial and revocation stop execution before Wasmtime",
        path:
          "Active Membership plus one pinned WorldRelease PolicyCatalog selects BudgetClass, evaluates Cedar, seals ResolvedComputeBasis, then consumes it in Wasmtime",
        recovery:
          "after zoend restart, new executions use the new active release while completed executions replay their immutable historical basis",
        replay:
          "same execution id, Membership, component, manifest, and input returns the persisted result, request digest, and basis digest",
      },
      failureInjections,
      failures,
      finishedAt: new Date().toISOString(),
      interfacesProven: ["connect"],
      journeys: [],
      limits: {
        budgetClass: budgetClassStandard,
        deadlineMillis: storedExecution.deadlineMillis.toString(),
        fuel: storedExecution.fuelLimit.toString(),
        instances: storedExecution.instanceLimit.toString(),
        memories: storedExecution.memoryLimit.toString(),
        memoryBytes: storedExecution.memoryLimitBytes.toString(),
        tableElements: storedExecution.tableElementLimit.toString(),
        tables: storedExecution.tableLimit.toString(),
      },
      proofPending: [
        "J4 requires the downstream governed clinic journey rather than a computation-local assertion",
        "J7 requires real inbound MCP and Eve paths; this journey proves Connect only",
      ],
      scenario: "wasm-code-mode",
      sourceCommit,
      startedAt,
      unit: "W2-07",
    };
    await writeScenarioArtifact(repositoryRoot, "wasm-code-mode", artifact);
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  } finally {
    await admin.end().catch(() => undefined);
    if (server !== undefined && server.child.exitCode === null) {
      await stopServer(server);
    }
    await stopAuthDoor(door);
  }
}

async function revokeMembership(membershipId: string): Promise<void> {
  const response = await fetch(
    `${e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171)}/identity/admin/revoke`,
    {
      body: JSON.stringify({ membershipId, reason: "admin" }),
      headers: {
        authorization: `Bearer ${e2eIdentityAdminToken()}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  assert.equal(
    response.ok,
    true,
    `revoke Membership ${membershipId}: ${response.status} ${await response.text()}`,
  );
}

async function recordClaims(
  worldA: ReturnType<typeof worldClient>,
  worldB: ReturnType<typeof worldClient>,
  fixtures: {
    direct: Awaited<ReturnType<typeof loadFixture>>;
    human: Awaited<ReturnType<typeof loadFixture>>;
  },
): Promise<void> {
  for (const [suffix, value] of [
    ["first", "10"],
    ["second", "20"],
  ] as const) {
    await recordAvailable(worldA, {
      claimId: `claim.wasm.direct.${suffix}`,
      fixture: fixtures.direct,
      resource: resourceId,
      tenantId: tenantA,
      value,
    });
    await recordAvailable(worldA, {
      claimId: `claim.wasm.human.${suffix}`,
      fixture: fixtures.human,
      resource: resourceId,
      tenantId: tenantA,
      value,
    });
  }
  await recordAvailable(worldB, {
    claimId: "claim.wasm.direct.tenant-b",
    fixture: fixtures.direct,
    resource: resourceId,
    tenantId: tenantB,
    value: "50",
  });
}

async function verifyAdmissionFailures(
  client: ReturnType<typeof computationClient>,
  program: ComponentFixture,
): Promise<void> {
  const mismatch = await loadComponentFixture("interface-mismatch");
  const mismatchResult = await publish(client, mismatch);
  assert.equal(
    mismatchResult.status,
    ComponentAdmissionStatus.INTERFACE_MISMATCH,
  );
  inject("component-interface-mismatch");

  const malformedBytes = new Uint8Array([0, 1, 2, 3]);
  const malformed = await client.publishComponent({
    claimedDigest: sha256(malformedBytes),
    component: malformedBytes,
    componentInterface,
  });
  assert.equal(malformed.status, ComponentAdmissionStatus.MALFORMED);
  inject("malformed-component");

  const digestMismatch = await client.publishComponent({
    claimedDigest: "0".repeat(64),
    component: program.bytes,
    componentInterface,
  });
  assert.equal(
    digestMismatch.status,
    ComponentAdmissionStatus.DIGEST_MISMATCH,
  );
  inject("component-digest-mismatch");

  for (const [name, expectedImport] of [
    ["ambient-environment", "wasi:cli/environment@0.2.0"],
    ["ambient-filesystem", "wasi:filesystem/types@0.2.0"],
    ["ambient-network", "wasi:sockets/network@0.2.0"],
    ["ambient-secret", "zoen:secrets/store@1.0.0"],
  ] as const) {
    const fixture = await loadComponentFixture(name);
    const result = await publish(client, fixture);
    assert.equal(
      result.status,
      ComponentAdmissionStatus.UNDECLARED_CAPABILITY,
    );
    assert.equal(result.deniedCapability, expectedImport);
    inject(name);
  }
  observe("ambientWasiAndSecretImportsRejected", true);
}

async function verifyExecutionFailures(
  client: ReturnType<typeof computationClient>,
  tightClient: ReturnType<typeof computationClient>,
  program: ComponentFixture,
  definition: Awaited<ReturnType<typeof loadFixture>>["definition"],
) {
  const fuel = await execute(
    tightClient,
    program,
    "execution.failure.fuel",
    "spin",
    emptyManifest(),
  );
  assert.equal(fuel.status, ExecutionStatus.FUEL_EXHAUSTED);
  assert.equal(fuel.computeBasis?.budgetClassId, budgetClassTight);
  assert.equal(fuel.computeBasis?.budgetResourceId, budgetResourceTight);
  inject("fuel-exhaustion");

  const trapped = await execute(
    client,
    program,
    "execution.failure.trap",
    "trap",
    emptyManifest(),
  );
  assert.equal(trapped.status, ExecutionStatus.TRAP_BEFORE_ACTION_REQUEST);
  inject("trap-before-action-request");

  const missing = await execute(
    client,
    program,
    "execution.failure.missing-capability",
    "missing",
    emptyManifest(),
  );
  assert.equal(missing.status, ExecutionStatus.CAPABILITY_UNAVAILABLE);
  assert.equal(missing.deniedCapability, "query.missing");
  inject("host-capability-unavailable");

  const foreignEntity = await execute(
    client,
    program,
    "execution.failure.foreign-entity",
    "run|proposal.failure.entity|operation.failure.entity|9",
    scopedManifest(definition, { entityId: "inventory.item.foreign" }),
  );
  assert.equal(foreignEntity.status, ExecutionStatus.CAPABILITY_DENIED);
  inject("foreign-entity");

  const foreignAction = await execute(
    client,
    program,
    "execution.failure.foreign-action",
    "run|proposal.failure.action|operation.failure.action|9",
    scopedManifest(definition, { actionId: "inventory.deleteStock" }),
  );
  assert.equal(foreignAction.status, ExecutionStatus.CAPABILITY_DENIED);
  inject("foreign-action");

  const interfaceMismatch = await execute(
    client,
    program,
    "execution.failure.interface",
    "pure",
    emptyManifest("zoen:code-mode/computation@2.0.0"),
  );
  assert.equal(interfaceMismatch.status, ExecutionStatus.INTERFACE_MISMATCH);
  inject("execution-interface-mismatch");

  return {
    foreignAction: ExecutionStatus[foreignAction.status],
    foreignEntity: ExecutionStatus[foreignEntity.status],
    fuel: ExecutionStatus[fuel.status],
    interfaceMismatch: ExecutionStatus[interfaceMismatch.status],
    missingCapability: ExecutionStatus[missing.status],
    tightMembershipId: fuel.computeBasis?.membershipId ?? "",
    trap: ExecutionStatus[trapped.status],
  };
}

async function readOrdinaryPath(
  history: ReturnType<typeof historyClient>,
  world: ReturnType<typeof worldClient>,
  fixture: Awaited<ReturnType<typeof loadFixture>>,
) {
  const query = await world.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
    definition: fixture.definition,
    entityId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: relationId },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
  const selected = query.values.filter((value) => {
    assert.equal(value.value?.value.case, "integerValue");
    return BigInt(value.value.value.value) > 9n;
  });
  const aggregate = selected
    .reduce((sum, value) => {
      assert.equal(value.value?.value.case, "integerValue");
      return sum + BigInt(value.value.value.value);
    }, 0n)
    .toString();
  const selectedClaim = selected[0]?.dependencies[0]?.claimId;
  assert.ok(selectedClaim);
  const explanation = await history.explain({
    target: { target: { case: "claimId", value: selectedClaim } },
  });
  assert.equal(explanation.explanation?.complete, true);
  return {
    aggregate,
    explanationComplete: explanation.explanation.complete,
    selectedValues: selected.length,
    valuesScanned: query.values.length,
  };
}

async function runOrdinaryActionPath(
  action: ReturnType<typeof actionClient>,
  fixture: Awaited<ReturnType<typeof loadFixture>>,
): Promise<void> {
  const proposal = await action.propose({
    actionId,
    definition: fixture.definition,
    expiresAt: timestampFromDate(minutesFromNow(5)),
    inputs: [
      create(ActionInputSchema, {
        inputId: "quantity",
        value: create(ExactValueSchema, {
          value: { case: "integerValue", value: "2" },
        }),
      }),
    ],
    operationId: "operation.ordinary.allowed",
    proposalId: "proposal.ordinary.allowed",
    resourceId,
    validAt: timestampFromDate(validAt),
  });
  assert.equal(proposal.decision, PolicyDecision.PERMIT);
  assert.equal(proposal.proposal?.status, ProposalStatus.READY);
  const committed = await action.commit({
    operationId: "operation.ordinary.allowed",
    proposalId: "proposal.ordinary.allowed",
  });
  assert.equal(committed.status, CommitStatus.COMMITTED);
}

function assertCompleted(response: {
  output?: unknown;
  resultDigest: string;
  status: ExecutionStatus;
}): void {
  assert.equal(response.status, ExecutionStatus.COMPLETED);
  assert.ok(response.output);
  assert.match(response.resultDigest, /^[0-9a-f]{64}$/);
}

async function actionState(client: PostgresClient, tenantId: string) {
  const result = await client.query<{
    operations: string;
    proposals: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM action_operations WHERE tenant_id = $1) AS operations,
       (SELECT count(*)::text FROM action_proposals WHERE tenant_id = $1) AS proposals`,
    [tenantId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    operations: Number(row.operations),
    proposals: Number(row.proposals),
  };
}

async function operationCount(
  client: PostgresClient,
  tenantId: string,
  operationId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM action_operations
     WHERE tenant_id = $1 AND operation_id = $2`,
    [tenantId, operationId],
  );
  return Number(result.rows[0]?.count);
}

async function proposalContract(
  client: PostgresClient,
  tenantId: string,
  proposalId: string,
) {
  const result = await client.query<{
    action_id: string;
    authority_kind: string;
    component_digest: string | null;
    component_interface: string | null;
    definition_digest: string;
    definition_id: string;
    definition_revision: string;
    input_id: string;
    resource_id: string;
    value_kind: string;
    value_text: string;
  }>(
    `SELECT p.action_id, p.authority_kind, p.component_digest,
            p.component_interface, p.definition_digest, p.definition_id,
            p.definition_revision::text, p.resource_id, i.input_id,
            i.value_kind, i.value_text
     FROM action_proposals p
     JOIN action_proposal_inputs i
       ON i.tenant_id = p.tenant_id AND i.proposal_id = p.proposal_id
     WHERE p.tenant_id = $1 AND p.proposal_id = $2
     ORDER BY i.ordinal`,
    [tenantId, proposalId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    authorityKind: row.authority_kind,
    business: {
      actionId: row.action_id,
      definitionDigest: row.definition_digest,
      definitionId: row.definition_id,
      definitionRevision: row.definition_revision,
      inputId: row.input_id,
      resourceId: row.resource_id,
      valueKind: row.value_kind,
      valueText: row.value_text,
    },
    componentDigest: row.component_digest,
    componentInterface: row.component_interface,
  };
}

async function executionRecord(
  client: PostgresClient,
  tenantId: string,
  executionId: string,
) {
  const result = await client.query<{
    budget_class_id: string;
    capability_ids: string[];
    capability_manifest_digest: string;
    compute_basis_digest: string;
    compute_basis_jcs: string;
    component_digest: string;
    deadline_millis: string;
    fuel_limit: string;
    instance_limit: string;
    memory_limit: string;
    memory_limit_bytes: string;
    membership_id: string;
    policy_catalog_digest: string;
    release_digest: string;
    started_actor_id: string;
    started_principal_id: string;
    started_workload_id: string;
    table_element_limit: string;
    table_limit: string;
  }>(
    `SELECT budget_class_id, capability_ids, capability_manifest_digest,
            compute_basis_digest, compute_basis_jcs, component_digest,
            deadline_millis::text, fuel_limit::text, instance_limit::text,
            memory_limit::text, memory_limit_bytes::text, membership_id,
            policy_catalog_digest, release_digest, started_actor_id,
            started_principal_id, started_workload_id,
            table_element_limit::text, table_limit::text
     FROM wasm_executions
     WHERE tenant_id = $1 AND execution_id = $2`,
    [tenantId, executionId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    budgetClassId: row.budget_class_id,
    capabilityIds: row.capability_ids,
    capabilityManifestDigest: row.capability_manifest_digest,
    computeBasisDigest: row.compute_basis_digest,
    computeBasisJcs: row.compute_basis_jcs,
    componentDigest: row.component_digest,
    deadlineMillis: BigInt(row.deadline_millis),
    fuelLimit: BigInt(row.fuel_limit),
    instanceLimit: BigInt(row.instance_limit),
    memoryLimit: BigInt(row.memory_limit),
    memoryLimitBytes: BigInt(row.memory_limit_bytes),
    membershipId: row.membership_id,
    policyCatalogDigest: row.policy_catalog_digest,
    releaseDigest: row.release_digest,
    startedActorId: row.started_actor_id,
    startedPrincipalId: row.started_principal_id,
    startedWorkloadId: row.started_workload_id,
    tableElementLimit: BigInt(row.table_element_limit),
    tableLimit: BigInt(row.table_limit),
  };
}

async function verifyNoAmbientCredentials(
  program: ComponentFixture,
): Promise<void> {
  assert.equal(program.bytes[0], 0);
  assert.equal(program.bytes[1], 97);
  assert.equal(program.bytes[2], 115);
  assert.equal(program.bytes[3], 109);
  assert.equal(program.bytes[4], 13);
  const contents = Buffer.from(program.bytes).toString("latin1");
  for (const forbidden of [
    "DATABASE_URL",
    "agent-a-secret",
    "postgres://",
    "zoen_app",
  ]) {
    assert.equal(contents.includes(forbidden), false);
  }
  const protocol = await readFile(
    path.join(repositoryRoot, "wit", "zoen-code-mode.wit"),
    "utf8",
  );
  assert.doesNotMatch(
    protocol,
    /\b(?:actor-id|principal-id|tenant-id|workload-id|database-url|secret)\b/,
  );
}

async function wasmtimeDependency(): Promise<string> {
  const tree = await command("cargo", [
    "tree",
    "--package",
    "zoen-adapters",
    "--depth",
    "1",
  ]);
  const dependency = tree
    .split("\n")
    .find((line) => line.includes("wasmtime v"))
    ?.trim();
  assert.ok(dependency);
  return dependency;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
