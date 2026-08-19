import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { z } from "zod";
import {
  actionPlanSchema,
  agentSessionCommandSchema,
  type AgentSessionResult,
  type PolicyEvidence as AgentPolicyEvidence,
} from "../packages/harness/src/index.js";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
  type PolicyEvidence as WirePolicyEvidence,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import type { CausalExplanation } from "../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  actionClient,
  actionId,
  adminClient,
  artifactsDirectory,
  command,
  composeOutput,
  definitionClient,
  directProposal,
  disableCapability,
  disableProvider,
  historyClient,
  injectCommitResponseLoss,
  invokeSession,
  killWorker,
  loadDefinition,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  operationEvidence,
  proposalEvidence,
  publishAndActivate,
  proxyStatus,
  recordAvailable,
  registerWorker,
  releaseCommitRecovery,
  repositoryRoot,
  resourceId,
  restrictedActionId,
  sessionCommand,
  startResponseLossProxy,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  trackedFilesContain,
  validAt,
  waitFor,
  workerHealth,
  worldClient,
  writePolicyFixtures,
  type ManagedProcess,
  type PolicyFixture,
} from "./agent-capabilities-live/support.js";

const environment = z
  .object({
    OPENCODE_API_KEY: z.string().min(1),
    OPENCODE_BASE_URL: z.literal("https://opencode.ai/zen/v1"),
    ZOEN_PROVIDER_A_ID: z.literal("zen-a"),
    ZOEN_PROVIDER_A_MODEL: z.literal("deepseek-v4-flash-free"),
    ZOEN_PROVIDER_B_ID: z.literal("zen-b"),
    ZOEN_PROVIDER_B_MODEL: z.literal("big-pickle"),
  })
  .parse(process.env);
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const definition = await loadDefinition();
  const policies = await writePolicyFixtures(definition);
  const processes: ManagedProcess[] = [];
  const admin = adminClient();
  let zoend = await startZoend(policies["auto-commit"].manifestPath);
  processes.push(zoend);
  const proxy = await startResponseLossProxy();
  processes.push(proxy);
  await admin.connect();

  try {
    const tokens = {
      adminA: await oidcToken("admin-a"),
      adminB: await oidcToken("admin-b"),
      agentA: await oidcToken("agent-a"),
      agentB: await oidcToken("agent-b"),
      approverA: await oidcToken("approver-a"),
      humanA: await oidcToken("human-a"),
    };
    const actionA = actionClient(tokens.agentA);
    const actionB = actionClient(tokens.agentB);
    const approverA = actionClient(tokens.approverA);
    const humanA = actionClient(tokens.humanA);
    const worldA = worldClient(tokens.agentA);
    const worldB = worldClient(tokens.agentB);
    const historyA = historyClient(tokens.agentA);

    await publishAndActivate(
      definitionClient(tokens.adminA),
      tenantA,
      definition,
    );
    await publishAndActivate(
      definitionClient(tokens.adminB),
      tenantB,
      definition,
    );
    await recordAvailable(worldA, tenantA, definition, "10");
    await recordAvailable(worldB, tenantB, definition, "20");

    const agentDiscovery = await actionA.discover({
      definition: definition.definition,
      resourceId,
    });
    const humanDiscovery = await humanA.discover({
      definition: definition.definition,
      resourceId,
    });
    const agentActions = agentDiscovery.actions
      .map((action) => action.actionId)
      .sort();
    const humanActions = humanDiscovery.actions
      .map((action) => action.actionId)
      .sort();
    observe(
      "authorityScopedCapabilityDiscovery",
      agentDiscovery.trustedContext?.tenantId === tenantA &&
        agentDiscovery.trustedContext.principalId === "principal.agent.a" &&
        agentActions.length === 1 &&
        agentActions[0] === actionId &&
        humanActions.length === 2 &&
        humanActions.includes(actionId) &&
        humanActions.includes(restrictedActionId),
    );

    const proposalsBeforeRestricted = await proposalCount(
      admin,
      tenantA,
      "operation.agent-live.restricted",
    );
    const restrictedCode = await expectConnectCode(
      () =>
        actionA.propose({
          actionId: restrictedActionId,
          definition: definition.definition,
          expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
          inputs: [],
          operationId: "operation.agent-live.restricted",
          proposalId: "proposal.agent-live.restricted",
          resourceId,
          validAt: timestampFromDate(validAt),
        }),
      Code.PermissionDenied,
    );
    const proposalsAfterRestricted = await proposalCount(
      admin,
      tenantA,
      "operation.agent-live.restricted",
    );
    inject("crafted-restricted-action");
    observe(
      "craftedInvisibleActionRejectedByAuthority",
      restrictedCode === Code.PermissionDenied &&
        proposalsBeforeRestricted === proposalsAfterRestricted,
    );

    const directRequest = directProposal(definition, "human-auto");
    const directProposed = await humanA.propose(directRequest);
    assert.equal(directProposed.decision, PolicyDecision.PERMIT);
    assert.equal(directProposed.proposal?.status, ProposalStatus.READY);
    const directCommitted = await humanA.commit({
      operationId: directRequest.operationId,
      proposalId: directRequest.proposalId,
    });
    assert.equal(directCommitted.status, CommitStatus.COMMITTED);
    assert.ok(directCommitted.receipt);
    observe(
      "directHumanUsesOrdinaryActionLifecycle",
      directCommitted.receipt.actionId === actionId &&
        matchesPolicy(directCommitted.receipt.policy, policies["auto-commit"]),
    );

    let worker = await startWorker(tokens.agentA, definition.digest);
    processes.push(worker);
    const registration = await registerWorker();
    assert.match(registration, /ZoenAgentSession|deployment/i);
    const initialHealth = await workerHealth();
    observe(
      "agentWorkerMountsOnlyScopedCapabilities",
      initialHealth.trustedContext.tenantId === tenantA &&
        initialHealth.trustedContext.principalId === "principal.agent.a" &&
        initialHealth.capabilities.join(",") ===
          "available-stock,request-stock" &&
        initialHealth.providers.includes(environment.ZOEN_PROVIDER_A_ID) &&
        initialHealth.providers.includes(environment.ZOEN_PROVIDER_B_ID),
    );

    await injectCommitResponseLoss();
    inject("ordinary-action-commit-response-loss");
    const providerACommand = sessionCommand({
      modelCapability: "reasoning-fast",
      providerRoute: environment.ZOEN_PROVIDER_A_ID,
      suffix: "zen-a-recovery",
    });
    const providerAInvocation = invokeSession(providerACommand);
    void providerAInvocation.catch(() => undefined);
    const recoveryStart = await Promise.race([
      providerAInvocation.then((result) => ({
        kind: "session_completed" as const,
        result,
      })),
      waitFor(
        async () => {
          const status = await proxyStatus();
          return status.droppedCommitResponses === 1 ? status : undefined;
        },
        "the committed Action response to be dropped",
        7_200,
      ).then((status) => ({ kind: "response_dropped" as const, status })),
    ]);
    if (recoveryStart.kind === "session_completed") {
      throw new Error(
        `agent session completed before fault injection: ${recoveryStart.result.kind}`,
      );
    }
    await killWorker(worker);
    inject("agent-worker-sigkill-after-commit");
    worker = await startWorker(tokens.agentA, definition.digest);
    processes.push(worker);
    await releaseCommitRecovery();
    const providerAResult = await providerAInvocation;
    assert.equal(providerAResult.kind, "committed");
    if (providerAResult.kind !== "committed") {
      assert.fail("provider A did not commit");
    }
    const proxyAfterRecovery = await proxyStatus();
    const providerAEvidence = await operationEvidence(
      admin,
      tenantA,
      providerACommand.operationId,
    );
    observe(
      "committedOperationRecoveredAfterWorkerRestart",
      providerAResult.recoveredByOperationId &&
        proxyAfterRecovery.commitAttempts === 1 &&
        proxyAfterRecovery.operationStatusAttempts >= 2 &&
        providerAEvidence.operations === 1 &&
        providerAEvidence.authorityCommits === 1 &&
        providerAEvidence.records === 1,
    );
    observe(
      "autoCommitUsesCedarAndOrdinaryActionCommit",
      matchesPolicy(
        providerAResult.receipt.policy,
        policies["auto-commit"],
      ) &&
        providerAResult.receipt.actionId === actionId &&
        providerAEvidence.principalId === "principal.agent.a",
    );

    const providerBCommand = sessionCommand({
      modelCapability: "reasoning-high",
      providerRoute: environment.ZOEN_PROVIDER_B_ID,
      suffix: "zen-b-auto",
    });
    const providerBResult = await invokeSession(providerBCommand);
    assert.equal(providerBResult.kind, "committed");
    if (providerBResult.kind !== "committed") {
      assert.fail("provider B did not commit");
    }
    const providerBEvidence = await operationEvidence(
      admin,
      tenantA,
      providerBCommand.operationId,
    );
    const providerASemantics = await proposalEvidence(
      admin,
      tenantA,
      providerACommand.operationId,
    );
    const providerBSemantics = await proposalEvidence(
      admin,
      tenantA,
      providerBCommand.operationId,
    );
    const directSemantics = await proposalEvidence(
      admin,
      tenantA,
      directRequest.operationId,
    );
    observe(
      "bothZenProvidersExecuteSameCapabilityContract",
      providerAResult.provider.providerRouteId ===
        environment.ZOEN_PROVIDER_A_ID &&
        providerBResult.provider.providerRouteId ===
          environment.ZOEN_PROVIDER_B_ID &&
        providerAResult.provider.providerKind === "openai-compatible" &&
        providerBResult.provider.providerKind === "openai-compatible" &&
        providerAResult.receipt.actionId === providerBResult.receipt.actionId &&
        sameSemantics(providerASemantics, providerBSemantics) &&
        providerAEvidence.records === providerBEvidence.records,
    );
    observe(
      "agentAndDirectClientShareActionSemantics",
      sameSemantics(providerASemantics, directSemantics) &&
        directCommitted.receipt.actionId === providerAResult.receipt.actionId,
    );
    observe(
      "providerCorrelationExcludesPrivateReasoning",
      correlationIsAttributable(providerAResult) &&
        correlationIsAttributable(providerBResult),
    );

    await stopProcess(worker);
    worker = await startWorker(tokens.agentB, definition.digest);
    processes.push(worker);
    const tenantBHealth = await workerHealth();
    const tenantBCommand = sessionCommand({
      modelCapability: "reasoning-high",
      providerRoute: environment.ZOEN_PROVIDER_B_ID,
      suffix: "zen-b-tenant-b",
    });
    const tenantBResult = await invokeSession(tenantBCommand);
    assert.equal(tenantBResult.kind, "committed");
    if (tenantBResult.kind !== "committed") {
      assert.fail("tenant B agent did not commit");
    }
    const tenantBEvidence = await operationEvidence(
      admin,
      tenantB,
      tenantBCommand.operationId,
    );
    const tenantAForTenantBOperation = await operationEvidence(
      admin,
      tenantA,
      tenantBCommand.operationId,
    );
    observe(
      "trustedTenantAndWorkloadScopeSameAgentCode",
      tenantBHealth.trustedContext.tenantId === tenantB &&
        tenantBHealth.trustedContext.principalId === "principal.agent.b" &&
        tenantBEvidence.principalId === "principal.agent.b" &&
        tenantBEvidence.operations === 1 &&
        tenantAForTenantBOperation.operations === 0,
    );

    await stopProcess(worker);
    await stopProcess(zoend);
    zoend = await startZoend(policies.approval.manifestPath);
    processes.push(zoend);
    worker = await startWorker(tokens.agentA, definition.digest);
    processes.push(worker);
    const approvalCommand = sessionCommand({
      modelCapability: "reasoning-fast",
      providerRoute: environment.ZOEN_PROVIDER_A_ID,
      suffix: "approval",
    });
    const approvalResult = await invokeSession(approvalCommand);
    assert.equal(approvalResult.kind, "awaiting_approval");
    if (approvalResult.kind !== "awaiting_approval") {
      assert.fail("approval policy did not pause the agent");
    }
    const beforeApproval = await operationEvidence(
      admin,
      tenantA,
      approvalCommand.operationId,
    );
    const approved = await approverA.approve({
      approvalId: "approval.agent-live",
      expiresAt: timestampFromDate(new Date(Date.now() + 240_000)),
      proposalId: approvalResult.proposalId,
    });
    assert.equal(approved.decision, PolicyDecision.PERMIT);
    const approvalCommit = await actionA.commit({
      operationId: approvalCommand.operationId,
      proposalId: approvalResult.proposalId,
    });
    assert.equal(approvalCommit.status, CommitStatus.COMMITTED);
    assert.ok(approvalCommit.receipt);
    observe(
      "approvalPolicyStopsAgentUntilHumanApproval",
      beforeApproval.operations === 0 &&
        matchesPolicy(approvalResult.policy, policies.approval) &&
        approved.approval?.approvedBy === "actor.approver.a" &&
        matchesPolicy(approvalCommit.receipt.policy, policies.approval),
    );

    await stopProcess(worker);
    await stopProcess(zoend);
    zoend = await startZoend(policies.deny.manifestPath);
    processes.push(zoend);
    worker = await startWorker(tokens.agentA, definition.digest);
    processes.push(worker);
    const denyCommand = sessionCommand({
      modelCapability: "reasoning-high",
      providerRoute: environment.ZOEN_PROVIDER_B_ID,
      suffix: "deny",
    });
    const denyResult = await invokeSession(denyCommand);
    assert.equal(denyResult.kind, "denied");
    if (denyResult.kind !== "denied") {
      assert.fail("deny policy did not deny the agent");
    }
    const deniedEvidence = await operationEvidence(
      admin,
      tenantA,
      denyCommand.operationId,
    );
    observe(
      "denyPolicyPreventsBusinessMutation",
      matchesPolicy(denyResult.policy, policies.deny) &&
        deniedEvidence.operations === 0 &&
        deniedEvidence.records === 0,
    );
    observe(
      "policyRevisionAloneChangesAgentOutcome",
      definition.digest === providerASemantics.definitionDigest &&
        policies["auto-commit"].revision === 1 &&
        policies.approval.revision === 2 &&
        policies.deny.revision === 3 &&
        providerAResult.kind === "committed" &&
        approvalResult.kind === "awaiting_approval" &&
        denyResult.kind === "denied",
    );

    await disableProvider(environment.ZOEN_PROVIDER_B_ID);
    const disabledProvider = await invokeSession(
      sessionCommand({
        modelCapability: "reasoning-high",
        providerRoute: environment.ZOEN_PROVIDER_B_ID,
        suffix: "provider-disabled",
      }),
    );
    await disableCapability("request-stock");
    const disabledCapability = await invokeSession(
      sessionCommand({
        modelCapability: "reasoning-fast",
        providerRoute: environment.ZOEN_PROVIDER_A_ID,
        suffix: "capability-disabled",
      }),
    );
    const healthAfterUnmount = await workerHealth();
    observe(
      "disabledRegistrationsDisappearFromFutureSessions",
      disabledProvider.kind === "provider_unavailable" &&
        disabledCapability.kind === "capability_unavailable" &&
        disabledCapability.missing.includes("request-stock") &&
        !healthAfterUnmount.providers.includes(
          environment.ZOEN_PROVIDER_B_ID,
        ) &&
        !healthAfterUnmount.capabilities.includes("request-stock"),
    );

    const forgedActionPlan = actionPlanSchema.safeParse({
      action: "request-stock",
      inputs: [
        { id: "quantity", value: { kind: "integer", value: "2" } },
      ],
      principalId: "principal.forged",
      tenantId: tenantB,
    });
    const forgedSession = agentSessionCommandSchema.safeParse({
      ...providerACommand,
      principalId: "principal.forged",
      tenantId: tenantB,
    });
    observe(
      "modelSuppliedIdentityCannotEnterTrustedContext",
      !forgedActionPlan.success &&
        !forgedSession.success &&
        providerASemantics.principalId === "principal.agent.a",
    );

    const autoExplanation = await historyA.explain({
      target: {
        target: {
          case: "operationId",
          value: providerACommand.operationId,
        },
      },
    });
    const approvalExplanation = await historyA.explain({
      target: {
        target: {
          case: "operationId",
          value: approvalCommand.operationId,
        },
      },
    });
    observe(
      "policyRevisionsRemainAttributableInExplanation",
      explanationHasPolicy(
        autoExplanation.explanation,
        policies["auto-commit"],
      ) &&
        explanationHasPolicy(
          approvalExplanation.explanation,
          policies.approval,
        ),
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
    const restateImage = await composeOutput(
      "images",
      "restate",
      "--format",
      "{{.Repository}}:{{.Tag}}",
    );
    assert.match(restateImage, /restate:1\.7\.2/);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const cargoTree = await command("cargo", [
      "tree",
      "--locked",
      "--workspace",
    ]);
    observe("wasmtimeAbsent", !/\bwasmtime\b/i.test(cargoTree));
    const decisionsFiles = await command("git", [
      "ls-files",
      "*decisions.tsv",
    ]);
    observe("productDecisionsTsvAbsent", decisionsFiles.length === 0);

    const manifest = {
      assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
        restate: restateImage,
      },
      definition: {
        definitionId: definition.definition.definitionId,
        digest: definition.digest,
        revision: definition.definition.revision.toString(),
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      mutants: {
        agentOnlyBusinessHandler:
          assertions.autoCommitUsesCedarAndOrdinaryActionCommit === true,
        autoCommitBypassesCedar:
          assertions.autoCommitUsesCedarAndOrdinaryActionCommit === true,
        capabilityRemainsAfterUnmount:
          assertions.disabledRegistrationsDisappearFromFutureSessions === true,
        exposeAllActions:
          assertions.agentWorkerMountsOnlyScopedCapabilities === true &&
          assertions.craftedInvisibleActionRejectedByAuthority === true,
        providerBranchChangesSemanticIntent:
          assertions.bothZenProvidersExecuteSameCapabilityContract === true,
        repeatActionAfterLostResponse:
          assertions.committedOperationRecoveredAfterWorkerRestart === true,
        trustModelTenantOrPrincipal:
          assertions.modelSuppliedIdentityCannotEnterTrustedContext === true,
      },
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      policies: Object.fromEntries(
        Object.entries(policies).map(([mode, policy]) => [
          mode,
          {
            digest: policy.digest,
            policyId: policy.policyId,
            revision: policy.revision,
          },
        ]),
      ),
      providers: [
        {
          adapter: "openai-compatible",
          capability: "reasoning-fast",
          modelId: environment.ZOEN_PROVIDER_A_MODEL,
          routeId: environment.ZOEN_PROVIDER_A_ID,
        },
        {
          adapter: "openai-compatible",
          capability: "reasoning-high",
          modelId: environment.ZOEN_PROVIDER_B_MODEL,
          routeId: environment.ZOEN_PROVIDER_B_ID,
        },
      ],
      scenario: "agent-capabilities-live",
      sessions: {
        approval: approvalResult,
        autoCommitProviderA: providerAResult,
        autoCommitProviderB: providerBResult,
        deny: denyResult,
        tenantB: tenantBResult,
      },
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    const provisionalManifest = JSON.stringify(manifest);
    observe(
      "manifestContainsNoSecretsOrHiddenReasoning",
      !provisionalManifest.includes(environment.OPENCODE_API_KEY) &&
        !provisionalManifest.includes("reasoning_content") &&
        !(await trackedFilesContain(environment.OPENCODE_API_KEY)),
    );
    assert.ok(Object.values(manifest.mutants).every(Boolean));
    const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    await mkdir(artifactsDirectory, { recursive: true });
    await writeFile(
      path.join(artifactsDirectory, "agent-capabilities-live.json"),
      serializedManifest,
    );
    process.stdout.write(serializedManifest);
  } finally {
    await admin.end();
    for (const process of processes.reverse()) {
      if (
        process.child.exitCode === null &&
        process.child.signalCode === null
      ) {
        await stopProcess(process);
      }
    }
  }
}

function matchesPolicy(
  policy: AgentPolicyEvidence | WirePolicyEvidence | undefined,
  expected: PolicyFixture,
): boolean {
  if (policy === undefined) {
    return false;
  }
  if ("policyId" in policy) {
    return (
      policy.policyId === expected.policyId &&
      policy.digest === expected.digest &&
      policy.revision === expected.revision.toString() &&
      policy.determiningPolicyIds.length > 0
    );
  }
  const revision = policy.revision;
  return (
    revision?.policyId === expected.policyId &&
    revision.digest === expected.digest &&
    revision.revision === BigInt(expected.revision) &&
    policy.determiningPolicyIds.length > 0
  );
}

function sameSemantics(
  left: Awaited<ReturnType<typeof proposalEvidence>>,
  right: Awaited<ReturnType<typeof proposalEvidence>>,
): boolean {
  return (
    left.actionId === actionId &&
    right.actionId === actionId &&
    left.definitionDigest === right.definitionDigest &&
    left.inputId === "quantity" &&
    right.inputId === "quantity" &&
    left.value === "2" &&
    right.value === "2"
  );
}

function correlationIsAttributable(
  result: Extract<AgentSessionResult, { kind: "committed" }>,
): boolean {
  return (
    result.sessionId.length > 0 &&
    result.provider.providerCallId.length > 0 &&
    result.provider.providerRouteId.length > 0 &&
    result.receipt.operationId.length > 0 &&
    /^[0-9a-f]{64}$/.test(result.provider.promptDigest)
  );
}

function explanationHasPolicy(
  explanation: CausalExplanation | undefined,
  expected: PolicyFixture,
): boolean {
  if (explanation?.subject.case !== "action") {
    return false;
  }
  return explanation.subject.value.policies.some((entry) =>
    matchesPolicy(entry.policy, expected),
  );
}

async function proposalCount(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
  operationId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM action_proposals
     WHERE tenant_id = $1 AND operation_id = $2`,
    [tenantId, operationId],
  );
  return Number(result.rows[0]?.count);
}

async function expectConnectCode(
  operation: () => Promise<unknown>,
  expected: Code,
): Promise<Code> {
  try {
    await operation();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
    return error.code;
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
