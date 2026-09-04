import assert from "node:assert/strict";
import { Client as PostgresClient } from "pg";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  KERNEL_ACTIONS,
  SEVEN_VERBS,
  buildKernelPolicyCatalog,
  createZoenRunner,
  ontologyCatalogBytes,
  provisionWorldMembership,
  provisionWorldReleaseActors,
  recordAssertion,
  revokeWorldMembership,
  startReleaseIdentityServer,
  stopReleaseIdentityServer,
  writeGeneratedJson,
  zoenBinaryPath,
  type KernelVerb,
  type WorldMembership,
  type ZoenResult,
} from "./kernel-world-support.js";
import { gitHead } from "./scenario-evidence.js";

const scenario = "agent-parity";
const repositoryRoot = process.cwd();
const databaseUrl = e2ePostgresUrl("postgres", "postgres", 55_491);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const zoen = createZoenRunner(zoenBinaryPath(repositoryRoot), databaseUrl);
const assertions: Record<string, boolean> = {};

interface CatalogBytes {
  ontology: string;
  policy: string;
  executors: string;
  components: string;
}

interface EvidenceRow {
  action_id: string;
  actor_id: string;
  approved: boolean;
  delegation_jcs: string;
  determining_policies: string[];
  membership_id: string;
  policy_digest: string;
  policy_id: string;
  same_timestamp: boolean;
  workload_id: string;
}

function record(name: string, observed: boolean): void {
  recordAssertion(assertions, name, observed);
}

function contentFromBytes(world: string, bytes: CatalogBytes): Record<string, unknown> {
  return {
    world,
    parent: null,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  };
}

function kernel(verb: string, args: string[]): ZoenResult {
  return zoen.withBody(zoen.runZoen(["kernel", verb, ...args]));
}

async function kernelAsync(verb: string, args: string[]): Promise<ZoenResult> {
  return zoen.withBody(await zoen.runZoenAsync(["kernel", verb, ...args]));
}

function authorityArgs(actor: WorldMembership): string[] {
  return ["--principal", actor.principal, "--membership", actor.membership];
}

function catalogFingerprint(body: Record<string, unknown> | undefined): string {
  return JSON.stringify({
    catalog: body?.catalog,
    publicVerbs: body?.publicVerbs,
    releaseDigest: body?.releaseDigest,
    world: body?.world,
  });
}

function actorByVerb(builder: WorldMembership, governor: WorldMembership): Record<KernelVerb, string> {
  return Object.fromEntries(
    KERNEL_ACTIONS.map(({ verb }) => [verb, verb === "Propose" ? builder.actor : governor.actor]),
  ) as Record<KernelVerb, string>;
}

async function inspectEvidence(
  proposalId: string,
  receiptId: string,
): Promise<{ decision: EvidenceRow; execution: EvidenceRow; proposal: EvidenceRow; receipt: EvidenceRow }> {
  const database = new PostgresClient({ connectionString: databaseUrl });
  await database.connect();
  try {
    const specs = [
      ["proposal", "world_kernel_proposals", "proposed_at_micros", "proposal_id", proposalId],
      ["decision", "world_kernel_decisions", "decided_at_micros", "proposal_id", proposalId],
      ["receipt", "world_kernel_receipts", "committed_at_micros", "proposal_id", proposalId],
      ["execution", "world_kernel_executions", "executed_at_micros", "receipt_id", receiptId],
    ] as const;
    const rows = {} as Record<(typeof specs)[number][0], EvidenceRow>;
    for (const [label, table, eventColumn, keyColumn, keyValue] of specs) {
      const result = await database.query<EvidenceRow>(
        `SELECT action_id, actor_id, approved, delegation_jcs, determining_policies,
                membership_id, policy_digest, policy_id, workload_id,
                authorized_at_micros = ${eventColumn} AS same_timestamp
           FROM ${table}
          WHERE ${keyColumn} = $1`,
        [keyValue],
      );
      assert.equal(result.rowCount, 1, `${table} must contain exactly one immutable row`);
      const row = result.rows[0];
      assert.ok(row, `${table} evidence row missing`);
      rows[label] = row;
    }
    return rows;
  } finally {
    await database.end();
  }
}

function verifyEvidenceRow(input: {
  actor: WorldMembership;
  approved: boolean;
  expectedPolicyDigest: string;
  row: EvidenceRow;
  verb: KernelVerb;
}): boolean {
  const action = KERNEL_ACTIONS.find(({ verb }) => verb === input.verb);
  assert.ok(action, `missing action metadata for ${input.verb}`);
  const delegation = JSON.parse(input.row.delegation_jcs) as Record<string, unknown>;
  const checks = {
    action: input.row.action_id === action.actionId,
    actor: input.row.actor_id === input.actor.actor,
    approval: input.row.approved === input.approved,
    delegation: JSON.stringify(delegation).includes(action.actionId),
    determiningPolicies:
      input.row.determining_policies.length > 0 &&
      input.row.determining_policies.includes("zoen.mac.dominates"),
    membership: input.row.membership_id === input.actor.membership,
    policyDigest: input.row.policy_digest === input.expectedPolicyDigest,
    policyId: input.row.policy_id === `policy.world.kernel.${action.operation}.r1`,
    timestamp: input.row.same_timestamp === true,
    workload: input.row.workload_id === input.actor.workload,
  };
  if (!Object.values(checks).every(Boolean)) {
    console.error(`${input.verb} evidence mismatch`, { checks, row: input.row });
  }
  return Object.values(checks).every(Boolean);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceCommit = gitHead(repositoryRoot);
  const identityServer = await startReleaseIdentityServer({
    databaseUrl,
    generatedDirectory,
    portFallback: 58_491,
    zoenPath: zoenBinaryPath(repositoryRoot),
  });

  try {
    const alphaReleaseActors = await provisionWorldReleaseActors({
      baseUrl: identityServer.baseUrl,
      subjectKey: "agent-parity-alpha-release",
      world: "world.alpha",
    });
    const betaReleaseActors = await provisionWorldReleaseActors({
      baseUrl: identityServer.baseUrl,
      subjectKey: "agent-parity-beta-release",
      world: "world.beta",
    });
    const alphaBuilder = await provisionWorldMembership({
      actionIds: ["zoen.world.propose"],
      actor: "actor.kernel.alpha.builder",
      baseUrl: identityServer.baseUrl,
      principal: "principal.kernel.alpha.builder",
      subjectKey: "agent-parity-alpha-builder",
      workload: "workload.kernel.alpha.builder",
      world: "world.alpha",
    });
    const alphaGovernor = await provisionWorldMembership({
      actionIds: KERNEL_ACTIONS.filter(({ verb }) => verb !== "Propose").map(
        ({ actionId }) => actionId,
      ),
      actor: "actor.kernel.alpha.governor",
      baseUrl: identityServer.baseUrl,
      principal: "principal.kernel.alpha.governor",
      subjectKey: "agent-parity-alpha-governor",
      workload: "workload.kernel.alpha.governor",
      world: "world.alpha",
    });
    const delegationDenied = await provisionWorldMembership({
      actionIds: ["zoen.world.discover"],
      actor: alphaBuilder.actor,
      baseUrl: identityServer.baseUrl,
      principal: "principal.kernel.alpha.limited",
      subjectKey: "agent-parity-alpha-limited",
      workload: "workload.kernel.alpha.limited",
      world: "world.alpha",
    });
    const cedarDenied = await provisionWorldMembership({
      actionIds: ["zoen.world.propose"],
      actor: "actor.kernel.alpha.untrusted",
      baseUrl: identityServer.baseUrl,
      principal: "principal.kernel.alpha.untrusted",
      subjectKey: "agent-parity-alpha-untrusted",
      workload: "workload.kernel.alpha.untrusted",
      world: "world.alpha",
    });
    const betaBuilder = await provisionWorldMembership({
      actionIds: ["zoen.world.propose"],
      actor: "actor.kernel.beta.builder",
      baseUrl: identityServer.baseUrl,
      principal: "principal.kernel.beta.builder",
      subjectKey: "agent-parity-beta-builder",
      workload: "workload.kernel.beta.builder",
      world: "world.beta",
    });
    const betaGovernor = await provisionWorldMembership({
      actionIds: KERNEL_ACTIONS.filter(({ verb }) => verb !== "Propose").map(
        ({ actionId }) => actionId,
      ),
      actor: "actor.kernel.beta.governor",
      baseUrl: identityServer.baseUrl,
      principal: "principal.kernel.beta.governor",
      subjectKey: "agent-parity-beta-governor",
      workload: "workload.kernel.beta.governor",
      world: "world.beta",
    });

    const alphaPolicy = buildKernelPolicyCatalog({
      actorByVerb: actorByVerb(alphaBuilder, alphaGovernor),
    });
    const betaPolicy = buildKernelPolicyCatalog({
      actorByVerb: actorByVerb(betaBuilder, betaGovernor),
    });
    const alphaBytes: CatalogBytes = {
      ontology: ontologyCatalogBytes("agent-parity.alpha"),
      policy: alphaPolicy.bytes,
      executors: "executor catalog agent-parity alpha v1\n",
      components: "component catalog agent-parity alpha v1\n",
    };
    const betaBytes: CatalogBytes = {
      ontology: ontologyCatalogBytes("agent-parity.beta"),
      policy: betaPolicy.bytes,
      executors: "executor catalog agent-parity beta v1\n",
      components: "component catalog agent-parity beta v1\n",
    };
    const alphaPath = await writeGeneratedJson(
      generatedDirectory,
      "alpha.json",
      contentFromBytes("world.alpha", alphaBytes),
    );
    const betaPath = await writeGeneratedJson(
      generatedDirectory,
      "beta.json",
      contentFromBytes("world.beta", betaBytes),
    );
    const alphaRelease = zoen.construct(alphaPath);
    const betaRelease = zoen.construct(betaPath);
    assert.equal(zoen.publish(alphaPath, alphaReleaseActors.builder).status, 0);
    assert.equal(zoen.publish(betaPath, betaReleaseActors.builder).status, 0);
    assert.equal(
      zoen.approveAndActivate(
        "world.alpha",
        String(alphaRelease.digest),
        alphaReleaseActors.owner,
      ).activate.status,
      0,
    );
    assert.equal(
      zoen.approveAndActivate(
        "world.beta",
        String(betaRelease.digest),
        betaReleaseActors.owner,
      ).activate.status,
      0,
    );

    const discover = kernel("discover", ["--world", "world.alpha", ...authorityArgs(alphaGovernor)]);
    assert.equal(discover.status, 0, discover.stderr);
    record("cli_discover_exact_active_catalog", discover.body?.releaseDigest === alphaRelease.digest);
    record("cli_discovers_exactly_seven_verbs", JSON.stringify(discover.body?.publicVerbs) === JSON.stringify([...SEVEN_VERBS]));
    record("cli_surface_is_not_caller_selected", discover.body?.surface === "cli");

    const query = kernel("query", ["--world", "world.alpha", ...authorityArgs(alphaGovernor)]);
    assert.equal(query.status, 0, query.stderr);
    record("cli_query_uses_same_catalog_basis", catalogFingerprint(query.body) === catalogFingerprint(discover.body));

    const proposalId = "proposal.agent-parity.concurrent";
    const nonCanonicalInput = '{ "z": 3, "nested": { "b": 2, "a": 1 } }';
    const equivalentInput = '{"nested":{"a":1,"b":2},"z":3}';
    const proposed = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(alphaBuilder),
      "--proposal-id",
      proposalId,
      "--input",
      nonCanonicalInput,
    ]);
    assert.equal(proposed.status, 0, proposed.stderr);
    const proposalReplay = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(alphaBuilder),
      "--proposal-id",
      proposalId,
      "--input",
      equivalentInput,
    ]);
    assert.equal(proposalReplay.status, 0, proposalReplay.stderr);
    record("jcs_equivalent_proposal_replays", proposalReplay.body?.previewHash === proposed.body?.previewHash && proposalReplay.body?.inputJcs === equivalentInput);
    const conflictingProposal = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(alphaBuilder),
      "--proposal-id",
      proposalId,
      "--input",
      '{"nested":{"a":1,"b":999},"z":3}',
    ]);
    record("proposal_id_conflict_fails_closed", conflictingProposal.status !== 0);

    const delegationFailure = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(delegationDenied),
      "--proposal-id",
      "proposal.agent-parity.delegation-denied",
      "--input",
      equivalentInput,
    ]);
    record("missing_delegated_action_denied", delegationFailure.status !== 0);
    const cedarFailure = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(cedarDenied),
      "--proposal-id",
      "proposal.agent-parity.cedar-denied",
      "--input",
      equivalentInput,
    ]);
    record("active_release_cedar_actor_denied", cedarFailure.status !== 0);
    const wrongPrincipal = kernel("propose", [
      "--world",
      "world.alpha",
      "--principal",
      alphaGovernor.principal,
      "--membership",
      alphaBuilder.membership,
      "--proposal-id",
      "proposal.agent-parity.wrong-principal",
      "--input",
      equivalentInput,
    ]);
    record("membership_principal_mismatch_denied", wrongPrincipal.status !== 0);
    const crossWorld = kernel("query", [
      "--world",
      "world.beta",
      ...authorityArgs(alphaGovernor),
    ]);
    record("cross_world_membership_denied", crossWorld.status !== 0);
    const betaQuery = kernel("query", ["--world", "world.beta", ...authorityArgs(betaGovernor)]);
    assert.equal(betaQuery.status, 0, betaQuery.stderr);
    record("worlds_have_disjoint_active_catalogs", betaQuery.body?.releaseDigest === betaRelease.digest && betaQuery.body?.releaseDigest !== alphaRelease.digest);

    const decideArgs = [
      "--proposal-id",
      proposalId,
      ...authorityArgs(alphaGovernor),
      "--decision",
      "approve",
    ];
    const decisions = await Promise.all(
      Array.from({ length: 8 }, () => kernelAsync("decide", decideArgs)),
    );
    for (const decision of decisions) {
      assert.equal(decision.status, 0, decision.stderr);
    }
    record("concurrent_decide_linearizes_to_one_outcome", decisions.every((item) => item.body?.outcome === "approve"));
    const contradictoryDecision = kernel("decide", [
      "--proposal-id",
      proposalId,
      ...authorityArgs(alphaGovernor),
      "--decision",
      "reject",
    ]);
    record("contradictory_decide_replay_denied", contradictoryDecision.status !== 0);

    const commitArgs = ["--proposal-id", proposalId, ...authorityArgs(alphaGovernor)];
    const commits = await Promise.all(
      Array.from({ length: 8 }, () => kernelAsync("commit", commitArgs)),
    );
    for (const commit of commits) {
      assert.equal(commit.status, 0, commit.stderr);
    }
    const receiptId = String(commits[0]?.body?.receiptId ?? "");
    record("concurrent_commit_returns_one_receipt", receiptId !== "" && commits.every((item) => item.body?.receiptId === receiptId));

    const explained = kernel("explain", ["--receipt-id", receiptId, ...authorityArgs(alphaGovernor)]);
    assert.equal(explained.status, 0, explained.stderr);
    record("cli_explain_returns_committed_basis", explained.body?.releaseDigest === alphaRelease.digest && typeof explained.body?.explanationJcs === "string");

    const executeArgs = ["--receipt-id", receiptId, ...authorityArgs(alphaGovernor)];
    const executions = await Promise.all(
      Array.from({ length: 8 }, () => kernelAsync("execute", executeArgs)),
    );
    for (const execution of executions) {
      assert.equal(execution.status, 0, execution.stderr);
    }
    const executionId = String(executions[0]?.body?.executionId ?? "");
    record("concurrent_execute_returns_one_execution", executionId !== "" && executions.every((item) => item.body?.executionId === executionId));

    const evidence = await inspectEvidence(proposalId, receiptId);
    record("proposal_persists_exact_authority_evidence", verifyEvidenceRow({ actor: alphaBuilder, approved: false, expectedPolicyDigest: alphaPolicy.policyDigests.Propose, row: evidence.proposal, verb: "Propose" }));
    record("decision_persists_exact_authority_evidence", verifyEvidenceRow({ actor: alphaGovernor, approved: false, expectedPolicyDigest: alphaPolicy.policyDigests.Decide, row: evidence.decision, verb: "Decide" }));
    record("commit_persists_truthful_approval_evidence", verifyEvidenceRow({ actor: alphaGovernor, approved: true, expectedPolicyDigest: alphaPolicy.policyDigests.Commit, row: evidence.receipt, verb: "Commit" }));
    record("execute_persists_truthful_approval_evidence", verifyEvidenceRow({ actor: alphaGovernor, approved: true, expectedPolicyDigest: alphaPolicy.policyDigests.Execute, row: evidence.execution, verb: "Execute" }));

    await revokeWorldMembership({
      baseUrl: identityServer.baseUrl,
      membership: alphaBuilder.membership,
    });
    const revoked = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(alphaBuilder),
      "--proposal-id",
      "proposal.agent-parity.revoked",
      "--input",
      equivalentInput,
    ]);
    record("revoked_membership_fails_closed", revoked.status !== 0);
    const recoveredBuilder = await provisionWorldMembership({
      actionIds: ["zoen.world.propose"],
      actor: alphaBuilder.actor,
      baseUrl: identityServer.baseUrl,
      principal: alphaBuilder.principal,
      subjectKey: "agent-parity-alpha-builder-recovery",
      workload: alphaBuilder.workload,
      world: "world.alpha",
    });
    const staleProposalId = "proposal.agent-parity.stale-release";
    const recovered = kernel("propose", [
      "--world",
      "world.alpha",
      ...authorityArgs(recoveredBuilder),
      "--proposal-id",
      staleProposalId,
      "--input",
      '{"purpose":"stale-after-release-rotation"}',
    ]);
    assert.equal(recovered.status, 0, recovered.stderr);
    record("replacement_membership_recovers_on_fresh_process", recovered.body?.membership === recoveredBuilder.membership && recoveredBuilder.membership !== alphaBuilder.membership);

    const alphaV2Path = await writeGeneratedJson(
      generatedDirectory,
      "alpha-v2.json",
      contentFromBytes("world.alpha", {
        ...alphaBytes,
        components: "component catalog agent-parity alpha v2\n",
      }),
    );
    const alphaV2 = zoen.construct(alphaV2Path);
    assert.equal(zoen.publish(alphaV2Path, alphaReleaseActors.builder).status, 0);
    assert.equal(
      zoen.approveAndActivate(
        "world.alpha",
        String(alphaV2.digest),
        alphaReleaseActors.owner,
      ).activate.status,
      0,
    );
    const staleDecision = kernel("decide", [
      "--proposal-id",
      staleProposalId,
      ...authorityArgs(alphaGovernor),
      "--decision",
      "approve",
    ]);
    record("release_rotation_invalidates_stale_proposal", staleDecision.status !== 0);
    const rediscover = kernel("discover", [
      "--world",
      "world.alpha",
      ...authorityArgs(alphaGovernor),
    ]);
    assert.equal(rediscover.status, 0, rediscover.stderr);
    record("fresh_cli_process_observes_new_active_release", rediscover.body?.releaseDigest === alphaV2.digest && rediscover.body?.releaseDigest !== alphaRelease.digest);

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      canonicalJourneyVerdict: "NOT_EVALUATED",
      dimensions: {
        actors:
          "real invited Builder and Governor Memberships drive the seven CLI verbs; limited, Cedar-denied, revoked, and replacement Memberships exercise authority",
        isolation:
          "two Worlds have disjoint Memberships and active releases; an alpha Membership cannot query beta",
        negative:
          "delegation, Cedar actor, principal/Membership, cross-World, contradictory replay, revocation, and stale-release failures all fail closed",
        path:
          "real CLI only: Discover → Query → Propose → Decide → Commit → Explain → Execute on one active governed catalog",
        recovery:
          "each verb is a fresh CLI process; a revoked Membership stays denied and a new active Membership with the governed actor recovers; release rotation is observed",
        replay:
          "RFC 8785-equivalent proposal input replays, conflicting input fails, and eight concurrent Decide/Commit/Execute calls converge on one immutable result",
      },
      finishedAt: new Date().toISOString(),
      interfacesProven: ["cli"],
      journeys: {
        J1: {
          note: "release authority and four-catalog activation are proven by the world-release journey",
          verdict: "PARTIAL",
        },
        J7: {
          proofPending: ["Connect adapter", "inbound MCP adapter", "Eve first-class adapter"],
          verdict: "NOT_EVALUATED",
        },
      },
      sourceCommit,
      startedAt,
      substrateVerdict: "PASS",
      unit: "W2-05",
    });
    const passed = Object.values(assertions).filter(Boolean).length;
    const total = Object.keys(assertions).length;
    console.log(
      `agent-parity PASS cli-substrate assertions ${passed}/${total} canonicalJourneyVerdict=NOT_EVALUATED artifact=${artifactPath} sourceCommit=${sourceCommit}`,
    );
  } finally {
    await stopReleaseIdentityServer(identityServer);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
